/**
 * Checks the built site and the source it was built from. No dependencies and
 * no browser — everything here is a static check.
 *
 *   node tests/run.mjs
 *
 * Run it after `node tools/build.mjs`. It only ever reads; it never writes.
 *
 * What it will not tell you: nothing here renders a page, so this cannot
 * measure a real layout. The mobile group checks the structure that makes
 * overflow impossible, not the pixels.
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const SITE = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

let failures = 0;
let checks = 0;
const ok = (name, cond, detail) => {
  checks++;
  if (!cond) { failures++; console.log(`  FAIL  ${name}${detail ? `\n        ${detail}` : ''}`); }
};
const group = (name) => console.log(`\n${name}`);

const read = (rel) => fs.readFileSync(path.join(SITE, rel), 'utf8');
const exists = (rel) => fs.existsSync(path.join(SITE, rel));

/* Pre-restructure redirect stubs: notes/<slug>.html, one per note, sitting
   directly in notes/ rather than in a note's own subfolder. */
const stubs = fs.readdirSync(path.join(SITE, 'notes'))
  .filter((f) => f.endsWith('.html'))
  .map((f) => `notes/${f}`);

/* Every other built page. */
const builtPages = [];
(function walk(dir) {
  for (const e of fs.readdirSync(path.join(SITE, dir), { withFileTypes: true })) {
    const rel = dir ? `${dir}/${e.name}` : e.name;
    if (e.isDirectory()) {
      if (['.git', 'content', 'tools', 'tests', 'assets', 'node_modules'].includes(rel)) continue;
      walk(rel);
    } else if (e.name.endsWith('.html') && !stubs.includes(rel)) {
      builtPages.push(rel);
    }
  }
})('');

/* --- 1. The site is open ---------------------------------------------------
   The notes used to sit behind a sign-in gate with robots.txt and noindex
   backing it up. The URL was never actually secret, so the gate cost real
   friction (re-signing in on every new browser, JS required to read a note)
   for no real protection — anyone with the link could already read
   everything with curl. It is gone now, along with the crawler blocks that
   existed only to cover for it. */
group('1. no sign-in gate, no crawler blocks');

ok('login.html is gone', !exists('login.html'));

/* robots.txt is back, and it must stay the opposite of the one that was
   removed: that one existed to keep crawlers out, this one only points at the
   sitemap. A stray Disallow here would quietly undo the whole point. */
ok('robots.txt exists and points at the sitemap',
   exists('robots.txt') && /Sitemap:\s*https?:\/\//.test(read('robots.txt')));
ok('robots.txt blocks nothing', exists('robots.txt') && !/^\s*Disallow:\s*\S/m.test(read('robots.txt')),
   exists('robots.txt') ? read('robots.txt') : '');

for (const rel of builtPages) {
  const html = read(rel);
  if (html.includes('gn-auth')) ok(`no auth check in ${rel}`, false);
  if (html.includes('login.html')) ok(`no reference to login.html in ${rel}`, false);
  if (/name="robots" content="noindex, ?nofollow"/.test(html)) ok(`no blanket noindex in ${rel}`, false);
}
ok('no page carries the gate or a blanket noindex', true);

/* Derived, not hand-counted: the home page, one folder page per note, one page
   per topic, and the 404. A hard-coded number here just goes stale. */
const cat = JSON.parse(read('content/notes.json'));
const topicTotal = cat.notes.reduce((a, n) => {
  const stub = read(`notes/${n.id}.html`);
  return a + JSON.parse(stub.match(/var t=(\[[^\]]*\])/)[1]).length;
}, 0);
const expectedPages = 1 + cat.notes.length + topicTotal + 1;
ok('every page is built', builtPages.length === expectedPages,
   `found ${builtPages.length}, expected ${expectedPages}`);

const cfg = read('_config.yml');
for (const dir of ['content', 'tools', 'tests']) {
  ok(`_config.yml excludes ${dir}/`, new RegExp(`^\\s*-\\s*${dir}\\s*$`, 'm').test(cfg));
}
ok('content/ is where the note source still lives', exists('content/react.html'));

/* --- 2. Payload ------------------------------------------------------------ */
group('2. the search prose is off the critical path, and split per note');
const siteData = read('assets/js/site-data.js');
const navBytes = fs.statSync(path.join(SITE, 'assets/js/site-data.js')).size;
ok('site-data.js holds the sidebar only, under 60KB', navBytes < 60_000, `${(navBytes / 1024).toFixed(0)}KB`);
ok('site-data.js carries no search prose', !siteData.includes('GN_SECTIONS'));

/* One shard per note, rather than one blob for the whole site: adding a note
   adds a file instead of growing a single download, and editing one note
   invalidates only its own shard in a reader's cache. */
const shardMatch = /window\.GN_SEARCH_SHARDS = (\[[\s\S]*?\]);/.exec(siteData);
ok('site-data.js lists the search shards', !!shardMatch);
const shards = shardMatch ? JSON.parse(shardMatch[1]) : [];
const catalogue = JSON.parse(read('content/notes.json'));
ok('one shard per note', shards.length === catalogue.notes.length,
   `${shards.length} shards, ${catalogue.notes.length} notes`);
const missingShards = shards.filter((f) => !exists(f));
ok('every listed shard exists', missingShards.length === 0, missingShards.join(', '));
const strayShards = fs.existsSync(path.join(SITE, 'assets/js/search'))
  ? fs.readdirSync(path.join(SITE, 'assets/js/search'))
      .filter((f) => !shards.includes(`assets/js/search/${f}`))
  : [];
ok('no shard left behind by a renamed note', strayShards.length === 0, strayShards.join(', '));

const shardBytes = shards.reduce((a, f) => a + fs.statSync(path.join(SITE, f)).size, 0);
ok('the shards are the larger half, and none of it loads up front', shardBytes > navBytes,
   `nav ${(navBytes / 1024).toFixed(0)}KB vs search ${(shardBytes / 1024).toFixed(0)}KB across ${shards.length} files`);
ok('every shard appends rather than overwriting the index',
   shards.every((f) => read(f).includes('window.GN_SECTIONS = window.GN_SECTIONS || []')));

ok('the old single-blob search-data.js is gone', !exists('assets/js/search-data.js'));
const noPageLoadsShards = [...builtPages].filter((rel) => read(rel).includes('assets/js/search/'));
ok('no page loads a shard up front', noPageLoadsShards.length === 0, noPageLoadsShards.slice(0, 3).join(', '));
ok('app.js fetches them on demand', read('assets/js/app.js').includes('GN_SEARCH_SHARDS'));

/* --- 3. Old URLs ------------------------------------------------------------ */
group('3. pre-restructure URLs still resolve');
const noteSlugs = JSON.parse(read('content/notes.json')).notes.map((n) => n.id);
for (const slug of noteSlugs) {
  const rel = `notes/${slug}.html`;
  if (!exists(rel)) { ok(`${rel} exists`, false); continue; }
  const html = read(rel);
  ok(`${rel} forwards to ${slug}/index.html`, html.includes(`${slug}/index.html`));
  // Every topic named in the stub must be a page that exists.
  const listed = JSON.parse(html.match(/var t=(\[[^\]]*\])/)[1]);
  const missing = listed.filter((t) => !exists(`notes/${slug}/${t}.html`));
  ok(`  its ${listed.length} old anchors all map to real pages`, missing.length === 0, missing.join(', '));
}
ok('the stubs stay noindex (a redirect has no content of its own to be found by)',
   stubs.every((rel) => read(rel).includes('name="robots" content="noindex, nofollow"')));

/* --- 4. Links --------------------------------------------------------------- */
group('4. every internal link resolves');
let broken = [];
for (const rel of [...builtPages, ...stubs]) {
  const dir = path.dirname(rel);
  // Code samples show markup as escaped text, so a snippet containing
  // `&lt;Link href="/admin/users"&gt;` is prose, not a link off this page.
  const html = read(rel)
    .replace(/<pre[\s\S]*?<\/pre>/g, '')
    .replace(/<code[\s\S]*?<\/code>/g, '');
  for (const m of html.matchAll(/(?:href|src)="([^"]+)"/g)) {
    const raw = m[1];
    if (/^(https?:|data:|mailto:|#)/.test(raw)) continue;
    const target = raw.split('#')[0].split('?')[0];
    if (!target) continue;
    const resolved = path.normalize(path.join(dir, target));
    if (!exists(resolved)) broken.push(`${rel} -> ${raw}`);
  }
}
ok('no dead internal links', broken.length === 0, broken.slice(0, 10).join('\n        '));

/* --- 5. Cross-references ----------------------------------------------------
   Notes point at each other. They used to do it by writing the number out —
   "see note 12" — and every one of those pointers silently went stale the
   moment the running order changed: several ended up naming a different note
   than the prose meant, which is worse for a reader than no pointer at all. A
   fragment now names the note by id — {{note:ai-security}} — and the build
   resolves the number. This group is what stops the old habit coming back. */
group('5. cross-references name a note, not a position');

const fragments = fs.readdirSync(path.join(SITE, 'content')).filter((f) => f.endsWith('.html'));

const handWritten = [];
for (const f of fragments) {
  read('content/' + f).split('\n').forEach((line, i) => {
    for (const m of line.matchAll(/\bnotes?\s+(\d{1,2})\b/gi)) {
      handWritten.push('content/' + f + ':' + (i + 1) + ' — "' + m[0] + '"');
    }
  });
}
ok('no fragment writes a note number by hand', handWritten.length === 0,
   handWritten.slice(0, 8).join('\n        ') +
   (handWritten.length ? '\n        use {{note:<id>}} or {{n:<id>}} instead' : ''));

/* Only this project’s own shorthand — code samples legitimately contain
   ${{ github.actor }} and JSX double braces, which are not placeholders. */
const SHORTHAND = /\{\{(?:note|n):[a-z0-9-]*\}\}|\{\{replay\}\}/;
const leftovers = [];
for (const rel of [...builtPages, ...stubs]) if (SHORTHAND.test(read(rel))) leftovers.push(rel);
ok('no unexpanded shorthand reaches a built page', leftovers.length === 0,
   leftovers.slice(0, 5).join(', '));

/* The link checker proves the target file exists. This proves it is the right
   file: the number shown must be the number the catalogue gives that note. */
const byId = new Map(catalogue.notes.map((n) => [n.id, n]));
const wrongRefs = [];
let refCount = 0;
for (const rel of builtPages) {
  const re = /<a class="note-ref" href="\.\.\/([a-z0-9-]+)\/index\.html"[^>]*>(?:note )?(\d+)<\/a>/g;
  for (const m of read(rel).matchAll(re)) {
    refCount++;
    const target = byId.get(m[1]);
    if (!target || target.n !== m[2]) wrongRefs.push(rel + ' -> ' + m[1] + ' rendered as ' + m[2]);
  }
}
ok('every rendered reference shows its target\u2019s real number', wrongRefs.length === 0,
   wrongRefs.slice(0, 5).join('\n        '));
ok('the references survived the build at all', refCount > 0, 'found ' + refCount);

/* The running order itself. A gap is what let a stale pointer look plausible. */
const numbers = catalogue.notes.map((n) => Number(n.n));
ok('note numbers are unique', new Set(numbers).size === numbers.length);
ok('note numbers run 1..N with no gap', numbers.every((v, i) => v === i + 1),
   'got ' + numbers.join(', '));

/* --- 6. Mobile ---------------------------------------------------------------
   The README used to claim every page was loaded at four widths and checked
   for horizontal scroll. Nothing did that, so the claim was worse than none. A
   real viewport test needs a browser and this suite deliberately has no
   dependencies, so instead this checks the structure that makes sideways
   scroll impossible: anything wider than a phone either scrolls inside its own
   box or is allowed to break. A weaker promise, honestly kept. */
group('6. nothing can push a page sideways on a phone');

const css = read('assets/css/main.css');
const cssRules = [
  ['tables scroll in their own box', /\.table-wrap\s*\{[^}]*overflow-x:\s*auto/],
  ['code blocks scroll', /(^|\})\s*pre\s*\{[^}]*overflow-x:\s*auto/m],
  ['figures scroll', /\.figure-stage\s*\{[^}]*overflow-x:\s*auto/],
  ['the topic strip scrolls', /\.sib-row\s*\{[^}]*overflow-x:\s*auto/],
  ['long words in prose may break', /\.content\s*\{[^}]*overflow-wrap/],
  ['long tokens in inline code may break', /code\s*\{[^}]*overflow-wrap/],
];
for (const [what, re] of cssRules) ok(what, re.test(css));

const bareTables = [];
for (const rel of builtPages) {
  const html = read(rel).replace(/<pre[\s\S]*?<\/pre>/g, '');
  for (const m of html.matchAll(/<table[\s>]/g)) {
    const before = html.slice(0, m.index);
    const at = before.lastIndexOf('table-wrap');
    if (at === -1 || before.slice(at).includes('</table>')) bareTables.push(rel);
  }
}
ok('every table is inside .table-wrap', bareTables.length === 0,
   [...new Set(bareTables)].slice(0, 5).join(', '));

/* An unbreakable token can still stick out where wrapping is off. Inside <pre>
   that is fine — it scrolls — so only prose counts. */
const longTokens = [];
for (const f of fragments) {
  const prose = read('content/' + f).replace(/<pre[\s\S]*?<\/pre>/g, ' ').replace(/<[^>]+>/g, ' ');
  for (const tok of prose.split(/\s+/)) {
    if (tok.length > 44) longTokens.push('content/' + f + ': ' + tok.slice(0, 50));
  }
}
ok('no unbreakable token over 44 characters in prose', longTokens.length === 0,
   longTokens.slice(0, 5).join('\n        '));

/* --- 7. Readability ----------------------------------------------------------
   These notes were rewritten once out of a stiff register into plain English,
   and nothing protected that afterwards, so the next batch could quietly drift
   back. This is the ratchet. It measures running prose only — <p> text, never
   headings, diagram labels, table cells or code, none of which are sentences
   and all of which would make the numbers meaningless — and the limits sit
   well clear of where the prose is now, so ordinary editing cannot trip them. */
group('7. the prose stays in plain English');

const ENT = {
  mdash: '\u2014', ndash: '\u2013', hellip: '\u2026', nbsp: ' ', amp: '&', lt: '<', gt: '>',
  quot: '"', apos: "'", rsquo: '\u2019', lsquo: '\u2018', ldquo: '\u201c', rdquo: '\u201d',
  middot: '\u00b7', times: '\u00d7', larr: '\u2190', rarr: '\u2192', pound: '\u00a3',
};

const sentences = [];
for (const f of fragments) {
  const src = read('content/' + f).replace(/<pre[\s\S]*?<\/pre>/g, ' ');
  for (const m of src.matchAll(/<p>([\s\S]*?)<\/p>/g)) {
    const text = m[1]
      .replace(/<code[\s\S]*?<\/code>/g, ' CODE ')
      .replace(/<[^>]+>/g, '')
      .replace(/&([a-z]+);/g, (w, n) => (n in ENT ? ENT[n] : ' '))
      .replace(/&#\d+;/g, ' ')
      .replace(/\s+/g, ' ')
      .trim();
    if (!text) continue;
    for (const one of text.split(/(?<=[.?!])\s+(?=[A-Z\u201c"(])/)) {
      const words = one.trim().split(/\s+/).filter(Boolean).length;
      if (words >= 3) sentences.push({ file: f, words, text: one.trim() });
    }
  }
}
ok('there is prose to measure', sentences.length > 500, sentences.length + ' sentences');

/* The longest sentence in the notes is about 50 words, and legitimately so —
   joined with dashes or semicolons. 60 leaves room without licensing drift. */
const runOns = sentences.filter((x) => x.words > 60);
ok('no sentence runs past 60 words', runOns.length === 0,
   runOns.slice(0, 4).map((x) => 'content/' + x.file + ' (' + x.words + ' words): ' + x.text.slice(0, 110)).join('\n        '));

const mean = sentences.reduce((a, x) => a + x.words, 0) / sentences.length;
ok('mean sentence stays under 20 words', mean < 20, mean.toFixed(1) + ' words');

/* The register the rewrite removed. Each has a shorter, plainer equivalent,
   and there are none in the notes today — so a hit is drift, not a false
   positive. */
const REGISTER = [
  'utilise', 'utilises', 'utilize', 'utilizes', 'utilisation', 'utilization',
  'leverage', 'leverages', 'leveraging', 'facilitate', 'facilitates',
  'endeavour', 'commence', 'commences', 'aforementioned', 'heretofore',
  'henceforth', 'pursuant', 'albeit', 'myriad', 'plethora', 'paradigm',
  'synergy', 'synergies', 'holistic', 'effectuate', 'methodology',
  'methodologies', 'operationalise', 'operationalize', 'ascertain', 'requisite',
  'subsequent to', 'prior to', 'in order to', 'a number of', 'due to the fact',
  'it should be noted', 'it is important to note', 'in the event that',
  'with regard to', 'with respect to', 'at this juncture', 'going forward',
];
const registerHits = [];
for (const f of fragments) {
  const prose = read('content/' + f)
    .replace(/<pre[\s\S]*?<\/pre>/g, ' ')
    .replace(/<code[\s\S]*?<\/code>/g, ' ')
    .replace(/<[^>]+>/g, ' ')
    .toLowerCase();
  for (const w of REGISTER) {
    const n = (prose.match(new RegExp('\\b' + w + '\\b', 'g')) || []).length;
    if (n) registerHits.push('content/' + f + ': "' + w + '" x' + n);
  }
}
ok('none of the register the rewrite removed has come back', registerHits.length === 0,
   registerHits.slice(0, 8).join('\n        '));

/* --- 8. The site without JavaScript -----------------------------------------
   The sidebar used to be an empty <div> that app.js filled in, so the entire
   navigation — every note, every topic — existed only for a reader running
   scripts. It is static HTML now, and app.js only restores which folders were
   open. This group is what keeps it that way. */
group('8. navigation works with scripts switched off');

const samplePages = ['index.html', 'notes/react/index.html', 'notes/react/hooks.html'];
for (const rel of samplePages) {
  const html = read(rel);
  const treeInner = /<div class="tree" id="tree">([\s\S]*?)<\/nav>/.exec(html);
  const links = treeInner ? (treeInner[1].match(/<a [^>]*href=/g) || []).length : 0;
  ok(`${rel} ships the tree as HTML`, links >= cat.notes.length + topicTotal,
     `${links} links in the sidebar, expected at least ${cat.notes.length + topicTotal}`);
}

/* Every note and every topic must be reachable from any page without JS. */
const homeTree = /<div class="tree" id="tree">([\s\S]*?)<\/nav>/.exec(read('index.html'))[1];
const missingFromTree = [];
for (const n of cat.notes) {
  if (!homeTree.includes(`notes/${n.id}/index.html`)) missingFromTree.push(n.id);
}
ok('every note appears in the served tree', missingFromTree.length === 0, missingFromTree.join(', '));

ok('the note being read is open in the served HTML',
   /<div class="tree-note is-open is-here" data-note="react">/.test(read('notes/react/hooks.html')));
ok('other notes are served closed',
   /<div class="tree-note" data-note="redux">/.test(read('notes/react/hooks.html')));

/* The sidebar is ~232 links and sits before <main>, so a keyboard user needs a
   way past it. */
/* The 404 has no sidebar to skip past, so it is exempt. */
const skipMissing = [...builtPages]
  .filter((rel) => rel !== '404.html')
  .filter((rel) => !read(rel).includes('class="skip-link"'));
ok('every page has a skip link', skipMissing.length === 0, skipMissing.slice(0, 3).join(', '));
ok('the skip link is the first focusable thing on the page',
   /<body[^>]*>\s*<a class="skip-link" href="#main">/.test(read('notes/react/hooks.html')));
ok('it points at something that exists',
   read('notes/react/hooks.html').includes('id="main"'));
ok('the skip link is visible when focused', /\.skip-link:focus/.test(css));

/* --- 9. Discovery and sharing ------------------------------------------------
   The gate and the blanket noindex came off so these notes could be found.
   That only pays if a crawler can enumerate them and a shared link shows what
   it is. */
group('9. the site can be found and shared');

const siteUrl = cat.site && cat.site.url;
ok('the catalogue names an absolute site URL', !!siteUrl, String(siteUrl));

ok('sitemap.xml exists', exists('sitemap.xml'));
const sitemap = exists('sitemap.xml') ? read('sitemap.xml') : '';
const locs = [...sitemap.matchAll(/<loc>([^<]+)<\/loc>/g)].map((m) => m[1]);
ok('the sitemap lists every real page', locs.length === 1 + cat.notes.length + topicTotal,
   `${locs.length} entries, expected ${1 + cat.notes.length + topicTotal}`);
ok('every sitemap entry is an absolute URL', locs.every((u) => u.startsWith('http')));
const sitemapMissing = locs.map((u) => u.replace(siteUrl, '')).filter((r) => !exists(r));
ok('every sitemap entry resolves to a built page', sitemapMissing.length === 0,
   sitemapMissing.slice(0, 5).join(', '));
/* A redirect stub carries noindex and has no content of its own. Listing one
   would ask a crawler to index a page that tells it not to. */
ok('the sitemap lists no redirect stubs',
   !locs.some((u) => /\/notes\/[a-z0-9-]+\.html$/.test(u)));

const noCard = [];
const noCanonical = [];
for (const rel of builtPages) {
  if (rel === '404.html') continue;
  const html = read(rel);
  if (!html.includes('property="og:title"') || !html.includes('name="twitter:card"')) noCard.push(rel);
  if (!html.includes('rel="canonical"')) noCanonical.push(rel);
}
ok('every page carries a social card', noCard.length === 0, noCard.slice(0, 3).join(', '));
ok('every page names its canonical URL', noCanonical.length === 0, noCanonical.slice(0, 3).join(', '));

/* --- 10. The 404 -------------------------------------------------------------
   GitHub Pages serves this file for any missing path at any depth, so a
   relative stylesheet or a relative link home would break exactly when it is
   needed. It has to stand alone. */
group('10. the 404 stands on its own');

ok('404.html exists', exists('404.html'));
const notFound = exists('404.html') ? read('404.html') : '';
ok('it carries its own styling', notFound.includes('<style>'));
ok('it loads no external stylesheet or script',
   !/<link[^>]+stylesheet/.test(notFound) && !/<script[^>]+src=/.test(notFound));
const relLinks = [...notFound.matchAll(/(?:href|src)="([^"]+)"/g)]
  .map((m) => m[1])
  .filter((u) => !/^(https?:|#|data:)/.test(u));
ok('every link on it is absolute', relLinks.length === 0, relLinks.join(', '));
ok('it is not indexable', /name="robots"[^>]*noindex/.test(notFound));

/* --- Result --------------------------------------------------------------- */
console.log(`\n${failures ? `${failures} FAILED` : 'all passed'} — ${checks} checks\n`);
process.exit(failures ? 1 : 0);

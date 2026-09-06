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
ok('robots.txt is gone', !exists('robots.txt'));

for (const rel of builtPages) {
  const html = read(rel);
  if (html.includes('gn-auth')) ok(`no auth check in ${rel}`, false);
  if (html.includes('login.html')) ok(`no reference to login.html in ${rel}`, false);
  if (/name="robots" content="noindex, ?nofollow"/.test(html)) ok(`no blanket noindex in ${rel}`, false);
}
ok('no page carries the gate or a blanket noindex', true);

ok('every page is built', builtPages.length === 233, `found ${builtPages.length}, expected 233`);

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

/* --- Result --------------------------------------------------------------- */
console.log(`\n${failures ? `${failures} FAILED` : 'all passed'} — ${checks} checks\n`);
process.exit(failures ? 1 : 0);

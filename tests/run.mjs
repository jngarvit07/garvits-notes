/**
 * Checks the built site. No dependencies, no browser.
 *
 *   node tests/run.mjs
 *
 * Run it after `node tools/build.mjs`. It reads the built site only; it never
 * writes.
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

ok('every page is built', builtPages.length === 219, `found ${builtPages.length}, expected 219`);

const cfg = read('_config.yml');
for (const dir of ['content', 'tools', 'tests']) {
  ok(`_config.yml excludes ${dir}/`, new RegExp(`^\\s*-\\s*${dir}\\s*$`, 'm').test(cfg));
}
ok('content/ is where the note source still lives', exists('content/react.html'));

/* --- 2. Payload ------------------------------------------------------------ */
group('2. the search prose is not on the critical path');
const navBytes = fs.statSync(path.join(SITE, 'assets/js/site-data.js')).size;
const searchBytes = fs.statSync(path.join(SITE, 'assets/js/search-data.js')).size;
ok('site-data.js holds the sidebar only, under 60KB', navBytes < 60_000, `${(navBytes / 1024).toFixed(0)}KB`);
ok('search-data.js is the larger half, split out', searchBytes > navBytes,
   `nav ${(navBytes / 1024).toFixed(0)}KB vs search ${(searchBytes / 1024).toFixed(0)}KB`);
ok('site-data.js no longer carries GN_SECTIONS', !read('assets/js/site-data.js').includes('GN_SECTIONS'));
ok('search-data.js carries GN_SECTIONS', read('assets/js/search-data.js').includes('GN_SECTIONS'));
const anyPage = read('notes/react/hooks.html');
ok('no page loads search-data.js up front', !anyPage.includes('search-data.js'));
ok('app.js fetches it on demand', read('assets/js/app.js').includes("'assets/js/search-data.js'"));

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

/* --- Result --------------------------------------------------------------- */
console.log(`\n${failures ? `${failures} FAILED` : 'all passed'} — ${checks} checks\n`);
process.exit(failures ? 1 : 0);

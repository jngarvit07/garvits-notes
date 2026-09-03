/**
 * Checks the built site. No dependencies, no browser — the gate script is the
 * real one, lifted out of the built HTML and run in a vm against a stubbed
 * location, so these test what ships rather than a copy of it.
 *
 *   node tests/run.mjs
 *
 * Run it after `node tools/build.mjs`. It reads the built site only; it never
 * writes.
 */
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';

const SITE = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const ORIGIN = 'https://jngarvit07.github.io';
const ROOT = '/garvits-notes';               // the Pages sub-path this deploys under

let failures = 0;
let checks = 0;
const ok = (name, cond, detail) => {
  checks++;
  if (!cond) { failures++; console.log(`  FAIL  ${name}${detail ? `\n        ${detail}` : ''}`); }
};
const group = (name) => console.log(`\n${name}`);

const read = (rel) => fs.readFileSync(path.join(SITE, rel), 'utf8');
const exists = (rel) => fs.existsSync(path.join(SITE, rel));

/* Every built page: the site, minus the redirect stubs (which carry no
   content and deliberately do not gate). */
const builtPages = [];
(function walk(dir) {
  for (const e of fs.readdirSync(path.join(SITE, dir), { withFileTypes: true })) {
    const rel = dir ? `${dir}/${e.name}` : e.name;
    if (e.isDirectory()) {
      if (['.git', 'content', 'tools', 'tests', 'assets', 'node_modules'].includes(rel)) continue;
      walk(rel);
    } else if (e.name.endsWith('.html') && rel !== 'login.html') {
      if (read(rel).includes('gn-auth')) builtPages.push(rel);
    }
  }
})('');

const stubs = fs.readdirSync(path.join(SITE, 'notes'))
  .filter((f) => f.endsWith('.html'))
  .map((f) => `notes/${f}`);

/* --- 1. The gate ---------------------------------------------------------- */
group('1. the sign-in gate');

ok('every built page carries the gate', builtPages.length === 219,
   `found ${builtPages.length}, expected 219`);

for (const rel of builtPages) {
  const html = read(rel);
  if (!html.includes("localStorage.getItem('gn-auth')")) ok(`gate in ${rel}`, false);
  if (!html.includes('<noscript>')) ok(`noscript gate in ${rel}`, false);
  if (!html.includes('name="robots" content="noindex, nofollow"')) ok(`noindex in ${rel}`, false);
}
ok('gate, noscript and noindex on all of them', true);

// Pull the real gate out of a page and run it.
const gateOf = (rel) => read(rel)
  .match(/<script>\(function\(\)\{var d=document\.documentElement;[\s\S]*?<\/script>/)[0]
  .replace(/^<script>/, '').replace(/<\/script>$/, '');

function visit(pageHref, rel, { storage = 'works', token = null } = {}) {
  const u = new URL(pageHref);
  let replaced = null;
  const localStorage = {
    getItem: (k) => {
      if (storage === 'blocked') throw new Error('storage disabled');
      return k === 'gn-auth' ? token : null;
    },
  };
  vm.runInNewContext(gateOf(rel), {
    document: { documentElement: { setAttribute() {} } },
    localStorage,
    location: { href: u.href, pathname: u.pathname, search: u.search, hash: u.hash,
                replace: (t) => { replaced = t; } },
    URL,
  });
  return replaced === null ? null : new URL(replaced, pageHref).href;
}

// login.html's own validation of ?next=, copied from the page.
const validateNext = (loginHref) => {
  const raw = new URL(loginHref).searchParams.get('next') || '';
  if (!raw || raw.charAt(0) === '/' || raw.indexOf('//') !== -1 || raw.indexOf(':') !== -1) return '';
  return raw;
};
const signInFrom = (loginHref) => new URL(validateNext(loginHref) || 'index.html', loginHref).href;

group('2. a signed-out visitor is sent to login, and back again');
const journeys = [
  ['index.html',                 `${ORIGIN}${ROOT}/`,                             `${ORIGIN}${ROOT}/index.html`],
  ['index.html',                 `${ORIGIN}${ROOT}/index.html`,                   `${ORIGIN}${ROOT}/index.html`],
  ['notes/react/index.html',     `${ORIGIN}${ROOT}/notes/react/`,                 `${ORIGIN}${ROOT}/notes/react/`],
  ['notes/react/index.html',     `${ORIGIN}${ROOT}/notes/react/index.html`,       `${ORIGIN}${ROOT}/notes/react/index.html`],
  ['notes/react/hooks.html',     `${ORIGIN}${ROOT}/notes/react/hooks.html`,       `${ORIGIN}${ROOT}/notes/react/hooks.html`],
  ['notes/agents/loop.html',     `${ORIGIN}${ROOT}/notes/agents/loop.html#tools`, `${ORIGIN}${ROOT}/notes/agents/loop.html#tools`],
];
for (const [rel, href, want] of journeys) {
  const login = visit(href, rel);
  ok(`signed out at ${href} -> login`, login && login.startsWith(`${ORIGIN}${ROOT}/login.html`), `got ${login}`);
  // The bug this replaced sent ?next=garvits-notes, landing on /garvits-notes/garvits-notes.
  ok(`  and never doubles the base path`, login && !login.includes('garvits-notes%2Fnotes') &&
     !/next=garvits-notes/.test(login), `got ${login}`);
  const landed = login && signInFrom(login);
  ok(`  signing in returns to ${want}`, landed === want, `got ${landed}`);
}

group('3. the gate fails closed');
ok('blocked localStorage still redirects to login',
   (visit(`${ORIGIN}${ROOT}/notes/react/hooks.html`, 'notes/react/hooks.html', { storage: 'blocked' }) || '')
     .startsWith(`${ORIGIN}${ROOT}/login.html`));
ok('a wrong token still redirects to login',
   (visit(`${ORIGIN}${ROOT}/notes/react/hooks.html`, 'notes/react/hooks.html', { token: 'nope' }) || '')
     .startsWith(`${ORIGIN}${ROOT}/login.html`));
ok('the right token is let through',
   visit(`${ORIGIN}${ROOT}/notes/react/hooks.html`, 'notes/react/hooks.html', { token: 'v11xb7' }) === null);

/* --- 4. What is published ------------------------------------------------- */
group('4. the source is not published');
ok('robots.txt disallows everything', /^\s*Disallow:\s*\/\s*$/m.test(read('robots.txt')));
ok('robots.txt applies to every crawler', /^\s*User-agent:\s*\*\s*$/m.test(read('robots.txt')));
const cfg = read('_config.yml');
for (const dir of ['content', 'tools', 'tests']) {
  ok(`_config.yml excludes ${dir}/`, new RegExp(`^\\s*-\\s*${dir}\\s*$`, 'm').test(cfg));
}
ok('content/ is where the ungated note source still lives', exists('content/react.html'));

/* --- 5. Payload ----------------------------------------------------------- */
group('5. the search prose is not on the critical path');
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

/* --- 6. Old URLs ---------------------------------------------------------- */
group('6. pre-restructure URLs still resolve');
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
ok('the stubs are not gated (they hold no content)',
   stubs.every((rel) => !read(rel).includes('gn-auth')));

/* --- 7. Links ------------------------------------------------------------- */
group('7. every internal link resolves');
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

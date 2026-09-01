/**
 * Builds the static site from `content/`.
 *
 * Everything is generated from two things: `content/notes.json` (the catalogue,
 * in reading order) and one `content/<id>.html` fragment per note. There are no
 * dependencies — Node's standard library only — so this runs anywhere Node runs,
 * with nothing to install first.
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

// fileURLToPath, not new URL().pathname — the project path may contain a space,
// which pathname leaves percent-encoded.
const TOOLS = path.dirname(fileURLToPath(import.meta.url));
const SITE = path.resolve(TOOLS, '..');
const CONTENT = path.join(SITE, 'content');

const NOTES = JSON.parse(fs.readFileSync(path.join(CONTENT, 'notes.json'), 'utf8'));

/* --- Escaping -------------------------------------------------------------
   Hand-written entities (&mdash;, &ldquo;) must survive, so `&` is escaped
   only when it does not already begin one. */
const esc = (s) => String(s)
  .replace(/&(?!(?:[a-zA-Z][a-zA-Z0-9]{1,9}|#\d{1,6});)/g, '&amp;')
  .replace(/</g, '&lt;').replace(/>/g, '&gt;');
const attr = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/"/g, '&quot;');

/* --- Load fragments and read their headings ------------------------------- */
const ENTITIES = {
  amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ',
  mdash: '\u2014', ndash: '\u2013', hellip: '\u2026', middot: '\u00b7',
  lsquo: '\u2018', rsquo: '\u2019', ldquo: '\u201c', rdquo: '\u201d',
  times: '\u00d7', larr: '\u2190', rarr: '\u2192', pound: '\u00a3',
};
const decodeEntities = (t) => t
  .replace(/&#(\d+);/g, (_, d) => String.fromCharCode(Number(d)))
  .replace(/&([a-zA-Z]+);/g, (whole, name) =>
    Object.prototype.hasOwnProperty.call(ENTITIES, name) ? ENTITIES[name] : whole);

const load = (note) => {
  const file = path.join(CONTENT, `${note.id}.html`);
  if (!fs.existsSync(file)) { console.error(`missing content: ${file}`); process.exit(1); }
  const body = fs.readFileSync(file, 'utf8');

  // The table of contents is derived from the note, never maintained beside it.
  const toc = [];
  const re = /<h2 id="([^"]+)"[^>]*>([\s\S]*?)<\/h2>/g;
  let m;
  while ((m = re.exec(body)) !== null) {
    // Decode entities here: these titles are re-escaped when the search results
    // render them, so a raw &mdash; would reach the reader as literal text.
    toc.push({ id: m[1], title: decodeEntities(m[2].replace(/<[^>]+>/g, '')).trim() });
  }
  if (!toc.length) console.error(`  warning: ${note.id} has no <h2 id> sections`);
  return { body, toc };
};

/* Authoring shorthand: `{{replay}}` in a flow's figure-head expands to the
   replay button, so a fragment never carries the same inline SVG ten times. */
const REPLAY_BTN = '<button class="replay-btn" type="button">' +
  '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" ' +
  'stroke-linecap="round" stroke-linejoin="round"><path d="M3 12a9 9 0 1 0 3-6.7"/>' +
  '<path d="M3 3v6h6"/></svg> Replay</button>';

const data = {};
for (const note of NOTES) {
  const d = load(note);
  d.body = d.body.split('{{replay}}').join(REPLAY_BTN);
  data[note.id] = d;
}

/* --- Shared chrome -------------------------------------------------------- */
const THEME_BOOT = `<script>(function(){try{var t=localStorage.getItem('gn-theme');if(t)document.documentElement.setAttribute('data-theme',t);}catch(e){}})();</script>`;

const ICON_SUN  = '<svg class="icon-sun" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4"/></svg>';
const ICON_MOON = '<svg class="icon-moon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 12.8A9 9 0 1 1 11.2 3a7 7 0 0 0 9.8 9.8z"/></svg>';
const ICON_MENU = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M3 6h18M3 12h18M3 18h18"/></svg>';
const ICON_SEARCH = '<svg class="search-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><circle cx="11" cy="11" r="7"/><path d="m20 20-3.5-3.5"/></svg>';

const header = (base) => `<header class="site-header">
  <button class="icon-btn" id="nav-toggle" type="button" aria-label="Open navigation">${ICON_MENU}</button>
  <a class="brand" href="${base}index.html"><span class="brand-mark">GN</span><span>Garvit&rsquo;s Notes</span></a>
  <div class="header-spacer"></div>
  <div class="search-wrap">
    ${ICON_SEARCH}
    <input class="search-input" id="search" type="search" placeholder="Search notes&hellip;  /" autocomplete="off" aria-label="Search notes">
    <div class="search-results" id="search-results" hidden></div>
  </div>
  <button class="icon-btn" id="theme-toggle" type="button" aria-label="Toggle colour theme">${ICON_SUN}${ICON_MOON}</button>
</header>`;

const shell = ({ title, desc, base, main, toc }) => `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${attr(title)}</title>
<meta name="description" content="${attr(desc)}">
<meta name="color-scheme" content="light dark">
${THEME_BOOT}
<link rel="stylesheet" href="${base}assets/css/main.css">
<link rel="icon" href="data:image/svg+xml,<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 100 100'><text y='.9em' font-size='90'>&#128218;</text></svg>">
</head>
<body data-base="${base}">
${header(base)}
<div class="layout">
  <nav class="sidebar" id="sidebar" aria-label="Notes"></nav>
  <main class="main">${main}</main>
  ${toc ? '<aside class="toc" id="toc" aria-label="On this page"><div class="toc-title">On this page</div></aside>' : ''}
</div>
<script src="${base}assets/js/site-data.js"></script>
<script src="${base}assets/js/app.js"></script>
</body>
</html>`;

/* --- Note pages ----------------------------------------------------------- */
fs.mkdirSync(path.join(SITE, 'notes'), { recursive: true });

NOTES.forEach((note, i) => {
  const d = data[note.id];
  const prev = NOTES[i - 1];
  const next = NOTES[i + 1];

  const nav = `<nav class="page-nav">
${prev ? `<a class="pn-prev" href="${prev.id}.html"><span class="pn-dir">&larr; Previous</span><span class="pn-title">${esc(prev.title)}</span></a>` : '<span></span>'}
${next ? `<a class="pn-next" href="${next.id}.html"><span class="pn-dir">Next &rarr;</span><span class="pn-title">${esc(next.title)}</span></a>` : ''}
</nav>`;

  const main = `<article class="content">
<span class="eyebrow">Note ${esc(note.n)}</span>
<h1>${esc(note.title)}</h1>
<p class="lede">${esc(note.description)}</p>
<div class="page-meta">
  <span>${esc(note.level)}</span>
  <span>${esc(note.minutes)} min read</span>
  <span>${d.toc.length} sections</span>
</div>
${d.body}
${nav}
</article>`;

  fs.writeFileSync(path.join(SITE, 'notes', `${note.id}.html`), shell({
    title: `${note.title} — Garvit's Notes`,
    desc: note.description,
    base: '../', main, toc: true,
  }));
});

/* --- Home ----------------------------------------------------------------- */
const totalMin = NOTES.reduce((s, n) => s + n.minutes, 0);
const totalSections = NOTES.reduce((s, n) => s + data[n.id].toc.length, 0);

const STACK = `  somebody's browser
        |
        |  1. asks for a page
        v
  +-------------------------------+
  |  Next.js  (React inside it)   |   what the visitor sees and clicks
  +-------------------------------+
        |
        |  2. asks for data over HTTP
        v
  +-------------------------------+
  |  Express  (Node.js under it)  |   rules, permissions, answers
  +-------------------------------+
        |
        |  3. reads and writes rows
        v
  +-------------------------------+
  |  PostgreSQL (Prisma on top)   |   the memory: what is still true tomorrow
  +-------------------------------+`;

const group = (from, to) => NOTES.filter((n) => n.n >= from && n.n <= to).map((note) => `<a class="card path-card" href="notes/${note.id}.html">
  <div class="card-kicker">Note ${esc(note.n)} &middot; ${esc(note.minutes)} min</div>
  <div class="card-title">${esc(note.title)}</div>
  <p>${esc(note.tagline)}</p>
  <div class="tag-row"><span class="tag">${data[note.id].toc.length} sections</span><span class="tag">${esc(note.level)}</span></div>
</a>`).join('\n');

const home = `<div class="content">
<section class="hero">
  <span class="eyebrow">The stack I build on, and the one I am building toward</span>
  <h1>Garvit&rsquo;s Notes</h1>
  <p class="lede">Notes on the technologies behind the products I ship, and on the AI systems I am learning to build &mdash; written in plain language first, then a real example, then the features and the mistakes that actually matter.</p>
  <div class="hero-stats">
    <div><div class="stat-num">${NOTES.length}</div><div class="stat-label">notes</div></div>
    <div><div class="stat-num">${Math.round(totalMin / 60)}h</div><div class="stat-label">of reading</div></div>
    <div><div class="stat-num">${totalSections}</div><div class="stat-label">sections</div></div>
  </div>
</section>

<h2 id="how-to-read">How to read these</h2>
<div class="card-grid cols-2">
  <div class="card"><div class="card-title">In order, if you are starting out</div><p>Notes 01&ndash;05 walk up the diagram below. Each assumes the one before it and nothing else.</p></div>
  <div class="card"><div class="card-title">Type the examples out</div><p>Every snippet is short on purpose and runs on its own. Reading code teaches you to recognise it; typing it teaches you to write it.</p></div>
  <div class="card"><div class="card-title">Answer before you open</div><p>Each note has collapsed self-checks. Committing to an answer first is the difference between recognising an idea and knowing it.</p></div>
  <div class="card"><div class="card-title">Then read the real codebase</div><p>Each note ends by naming the files that do what it just described, so the second example you see is always a real one.</p></div>
</div>

<h2 id="the-stack">Part one &mdash; the stack</h2>
<p>How one request crosses four systems, and what each of them is responsible for.</p>
<figure class="figure is-ascii"><div class="figure-head"><span class="figure-label">Figure</span><span class="figure-cap">Where each note sits in the path a request takes</span></div><div class="figure-stage"><pre class="ascii-art">${esc(STACK)}</pre></div></figure>
<div class="card-grid cols-2">
${group('01', '05')}
</div>

<h2 id="the-ai-track">Part two &mdash; the AI track</h2>
<p>What a model is, how to give it your knowledge and your tools, how to prove it works, and how it gets attacked. Note 06 stands alone and can be read first.</p>
<div class="card-grid cols-2">
${group('06', '13')}
</div>

<h2 id="whats-next">Part three &mdash; where this goes</h2>
<p>The honest version of what to learn after this, in what order, and how to tell you have actually learned it.</p>
<div class="card-grid cols-2">
${group('14', '99')}
</div>
</div>`;

fs.writeFileSync(path.join(SITE, 'index.html'), shell({
  title: "Garvit's Notes — the stack, and the AI track",
  desc: 'Plain-language notes on the stack I build on, and on LLMs, RAG, agents, MCP, evals, security and governance.',
  base: '', main: home, toc: false,
}));

/* --- Search index --------------------------------------------------------- */
const stripTags = (html) => html
  .replace(/<pre[\s\S]*?<\/pre>/g, ' ')          // code is noise in a text search
  .replace(/<[^>]+>/g, ' ')
  .replace(/&[a-z]+;|&#\d+;/g, ' ')
  .replace(/\s+/g, ' ')
  .trim();

const modules = NOTES.map((n) => ({
  n: n.n, slug: n.id, title: n.title, label: n.label,
  blurb: n.tagline, minutes: n.minutes,
}));

const sections = [];
for (const note of NOTES) {
  const blocks = data[note.id].body.split('<section class="note-section">').slice(1);
  data[note.id].toc.forEach((s, i) => {
    sections.push({
      slug: note.id, hash: '#' + s.id, note: note.title, section: s.title,
      text: stripTags(blocks[i] || '').slice(0, 700),
    });
  });
}

fs.writeFileSync(path.join(SITE, 'assets/js/site-data.js'),
`/* Generated by tools/build.mjs — do not edit. Source: content/ */
window.GN_MODULES = ${JSON.stringify(modules, null, 2)};

window.GN_SECTIONS = ${JSON.stringify(sections, null, 1)};
`);

console.log(`built ${NOTES.length} notes, ${totalSections} sections, ${sections.length} indexed, ${totalMin} min total`);

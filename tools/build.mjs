/**
 * Builds the static site from `content/`.
 *
 * The site is a folder tree. `content/notes.json` is the catalogue (parts, then
 * notes in reading order) and each `content/<id>.html` fragment is one note,
 * cut into `<section class="note-section">` blocks. Every one of those sections
 * becomes its own page:
 *
 *   index.html                    the overview
 *   notes/<id>/index.html         a note — the list of its topics
 *   notes/<id>/<topic>.html       one topic, on its own
 *
 * Nothing here is hand-maintained: the sidebar tree, the breadcrumbs, the
 * previous/next chain and the search index are all derived from the fragments.
 * There are no dependencies — Node's standard library only.
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

// fileURLToPath, not new URL().pathname — the project path may contain a space,
// which pathname leaves percent-encoded.
const TOOLS = path.dirname(fileURLToPath(import.meta.url));
const SITE = path.resolve(TOOLS, '..');
const CONTENT = path.join(SITE, 'content');

const CATALOGUE = JSON.parse(fs.readFileSync(path.join(CONTENT, 'notes.json'), 'utf8'));
const PARTS = CATALOGUE.parts;
const NOTES = CATALOGUE.notes;

/* --- Escaping -------------------------------------------------------------
   Hand-written entities (&mdash;, &ldquo;) must survive, so `&` is escaped
   only when it does not already begin one. */
const esc = (s) => String(s)
  .replace(/&(?!(?:[a-zA-Z][a-zA-Z0-9]{1,9}|#\d{1,6});)/g, '&amp;')
  .replace(/</g, '&lt;').replace(/>/g, '&gt;');
const attr = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/"/g, '&quot;');

const ENTITIES = {
  amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ',
  mdash: '—', ndash: '–', hellip: '…', middot: '·',
  lsquo: '‘', rsquo: '’', ldquo: '“', rdquo: '”',
  times: '×', larr: '←', rarr: '→', pound: '£',
};
const decodeEntities = (t) => t
  .replace(/&#(\d+);/g, (_, d) => String.fromCharCode(Number(d)))
  .replace(/&([a-zA-Z]+);/g, (whole, name) =>
    Object.prototype.hasOwnProperty.call(ENTITIES, name) ? ENTITIES[name] : whole);

const stripTags = (html) => html
  .replace(/<pre[\s\S]*?<\/pre>/g, ' ')          // code is noise in a text search
  .replace(/<[^>]+>/g, ' ')
  .replace(/&[a-z]+;|&#\d+;/g, ' ')
  .replace(/\s+/g, ' ')
  .trim();

/* Authoring shorthand: `{{replay}}` in a flow's figure-head expands to the
   replay button, so a fragment never carries the same inline SVG ten times. */
const REPLAY_BTN = '<button class="replay-btn" type="button">' +
  '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" ' +
  'stroke-linecap="round" stroke-linejoin="round"><path d="M3 12a9 9 0 1 0 3-6.7"/>' +
  '<path d="M3 3v6h6"/></svg> Replay</button>';

/* --- Load each fragment and cut it into topics ---------------------------- */
const load = (note) => {
  const file = path.join(CONTENT, `${note.id}.html`);
  if (!fs.existsSync(file)) { console.error(`missing content: ${file}`); process.exit(1); }
  const raw = fs.readFileSync(file, 'utf8').split('{{replay}}').join(REPLAY_BTN);

  // Sections are flat — never nested — so splitting on the opening tag is safe.
  const blocks = raw.split(/<section class="note-section"([^>]*)>/);
  const topics = [];

  for (let i = 1; i < blocks.length; i += 2) {
    const sectionAttrs = blocks[i];
    let body = blocks[i + 1] || '';
    // Everything after the matching close tag belongs to no section.
    const end = body.lastIndexOf('</section>');
    if (end !== -1) body = body.slice(0, end);

    const head = /<h2 id="([^"]+)"[^>]*>([\s\S]*?)<\/h2>/.exec(body);
    if (!head) { console.error(`  warning: ${note.id} has a section with no <h2 id>`); continue; }

    // The heading is lifted out — on its own page a topic's title is the <h1>.
    const withoutHeading = body.replace(head[0], '');
    const text = stripTags(withoutHeading);
    const tagline = /data-tagline="([^"]*)"/.exec(sectionAttrs);

    topics.push({
      id: head[1],
      title: decodeEntities(head[2].replace(/<[^>]+>/g, '')).trim(),
      titleHtml: head[2].replace(/<a class="anchor"[\s\S]*?<\/a>/g, '').trim(),
      // A one-line blurb for the folder card: authored if given, otherwise the
      // opening sentence, which is where these notes put the plain-English one.
      blurb: tagline ? tagline[1] : text.split(/(?<=[.?!])\s/)[0].slice(0, 160),
      body: withoutHeading.trim(),
      text,
      minutes: Math.max(2, Math.round(text.split(/\s+/).length / 190)),
    });
  }

  if (!topics.length) { console.error(`  warning: ${note.id} produced no topics`); }
  return topics;
};

const data = {};
for (const note of NOTES) data[note.id] = load(note);

/* --- Icons ---------------------------------------------------------------- */
const ICON_SUN  = '<svg class="icon-sun" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4"/></svg>';
const ICON_MOON = '<svg class="icon-moon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 12.8A9 9 0 1 1 11.2 3a7 7 0 0 0 9.8 9.8z"/></svg>';
const ICON_MENU = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M3 6h18M3 12h18M3 18h18"/></svg>';
const ICON_SIZE = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round"><path d="M3 17 7.5 6l4.5 11"/><path d="M4.6 13.6h5.8"/><path d="M14 17l3.4-8 3.4 8"/><path d="M15.2 14.4h4.4"/></svg>';
const ICON_TICK = '<svg class="tick" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><path d="m20 6-11 11-5-5"/></svg>';
const ICON_SEARCH = '<svg class="search-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><circle cx="11" cy="11" r="7"/><path d="m20 20-3.5-3.5"/></svg>';
const ICON_RAIL = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="4" width="18" height="16" rx="2.5"/><path d="M9 4v16"/><path class="rail-arrow" d="M14.5 9.5 12 12l2.5 2.5"/></svg>';

/* --- Shared chrome -------------------------------------------------------- */
/* Runs in <head>, before the page renders: applies the stored theme, rail and
   size state so none of them flashes on load. */
const boot = () => `<script>(function(){var d=document.documentElement;
try{var t=localStorage.getItem('gn-theme');if(t)d.setAttribute('data-theme',t);
if(localStorage.getItem('gn-rail')==='closed')d.setAttribute('data-rail','closed');
var z=localStorage.getItem('gn-size');if(z==='sm'||z==='lg')d.setAttribute('data-size',z);}catch(e){}
})();</script>`;

const header = (base) => `<header class="site-header">
  <button class="icon-btn nav-only" id="nav-toggle" type="button" aria-label="Open navigation">${ICON_MENU}</button>
  <button class="icon-btn rail-only" id="rail-toggle" type="button" aria-label="Hide the sidebar" aria-pressed="false" title="Hide the sidebar  ⌘\\">${ICON_RAIL}</button>
  <a class="brand" href="${base}index.html"><span class="brand-mark">GN</span><span class="brand-text">Garvit&rsquo;s Notes</span></a>
  <div class="header-spacer"></div>
  <div class="search-wrap">
    ${ICON_SEARCH}
    <input class="search-input" id="search" type="search" placeholder="Search every topic&hellip;" autocomplete="off" aria-label="Search notes">
    <kbd class="search-kbd">/</kbd>
    <div class="search-results" id="search-results" hidden></div>
  </div>
  <div class="size-wrap">
    <button class="icon-btn" id="size-toggle" type="button" aria-label="Reading size"
            aria-haspopup="menu" aria-expanded="false" title="Reading size">${ICON_SIZE}</button>
    <div class="size-menu" id="size-menu" role="menu" hidden>
      <div class="size-menu-head">Reading size</div>
      <button type="button" role="menuitemradio" data-size="sm"><span>Small</span>${ICON_TICK}</button>
      <button type="button" role="menuitemradio" data-size="md"><span>Medium</span>${ICON_TICK}</button>
      <button type="button" role="menuitemradio" data-size="lg"><span>Large</span>${ICON_TICK}</button>
    </div>
  </div>
  <button class="icon-btn" id="theme-toggle" type="button" aria-label="Toggle colour theme">${ICON_SUN}${ICON_MOON}</button>
  <div class="read-progress" id="read-progress"><span></span></div>
</header>`;

const shell = ({ title, desc, base, main, toc, note, topic, wide }) => `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${attr(title)}</title>
<meta name="description" content="${attr(desc)}">
<meta name="color-scheme" content="light dark">
${boot()}
<link rel="stylesheet" href="${base}assets/css/main.css">
<link rel="icon" href="data:image/svg+xml,<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 100 100'><text y='.9em' font-size='90'>&#128218;</text></svg>">
</head>
<body data-base="${base}"${note ? ` data-note="${attr(note)}"` : ''}${topic ? ` data-topic="${attr(topic)}"` : ''}${wide ? ' class="is-wide"' : ''}>
${header(base)}
<div class="layout">
  <nav class="sidebar" id="sidebar" aria-label="All notes">
    <div class="tree" id="tree"></div>
  </nav>
  <main class="main" id="main">${main}</main>
  ${toc ? '<aside class="toc" id="toc" aria-label="On this page"><div class="toc-title">On this page</div></aside>' : ''}
</div>
<script src="${base}assets/js/site-data.js"></script>
<script src="${base}assets/js/app.js"></script>
</body>
</html>`;

const crumbs = (base, trail) => `<nav class="crumbs" aria-label="Breadcrumb">` +
  trail.map((c, i) => (c.href
    ? `<a href="${base}${c.href}">${esc(c.label)}</a>`
    : `<span aria-current="page">${esc(c.label)}</span>`) +
    (i < trail.length - 1 ? '<span class="crumb-sep" aria-hidden="true">/</span>' : '')).join('') +
  `</nav>`;

/* --- A flat reading order across every note, for previous/next ------------- */
const CHAIN = [];
NOTES.forEach((note) => data[note.id].forEach((t, i) => {
  CHAIN.push({ note, topic: t, index: i });
}));

/* --- Write the pages ------------------------------------------------------ */
const NOTES_DIR = path.join(SITE, 'notes');
fs.rmSync(NOTES_DIR, { recursive: true, force: true });   // stale topic pages must not linger
fs.mkdirSync(NOTES_DIR, { recursive: true });

let pageCount = 0;

NOTES.forEach((note) => {
  const topics = data[note.id];
  const dir = path.join(NOTES_DIR, note.id);
  fs.mkdirSync(dir, { recursive: true });
  const base = '../../';

  /* The note itself: a folder of topics. */
  const totalMin = topics.reduce((s, t) => s + t.minutes, 0);
  const cards = topics.map((t, i) => `<a class="topic-card reveal" href="${t.id}.html" style="--i:${i}">
  <span class="tc-num">${String(i + 1).padStart(2, '0')}</span>
  <span class="tc-body">
    <span class="tc-title">${t.titleHtml}</span>
    <span class="tc-blurb">${esc(t.blurb)}</span>
  </span>
  <span class="tc-min">${t.minutes} min</span>
  <svg class="tc-go" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M5 12h14M13 6l6 6-6 6"/></svg>
</a>`).join('\n');

  const noteMain = `<article class="content">
${crumbs(base, [{ label: 'Notes', href: 'index.html' }, { label: note.label }])}
<header class="note-head reveal">
  <span class="eyebrow">Note ${esc(note.n)} &middot; ${esc(PARTS.find((p) => p.id === note.part).short)}</span>
  <h1>${esc(note.title)}</h1>
  <p class="lede">${esc(note.description)}</p>
  <div class="page-meta">
    <span>${topics.length} topics</span>
    <span>${totalMin} min in total</span>
    <span>${esc(note.level)}</span>
  </div>
</header>
<div class="callout is-note is-start reveal">
  <p><strong>Every topic below is its own page.</strong> Open the first one and keep
  pressing <em>Next</em> and you will read the whole note in order &mdash; or jump
  straight to the one you came for.</p>
</div>
<h2 id="topics">The topics</h2>
<div class="topic-list">
${cards}
</div>
<div class="note-cta reveal">
  <a class="btn btn-primary" href="${topics[0].id}.html">Start with &ldquo;${esc(topics[0].title)}&rdquo;
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M5 12h14M13 6l6 6-6 6"/></svg></a>
</div>
</article>`;

  fs.writeFileSync(path.join(dir, 'index.html'), shell({
    title: `${note.title} — Garvit's Notes`,
    desc: note.description,
    base, main: noteMain, toc: false, note: note.id, wide: true,
  }));
  pageCount++;

  /* One page per topic. */
  topics.forEach((t, i) => {
    const at = CHAIN.findIndex((c) => c.note.id === note.id && c.topic.id === t.id);
    const prev = CHAIN[at - 1];
    const next = CHAIN[at + 1];

    const link = (c, dirLabel, cls) => {
      const href = c.note.id === note.id
        ? `${c.topic.id}.html`
        : `${base}notes/${c.note.id}/${c.topic.id}.html`;
      const crossing = c.note.id !== note.id;
      return `<a class="${cls}" href="${href}">
  <span class="pn-dir">${dirLabel}</span>
  <span class="pn-title">${esc(c.topic.title)}</span>
  ${crossing ? `<span class="pn-note">in ${esc(c.note.label)}</span>` : ''}
</a>`;
    };

    const nav = `<nav class="page-nav">
${prev ? link(prev, '&larr; Previous', 'pn-prev') : '<span></span>'}
${next ? link(next, 'Next &rarr;', 'pn-next') : '<span></span>'}
</nav>`;

    // A strip of the note's other topics, so a reader who landed here from
    // search can see the shape of what surrounds them.
    const siblings = `<nav class="siblings" aria-label="Other topics in this note">
  <div class="sib-head">More in <a href="index.html">${esc(note.label)}</a></div>
  <div class="sib-row">${topics.map((s, j) => `<a class="sib${s.id === t.id ? ' is-current' : ''}" href="${s.id}.html"><span class="sib-n">${String(j + 1).padStart(2, '0')}</span>${esc(s.title)}</a>`).join('')}</div>
</nav>`;

    const main = `<article class="content">
${crumbs(base, [{ label: 'Notes', href: 'index.html' }, { label: note.label, href: `notes/${note.id}/index.html` }, { label: t.title }])}
<header class="topic-head reveal">
  <span class="eyebrow">Note ${esc(note.n)} &middot; ${esc(note.label)} &middot; Topic ${i + 1} of ${topics.length}</span>
  <h1>${t.titleHtml}</h1>
  <div class="page-meta">
    <span>${t.minutes} min read</span>
    <span>${esc(note.level)}</span>
  </div>
</header>
<div class="topic-body">
${t.body}
</div>
${nav}
${siblings}
</article>`;

    fs.writeFileSync(path.join(dir, `${t.id}.html`), shell({
      title: `${t.title} — ${note.label} — Garvit's Notes`,
      desc: t.blurb,
      base, main, toc: true, note: note.id, topic: t.id,
    }));
    pageCount++;
  });
});

/* --- Home ----------------------------------------------------------------- */
const allTopics = NOTES.reduce((s, n) => s + data[n.id].length, 0);
const totalMin = NOTES.reduce((s, n) => s + data[n.id].reduce((a, t) => a + t.minutes, 0), 0);

const noteCard = (note) => {
  const topics = data[note.id];
  const preview = topics.slice(0, 4).map((t) =>
    `<li><a href="notes/${note.id}/${t.id}.html">${esc(t.title)}</a></li>`).join('');
  return `<article class="note-card reveal">
  <a class="nc-main" href="notes/${note.id}/index.html">
    <div class="nc-kicker"><span class="nc-n">${esc(note.n)}</span>${esc(note.level)}</div>
    <h3 class="nc-title">${esc(note.title)}</h3>
    <p class="nc-tagline">${esc(note.tagline)}</p>
  </a>
  <ul class="nc-topics">${preview}</ul>
  <a class="nc-all" href="notes/${note.id}/index.html">All ${topics.length} topics
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M5 12h14M13 6l6 6-6 6"/></svg></a>
</article>`;
};

const partBlock = (part) => {
  const mine = NOTES.filter((n) => n.part === part.id);
  if (!mine.length) return '';
  return `<section class="part">
<div class="part-head reveal">
  <span class="part-tag">${esc(part.short)}</span>
  <h2 id="${part.id}">${esc(part.title)}</h2>
  <p class="part-lede">${esc(part.lede)}</p>
</div>
${part.figure || ''}
<div class="note-grid">
${mine.map(noteCard).join('\n')}
</div>
</section>`;
};

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

PARTS.find((p) => p.id === 'stack').figure =
  `<figure class="figure is-ascii reveal"><div class="figure-head"><span class="figure-label">Figure</span><span class="figure-cap">Where each note sits in the path a request takes</span></div><div class="figure-stage"><pre class="ascii-art">${esc(STACK)}</pre></div></figure>`;

const home = `<div class="content home">
<section class="hero">
  <div class="hero-glow" aria-hidden="true"></div>
  <span class="eyebrow">The stack I build on, and the one I am building toward</span>
  <h1 class="hero-title">Garvit&rsquo;s Notes</h1>
  <p class="lede">Notes on the technologies behind the products I ship, and on the AI systems I am learning to build &mdash; written in plain language first, then a real example, then the features and the mistakes that actually matter.</p>
  <div class="hero-stats">
    <div><div class="stat-num" data-count="${NOTES.length}">0</div><div class="stat-label">notes</div></div>
    <div><div class="stat-num" data-count="${allTopics}">0</div><div class="stat-label">topics</div></div>
    <div><div class="stat-num" data-count="${Math.round(totalMin / 60)}" data-suffix="h">0</div><div class="stat-label">of reading</div></div>
  </div>
  <div class="hero-cta">
    <a class="btn btn-primary" href="notes/${NOTES[0].id}/${data[NOTES[0].id][0].id}.html">Start reading
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M5 12h14M13 6l6 6-6 6"/></svg></a>
    <a class="btn btn-ghost" href="#how-to-read">How to read these</a>
  </div>
</section>

<h2 id="how-to-read">How to read these</h2>
<div class="card-grid cols-2">
  <div class="card reveal"><div class="card-title">One topic, one page</div><p>Every note is a folder in the sidebar. Open it and each topic inside is its own short page &mdash; so you finish something in ten minutes rather than abandoning something long.</p></div>
  <div class="card reveal"><div class="card-title">Type the examples out</div><p>Every snippet is short on purpose and runs on its own. Reading code teaches you to recognise it; typing it teaches you to write it.</p></div>
  <div class="card reveal"><div class="card-title">Answer before you open</div><p>Each topic ends with a collapsed self-check. Committing to an answer first is the difference between recognising an idea and knowing it.</p></div>
  <div class="card reveal"><div class="card-title">Then read the real codebase</div><p>Each note ends by naming the files that do what it just described, so the second example you see is always a real one.</p></div>
</div>

${PARTS.map(partBlock).join('\n')}
</div>`;

fs.writeFileSync(path.join(SITE, 'index.html'), shell({
  title: "Garvit's Notes — the stack, and the AI track",
  desc: 'Plain-language notes on the stack I build on, and on LLMs, RAG, agents, MCP, evals, security, governance, architecture and cloud.',
  base: '', main: home, toc: false, wide: true,
}));
pageCount++;

/* --- Old URLs ------------------------------------------------------------- */
/* Before the restructure a note was one page, `notes/<slug>.html`, with its
   topics as anchors inside it. Those URLs are in bookmarks and in links from
   off the site, so each stays alive as a stub that forwards to the new page —
   and, where the old anchor named a topic, to that topic's own page rather
   than dropping the reader at the top of the note. It carries `noindex` and a
   canonical link of its own — a redirect stub has no content to be found by,
   so search results should point at the real page instead. */
let redirectCount = 0;
NOTES.forEach((note) => {
  const topics = data[note.id].map((t) => t.id);
  fs.writeFileSync(path.join(SITE, 'notes', `${note.id}.html`), `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<title>Moved — ${attr(note.title)} — Garvit's Notes</title>
<meta name="robots" content="noindex, nofollow">
<link rel="canonical" href="${note.id}/index.html">
<script>(function(){var t=${JSON.stringify(topics)};
var h=decodeURIComponent((location.hash||'').replace(/^#/,''));
location.replace('${note.id}/'+(t.indexOf(h)!==-1?h:'index')+'.html'+location.search);})();</script>
<noscript><meta http-equiv="refresh" content="0;url=${note.id}/index.html"></noscript>
</head>
<body><p>This note moved to <a href="${note.id}/index.html">${attr(note.title)}</a>.</p></body>
</html>
`);
  redirectCount++;
});

/* --- The catalogue the browser sees --------------------------------------- */
const modules = NOTES.map((n) => ({
  n: n.n, slug: n.id, title: n.title, label: n.label, part: n.part,
  blurb: n.tagline, level: n.level,
  minutes: data[n.id].reduce((a, t) => a + t.minutes, 0),
  topics: data[n.id].map((t) => ({ id: t.id, title: t.title, minutes: t.minutes })),
}));

const sections = [];
NOTES.forEach((note) => data[note.id].forEach((t) => {
  sections.push({
    slug: note.id, topic: t.id, note: note.label, noteTitle: note.title,
    section: t.title, text: t.text.slice(0, 700),
  });
}));

/* Two files, not one. site-data.js is the sidebar and the home page, needed by
   every page on load. search-data.js is the prose every topic is searched
   against — far the larger half, wanted only once somebody actually searches,
   and it grows with every note. app.js fetches it on the first keystroke. */
fs.writeFileSync(path.join(SITE, 'assets/js/site-data.js'),
`/* Generated by tools/build.mjs — do not edit. Source: content/ */
window.GN_PARTS = ${JSON.stringify(PARTS.map(({ id, title, short }) => ({ id, title, short })), null, 2)};

window.GN_MODULES = ${JSON.stringify(modules, null, 2)};
`);

fs.writeFileSync(path.join(SITE, 'assets/js/search-data.js'),
`/* Generated by tools/build.mjs — do not edit. Source: content/ */
window.GN_SECTIONS = ${JSON.stringify(sections, null, 1)};
if (window.GN_ON_SEARCH_DATA) window.GN_ON_SEARCH_DATA();
`);

console.log(`built ${pageCount} pages — ${NOTES.length} notes, ${allTopics} topics, ${totalMin} min total`);
console.log(`${redirectCount} redirects for the pre-restructure URLs`);

# Garvit's Notes

Fourteen notes on the stack I build on, and on the AI systems I am learning to
build. Written in plain language first, then a real example, then the features
and the mistakes that actually matter.

**Live:** https://jngarvit07.github.io/garvits-notes/

Plain HTML, CSS and JavaScript. No framework, no runtime dependencies, no
server. Open `index.html` and it works.

## The notes

**Part one — the stack.** How one request crosses four systems.

| # | Note | |
|---|------|---|
| 01 | React | Components, props, state, hooks, lists and forms |
| 02 | Next.js | App Router, server vs client, rendering, caching |
| 03 | Node.js | The event loop, async/await, modules, streams |
| 04 | Express | Routes, middleware, auth, validation, error handling |
| 05 | PostgreSQL & Prisma | Tables, SQL, joins, indexes, transactions, migrations |

**Part two — the AI track.** Note 06 stands alone and can be read first.

| # | Note | |
|---|------|---|
| 06 | AI, Models, RAG & Security | How models work, prompting, embeddings, RAG, production |
| 07 | Agents & Workflows | The agent loop, workflow patterns, tool design, folder structure |
| 08 | MCP | The protocol, building a server, connecting it, securing it |
| 09 | Skills & Artifacts | Four ways to extend a model, and which one you need |
| 10 | The Model Landscape | Claude, OpenAI, Gemini, Copilot — what actually differs |
| 11 | Evaluating AI Systems | Eval sets, graders, scoring RAG and agents, CI |
| 12 | AI Security | Prompt injection, the three ingredients, defences that hold |
| 13 | AI Governance | Risk tiers, the frameworks, a system card that fits on a page |

**Part three — where this goes.**

| # | Note | |
|---|------|---|
| 14 | What to Learn Next | The path, the foundations, and how to tell you have learned it |

## Reading it locally

```bash
python3 -m http.server 8000
# http://localhost:8000
```

## Editing

The notes are **HTML fragments in `content/`**, one file per note, plus
`content/notes.json` which is the catalogue in reading order. Edit a fragment,
rebuild, and the page, the sidebar, the table of contents, the previous/next
links and the search index all update from it.

```bash
cd tools
npm run build      # or: node build.mjs
```

There is nothing to install. The build uses Node's standard library only.

### Adding a note

1. Write `content/<id>.html`. Each section is:

   ```html
   <section class="note-section">
     <h2 id="short-id">The heading</h2>
     <p>…</p>
   </section>
   ```

2. Add an entry to `content/notes.json` — `id`, `n`, `label`, `title`,
   `tagline`, `description`, `level`, `minutes`.
3. `npm run build`.

Headings become the table of contents automatically. Do not hand-maintain one.

### The components available in a fragment

| Markup | Renders as |
|---|---|
| `<div class="callout is-note\|is-warn\|is-tip">` | An aside — information, warning, plain-English explainer |
| `<div class="callout is-note is-practice">` | A "go and do this" block |
| `<div class="example">` | A real-world worked example with a badge |
| `<div class="code-block">` + `<div class="code-head">` | A captioned code block |
| `<figure class="figure is-ascii">` + `<pre class="ascii-art">` | A fixed-width diagram |
| `<figure class="figure is-flow">` + `<ol class="flow flow-column">` | An animated step sequence |
| `<div class="compare">` with `is-bad` / `is-good` panes | The mistake beside the fix |
| `<details class="selfcheck">` | A question with the answer hidden |
| `<div class="recap">` | The closing "worth remembering" list |
| `<div class="card-grid cols-2\|cols-3">` + `<div class="card">` | Concept cards |
| `<div class="table-wrap"><table>` | A table that scrolls rather than overflowing |

Write `{{replay}}` inside a flow's `figure-head` and the build expands it into
the replay button.

## Publishing

Pushing to `main` publishes. GitHub Pages serves the repository root — there is
no build step on their side, because the HTML is committed.

Every path is relative, so the site works from a subdirectory, from a custom
domain, or opened straight off disk.

## Layout

```
index.html              the overview
notes/*.html            generated — do not edit by hand
content/*.html          the notes themselves, one fragment each
content/notes.json      the catalogue, in reading order
assets/css/main.css     the whole design system
assets/js/app.js        theme, sidebar, TOC, search, animations, highlighting
assets/js/site-data.js  generated — the catalogue and the search index
tools/build.mjs         the build
```

## What the pages do

- **Light and dark**, following the system by default; the toggle overrides it
  and is remembered per browser.
- **Search** across every section heading and its body text, showing the
  sentence the match was found in. `/` focuses it; arrows and Enter navigate.
- **Animated flow diagrams** that reveal a step at a time on scroll, with a
  replay button.
- **Self-checks** that stay collapsed until you commit to an answer.
- Reduced-motion, keyboard navigation and mobile are all handled.

## A note on what is not here

There are **no prices and no benchmark scores**. Both move every few months, and
a note that quotes them is wrong within a year while still looking
authoritative. The notes describe capability tiers and tell you to check the
provider's own documentation for numbers.

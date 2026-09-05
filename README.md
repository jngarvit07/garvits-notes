# Garvit's Notes

Twenty-five notes on the stack I build on, on the AI systems I am learning to
build, and on shipping any of it for real. Every note is a folder; every topic
inside it is its own page. Written in plain language first, then a real
example, then the features and the mistakes that actually matter.

**Live:** https://jngarvit07.github.io/garvits-notes/

Plain HTML, CSS and JavaScript. No framework, no runtime dependencies, no
server. Open `index.html` and it works.

## The shape of it

Each note is a folder in the sidebar. Opening it reveals its topics, and each
topic is a short page you can finish in a few minutes — so the site reads as a
tree rather than as eighteen very long documents.

```
notes/react/index.html        the React note — a list of its topics
notes/react/props.html        one topic, on its own page
notes/react/state.html        the next one
```

Pressing **Next** at the foot of a topic walks the whole site in reading order,
crossing from the last topic of one note into the first of the next.

## The notes

**Part one — the stack.** How one request crosses four systems.

| # | Note | | Topics |
|---|------|---|---|
| 01 | React | Components, props, state, hooks, lists and forms | 11 |
| 02 | State Management & Redux | Lifting, Context, Redux Toolkit, Zustand, React Query | 11 |
| 03 | Next.js | App Router, server vs client, rendering, caching | 12 |
| 04 | Node.js | The event loop, async/await, modules, streams | 11 |
| 05 | Express | Routes, middleware, auth, validation, error handling | 11 |
| 06 | PostgreSQL & Prisma | Tables, SQL, joins, indexes, transactions, migrations | 11 |

**Part two — the AI track.** Note 07 is the overview and stands alone; 08–12 are
the deep dives underneath it.

| # | Note | | Topics |
|---|------|---|---|
| 07 | AI, Models, RAG & Security | How models work, prompting, embeddings, RAG, production | 24 |
| 08 | Inside a Model | Tokens, vectors, attention, decoding, reasoning models | 7 |
| 09 | Advanced RAG | Chunking, hybrid search, reranking, query rewriting, metrics | 7 |
| 10 | Fine-tuning & Model Adaptation | LoRA, datasets, DPO, distillation, and whether it pays | 6 |
| 11 | Running Models Yourself | Open weights, VRAM, quantisation, vLLM, what you take on | 6 |
| 12 | Structured Output & Tool Calling | Schemas, constrained decoding, tool calling, validation | 6 |
| 13 | Agents & Workflows | The agent loop, workflow patterns, tool design, structure | 10 |
| 14 | MCP — Model Context Protocol | The protocol, building a server, connecting it, securing it | 9 |
| 15 | Skills & Artifacts | Four ways to extend a model, and which one you need | 4 |
| 16 | The Model Landscape | Claude, OpenAI, Gemini, Copilot — what actually differs | 5 |
| 17 | Evaluating AI Systems | Eval sets, graders, scoring RAG and agents, CI | 5 |
| 18 | AI Security | Prompt injection, the three ingredients, defences that hold | 5 |
| 19 | AI Governance | Risk tiers, the frameworks, a system card on a page | 5 |
| 20 | AI System Architecture | The five layers, four reference shapes, the six boundaries | 7 |
| 21 | Cloud & GCP Deployment | Cloud Run, storage, IAM, secrets, Vertex, the bill | 9 |
| 22 | AI Ops — Running It in Production | Logging, tracing, prompt versioning, rollouts, incidents | 7 |

**Part three — shipping it.** Container, pipeline and cluster fundamentals,
then one real product built and shipped through exactly that pipeline.

| # | Note | | Topics |
|---|------|---|---|
| 24 | CI/CD, Docker & Kubernetes | VM vs container vs cluster, Docker, pipelines, K8s objects | 6 |
| 25 | Building a Full Project with AI | Spec-first workflow, a real API and frontend, shipping it | 6 |

**Part four — where this goes.**

| # | Note | | Topics |
|---|------|---|---|
| 26 | What to Learn Next | The path, the foundations, and how to tell you have learned it | 6 |

## Public, and unindexed only where it should be

The site carries no sign-in gate, and `robots.txt` doesn't exist — a search
engine is free to crawl and index every note. There used to be a sign-in gate
here, backed by `robots.txt` and a blanket `noindex` on every page. On a
static site a gate like that was never a security boundary — `curl` returned
every note in full without signing in, and the repository is public on GitHub
Pages regardless — so it only ever kept out a casual visitor. Once the goal
stopped being privacy, the gate was pure friction (re-signing in on every new
browser or cleared cache, JavaScript required just to read a note) for
protection that was never real, and the `noindex`/`robots.txt` pair was
working against the point of publishing at all: it made the notes
un-Googleable. All three are gone now.

The one place `noindex` remains is the pre-restructure redirect stubs
(`notes/<slug>.html`) — they hold no content of their own, so search results
should point at the real page (`notes/<slug>/index.html`) via the `canonical`
link instead of indexing the stub.

`_config.yml` still keeps `content/` (the unbuilt note source) and `tools/`,
`tests/` off the published site — that's about not shipping build machinery
and drafts, not about gating the notes themselves.

## Reading it locally

```bash
python3 -m http.server 8000
# http://localhost:8000
```

Note that `_config.yml` is a GitHub Pages instruction, so `content/` **is**
reachable from a plain local server. Only the deployed site excludes it.

## Building and checking

```bash
cd tools
npm run build     # regenerate every page from content/
npm test          # check the built site
npm run check     # both
```

`tests/run.mjs` has no dependencies and starts no browser; it reads the built
site only. It checks that no page carries the old gate or a blanket noindex,
the `_config.yml` source-exclusion rules, the payload split, the old-URL
redirects, and every internal link.

## Editing

The notes are **HTML fragments in `content/`**, one file per note, plus
`content/notes.json` which holds the parts and the notes in reading order. Edit
a fragment, rebuild, and the folder pages, the topic pages, the sidebar tree,
the breadcrumbs, the previous/next chain and the search index all update from
it.

```bash
cd tools
npm run build      # or: node build.mjs
```

There is nothing to install. The build uses Node's standard library only.

### Adding a note

1. Write `content/<id>.html`. Each section becomes **its own page**:

   ```html
   <section class="note-section" data-tagline="One line for the folder card.">
     <h2 id="short-id">The heading</h2>
     <p>…</p>
   </section>
   ```

   The `id` on the `<h2>` becomes the page's filename, so keep it short and
   stable — changing it changes a URL. `data-tagline` is optional; without it
   the build uses the section's opening sentence.

2. Add an entry to `content/notes.json` under `notes` — `id`, `n`, `part`,
   `label`, `title`, `tagline`, `description`, `level`, `minutes`.
3. `npm run build`.

Reading time per topic is counted from the words. Do not hand-maintain it.

### The components available in a fragment

| Markup | Renders as |
|---|---|
| `<div class="callout is-note\|is-warn\|is-tip">` | An aside — information, warning, plain-English explainer |
| `<div class="callout is-note is-practice">` | A "go and do this" block |
| `<div class="example">` | A real-world worked example with a badge |
| `<div class="code-block">` + `<div class="code-head">` | A captioned code block, with a copy button |
| `<figure class="figure is-ascii">` + `<pre class="ascii-art">` | A fixed-width diagram |
| `<figure class="figure is-flow">` + `<ol class="flow flow-column">` | An animated step sequence |
| `<div class="compare">` with `is-bad` / `is-good` panes | The mistake beside the fix |
| `<details class="selfcheck">` | A question with the answer hidden |
| `<div class="recap">` | The closing "worth remembering" list |
| `<div class="card-grid cols-2\|cols-3">` + `<div class="card">` | Concept cards |
| `<div class="table-wrap"><table>` | A table that scrolls rather than overflowing |

Write `{{replay}}` inside a flow's `figure-head` and the build expands it into
the replay button.

### The beginner layer

Every topic opens with an **In plain English** callout — an analogy a
non-technical reader can follow — before any code appears. `tools/lib/enrich.mjs`
is the helper that inserted these; it is idempotent, so a topic that already has
one is skipped rather than given a second.

## Publishing

Pushing to `main` publishes. GitHub Pages serves the repository root — there is
no build step on their side, because the HTML is committed. `_config.yml` is
the one thing they do act on: it keeps `content/`, `tools/` and `tests/` out
of what gets served.

Run `npm run check` in `tools/` before pushing — the committed HTML is the
deployed site, so a stale build ships as-is.

Every path is relative, so the site works from a subdirectory, from a custom
domain, or opened straight off disk.

## Layout

```
index.html               the overview
_config.yml              keeps content/, tools/ and tests/ off the built site
notes/<id>/index.html    generated — a note, listing its topics
notes/<id>/<topic>.html  generated — one topic  ·  do not edit by hand
notes/<id>.html          generated — forwards the pre-restructure URL
content/*.html           the notes themselves, one fragment each
content/notes.json       the parts and the catalogue, in reading order
assets/css/main.css      the whole design system
assets/js/app.js         theme, size, tree, rail, TOC, search, motion, highlighting
assets/js/site-data.js   generated — the sidebar catalogue, loaded by every page
assets/js/search-data.js generated — the search prose, loaded on first keystroke
tools/build.mjs          the build
tools/lib/enrich.mjs     the beginner-layer inserter
tests/run.mjs            checks the built site
```

## What the pages do

- **A folder tree** in the sidebar. Every note expands to its topics; what you
  have opened is remembered per browser, and the note you are reading is always
  open.
- **A collapsing sidebar** — the button beside the logo, or <kbd>⌘</kbd> +
  <kbd>\\</kbd> — which widens the reading column and is remembered.
- **Three reading sizes** — small, medium, large, from the `Aa` button. Every
  font-size in the stylesheet is in `rem`, so one number on `<html>` moves all
  of them, and the reading column widens with the text so the measure holds.
  Remembered per browser.
- **Light and dark**, following the system by default; the toggle overrides it
  and is remembered per browser.
- **Search** across every topic heading and its body text, showing the sentence
  the match was found in. `/` focuses it; arrows and Enter navigate.
- **`[` and `]`** move to the previous and next topic.
- **Animated flow diagrams** that reveal a step at a time on scroll, with a
  replay button; content that rises into place as you reach it; a reading
  progress bar; copy buttons on every code block.
- **Self-checks** that stay collapsed until you commit to an answer.
- Reduced-motion, keyboard navigation and mobile are all handled. Every
  animation is switched off under `prefers-reduced-motion`.

### On a phone

- The sidebar becomes a drawer, and every tap target is at least 40px.
- Search collapses to an icon that opens a full-width bar under the header,
  because a field sharing that row would be about 90px wide.
- Sign out is in the header on a desktop and at the foot of the sidebar
  everywhere; the header copy is hidden on a phone, where the row has no room
  for it.
- Tables, code blocks and fixed-width diagrams scroll inside their own box, so
  the page itself never scrolls sideways. This is checked in CI-style by
  loading every page at 320, 390, 412 and 768px wide, at all three reading
  sizes, and asserting `scrollWidth <= innerWidth`.

## A note on what is not here

There are **no prices and no benchmark scores**. Both move every few months, and
a note that quotes them is wrong within a year while still looking
authoritative. The notes describe capability tiers and tell you to check the
provider's own documentation for numbers.

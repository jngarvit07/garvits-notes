/**
 * Inserts the beginner layer into a note fragment.
 *
 * Each note has a small data file beside it listing, per topic, the additions
 * that topic needs: a plain-English opener that goes straight after the
 * heading, and a self-check that goes at the end of the section. Existing
 * prose is never touched, and running this twice is a no-op — a topic that
 * already carries a block of a given kind is skipped rather than duplicated.
 */
import fs from 'node:fs';
import path from 'node:path';

export const tip = (title, body) =>
  `<div class="callout is-tip"><span class="callout-icon">&#128161;</span><div class="callout-body">` +
  `<div class="callout-title">${title}</div> ${body} </div></div>`;

export const check = (q, ...answer) =>
  `<details class="selfcheck"><summary><span class="sc-q">${q}</span>` +
  `<span class="sc-cue">Answer</span></summary><div class="sc-body">` +
  answer.map((p) => `<p> ${p} </p>`).join('\n') + `</div></details>`;

export function enrich(noteId, additions) {
  const file = path.join('content', `${noteId}.html`);
  let src = fs.readFileSync(file, 'utf8');

  // Split on the section boundary so each topic can be edited independently.
  const parts = src.split(/(?=<section class="note-section")/);
  let added = { tip: 0, check: 0 }, skipped = 0;

  const out = parts.map((block) => {
    const m = /<h2 id="([^"]+)"[^>]*>[\s\S]*?<\/h2>/.exec(block);
    if (!m) return block;
    const add = additions[m[1]];
    if (!add) return block;

    let next = block;

    // The opener goes immediately after the heading, before the first
    // paragraph — it is the sentence a reader should meet first.
    if (add.tip) {
      if (next.includes('callout is-tip')) skipped++;
      else {
        next = next.replace(m[0], m[0] + '\n' + add.tip);
        added.tip++;
      }
    }

    // The self-check closes the topic, so it lands before </section>.
    if (add.check) {
      if (next.includes('class="selfcheck"')) skipped++;
      else {
        const at = next.lastIndexOf('</section>');
        if (at !== -1) {
          next = next.slice(0, at) + add.check + '\n' + next.slice(at);
          added.check++;
        }
      }
    }
    return next;
  });

  fs.writeFileSync(file, out.join(''));
  console.log(`${noteId}: +${added.tip} openers, +${added.check} self-checks` +
    (skipped ? `, ${skipped} already present` : ''));
}

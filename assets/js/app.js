/* ==========================================================================
   Garvit's Notes — site behaviour
   No dependencies. Every block is defensive so a missing element on one page
   never breaks the rest of the page.
   ========================================================================== */
(function () {
  'use strict';

  var BASE = document.body.getAttribute('data-base') || '';
  var NOTE = document.body.getAttribute('data-note') || '';
  var TOPIC = document.body.getAttribute('data-topic') || '';
  var REDUCED = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  var store = {
    get: function (k) { try { return localStorage.getItem(k); } catch (e) { return null; } },
    set: function (k, v) { try { localStorage.setItem(k, v); } catch (e) { /* private mode */ } },
    del: function (k) { try { localStorage.removeItem(k); } catch (e) { /* private mode */ } },
  };

  var svg = function (d, w) {
    return '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="' +
      (w || 2) + '" stroke-linecap="round" stroke-linejoin="round">' + d + '</svg>';
  };

  /* --- 1. Theme ---------------------------------------------------------- */
  // The inline script in <head> has already applied the stored theme to avoid
  // a flash. Here we only wire up the toggle.
  var themeBtn = document.getElementById('theme-toggle');
  if (themeBtn) {
    themeBtn.addEventListener('click', function () {
      var root = document.documentElement;
      var current = root.getAttribute('data-theme');
      if (!current) {
        // Following the system: flip to the opposite of what's showing.
        current = window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
      }
      var next = current === 'dark' ? 'light' : 'dark';
      root.setAttribute('data-theme', next);
      store.set('gn-theme', next);
    });
  }

  /* --- 2. Sign out ------------------------------------------------------- */
  var signOut = document.getElementById('sign-out');
  if (signOut) {
    signOut.addEventListener('click', function () {
      store.del('gn-auth');
      location.href = BASE + 'login.html';
    });
  }

  /* --- 2b. Reading size --------------------------------------------------- */
  // Every font-size in the stylesheet is in rem, so one number on <html>
  // moves all of them. Medium is the default and stores no attribute, which
  // lets the small-screen base size in the stylesheet still apply.
  (function () {
    var btn = document.getElementById('size-toggle');
    var menu = document.getElementById('size-menu');
    if (!btn || !menu) return;

    var apply = function (size, save) {
      if (size === 'sm' || size === 'lg') document.documentElement.setAttribute('data-size', size);
      else document.documentElement.removeAttribute('data-size');
      if (save) store.set('gn-size', size);
      menu.querySelectorAll('[data-size]').forEach(function (b) {
        b.setAttribute('aria-checked', String(b.getAttribute('data-size') === size));
      });
    };

    var current = store.get('gn-size');
    apply(current === 'sm' || current === 'lg' ? current : 'md', false);

    var close = function () {
      menu.hidden = true;
      btn.setAttribute('aria-expanded', 'false');
    };
    var open = function () {
      menu.hidden = false;
      btn.setAttribute('aria-expanded', 'true');
      var checked = menu.querySelector('[aria-checked="true"]');
      if (checked) checked.focus();
    };

    btn.addEventListener('click', function (e) {
      e.stopPropagation();
      menu.hidden ? open() : close();
    });

    menu.addEventListener('click', function (e) {
      var item = e.target.closest('[data-size]');
      if (!item) return;
      apply(item.getAttribute('data-size'), true);
      close();
      btn.focus();
    });

    document.addEventListener('click', function (e) {
      if (!menu.hidden && !menu.contains(e.target) && e.target !== btn) close();
    });
    document.addEventListener('keydown', function (e) {
      if (e.key === 'Escape' && !menu.hidden) { close(); btn.focus(); }
    });
  })();

  /* --- 3. Collapsing the left rail --------------------------------------- */
  // The state lives on <html> so the boot script in <head> can apply it before
  // first paint — otherwise the sidebar flashes in and then disappears.
  var railBtn = document.getElementById('rail-toggle');
  var setRail = function (closed) {
    document.documentElement.setAttribute('data-rail', closed ? 'closed' : 'open');
    store.set('gn-rail', closed ? 'closed' : 'open');
    if (railBtn) {
      railBtn.setAttribute('aria-pressed', String(closed));
      railBtn.setAttribute('aria-label', closed ? 'Show the sidebar' : 'Hide the sidebar');
      railBtn.setAttribute('title', (closed ? 'Show' : 'Hide') + ' the sidebar  \u2318\\');
    }
  };
  setRail(document.documentElement.getAttribute('data-rail') === 'closed');
  if (railBtn) {
    railBtn.addEventListener('click', function () {
      setRail(document.documentElement.getAttribute('data-rail') !== 'closed');
    });
  }
  // Cmd/Ctrl + \ — the shortcut editors use for the same thing.
  document.addEventListener('keydown', function (e) {
    if (e.key === '\\' && (e.metaKey || e.ctrlKey)) {
      e.preventDefault();
      setRail(document.documentElement.getAttribute('data-rail') !== 'closed');
    }
  });

  /* --- 4. Mobile sidebar -------------------------------------------------- */
  var navBtn = document.getElementById('nav-toggle');
  var sidebar = document.getElementById('sidebar');
  if (navBtn && sidebar) {
    var scrim = null;
    var closeNav = function () {
      sidebar.classList.remove('is-open');
      if (scrim) { scrim.remove(); scrim = null; }
    };
    navBtn.addEventListener('click', function () {
      if (sidebar.classList.toggle('is-open')) {
        scrim = document.createElement('div');
        scrim.className = 'nav-scrim';
        scrim.addEventListener('click', closeNav);
        document.body.appendChild(scrim);
      } else { closeNav(); }
    });
    document.addEventListener('keydown', function (e) { if (e.key === 'Escape') closeNav(); });
  }

  /* --- 5. The sidebar tree ------------------------------------------------ */
  // Every note is a folder that opens to its topics. One catalogue
  // (site-data.js) drives this, the search and the home page, so they cannot
  // drift apart.
  (function () {
    if (!sidebar || !window.GN_MODULES) return;

    var OPEN_KEY = 'gn-open';
    var open = {};
    try { open = JSON.parse(store.get(OPEN_KEY) || '{}') || {}; } catch (e) { open = {}; }
    // The note you are reading is always open, whatever was stored.
    if (NOTE) open[NOTE] = true;

    var CARET = svg('<path d="m9 6 6 6-6 6"/>', 2.2);
    var esc = function (t) {
      return String(t).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
    };

    var html = '<a class="tree-home' + (!NOTE ? ' is-current' : '') + '" href="' + BASE + 'index.html">' +
      svg('<path d="M3 10.5 12 3l9 7.5"/><path d="M5.5 9.5V21h13V9.5"/>', 1.9) +
      '<span>Overview</span></a>';

    (window.GN_PARTS || [{ id: null, short: 'The notes' }]).forEach(function (part) {
      var mine = window.GN_MODULES.filter(function (m) { return !part.id || m.part === part.id; });
      if (!mine.length) return;

      html += '<div class="tree-part">' + esc(part.short) + '</div>';

      mine.forEach(function (m) {
        var isOpen = !!open[m.slug];
        var isHere = m.slug === NOTE;
        html += '<div class="tree-note' + (isOpen ? ' is-open' : '') +
                (isHere ? ' is-here' : '') + '" data-note="' + m.slug + '">' +
          '<div class="tn-row">' +
            '<button class="tn-caret" type="button" aria-expanded="' + isOpen + '" ' +
              'aria-label="' + (isOpen ? 'Collapse ' : 'Expand ') + esc(m.label) + '">' + CARET + '</button>' +
            '<a class="tn-link" href="' + BASE + 'notes/' + m.slug + '/index.html">' +
              '<span class="tn-num">' + esc(m.n) + '</span>' +
              '<span class="tn-label">' + esc(m.label) + '</span>' +
              '<span class="tn-count">' + m.topics.length + '</span>' +
            '</a>' +
          '</div>' +
          '<div class="tn-drawer"><ul class="tn-topics">' +
            m.topics.map(function (t, i) {
              var cur = isHere && t.id === TOPIC;
              return '<li><a' + (cur ? ' class="is-current"' : '') +
                ' href="' + BASE + 'notes/' + m.slug + '/' + t.id + '.html">' +
                '<span class="tt-n">' + String(i + 1).padStart(2, '0') + '</span>' +
                '<span class="tt-t">' + esc(t.title) + '</span></a></li>';
            }).join('') +
          '</ul></div>' +
        '</div>';
      });
    });

    var treeHost = document.getElementById('tree') || sidebar;
    treeHost.innerHTML = html;

    // Expand and collapse. The drawer animates via grid-template-rows, which
    // is the one way to transition to a height you do not know in advance.
    sidebar.addEventListener('click', function (e) {
      var caret = e.target.closest('.tn-caret');
      if (!caret) return;
      e.preventDefault();
      var folder = caret.closest('.tree-note');
      var nowOpen = folder.classList.toggle('is-open');
      caret.setAttribute('aria-expanded', String(nowOpen));
      caret.setAttribute('aria-label', (nowOpen ? 'Collapse ' : 'Expand ') +
        folder.querySelector('.tn-label').textContent);
      open[folder.getAttribute('data-note')] = nowOpen;
      store.set(OPEN_KEY, JSON.stringify(open));
    });

    // Bring the current topic into view without animating the whole way there.
    var here = sidebar.querySelector('.tn-topics a.is-current') || sidebar.querySelector('.tree-note.is-here');
    if (here) {
      var top = here.offsetTop - sidebar.clientHeight / 2;
      if (top > 0) sidebar.scrollTop = top;
    }
  })();

  /* --- 6. Table of contents, built from the headings ---------------------- */
  var tocBox = document.getElementById('toc');
  var article = document.querySelector('.content');
  var headings = [];

  if (tocBox && article) {
    // On a topic page the <h1> is the topic, so the contents are its h2/h3.
    headings = Array.prototype.slice.call(article.querySelectorAll('.topic-body h2, .topic-body h3'));

    if (headings.length) {
      var list = document.createElement('ul');

      headings.forEach(function (h, i) {
        if (!h.id) {
          h.id = (h.textContent || '').toLowerCase().replace(/[^\w\s-]/g, '')
            .trim().replace(/\s+/g, '-') || ('section-' + i);
        }

        // Clickable anchor next to the heading itself.
        var anchor = document.createElement('a');
        anchor.className = 'anchor';
        anchor.href = '#' + h.id;
        anchor.textContent = '#';
        anchor.setAttribute('aria-label', 'Link to this section');
        h.appendChild(anchor);

        var li = document.createElement('li');
        var link = document.createElement('a');
        link.href = '#' + h.id;
        link.textContent = (h.textContent || '').replace(/#$/, '').trim();
        if (h.tagName === 'H3') link.className = 'toc-h3';
        li.appendChild(link);
        list.appendChild(li);
      });

      tocBox.appendChild(list);
    } else {
      tocBox.classList.add('is-empty');
    }
  }

  /* --- 7. Scrollspy: highlight the heading you're reading ----------------- */
  if (headings.length && tocBox && 'IntersectionObserver' in window) {
    var tocLinks = {};
    tocBox.querySelectorAll('a').forEach(function (a) {
      tocLinks[a.getAttribute('href').slice(1)] = a;
    });

    var visible = new Set();
    var setActive = function () {
      var best = null;
      headings.forEach(function (h) { if (visible.has(h.id) && best === null) best = h.id; });
      Object.keys(tocLinks).forEach(function (id) {
        tocLinks[id].classList.toggle('is-active', id === best);
      });
    };

    var spy = new IntersectionObserver(function (entries) {
      entries.forEach(function (entry) {
        if (entry.isIntersecting) visible.add(entry.target.id);
        else visible.delete(entry.target.id);
      });
      setActive();
    }, { rootMargin: '-80px 0px -70% 0px', threshold: 0 });

    headings.forEach(function (h) { spy.observe(h); });
  }

  /* --- 8. Reading progress ------------------------------------------------ */
  (function () {
    var bar = document.querySelector('#read-progress span');
    if (!bar) return;
    var tick = function () {
      var max = document.documentElement.scrollHeight - window.innerHeight;
      var pct = max > 0 ? Math.min(1, window.scrollY / max) : 0;
      bar.style.transform = 'scaleX(' + pct + ')';
    };
    var queued = false;
    window.addEventListener('scroll', function () {
      if (queued) return;
      queued = true;
      requestAnimationFrame(function () { tick(); queued = false; });
    }, { passive: true });
    tick();
  })();

  /* --- 9. Reveal on scroll ------------------------------------------------ */
  // Blocks rise into place the first time they are seen. Anything below the
  // fold starts hidden; anything already on screen is shown immediately, so a
  // reader who never scrolls is never looking at a blank page.
  (function () {
    var targets = document.querySelectorAll('.reveal, .content > h2, .content > p, .content > .callout, ' +
      '.content > .example, .content > .code-block, .content > figure, .content > .card-grid, ' +
      '.content > .table-wrap, .content > .compare, .content > .recap, .content > details, ' +
      '.topic-body > h2, .topic-body > h3, .topic-body > p, .topic-body > .callout, ' +
      '.topic-body > .example, .topic-body > .code-block, .topic-body > figure, ' +
      '.topic-body > .card-grid, .topic-body > .table-wrap, .topic-body > .compare, ' +
      '.topic-body > .recap, .topic-body > details');

    if (!targets.length) return;
    if (REDUCED || !('IntersectionObserver' in window)) {
      targets.forEach(function (t) { t.classList.add('is-in'); });
      return;
    }

    targets.forEach(function (t) { t.classList.add('will-reveal'); });

    var io = new IntersectionObserver(function (entries) {
      entries.forEach(function (entry) {
        if (!entry.isIntersecting) return;
        entry.target.classList.add('is-in');
        io.unobserve(entry.target);
      });
    }, { rootMargin: '0px 0px -8% 0px', threshold: 0.02 });

    targets.forEach(function (t) { io.observe(t); });
  })();

  /* --- 10. Diagrams: animate on first view, replay on demand -------------- */
  (function () {
    var figures = document.querySelectorAll('.figure-stage');
    if (!figures.length) return;

    var run = function (stage) {
      var fig = stage.closest('.figure');
      stage.classList.remove('is-animating');
      if (fig) fig.classList.remove('is-revealed');
      // Force a reflow so re-adding the class restarts the CSS animations.
      void stage.offsetWidth;
      stage.classList.add('is-animating');
      if (fig) fig.classList.add('is-revealed');
    };

    if ('IntersectionObserver' in window) {
      var seen = new IntersectionObserver(function (entries) {
        entries.forEach(function (entry) {
          if (entry.isIntersecting) { run(entry.target); seen.unobserve(entry.target); }
        });
      }, { threshold: 0.25 });
      figures.forEach(function (f) { seen.observe(f); });
    } else {
      figures.forEach(run);
    }

    document.querySelectorAll('.replay-btn').forEach(function (btn) {
      btn.addEventListener('click', function () {
        var fig = btn.closest('.figure');
        var stage = fig && fig.querySelector('.figure-stage');
        if (stage) run(stage);
      });
    });
  })();

  /* --- 11. Lightweight syntax tinting ------------------------------------- */
  // ONE pass, with alternation. Sequential .replace() calls cannot work here:
  // a later pass matches the markup an earlier one just emitted — a quoted
  // class="tok-com" looks exactly like a string literal — which corrupts every
  // block containing a comment. With a single alternation, whichever branch
  // starts earliest in the text wins, so a # inside a string and a quote
  // inside a comment both behave correctly.
  (function () {
    var COMMENT = '(\\/\\/[^\\n]*|#[^\\n]*)';
    var STRING  = '("\u0022"[\\s\\S]*?"\u0022"|`[^`]*`|\'[^\'\\n]*\'|"[^"\\n]*")';
    var NUMBER  = '\\b(\\d+\\.?\\d*)\\b';
    var KEYWORD = '\\b(def|class|return|import|from|as|if|elif|else|for|while|'
                + 'in|not|and|or|is|None|True|False|try|except|finally|with|'
                + 'yield|lambda|async|await|pass|raise|const|let|var|function|'
                + 'new|export|default|type|interface|enum|throw|catch|switch|'
                + 'case|break|continue|extends|implements|public|private|readonly)\\b';

    var PATTERN = new RegExp([COMMENT, STRING, NUMBER, KEYWORD].join('|'), 'g');

    document.querySelectorAll('pre code').forEach(function (block) {
      var escaped = block.textContent
        .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

      block.innerHTML = escaped.replace(PATTERN, function (m, com, str, num, kw) {
        if (com) return '<span class="tok-com">' + com + '</span>';
        if (str) return '<span class="tok-str">' + str + '</span>';
        if (num) return '<span class="tok-num">' + num + '</span>';
        if (kw)  return '<span class="tok-kw">' + kw + '</span>';
        return m;
      });
    });
  })();

  /* --- 12. Copy a code block ---------------------------------------------- */
  (function () {
    var COPY = svg('<rect x="9" y="9" width="12" height="12" rx="2"/>' +
                   '<path d="M5 15V5a2 2 0 0 1 2-2h10"/>', 1.9);
    var TICK = svg('<path d="m20 6-11 11-5-5"/>', 2.4);

    document.querySelectorAll('.code-block pre, .compare-pane pre').forEach(function (pre) {
      var btn = document.createElement('button');
      btn.className = 'copy-btn';
      btn.type = 'button';
      btn.innerHTML = COPY;
      btn.setAttribute('aria-label', 'Copy this code');

      btn.addEventListener('click', function () {
        var code = pre.querySelector('code');
        var text = (code || pre).textContent;
        var done = function (ok) {
          btn.innerHTML = ok ? TICK : COPY;
          btn.classList.toggle('is-done', ok);
          btn.setAttribute('aria-label', ok ? 'Copied' : 'Copy this code');
          if (ok) setTimeout(function () {
            btn.innerHTML = COPY;
            btn.classList.remove('is-done');
            btn.setAttribute('aria-label', 'Copy this code');
          }, 1600);
        };

        if (navigator.clipboard && window.isSecureContext) {
          navigator.clipboard.writeText(text).then(function () { done(true); }, function () { done(false); });
        } else {
          // file:// and plain http have no clipboard API. Select it instead so
          // the reader can still copy with one keystroke.
          var range = document.createRange();
          range.selectNodeContents(code || pre);
          var sel = window.getSelection();
          sel.removeAllRanges(); sel.addRange(range);
          try { done(document.execCommand('copy')); } catch (e) { done(false); }
        }
      });

      pre.parentNode.insertBefore(btn, pre);
    });
  })();

  /* --- 13. Counting up the hero numbers ----------------------------------- */
  (function () {
    var nums = document.querySelectorAll('[data-count]');
    if (!nums.length) return;

    var run = function (el) {
      var target = Number(el.getAttribute('data-count')) || 0;
      var suffix = el.getAttribute('data-suffix') || '';
      if (REDUCED) { el.textContent = target + suffix; return; }

      var started = null;
      var step = function (now) {
        if (started === null) started = now;
        var p = Math.min(1, (now - started) / 900);
        // Ease out, so it decelerates into the final number.
        var eased = 1 - Math.pow(1 - p, 3);
        el.textContent = Math.round(target * eased) + suffix;
        if (p < 1) requestAnimationFrame(step);
      };
      requestAnimationFrame(step);
    };

    if ('IntersectionObserver' in window) {
      var io = new IntersectionObserver(function (entries) {
        entries.forEach(function (e) {
          if (e.isIntersecting) { run(e.target); io.unobserve(e.target); }
        });
      }, { threshold: 0.4 });
      nums.forEach(function (n) { io.observe(n); });
    } else {
      nums.forEach(run);
    }
  })();

  /* --- 14. Previous / next by keyboard ------------------------------------ */
  document.addEventListener('keydown', function (e) {
    if (e.metaKey || e.ctrlKey || e.altKey) return;
    var tag = (document.activeElement.tagName || '').toLowerCase();
    if (tag === 'input' || tag === 'textarea') return;

    var go = e.key === '[' ? '.pn-prev' : e.key === ']' ? '.pn-next' : null;
    if (!go) return;
    var link = document.querySelector(go);
    if (link && link.href) location.href = link.href;
  });

  /* --- 14b. Search on a small screen --------------------------------------- */
  // The field would be about 90px wide next to the other controls, so below
  // the breakpoint it becomes a button that opens a full-width bar.
  (function () {
    var wrap = document.querySelector('.search-wrap');
    var field = document.getElementById('search');
    if (!wrap || !field) return;

    var small = window.matchMedia('(max-width: 760px)');
    var close = function () {
      document.body.classList.remove('search-open');
      var s = document.querySelector('.search-scrim');
      if (s) s.remove();
    };

    wrap.addEventListener('click', function (e) {
      if (!small.matches) return;
      if (document.body.classList.contains('search-open')) return;
      // Collapsed: the whole wrap is the button.
      e.preventDefault();
      document.body.classList.add('search-open');
      var scrim = document.createElement('div');
      scrim.className = 'search-scrim';
      scrim.addEventListener('click', close);
      document.body.appendChild(scrim);
      field.focus();
    });

    field.addEventListener('keydown', function (e) { if (e.key === 'Escape') close(); });
    // Following a result closes it; so does leaving the small breakpoint.
    document.addEventListener('click', function (e) {
      if (e.target.closest('.search-results a')) close();
    });
    small.addEventListener('change', function (m) { if (!m.matches) close(); });
  })();

  /* --- 15. Search ---------------------------------------------------------- */
  var escapeHtml = function (t) {
    return String(t).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  };

  var INDEX = [];
  (window.GN_MODULES || []).forEach(function (m) {
    INDEX.push({
      section: m.title, title: m.topics.length + ' topics \u00b7 whole note',
      url: 'notes/' + m.slug + '/index.html', keywords: m.label + ' ' + m.blurb, kind: 'note',
    });
  });
  (window.GN_SECTIONS || []).forEach(function (s) {
    INDEX.push({
      section: s.section, title: s.note,
      url: 'notes/' + s.slug + '/' + s.topic + '.html',
      keywords: s.note + ' ' + s.noteTitle, text: s.text || '', kind: 'topic',
    });
  });

  var input = document.getElementById('search');
  var out = document.getElementById('search-results');

  if (input && out && INDEX.length) {
    var hits = [];
    var cursor = -1;
    var hide = function () { out.innerHTML = ''; out.hidden = true; cursor = -1; };

    var render = function (q) {
      var needle = q.trim().toLowerCase();
      if (needle.length < 2) return hide();

      // Rank by where the match lands: a heading beats a mention in the prose,
      // and one note whose *title* contains the word must not drown out the
      // topic actually about it.
      hits = INDEX.map(function (item) {
        var heading = item.section.toLowerCase();
        var pos = heading.indexOf(needle);
        var score = -1, at = -1;
        if (pos === 0) score = 0;
        else if (pos > 0) score = 1;
        else if ((item.text || '').toLowerCase().indexOf(needle) !== -1) {
          score = 2; at = item.text.toLowerCase().indexOf(needle);
        } else if (item.keywords.toLowerCase().indexOf(needle) !== -1) {
          score = 3;
        }
        return { item: item, score: score, at: at };
      }).filter(function (r) { return r.score >= 0; })
        .sort(function (a, b) { return a.score - b.score; })
        .slice(0, 9);

      if (!hits.length) {
        out.innerHTML = '<div class="search-empty">No matches for &ldquo;' +
          escapeHtml(needle) + '&rdquo;</div>';
        out.hidden = false;
        return;
      }

      var mark = function (s, i, n) {
        return escapeHtml(s.slice(0, i)) + '<mark>' + escapeHtml(s.slice(i, i + n)) +
               '</mark>' + escapeHtml(s.slice(i + n));
      };

      out.innerHTML = hits.map(function (hit) {
        var item = hit.item;
        var at = item.section.toLowerCase().indexOf(needle);
        var heading = at !== -1 ? mark(item.section, at, needle.length) : escapeHtml(item.section);

        // A prose match shows the sentence it was found in — otherwise the
        // result is a heading that does not visibly contain the search term.
        var meta = escapeHtml(item.title);
        if (hit.at >= 0) {
          var from = Math.max(0, hit.at - 45);
          var snip = item.text.slice(from, from + 130);
          meta = escapeHtml(item.title) + ' &mdash; ' + (from > 0 ? '&hellip;' : '') +
                 mark(snip, hit.at - from, needle.length) + '&hellip;';
        }
        return '<a href="' + BASE + item.url + '">' +
               '<span class="sr-kind sr-' + item.kind + '">' + (item.kind === 'note' ? 'Note' : 'Topic') + '</span>' +
               '<span class="sr-title">' + heading + '</span>' +
               '<span class="sr-meta">' + meta + '</span></a>';
      }).join('');
      out.hidden = false;
      cursor = -1;
    };

    input.addEventListener('input', function () { render(input.value); });
    input.addEventListener('focus', function () { if (input.value) render(input.value); });

    input.addEventListener('keydown', function (e) {
      var links = out.querySelectorAll('a');
      if (e.key === 'Escape') { hide(); input.blur(); return; }
      if (!links.length) return;

      if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
        e.preventDefault();
        cursor += (e.key === 'ArrowDown' ? 1 : -1);
        if (cursor < 0) cursor = links.length - 1;
        if (cursor >= links.length) cursor = 0;
        links.forEach(function (l, i) { l.classList.toggle('is-active', i === cursor); });
        links[cursor].scrollIntoView({ block: 'nearest' });
      } else if (e.key === 'Enter' && cursor >= 0) {
        e.preventDefault();
        links[cursor].click();
      }
    });

    document.addEventListener('click', function (e) {
      if (!out.contains(e.target) && e.target !== input) hide();
    });

    // "/" focuses search from anywhere.
    document.addEventListener('keydown', function (e) {
      if (e.key === '/' && document.activeElement !== input) {
        var tag = (document.activeElement.tagName || '').toLowerCase();
        if (tag === 'input' || tag === 'textarea') return;
        e.preventDefault();
        input.focus();
      }
    });
  } else if (input) {
    input.placeholder = 'Search';
  }
})();

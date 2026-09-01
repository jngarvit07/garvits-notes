/* ==========================================================================
   Garvit's Notes — site behaviour
   No dependencies. Every block is defensive so a missing element on one page
   never breaks the rest of the page.
   ========================================================================== */
(function () {
  'use strict';

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
        var systemDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
        current = systemDark ? 'dark' : 'light';
      }
      var next = current === 'dark' ? 'light' : 'dark';
      root.setAttribute('data-theme', next);
      try { localStorage.setItem('gn-theme', next); } catch (e) { /* private mode */ }
    });
  }

  /* --- 2. Mobile sidebar -------------------------------------------------- */
  var navBtn  = document.getElementById('nav-toggle');
  var sidebar = document.querySelector('.sidebar');
  if (navBtn && sidebar) {
    var scrim = null;
    var closeNav = function () {
      sidebar.classList.remove('is-open');
      if (scrim) { scrim.remove(); scrim = null; }
    };
    navBtn.addEventListener('click', function () {
      var open = sidebar.classList.toggle('is-open');
      if (open) {
        scrim = document.createElement('div');
        scrim.className = 'nav-scrim';
        scrim.addEventListener('click', closeNav);
        document.body.appendChild(scrim);
      } else {
        closeNav();
      }
    });
    document.addEventListener('keydown', function (e) {
      if (e.key === 'Escape') closeNav();
    });
  }

  /* --- 3. Render the sidebar from the generated catalogue ----------------- */
  // One list of notes (site-data.js) drives the sidebar, the search and the
  // homepage cards, so they cannot drift apart.
  (function () {
    var host = document.getElementById('sidebar');
    if (!host || !window.GN_MODULES) return;

    var base = document.body.getAttribute('data-base') || '';
    var here = (location.pathname.split('/').pop() || 'index.html').replace(/\.html$/, '');

    var html = '<div class="side-heading">Start here</div>' +
      '<ul class="side-nav"><li><a href="' + base + 'index.html"' +
      (here === 'index' || here === '' ? ' class="is-current"' : '') +
      '><span class="side-num">&#9737;</span><span>Overview</span></a></li></ul>' +
      '<div class="side-heading">The notes</div><ul class="side-nav">';

    window.GN_MODULES.forEach(function (m) {
      var current = m.slug === here;
      html += '<li><a href="' + base + 'notes/' + m.slug + '.html"' +
              (current ? ' class="is-current"' : '') + '>' +
              '<span class="side-num">' + m.n + '</span>' +
              '<span>' + m.label + '</span></a>';

      // The open note expands into its own sections, so the sidebar doubles as
      // a map of where you are rather than only a list of where you could go.
      if (current && window.GN_SECTIONS) {
        var mine = window.GN_SECTIONS.filter(function (s) { return s.slug === m.slug; });
        if (mine.length) {
          html += '<ul class="side-sub">';
          mine.forEach(function (s) {
            html += '<li><a href="' + s.hash + '">' + s.section + '</a></li>';
          });
          html += '</ul>';
        }
      }
      html += '</li>';
    });

    host.innerHTML = html + '</ul>';
  })();

  /* --- 4. Build the table of contents from the headings ------------------- */
  var tocBox = document.getElementById('toc');
  var article = document.querySelector('.content');
  var headings = [];

  if (tocBox && article) {
    headings = Array.prototype.slice.call(article.querySelectorAll('h2, h3'));

    if (headings.length) {
      var list = document.createElement('ul');

      headings.forEach(function (h, i) {
        if (!h.id) {
          h.id = (h.textContent || '')
            .toLowerCase()
            .replace(/[^\w\s-]/g, '')
            .trim()
            .replace(/\s+/g, '-') || ('section-' + i);
        }

        // Clickable ¶ anchor next to the heading itself.
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
      tocBox.style.display = 'none';
    }
  }

  /* --- 5. Scrollspy: highlight the heading you're reading ----------------- */
  if (headings.length && tocBox && 'IntersectionObserver' in window) {
    var tocLinks = {};
    tocBox.querySelectorAll('a').forEach(function (a) {
      tocLinks[a.getAttribute('href').slice(1)] = a;
    });

    var visible = new Set();
    var setActive = function () {
      var best = null;
      headings.forEach(function (h) {
        if (visible.has(h.id) && best === null) best = h.id;
      });
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

  /* --- 6. Diagrams: animate on first view, replay on demand --------------- */
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
          if (entry.isIntersecting) {
            run(entry.target);
            seen.unobserve(entry.target);
          }
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

  /* --- 7. Lightweight syntax tinting -------------------------------------- */
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
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;');

      block.innerHTML = escaped.replace(PATTERN, function (m, com, str, num, kw) {
        if (com) return '<span class="tok-com">' + com + '</span>';
        if (str) return '<span class="tok-str">' + str + '</span>';
        if (num) return '<span class="tok-num">' + num + '</span>';
        if (kw)  return '<span class="tok-kw">' + kw + '</span>';
        return m;
      });
    });
  })();

  /* --- 8. Search ---------------------------------------------------------- */
  // A hand-maintained index. Every new note page adds an entry here.
  var escapeHtml = function (t) {
    return String(t).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  };

  var INDEX = [];
  (window.GN_MODULES || []).forEach(function (m) {
    INDEX.push({
      section: m.title, title: m.minutes + ' min \u00b7 whole note',
      url: 'notes/' + m.slug + '.html', keywords: m.label + ' ' + m.blurb
    });
  });
  (window.GN_SECTIONS || []).forEach(function (s) {
    INDEX.push({
      section: s.section, title: s.note,
      url: 'notes/' + s.slug + '.html' + s.hash,
      keywords: s.note, text: s.text || ''
    });
  });
  var input = document.getElementById('search');
  var out   = document.getElementById('search-results');

  if (input && out && INDEX.length) {
    var base = document.body.getAttribute('data-base') || '';
    var hits = [];
    var cursor = -1;

    var hide = function () { out.innerHTML = ''; out.hidden = true; cursor = -1; };

    var render = function (q) {
      var needle = q.trim().toLowerCase();
      if (needle.length < 2) return hide();

      // Rank by where the match lands. Without this, one note whose *title*
      // contains the word ("AI, Models, RAG & Security") drowns out the one
      // section actually about it.
      // Rank by where the match lands: a heading beats a mention in the prose,
      // and one note whose *title* contains the word must not drown out the
      // section actually about it.
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
        .slice(0, 8);

      if (!hits.length) {
        out.innerHTML = '<div class="search-empty">No matches for &ldquo;' +
          needle.replace(/</g, '&lt;') + '&rdquo;</div>';
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
          meta = escapeHtml(item.title) + ' &mdash; ' +
                 (from > 0 ? '&hellip;' : '') +
                 mark(snip, hit.at - from, needle.length) + '&hellip;';
        }
        return '<a href="' + base + item.url + '">' +
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

// js/debug.js

(function () {
  'use strict';

  // Active on localhost, private network addresses, or when the URL has ?debug=1.
  // Add ?debug=0 to switch it off.
  var host = location.hostname;
  var qs = location.search;
  var on =
    /(^|[?&])debug=1/.test(qs) ||
    host === 'localhost' ||
    host === '127.0.0.1' ||
    /^(192\.168\.|10\.|172\.(1[6-9]|2\d|3[01])\.)/.test(host);
  if (/(^|[?&])debug=0/.test(qs)) on = false;
  if (!on) return;

  var MAX = 150;
  var entries = [];
  var ui = null;
  var open = false;
  var checking = false;
  var autoChecked = false;

  var IMPORT_FAILURE =
    /dynamically imported module|does not provide an export|Importing a module script failed|Failed to resolve module specifier/i;

  function str(v) {
    try {
      if (v instanceof Error) return v.stack || v.message || String(v);
      if (typeof v === 'string') return v;
      var s = JSON.stringify(v);
      return s === undefined ? String(v) : s;
    } catch (e) {
      return String(v);
    }
  }

  function time() {
    var d = new Date();
    function p(n) { return (n < 10 ? '0' : '') + n; }
    return p(d.getHours()) + ':' + p(d.getMinutes()) + ':' + p(d.getSeconds());
  }

  function add(kind, msg, where) {
    var last = entries[entries.length - 1];
    if (last && last.kind === kind && last.msg === msg && last.where === where) {
      last.count++;
      last.time = time();
    } else {
      entries.push({ kind: kind, msg: msg, where: where || '', time: time(), count: 1 });
      if (entries.length > MAX) entries.shift();
    }
    update();
    // An import failure usually means more files are broken: check them all, once.
    if (kind !== 'info' && !autoChecked && IMPORT_FAILURE.test(msg)) {
      autoChecked = true;
      setTimeout(checkProject, 300);
    }
  }

  function colorFor(kind) {
    if (kind === 'warn') return '#f59e0b';
    if (kind === 'info') return '#22c55e';
    return '#ef4444';
  }

  // ---------- Project checker ----------

  var BASE = new URL('./', location.href).href;

  function label(url) {
    return url.indexOf(BASE) === 0 ? url.slice(BASE.length) : url;
  }

  async function loadText(url) {
    try {
      var res = await fetch(url, { cache: 'no-store' });
      if (!res.ok) return null;
      var type = res.headers.get('content-type') || '';
      // Some servers answer unknown paths with the home page instead of an error
      if (/text\/html/i.test(type)) return null;
      return await res.text();
    } catch (e) {
      return null;
    }
  }

  function parseModule(src) {
    var imports = [];
    var dynamics = [];
    var names = {};
    var m;

    var importRe = /^\s*import\s+(?:([^'"\n;]+?)\s+from\s+)?['"]([^'"]+)['"]/gm;
    while ((m = importRe.exec(src))) imports.push({ clause: m[1] || '', spec: m[2] });

    var reexportRe = /^\s*export\s+(?:\*|\{[^}]*\})\s+from\s+['"]([^'"]+)['"]/gm;
    while ((m = reexportRe.exec(src))) imports.push({ clause: '', spec: m[1] });

    var dynamicRe = /import\(\s*['"]([^'"]+)['"]\s*\)/g;
    while ((m = dynamicRe.exec(src))) dynamics.push(m[1]);

    var declRe = /^\s*export\s+(?:async\s+)?(?:function\*?|const|let|class)\s+([A-Za-z_$][\w$]*)/gm;
    while ((m = declRe.exec(src))) names[m[1]] = true;

    var listRe = /^\s*export\s*\{([^}]*)\}(?!\s*from)/gm;
    while ((m = listRe.exec(src))) {
      m[1].split(',').forEach(function (part) {
        var n = part.trim().split(/\s+as\s+/).pop();
        if (n) names[n] = true;
      });
    }

    if (/^\s*export\s+default/m.test(src)) names['default'] = true;
    return { imports: imports, dynamics: dynamics, names: names };
  }

  function isLocal(spec) {
    return spec.charAt(0) === '.' || spec.charAt(0) === '/';
  }

  async function checkProject() {
    if (checking) return;
    checking = true;
    open = true;
    add('info', 'Checking files...', '');

    var problems = 0;
    var notBuilt = [];
    var seen = {};
    var parsed = {};
    var queue = [{ url: new URL('js/main.js', location.href).href, from: 'index.html', dynamic: false }];
    var fileCount = 0;

    // Pass 1: load every file reachable from main.js
    while (queue.length) {
      var item = queue.shift();
      if (seen[item.url]) continue;
      seen[item.url] = true;

      var text = await loadText(item.url);
      if (text === null) {
        parsed[item.url] = null;
        if (item.dynamic) {
          notBuilt.push(label(item.url));
        } else {
          problems++;
          add(
            'error',
            'MISSING FILE: ' + label(item.url),
            'Imported by ' + label(item.from) +
              '. Check that the file exists and the upper/lower case of its name matches exactly.'
          );
        }
        continue;
      }

      fileCount++;
      var mod = parseModule(text);
      parsed[item.url] = mod;

      mod.imports.forEach(function (imp) {
        if (isLocal(imp.spec)) queue.push({ url: new URL(imp.spec, item.url).href, from: item.url, dynamic: false });
      });
      mod.dynamics.forEach(function (spec) {
        if (isLocal(spec)) queue.push({ url: new URL(spec, item.url).href, from: item.url, dynamic: true });
      });
    }

    // Pass 2: every named import must exist in the file it comes from
    Object.keys(parsed).forEach(function (url) {
      var mod = parsed[url];
      if (!mod) return;
      mod.imports.forEach(function (imp) {
        if (!isLocal(imp.spec)) return;
        var target = parsed[new URL(imp.spec, url).href];
        if (!target) return;
        var named = imp.clause.match(/\{([^}]*)\}/);
        if (!named) return;
        named[1].split(',').forEach(function (item) {
          var name = item.trim().split(/\s+as\s+/)[0];
          if (name && !target.names[name]) {
            problems++;
            add(
              'error',
              'MISSING EXPORT: "' + name + '" is not exported by ' + label(new URL(imp.spec, url).href),
              'Imported by ' + label(url) + '. The file may be cut off or an older copy.'
            );
          }
        });
      });
    });

    var summary = 'Checked ' + fileCount + ' files: ' + (problems ? problems + ' problem(s) found.' : 'no problems found.');
    if (notBuilt.length) summary += ' Not built yet: ' + notBuilt.join(', ');
    add(problems ? 'warn' : 'info', summary, '');

    checking = false;
    open = true;
    update();
  }

  // ---------- Panel ----------

  function build() {
    if (ui || !document.body) return;

    var badge = document.createElement('button');
    badge.type = 'button';
    badge.setAttribute('aria-label', 'Show error console');
    badge.style.cssText =
      'position:fixed;top:calc(env(safe-area-inset-top,0px) + 8px);right:8px;' +
      'z-index:2147483647;min-height:44px;padding:0 14px;border:0;border-radius:999px;' +
      'background:#ef4444;color:#fff;font:600 13px/1 system-ui,sans-serif;' +
      'box-shadow:0 4px 16px rgba(0,0,0,.5);display:none;';

    var panel = document.createElement('div');
    panel.style.cssText =
      'position:fixed;inset:0;z-index:2147483647;display:none;flex-direction:column;' +
      'background:#0b0b0d;color:#fafafa;font:12px/1.45 ui-monospace,Menlo,Consolas,monospace;';

    var bar = document.createElement('div');
    bar.style.cssText =
      'display:flex;flex-wrap:wrap;gap:6px;align-items:center;' +
      'padding:calc(env(safe-area-inset-top,0px) + 8px) 8px 8px;border-bottom:1px solid #27272a;';

    var title = document.createElement('div');
    title.style.cssText = 'flex:1;min-width:90px;font:600 14px system-ui,sans-serif;';
    title.textContent = 'Console';

    function btn(text, fn) {
      var b = document.createElement('button');
      b.type = 'button';
      b.textContent = text;
      b.style.cssText =
        'min-height:44px;padding:0 12px;border:1px solid #3f3f46;border-radius:12px;' +
        'background:#18181b;color:#fafafa;font:500 13px system-ui,sans-serif;';
      b.addEventListener('click', fn);
      return b;
    }

    var list = document.createElement('div');
    list.style.cssText = 'flex:1;overflow:auto;padding:8px;-webkit-overflow-scrolling:touch;';

    bar.appendChild(title);
    bar.appendChild(btn('Check files', checkProject));
    bar.appendChild(btn('Copy', copyAll));
    bar.appendChild(btn('Clear', function () { entries.length = 0; update(); }));
    bar.appendChild(btn('Close', function () { open = false; update(); }));
    panel.appendChild(bar);
    panel.appendChild(list);

    badge.addEventListener('click', function () { open = true; update(); });

    document.body.appendChild(badge);
    document.body.appendChild(panel);
    ui = { badge: badge, panel: panel, list: list };
  }

  function dump() {
    return entries
      .map(function (e) {
        return '[' + e.time + '] ' + e.kind.toUpperCase() + (e.count > 1 ? ' x' + e.count : '') + '\n' + e.msg + (e.where ? '\n' + e.where : '');
      })
      .join('\n\n');
  }

  function copyAll() {
    var text = dump();
    function fallback() {
      var ta = document.createElement('textarea');
      ta.value = text;
      ta.style.cssText = 'position:fixed;top:0;left:0;opacity:0;';
      document.body.appendChild(ta);
      ta.select();
      try { document.execCommand('copy'); } catch (e) {}
      document.body.removeChild(ta);
    }
    if (navigator.clipboard && navigator.clipboard.writeText) navigator.clipboard.writeText(text).catch(fallback);
    else fallback();
  }

  function update() {
    if (!ui) build();
    if (!ui) return;

    var errs = 0;
    var warns = 0;
    entries.forEach(function (e) {
      if (e.kind === 'info') return;
      if (e.kind === 'warn') warns += e.count;
      else errs += e.count;
    });

    ui.badge.style.display = !open && (errs || warns) ? 'block' : 'none';
    ui.badge.style.background = errs ? '#ef4444' : '#f59e0b';
    ui.badge.textContent = errs + ' err' + (warns ? ' / ' + warns + ' warn' : '');
    ui.panel.style.display = open ? 'flex' : 'none';

    if (!open) return;
    ui.list.textContent = '';
    if (!entries.length) {
      var none = document.createElement('div');
      none.style.cssText = 'padding:16px;color:#a1a1aa;';
      none.textContent = 'Nothing logged. Tap Check files to scan the project.';
      ui.list.appendChild(none);
      return;
    }
    for (var i = entries.length - 1; i >= 0; i--) {
      var e = entries[i];
      var item = document.createElement('div');
      item.style.cssText = 'margin-bottom:8px;padding:10px;border-radius:12px;background:#18181b;border-left:3px solid ' + colorFor(e.kind) + ';';
      var head = document.createElement('div');
      head.style.cssText = 'color:' + colorFor(e.kind) + ';font-weight:700;margin-bottom:4px;';
      head.textContent = e.kind.toUpperCase() + '  ' + e.time + (e.count > 1 ? '  x' + e.count : '');
      var body = document.createElement('div');
      body.style.cssText = 'white-space:pre-wrap;word-break:break-word;';
      body.textContent = e.msg + (e.where ? '\n' + e.where : '');
      item.appendChild(head);
      item.appendChild(body);
      ui.list.appendChild(item);
    }
  }

  // Runtime errors and failed resource loads (capture phase sees script/link/img failures)
  window.addEventListener(
    'error',
    function (e) {
      var t = e.target;
      if (t && t !== window && t.tagName) {
        add('resource', 'Failed to load <' + t.tagName.toLowerCase() + '> ' + (t.src || t.href || ''), '');
        return;
      }
      add(
        'error',
        e.message || 'Script error',
        (e.filename || '') + ':' + (e.lineno || 0) + ':' + (e.colno || 0) + (e.error && e.error.stack ? '\n' + e.error.stack : '')
      );
    },
    true
  );

  window.addEventListener('unhandledrejection', function (e) {
    add('promise', str(e.reason), '');
  });

  // Mirror console.error and console.warn
  ['error', 'warn'].forEach(function (level) {
    var original = console[level];
    console[level] = function () {
      try { add(level, Array.prototype.map.call(arguments, str).join(' '), ''); } catch (e) {}
      return original.apply(console, arguments);
    };
  });

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', update);
  else update();
})();

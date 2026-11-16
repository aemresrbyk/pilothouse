// The phone page served by remote.ts. Plain HTML + JS so it needs no build step on the phone.
// Terminal text is untrusted (agents print whatever a repo contains), so it only ever goes in through textContent.
export const REMOTE_PAGE = `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
<meta name="apple-mobile-web-app-capable" content="yes">
<meta name="theme-color" content="#0B0D10">
<title>Pilothouse</title>
<link rel="manifest" href="manifest.json">
<link rel="apple-touch-icon" href="icon.png">
<meta name="apple-mobile-web-app-title" content="Pilothouse">
<style>
  :root { --bg:#0B0D10; --card:#12161f; --line:#232a3a; --text:#e4e7ee; --dim:#7b8496; --lime:#C8FF2E; --red:#ff5c5c; --amber:#ffc24a; }
  * { box-sizing: border-box; }
  body { margin:0; background:var(--bg); color:var(--text); font:15px/1.4 -apple-system, system-ui, sans-serif; padding:16px 16px calc(16px + env(safe-area-inset-bottom)); }
  h1 { font-size:17px; margin:0 0 12px; display:flex; align-items:center; gap:8px; }
  h1 b { color:var(--lime); }
  #notify { margin-left:auto; min-height:32px; padding:4px 10px; font-size:13px; }
  #msg { color:var(--dim); font-size:13px; margin-bottom:10px; }
  .card { background:var(--card); border:1px solid var(--line); border-radius:12px; padding:12px; margin-bottom:12px; }
  .card.waiting { border-color:var(--amber); }
  .head { display:flex; justify-content:space-between; align-items:center; gap:8px; }
  .name { font-weight:600; overflow:hidden; text-overflow:ellipsis; white-space:nowrap; }
  .pill { font-size:12px; padding:2px 8px; border-radius:99px; border:1px solid var(--line); color:var(--dim); flex-shrink:0; }
  .pill.waiting { color:var(--amber); border-color:var(--amber); }
  .pill.running { color:var(--lime); border-color:var(--lime); }
  pre { background:#07090c; border-radius:8px; padding:8px; margin:10px 0 0; font:12px/1.35 ui-monospace, Menlo, monospace; white-space:pre-wrap; word-break:break-word; max-height:40vh; overflow:auto; color:#c9cfdb; }
  .danger { margin-top:10px; padding:8px; border-radius:8px; background:#2a1213; color:var(--red); font-size:13px; }
  .choices { display:flex; flex-direction:column; gap:6px; margin-top:10px; }
  button { font:inherit; color:var(--text); background:#1a2030; border:1px solid var(--line); border-radius:10px; padding:10px 12px; text-align:left; min-height:44px; }
  button.primary { background:var(--lime); color:#0B0D10; border-color:var(--lime); font-weight:600; }
  button.armed { background:var(--red); color:#fff; border-color:var(--red); }
  .row { display:flex; gap:6px; margin-top:10px; }
  input, textarea { resize:none; flex:1; min-width:0; font:inherit; color:var(--text); background:#07090c; border:1px solid var(--line); border-radius:10px; padding:10px; min-height:44px; }
  .row button { flex-shrink:0; text-align:center; }
  h2 { font-size:14px; color:var(--dim); margin:20px 0 8px; font-weight:600; }
  .proj { display:flex; justify-content:space-between; align-items:center; gap:8px; padding:6px 0 6px 12px; }
  details summary { color:var(--dim); font-size:13px; margin-top:8px; }
  #term { position:fixed; inset:0; background:var(--bg); display:flex; flex-direction:column; padding:calc(10px + env(safe-area-inset-top)) 10px calc(10px + env(safe-area-inset-bottom)); z-index:10; }
  #term[hidden] { display:none; }
  #term .head { margin-bottom:8px; }
  #scr { flex:1; margin:0; max-height:none; white-space:pre; overflow:auto; line-height:1.25; }
  #scr .cur { background:var(--lime); color:#0B0D10; }
  .keys { display:flex; gap:6px; overflow-x:auto; margin-top:8px; padding-bottom:2px; }
  .keys button { flex-shrink:0; min-width:48px; text-align:center; font:13px ui-monospace, Menlo, monospace; padding:8px 10px; }
</style>
</head>
<body>
<h1><b>●</b> Pilothouse <button id="notify" hidden></button></h1>
<div id="msg">Connecting…</div>
<div id="list"></div>
<h2 id="ptitle" hidden>Projects</h2>
<div id="projects"></div>
<div id="term" hidden>
  <div class="head"><span class="name" id="tname"></span><button id="tclose">Close</button></div>
  <pre id="scr"></pre>
  <div class="keys" id="tkeys"></div>
  <div class="row"><textarea id="tin" rows="1" placeholder="Type, then Send (Shift+Enter: new line)"></textarea><button id="tsend">Send</button></div>
</div>
<script>
(function () {
  var KEY = 'pilothouse-device-token';
  var token = (function () { try { return localStorage.getItem(KEY); } catch (e) { return null; } })();
  // The QR carries a pairing code; trade it once for this browser's own token, then drop it from the address bar.
  var pair = /[#&]p=([0-9a-f]+)/.exec(location.hash);
  var relayLink = /[#&]r=([0-9a-f]{32})/.exec(location.hash);
  history.replaceState(null, '', location.pathname);
  var msg = document.getElementById('msg'), list = document.getElementById('list');
  var armed = {}; // session id -> choice key armed for a risky approval
  var last = '', lastProj = '';
  var diffOpen = false; // re-rendering would close the diff being read
  var plist = document.getElementById('projects'), ptitle = document.getElementById('ptitle');

  function api(method, path, body) {
    if (relayMode) return relayApi(method, path, body);
    return fetch(path, { method: method, headers: { 'Authorization': 'Bearer ' + token, 'Content-Type': 'application/json' }, body: body ? JSON.stringify(body) : undefined })
      .then(function (r) { return r.json().then(function (j) { return { status: r.status, body: j }; }); });
  }

  // ---- Web relay (usepilothouse.com/app): same API, reached through the Pilothouse relay instead of Tailscale.
  // Every request and reply is sealed with AES-256-GCM using a key that only this browser and your computer hold;
  // the relay only passes the sealed boxes along.
  var RELAY = 'wss://relay.usepilothouse.com';
  var RKEY = 'pilothouse-relay';
  var rcfg = (function () { try { return JSON.parse(localStorage.getItem(RKEY) || 'null'); } catch (e) { return null; } })();
  var relayMode = location.protocol === 'https:' && !!(window.crypto && crypto.subtle);
  var rws = null, rwsReady = null, pending = {};
  var enc = new TextEncoder(), dec = new TextDecoder();
  function b64(buf) { var s = '', a = new Uint8Array(buf); for (var i = 0; i < a.length; i++) s += String.fromCharCode(a[i]); return btoa(s); }
  function unb64(s) { var r = atob(s), a = new Uint8Array(r.length); for (var i = 0; i < r.length; i++) a[i] = r.charCodeAt(i); return a; }
  function rand(n) { return crypto.getRandomValues(new Uint8Array(n)); }
  function hex(a) { return Array.prototype.map.call(a, function (x) { return ('0' + x.toString(16)).slice(-2); }).join(''); }
  function aesKey(raw) { return crypto.subtle.importKey('raw', raw, 'AES-GCM', false, ['encrypt', 'decrypt']); }
  function keyFor(d) { return d === 'pair' ? crypto.subtle.digest('SHA-256', enc.encode(rcfg.pair)).then(aesKey) : aesKey(unb64(rcfg.key)); }
  function seal(key, d, obj) {
    var iv = rand(12);
    return crypto.subtle.encrypt({ name: 'AES-GCM', iv: iv, additionalData: enc.encode(d) }, key, enc.encode(JSON.stringify(obj)))
      .then(function (ct) { var out = new Uint8Array(12 + ct.byteLength); out.set(iv); out.set(new Uint8Array(ct), 12); return b64(out); });
  }
  function unseal(key, d, box) {
    var raw = unb64(box);
    return crypto.subtle.decrypt({ name: 'AES-GCM', iv: raw.slice(0, 12), additionalData: enc.encode(d) }, key, raw.slice(12))
      .then(function (pt) { return JSON.parse(dec.decode(pt)); });
  }
  function failAll(why) { Object.keys(pending).forEach(function (id) { pending[id].reject(new Error(why)); delete pending[id]; }); }
  function connectRelay() {
    if (rwsReady) return rwsReady;
    rwsReady = new Promise(function (resolve, reject) {
      var ws = new WebSocket(RELAY + '/room/' + rcfg.room);
      ws.onopen = function () { rws = ws; resolve(); };
      ws.onmessage = function (e) {
        var m; try { m = JSON.parse(e.data); } catch (x) { return; }
        if (m.offline) return failAll('offline');
        keyFor(m.d).then(function (k) { return unseal(k, m.d, m.c); }).then(function (r) {
          var p = pending[r.id]; if (!p) return;
          delete pending[r.id]; clearTimeout(p.timer); p.resolve({ status: r.s, body: r.b });
        }).catch(function () {});
      };
      ws.onclose = function () { rws = null; rwsReady = null; failAll('offline'); reject(new Error('offline')); };
    });
    return rwsReady;
  }
  function relayApi(method, path, body) {
    if (!rcfg) return Promise.reject(new Error('not paired'));
    var d = rcfg.device || 'pair';
    var id = hex(rand(8));
    return connectRelay().then(function () { return keyFor(d); }).then(function (k) {
      return seal(k, d, { id: id, t: Date.now(), n: hex(rand(12)), m: method, p: path, b: body || {}, a: rcfg.token });
    }).then(function (c) {
      return new Promise(function (resolve, reject) {
        pending[id] = { resolve: resolve, reject: reject, timer: setTimeout(function () { delete pending[id]; reject(new Error('offline')); }, 15000) };
        rws.send(JSON.stringify({ d: d, c: c }));
      });
    });
  }
  function el(tag, cls, text) { var e = document.createElement(tag); if (cls) e.className = cls; if (text != null) e.textContent = text; return e; }
  var LABEL = { waiting: 'needs you', running: 'working', idle: 'idle' };

  function choose(s, c) {
    var confirm = s.risk === 'danger' && !/^no\\b/i.test(c.label.trim());
    if (confirm && armed[s.id] !== c.key) { armed[s.id] = c.key; last = ''; return load(); }
    delete armed[s.id];
    api('POST', '/api/choose', { id: s.id, key: c.key, sig: s.sig, confirm: confirm }).then(function (r) {
      if (r.status !== 200) msg.textContent = r.body.error || 'Failed';
      last = ''; setTimeout(load, 400);
    });
  }

  function card(s) {
    var c = el('div', 'card ' + s.status);
    var head = el('div', 'head');
    head.appendChild(el('span', 'name', s.project));
    head.appendChild(el('span', 'pill ' + s.status, LABEL[s.status] || s.status));
    c.appendChild(head);
    var pre = el('pre', null, s.tail.slice(s.status === 'waiting' ? -1200 : -500));
    if (s.status === 'waiting') {
      c.appendChild(pre);
      if (s.risk === 'danger') c.appendChild(el('div', 'danger', 'Risky command (deletes, force-pushes, deploys, sudo or secrets). Read it in full; approving takes two taps.'));
      var ch = el('div', 'choices');
      s.choices.forEach(function (x, i) {
        var b = el('button', armed[s.id] === x.key ? 'armed' : (i === 0 ? 'primary' : ''), armed[s.id] === x.key ? 'Tap again to approve: ' + x.label : x.key.trim() + '. ' + x.label);
        b.onclick = function () { choose(s, x); };
        ch.appendChild(b);
      });
      c.appendChild(ch);
    } else {
      var d = el('details'); d.appendChild(el('summary', null, 'Output')); d.appendChild(pre); c.appendChild(d);
    }
    var row = el('div', 'row');
    var input = el('textarea'); input.rows = 1; input.placeholder = 'Message the agent (Shift+Enter: new line)'; input.enterKeyHint = 'send';
    var go = el('button', null, 'Send');
    function sendIt() {
      var t = input.value.trim(); if (!t) return;
      api('POST', '/api/send', { id: s.id, text: t }).then(function (r) { if (r.status !== 200) msg.textContent = r.body.error; input.value = ''; input.blur(); last = ''; load(); });
    }
    go.onclick = sendIt;
    input.onkeydown = function (e) { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); sendIt(); } };
    input.oninput = function () { input.style.height = 'auto'; input.style.height = Math.min(input.scrollHeight, 160) + 'px'; };
    row.appendChild(input); row.appendChild(go);
    var diffBtn = el('button', null, 'Changes');
    var diffBox = el('pre'); diffBox.hidden = true;
    diffBtn.onclick = function () {
      if (!diffBox.hidden) { diffBox.hidden = true; diffOpen = false; return; }
      api('GET', '/api/diff?id=' + encodeURIComponent(s.id)).then(function (r) {
        diffBox.replaceChildren();
        var text = (r.body.stat || '') + (r.body.untracked && r.body.untracked.length ? '\\nNew files: ' + r.body.untracked.join(', ') + '\\n' : '') + '\\n' + (r.body.diff || 'No changes.');
        text.split('\\n').forEach(function (line) {
          var span = el('span', null, line + '\\n');
          if (/^\\+(?!\\+\\+)/.test(line)) span.style.color = '#7ee787';
          else if (/^-(?!--)/.test(line)) span.style.color = '#ff7b72';
          else if (/^@@/.test(line)) span.style.color = '#79c0ff';
          diffBox.appendChild(span);
        });
        diffBox.hidden = false; diffOpen = true;
      });
    };
    row.appendChild(diffBtn);
    var termBtn = el('button', null, 'Terminal'); termBtn.onclick = function () { openTerm(s); }; row.appendChild(termBtn);
    if (s.status === 'running') { var stop = el('button', null, 'Stop'); stop.onclick = function () { api('POST', '/api/stop', { id: s.id }).then(load); }; row.appendChild(stop); }
    c.appendChild(row);
    c.appendChild(diffBox);
    return c;
  }

  // Live terminal: the screen exactly as the desktop shows it, refreshed while open, plus the keys a TUI needs.
  var termId = null, termTimer = null, lastScreen = '';
  var term = document.getElementById('term'), scr = document.getElementById('scr'), tin = document.getElementById('tin');
  var KEYS = [['Esc', '\\x1b'], ['Tab', '\\t'], ['↑', '\\x1b[A'], ['↓', '\\x1b[B'], ['←', '\\x1b[D'], ['→', '\\x1b[C'], ['Enter', '\\r'], ['Ctrl+C', '\\x03'], ['1', '1'], ['2', '2'], ['3', '3'], ['y', 'y'], ['n', 'n']];
  KEYS.forEach(function (k) {
    var b = el('button', null, k[0]);
    b.onclick = function () { api('POST', '/api/keys', { id: termId, data: k[1] }).then(drawScreen); };
    document.getElementById('tkeys').appendChild(b);
  });
  function drawScreen() {
    if (!termId) return;
    api('GET', '/api/screen?id=' + encodeURIComponent(termId)).then(function (r) {
      if (r.status !== 200) { msg.textContent = r.body.error || 'Terminal closed'; return closeTerm(); }
      var key = JSON.stringify(r.body);
      if (key === lastScreen) return;
      lastScreen = key;
      // Fit the terminal's width to the screen (monospace glyphs are ~0.6 em wide).
      scr.style.fontSize = Math.max(6, Math.min(13, (scr.clientWidth - 16) / (r.body.cols * 0.6))) + 'px';
      var frag = document.createDocumentFragment();
      r.body.lines.forEach(function (runs, y) {
        var col = 0;
        runs.forEach(function (run) {
          var text = run[0];
          var at = y === r.body.cursor.y ? r.body.cursor.x - col : -1;
          col += text.length;
          if (at >= 0 && at < text.length) {
            if (at) frag.appendChild(span(text.slice(0, at), run));
            var c = span(text[at], run); c.className = 'cur'; frag.appendChild(c);
            if (at + 1 < text.length) frag.appendChild(span(text.slice(at + 1), run));
          } else frag.appendChild(span(text, run));
        });
        if (y === r.body.cursor.y && r.body.cursor.x >= col) { frag.appendChild(document.createTextNode(' '.repeat(r.body.cursor.x - col))); var c = el('span', 'cur', ' '); frag.appendChild(c); }
        frag.appendChild(document.createTextNode('\\n'));
      });
      scr.replaceChildren(frag);
    }).catch(function () {});
  }
  function span(text, run) { var e = el('span', null, text); if (run[1]) e.style.color = run[1]; if (run[2]) e.style.fontWeight = '700'; return e; }
  function openTerm(s) {
    termId = s.id; lastScreen = '';
    document.getElementById('tname').textContent = s.project + ' · ' + s.agent;
    term.hidden = false; scr.replaceChildren();
    drawScreen(); termTimer = setInterval(drawScreen, 700);
  }
  function closeTerm() { termId = null; clearInterval(termTimer); term.hidden = true; last = ''; load(); }
  document.getElementById('tclose').onclick = closeTerm;
  function sendTerm() {
    var t = tin.value.trim(); if (!t || !termId) return;
    api('POST', '/api/send', { id: termId, text: t }).then(function (r) { if (r.status !== 200) msg.textContent = r.body.error; tin.value = ''; drawScreen(); });
  }
  document.getElementById('tsend').onclick = sendTerm;
  tin.onkeydown = function (e) { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); sendTerm(); } };

  function load() {
    if (!token) { msg.textContent = 'Open the link from Pilothouse → Settings → Phone remote on this phone.'; return; }
    // Re-rendering would wipe what the user is typing.
    var tag = document.activeElement && document.activeElement.tagName;
    if (diffOpen || termId || tag === 'INPUT' || tag === 'TEXTAREA') return;
    api('GET', '/api/sessions').then(function (r) {
      if (r.status === 401) { msg.textContent = 'This browser is no longer paired. Scan the QR code in Pilothouse Settings.'; list.replaceChildren(); plist.replaceChildren(); ptitle.hidden = true; last = ''; if (relayMode) { rcfg = null; try { localStorage.removeItem(RKEY); } catch (e) {} } return; }
      var key = JSON.stringify(r.body) + JSON.stringify(armed);
      if (key === last) return;
      last = key;
      var waiting = r.body.filter(function (s) { return s.status === 'waiting'; }).length;
      msg.textContent = r.body.length ? (waiting ? waiting + ' waiting for you' : 'All agents are working or idle') : 'No terminals open in Pilothouse.';
      document.title = waiting ? '(' + waiting + ') Pilothouse' : 'Pilothouse';
      list.replaceChildren.apply(list, r.body.map(card));
    }).catch(function (e) { msg.textContent = relayMode ? (e && e.message === 'offline' ? 'Your computer is offline, asleep, or Pilothouse is closed.' : 'Cannot reach Pilothouse.') : 'Cannot reach Pilothouse. Is the computer awake and on Tailscale?'; });
  }
  function loadProjects() {
    if (!token) return;
    api('GET', '/api/projects').then(function (r) {
      if (r.status !== 200) return;
      var key = JSON.stringify(r.body);
      if (key === lastProj) return;
      lastProj = key;
      ptitle.hidden = !r.body.length;
      plist.replaceChildren.apply(plist, r.body.map(function (p) {
        var row = el('div', 'card proj');
        row.appendChild(el('span', 'name', p.name));
        var b = el('button', null, 'Open agent');
        b.onclick = function () {
          b.disabled = true; b.textContent = 'Opening…';
          api('POST', '/api/open', { project: p.id }).then(function (x) {
            if (x.status !== 200) msg.textContent = x.body.error || 'Failed';
            last = ''; lastProj = ''; setTimeout(function () { load(); loadProjects(); }, 1500);
          });
        };
        row.appendChild(b);
        return row;
      }));
    }).catch(function () {});
  }
  // Browser notifications (web remote only: they need https and a service worker). The subscription goes to your
  // computer, which sends the pushes itself, encrypted to this browser.
  var notifyBtn = document.getElementById('notify');
  function urlKey(k) { var s = atob((k + '==='.slice((k.length + 3) % 4)).replace(/-/g, '+').replace(/_/g, '/')); var a = new Uint8Array(s.length); for (var i = 0; i < s.length; i++) a[i] = s.charCodeAt(i); return a; }
  function setupNotify() {
    if (!relayMode || !('serviceWorker' in navigator) || !('PushManager' in window)) return;
    navigator.serviceWorker.register('sw.js').then(function (reg) {
      function show(on) { notifyBtn.hidden = false; notifyBtn.textContent = on ? '🔔 On' : '🔔 Notify me'; notifyBtn.setAttribute('aria-pressed', on ? 'true' : 'false'); }
      reg.pushManager.getSubscription().then(function (sub) { show(!!sub); });
      notifyBtn.onclick = function () {
        reg.pushManager.getSubscription().then(function (sub) {
          if (sub) return sub.unsubscribe().then(function () { return api('POST', '/api/web-push', { subscription: null }); }).then(function () { show(false); });
          return Notification.requestPermission().then(function (p) {
            if (p !== 'granted') { msg.textContent = 'Notifications are blocked for this site in your browser settings.'; return; }
            return api('GET', '/api/web-push-key').then(function (r) {
              return reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: urlKey(r.body.key) });
            }).then(function (sub) { return api('POST', '/api/web-push', { subscription: sub.toJSON() }); })
              .then(function (r) { if (r.status === 200) show(true); else msg.textContent = r.body.error || 'Could not turn notifications on.'; });
          });
        }).catch(function (e) { msg.textContent = 'Notifications: ' + e.message; });
      };
    }).catch(function () {});
  }
  function start() {
    setupNotify();
    loadProjects();
    setInterval(loadProjects, 10000);
    load();
    setInterval(load, 2000);
  }
  // A fresh QR link always pairs, even over an old token (that one may have been revoked or be from another computer).
  if (relayMode && relayLink && pair) {
    rcfg = { room: relayLink[1], pair: pair[1] };
    msg.textContent = 'Pairing…';
    relayApi('POST', '/api/pair', { secret: pair[1], name: 'Browser · ' + (navigator.platform || 'web') }).then(function (r) {
      if (r.status !== 200 || !r.body.relayKey) { msg.textContent = r.body.error || 'Pairing failed.'; rcfg = null; return; }
      rcfg = { room: relayLink[1], device: r.body.device, key: r.body.relayKey, token: r.body.token };
      token = r.body.token;
      try { localStorage.setItem(RKEY, JSON.stringify(rcfg)); } catch (e) {}
      if (rws) rws.close();
      start();
    }).catch(function () { msg.textContent = 'Your computer did not answer. Is Pilothouse open with Remote control on?'; rcfg = null; });
  } else if (relayMode) {
    if (rcfg && rcfg.token) { token = rcfg.token; start(); }
    else msg.textContent = 'Open Pilothouse on your computer → Settings → Remote control, and scan the QR code.';
  } else if (pair) {
    fetch('/api/pair', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ secret: pair[1], name: 'Browser · ' + (navigator.platform || 'phone') }) })
      .then(function (r) { return r.json(); })
      .then(function (j) { if (j.token) { token = j.token; try { localStorage.setItem(KEY, token); } catch (e) {} } else msg.textContent = j.error; start(); })
      .catch(function () { msg.textContent = 'Pairing failed. Is Tailscale on?'; });
  } else start();
  // shortcut: polling every 2 s (start()); switch to server-sent events if many phones or battery use become a problem.
})();
</script>
</body>
</html>`;

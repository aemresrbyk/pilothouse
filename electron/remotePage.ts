// The phone page served by remote.ts. Plain HTML + JS so it needs no build step on the phone.
// Terminal text is untrusted (agents print whatever a repo contains), so it only ever goes in through textContent.
import { REMOTE_I18N } from './remoteI18n';

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
  #pcode { text-align:center; padding:18px 12px; } #pcode b { display:block; font:600 34px/1.2 ui-monospace,Menlo,monospace; letter-spacing:.08em; color:var(--lime); margin:6px 0; } #pcode span { color:var(--dim); font-size:13px; }
  #setup ol { padding-left:20px; margin:10px 0; color:var(--dim); } #setup b { color:var(--text); } .fine { color:var(--dim); font-size:12px; margin:10px 0 0; }
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
<div id="pcode" class="card" hidden><span>Security code</span><b></b><span>Your computer shows a code too. Click Allow there if they match.</span></div>
<div id="setup" class="card" hidden>
  <b>Use Pilothouse from this browser</b>
  <ol>
    <li>On your computer, open Pilothouse → Settings → Remote control and turn it on.</li>
    <li>Scan the QR code with your phone's camera.</li>
    <li>Check that both screens show the same security code, then click Allow on the computer.</li>
  </ol>
  <details class="fine"><summary>On a computer without a camera? Paste the link</summary>
  <div class="row"><input id="plink" placeholder="https://usepilothouse.com/app/#r=…" autocomplete="off" spellcheck="false"><button id="pgo" class="primary">Connect</button></div>
  </details>
  <p class="fine">No account. The link pairs this browser once and expires after 10 minutes. Everything between here and your computer is end-to-end encrypted; the relay in between cannot read it.</p>
</div>
<div id="list"></div>
<h2 id="ptitle" hidden>Projects</h2>
<div id="projects"></div>
<h2 id="ctitle" hidden>Computers</h2>
<div id="computers"></div>
<div id="term" hidden>
  <div class="head"><span class="name" id="tname"></span><button id="tclose">Close</button></div>
  <pre id="scr"></pre>
  <div class="keys" id="tkeys"></div>
  <div class="row"><textarea id="tin" rows="1" placeholder="Type, then Send (Shift+Enter: new line)"></textarea><button id="tsend">Send</button></div>
</div>
<script>
// Interface language: the browser's, when there is a translation (electron/remoteI18n.ts). Swaps whole strings that
// match exactly, in text and placeholders/titles; agent output (pre, inputs) is never touched.
(function () {
  var dict = (${JSON.stringify(REMOTE_I18N)})[(navigator.language || 'en').slice(0, 2).toLowerCase()];
  window.T = function (s) { return (dict && dict[s]) || s; };
  if (!dict) return;
  document.documentElement.lang = navigator.language.slice(0, 2);
  function text(n) {
    if (!n.parentElement || n.parentElement.closest('pre, textarea, script, style')) return;
    var k = (n.nodeValue || '').trim();
    if (k && dict[k]) n.nodeValue = n.nodeValue.replace(k, dict[k]);
  }
  function attrs(e) {
    ['placeholder', 'title', 'aria-label'].forEach(function (a) { var v = e.getAttribute(a); if (v && dict[v]) e.setAttribute(a, dict[v]); });
  }
  function walk(r) {
    if (r.nodeType === 3) return text(r);
    if (r.nodeType !== 1) return;
    attrs(r);
    var w = document.createTreeWalker(r, 5);
    for (var n = w.nextNode(); n; n = w.nextNode()) n.nodeType === 3 ? text(n) : attrs(n);
  }
  walk(document.body);
  new MutationObserver(function (rs) {
    rs.forEach(function (x) { if (x.type === 'characterData') text(x.target); else if (x.type === 'attributes') attrs(x.target); else x.addedNodes.forEach(walk); });
  }).observe(document.body, { subtree: true, childList: true, characterData: true, attributes: true, attributeFilter: ['placeholder', 'title', 'aria-label'] });
})();
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

  // c: which computer (web relay mode); the Tailscale page talks to the one computer that served it.
  function api(method, path, body, c) {
    if (relayMode) return relayApi(c || comps[0], method, path, body);
    return fetch(path, { method: method, headers: { 'Authorization': 'Bearer ' + token, 'Content-Type': 'application/json' }, body: body ? JSON.stringify(body) : undefined })
      .then(function (r) { return r.json().then(function (j) { return { status: r.status, body: j }; }); });
  }

  // ---- Web relay (usepilothouse.com/app): same API, reached through the Pilothouse relay instead of Tailscale.
  // Every request and reply is sealed with AES-256-GCM using a key that only this browser and that computer hold;
  // the relay only passes the sealed boxes along. One browser can follow several computers (one entry each).
  var RELAY = 'wss://relay.usepilothouse.com';
  var CKEY = 'pilothouse-computers';
  var relayMode = location.protocol === 'https:' && !!(window.crypto && crypto.subtle);
  var comps = (function () {
    try {
      var list = JSON.parse(localStorage.getItem(CKEY) || 'null');
      if (list) return list;
      var old = JSON.parse(localStorage.getItem('pilothouse-relay') || 'null'); // single-computer format of 1.8 betas
      return old && old.token ? [old] : [];
    } catch (e) { return []; }
  })();
  function saveComps() { try { localStorage.setItem(CKEY, JSON.stringify(comps.map(function (c) { return { room: c.room, device: c.device, key: c.key, token: c.token, name: c.name, viewOnly: c.viewOnly }; }))); } catch (e) {} }
  var socks = {}, pending = {};
  var enc = new TextEncoder(), dec = new TextDecoder();
  function b64(buf) { var s = '', a = new Uint8Array(buf); for (var i = 0; i < a.length; i++) s += String.fromCharCode(a[i]); return btoa(s); }
  function unb64(s) { var r = atob(s), a = new Uint8Array(r.length); for (var i = 0; i < r.length; i++) a[i] = r.charCodeAt(i); return a; }
  function rand(n) { return crypto.getRandomValues(new Uint8Array(n)); }
  function hex(a) { return Array.prototype.map.call(a, function (x) { return ('0' + x.toString(16)).slice(-2); }).join(''); }
  function aesKey(raw) { return crypto.subtle.importKey('raw', raw, 'AES-GCM', false, ['encrypt', 'decrypt']); }
  function keyFor(c, d) { return d === 'pair' ? crypto.subtle.digest('SHA-256', enc.encode(c.pair)).then(aesKey) : aesKey(unb64(c.key)); }
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
  function failRoom(room, why) { Object.keys(pending).forEach(function (id) { if (pending[id].room === room) { clearTimeout(pending[id].timer); pending[id].reject(new Error(why)); delete pending[id]; } }); }
  function connectRelay(c) {
    var sk = socks[c.room];
    if (sk) return sk.ready;
    sk = socks[c.room] = {};
    sk.ready = new Promise(function (resolve, reject) {
      var ws = new WebSocket(RELAY + '/room/' + c.room);
      ws.onopen = function () { sk.ws = ws; resolve(); };
      ws.onmessage = function (e) {
        var m; try { m = JSON.parse(e.data); } catch (x) { return; }
        if (m.offline) return failRoom(c.room, 'offline');
        keyFor(c, m.d).then(function (k) { return unseal(k, m.d, m.c); }).then(function (r) {
          var p = pending[r.id]; if (!p) return;
          delete pending[r.id]; clearTimeout(p.timer); p.resolve({ status: r.s, body: r.b });
        }).catch(function () {});
      };
      ws.onclose = function () { delete socks[c.room]; failRoom(c.room, 'offline'); reject(new Error('offline')); };
    });
    return sk.ready;
  }
  function relayApi(c, method, path, body, wait) {
    if (!c) return Promise.reject(new Error('not paired'));
    var d = c.device || 'pair';
    var id = hex(rand(8));
    return connectRelay(c).then(function () { return keyFor(c, d); }).then(function (k) {
      return seal(k, d, { id: id, t: Date.now(), n: hex(rand(12)), m: method, p: path, b: body || {}, a: c.token });
    }).then(function (box) {
      return new Promise(function (resolve, reject) {
        pending[id] = { room: c.room, resolve: resolve, reject: reject, timer: setTimeout(function () { delete pending[id]; reject(new Error('offline')); }, wait || 15000) };
        socks[c.room].ws.send(JSON.stringify({ d: d, c: box }));
      });
    });
  }

  function el(tag, cls, text) { var e = document.createElement(tag); if (cls) e.className = cls; if (text != null) e.textContent = text; return e; }
  var LABEL = { waiting: 'needs you', running: 'working', idle: 'idle' };

  function choose(s, c) {
    var confirm = s.risk === 'danger' && !/^no\\b/i.test(c.label.trim());
    if (confirm && armed[s.id] !== c.key) { armed[s.id] = c.key; last = ''; return load(); }
    delete armed[s.id];
    api('POST', '/api/choose', { id: s.id, key: c.key, sig: s.sig, confirm: confirm }, s.c).then(function (r) {
      if (r.status !== 200) msg.textContent = r.body.error || 'Failed';
      last = ''; setTimeout(load, 400);
    });
  }

  function card(s) {
    var c = el('div', 'card ' + s.status);
    var head = el('div', 'head');
    head.appendChild(el('span', 'name', comps.length > 1 && s.c ? s.project + ' · ' + (s.c.name || 'Computer') : s.project));
    head.appendChild(el('span', 'pill ' + s.status, LABEL[s.status] || s.status));
    c.appendChild(head);
    var ro = !!(s.c && s.c.viewOnly); // a view-only link: read, never act
    var pre = el('pre', null, s.tail.slice(s.status === 'waiting' ? -1200 : -500));
    if (s.status === 'waiting') {
      c.appendChild(pre);
      if (s.risk === 'danger') c.appendChild(el('div', 'danger', 'Risky command (deletes, force-pushes, deploys, sudo or secrets). Read it in full; approving takes two taps.'));
      if (ro) { c.appendChild(el('div', 'fine', 'View only: the owner answers this on their computer.')); }
      var ch = el('div', 'choices'); if (ro) ch.hidden = true;
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
      api('POST', '/api/send', { id: s.id, text: t }, s.c).then(function (r) { if (r.status !== 200) msg.textContent = r.body.error; input.value = ''; input.blur(); last = ''; load(); });
    }
    go.onclick = sendIt;
    input.onkeydown = function (e) { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); sendIt(); } };
    input.oninput = function () { input.style.height = 'auto'; input.style.height = Math.min(input.scrollHeight, 160) + 'px'; };
    if (!ro) { row.appendChild(input); row.appendChild(go); }
    var diffBtn = el('button', null, 'Changes');
    var diffBox = el('pre'); diffBox.hidden = true;
    diffBtn.onclick = function () {
      if (!diffBox.hidden) { diffBox.hidden = true; diffOpen = false; return; }
      api('GET', '/api/diff?id=' + encodeURIComponent(s.id), null, s.c).then(function (r) {
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
    if (s.status === 'running' && !ro) { var stop = el('button', null, 'Stop'); stop.onclick = function () { api('POST', '/api/stop', { id: s.id }, s.c).then(load); }; row.appendChild(stop); }
    c.appendChild(row);
    c.appendChild(diffBox);
    return c;
  }

  // Live terminal: the screen exactly as the desktop shows it, refreshed while open, plus the keys a TUI needs.
  var termId = null, termC = null, termTimer = null, lastScreen = '';
  var term = document.getElementById('term'), scr = document.getElementById('scr'), tin = document.getElementById('tin');
  var KEYS = [['Esc', '\\x1b'], ['Tab', '\\t'], ['↑', '\\x1b[A'], ['↓', '\\x1b[B'], ['←', '\\x1b[D'], ['→', '\\x1b[C'], ['Enter', '\\r'], ['Ctrl+C', '\\x03'], ['1', '1'], ['2', '2'], ['3', '3'], ['y', 'y'], ['n', 'n']];
  KEYS.forEach(function (k) {
    var b = el('button', null, k[0]);
    b.onclick = function () { api('POST', '/api/keys', { id: termId, data: k[1] }, termC).then(drawScreen); };
    document.getElementById('tkeys').appendChild(b);
  });
  function drawScreen() {
    if (!termId || document.hidden) return;
    api('GET', '/api/screen?id=' + encodeURIComponent(termId), null, termC).then(function (r) {
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
    termId = s.id; termC = s.c; lastScreen = '';
    document.getElementById('tname').textContent = s.project + ' · ' + s.agent;
    term.hidden = false; scr.replaceChildren();
    var ro = !!(termC && termC.viewOnly);
    document.getElementById('tkeys').hidden = ro; tin.parentNode.hidden = ro;
    drawScreen(); termTimer = setInterval(drawScreen, 700);
  }
  function closeTerm() { termId = null; clearInterval(termTimer); term.hidden = true; last = ''; load(); }
  document.getElementById('tclose').onclick = closeTerm;
  function sendTerm() {
    var t = tin.value.trim(); if (!t || !termId) return;
    api('POST', '/api/send', { id: termId, text: t }, termC).then(function (r) { if (r.status !== 200) msg.textContent = r.body.error; tin.value = ''; drawScreen(); });
  }
  document.getElementById('tsend').onclick = sendTerm;
  tin.onkeydown = function (e) { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); sendTerm(); } };

  // Every computer's sessions in one list (web relay); a computer that does not answer is named in the status line.
  function fetchAll(path) {
    var targets = relayMode ? comps : [null];
    return Promise.all(targets.map(function (c) {
      return api('GET', path, null, c).then(function (r) { return { c: c, r: r }; }, function (e) { return { c: c, err: e }; });
    }));
  }
  function load() {
    if (relayMode) { setup.hidden = comps.length > 0; if (!comps.length) { showComputers([]); list.replaceChildren(); plist.replaceChildren(); ptitle.hidden = true; notifyBtn.hidden = true; } }
    if (relayMode ? !comps.length : !token) { msg.textContent = relayMode ? '' : 'Open the link from Pilothouse → Settings → Remote control on this phone.'; return; }
    // Re-rendering would wipe what the user is typing.
    var tag = document.activeElement && document.activeElement.tagName;
    // Not while you type or read, and not while the page is in the background (battery): it catches up on return.
    if (document.hidden || diffOpen || termId || tag === 'INPUT' || tag === 'TEXTAREA') return;
    fetchAll('/api/sessions').then(function (results) {
      var all = [], notes = [];
      results.forEach(function (x) {
        var who = x.c && comps.length > 1 ? (x.c.name || 'Computer') + ': ' : '';
        if (x.err) { notes.push(who + (relayMode ? (x.err.message === 'offline' ? 'offline, asleep, or Pilothouse is closed' : 'cannot reach it') : 'cannot reach Pilothouse. Is the computer awake and on Tailscale?')); return; }
        if (x.r.status === 401) {
          notes.push(who + 'no longer paired. Scan the QR code in Pilothouse Settings.');
          if (relayMode) { comps = comps.filter(function (c) { return c !== x.c; }); saveComps(); } else token = null;
          return;
        }
        x.r.body.forEach(function (s) { s.c = x.c; all.push(s); });
      });
      var order = { waiting: 0, running: 1, idle: 2 };
      all.sort(function (a, b) { return order[a.status] - order[b.status]; });
      var key = JSON.stringify(all.map(function (s) { var o = Object.assign({}, s); o.c = s.c && s.c.room; return o; })) + JSON.stringify(armed) + notes.join();
      if (key === last) return;
      last = key;
      var waiting = all.filter(function (s) { return s.status === 'waiting'; }).length;
      var state = all.length ? (waiting ? T('%n waiting for you').replace('%n', waiting) : 'All agents are working or idle') : (notes.length ? '' : 'No terminals open in Pilothouse.');
      msg.textContent = [state].concat(notes).filter(Boolean).join(' · ');
      document.title = waiting ? '(' + waiting + ') Pilothouse' : 'Pilothouse';
      list.replaceChildren.apply(list, all.map(card));
      showComputers(results);
    });
  }
  // The computers this browser follows, with a way to forget one (sold, wiped, or just not yours any more).
  var clist = document.getElementById('computers'), ctitle = document.getElementById('ctitle');
  function showComputers(results) {
    if (!relayMode) return;
    ctitle.hidden = !comps.length;
    clist.replaceChildren.apply(clist, comps.map(function (c) {
      var x = results.filter(function (r) { return r.c === c; })[0];
      var row = el('div', 'card proj');
      row.appendChild(el('span', 'name', (c.name || 'Computer') + (c.viewOnly ? ' · view only' : '') + (x && x.err ? ' · offline' : '')));
      var b = el('button', null, 'Forget');
      b.onclick = function () {
        api('POST', '/api/unpair', {}, c).catch(function () {});
        comps = comps.filter(function (o) { return o !== c; });
        saveComps(); last = ''; lastProj = ''; load(); loadProjects();
      };
      row.appendChild(b);
      return row;
    }));
  }
  function loadProjects() {
    if (relayMode ? !comps.length : !token) return;
    fetchAll('/api/projects').then(function (results) {
      var rows = [];
      results.forEach(function (x) { if (x.r && x.r.status === 200) x.r.body.forEach(function (p) { rows.push({ p: p, c: x.c }); }); });
      var key = JSON.stringify(rows.map(function (x) { return [x.p.id, x.c && x.c.room]; }));
      if (key === lastProj) return;
      lastProj = key;
      ptitle.hidden = !rows.length;
      plist.replaceChildren.apply(plist, rows.map(function (x) {
        var row = el('div', 'card proj');
        row.appendChild(el('span', 'name', comps.length > 1 && x.c ? x.p.name + ' · ' + (x.c.name || 'Computer') : x.p.name));
        var b = el('button', null, 'Open agent'); if (x.c && x.c.viewOnly) b.hidden = true;
        b.onclick = function () {
          b.disabled = true; b.textContent = 'Opening…';
          api('POST', '/api/open', { project: x.p.id }, x.c).then(function (r) {
            if (r.status !== 200) { msg.textContent = 'Could not open it: ' + (r.body.error || 'failed'); b.disabled = false; b.textContent = 'Open agent'; return; }
            last = ''; lastProj = ''; setTimeout(function () { load(); loadProjects(); }, 1500);
          });
        };
        row.appendChild(b);
        return row;
      }));
    });
  }
  // Browser notifications (web remote only: they need https and a service worker). The subscription goes to your
  // computer, which sends the pushes itself, encrypted to this browser.
  var notifyBtn = document.getElementById('notify');
  function urlKey(k) { var s = atob((k + '==='.slice((k.length + 3) % 4)).replace(/-/g, '+').replace(/_/g, '/')); var a = new Uint8Array(s.length); for (var i = 0; i < s.length; i++) a[i] = s.charCodeAt(i); return a; }
  // One service worker registration per computer (its own scope), because each computer has its own push keys.
  function setupNotify() {
    if (!relayMode || !comps.length || !('serviceWorker' in navigator) || !('PushManager' in window)) return;
    function regs() { return Promise.all(comps.map(function (c) { return navigator.serviceWorker.register('sw.js', { scope: './c/' + c.room + '/' }); })); }
    function show(on) { notifyBtn.hidden = false; notifyBtn.textContent = on ? '🔔 On' : '🔔 Notify me'; notifyBtn.setAttribute('aria-pressed', on ? 'true' : 'false'); }
    regs().then(function (rs) {
      return Promise.all(rs.map(function (r) { return r.pushManager.getSubscription(); })).then(function (subs) { show(subs.every(Boolean)); });
    }).catch(function () {});
    notifyBtn.onclick = function () {
      var turnOff = notifyBtn.getAttribute('aria-pressed') === 'true';
      (turnOff ? Promise.resolve('granted') : Notification.requestPermission()).then(function (perm) {
        if (perm !== 'granted') { msg.textContent = 'Notifications are blocked for this site in your browser settings.'; return; }
        return regs().then(function (rs) {
          return Promise.all(rs.map(function (reg, i) {
            var c = comps[i];
            return reg.pushManager.getSubscription().then(function (sub) {
              if (turnOff) return sub ? sub.unsubscribe().then(function () { return api('POST', '/api/web-push', { subscription: null }, c); }) : null;
              if (sub) return api('POST', '/api/web-push', { subscription: sub.toJSON() }, c);
              return api('GET', '/api/web-push-key', null, c).then(function (r) {
                return reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: urlKey(r.body.key) });
              }).then(function (sub) { return api('POST', '/api/web-push', { subscription: sub.toJSON() }, c); });
            });
          }));
        }).then(function () { show(!turnOff); });
      }).catch(function (e) { msg.textContent = 'Notifications: ' + e.message; });
    };
  }
  document.addEventListener('visibilitychange', function () { if (!document.hidden) { last = ''; load(); drawScreen(); } });
  function start() {
    setupNotify();
    loadProjects();
    setInterval(loadProjects, 10000);
    load();
    setInterval(load, 2000);
  }
  // A fresh QR link always pairs, even over an old token (that one may have been revoked or be from another computer).
  // Pairing adds this computer to the list (or replaces its old entry); the others stay.
  // The security code both screens show (electron/remote.ts securityCode): picked here, sent inside the pairing request.
  var pcode = document.getElementById('pcode');
  function newCode() {
    var a = new Uint32Array(1); crypto.getRandomValues(a);
    var n = String(a[0] % 1000000); while (n.length < 6) n = '0' + n;
    pcode.querySelector('b').textContent = n.slice(0, 3) + ' ' + n.slice(3);
    pcode.hidden = false;
    msg.textContent = 'Waiting for your computer…';
    return n;
  }
  function pairWith(room, code) {
    var pc = { room: room, pair: code };
    // The person at the computer has up to 2 minutes to compare the codes and click Allow.
    return relayApi(pc, 'POST', '/api/pair', { secret: code, code: newCode(), name: 'Browser · ' + (navigator.platform || 'web') }, 130000).then(function (r) {
      pcode.hidden = true;
      if (r.status !== 200 || !r.body.relayKey) { msg.textContent = r.body.error || 'Pairing failed.'; return false; }
      if (socks[room] && socks[room].ws) socks[room].ws.close();
      comps = comps.filter(function (c) { return c.room !== room; });
      comps.push({ room: room, device: r.body.device, key: r.body.relayKey, token: r.body.token, name: r.body.computer || 'Computer ' + (comps.length + 1), viewOnly: !!r.body.viewOnly });
      saveComps();
      return true;
    }).catch(function () { pcode.hidden = true; msg.textContent = 'Your computer did not answer. Is Pilothouse open with Remote control on?'; return false; });
  }
  var setup = document.getElementById('setup');
  document.getElementById('pgo').onclick = function () {
    var t = document.getElementById('plink').value;
    var r = /[#&]r=([0-9a-f]{32})/.exec(t), p = /[#&]p=([0-9a-f]+)/.exec(t);
    if (!r || !p) { msg.textContent = 'That is not a Pilothouse link. Copy it from Settings → Remote control on your computer.'; return; }
    pairWith(r[1], p[1]).then(function (ok) { if (ok) { setup.hidden = true; last = ''; lastProj = ''; load(); loadProjects(); setupNotify(); } });
  };
  if (relayMode && relayLink && pair) {
    pairWith(relayLink[1], pair[1]).then(function (ok) { if (ok) start(); else setTimeout(start, 4000); });
  } else if (relayMode) {
    start();
  } else if (pair) {
    fetch('/api/pair', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ secret: pair[1], code: newCode(), name: 'Browser · ' + (navigator.platform || 'phone') }) })
      .then(function (r) { return r.json(); })
      .then(function (j) { pcode.hidden = true; if (j.token) { token = j.token; try { localStorage.setItem(KEY, token); } catch (e) {} } else msg.textContent = j.error; start(); })
      .catch(function () { pcode.hidden = true; msg.textContent = 'Pairing failed. Is Tailscale on?'; });
  } else start();
  // shortcut: polling every 2 s (start()); switch to server-sent events if many phones or battery use become a problem.
})();
</script>
</body>
</html>`;

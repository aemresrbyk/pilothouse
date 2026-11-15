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
<style>
  :root { --bg:#0B0D10; --card:#12161f; --line:#232a3a; --text:#e4e7ee; --dim:#7b8496; --lime:#C8FF2E; --red:#ff5c5c; --amber:#ffc24a; }
  * { box-sizing: border-box; }
  body { margin:0; background:var(--bg); color:var(--text); font:15px/1.4 -apple-system, system-ui, sans-serif; padding:16px 16px calc(16px + env(safe-area-inset-bottom)); }
  h1 { font-size:17px; margin:0 0 12px; display:flex; align-items:center; gap:8px; }
  h1 b { color:var(--lime); }
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
  input { flex:1; min-width:0; font:inherit; color:var(--text); background:#07090c; border:1px solid var(--line); border-radius:10px; padding:10px; min-height:44px; }
  .row button { flex-shrink:0; text-align:center; }
  h2 { font-size:14px; color:var(--dim); margin:20px 0 8px; font-weight:600; }
  .proj { display:flex; justify-content:space-between; align-items:center; gap:8px; padding:6px 0 6px 12px; }
  details summary { color:var(--dim); font-size:13px; margin-top:8px; }
</style>
</head>
<body>
<h1><b>●</b> Pilothouse</h1>
<div id="msg">Connecting…</div>
<div id="list"></div>
<h2 id="ptitle" hidden>Projects</h2>
<div id="projects"></div>
<script>
(function () {
  var KEY = 'pilothouse-token';
  var m = /#t=([0-9a-f]+)/.exec(location.hash);
  if (m) { try { localStorage.setItem(KEY, m[1]); } catch (e) {} history.replaceState(null, '', location.pathname); }
  var token = m ? m[1] : (function () { try { return localStorage.getItem(KEY); } catch (e) { return null; } })();
  var msg = document.getElementById('msg'), list = document.getElementById('list');
  var armed = {}; // session id -> choice key armed for a risky approval
  var last = '', lastProj = '';
  var plist = document.getElementById('projects'), ptitle = document.getElementById('ptitle');

  function api(method, path, body) {
    return fetch(path, { method: method, headers: { 'Authorization': 'Bearer ' + token, 'Content-Type': 'application/json' }, body: body ? JSON.stringify(body) : undefined })
      .then(function (r) { return r.json().then(function (j) { return { status: r.status, body: j }; }); });
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
    var input = el('input'); input.placeholder = 'Message the agent'; input.enterKeyHint = 'send';
    var go = el('button', null, 'Send');
    function sendIt() {
      var t = input.value.trim(); if (!t) return;
      api('POST', '/api/send', { id: s.id, text: t }).then(function (r) { if (r.status !== 200) msg.textContent = r.body.error; input.value = ''; input.blur(); last = ''; load(); });
    }
    go.onclick = sendIt;
    input.onkeydown = function (e) { if (e.key === 'Enter') sendIt(); };
    row.appendChild(input); row.appendChild(go);
    if (s.status === 'running') { var stop = el('button', null, 'Stop'); stop.onclick = function () { api('POST', '/api/stop', { id: s.id }).then(load); }; row.appendChild(stop); }
    c.appendChild(row);
    return c;
  }

  function load() {
    if (!token) { msg.textContent = 'Open the link from Pilothouse → Settings → Phone remote on this phone.'; return; }
    // Re-rendering would wipe what the user is typing.
    if (document.activeElement && document.activeElement.tagName === 'INPUT') return;
    api('GET', '/api/sessions').then(function (r) {
      if (r.status === 401) { msg.textContent = 'This link was revoked. Scan the new QR code in Pilothouse Settings.'; return; }
      var key = JSON.stringify(r.body) + JSON.stringify(armed);
      if (key === last) return;
      last = key;
      var waiting = r.body.filter(function (s) { return s.status === 'waiting'; }).length;
      msg.textContent = r.body.length ? (waiting ? waiting + ' waiting for you' : 'All agents are working or idle') : 'No terminals open in Pilothouse.';
      document.title = waiting ? '(' + waiting + ') Pilothouse' : 'Pilothouse';
      list.replaceChildren.apply(list, r.body.map(card));
    }).catch(function () { msg.textContent = 'Cannot reach Pilothouse. Is the computer awake and on Tailscale?'; });
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
  loadProjects();
  setInterval(loadProjects, 10000);
  load();
  // shortcut: polling every 2 s; switch to server-sent events if many phones or battery use become a problem.
  setInterval(load, 2000);
})();
</script>
</body>
</html>`;

'use strict';
const BROKERS = ['wss://broker.emqx.io:8084/mqtt', 'wss://broker.hivemq.com:8884/mqtt', 'wss://test.mosquitto.org:8081/mqtt', 'wss://broker-cn.emqx.io:8084/mqtt', 'wss://mqtt-dashboard.com:8884/mqtt', 'ntfy:https://ntfy.sh'];
const PW = { kind: 'chat', on: false, socks: [], timers: [], st: null, burned: new Set(), role: null };
const PW_ALPHA = 'abcdefghjkmnpqrstuvwxyz23456789';
const pwCheck = idx => { let a = 7; idx.forEach((v, i) => { a = (a * 31 + (v + 1) * (i + 3)) % 9973; }); return a % PW_ALPHA.length; };
function pwGenerate(prot) {
  const idx = [];
  while (idx.length < 15) for (const x of crypto.getRandomValues(new Uint8Array(24))) if (x < 248 && idx.length < 15) idx.push(x % PW_ALPHA.length);
  idx.push((pwCheck(idx) + (prot ? 1 : 0)) % PW_ALPHA.length);
  return idx.map((v, i) => (i && i % 4 === 0 ? '-' : '') + PW_ALPHA[v]).join('');
}
function pwParse(v) {
  const c = (v || '').normalize('NFKC').toLowerCase().replace(/[\s-]/g, ''); if (c.length !== 16) return null;
  const idx = []; for (const ch of c) { const k = PW_ALPHA.indexOf(ch); if (k < 0) return null; idx.push(k); }
  const k = pwCheck(idx.slice(0, 15)), prot = idx[15] === (k + 1) % PW_ALPHA.length; if (idx[15] !== k && !prot) return null;
  return { c: idx.map((v, i) => (i && i % 4 === 0 ? '-' : '') + PW_ALPHA[v]).join(''), prot };
}
const pwCanon = v => { const p = pwParse(v); return p ? p.c : null; };
const pwIsProt = v => { const p = pwParse(v); return !!(p && p.prot); };
const pwIsBurned = topic => PW.burned.has(topic);
const pwBurn = topic => { PW.burned.add(topic); };
const pwNorm = p => p.normalize('NFKC').trim();
async function pwDerive(pass, kind = 'chat', extra = '') {
  const km = await crypto.subtle.importKey('raw', te.encode(pwNorm(pass)), 'PBKDF2', false, ['deriveBits']);
  const bits = new Uint8Array(await crypto.subtle.deriveBits({ name: 'PBKDF2', salt: te.encode(kind === 'share' ? 'P2P-SHARE-v1' : 'P2P-QUICK-v1'), iterations: 600000, hash: 'SHA-256' }, km, 80 * 8));
  const topic = (kind === 'share' ? 'p2ps/' : 'p2pq/') + E2E.hex(bits.slice(0, 16));
  let kb = bits.slice(16, 48), psk = bits.slice(48, 80);
  if (extra) {
    const xm = await crypto.subtle.importKey('raw', te.encode(pwNorm(extra)), 'PBKDF2', false, ['deriveBits']);
    const xb = new Uint8Array(await crypto.subtle.deriveBits({ name: 'PBKDF2', salt: te.encode('P2P-QX-v1:' + topic), iterations: 600000, hash: 'SHA-256' }, xm, 64 * 8));
    const mix = async (a, b) => new Uint8Array(await crypto.subtle.digest('SHA-256', E2E.cat(a, b)));
    kb = await mix(kb, xb.slice(0, 32)); psk = await mix(psk, xb.slice(32, 64));
  }
  return { topic, key: await crypto.subtle.importKey('raw', kb, 'AES-GCM', false, ['encrypt', 'decrypt']), psk, prot: !!extra };
}
async function pwSeal(key, o) {
  const iv = crypto.getRandomValues(new Uint8Array(12)), ct = new Uint8Array(await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, key, te.encode(JSON.stringify(o))));
  return b64e(E2E.cat(iv, ct));
}
async function pwOpen(key, s) {
  try { const u = b64d(s); if (u.length < 30 || u.length > 8000) return null; return JSON.parse(td.decode(new Uint8Array(await crypto.subtle.decrypt({ name: 'AES-GCM', iv: u.slice(0, 12) }, key, u.slice(12))))); } catch { return null; }
}

function mqttOpen(url, topic, onMsg) {
  const o = { ready: false, closed: false, q: [], ws: null };
  let ws, ping = null; o.close = () => { o.closed = true; clearInterval(ping); try { if (ws && ws.readyState === 0) { ws.onopen = () => { try { ws.close(); } catch {} }; } else ws && ws.close(); } catch {} };
  try { ws = new WebSocket(url, 'mqtt'); } catch { o.closed = true; return o; }
  o.ws = ws; ws.binaryType = 'arraybuffer'; const hn = url.replace(/^wss:\/\//, '').split('/')[0]; dbg('mqtt connecting', hn);
  const vl = n => { const r = []; do { let b = n % 128; n = Math.floor(n / 128); if (n) b |= 128; r.push(b); } while (n); return r; };
  const str = s => { const b = te.encode(s); return [b.length >> 8, b.length & 255, ...b]; };
  const pkt = (h, body) => { const x = Uint8Array.from(body); const l = vl(x.length); return E2E.cat(Uint8Array.from([h, ...l]), x); };
  const send = u => { if (ws.readyState === 1) ws.send(u); };
  let buf = new Uint8Array(0);
  ws.onopen = () => dbg('mqtt ws open', hn) || send(pkt(0x10, [...str('MQTT'), 4, 2, 0, 60, ...str('q' + E2E.hex(crypto.getRandomValues(new Uint8Array(8))))]));
  ws.onmessage = e => {
    buf = E2E.cat(buf, new Uint8Array(e.data));
    for (;;) {
      if (buf.length < 2) return;
      let i = 1, mul = 1, rem = 0, b; do { if (i >= buf.length) return; b = buf[i++]; rem += (b & 127) * mul; mul *= 128; if (mul > 128 ** 4) return ws.close(); } while (b & 128);
      if (buf.length < i + rem) return;
      const type = buf[0] >> 4, body = buf.slice(i, i + rem), flags = buf[0] & 15; buf = buf.slice(i + rem);
      if (type === 2) {
        if (body[1] !== 0) return ws.close();
        dbg('mqtt connack ok, subscribed', hn); const sub = () => send(pkt(0x82, [0, 1, ...str(topic), 0])); sub(); o.ready = true; o.q.splice(0).forEach(send);
        ping = setInterval(() => { send(Uint8Array.from([0xc0, 0])); sub(); }, 25000);
      } else if (type === 9) {
        dbg('mqtt suback', hn, body[2]); if (body.length >= 3 && body[2] === 0x80) { o.ready = false; try { ws.close(); } catch {} }
      } else if (type === 3 && body.length > 2) {
        const tl = (body[0] << 8) | body[1]; let p = 2 + tl; if ((flags >> 1) & 3) p += 2;
        if (p <= body.length) { try { onMsg(td.decode(body.slice(p))); } catch {} }
      }
    }
  };
  ws.onclose = ws.onerror = ev => { if (!o.closed || ev.type === 'error') dbg('mqtt ' + ev.type, hn, ev.code || ''); o.closed = true; o.ready = false; clearInterval(ping); };
  o.pub = s => { const u = pkt(0x30, [...str(topic), ...te.encode(s)]); if (o.ready) send(u); else if (!o.closed) o.q.push(u); };
  return o;
}

function ntfyOpen(spec, topic, onMsg) {
  const base = spec.slice(5).replace(/\/$/, ''), hn = base.replace(/^https?:\/\//, ''), tp = String(topic).replace(/[^A-Za-z0-9_-]/g, '-').slice(0, 64);
  const POLL = 3000, o = { ready: false, closed: false, url: spec };
  let since = String(Math.floor(Date.now() / 1000) - 3), wait = POLL, tm = 0, fails = 0, lastHi = 0;
  o.close = () => { o.closed = true; clearTimeout(tm); };
  const poll = async () => {
    if (o.closed) return;
    const ctl = new AbortController(), to = setTimeout(() => ctl.abort(), 8000);
    try {
      const r = await fetch(base + '/' + tp + '/json?poll=1&since=' + encodeURIComponent(since), { signal: ctl.signal, cache: 'no-store' });
      if (r.status === 429) { wait = Math.min(wait * 2, 20000); if (!o.limited) { o.limited = 1; dbg('ntfy rate limit', hn); } }
      else if (!r.ok) throw new Error('http ' + r.status);
      else {
        const txt = await r.text(); wait = POLL; fails = 0; o.limited = 0;
        if (!o.ready) { o.ready = true; dbg('ntfy ready', hn); }
        for (const line of txt.split('\n')) {
          if (!line) continue; let m; try { m = JSON.parse(line); } catch { continue; }
          if (m.event === 'message' && typeof m.message === 'string') { if (m.id) since = m.id; try { onMsg(m.message); } catch {} }
        }
      }
    } catch (e) { if (!fails++) dbg('ntfy error', hn, e.name === 'AbortError' ? 'timeout' : e.message); if (fails > 2) o.ready = false; wait = Math.min(POLL + fails * 1500, 10000); }
    finally { clearTimeout(to); }
    if (!o.closed) tm = setTimeout(poll, wait);
  };
  o.pub = (s, urgent) => { if (o.closed) return; if (!urgent) { if (Date.now() - lastHi < 9000) return; lastHi = Date.now(); }
    fetch(base + '/' + tp, { method: 'POST', body: s, cache: 'no-store' }).then(r => { if (r.status === 429 && !o.limited) { o.limited = 1; dbg('ntfy rate limit (publish)', hn); } }).catch(() => {}); };
  poll(); return o;
}
const relayOpen = (u, topic, onMsg) => u.startsWith('ntfy:') ? ntfyOpen(u, topic, onMsg) : mqttOpen(u, topic, onMsg);

const FLOW = ['key', 'relay', 'direct', 'hs', 'swap', 'done'];
const FICON = { key: '🔑', relay: '☁️', direct: '⚡', hs: '✍️', swap: '🔄', done: '🔒', err: '⚠️' };
let flowCur = -1, flowBad = false;
const vizHtml = () => `<div class="fnode"><span>📱</span><small>${esc(t('flowYou'))}</small></div><div class="flink"><i class="fl-line"></i><i class="fl-dot d1"></i><i class="fl-dot d2"></i><i class="fl-dot d3"></i><div class="fmid">🔑</div></div><div class="fnode r"><span>📱</span><small>${esc(t('flowPeer'))}</small></div>`;
function vizSet(el, st) { el.dataset.st = st; const m = el.querySelector('.fmid'); if (m) m.textContent = FICON[st] || '⚡'; }
function drawViz() {
  for (const id of ['fviz', 'fxViz']) { const el = $(id); if (!el) continue; const st = el.dataset.st || (id === 'fviz' ? 'key' : 'hs'); el.innerHTML = vizHtml(); vizSet(el, st); }
  const ol = $('fsteps'); if (ol) { ol.innerHTML = FLOW.map(id => `<li data-id="${id}"><span class="fi"></span><div><b>${esc(t('fs_' + id))}</b><small>${esc(t('fs_' + id + '_d'))}</small></div></li>`).join(''); flowPaint(); }
}
function flowPaint() {
  const ol = $('fsteps'); if (!ol) return;
  { const id = FLOW[Math.max(0, flowCur)]; $('fnowT').textContent = t('fs_' + id); $('fnowD').textContent = t('fs_' + id + '_d'); }
  ol.querySelectorAll('li').forEach((li, k) => { li.className = flowBad && k === flowCur ? 'bad' : k < flowCur || (k === flowCur && flowCur === FLOW.length - 1) ? 'done' : k === flowCur ? 'act' : ''; });
}
function flowDetail(kind, text) {
  if (flowBad) return; const e = $('fdet'); if (!e) return;
  if (!text) { e.classList.add('hidden'); return; }
  e.className = 'stat ' + kind; $('fdetT').textContent = text;
}
let flowAt = 0, flowHintT = null;
$('fMore').onclick = () => { const o = $('fsteps'); o.classList.toggle('hidden'); const h = o.classList.contains('hidden'); $('fMore').textContent = t(h ? 'fMore' : 'fLess'); $('fnowT').parentNode.classList.toggle('hidden', !h); };
function sameNet() {
  if (!pc || !pc.localDescription || !pc.remoteDescription) return false;
  const ips = (d, typ) => [...String(d).matchAll(new RegExp('^a=candidate:\\S+ \\d+ udp \\d+ (\\S+) \\d+ typ ' + typ, 'gm'))].map(m => m[1]);
  const a = pc.localDescription.sdp, b = pc.remoteDescription.sdp;
  if (ips(a, 'srflx').some(x => ips(b, 'srflx').includes(x))) return true;
  return false;
}
function flowHint() {
  const e = $('fHint'); if (!e) return; const el = Date.now() - flowAt, id = FLOW[flowCur];
  const k = flowBad || el < 15000 ? '' : id === 'relay' ? (el < 20000 ? '' : 'hintPeer') : id === 'direct' ? (sameNet() ? 'hintSame' : el < 20000 ? '' : 'hintDirect') : '';
  e.classList.toggle('hidden', !k); if (k) e.textContent = t(k);
}
function flowShow() {
  flowAt = Date.now(); clearInterval(flowHintT); flowHintT = setInterval(flowHint, 2000); $('fHint').classList.add('hidden'); $('fsteps').classList.add('hidden'); $('fnowT').parentNode.classList.remove('hidden'); $('fMore').textContent = t('fMore');
  flowCur = -1; flowBad = false; $('pwCard').classList.add('hidden'); $('pwChoice').classList.add('hidden'); $('pwFlow').classList.remove('hidden');
  $('fRetry').classList.add('hidden'); $('fCancel').classList.remove('hidden'); $('fdet').classList.add('hidden');
  vizSet($('fviz'), 'key'); flowStage('key');
}
let pwModeCur = null;
function flowHide() { clearInterval(flowHintT); $('pwFlow').classList.add('hidden'); $('pwCard').classList.toggle('hidden', !pwModeCur); $('pwChoice').classList.toggle('hidden', !!pwModeCur); }
function flowStage(id) {
  const i = FLOW.indexOf(id); if (i <= flowCur || flowBad) return;
  flowCur = i; flowAt = Date.now(); vizSet($('fviz'), id); flowPaint(); flowHint(); if (id === 'done') $('fCancel').classList.add('hidden');
}
function flowErr(msg) {
  if (flowBad) return; PW.seam = false; PW.flow = false;
  const oc = PW.oldClose; PW.oldClose = null; try { oc && oc(); } catch {} teardown();
  flowBad = true; vizSet($('fviz'), 'err'); flowPaint();
  const e = $('fdet'); e.className = 'stat bad'; $('fdetT').textContent = msg || t('flowLost');
  $('fCancel').classList.add('hidden'); $('fRetry').classList.remove('hidden');
}
function pwAbort() { PW.seam = false; PW.flow = false; const f = PW.oldClose; PW.oldClose = null; try { f && f(); } catch {} teardown(); flowHide(); }
$('fCancel').onclick = () => history.back();
$('fRetry').onclick = () => { pwStop(); pwMode(pwModeCur); };
function fxShow() { setHidden($('fxOv'), false); vizSet($('fxViz'), 'hs'); $('fxT').textContent = t('fxHs'); }
function fxHide() { setHidden($('fxOv'), true, 280); }
function fxDone() { if ($('fxOv').classList.contains('hidden')) return; vizSet($('fxViz'), 'done'); $('fxT').textContent = t('fxOk'); setTimeout(fxHide, 900); }
$('fxCancel').onclick = () => endChat(false);

function pwSet(kind, text) { flowDetail(kind, text); const e = $('pwStat'); if (!text) { e.classList.add('hidden'); return; } e.className = 'stat ' + kind; $('pwStatT').textContent = text; }
function pwReset() {
  PW.on = false; PW.tok = (PW.tok || 0) + 1; PW.timers.forEach(t => { clearInterval(t); clearTimeout(t); }); PW.timers = [];
  PW.socks.forEach(k => { try { k.close(); } catch {} }); PW.socks = []; PW.st = null; PW.flow = false; PW.seam = false; PW.resume = false;
  const oc = PW.oldClose; PW.oldClose = null; try { oc && oc(); } catch {}
}
function pwStop(keepConn) {
  PW.on = false; PW.tok = (PW.tok || 0) + 1; PW.timers.forEach(clearInterval); PW.timers = []; PW.socks.forEach(s => s.close()); PW.socks = []; PW.st = null;
  if (!keepConn) { teardown(); }
  $('pwGo').classList.remove('hidden'); $('pwCancel').classList.add('hidden'); $('pwGo').disabled = false; $('pwPass').disabled = $('pwXon').disabled = $('pwX').disabled = false;
  if (!keepConn) { pwSet('', ''); flowHide(); }
}
const pwPub = async o => { o.f = PW.st.fails | 0; o.w = IS_WK ? 1 : 0; const s = await pwSeal(PW.st.key, o); PW.socks.forEach(k => k.pub(s, o.t !== 'hi')); };
async function pwStart() {
  const pass = pwCanon($('pwPass').value);
  if (!pass) { toast(t('pwShort'), 4500); $('pwPass').focus(); return; }
  const extra = pwIsProt($('pwPass').value) ? $('pwX').value : '';
  if (pwIsProt($('pwPass').value) && extra.length < 6) { toast(t(extra ? 'pwXShort' : 'passEmpty'), 4500); $('pwXbox').classList.remove('hidden'); $('pwX').focus(); return; }
  if (cfg.relay && !hasTurn()) { toast(t('relayNeedTurn'), 4500); return; }
  if (liveConn() && !await askConfirm(t('closeConnQ'), t('closeConnT'), t('goOn'))) return;
  pwReset(); RS = null;
  $('pwGo').classList.add('hidden'); $('pwCancel').classList.remove('hidden'); $('pwPass').disabled = $('pwXon').disabled = $('pwX').disabled = true; flowShow(); pwSet('go', t('pwDeriving'));
  const tok = PW.tok = (PW.tok || 0) + 1; PW.on = true;
  let d; try { d = await pwDerive(pass, PW.kind, extra); } catch (e) { toast(t('error') + ': ' + e.message); return pwStop(); }
  if (tok !== PW.tok || !PW.on) return;
  if (pwIsBurned(d.topic)) { pwStop(); pwSet('bad', t('pwBurned')); toast(t('pwBurned'), 4500); return; }
  pwRun(d, false);
}
function pwRun(d, resume) {
  flowStage('relay'); teardown(); PW.on = true;
  PW.st = { resume: !!resume, bx: 0, ...d, id: E2E.hex(crypto.getRandomValues(new Uint8Array(8))), peer: null, lastOffer: '', lastOfferAt: 0, busy: false, lastAns: '', fails: 0, pf: 0, failAt: 0 };
  const seen = new Set(), open1 = u => { const k = relayOpen(u, d.topic, async raw => {
    if (!PW.on || seen.has(raw)) return; seen.add(raw); if (seen.size > 500) seen.clear();
    const m = await pwOpen(PW.st.key, raw); if (m && PW.on) { PW.st.bx = 0; pwOnMsg(m).catch(e => console.error('pw', e)); }
    else if (!m && PW.on && PW.st && PW.st.prot && !PW.st.peer && ++PW.st.bx >= 2) pwSet('bad', t('pwXBad'));
  }); k.url = u; return k; };
  dbg((resume ? 'resume' : 'pwStart') + ' kind=' + PW.kind, netInfo()); PW.open1 = open1; PW.socks = BROKERS.map(open1);
  pwSet('go', t('pwWaiting'));
  const hi = () => { if (PW.on && PW.st && !liveConn()) pwPub({ t: 'hi', id: PW.st.id, n: Math.random() }); };
  PW.timers.push(setInterval(hi, 2500), setInterval(() => {
    if (!PW.on || !PW.st || liveConn()) return;
    PW.socks = PW.socks.map(k => k.closed ? (k.dead = (k.dead || 0) + 1, k.dead % 2 ? open1(k.url) : k) : k);
    const n = PW.socks.filter(k => k.ready).length, m = PW.socks.length;
    if (!n) pwSet('bad', t('pwNoRelay') + ' (0/' + m + ')');
    else if (!PW.st.peer) pwSet('go', t('pwWaiting') + ' · ' + t('pwRelays', { n, m }));
  }, 3000));
  setTimeout(hi, 700); setTimeout(hi, 1800);
  if (resume) {
    const T0 = Date.now(), LIM = 6 * 60000, tick = () => {
      if (!PW.on || !PW.st || liveConn() || !PW.st.resume) return;
      const n = PW.socks.filter(k => k.ready).length, m = PW.socks.length, left = Math.max(0, LIM - (Date.now() - T0)), S = PW.st;
      const ph = !n ? t('resPhRelay', { n, m }) : !S.peer ? t('resPhWait', { n, m }) : t('resPhFound', { k: S.tries || 1 });
      $('offTxt').textContent = t('resuming') + '\n' + ph + '\n' + t('resLeft', { s: fmtDur(left) });
    };
    tick(); PW.timers.push(setInterval(tick, 1000));
  }
  if (resume) PW.timers.push(setTimeout(() => { if (PW.on && !liveConn()) { dbg('resume timeout'); pwReset(); resumeUi(false); } }, 6 * 60000));
  else PW.timers.push(setTimeout(() => { if (PW.on && !liveConn()) pwSet('bad', t('pwTimeout')); }, 120000));
}
const pwFail = () => { const S = PW.st; if (!S || Date.now() - S.failAt < 6000) return; S.failAt = Date.now(); S.fails++; dbg('roles: failures=' + Math.max(S.fails, S.pf) + ' → ' + (pwIsOfferer() ? 'offer' : 'answer')); };
const IS_WK = /iP(hone|ad|od)/.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1) || (/safari/i.test(navigator.userAgent) && !/chrome|chromium|crios|fxios|edg|android/i.test(navigator.userAgent));
function pwIsOfferer(peer) {
  const S = PW.st, p = peer || S.peer; if (!p) return false;
  const mine = IS_WK ? 1 : 0, base = S.pw === 0 || S.pw === 1 ? (S.pw !== mine ? mine === 1 : S.id < p) : S.id < p;
  return base !== (Math.max(S.fails, S.pf) % 2 === 1);
}
async function pwOnMsg(m) {
  const S = PW.st; if (!S || !m || typeof m !== 'object' || typeof m.id !== 'string' || m.id === S.id || !/^[a-f0-9]{16}$/.test(m.id)) return;
  if (liveConn()) return;
  if (m.w === 0 || m.w === 1) S.pw = m.w;
  if (typeof m.f === 'number' && m.f > S.pf && m.f < 100) S.pf = m.f | 0;
  dbg('pw msg', m.t, 'from', m.id.slice(0, 4), m.code ? 'len ' + m.code.length : '');
  if (m.t === 'hi') {
    if (S.peer && S.peer !== m.id) { if (S.busy || (pc && pc.signalingState !== 'stable' && pc.remoteDescription)) return; S.peer = m.id; S.lastOffer = ''; }
    if (!S.peer) { S.peer = m.id; flowStage('direct'); pwSet('go', t('pwFound')); pwShareClose(); }
    if (pc && pc.remoteDescription && !S.retry) return;
    S.retry = false;
    if (pwIsOfferer(m.id) && !S.busy) await pwOffer(m.id);
    return;
  }
  if (m.to !== S.id || typeof m.code !== 'string' || m.code.length > 6000) return;
  if (S.peer && S.peer !== m.id) return; if (!S.peer) S.peer = m.id;
  if (m.t === 'offer' && !pwIsOfferer(m.id)) await pwAnswer(m.code, m.id);
  else if (m.t === 'ans' && pwIsOfferer(m.id)) await pwApply(m.code);
}
function pwRetryNow() {
  const S = PW.st; if (!PW.on || !S || liveConn() || S.busy) return;
  dbg('retry now'); pwSet('go', t('pwRetry')); S.retry = true;
  pwPub({ t: 'hi', id: S.id, n: Math.random() }).catch(() => {});
  if (S.peer && pwIsOfferer(S.peer)) pwOffer(S.peer);
}
async function pwOffer(to) {
  const S = PW.st;
  if (S.lastOffer && pc && pc.signalingState === 'have-local-offer') {
    if (Date.now() - S.lastOfferAt > 4000) { S.lastOfferAt = Date.now(); await pwPub({ t: 'offer', id: S.id, to, code: S.lastOffer }); }
    return;
  }
  S.busy = true; S.tries = (S.tries || 0) + 1; dbg('pwOffer: creating, try #' + S.tries);
  try {
    ident = await E2E.genIdentity(); newPeer(false); curPsk = S.psk; bindDc(pc.createDataChannel('chat', { ordered: true }));
    pwSet('go', t('pwConnecting')); flowStage('direct');
    await pc.setLocalDescription(await pc.createOffer()); await iceDone();
    if (!PW.on) return;
    if (!/^a=candidate:/m.test(pc.localDescription.sdp)) throw new Error(t('st_nocand'));
    dbg('pwOffer: ice gathered', gst.n, 'cands, ext=' + gst.ext, 'state ' + pc.iceGatheringState); S.lastOffer = await pack(pc.localDescription, ''); S.lastOfferAt = Date.now(); await pwPub({ t: 'offer', id: S.id, to, code: S.lastOffer });
    watchdog();
  } catch (e) { dbg('pwOffer error', e.message); pwSet('bad', e.message || t('e_process')); S.lastOffer = ''; S.retry = true; setTimeout(pwRetryNow, 2500); }
  finally { S.busy = false; }
}
async function pwAnswer(code, to) {
  const S = PW.st; if (S.busy) return;
  if (code === S.lastAns && !S.retry) { if (S.ansCode && Date.now() - (S.ansAt || 0) > 3000) { S.ansAt = Date.now(); await pwPub({ t: 'ans', id: S.id, to, code: S.ansCode }); } return; }
  S.retry = false;
  S.busy = true; S.tries = (S.tries || 0) + 1; dbg('pwAnswer: creating, try #' + S.tries);
  try {
    pwSet('go', t('pwConnecting')); flowStage('direct');
    const { desc: offer } = await unpack(code, ''); if (offer.type !== 'offer') return;
    ident = await E2E.genIdentity(); newPeer(true); curPsk = S.psk; pc.ondatachannel = e => bindDc(e.channel);
    await pc.setRemoteDescription(offer); await pc.setLocalDescription(await pc.createAnswer()); await iceDone();
    if (!PW.on) return;
    if (!/^a=candidate:/m.test(pc.localDescription.sdp)) throw new Error(t('st_nocand'));
    dbg('pwAnswer: ice gathered', gst.n, 'cands, ext=' + gst.ext); S.lastAns = code; S.ansCode = await pack(pc.localDescription, ''); S.ansAt = Date.now(); await pwPub({ t: 'ans', id: S.id, to, code: S.ansCode });
    watchdog();
  } catch (e) { dbg('pwAnswer error', e.message); pwSet('bad', e.message || t('e_process')); S.lastAns = ''; S.retry = true; setTimeout(pwRetryNow, 2500); }
  finally { S.busy = false; }
}
async function pwApply(code) {
  const S = PW.st; if (!pc || pc.signalingState !== 'have-local-offer' || S.busy) return;
  S.busy = true; dbg('pwApply: answer received');
  try { const { desc } = await unpack(code, ''); if (desc.type === 'answer' && pc.signalingState === 'have-local-offer') await pc.setRemoteDescription(desc); }
  catch (e) { dbg('pwApply error', e.message); pwSet('bad', e.message || t('e_apply')); }
  finally { S.busy = false; }
}

$('pwGen').onclick = () => { $('pwPass').value = pwGenerate(pwModeCur === 'create' && $('pwXon').checked); pwStrength(); };
$('pwXon').onchange = () => { $('pwPass').value = pwGenerate($('pwXon').checked); pwStrength(); if ($('pwXon').checked) $('pwX').focus(); };
$('pwX').addEventListener('keydown', e => { if (e.key === 'Enter') pwStart(); });
document.addEventListener('securitypolicyviolation', e => { if (PW.on && /^wss?:/i.test(e.blockedURI || '')) pwSet('bad', t('pwBlocked')); });
$('pwCopy').onclick = async () => { const v = pwCanon($('pwPass').value); if (!v) return; try { await navigator.clipboard.writeText(v); toast(t('copied')); } catch { toast(t('copyFail')); } };
function pwStrength() {
  const ok = !!pwCanon($('pwPass').value), n = $('pwHint');
  const j = pwModeCur === 'join'; n.textContent = ok && j ? t('pwOk') : ''; n.className = 'note ' + (ok && j ? 'good' : ''); pwXUi();
}
function pwXUi() {
  const j = pwModeCur === 'join', on = j ? pwIsProt($('pwPass').value) : $('pwXon').checked, e = $('pwX'), k = j ? 'passJPh' : 'pwXPh';
  $('pwXbox').classList.toggle('hidden', !on); $('pwXn').classList.toggle('hidden', j); if (e.dataset.tp !== k) { e.dataset.tp = k; e.placeholder = t(k); } if (!on && !e.disabled) e.value = '';
  pwXLen();
}
const pwXLen = () => { $('pwXl').textContent = $('pwX').value.length < 6 ? t('pwXMin') : ''; };
$('pwX').addEventListener('input', pwXLen);
if (!(window.CSS && CSS.supports && CSS.supports('-webkit-text-security', 'disc'))) $('pwX').type = 'password';
function pwJoinGo() {
  const raw = $('pwPass').value; if (!pwCanon(raw)) return; pwXUi();
  if (pwIsProt(raw) && $('pwX').value.length < 6) { toast(t('e_needPass'), 4000); $('pwX').focus(); return; }
  pwStart();
}
$('pwPass').addEventListener('input', pwStrength);
$('pwPass').addEventListener('keydown', e => { if (e.key === 'Enter') pwStart(); });
$('pwGo').onclick = pwStart;
$('pwCancel').onclick = () => pwStop();
const pwShareClose = () => { if (sheetOpen && $('sheet').querySelector('#pwQrBox')) closeSheet(); };
$('pwQr').onclick = async () => {
  const v = pwCanon($('pwPass').value); if (!v) return toast(t('pwShort'), 3500);
  if (!PW.on) { await pwStart(); if (!PW.on) return; }
  openSheet(`<h3>${esc(t('pwQrH'))}</h3><p class="note" style="margin:0">${esc(t('pwQrP'))}</p><div class="qrbox" id="pwQrBox"></div><button class="btn" id="pwQrOk">${esc(t('close'))}</button>`,
    s => { showQr(s.querySelector('#pwQrBox'), (PW.kind === 'share' ? 'FS1:' : 'PW1:') + v); s.querySelector('#pwQrOk').onclick = closeSheet; });
};
$('pwLink').onclick = async () => {
  const v = pwCanon($('pwPass').value); if (!v) return toast(t('pwShort'), 3500);
  try { await navigator.clipboard.writeText(location.href.split('#')[0] + (PW.kind === 'share' ? '#s=' : '#p=') + v); toast(t('pwLinkCopied')); } catch { toast(t('copyFail')); }
};
async function pwLinkOpen(code, kind = 'chat') {
  const c = pwCanon(code); if (!c) { toast(t('pwScanBad'), 4000); return; }
  if (await askConfirm(t(kind === 'share' ? 'shLinkQ' : 'pwLinkQ'), t(kind === 'share' ? 'shLinkT' : 'pwLinkT'), t('rmEnter'))) { openPw(c, kind); pwJoinGo(); }
}
$('pwScan').onclick = async () => {
  const c = await scanQr(); if (!c) return;
  const sh = PW.kind === 'share', pc1 = new RegExp('^' + (sh ? 'FS1' : 'PW1') + ':').test(c) ? c.slice(4) : (new RegExp('#' + (sh ? 's' : 'p') + '=([a-z0-9-]+)$').exec(c) || [])[1];
  if (!pc1 || !pwCanon(pc1)) return toast(t('pwScanBad'), 4000);
  $('pwPass').value = pwCanon(pc1); pwStrength(); toast(t('pwScanned'), 3000); if (pwModeCur === 'join') pwJoinGo();
};
function pwMode(m) {
  pwModeCur = m; const j = m === 'join';
  $('pwChoice').classList.toggle('hidden', !!m); $('pwCard').classList.toggle('hidden', !m);
  document.querySelectorAll('#pwCard .pwC').forEach(e => e.classList.toggle('hidden', j)); document.querySelectorAll('#pwCard .pwJ').forEach(e => e.classList.toggle('hidden', !j));
  if (!m) return;
  const sh = PW.kind === 'share';
  $('pwTT').textContent = t(j ? 'pwTJoin' : 'pwTCreate'); $('pwPP').textContent = t(j ? 'pwPJoin' : sh ? 'shPCreate' : 'pwPCreate');
  $('pwXon').checked = false; $('pwX').value = ''; $('pwPass').readOnly = !j; $('pwPass').value = j ? '' : pwGenerate(); pwStrength(); pwSet('', '');
}
function pwKindUi() {
  const sh = PW.kind === 'share', set = (id, k) => { const e = $(id); e.dataset.t = k; e.textContent = t(k); };
  set('pwHd', sh ? 'shH' : 'pwH'); set('pwCT', sh ? 'shT' : 'pwT'); set('pwCP', sh ? 'shP' : 'pwP'); set('pwCb', sh ? 'shCreate' : 'pwCreate'); set('pwCs', sh ? 'shCreateS' : 'pwCreateS');
  $('pwModeG').classList.toggle('hidden', sh);
}
function openPw(prefill, kind) { if (!liveConn() && !PW.on && !PW.seam) { pwReset(); teardown(); }
  if (kind) PW.kind = kind; else if (!PW.on && !PW.seam) PW.kind = 'chat'; pwKindUi(); show('pw'); pwSet('', ''); pwMode(pwCanon(prefill) ? 'join' : null); if (pwCanon(prefill)) { $('pwPass').value = pwCanon(prefill); pwStrength(); } }
$('pwModeC').onclick = () => pwMode('create'); $('pwModeJ').onclick = () => pwMode('join');
$('pwPaste').onclick = async () => {
  let v = ''; try { v = await navigator.clipboard.readText(); } catch {}
  const c = pwCanon(String(v).trim().replace(/^(PW1|FS1):/, ''));
  if (!c) { toast(t('pwPasteBad'), 3500); $('pwPass').focus(); return; }
  $('pwPass').value = c; pwStrength(); pwJoinGo();
};
$('pwPass').addEventListener('paste', () => setTimeout(() => { if (pwModeCur === 'join') pwJoinGo(); }, 30));


function pwWake() {
  dbg('wake: hidden=' + document.hidden, 'pwOn=' + PW.on, 'ice=' + (pc && pc.iceConnectionState), netInfo());
  if (document.hidden) return;
  netChanged('wake');
  if (PW.on && PW.st && PW.open1 && !liveConn()) {
    PW.socks.forEach(k => { try { k.close(); } catch {} }); PW.socks = BROKERS.map(PW.open1);
    if (pc && !['connected', 'completed'].includes(pc.iceConnectionState)) { PW.st.retry = true; PW.st.lastOffer = ''; PW.st.busy = false; }
    setTimeout(() => { if (PW.on && PW.st && !liveConn()) pwPub({ t: 'hi', id: PW.st.id, n: Math.random() }).catch(() => {}); }, 900);
  }
}
document.addEventListener('visibilitychange', pwWake); addEventListener('pageshow', pwWake); addEventListener('online', pwWake);

let RS = null, viaPw = false;
async function rsDerive(rs) {
  const h = async l => new Uint8Array(await crypto.subtle.digest('SHA-256', E2E.cat(te.encode(l), rs)));
  const [a, b, c] = [await h('P2P-RESUME-topic'), await h('P2P-RESUME-key'), await h('P2P-RESUME-psk')];
  return { topic: 'p2pr/' + E2E.hex(a.slice(0, 16)), key: await crypto.subtle.importKey('raw', b, 'AES-GCM', false, ['encrypt', 'decrypt']), psk: c };
}
function resumeUi(on) {
  $('offTxt').dataset.t = on ? 'resuming' : 'noLink'; $('offTxt').textContent = t(on ? 'resuming' : 'noLink');
  $('btnReconnect').dataset.t = on ? 'cancel' : 'flowNew'; $('btnReconnect').textContent = t(on ? 'cancel' : 'flowNew');
}
async function resumeStart(rs, kind) {
  if (cfg.relay && !hasTurn()) return;
  pwReset(); PW.kind = kind; PW.resume = true; const tok = PW.tok = (PW.tok || 0) + 1; PW.on = true; resumeUi(true);
  let d; try { d = await rsDerive(rs); } catch (e) { dbg('resume derive error', e.message); pwReset(); resumeUi(false); return; }
  if (tok !== PW.tok || !PW.on) return;
  pwRun(d, true);
}


let NET = null, netBusy = null;
const brokerHost = u => u.replace(/^(ntfy:)?(wss|https):\/\//, '').split('/')[0];
function netProbeBroker(u) {
  return new Promise(res => {
    const t0 = Date.now(); let ws, done = false;
    const fin = ok => { if (done) return; done = true; clearTimeout(tm); try { ws && ws.close(); } catch {} res({ host: brokerHost(u), ok, ms: Date.now() - t0 }); };
    const tm = setTimeout(() => fin(false), 7000);
    if (u.startsWith('ntfy:')) { fetch(u.slice(5) + '/v1/health', { cache: 'no-store' }).then(r => fin(r.ok), () => fin(false)); return; }
    try { ws = new WebSocket(u, 'mqtt'); ws.onopen = () => fin(true); ws.onerror = () => fin(false); ws.onclose = () => fin(false); } catch { fin(false); }
  });
}
function netProbeStun() {
  return new Promise(res => {
    let c = null, done = false; const t0 = Date.now(), seen = new Map(), urls = new Set();
    const fin = () => { if (done) return; done = true; clearTimeout(tm); try { c && c.close(); } catch {} res({ ok: seen.size > 0, ms: Date.now() - t0, sym: [...seen.values()].some(x => x.size > 1) }); };
    const tm = setTimeout(fin, 5000);
    try {
      c = new RTCPeerConnection({ iceServers: STUNS.map(u => ({ urls: u })) }); c.createDataChannel('n');
      c.onicecandidate = e => {
        if (!e.candidate) return fin();
        const m = / (\S+) (\d+) typ srflx raddr \S+ rport (\d+)/.exec(e.candidate.candidate); if (!m) return;
        const x = seen.get(m[3]) || new Set(); x.add(m[1] + ':' + m[2]); seen.set(m[3], x); urls.add(e.candidate.url || m[1] + m[2]);
        if (urls.size >= STUNS.length) setTimeout(fin, 300);
      };
      c.createOffer().then(o => c.setLocalDescription(o)).catch(fin);
    } catch { fin(); }
  });
}
function netRun() {
  if (netBusy) return netBusy;
  netBusy = (async () => {
    const [stun, ...brk] = await Promise.all([netProbeStun(), ...BROKERS.map(netProbeBroker)]), up = brk.filter(b => b.ok).length;
    return NET = { online: navigator.onLine, brk, stun, verdict: !navigator.onLine || up === 0 ? 'bad' : (!stun.ok || stun.sym ? 'warn' : 'ok') };
  })().finally(() => { netBusy = null; });
  return netBusy;
}
function netSheet() {
  openSheet(`<h3>${esc(t('netH'))}</h3><div id="netBody"><p class="note">${esc(t('netChecking'))}</p></div>
    <button class="btn" id="netAgain">${esc(t('netAgain'))}</button><button class="btn sec" id="netClose">${esc(t('close'))}</button>`, s => {
    const body = s.querySelector('#netBody'), again = s.querySelector('#netAgain');
    const row = (ok, title, sub) => `<div class="chk ${ok ? 'ok' : 'no'}"><i>${ok ? '✓' : '✗'}</i><div>${esc(title)}${sub ? `<small>${esc(sub)}</small>` : ''}</div></div>`;
    const draw = n => {
      let h = n.online ? '' : `<p class="note">${esc(t('netOff'))}</p>`;
      n.brk.forEach(b => { h += row(b.ok, t('netBrk') + ': ' + b.host, b.ok ? b.ms + ' ms' : ''); });
      h += row(n.stun.ok && !n.stun.sym, t('netStun'), !n.stun.ok ? '' : n.stun.sym ? t('netSym') : n.stun.ms + ' ms');
      h += `<p class="note ${n.verdict === 'ok' ? 'good' : ''}" style="margin-top:10px">${esc(t(n.verdict === 'ok' ? 'netOk' : n.verdict === 'warn' ? (n.stun.sym ? 'netWarnSym' : 'netWarn') : 'netBad'))}</p>`;
      if (n.verdict !== 'bad') h += `<p class="note">${esc(t('netNote'))}</p>`;
      body.innerHTML = h;
    };
    const go = async () => { again.disabled = true; body.innerHTML = `<p class="note">${esc(t('netChecking'))}</p>`; const n = await netRun(); again.disabled = false; if (sheetOpen && s.contains(body)) draw(n); };
    again.onclick = go; s.querySelector('#netClose').onclick = closeSheet; go();
  });
}

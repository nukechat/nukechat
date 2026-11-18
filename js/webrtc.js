'use strict';
const STUNS = ['stun:stun.l.google.com:19302', 'stun:stun1.l.google.com:19302', 'stun:stun.cloudflare.com:3478', 'stun:global.stun.twilio.com:3478'];
function iceConfig() {
  const s = [], relay = hasTurn();
  if (cfg.stun && !relay) STUNS.forEach(u => s.push({ urls: u }));
  for (const line of String(cfg.ice || '').split('\n')) {
    const p = line.trim().split(/\s+/);
    if (/^(turns?|stuns?):/i.test(p[0])) { const o = { urls: p[0] }; if (p[1]) { o.username = p[1]; o.credential = p[2] || ''; } s.push(o); }
  }
  return Object.assign({ iceServers: s, iceCandidatePoolSize: 0, bundlePolicy: 'max-bundle' }, relay ? { iceTransportPolicy: 'relay' } : {});
}
const hasTurn = () => /^\s*turns?:/mi.test(String(cfg.ice || ''));
let gst = { n: 0, ext: false, last: 0 }, connTimer = null;
function setStat(kind, text) {
  if (screen === 'pw') return pwSet(kind, text);
  const e = $('cStat'); if (!text) { e.classList.add('hidden'); return; }
  e.className = 'stat ' + kind; $('cStatT').textContent = text;
}
async function iceStats(tag, qq, who) {
  const q = qq || pc; if (!q) return;
  try {
    const st = await q.getStats(), pairs = [], cand = new Map(); let sel = null;
    st.forEach(r => { if (r.type === 'local-candidate' || r.type === 'remote-candidate') cand.set(r.id, r); if (r.type === 'transport' && r.selectedCandidatePairId) sel = r.selectedCandidatePairId; if (r.type === 'candidate-pair') pairs.push(r); });
    const by = {}; pairs.forEach(r => by[r.state] = (by[r.state] || 0) + 1);
    const ty = id => { const c = cand.get(id); return c ? (c.candidateType || '?') + '/' + (c.protocol || '?') : '?'; };
    const nom = pairs.find(r => r.id === sel) || pairs.find(r => r.nominated && r.state === 'succeeded');
    const sent = pairs.reduce((a, r) => a + (r.requestsSent || 0), 0), got = pairs.reduce((a, r) => a + (r.responsesReceived || 0), 0), inb = pairs.reduce((a, r) => a + (r.requestsReceived || 0), 0);
    const rem = {}; cand.forEach(r => { if (r.type === 'remote-candidate') { const k = (r.candidateType || '?') + '/' + (r.protocol || '?') + (/\.local$/.test(r.address || r.ip || '') ? '/mdns' : /:/.test(r.address || r.ip || '') ? '/v6' : ''); rem[k] = (rem[k] || 0) + 1; } });
    dbg('ice stats [' + tag + ']' + (who ? ' ' + who : ''), 'remote=' + JSON.stringify(rem), 'pairs=' + pairs.length, JSON.stringify(by), 'checks sent=' + sent + ' answered=' + got + ' incoming=' + inb, nom ? 'selected ' + ty(nom.localCandidateId) + ' → ' + ty(nom.remoteCandidateId) + (nom.currentRoundTripTime != null ? ' rtt=' + Math.round(nom.currentRoundTripTime * 1000) + 'ms' : '') : 'no selected pair', netInfo());
  } catch (e) { dbg('ice stats error', e.message); }
}
function diag() {
  const c = d => { const o = { host: 0, srflx: 0, relay: 0 }; for (const m of String(d || '').matchAll(/^a=candidate:.* typ (host|srflx|relay)/gm)) o[m[1]]++; return `host ${o.host}, srflx ${o.srflx}, relay ${o.relay}`; };
  return pc && pc.localDescription && pc.remoteDescription ? t('diag', { a: c(pc.localDescription.sdp), b: c(pc.remoteDescription.sdp), s: pc.iceConnectionState }) : '';
}
const pskOf = async p => new Uint8Array(await crypto.subtle.digest('SHA-256', te.encode('P2P-PSK|' + p)));
function newPeer(isPolite) {
  teardown(); me.name = PW.kind === 'share' ? deviceEmoji() : randomNick(); polite = isPolite; ready = false; hello = false; makingOffer = false; const mine = ++genId;
  gst = { n: 0, ext: false, last: 0 }; clearTimeout(connTimer); clearTimeout(iceGrace); iceGrace = null; clearInterval(iceRetry);
  pc = new RTCPeerConnection(iceConfig());
  pc.addEventListener('icecandidate', e => { if (mine !== genId || !e.candidate) return; { const m = /candidate:\S+ \d+ (\w+) \d+ (\S+) (\d+) typ (\w+)/.exec(e.candidate.candidate) || []; dbg('cand', m[4] || '?', m[1] || '?', /\.local$/.test(m[2] || '') ? 'mdns' : String(m[2] || '').replace(/\d+$/, 'x').replace(/(:[0-9a-f]*)+$/i, ':…')); } gst.n++; gst.last = Date.now(); if (/ typ (srflx|relay)/.test(e.candidate.candidate)) gst.ext = true; });
  pc.addEventListener('icegatheringstatechange', () => mine === genId && pc && dbg('ice gathering', pc.iceGatheringState));
  pc.addEventListener('iceconnectionstatechange', () => { if (mine !== genId || !pc) return; dbg('ice connection', pc.iceConnectionState, diag()); if (pc.iceConnectionState === 'checking') { const q0 = pc; setTimeout(() => { if (q0 === pc && pc.iceConnectionState === 'checking') iceStats('checking+4s', q0); }, 4000); } if (['connected', 'completed', 'failed'].includes(pc.iceConnectionState)) { const q = pc, st = pc.iceConnectionState; setTimeout(() => iceStats(st, q), 300); } if (pc.iceConnectionState === 'disconnected' && hello) { setTimeout(() => { if (mine === genId && pc && pc.iceConnectionState === 'disconnected') { iceRecover('disconnected'); iceWatch(); } }, 1500); } });
  pc.addEventListener('connectionstatechange', () => mine === genId && pc && dbg('pc state', pc.connectionState));
  pc.addEventListener('icecandidateerror', e => mine === genId && dbg('ice candidate error', e.errorCode, String(e.url || '').split('?')[0], String(e.errorText || '').slice(0, 80)));
  pc.oniceconnectionstatechange = () => {
    if (mine !== genId || !pc || (screen !== 'connect' && screen !== 'pw' && !(PW.st && PW.st.resume))) return; const s = pc.iceConnectionState;
    if (s === 'failed' && (screen === 'pw' || (PW.st && PW.st.resume)) && PW.st) { pwFail(); PW.st.retry = true; PW.st.lastOffer = ''; }
    if (s === 'checking') setStat('go', t('st_checking'));
    else if (s === 'connected' || s === 'completed') { clearTimeout(connTimer); setStat('ok', t('st_connected')); }
    else if (s === 'failed') { clearTimeout(connTimer); setStat('bad', t('st_failed') + ' ' + diag()); }
  };
  pc.onconnectionstatechange = () => {
    if (mine !== genId || !pc) return; const s = pc.connectionState;
    if (s === 'failed' && PW.st && !hello) { PW.st.retry = true; PW.st.lastOffer = ''; PW.st.busy = false; pwFail(); dbg('attempt failed: will try again on the next hello'); setTimeout(pwRetryNow, 1500); }
    if (s === 'failed' && hello && session && dc && dc.readyState === 'open' && !iceGrace) {
      iceRecover('failed'); iceWatch(); iceGrace = setTimeout(() => { iceGrace = null; if (mine === genId && pc && pc.connectionState !== 'connected') setOnline(false); }, 6000);
    } else if ((s === 'failed' && !iceGrace) || s === 'closed') setOnline(false);
    if (s === 'connected') { clearTimeout(iceGrace); iceGrace = null; }
    if (s === 'disconnected') { const t0 = Date.now(); clearInterval(unstT); unstT = setInterval(() => { if (mine !== genId || !pc || pc.connectionState !== 'disconnected' || !peer || !hello) { clearInterval(unstT); return; } if (Date.now() - t0 > 2500) { $('chSt').textContent = t('unstable') + ' ' + t('unstableSec', { s: Math.round((Date.now() - t0) / 1000) }); $('chSt').className = ''; } }, 1000); }
    if (s === 'connected' && peer && hello && session) { $('chSt').textContent = t('online'); $('chSt').className = 'on'; }
    if (s === 'failed' && (screen === 'connect' || screen === 'pw')) toast(t('connFailed'), 6000);
  };
  pc.ontrack = e => attachRemote(e.streams[0] || new MediaStream([e.track]));
  pc.onnegotiationneeded = async () => {
    if (!ready || !session) return;
    try { makingOffer = true; await pc.setLocalDescription(); sendJson({ t: 'sdp', d: pc.localDescription.toJSON(), ice: iceUntil > Date.now() }); }
    catch (e) { console.error(e); } finally { makingOffer = false; }
  };
  return pc;
}
function teardown() {
  endCall(false); clearTimeout(connTimer); clearTimeout(hs && hs.timer); curPsk = null;
  try { dc && dc.close(); } catch {} try { pc && pc.close(); } catch {}
  pc = dc = null; ready = false; hello = false; session = null; hs = hsP = null; if (incomingFile && incomingFile.w) { try { incomingFile.w.abort(); } catch {} } incomingFile = null; consent.clear(); fileAcks.clear(); for (const r of askWait.values()) r('lost'); askWait.clear(); fileAsk = null; rxQ = txQ = Promise.resolve();
}
function iceDone(maxMs = 10000) {
  const t0 = Date.now(), want = !!(iceConfig().iceServers.length);
  return new Promise(res => {
    const iv = setInterval(() => {
      if (!pc) { clearInterval(iv); return res(); }
      const el = Date.now() - t0, quiet = Date.now() - (gst.last || t0);
      const enough = (gst.n > 0 && el > maxMs) || (gst.n > 0 && quiet > 3000 && el > 5000), hopeless = el > (gst.n ? 25000 : 9000);
      if (pc.iceGatheringState === 'complete' || enough || hopeless || (gst.ext && quiet > 1200 && el > 1500) || (!want && gst.n > 0 && quiet > 1200)) { clearInterval(iv); res(); }
    }, 150);
  });
}

const wireLog = { out: null, in: null, nOut: 0, nIn: 0, bad: 0 };
const wire = (dir, plain, frame) => { wireLog[dir] = { plain, hex: E2E.hex(frame.slice(0, 48)), len: frame.length }; wireLog[dir === 'out' ? 'nOut' : 'nIn']++; };

function bindDc(ch) {
  dc = ch; dc.binaryType = 'arraybuffer'; dc.bufferedAmountLowThreshold = 1024 * 1024;
  dc.onopen = () => {
    dbg('datachannel open');
    ready = true; peer = null; hello = false; session = null; clearLog(); sys(t('sys_hs')); setHead(t('connecting'), '', true);
    const fromPw = PW.on;
    if (fromPw) {
      const S = PW.st; if (S) { pwBurn(S.topic); PW.role = S.peer && S.id < S.peer ? 'create' : 'join'; PW.flow = true; PW.seam = true; }
      pwStop(true); flowStage('hs'); pwShareClose();
    } else if (PW.seam) flowDetail('go', t('fd_swap'));
    if (!PW.seam) { show('chat', false, screen === 'connect' || screen === 'pw'); fxShow(); }
    setOnline(true, true); hsP = startHandshake();
  };
  dc.onclose = () => setOnline(false);
  dc.onmessage = onRaw;
}
function dropIncoming() {
  if (!incomingFile) return; const f = incomingFile; incomingFile = null; try { f.w && f.w.abort(); } catch {} try { removeMsg(f.b.el); } catch {} sys(t('sys_fileBad'), 'warn');
}
function drawMe() { $('chMe').textContent = me.name && !shareMode() ? t('youAre', { n: me.name }) : ''; }
function setHead(name, status, on) { drawMe(); $('chName').textContent = name; $('chSt').textContent = status; $('chSt').className = on ? 'on' : ''; drawLock(); }
function drawLock() {
  const lk = $('chLk');
  const was = !lk.classList.contains('hidden');
  lk.classList.toggle('hidden', !(hello && session)); lk.classList.toggle('v', !!(cur && cur.ver));
  if (!was && hello && session) { lk.classList.remove('pop'); void lk.getBoundingClientRect(); lk.classList.add('pop'); }
}
function wipeChat() {
  closeSheet(); if (typeof viewerOpen !== 'undefined' && viewerOpen) closeViewer(true); teardown(); pwReset(); RS = null; viaPw = false; resumeUi(false); clearLog(); setMode('chat'); cur = null; peer = null; ident = null; clearTimeout(typingT);
  for (const u of blobUrls) { try { URL.revokeObjectURL(u); } catch {} } blobUrls.clear();
  wireLog.out = wireLog.in = null; wireLog.nOut = wireLog.nIn = wireLog.bad = 0;
  me.name = randomNick(); $('text').value = ''; autosize(); fxHide(); setAv($('chAv'), me.name, 'me'); setHead(me.name, '', false);
}
function lostWipe() {
  const rs = RS, kind = PW.kind; wipeChat(); sys(t('sys_lost'), 'warn'); setHead(me.name, t('offlineSt'), false);
  if (rs) {
    if (kind === 'share') { setMode('share'); me.name = deviceEmoji(); setAv($('chAv'), me.name, 'me'); setHead(t('shTitle'), t('offlineSt'), false); }
    sys(t('resumeTry')); resumeStart(rs, kind);
  }
}
function setOnline(on, pending) {
  const live = on && dc && dc.readyState === 'open';
  if (!live && !pending) { if (PW.seam) flowErr(t('flowLost')); fxHide(); }
  $('offline').classList.toggle('hidden', !!live || !!pending);
  $('form').classList.toggle('hidden', !live);
  const ok = live && hello && !!session && shReady();
  $('text').disabled = !ok; $('btnSend').disabled = !ok; $('btnAttach').disabled = !ok; $('btnCall').classList.toggle('hidden', !ok || shareMode()); $('btnVideo').classList.toggle('hidden', !ok || shareMode());

  if (peer) { $('chSt').textContent = live && hello ? t('online') : t('offlineSt'); $('chSt').className = live && hello ? 'on' : ''; }
  if (!live) { endCall(false); const was = !!(peer && hello); hello = false; session = null; dropIncoming(); if (was) lostWipe(); }
  drawLock();
  if (screen === 'list') renderList();
}

async function startHandshake() {
  const mine = genId;
  const eph = await E2E.newEphemeral();
  const fpL = fpOf(pc && pc.localDescription && pc.localDescription.sdp), fpR = fpOf(pc && pc.remoteDescription && pc.remoteDescription.sdp);
  if (mine !== genId || !dc) return;
  if (!fpL || !fpR) { sys(t('hs_nofp')); return failSecure(); }
  const sig = await E2E.signHello(ident.priv, eph.pub, fpL, fpR, me.name);
  if (mine !== genId || !liveConn()) return;
  hs = { eph, fpL, fpR, timer: setTimeout(() => { if (!session && mine === genId) { sys(t('hs_timeout')); failSecure(); } }, 10000) };
  dc.send(JSON.stringify({ t: 'hs', v: 2, ik: b64e(ident.pub), ek: b64e(eph.pub), n: me.name, sig: b64e(sig) }));
}
function failSecure() { try { dc && dc.close(); } catch {} setOnline(false); }
async function finishHandshake(m) {
  if (session || !hs) return;
  let ik, ek, sig;
  try { ik = b64d(String(m.ik)); ek = b64d(String(m.ek)); sig = b64d(String(m.sig)); } catch { sys(t('hs_bad')); return failSecure(); }
  const name = cleanName(m.n) || t('peer');
  const claimedId = await E2E.idFromPub(ik);
  if (m.v !== 2 || ik.length !== 65 || ek.length !== 65 || sig.length !== 64 || ik[0] !== 4 || ek[0] !== 4) { sys(t('hs_bad')); return failSecure(); }
  if (ik.every((v, i) => v === ident.pub[i])) { sys(t('hs_bad')); return failSecure(); }
  if (!await E2E.verifyHello(ik, sig, ek, hs.fpR, hs.fpL, typeof m.n === 'string' && m.n.length <= 64 ? m.n : '')) { sys(t('hs_forged')); return failSecure(); }
  let s;
  try { s = await E2E.deriveSession({ ephPriv: hs.eph.priv, ownEk: hs.eph.pub, peerEk: ek, ownIk: ident.pub, peerIk: ik, fpL: hs.fpL, fpR: hs.fpR, psk: curPsk }); }
  catch { sys(t('hs_bad')); return failSecure(); }
  clearTimeout(hs.timer);
  session = s; hs.ik = ik; hs.sig = sig; hs.ek = ek; hs.nm = typeof m.n === 'string' && m.n.length <= 64 ? m.n : '';
  peer = { id: claimedId, name, ik };
  onSecure();
}
async function pwSwap() {
  dbg('pwSwap start role=' + (PW.role || 'create'));
  const role = PW.role || 'create', oc = dc, os = session, opc = pc;
  const sendOld = o => os.sealJson(o).then(f => { if (oc.readyState === 'open') oc.send(f); });
  let done = false, lastOffer = '', gotAns = false, timer = null, resend = null;
  const closeOld = () => { clearInterval(resend); clearTimeout(timer); oc.onmessage = oc.onclose = null; try { oc.close(); } catch {} try { opc.close(); } catch {} };
  const fail = msg => { if (done) return; dbg('pwSwap fail', msg || ''); done = true; closeOld(); PW.oldClose = null; sys(msg || t('swapFail'), 'warn'); if (PW.seam) flowErr(msg || t('swapFail')); setOnline(false); };
  sys(t('swapRun'));
  oc.onclose = null;
  oc.onmessage = e => { (async () => {
    if (typeof e.data === 'string') return;
    let m; try { const o = await os.open(new Uint8Array(e.data)); if (o.kind !== E2E.K_JSON) return; m = JSON.parse(td.decode(o.payload)); } catch { return; }
    if (!m || m.t !== 'rn' || typeof m.code !== 'string' || m.code.length > 6000) return;
    if (m.k === 'offer' && role === 'join') {
      if (m.code === lastOffer) return; lastOffer = m.code;
      const { desc } = await unpack(m.code, ''); if (desc.type !== 'offer' || done) return;
      ident = await E2E.genIdentity(); newPeer(true); curPsk = null; pc.ondatachannel = ev => bindDc(ev.channel);
      await pc.setRemoteDescription(desc); await pc.setLocalDescription(await pc.createAnswer()); await iceDone(); if (done) return;
      const ans = await pack(pc.localDescription, ''); sendOld({ t: 'rn', k: 'ans', code: ans });
    } else if (m.k === 'ans' && role === 'create' && !gotAns) {
      gotAns = true; clearInterval(resend);
      const { desc } = await unpack(m.code, ''); if (desc.type === 'answer' && pc.signalingState === 'have-local-offer') await pc.setRemoteDescription(desc);
    }
  })().catch(err => { console.error(err); fail(); }); };
  PW.oldClose = () => { done = true; closeOld(); };
  timer = setTimeout(() => fail(), 60000);
  pc = dc = null; session = null; hello = false; hs = hsP = null;
  if (role === 'create') {
    try {
      ident = await E2E.genIdentity(); newPeer(false); curPsk = null; bindDc(pc.createDataChannel('chat', { ordered: true }));
      await pc.setLocalDescription(await pc.createOffer()); await iceDone();
      if (!/^a=candidate:/m.test(pc.localDescription.sdp)) throw new Error(t('st_nocand'));
      const code = await pack(pc.localDescription, ''), send = () => sendOld({ t: 'rn', k: 'offer', code }).catch(() => {});
      send(); resend = setInterval(send, 3000);
    } catch (e) { fail(e.message); }
  }
}
let unstT = null, iceRestartAt = 0, iceUntil = 0, iceGrace = null, iceRetry = null;
function iceRecover(why) {
  if (!pc || !session || !hello || !dc || dc.readyState !== 'open') return false;
  const now = Date.now(); if (now - iceRestartAt < 3000) return false; iceRestartAt = now; iceUntil = now + 20000;
  dbg('ice restart:', why); try { pc.restartIce(); return true; } catch (e) { dbg('restartIce error', e.message); return false; }
}
function iceWatch() {
  clearInterval(iceRetry); let n = 0; const mine = genId;
  iceRetry = setInterval(() => {
    if (mine !== genId || !pc || !['disconnected', 'failed'].includes(pc.iceConnectionState) || ++n > 6) { clearInterval(iceRetry); return; }
    iceRecover('still ' + pc.iceConnectionState + ' #' + n);
  }, 6000);
}
const netChanged = why => { if (liveConn() && pc && hello) { const s = pc.iceConnectionState; if (s !== 'connected' && s !== 'completed') iceRecover(why); else if (why === 'network change') iceRecover(why); } };
addEventListener('online', () => netChanged('online'));
try { navigator.connection && navigator.connection.addEventListener('change', () => netChanged('network change')); } catch {}
function onSecure() {
  dbg('onSecure flow=' + PW.flow);
  if (PW.flow) { PW.flow = false; flowStage('swap'); flowDetail('go', t('fd_hs')); pwSwap(); return; }
  if (PW.oldClose) { const f = PW.oldClose; PW.oldClose = null; f(); }
  hello = true;
  cur = { ver: false, ik: b64e(peer.ik), mik: b64e(ident.pub) };
  clearLog();
  setMode(PW.seam && PW.kind === 'share' ? 'share' : 'chat'); viaPw = !!PW.seam; resumeUi(false);
  if (!onSecure.tip) { onSecure.tip = true; setTimeout(() => sys(t('tipEphemeral')), 50); }
  if (shareMode() && PW.resume) { shLocal = shPeer = true; cur.ver = true; }
  if (viaPw && PW.role === 'create') { RS = crypto.getRandomValues(new Uint8Array(32)); sendJson({ t: 'rs', s: b64e(RS) }).catch(() => {}); }
  if (shareMode()) { sys(t('sys_secureSh')); setAv($('chAv'), peer.name, peer.id); setHead(t('shTitle'), t('online'), true); setOnline(true); if (shReady()) { drawLock(); sys(t('resumed')); } else shGateOpen(); }
  else { sys(t('sys_secure', { n: peer.name })); sys(t('youAre', { n: me.name })); if (PW.resume) sys(t('resumed')); setAv($('chAv'), peer.name, peer.id); setHead(peer.name, t('online'), true); setOnline(true); }
  $('text').value = ''; autosize();
  flushRead(); vib(25);
  if (PW.seam) {
    flowStage('done'); flowDetail('ok', t('fd_done'));
    setTimeout(() => { PW.seam = false; if (screen === 'pw' && liveConn()) { show('chat', false, true); flowHide(); } }, 1200);
  } else fxDone();
}

function sendJson(o) {
  if (!session || !liveConn()) return Promise.resolve();
  const p = txQ.then(async () => { if (!session || !liveConn()) return; const f = await session.sealJson(o); wire('out', JSON.stringify(o).slice(0, 160), f); dc.send(f); }).catch(e => console.error('tx', e));
  txQ = p; return p;
}
function sendBin(u8) {
  if (!session || !liveConn()) return Promise.resolve();
  const p = txQ.then(async () => {
    if (!session || !liveConn()) return;
    if (dc.bufferedAmount > 4 * 1024 * 1024) await new Promise(r => dc.addEventListener('bufferedamountlow', r, { once: true }));
    const pad = new Uint8Array(2 + CHUNK); pad[0] = u8.length >> 8; pad[1] = u8.length & 255; pad.set(u8, 2);
    const f = await session.seal(E2E.K_BIN, pad); wire('out', '[' + u8.length + ' B]', f); dc.send(f);
  }).catch(e => console.error('tx', e));
  txQ = p; return p;
}
const rl = { t: 0, n: 0 };
function onRaw(e) {
  const d = e.data;
  rxQ = rxQ.then(async () => {
    if (typeof d === 'string') {
      if (session) return;
      let m; try { m = JSON.parse(d); } catch { return; }
      if (!m || m.t !== 'hs') return;
      await hsP; return finishHandshake(m);
    }
    if (!session) return;
    try {
      const f = new Uint8Array(d), o = await session.open(f);
      if (o.kind === E2E.K_JSON) {
        const now = Date.now(); if (now - rl.t > 5000) { rl.t = now; rl.n = 0; } if (++rl.n > 400) return;
        const m = JSON.parse(td.decode(o.payload)); wire('in', JSON.stringify(m).slice(0, 160), f); onMsg(m);
      } else if (o.kind === E2E.K_BIN) {
        const n = (o.payload[0] << 8) | o.payload[1]; if (n > o.payload.length - 2) throw new Error('bad chunk');
        wire('in', '[' + n + ' B]', f); onChunk(o.payload.slice(2, 2 + n));
      }
    } catch (err) {
      wireLog.bad++; console.warn('frame rejected', err);
      if (wireLog.bad >= 3) { sys(t('sys_badframes')); failSecure(); }
    }
  }).catch(err => console.error(err));
}

const usePass = () => $('passOn').checked && $('passC').value ? $('passC').value : '';
let ttlT = null, offerAt = 0;
function ttlTick() {
  const left = 90 - Math.floor((Date.now() - offerAt) / 1000), n = $('ttlNote');
  if (!$('offerBox') || $('offerBox').classList.contains('hidden')) return;
  if (!pc || pc.signalingState !== 'have-local-offer') { n.textContent = ''; clearInterval(ttlT); return; }
  if (left > 0) n.textContent = t('ttl', { s: left }); else { n.textContent = t('ttlOld'); $('btnGen').classList.add('pulse'); }
}
async function hostCreate() {
  if (cfg.relay && !hasTurn()) { toast(t('relayNeedTurn'), 4500); return; }
  if ($('passOn').checked && !$('passC').value) { toast(t('passEmpty'), 3500); $('passC').focus(); return; }
  const pass = usePass(); $('btnGen').disabled = true; $('btnGen').classList.remove('pulse'); $('btnGen').textContent = t('creating');
  setStat('go', t('st_gather'));
  try {
    ident = await E2E.genIdentity();
    newPeer(false); curPsk = pass ? await pskOf(pass) : null; bindDc(pc.createDataChannel('chat', { ordered: true }));
    await pc.setLocalDescription(await pc.createOffer()); await iceDone();
    if (!/^a=candidate:/m.test(pc.localDescription.sdp)) throw new Error(t('st_nocand'));
    offerRef = await refOf(pc.localDescription.sdp);
    const code = await pack(pc.localDescription, pass);
    offerAt = Date.now(); clearInterval(ttlT); ttlT = setInterval(ttlTick, 1000); ttlTick();
    $('offerOut').value = code; showQr($('offerQr'), code); $('offerBox').classList.remove('hidden'); $('cardAnswer').classList.remove('hidden');
    $('btnLinkCopy').classList.toggle('hidden', !/^https?:$/.test(location.protocol));
    $('btnGen').textContent = t('genAgain');
    if (cfg.stun && !gst.ext) setStat('bad', t('st_noext')); else setStat('go', t('st_waitAns'));
  } catch (e) { toast(t('error') + ': ' + e.message); $('btnGen').textContent = t('gen'); setStat('', ''); }
  $('btnGen').disabled = false;
}
function watchdog() {
  clearTimeout(connTimer);
  connTimer = setTimeout(() => { dbg('watchdog: ice=' + (pc && pc.iceConnectionState), diag()); if (PW.st && !liveConn()) { pwFail(); PW.st.retry = true; PW.st.lastOffer = ''; PW.st.busy = false; } if (pc && !['connected', 'completed'].includes(pc.iceConnectionState) && !liveConn()) setStat('bad', t('st_timeout') + ' ' + diag()); }, PW.st ? 25000 : 25000); { const q = pc; setTimeout(() => q && iceStats('watch', q), 24000); }
}
async function hostApply(code) {
  if (busy) return;
  if (!pc || pc.signalingState !== 'have-local-offer') {
    if (liveConn()) { toast(t('alreadyConn'), 3000); return; }
    toast(t('ansUsed'), 5000); $('answerIn').value = ''; hostCreate(); return;
  }
  busy = true;
  try {
    const { desc, ref } = await unpack(code, usePass());
    if (desc.type !== 'answer') throw new Error(t('e_needAnswer'));
    if (ref && ref !== offerRef) throw new Error(t('e_otherInvite'));
    if (pc.signalingState !== 'have-local-offer') return;
    await pc.setRemoteDescription(desc); clearInterval(ttlT); $('ttlNote').textContent = '';
    toast(t('connectingDots')); setStat('go', t('st_checking')); watchdog();
  } catch (e) { toast(e.message || t('e_apply'), 4500); }
  finally { busy = false; }
}
async function guestAnswer(code) {
  if (busy) return;
  const clean = code.replace(/\s+/g, '');
  if (clean === lastOffer && pc && pc.localDescription) { toast(t('ansExists')); $('cardAnsOut').scrollIntoView({ behavior: 'smooth' }); return; }
  if (cfg.relay && !hasTurn()) { toast(t('relayNeedTurn'), 4500); return; }
  busy = true; $('btnAnswer').textContent = t('mkAnsBusy'); setStat('go', t('st_gather'));
  try {
    const { desc: offer, enc } = await unpack(code, $('passJ').value);
    if (offer.type !== 'offer') throw new Error(t('e_needOffer'));
    const ref = await refOf(offer.sdp);
    ident = await E2E.genIdentity();
    newPeer(true); curPsk = enc ? await pskOf($('passJ').value) : null; pc.ondatachannel = e => bindDc(e.channel);
    await pc.setRemoteDescription(offer); await pc.setLocalDescription(await pc.createAnswer()); await iceDone();
    if (!/^a=candidate:/m.test(pc.localDescription.sdp)) throw new Error(t('st_nocand'));
    const ans = await pack(pc.localDescription, $('passJ').value, ref);
    lastOffer = clean; $('answerOut').value = ans; showQr($('answerQr'), ans); $('cardAnsOut').classList.remove('hidden');
    $('cardAnsOut').scrollIntoView({ behavior: 'smooth' });
    if (cfg.stun && !gst.ext) setStat('bad', t('st_noext')); else setStat('go', t('st_waitHost')); watchdog();
  } catch (e) { toast(e.message || t('e_process'), 4500); setStat('', ''); }
  finally { busy = false; $('btnAnswer').textContent = t('mkAns'); }
}
function resetConnectUi() {
  offerRef = lastOffer = ''; busy = false; clearInterval(ttlT); clearTimeout(connTimer);
  ['offerBox', 'cardAnswer', 'cardAnsOut', 'passJw', 'cStat'].forEach(i => $(i).classList.add('hidden'));
  ['offerOut', 'answerIn', 'offerIn', 'answerOut'].forEach(i => $(i).value = '');
  clearInterval($('offerQr')._t); clearInterval($('answerQr')._t); $('offerQr').innerHTML = $('answerQr').innerHTML = '';
  $('btnGen').textContent = t('gen'); $('btnGen').classList.remove('pulse'); $('btnAnswer').textContent = t('mkAns'); $('cSub').textContent = '';
}
async function startConnect(mode) {
  PW.kind = 'chat'; pwReset(); busy = false;
  if (liveConn()) {
    if (!await askConfirm(t('closeConnQ'), t('closeConnT'), t('goOn'))) return;
    teardown(); setOnline(false);
  }
  resetConnectUi();
  $('ipNote').classList.toggle('hidden', !!(hasTurn()));
  $('cTitle').textContent = t('newConn');
  tab(mode === 'join'); show('connect');
}
function tab(join) {
  $('tabCreate').classList.toggle('on', !join); $('tabJoin').classList.toggle('on', join); $('seg').classList.toggle('j', join);
  $('pCreate').classList.toggle('hidden', join); $('pJoin').classList.toggle('hidden', !join);
}
$('tabCreate').onclick = () => tab(false); $('tabJoin').onclick = () => tab(true);
$('passOn').onchange = () => { $('passC').classList.toggle('hidden', !$('passOn').checked); if ($('passOn').checked) $('passC').focus(); };
const syncPassJ = () => $('passJw').classList.toggle('hidden', !/^E/.test($('offerIn').value.trim().replace(/^.*#i=/, '')));
$('offerIn').addEventListener('input', syncPassJ);
$('btnGen').onclick = hostCreate;
$('btnScanAnswer').onclick = async () => { const c = await scanQr(); if (c) { $('answerIn').value = c; hostApply(c); } };
$('btnApply').onclick = () => { const c = $('answerIn').value.trim(); c ? hostApply(c) : toast(t('pasteAns')); };
$('btnScanOffer').onclick = async () => { const c = await scanQr(); if (c) { $('offerIn').value = c; syncPassJ(); if (c[0] === 'E' && !$('passJ').value) { toast(t('enterPassThen')); $('passJ').focus(); } else guestAnswer(c); } };
$('btnAnswer').onclick = () => { const c = $('offerIn').value.trim(); c ? guestAnswer(c) : toast(t('pasteOff')); };
$('answerIn').addEventListener('paste', () => setTimeout(() => { const c = $('answerIn').value.trim(); c && hostApply(c); }, 30));
$('offerIn').addEventListener('paste', () => setTimeout(() => { syncPassJ(); const c = $('offerIn').value.trim(); if (c && !/^E/.test(c.replace(/^.*#i=/, ''))) guestAnswer(c); }, 30));
$('btnReconnect').onclick = () => endChat(false);
document.querySelectorAll('[data-paste]').forEach(b => b.onclick = async () => {
  const el = $(b.dataset.paste); let v = ''; try { v = (await navigator.clipboard.readText()).trim(); } catch {}
  if (!v) { el.focus(); toast(t('pasteFail'), 3500); return; }
  el.value = v; el.dispatchEvent(new Event('paste'));
});
const inviteUrl = code => location.origin + location.pathname + location.search + '#i=' + code;
document.querySelectorAll('[data-copy]').forEach(b => b.onclick = async () => {
  const el = $(b.dataset.copy); try { await navigator.clipboard.writeText(el.value); } catch { el.select(); document.execCommand('copy'); } toast(t('copied')); vib(15);
});
$('btnLinkCopy').onclick = async () => { try { await navigator.clipboard.writeText(inviteUrl($('offerOut').value)); toast(t('linkCopied')); } catch { toast(t('copyFail')); } };
document.querySelectorAll('[data-share]').forEach(b => b.onclick = async () => {
  const v = $(b.dataset.share).value, isOffer = b.dataset.share === 'offerOut' && /^https?:$/.test(location.protocol);
  if (navigator.share) { try { await navigator.share(isOffer ? { title: t('appName'), text: t('shareText'), url: inviteUrl(v) } : { text: v }); } catch {} }
  else { try { await navigator.clipboard.writeText(isOffer ? inviteUrl(v) : v); toast(t('copied')); } catch {} }
});


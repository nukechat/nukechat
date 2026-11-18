'use strict';
const ROOM_MAX = 6;
let R = null;
const rHex = n => E2E.hex(crypto.getRandomValues(new Uint8Array(n)));
const rGum = c => navigator.mediaDevices.getUserMedia(c);
const rPub = async (o, ch) => { ch = ch || (R && R.main); if (!ch || ch.closed) return; const s = await pwSeal(ch.key, o); if (!ch.closed) ch.socks.forEach(k => k.pub(s, o.t !== 'hi')); };
async function rFromSecret(S) {
  const base = await crypto.subtle.importKey('raw', S, 'HKDF', false, ['deriveBits']);
  const bits = new Uint8Array(await crypto.subtle.deriveBits({ name: 'HKDF', hash: 'SHA-256', salt: te.encode('P2P-ROOM-v2'), info: te.encode('relay+psk') }, base, 80 * 8));
  return { topic: 'p2pr/' + E2E.hex(bits.slice(0, 16)), key: await crypto.subtle.importKey('raw', bits.slice(16, 48), 'AES-GCM', false, ['encrypt', 'decrypt']), psk: bits.slice(48, 80) };
}
async function rFromInvite(pass) {
  const km = await crypto.subtle.importKey('raw', te.encode(pwNorm(pass)), 'PBKDF2', false, ['deriveBits']);
  const bits = new Uint8Array(await crypto.subtle.deriveBits({ name: 'PBKDF2', salt: te.encode('P2P-INVITE-v1'), iterations: 600000, hash: 'SHA-256' }, km, 80 * 8));
  return { topic: 'p2pi/' + E2E.hex(bits.slice(0, 16)), key: await crypto.subtle.importKey('raw', bits.slice(16, 48), 'AES-GCM', false, ['encrypt', 'decrypt']), psk: bits.slice(48, 80) };
}
const rPeers = () => R ? [...R.peers.values()].filter(p => p.state === 'secure') : [];
const rScroll = L => { L.scrollTop = L.scrollHeight; requestAnimationFrame(() => { L.scrollTop = L.scrollHeight; }); };
function rSys(text, cls) { const L = $('rmLog'), d = document.createElement('div'); d.className = 'sys' + (cls ? ' ' + cls : ''); d.textContent = text; L.append(d); rScroll(L); }
function rBubble(mine, p, text, ts, o) {
  const L = $('rmLog'), d = document.createElement('div'); d.className = 'm ' + (mine ? 'me' : 'them');
  const body = document.createElement('div');
  if (!mine) { const w = document.createElement('div'); w.className = 'who'; w.textContent = p.name; w.style.color = avTint(p.id); body.append(w); }
  if (o && o.id) { d.dataset.mid = o.id; d._text = text; d._w = mine ? 'me' : 'them'; d._name = mine ? (R ? R.name : '') : p.name; }
  if (o && o.rp) body.append(quoteEl(o.rp, d._w, 'room'));
  const tx = document.createElement('div'); linkify(tx, text); body.append(tx);
  const tm = document.createElement('span'); tm.className = 't'; tm.textContent = clock(ts); d.append(body, tm);
  if (o && o.id) attachMsg(d, () => rMsgSheet(d), () => startReply(d, 'room'));
  L.append(d); rScroll(L); return d;
}

const rNew = () => ({ id: rHex(8), name: randomNick(), ident: null, peers: new Map(), epoch: 0, seenE: 0, gk: null, gkFrom: '', gkOld: [], pend: [], inCall: false, local: null, muted: false, rkT: 0, main: null, inv: null, S: null, invCode: '', invExp: 0, invT: 0, joinT: 0, known: new Map(), wd: 0 });
function rChanOpen(r, ch) {
  ch.seen = new Set(); ch.tick = 0; ch.closed = false;
  const open1 = u => { const k = relayOpen(u, ch.topic, async raw => {
    if (R !== r || ch.closed || ch.seen.has(raw)) return; ch.seen.add(raw); if (ch.seen.size > 800) ch.seen.clear();
    const m = await pwOpen(ch.key, raw); if (m && R === r && !ch.closed) rOnSig(m, ch).catch(e => console.error('room', e));
  }); k.url = u; return k; };
  ch.open1 = open1; ch.socks = BROKERS.map(open1);
  const hi = () => rPub({ t: 'hi', id: r.id }, ch);
  ch.timer = setInterval(() => {
    if (R !== r || ch.closed) return; ch.tick++;
    ch.socks = ch.socks.map(k => k.closed ? (k.dead = (k.dead || 0) + 1, k.dead % 2 ? open1(k.url) : k) : k);
    if (ch.tick < 10 || ch.tick % 4 === 0) hi();
    if (!ch.socks.some(k => k.ready) && ch.tick > 3 && !ch.noRelayTold) { ch.noRelayTold = 1; rSys(t('pwNoRelay'), 'warn'); }
  }, 3000);
  setTimeout(hi, 700); setTimeout(hi, 1800);
}
function rWake() {
  if (document.hidden || !R) return;
  R.visAt = Date.now(); rBroadcast({ t: 'ping' });
  for (const ch of [R.main, R.inv].filter(Boolean)) { if (ch.closed || !ch.open1) continue; (ch.socks || []).forEach(k => { try { k.close(); } catch {} }); ch.socks = BROKERS.map(ch.open1); setTimeout(() => { if (!ch.closed) rPub({ t: 'hi', id: R.id }, ch); }, 900); }
}
document.addEventListener('visibilitychange', rWake); addEventListener('pageshow', rWake); addEventListener('online', rWake);
function rChanClose(ch) { if (!ch) return; ch.closed = true; clearInterval(ch.timer); (ch.socks || []).forEach(k => k.close()); }
function rReset(r) { clearReply('room'); $('rmLog').innerHTML = ''; $('rmText').value = ''; rAuto(); rDraw(); show('room'); }
async function roomCreate() {
  if (R) { toast(t('rmAlready'), 4000); return; }
  if (cfg.relay && !hasTurn()) { toast(t('relayNeedTurn'), 4500); return; }
  const r = R = rNew(); r.S = crypto.getRandomValues(new Uint8Array(32)); rReset(r);
  try { r.ident = await E2E.genIdentity(); r.main = { kind: 'main', ...await rFromSecret(r.S) }; }
  catch (e) { toast(t('error') + ': ' + e.message); if (R === r) roomWipe(); return; }
  if (R !== r) return;
  rChanOpen(r, r.main); rWatch(r); rSys(t('rmWaiting')); rRekeySoon(); rDraw();
  setTimeout(() => { if (R === r) roomInvite(); }, 350);
}
async function roomJoin(code) {
  const pass = pwCanon(code); if (!pass) { toast(t('pwShort'), 4500); return; }
  if (R) { toast(t('rmAlready'), 4000); return; }
  if (cfg.relay && !hasTurn()) { toast(t('relayNeedTurn'), 4500); return; }
  const r = R = rNew(); rReset(r); rSys(t('rmDeriving'));
  try { r.ident = await E2E.genIdentity(); r.inv = { kind: 'inv', ...await rFromInvite(pass) }; }
  catch (e) { toast(t('error') + ': ' + e.message); if (R === r) roomWipe(); return; }
  if (R !== r) return;
  rChanOpen(r, r.inv); rSys(t('rmJoining'));
  r.joinT = setTimeout(() => { if (R === r && !r.S) { toast(t('rmJoinFail'), 7000); roomWipe(); show('list', false, true); } }, 45000);
}
function roomWipe() {
  const r = R; if (!r) return; R = null;
  clearTimeout(r.rkT); clearTimeout(r.invT); clearTimeout(r.joinT); clearInterval(r.wd); rChanClose(r.main); rChanClose(r.inv);
  for (const p of r.peers.values()) rPeerKill(p);
  if (r.local) r.local.getTracks().forEach(x => x.stop());
  if (r.S) r.S.fill(0);
  wakeOff(); clearReply('room'); $('rmLog').innerHTML = ''; $('rmText').value = ''; $('rmTiles').innerHTML = ''; $('rmTiles').classList.add('hidden'); $('rmCtl').classList.add('hidden'); $('rmBar').innerHTML = ''; closeSheet();
}
async function roomLeave(ask) {
  if (!R) { show('list', false, true); return; }
  if (ask && rPeers().length && !await askConfirm(t('rmLeaveQ'), t('rmLeaveT'), t('rmLeaveOk'), true)) return;
  rBroadcast({ t: 'bye' }); await sleep(250);
  roomWipe(); show('list', false, true);
}
async function rInviteCreate() {
  const r = R; if (!r || !r.S) return;
  if (1 + rPeers().length >= ROOM_MAX) { toast(t('rmFull'), 3500); return; }
  const code = pwGenerate(); let d; try { d = await rFromInvite(code); } catch { return; }
  if (R !== r) return;
  if (r.inv) rInviteClose('replaced');
  const ch = { kind: 'inv', ...d }; r.inv = ch; r.invCode = code; r.invExp = Date.now() + 15 * 60000; rChanOpen(r, ch);
  r.invT = setTimeout(() => { if (R === r && r.inv === ch) rInviteClose('expired'); }, 15 * 60000);
  rSys(t('rmInvMade')); rDraw(); roomInvite();
}
function rInviteClose(why) {
  const r = R; if (!r || !r.inv || !r.S) return; const ch = r.inv; r.inv = null; r.invCode = ''; clearTimeout(r.invT); rChanClose(ch);
  if (why === 'used') rSys(t('rmInvUsed')); else if (why === 'expired') rSys(t('rmInvExpired'), 'warn'); else if (why === 'cancel') rSys(t('rmInvCancel'));
  if (why !== 'replaced' && sheetOpen && $('sheet').querySelector('#rvBox')) closeSheet();
  rDraw();
}

function rPeerNew(id, ch) {
  const p = { ch, psk: ch.psk, id, name: '', pc: null, dc: null, sess: null, hs: null, pendHs: null, ik: null, state: 'new', t0: Date.now(), dead: false, polite: R.id > id, making: false, nc: 0, offerCode: '', offerAt: 0, ansCode: '', ansAt: 0, lastCode: '', busy: false, txQ: Promise.resolve(), inCall: false, cam: false, senders: null, vs: null, stream: null, ok: false };
  R.peers.set(id, p); return p;
}
function rPeerKill(p) { p.dead = true; clearInterval(p.okT); if (p.hs) clearTimeout(p.hs.timer); try { p.dc && p.dc.close(); } catch {} try { p.pc && p.pc.close(); } catch {} }
function rPeerReset(p) { rPeerKill(p); if (R && R.peers.get(p.id) === p) R.peers.delete(p.id); return R ? rPeerNew(p.id, p.ch) : p; }
const rMem = () => { const r = R; if (r) rBroadcast({ t: 'mem', ids: [r.id, ...rPeers().map(p => p.id)] }); };
const rMissing = () => { const r = R; if (!r) return []; return [...r.known].filter(([id, at]) => Date.now() - at < 180000 && !(r.peers.get(id) && r.peers.get(id).state === 'secure')).map(([id]) => id); };
function rWatch(r) {
  clearInterval(r.wd); let n = 0;
  r.wd = setInterval(() => {
    if (R !== r) return; n++;
    for (const p of rPeers()) { if (!document.hidden && Date.now() - Math.max(p.seenAt || 0, r.visAt || 0) > 25000) rPeerLost(p); else rSendTo(p, { t: 'ping' }); }
    if (n % 3 === 0) rMem();
    if (r.inCall) rTiles();
    if (rMissing().length && r.main && !r.main.closed) rPub({ t: 'hi', id: r.id }, r.main);
    rDraw();
  }, 5000);
}
function rWarnPair() {
  const r = R; if (!r || (r.warnAt && Date.now() - r.warnAt < 40000)) return; r.warnAt = Date.now(); rSys(t('rmPairFail'), 'warn');
}
function rPeerLost(p) {
  const r = R; if (!r || p.dead) return; const was = p.state === 'secure';
  rPeerKill(p); if (r.peers.get(p.id) === p) r.peers.delete(p.id);
  if (was) { rSys(t('rmLeft', { n: p.name })); rTiles(); rDraw(); rRekeySoon(); rMem(); } else rWarnPair();
  setTimeout(() => { if (R === r) rPub({ t: 'hi', id: r.id }, p.ch && !p.ch.closed ? p.ch : r.main); }, 1500 + Math.random() * 1500);
}
async function rOnSig(m, ch) {
  const r = R; if (!r || !m || typeof m.id !== 'string' || !/^[a-f0-9]{16}$/.test(m.id) || m.id === r.id) return;
  let p = r.peers.get(m.id);
  if (m.t === 'hi') {
    dbg('room hi', m.id.slice(0, 4), p ? p.state : 'new');
    if (p && p.state !== 'secure' && Date.now() - p.t0 > 25000) { rWarnPair(); p = rPeerReset(p); }
    if (!p) { if (r.peers.size >= ROOM_MAX - 1) return; p = rPeerNew(m.id, ch); rPub({ t: 'hi', id: r.id }, ch); }
    else if (p.state === 'secure') return;
    if (r.id < m.id) await rOffer(p);
    return;
  }
  if (m.to !== r.id || typeof m.code !== 'string' || m.code.length > 6000) return;
  if (!p) { if (r.peers.size >= ROOM_MAX - 1) return; p = rPeerNew(m.id, ch); }
  if (m.t === 'offer' && r.id > m.id) await rAnswer(p, m.code);
  else if (m.t === 'ans' && r.id < m.id) await rApply(p, m.code);
}
function rPc(p) {
  const pc = new RTCPeerConnection(iceConfig()); p.pc = pc;
  pc.addEventListener('icecandidate', e => { if (e.candidate) { p.nc++; const m = /candidate:\S+ \d+ (\w+) \d+ (\S+) \d+ typ (\w+)/.exec(e.candidate.candidate) || []; dbg('room cand', p.id.slice(0, 4), m[3] || '?', m[1] || '?', /\.local$/.test(m[2] || '') ? 'mdns' : ''); } });
  pc.addEventListener('iceconnectionstatechange', () => { dbg('room ice', p.id.slice(0, 4), pc.iceConnectionState); if (['connected', 'completed', 'failed'].includes(pc.iceConnectionState)) setTimeout(() => iceStats(pc.iceConnectionState, pc, p.id.slice(0, 4)), 300); });
  pc.addEventListener('icegatheringstatechange', () => dbg('room gather', p.id.slice(0, 4), pc.iceGatheringState));
  pc.onconnectionstatechange = () => {
    if (p.dead) return; const s = pc.connectionState;
    if (s === 'failed' || s === 'closed') rPeerLost(p);
    else if (s === 'disconnected') setTimeout(() => { if (!p.dead && pc.connectionState === 'disconnected') rPeerLost(p); }, 10000);
  };
  pc.ontrack = e => { p.stream = e.streams[0] || p.stream || new MediaStream(); if (!e.streams[0]) p.stream.addTrack(e.track); rTiles(); };
  pc.onnegotiationneeded = async () => {
    if (!p.sess || p.dead || !p.ok) return;
    try { p.making = true; await pc.setLocalDescription(); rSendTo(p, { t: 'sdp', d: pc.localDescription.toJSON() }); }
    catch (e) { console.error(e); } finally { p.making = false; }
  };
  return pc;
}
const rIce = (p, pc) => new Promise(res => {
  const t0 = Date.now(), iv = setInterval(() => {
    const el = Date.now() - t0;
    if (pc.iceGatheringState === 'complete' || (p.nc > 0 && el > 3500) || el > 15000 || p.dead) { clearInterval(iv); res(); }
  }, 150);
});
async function rOffer(p) {
  const r = R; if (p.busy) return;
  if (p.pc) {
    if (p.offerCode && p.pc.signalingState === 'have-local-offer' && Date.now() - p.offerAt > 4000) { p.offerAt = Date.now(); rPub({ t: 'offer', id: r.id, to: p.id, code: p.offerCode }, p.ch); }
    return;
  }
  p.busy = true; dbg('room offer: creating for', p.id.slice(0, 4));
  try {
    const pc = rPc(p); rBindDc(p, pc.createDataChannel('room', { ordered: true }));
    await pc.setLocalDescription(await pc.createOffer()); await rIce(p, pc); if (R !== r || p.dead) return;
    if (!/^a=candidate:/m.test(pc.localDescription.sdp)) throw new Error(t('st_nocand'));
    p.offerCode = await pack(pc.localDescription, ''); p.offerAt = Date.now(); rPub({ t: 'offer', id: r.id, to: p.id, code: p.offerCode }, p.ch);
  } catch (e) { console.error(e); rPeerLost(p); } finally { p.busy = false; }
}
async function rAnswer(p, code) {
  const r = R; if (p.busy) return;
  if (code === p.lastCode) { if (p.ansCode && Date.now() - p.ansAt > 3000) { p.ansAt = Date.now(); rPub({ t: 'ans', id: r.id, to: p.id, code: p.ansCode }, p.ch); } return; }
  if (p.state === 'secure') return;
  if (p.pc) p = rPeerReset(p);
  p.busy = true; p.lastCode = code;
  try {
    const { desc } = await unpack(code, ''); if (desc.type !== 'offer') return;
    const pc = rPc(p); pc.ondatachannel = e => rBindDc(p, e.channel);
    await pc.setRemoteDescription(desc); await pc.setLocalDescription(await pc.createAnswer()); await rIce(p, pc); if (R !== r || p.dead) return;
    if (!/^a=candidate:/m.test(pc.localDescription.sdp)) throw new Error(t('st_nocand'));
    p.ansCode = await pack(pc.localDescription, ''); p.ansAt = Date.now(); rPub({ t: 'ans', id: r.id, to: p.id, code: p.ansCode }, p.ch);
  } catch (e) { console.error(e); rPeerLost(p); } finally { p.busy = false; }
}
async function rApply(p, code) {
  if (!p.pc || p.pc.signalingState !== 'have-local-offer' || p.busy) return;
  p.busy = true;
  try { const { desc } = await unpack(code, ''); if (desc.type === 'answer' && p.pc.signalingState === 'have-local-offer') await p.pc.setRemoteDescription(desc); }
  catch (e) { console.error(e); } finally { p.busy = false; }
}

function rBindDc(p, dc) {
  p.dc = dc; dc.binaryType = 'arraybuffer';
  dc.onopen = () => { dbg('room dc open', p.id.slice(0, 4)); rHs(p).catch(e => { console.error(e); dbg('room hs error', e.message); rPeerLost(p); }); };
  dc.onclose = () => { dbg('room dc close', p.id.slice(0, 4), p.state); rPeerLost(p); };
  dc.onmessage = e => rOnRaw(p, e).catch(() => {});
}
async function rHs(p) {
  const r = R, pc = p.pc, fpL = fpOf(pc.localDescription && pc.localDescription.sdp), fpR = fpOf(pc.remoteDescription && pc.remoteDescription.sdp);
  if (!fpL || !fpR) return rPeerLost(p);
  const eph = await E2E.newEphemeral(), sig = await E2E.signHello(r.ident.priv, eph.pub, fpL, fpR, r.name);
  if (R !== r || p.dead) return;
  p.hs = { eph, fpL, fpR, timer: setTimeout(() => { if (!p.ok) rPeerLost(p); }, 15000) };
  p.dc.send(JSON.stringify({ t: 'hs', v: 2, ik: b64e(r.ident.pub), ek: b64e(eph.pub), n: r.name, sig: b64e(sig) }));
  if (p.pendHs) { const m = p.pendHs; p.pendHs = null; await rFinish(p, m); }
}
async function rOnRaw(p, e) {
  if (p.dead) return;
  if (typeof e.data === 'string') {
    if (e.data.length > 4000 || p.sess) return; let m; try { m = JSON.parse(e.data); } catch { return; }
    if (!m || m.t !== 'hs') return;
    if (!p.hs) p.pendHs = m; else await rFinish(p, m);
    return;
  }
  if (!p.sess) { if (p.hs && (p.early = p.early || []).length < 32) { p.early.push(e); dbg('room early frame buffered', p.id.slice(0, 4)); } return; }
  let o; try { o = await p.sess.open(new Uint8Array(e.data)); } catch { return; }
  if (o.kind !== E2E.K_JSON) return;
  let m; try { m = JSON.parse(td.decode(o.payload)); } catch { return; }
  if (m && typeof m === 'object') await rOnMsg(p, m);
}
function rDrainEarly(p) { const q = p.early; p.early = null; if (q) q.forEach(x => rOnRaw(p, x).catch(() => {})); }
async function rFinish(p, m) {
  const r = R; if (p.sess || !p.hs) return;
  let ik, ek, sig; try { ik = b64d(String(m.ik)); ek = b64d(String(m.ek)); sig = b64d(String(m.sig)); } catch { return rPeerLost(p); }
  if (m.v !== 2 || ik.length !== 65 || ek.length !== 65 || sig.length !== 64 || ik[0] !== 4 || ek[0] !== 4) return rPeerLost(p);
  if (ik.every((v, i) => v === r.ident.pub[i])) return rPeerLost(p);
  if ([...r.peers.values()].some(o => o !== p && o.ik && o.ik.every((v, i) => v === ik[i]))) return rPeerLost(p);
  if (!await E2E.verifyHello(ik, sig, ek, p.hs.fpR, p.hs.fpL, typeof m.n === 'string' && m.n.length <= 64 ? m.n : '')) return rPeerLost(p);
  let s; try { s = await E2E.deriveSession({ ephPriv: p.hs.eph.priv, ownEk: p.hs.eph.pub, peerEk: ek, ownIk: r.ident.pub, peerIk: ik, fpL: p.hs.fpL, fpR: p.hs.fpR, psk: p.psk }); } catch { return rPeerLost(p); }
  if (R !== r || p.dead) return;
  p.hs.sig = sig; p.hs.ek = ek; p.hs.nm = typeof m.n === 'string' && m.n.length <= 64 ? m.n : '';
  p.sess = s; p.ik = ik; p.name = cleanName(m.n) || t('peer'); dbg('room session ready', p.id.slice(0, 4)); rDrainEarly(p);
  p.rid = await E2E.idFromPub(ik);
  rSendOk(p);
}
function rSendOk(p) {
  const r = R; let n = 0; if (p.okT) clearInterval(p.okT);
  const go = () => { if (R !== r || p.dead || n++ >= 5) { clearInterval(p.okT); p.okT = 0; return; } rSendTo(p, { t: 'ok', e: r.epoch }); };
  rSendTo(p, { t: 'ok', e: r.epoch }); p.okT = setInterval(go, 2000);
}
function rSendTo(p, o) {
  p.txQ = p.txQ.then(async () => { if (!p.sess || p.dead || !p.dc || p.dc.readyState !== 'open') return; p.dc.send(await p.sess.sealJson(o)); }).catch(() => {});
  return p.txQ;
}
const rBroadcast = o => rPeers().forEach(p => rSendTo(p, o));
function rPeerSecure(p) {
  const r = R; dbg('room secure', p.id.slice(0, 4)); p.seenAt = Date.now(); r.known.set(p.id, Date.now()); rMem(); rSys(t('rmJoined', { n: p.name })); vib(20); notify('', 'quiet');
  if (r.S && r.inv && p.ch === r.inv) { rSendTo(p, { t: 'adm', s: b64e(r.S) }); rInviteClose('used'); }
  if (R.inCall) rSendTo(p, { t: 'call', on: true });
  rDraw(); rRekeySoon();
}

async function rOnMsg(p, m) {
  const r = R; if (!r) return;
  if (!p.ok && m.t !== 'ok') return;
  p.seenAt = Date.now();
  switch (m.t) {
    case 'ok':
      if (p.ok) break; p.ok = true; dbg('room ok recv', p.id.slice(0, 4)); p.state = 'secure'; if (p.hs) clearTimeout(p.hs.timer);
      if (Number.isInteger(m.e) && m.e > r.seenE && m.e < 1e9) r.seenE = m.e;
      rPeerSecure(p); break;
    case 'ping': break;
    case 'mem': if (Array.isArray(m.ids)) for (const id of m.ids.slice(0, 12)) if (typeof id === 'string' && /^[a-f0-9]{16}$/.test(id) && id !== r.id) r.known.set(id, Date.now()); break;
    case 'bye': r.known.delete(p.id); rPeerLost(p); break;
    case 'adm': {
      if (r.S || !r.inv || p.ch !== r.inv || typeof m.s !== 'string') break;
      let raw; try { raw = b64d(m.s); } catch { break; } if (raw.length !== 32) break;
      clearTimeout(r.joinT); r.S = raw; rChanClose(r.inv); r.inv = null;
      try { r.main = { kind: 'main', ...await rFromSecret(raw) }; } catch { roomWipe(); show('list', false, true); break; }
      if (R !== r) break;
      rSys(t('rmAdmitted')); rChanOpen(r, r.main); rWatch(r); rDraw(); break;
    }
    case 'gk': {
      if (!Number.isInteger(m.e) || m.e < 1 || m.e > 1e9 || typeof m.k !== 'string') break;
      let raw; try { raw = b64d(m.k); } catch { break; } if (raw.length !== 32) break;
      if (m.e > Math.max(r.seenE, r.epoch) + 100) { dbg('gk rejected: epoch jump', m.e); break; }
      if (![r.id, ...rPeers().map(x => x.id)].every(id => p.id <= id)) { dbg('gk rejected: not leader', p.id.slice(0, 4)); break; }
      if (!await rGkVerify(p, m, raw) || R !== r) { dbg('gk rejected: bad signature or members', p.id.slice(0, 4)); break; }
      if (m.e > r.seenE) r.seenE = m.e;
      if (m.e > r.epoch || (m.e === r.epoch && p.id < r.gkFrom)) await rSetGk(m.e, p.id, raw);
      break;
    }
    case 'gm': await rRecvGm(p, m, false); break;
    case 'call': {
      const on = !!m.on, was = p.inCall; p.inCall = on;
      if (on && !was) { p.callAt = Date.now(); rSys(t('rmCallOn', { n: p.name })); }
      if (!on && was) { rSys(t('rmCallOff', { n: p.name })); p.stream = null; }
      if (on && r.inCall) rAddTracks(p); if (!on) rRemoveTracks(p);
      rTiles(); rDraw(); break;
    }
    case 'sdp': {
      const d = m.d; if (!d || typeof d.sdp !== 'string' || (d.type !== 'offer' && d.type !== 'answer')) break;
      if (fpOf(d.sdp) && fpOf(d.sdp) !== p.hs.fpR) { rPeerLost(p); break; }
      const collision = d.type === 'offer' && (p.making || p.pc.signalingState !== 'stable');
      if (collision && !p.polite) break;
      try { await p.pc.setRemoteDescription({ type: d.type, sdp: d.sdp }); if (d.type === 'offer') { await p.pc.setLocalDescription(); rSendTo(p, { t: 'sdp', d: p.pc.localDescription.toJSON() }); } }
      catch (e) { console.error('rsdp', e); }
      break;
    }
  }
}

const rLeaderId = () => [R.id, ...rPeers().map(p => p.id)].sort()[0];
function rRekeySoon() { if (!R) return; clearTimeout(R.rkT); R.rkT = setTimeout(rRekey, 700); }
async function rRekey() {
  const r = R; if (!r || rLeaderId() !== r.id) return;
  const e = r.seenE + 1, raw = crypto.getRandomValues(new Uint8Array(32)); r.seenE = e;
  await rSetGk(e, r.id, raw);
  if (R !== r) return;
  const k = b64e(raw), mem = await rGkMem(), sig = b64e(await E2E.signBlob(r.ident.priv, 'P2P-GK-v1', await rGkBytes(e, raw, mem)));
  if (R !== r) return;
  rBroadcast({ t: 'gk', e, k, mem, sig });
}
async function rGkMem() { const r = R, me = await E2E.idFromPub(r.ident.pub); return [me, ...rPeers().map(p => p.rid)].filter(Boolean).sort(); }
async function rGkBytes(e, raw, mem) { return E2E.cat(new Uint8Array([e >>> 24 & 255, e >>> 16 & 255, e >>> 8 & 255, e & 255]), await E2E.sha(raw), E2E.lp(mem.join(','))); }
async function rGkVerify(p, m, raw) {
  const r = R; if (!p.ik || !p.rid || !Array.isArray(m.mem) || m.mem.length > 12 || typeof m.sig !== 'string' || !m.mem.every(x => typeof x === 'string' && x.length < 40)) return false;
  const me = await E2E.idFromPub(r.ident.pub); if (!m.mem.includes(me) || !m.mem.includes(p.rid)) return false;
  let sig; try { sig = b64d(m.sig); } catch { return false; }
  return E2E.verifyBlob(p.ik, sig, 'P2P-GK-v1', await rGkBytes(m.e, raw, [...m.mem].sort()));
}
async function rSetGk(e, from, raw) {
  const r = R, key = await crypto.subtle.importKey('raw', raw, 'AES-GCM', false, ['encrypt', 'decrypt']);
  if (R !== r || e <= r.epoch && !(e === r.epoch && from < r.gkFrom)) return;
  if (r.gk) { r.gkOld.unshift({ e: r.epoch, k: r.gk }); r.gkOld.length = Math.min(r.gkOld.length, 3); }
  r.gk = key; r.epoch = e; r.gkFrom = from;
  rSys(t('rmKeys', { e, n: 1 + rPeers().length }));
  for (const x of r.pend.splice(0)) if (Date.now() - x.at < 8000) rRecvGm(x.p, x.m, true);
  rDraw();
}
async function rSealSend(obj) {
  const r = R; if (!r || !r.gk) return false;
  const e = r.epoch, iv = crypto.getRandomValues(new Uint8Array(12));
  const ct = new Uint8Array(await crypto.subtle.encrypt({ name: 'AES-GCM', iv, additionalData: te.encode(r.id + '|' + e) }, r.gk, te.encode(JSON.stringify(obj))));
  rBroadcast({ t: 'gm', f: r.id, e, iv: b64e(iv), c: b64e(ct) });
  return true;
}
async function rSendText() {
  const r = R, x = $('rmText'), text = x.value.trim(); if (!r || !text) return;
  if (!r.gk) { toast(t('rmNoKey'), 2500); return; }
  x.value = ''; rAuto();
  const ts = Date.now(), id = rid(), rp = takeReply('room');
  await rSealSend(rp ? { x: text, i: id, rp } : { x: text, i: id });
  rBubble(true, null, text, ts, { id, rp });
}
async function rRecvGm(p, m, fromPend) {
  const r = R; if (!r || m.f !== p.id || !Number.isInteger(m.e) || typeof m.iv !== 'string' || typeof m.c !== 'string' || m.c.length > 20000) return;
  const k = m.e === r.epoch ? r.gk : (r.gkOld.find(o => o.e === m.e) || {}).k;
  if (!k) { if (!fromPend && m.e > r.epoch && r.pend.length < 30) r.pend.push({ p, m, at: Date.now() }); return; }
  try {
    const pt = JSON.parse(td.decode(new Uint8Array(await crypto.subtle.decrypt({ name: 'AES-GCM', iv: b64d(m.iv), additionalData: te.encode(m.f + '|' + m.e) }, k, b64d(m.c)))));
    if (R !== r) return;
    if (pt.rx && typeof pt.rx === 'object') {
      const e = pt.rx.e, el = typeof pt.rx.i === 'string' ? scopeEl('room', pt.rx.i.slice(0, 24)) : null;
      if (el && typeof e === 'string' && (!e || RX.includes(e))) { rxSet(el, p.id, e); if (e && el._w === 'me') notify(e, 'rx', p.name); }
      return;
    }
    if (typeof pt.x !== 'string' || pt.x.length > 8000) return;
    const id = typeof pt.i === 'string' && pt.i ? pt.i.slice(0, 24) : '';
    if (id && scopeEl('room', id)) return;
    rBubble(false, p, pt.x, Date.now(), { id, rp: cleanRp(pt.rp) }); notify(pt.x, 'msg', p.name);
  } catch {}
}
async function rGroupCode() {
  const r = R, hexes = [E2E.hex(r.ident.pub), ...rPeers().map(p => E2E.hex(p.ik))].sort();
  const h = await E2E.sha(te.encode('P2P-GROUP-v1|' + hexes.join('|'))), dv = new DataView(h.buffer, h.byteOffset), d = [];
  for (let i = 0; i < 4; i++) d.push(String(dv.getUint32(i * 4) % 100000).padStart(5, '0'));
  return d.join(' ');
}

function rAddTracks(p) {
  const r = R; if (!r || !r.local || !p.pc || p.dead || p.senders || !p.ok) return;
  p.senders = []; for (const tr of r.local.getTracks()) { const sn = p.pc.addTrack(tr, r.local); p.senders.push(sn); }
}
function rRemoveTracks(p) { if (!p.senders) return; for (const sn of p.senders) { try { p.pc.removeTrack(sn); } catch {} } p.senders = null; }
async function rCallStart() {
  const r = R; if (!r || r.inCall) return;
  const AUD = { echoCancellation: true, noiseSuppression: true, autoGainControl: true }; let s;
  try { s = await rGum({ audio: AUD, video: false }); }
  catch { toast(t('noMic'), 4200); return; }
  if (R !== r || r.inCall) { s.getTracks().forEach(x => x.stop()); return; }
  unlockAudio(); r.local = s; r.inCall = true; r.muted = false;
  rSys(t('rmCallMe')); rBroadcast({ t: 'call', on: true });
  for (const p of rPeers()) if (p.inCall) rAddTracks(p);
  rTiles(); rDraw(); wakeOn();
}
function rCallEnd() {
  const r = R; if (!r || !r.inCall) return;
  r.inCall = false; rBroadcast({ t: 'call', on: false });
  for (const p of r.peers.values()) rRemoveTracks(p);
  if (r.local) r.local.getTracks().forEach(x => x.stop()); r.local = null;
  rTiles(); rDraw(); wakeOff();
}
function rMuteToggle() { const r = R; if (!r || !r.local) return; r.muted = !r.muted; r.local.getAudioTracks().forEach(tr => tr.enabled = !r.muted); rTiles(); vib(10); }
function rTiles() {
  const r = R, box = $('rmTiles'), ctl = $('rmCtl');
  if (!r || !r.inCall) {
    if (!box.classList.contains('hidden') && !box.classList.contains('out')) {
      setHidden(box, true, 300); setHidden(ctl, true, 260); clearTimeout(box._clr);
      box._clr = setTimeout(() => { if (!(R && R.inCall)) box.innerHTML = ''; }, 340);
    }
    return;
  }
  clearTimeout(box._clr); setHidden(box, false); setHidden(ctl, false);
  const want = [{ id: 'me', name: r.name + ' (' + t('rmYou') + ')', stream: r.local, me: true }, ...rPeers().filter(p => p.inCall).map(p => ({ id: p.id, name: p.name, stream: p.stream, wait: !p.stream && Date.now() - (p.callAt || 0) > 3000 }))];
  const live = () => [...box.children].filter(x => !x.classList.contains('out'));
  live().forEach(el => { if (!want.some(w => w.id === el.dataset.id)) { el.classList.add('out'); setTimeout(() => el.remove(), 280); } });
  for (const w of want) {
    let el = live().find(x => x.dataset.id === w.id);
    if (!el) { el = document.createElement('div'); el.className = 'tile'; el.dataset.id = w.id; el.innerHTML = '<div class="av"></div><audio autoplay playsinline></audio><small></small>'; box.append(el); setAv(el.querySelector('.av'), w.name, w.id); el.querySelector('audio').muted = !!w.me; }
    const v = el.querySelector('audio'); el.querySelector('small').textContent = w.name + (w.wait ? ' · ' + t('rmWait') : '');
    if (v.srcObject !== (w.stream || null)) v.srcObject = w.stream || null;
    if (w.stream) v.play().catch(() => {});
  }
  const els = live(), n = els.length, wide = $('app').clientWidth > 560, cols = n <= 1 ? 1 : wide ? (n <= 4 ? 2 : 3) : 2, rows = Math.ceil(n / cols);
  box.style.setProperty('--cols', cols); box.style.setProperty('--rows', rows);
  els.forEach((el, i) => { el.style.gridColumn = cols === 2 && n % 2 === 1 && i === n - 1 && n > 1 ? '1 / -1' : ''; });
  $('rmMute').classList.toggle('on', r.muted); $('rmMute').querySelector('i').innerHTML = ic(r.muted ? 'mic-off' : 'mic');
}

function rDraw() {
  const r = R; if (!r) return;
  const ps = rPeers(), n = 1 + ps.length, nc = (r.inCall ? 1 : 0) + ps.filter(p => p.inCall).length;
  $('rmTitle').textContent = t('rmTitle'); $('rmSt').textContent = t('rmCount', { n, m: ROOM_MAX }) + (nc ? ' · ' + t('rmInCall', { n: nc }) : '') + (r.S && r.inv ? ' · ' + t('rmInvOn') : '') + (r.S && (rMissing().length || [...r.peers.values()].some(o => o.state !== 'secure')) ? ' · ' + t('rmPending', { n: Math.max(rMissing().length, [...r.peers.values()].filter(o => o.state !== 'secure').length) }) : '');
  $('rmMe').textContent = t('youAre', { n: r.name }); $('rmCall').classList.toggle('hidden', r.inCall);
  const bar = $('rmBar'); bar.innerHTML = '';
  for (const p of [null, ...ps]) {
    const b = document.createElement('button'); b.className = 'rchip'; const av = document.createElement('div'); av.className = 'av';
    const nm = p ? p.name : r.name; setAv(av, nm, p ? p.id : 'me');
    const sp = document.createElement('span'); sp.textContent = nm; b.append(av, sp); b.title = p ? nm : nm + ' · ' + t('rmYou'); b.setAttribute('aria-label', b.title); if (!p) b.classList.add('me');
    if (p ? p.inCall : r.inCall) { const c = document.createElement('i'); c.className = 'live'; b.append(c); }
    b.onclick = () => rMemberSheet(p); bar.append(b);
  }
}
async function rMemberSheet(p) {
  const r = R; if (!r) return;
  const sf = p ? await E2E.safety(r.ident.pub, p.ik) : null, gc = await rGroupCode(); if (R !== r) return;
  openSheet(`<div class="hd"><div class="av"></div><div><h3 style="margin:0"></h3><small class="selectable"></small></div></div>
    <div id="rsP"></div><h4></h4><div class="mono selectable" id="rsG"></div><p class="note" id="rsN"></p>`, s => {
    const nm = p ? p.name : r.name; setAv(s.querySelector('.av'), nm, p ? p.id : 'me'); s.querySelector('h3').textContent = nm; s.querySelector('small').textContent = p ? p.rid : '';
    if (sf) { s.querySelector('#rsP').innerHTML = '<h4></h4><div class="mono selectable"></div>'; s.querySelector('#rsP h4').textContent = t('rmSafety', { n: nm }); s.querySelector('#rsP .mono').textContent = sf.digits.join(' ') + '\n' + sf.emo.map(i => EMO[i]).join(' '); }
    s.querySelector('h4:not(#rsP h4)').textContent = t('rmGroupCode', { e: r.epoch }); s.querySelector('#rsG').textContent = gc; s.querySelector('#rsN').textContent = t('rmGroupCodeT');
  });
}
function roomInvite() {
  const r = R; if (!r) return; if (!r.S) { toast(t('rmNotYet'), 3000); return; }
  const link = location.href.split('#')[0] + '#g=' + r.invCode;
  if (!r.inv) {
    openSheet(`<h3></h3><p class="note" id="rvN"></p><button class="btn" id="rvNew"></button><p class="note" id="rvL"></p>`, s => {
      s.querySelector('h3').textContent = t('rmInvT'); s.querySelector('#rvN').textContent = t('rmInvNone'); s.querySelector('#rvNew').textContent = t('rmInvNew'); s.querySelector('#rvL').textContent = t('rmLimits', { m: ROOM_MAX });
      s.querySelector('#rvNew').onclick = () => rInviteCreate();
    }); return;
  }
  openSheet(`<h3></h3><p class="note" id="rvN"></p><div id="rvBox"><input class="field" id="rvCode" readonly style="font-family:ui-monospace,monospace;letter-spacing:.04em">
    <div class="btns"><button class="btn sec small" id="rvCopy"><svg class="ic sm"><use href="#i-copy"/></svg><span></span></button><button class="btn sec small" id="rvLink"><svg class="ic sm"><use href="#i-copy"/></svg><span></span></button></div>
    <div class="btns"><button class="btn sec small" id="rvShare"><span></span></button></div><div class="qrbox" id="rvQr"></div></div>
    <button class="btn danger" id="rvCancel"></button>`, s => {
    s.querySelector('h3').textContent = t('rmInvT'); s.querySelector('#rvN').textContent = t('rmInvActive', { t: new Date(r.invExp).toLocaleTimeString(loc(), { hour: '2-digit', minute: '2-digit' }) }); s.querySelector('#rvCode').value = r.invCode;
    s.querySelector('#rvCopy span').textContent = t('rmCopyCode'); s.querySelector('#rvLink span').textContent = t('rmCopyLink'); s.querySelector('#rvShare span').textContent = t('rmShare'); s.querySelector('#rvCancel').textContent = t('rmInvCancelBtn');
    if (!navigator.share) s.querySelector('#rvShare').classList.add('hidden');
    const cp = async v => { try { await navigator.clipboard.writeText(v); toast(t('copied')); } catch { toast(t('copyFail')); } };
    s.querySelector('#rvCopy').onclick = () => cp(r.invCode); s.querySelector('#rvLink').onclick = () => cp(link);
    s.querySelector('#rvShare').onclick = () => { try { navigator.share({ title: t('rmTitle'), text: t('rmShareText'), url: link }); } catch {} };
    s.querySelector('#rvCancel').onclick = () => { rInviteClose('cancel'); closeSheet(); };
    showQr(s.querySelector('#rvQr'), 'GR1:' + r.invCode);
  });
}
function rCodeFrom(v) {
  v = String(v || '').trim(); const m = /#g=([A-Za-z0-9-]+)/.exec(v); if (m) v = m[1]; return pwCanon(v.replace(/^GR1:/i, ''));
}
function groupSheet() {
  openSheet(`<h3></h3><p class="note"></p>
    <button class="big" id="gC"><span class="bi"><svg class="ic"><use href="#i-plus"/></svg></span><span><b></b><small></small></span></button>
    <button class="big" id="gJ"><span class="bi"><svg class="ic"><use href="#i-scan"/></svg></span><span><b></b><small></small></span></button>`, s => {
    s.querySelector('h3').textContent = t('rmBtn'); s.querySelector('.note').textContent = t('rmBtnS');
    const bs = s.querySelectorAll('.big'); bs[0].querySelector('b').textContent = t('rmCreate'); bs[0].querySelector('small').textContent = t('rmCreateS'); bs[1].querySelector('b').textContent = t('rmJoinB'); bs[1].querySelector('small').textContent = t('rmJoinS');
    bs[0].onclick = () => { closeSheet(); roomCreate(); };
    bs[1].onclick = () => groupJoinSheet();
  });
}
function groupJoinSheet() {
  openSheet(`<h3></h3><input class="field" id="gjIn" type="text" data-tp="pwPh" autocomplete="off" autocapitalize="none" spellcheck="false" maxlength="80" style="font-family:ui-monospace,monospace;letter-spacing:.04em">
    <div class="btns"><button class="btn sec small" id="gjPaste"><svg class="ic sm"><use href="#i-paste"/></svg><span></span></button><button class="btn sec small" id="gjScan"><svg class="ic sm"><use href="#i-scan"/></svg><span></span></button></div>
    <button class="btn" id="gjGo"></button>`, s => {
    const inp = s.querySelector('#gjIn'); inp.placeholder = t('pwPh'); s.querySelector('h3').textContent = t('rmJoinB');
    s.querySelector('#gjPaste span').textContent = t('pwPaste'); s.querySelector('#gjScan span').textContent = t('pwScan'); s.querySelector('#gjGo').textContent = t('pwGo');
    const go = () => { const c = rCodeFrom(inp.value); if (!c) { toast(t('pwShort'), 4000); inp.focus(); return; } closeSheet(); roomJoin(c); };
    s.querySelector('#gjGo').onclick = go;
    s.querySelector('#gjPaste').onclick = async () => { let v = ''; try { v = await navigator.clipboard.readText(); } catch {} if (!rCodeFrom(v)) { toast(t('pwPasteBad'), 3500); inp.focus(); return; } inp.value = v; go(); };
    s.querySelector('#gjScan').onclick = async () => { const c = await scanQr(); if (!c) return; if (!rCodeFrom(c)) return toast(t('pwScanBad'), 4000); inp.value = c; go(); };
    inp.addEventListener('paste', () => setTimeout(() => { if (rCodeFrom(inp.value)) go(); }, 30));
    setTimeout(() => inp.focus(), 250);
  });
}
async function roomLink(code) {
  const c = rCodeFrom(code); if (!c) { toast(t('pwShort'), 4500); return; }
  if (R) { toast(t('rmAlready'), 4000); return; }
  if (await askConfirm(t('rmJoinQ'), t('rmJoinT'), t('rmEnter'))) roomJoin(c);
}
function rAuto() { const x = $('rmText'); x.style.height = 'auto'; x.style.height = Math.min(140, x.scrollHeight) + 'px'; }
$('rmText').addEventListener('input', rAuto);
$('rmText').addEventListener('keydown', e => { if (e.key === 'Enter' && !e.shiftKey && matchMedia('(pointer:fine)').matches) { e.preventDefault(); rSendText(); } });
$('rmForm').onsubmit = e => { e.preventDefault(); rSendText(); };
$('rmBack').onclick = () => roomLeave(true);
$('rmLock').onclick = async () => {
  const r = R; if (!r) return;
  openSheet(`<h3></h3><p class="note" style="margin:0 0 4px"></p><div id="rsBody"><p class="note">…</p></div><button class="btn" id="rsOk"></button>`, async s => {
    s.querySelector('h3').textContent = t('secH'); s.querySelector('p').textContent = t('rmSecP'); s.querySelector('#rsOk').textContent = t('close'); s.querySelector('#rsOk').onclick = closeSheet;
    const row = (ok, title, sub) => `<div class="chk ${ok === true ? 'ok' : ok === false ? 'no' : 'wn'}"><i>${ok === true ? '✓' : ok === false ? '✗' : '!'}</i><div>${esc(title)}${sub ? `<small>${esc(sub)}</small>` : ''}</div></div>`;
    let h = row(!!r.gk, t('rmSecEpoch', { e: r.epoch }), t('rmSecEpochS'));
    const ps = rPeers(); if (!ps.length) h += `<p class="note">${esc(t('rmSecNone'))}</p>`;
    for (const p of ps) {
      const o = await liveCheck(p.pc, p.hs, p.sess, p.ik); if (R !== r) return;
      const ok = o.sig && o.fpSame && o.certMatch !== false && o.dtls === 'connected' && o.keys && o.keys.ok;
      h += row(ok, p.name, [o.sig ? '✓ ' + t('lv_sig') : '✗ ' + t('lv_sig'), o.fpSame && o.certMatch !== false ? '✓ ' + t('lv_fp') : '✗ ' + t('lv_fp'), 'DTLS ' + (o.dtls || '?') + (o.cipher ? ' ' + o.cipher : ''), o.path ? t(o.path === 'relay' ? 'lv_pathRelay' : 'lv_pathDirect') : '', o.keys && o.keys.ok ? '✓ ' + t('lv_probe') : '✗ ' + t('lv_probe')].filter(Boolean).join(' · '));
    }
    const b = s.querySelector('#rsBody'); if (b) b.innerHTML = h;
  });
};
$('rmInvite').onclick = roomInvite;
$('rmCall').onclick = () => rCallStart();
$('rmMute').onclick = rMuteToggle; $('rmHang').onclick = rCallEnd;
$('pwModeG').onclick = groupSheet;
addEventListener('pagehide', () => { try { if (R) rBroadcast({ t: 'bye' }); } catch {} });
addEventListener('hashchange', () => {
  const m = /^#([gps])=([A-Za-z0-9-]+)$/.exec(location.hash); if (!m) return;
  history.replaceState(history.state, '', location.pathname + location.search); if (m[1] === 'g') roomLink(m[2]); else pwLinkOpen(m[2], m[1] === 's' ? 'share' : 'chat');
});


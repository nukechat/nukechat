'use strict';
let AC = null, gainNode = null, compNode = null, srcNode = null, remoteStream = null, ringT = null, wake = null;
const audioEl = $('remoteAudio');
function unlockAudio() {
  if (!AC) { try { AC = new (window.AudioContext || window.webkitAudioContext)({ latencyHint: 'interactive' }); } catch {} }
  if (AC && AC.state === 'suspended') AC.resume().catch(() => {});
}
['pointerdown', 'keydown', 'touchend'].forEach(ev => addEventListener(ev, unlockAudio, { passive: true }));
let vol = 1;
function applyVol() {
  const boost = vol > 1 && !!AC && AC.state === 'running' && !!remoteStream;
  if (boost && !srcNode) {
    try {
      srcNode = AC.createMediaStreamSource(remoteStream);
      if (!gainNode) { gainNode = AC.createGain(); compNode = AC.createDynamicsCompressor(); gainNode.connect(compNode); compNode.connect(AC.destination); }
      srcNode.connect(gainNode);
    } catch { srcNode = null; }
  }
  if (!boost && srcNode) { try { srcNode.disconnect(); } catch {} srcNode = null; }
  if (gainNode) gainNode.gain.value = vol;
  audioEl.muted = !!srcNode; audioEl.volume = Math.min(1, vol);
  $('vol').value = Math.round(vol * 100); $('volV').textContent = Math.round(vol * 100) + '%';
}
function attachRemote(stream) {
  remoteStream = stream; if (srcNode) { try { srcNode.disconnect(); } catch {} srcNode = null; }
  audioEl.srcObject = stream; applyVol(); audioEl.play().catch(() => {});
  const rv = $('remVid'); if (rv.srcObject !== stream) rv.srcObject = stream; rv.play().catch(() => {}); vidUi();
}
const liveTones = new Set();
function stopTones() { liveTones.forEach(o => { try { o.stop(0); } catch {} try { o.disconnect(); } catch {} }); liveTones.clear(); }
const SND = {
  in: { env: 'bell', repeat: 2200, vib: [220, 120, 220], notes: [[880, .18, 0, .08, 'sine'], [660, .18, .22, .08, 'sine'], [880, .18, .6, .08, 'sine'], [660, .18, .82, .08, 'sine']] },
  out: { env: 'flat', repeat: 3200, vib: [], notes: [[425, 1, 0, .05, 'sine']] },
  ans: { env: 'bell', repeat: 0, vib: [], notes: [[660, .14, 0, .05, 'sine'], [990, .2, .16, .05, 'sine']] },
};
function tone(freq, dur, when, g = .08, env = 'flat', type = 'sine') {
  if (!AC || AC.state !== 'running' || document.hidden) return;
  const o = AC.createOscillator(), n = AC.createGain(), tt = AC.currentTime + when; o.type = type; o.frequency.value = freq; liveTones.add(o); o.onended = () => liveTones.delete(o);
  n.gain.setValueAtTime(0, tt);
  if (env === 'bell') { n.gain.linearRampToValueAtTime(g, tt + .008); n.gain.exponentialRampToValueAtTime(.0001, tt + dur); }
  else { n.gain.linearRampToValueAtTime(g, tt + .02); n.gain.setValueAtTime(g, tt + Math.max(.02, dur - .05)); n.gain.linearRampToValueAtTime(0, tt + dur); }
  o.connect(n); n.connect(AC.destination); o.start(tt); o.stop(tt + dur + .02);
}
const playSnd = sn => sn.notes.forEach(n => tone(n[0], n[1], n[2], n[3], sn.env, n[4]));
function startRing(kind) {
  stopRing(); const snd = cfg.sounds, sn = SND[kind] || SND.out;
  const go = () => { cycle(); ringT = setInterval(cycle, sn.repeat); };
  const cycle = () => { if (snd) playSnd(sn); if (sn.vib.length) vib(sn.vib); };
  if (AC && AC.state === 'suspended') AC.resume().then(go, go); else go();
}
function answerBeep() { if (cfg.sounds) playSnd(SND.ans); }
function stopRing() { clearInterval(ringT); ringT = null; stopTones(); vib(0); }
async function wakeOn() { try { if ('wakeLock' in navigator && !wake) { wake = await navigator.wakeLock.request('screen'); wake.addEventListener('release', () => wake = null); } } catch {} }
function wakeOff() { try { wake && wake.release(); } catch {} wake = null; }
document.addEventListener('visibilitychange', () => { if (document.hidden || !callState || callState === 'active') stopTones(); if (!document.hidden && callState === 'active') wakeOn(); });

const zst = new WeakMap();
const zsm = new WeakMap();
const ZMAX = 5, ZTAU = 85, ZHW = 150;
let HZ = null;
let HZ_LAG = 90, HZ_MAN = false;
try { const m = +localStorage.hzLag; if (m) { HZ_LAG = m; HZ_MAN = true; } } catch {}
const HZQ = 1.025;
const HS = { d1: 0, d2: 0, t2: 0, base: 0, n: 0, lags: [] };
function hsFeed(ts, d) {
  const h = HZ, s = HS; if (!h) return;
  const cand = s.n > 12 && s.d2 > Math.max(s.base * 3, s.base + 1.5) && s.d2 >= s.d1 && s.d2 > d;
  if (cand && !HZ_MAN) {
    let r = null; for (let i = h.recs.length - 1; i >= 0; i--) { const x = h.recs[i]; if (!x.used && x.big && s.t2 - x.t >= -30 && s.t2 - x.t < 400) { r = x; break; } }
    if (r) {
      r.used = true; s.lags.push(Math.max(0, Math.min(350, s.t2 - r.t))); if (s.lags.length > 9) s.lags.shift();
      if (s.lags.length >= 3) { const a = s.lags.slice().sort((x, y) => x - y); HZ_LAG = Math.round(a[a.length >> 1]); try { localStorage['hzLagAuto' + h.key] = HZ_LAG; } catch {} dbg('hw zoom lag', HZ_LAG + 'ms (' + s.lags.length + ')'); }
    }
  } else if (!cand) { s.base = s.n < 8 ? (s.base * s.n + d) / (s.n + 1) : (d < s.base * 2.5 + 1 ? s.base * .95 + d * .05 : s.base); }
  s.n++; s.d1 = s.d2; s.d2 = d; s.t2 = ts;
}
function hsLoop(h) {
  const lv = lvEl(); if (HZ_MAN || !lv.requestVideoFrameCallback) return;
  let cv, ctx; try { cv = document.createElement('canvas'); cv.width = 48; cv.height = 36; ctx = cv.getContext('2d', { willReadFrequently: true }); } catch { return; }
  let prev = null; const N = 48 * 36;
  const tick = now => {
    if (HZ !== h) return;
    if (!document.hidden && lv.readyState >= 2 && lv.videoWidth) {
      try {
        ctx.drawImage(lv, 0, 0, 48, 36); const px = ctx.getImageData(0, 0, 48, 36).data, g = new Uint8Array(N);
        for (let i = 0; i < N; i++) g[i] = (px[i * 4] * 77 + px[i * 4 + 1] * 150 + px[i * 4 + 2] * 29) >> 8;
        if (prev) { let sum = 0; for (let i = 0; i < N; i++) sum += Math.abs(g[i] - prev[i]); hsFeed(now, sum / N); }
        prev = g;
      } catch {}
    } else prev = null;
    lv.requestVideoFrameCallback(tick);
  };
  lv.requestVideoFrameCallback(tick);
}
function hzInit(tr) {
  HZ = null; try {
    const c = tr && tr.getCapabilities && tr.getCapabilities(), st = tr.getSettings ? tr.getSettings() : {};
    if (c && c.zoom && c.zoom.max > c.zoom.min) { const z0 = st.zoom || c.zoom.min; HZ = { tr, min: c.zoom.min, max: c.zoom.max, cur: z0, eff: z0, want: z0, busy: false, lt: 0, fail: 0, rt: 120, idle: 0, recs: [], key: ':' + (tr.label || '') }; }
  } catch {}
  dbg('hw zoom', HZ ? HZ.min + '..' + HZ.max : 'none, digital');
  if (HZ) { HS.d1 = HS.d2 = HS.base = HS.n = 0; HS.lags = []; if (!HZ_MAN) { try { const a = +localStorage['hzLagAuto' + HZ.key]; if (a >= 0 && a < 400) HZ_LAG = a; } catch {} hsLoop(HZ); } }
  if (HZ && HZ.cur > HZ.min * 1.003) hzSet(HZ.min);
}
function hzSet(z) {
  const h = HZ; if (!h || h.tr.readyState !== 'live') return; h.want = Math.min(h.max, Math.max(h.min, z)); if (h.busy) return; h.busy = true;
  const go = () => {
    const w = h.want; if (HZ !== h || h.tr.readyState !== 'live' || Math.abs(w - h.cur) < h.cur * .003) { h.busy = false; return; }
    const t0 = performance.now();
    h.tr.applyConstraints({ advanced: [{ zoom: w }] }).then(() => true, () => false).then(ok => {
      if (HZ !== h) return;
      if (ok) {
        h.fail = 0; { const q = w / h.cur; h.recs.push({ t: performance.now(), big: q >= 1.05 || q <= 1 / 1.05, used: false }); if (h.recs.length > 8) h.recs.shift(); } h.cur = w; h.lt++; h.rt = h.rt * .7 + Math.min(400, performance.now() - t0) * .3;
        setTimeout(() => { h.lt--; if (HZ === h) { h.eff = w; applyT(lvEl()); } }, HZ_LAG);
        go();
      } else {
        h.busy = false; try { const z = h.tr.getSettings().zoom; if (z) h.cur = h.eff = z; } catch {}
        if (++h.fail >= 4) { HZ = null; applyT(lvEl()); dbg('hw zoom', 'failed, digital'); } else applyT(lvEl());
      }
    });
  };
  go();
}
const hzRes = el => { const h = HZ; return (h && !scrOn && el === lvEl()) ? Math.max(1, zCur(el).s / (h.eff / h.min)) : 1; };
const hzQ = s => Math.pow(HZQ, Math.floor(Math.log(Math.max(1, s)) / Math.log(HZQ) + 1e-6));
function hzDrive(c, g) {
  const h = HZ; let s;
  if (Math.abs(g.s - c.s) < .002) s = g.s;
  else { const H = h.rt + HZ_LAG; s = Math.min(h.max / h.min, hzQ(g.s + (c.s - g.s) * Math.exp(-H / ZHW))); }
  hzSet(h.min * s);
}
const zMaxOf = el => (el === lvEl() && HZ) ? HZ.max / HZ.min : ZMAX;
function zPresets(max) { const o = [1, 2, 4, 8, 16, 20, 25, 30, 40, 50].filter(v => v <= max + .001); if (max > o[o.length - 1] * 1.15) o.push(max); return o; }
function zSnap(a) {
  if (!a) return; const v = a.get(), ps = zPresets(a.max); let b = ps[0];
  ps.forEach(x => { if (Math.abs(Math.log(x / v)) < Math.abs(Math.log(b / v))) b = x; }); a.set(b); zbPaint();
}
const zCur = el => zsm.get(el) || (zsm.set(el, { s: 1, x: 0, y: 0 }), zsm.get(el));
const zLim = (el, s) => (el === lvEl() && HZ) ? [0, 0] : [el.clientWidth * (s - 1) / 2, el.clientHeight * (s - 1) / 2];
const zAct = new Set(); let zRaf = 0, zT = 0;
function applyT(el) { zAct.add(el); if (!zRaf) { zT = performance.now(); zRaf = requestAnimationFrame(zFrame); } }
function zFrame(now) {
  zRaf = 0; const dt = Math.min(64, Math.max(1, now - zT)), k = 1 - Math.exp(-dt / ZTAU), kh = 1 - Math.exp(-dt / ZHW); zT = now;
  zAct.forEach(el => {
    const g = zst.get(el) || { s: 1, x: 0, y: 0 }, c = zCur(el), hw = el === lvEl() && !!HZ && !scrOn;
    c.s += (g.s - c.s) * (hw ? kh : k); if (Math.abs(g.s - c.s) < .002) c.s = g.s;
    const [w, h] = zLim(el, c.s); c.x = Math.max(-w, Math.min(w, g.x)); c.y = Math.max(-h, Math.min(h, g.y));
    let hwBusy = false;
    if (hw) {
      hzDrive(c, g); const r = hzRes(el); el.style.transform = r > 1.0005 ? `scale(${r})${el._mirror ? ' scaleX(-1)' : ''}` : (el._mirror ? 'scaleX(-1)' : 'none');
      hwBusy = HZ.busy || HZ.lt > 0 || r > 1.002 || Math.abs(g.s - c.s) > .002 || Math.abs(HZ.want - HZ.eff) > HZ.eff * .003;
    } else el.style.transform = `translate3d(${c.x}px,${c.y}px,0) scale(${c.s})${el._mirror ? ' scaleX(-1)' : ''}`;
    if (el === lvEl()) {
      if (hw) { if (hwBusy) HZ.idle = now; zpStop(true); }
      else if (g.s > 1.01 || c.s > 1.002) zpStart(); else zpStop(true);
    }
    if (c.s === g.s && c.x === g.x && c.y === g.y && !hwBusy && !(hw && now - HZ.idle < 320)) zAct.delete(el);
  });
  if (zAct.size) { zT = now; zRaf = requestAnimationFrame(zFrame); }
}
const lvEl = () => $('locVid');

let ZP = null;
function zpDraw() {
  const p = ZP, lv = lvEl(), vw = lv.videoWidth, vh = lv.videoHeight; if (!p || !vw || !vh || lv.readyState < 2) return;
  if (p.cv.width !== vw || p.cv.height !== vh) { p.cv.width = vw; p.cv.height = vh; p.ctx.imageSmoothingQuality = 'high'; }
  const c = HZ ? { s: hzRes(lv), x: 0, y: 0 } : zCur(lv), s = Math.max(1, c.s), cw = vw / s, ch = vh / s, W = lv.clientWidth || 1, H = lv.clientHeight || 1, ea = W / H, fa = vw / vh;
  const fw = fa > ea ? ea / fa : 1, fh = fa > ea ? 1 : fa / ea;
  const sgn = lv._mirror ? -1 : 1;
  const cx = Math.max(cw / 2, Math.min(vw - cw / 2, vw * (.5 - sgn * c.x / (s * W) * fw))), cy = Math.max(ch / 2, Math.min(vh - ch / 2, vh * (.5 - c.y / (s * H) * fh)));
  p.ctx.drawImage(lv, cx - cw / 2, cy - ch / 2, cw, ch, 0, 0, vw, vh);
}
function zpLoop() {
  const p = ZP; if (!p) return; const lv = lvEl();
  const next = () => { if (ZP !== p) return; zpDraw(); zpLoop(); };
  if (lv.requestVideoFrameCallback) p.h = lv.requestVideoFrameCallback(next); else p.h = requestAnimationFrame(next);
}
function zpStart() {
  if (ZP || document.hidden) return; const lv = lvEl(), cam = localStream && localStream.getVideoTracks()[0];
  if (!cam || cam.readyState !== 'live' || scrOn || !vidSender || callState !== 'active' || !lv.videoWidth || !lv.srcObject) return;
  let cv, ctx, out; try {
    cv = document.createElement('canvas'); cv.width = lv.videoWidth; cv.height = lv.videoHeight; ctx = cv.getContext('2d', { alpha: false });
    ctx.imageSmoothingQuality = 'high'; out = cv.captureStream && cv.captureStream();
  } catch { return; }
  const tr = out && out.getVideoTracks()[0]; if (!tr) return;
  try { tr.contentHint = 'motion'; } catch {}
  ZP = { cv, ctx, tr, cam, h: 0 }; zpDraw();
  vidSender.replaceTrack(tr).catch(() => zpStop(false)); zpLoop();
}
function zpStop(restore) {
  const p = ZP; if (!p) return; ZP = null; const lv = lvEl();
  try { lv.cancelVideoFrameCallback ? lv.cancelVideoFrameCallback(p.h) : cancelAnimationFrame(p.h); } catch {}
  const done = () => { try { p.tr.stop(); } catch {} };
  if (restore && vidSender && p.cam.readyState === 'live') vidSender.replaceTrack(p.cam).catch(() => {}).then(done); else done();
}
document.addEventListener('visibilitychange', () => { if (document.hidden) zpStop(true); else { const g = zst.get(lvEl()); if (g && g.s > 1.01) applyT(lvEl()); } });

const ZB = { box: $('zoomBox'), trk: $('zoomTrk'), val: $('zoomV'), thumb: $('zoomThumb'), fill: $('zoomFill'), a: null, drag: false, hideT: 0 };
const zbClamp = (a, v) => Math.min(a.max, Math.max(a.min, v));
function zbPaint() {
  const a = ZB.a; if (!a) return; const v = zbClamp(a, a.get()), p = a.max > a.min ? Math.log(v / a.min) / Math.log(a.max / a.min) : 0, pc = Math.round(p * 1000) / 10 + '%';
  ZB.thumb.style.bottom = pc; ZB.fill.style.height = pc; ZB.val.textContent = '×' + Math.round(v / a.min); ZB.trk.setAttribute('aria-valuenow', (v / a.min).toFixed(1));
}
function zbKeep() { clearTimeout(ZB.hideT); if (!ZB.drag) ZB.hideT = setTimeout(zbHide, 2200); }
function zbShow(a) { ZB.a = a; ZB.box.classList.add('on'); zbPaint(); zbKeep(); }
function zbHide() { clearTimeout(ZB.hideT); ZB.drag = false; ZB.box.classList.remove('on'); ZB.a = null; }
function zbFromY(y) {
  const a = ZB.a; if (!a) return; const r = ZB.trk.getBoundingClientRect(), p = Math.min(1, Math.max(0, 1 - (y - r.top) / r.height));
  a.set(a.min * Math.pow(a.max / a.min, p)); zbPaint();
}
ZB.trk.addEventListener('pointerdown', e => { if (!ZB.a) return; e.preventDefault(); try { ZB.trk.setPointerCapture(e.pointerId); } catch {} ZB.drag = true; clearTimeout(ZB.hideT); ZB.box.classList.add('drag'); zbFromY(e.clientY); });
ZB.trk.addEventListener('pointermove', e => { if (ZB.drag) zbFromY(e.clientY); });
const zbUp = () => { ZB.box.classList.remove('drag'); if (!ZB.drag) return; ZB.drag = false; zSnap(ZB.a); zbKeep(); };
function zbStep(dir) {
  const a = ZB.a; if (!a) return; const v = a.get(), ps = zPresets(a.max);
  const n = dir > 0 ? (ps.find(x => x > v * 1.03) || a.max) : (ps.slice().reverse().find(x => x < v / 1.03) || 1);
  a.set(n); zbPaint(); zbKeep();
}
$('zoomPlus').addEventListener('click', () => zbStep(1)); $('zoomMinus').addEventListener('click', () => zbStep(-1));
ZB.trk.addEventListener('pointerup', zbUp); ZB.trk.addEventListener('pointercancel', zbUp);

function zAdapter(el) {
  if (el._za) return el._za;
  return el._za = { el, min: 1, get max() { return zMaxOf(el); }, get: () => (zst.get(el) || { s: 1 }).s, set(v) {
    const z = zst.get(el); z.s = Math.min(zMaxOf(el), Math.max(1, v)); const [w, h] = zLim(el, z.s);
    z.x = Math.max(-w, Math.min(w, z.x)); z.y = Math.max(-h, Math.min(h, z.y)); applyT(el);
  } };
}
function zoomReset(el, soft) {
  zst.set(el, { s: 1, x: 0, y: 0 }); if (!soft) zsm.set(el, { s: 1, x: 0, y: 0 });
  if (ZB.a && ZB.a.el === el) zbHide();
  applyT(el);
}
function bindGestures(el, o) {
  el._zTrack = o.track; el.style.touchAction = 'none'; zst.set(el, { s: 1, x: 0, y: 0 });
  const ptrs = new Map(); let d0 = 0, v0 = 1, ad = null, moved = 0, t0 = 0;
  const dist = () => { const [a, b] = [...ptrs.values()]; return Math.hypot(a.x - b.x, a.y - b.y); };
  el.addEventListener('pointerdown', e => {
    try { el.setPointerCapture(e.pointerId); } catch {} ptrs.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (ptrs.size === 1) { moved = 0; t0 = Date.now(); } else { d0 = dist(); ad = o.enabled() ? zAdapter(el) : null; v0 = ad ? ad.get() : 1; moved = 99; clearTimeout(ZB.hideT); }
  });
  el.addEventListener('pointermove', e => {
    const p = ptrs.get(e.pointerId); if (!p) return;
    const dx = e.clientX - p.x, dy = e.clientY - p.y; p.x = e.clientX; p.y = e.clientY; moved += Math.abs(dx) + Math.abs(dy);
    if (!o.enabled()) return;
    const z = zst.get(el);
    if (ptrs.size === 2 && d0 && ad) {
      ad.set(v0 * dist() / d0); if (ZB.a !== ad) zbShow(ad); else zbPaint();
    } else if (ptrs.size === 1 && z.s > 1) {
      const [w, h] = zLim(el, z.s);
      z.x = Math.max(-w, Math.min(w, z.x + dx)); z.y = Math.max(-h, Math.min(h, z.y + dy)); applyT(el);
    }
  });
  el.addEventListener('wheel', e => {
    if (!o.enabled()) return; e.preventDefault(); const a = zAdapter(el);
    a.set(a.get() * Math.exp(-e.deltaY * .0016)); if (ZB.a !== a) zbShow(a); else { zbPaint(); zbKeep(); }
    clearTimeout(el._wT); el._wT = setTimeout(() => zSnap(a), 220);
  }, { passive: false });
  const up = e => {
    if (!ptrs.has(e.pointerId)) return; const n = ptrs.size; ptrs.delete(e.pointerId);
    if (n === 2) { if (ad) zSnap(ad); ad = null; if (ZB.a) zbKeep(); }
    if (n === 1 && moved < 10 && Date.now() - t0 < 400) {
      const now = Date.now(); if (el._lastTap && now - el._lastTap < 320 && o.enabled()) { zoomReset(el, true); el._lastTap = 0; return; }
      el._lastTap = now; o.onTap && o.onTap();
    }
  };
  el.addEventListener('pointerup', up); el.addEventListener('pointercancel', e => { if (ptrs.size === 2) { ad = null; if (ZB.a) zbKeep(); } ptrs.delete(e.pointerId); });
}
let callVid = false, camOn = false, camFacing = 'environment', peerCam = false, peerScr = false, vidSender = null, scrOn = false, scrTrack = null, camWas = false;
let callState = null, localStream = null, muted = false, callT0 = 0, callTimer = null, callMin = false;
function drawSpk() {}
const CAN_SCR = !!(navigator.mediaDevices && navigator.mediaDevices.getDisplayMedia);
function syncPill() {
  $('pillMute').innerHTML = ic(muted ? 'mic-off' : 'mic'); $('pillMute').classList.toggle('on', muted);
  $('pillCam').innerHTML = ic(camOn ? 'video' : 'video-off'); $('pillCam').classList.toggle('on', !camOn); $('pillCam').classList.toggle('hidden', callState !== 'active');
}
function fixRoute() {
  if (callState !== 'active') return;
  if (AC && AC.state === 'suspended') AC.resume().catch(() => {});
  applyVol();
  if (audioEl.srcObject && audioEl.paused) audioEl.play().catch(() => {});
}
function callUi() {
  clearInterval(callTimer);
  const vis = callState === 'calling' || callState === 'active';
  setHidden($('call'), !vis || callMin, 340); setHidden($('callPill'), !vis || !callMin, 260);
  if (!vis) return;
  const nm = peer ? peer.name : t('peer'); $('callName').textContent = nm; setAv($('callAv'), nm, peer && peer.id);
  const upd = () => {
    const txt = callState === 'calling' ? t('calling') : fmtDur(Date.now() - callT0);
    $('callSt').textContent = txt; $('pillTxt').textContent = (callState === 'calling' ? t('callWord') : t('callWord2')) + ' · ' + nm + (callState === 'active' ? ' · ' + txt : '');
  };
  upd(); callTimer = setInterval(() => { upd(); syncPill(); fixRoute(); placeThumb(); }, 500); syncPill();
}
const dial = v => {
  if (callState === 'active') {
    if (v && !camOn) camStart().then(() => { if (camOn) { callMin = false; callUi(); } }); else { callMin = false; callUi(); }
    return;
  }
  if (callState || !canSend()) return; sdpUntil = Infinity; unlockAudio(); callVid = !!v; callMin = true; callState = 'calling'; sendJson({ t: 'call', v: v ? 1 : 0 }); startRing('out'); callUi();
};
$('btnCall').onclick = () => dial(false); $('btnVideo').onclick = () => dial(true);
function onCallInvite(m) {
  if (callState || !canSend()) { sendJson({ t: 'call-decline' }); return; }
  callVid = !!(m && m.v); $('incSub').textContent = t(callVid ? 'videoCall' : 'voiceCall');
  sdpUntil = Infinity; callMin = true; callState = 'ringing'; const nm = peer ? peer.name : t('peer'); $('incTxt').textContent = nm; setAv($('incAv'), nm, peer && peer.id);
  setHidden($('incoming'), false); startRing('in'); notify('', 'call', nm);
}
$('incYes').onclick = () => { unlockAudio(); setHidden($('incoming'), true, 260); if (callState !== 'ringing') return; stopRing(); sendJson({ t: 'call-accept' }); beginMedia(); };
$('incNo').onclick = () => { setHidden($('incoming'), true, 260); stopRing(); sdpUntil = 0; if (callState === 'ringing') { sendJson({ t: 'call-decline' }); callState = null; callUi(); } };
async function beginMedia() {
  stopRing();
  const AUD = { echoCancellation: true, noiseSuppression: true, autoGainControl: true }, gum = navigator.mediaDevices.getUserMedia.bind(navigator.mediaDevices);
  try {
    if (callVid) { try { localStream = await gum({ audio: AUD, video: VIDC() }); } catch { toast(t('noCam'), 4200); localStream = await gum({ audio: AUD, video: false }); } }
    else localStream = await gum({ audio: AUD, video: false });
  } catch { toast(t('noMic'), 4200); sendJson({ t: 'hangup' }); endCall(false); return; }
  if (!pc) return endCall(false);
  try { if (navigator.audioSession) navigator.audioSession.type = 'play-and-record'; } catch {}
  muted = false; vol = 1;
  $('btnMute').classList.remove('on'); $('btnMute').querySelector('i').innerHTML = ic('mic');
  $('callNote').textContent = '';
  localStream.getTracks().forEach(tr => { const sn = pc.addTrack(tr, localStream); if (tr.kind === 'video') vidSender = sn; });
  camOn = !!localStream.getVideoTracks().length; if (camOn) { $('locVid').srcObject = new MediaStream(localStream.getVideoTracks()); $('locVid').play().catch(() => {}); sendJson({ t: 'cam', on: true }); }
  callState = 'active'; setTimeout(() => { if (callState === 'active') sendJson({ t: 'cam', on: camOn, scr: scrOn ? 1 : 0 }); }, 1500); setTimeout(() => { if (callState === 'active') sendJson({ t: 'cam', on: camOn, scr: scrOn ? 1 : 0 }); }, 5000); callT0 = Date.now(); callMin = !camOn; answerBeep();
  unlockAudio(); applyVol(); callUi(); vidUi(); wakeOn(); if (camOn) tuneSender(vidSender); audioEl.play().catch(() => {});
}
$('vol').addEventListener('input', e => { vol = e.target.value / 100; applyVol(); });
const mirrorOf = tr => !!tr && !(tr.getSettings && tr.getSettings().facingMode === 'environment');
const CAMQ = [1920, 1080, 30, 5000000], SCRQ = [1920, 1080, 30, 3500000];
const VIDC = () => ({ facingMode: { ideal: camFacing }, width: { ideal: CAMQ[0] }, height: { ideal: CAMQ[1] }, frameRate: { ideal: CAMQ[2] } });
async function tuneSender(sn) {
  if (!sn) return; const [, , f] = scrOn ? SCRQ : CAMQ, tr = sn.track, st = tr && tr.getSettings ? tr.getSettings() : {};
  try {
    const p = sn.getParameters(); if (!p.encodings || !p.encodings.length) p.encodings = [{}]; const e = p.encodings[0];
    delete e.maxBitrate; e.maxFramerate = f; delete e.scaleResolutionDownBy;
    p.degradationPreference = 'maintain-framerate';
    await sn.setParameters(p);
    dbg('video send', scrOn ? 'screen' : 'camera', 'cap ' + (st.width || '?') + 'x' + (st.height || '?') + '@' + Math.round(st.frameRate || 0), 'max browser/' + f + 'fps');
  } catch (er) { dbg('video send params error', er.message); }
}
function placeThumb() {
  const call = $('call'), lv = $('locVid'), on = scrOn && !call.classList.contains('swap');
  call.classList.toggle('lscr', on); if (!on) return;
  const ar = (lv.videoWidth && lv.videoHeight) ? lv.videoWidth / lv.videoHeight : 16 / 9, top = $('volBox').getBoundingClientRect().top;
  let w = Math.min(300, innerWidth * .72), h = w / ar; const maxH = Math.min(innerHeight * .3, 260); if (h > maxH) { h = maxH; w = h * ar; }
  const st = call.style; st.setProperty('--tw', Math.round(w) + 'px'); st.setProperty('--th', Math.round(h) + 'px'); st.setProperty('--tx', Math.round((innerWidth - w) / 2) + 'px'); st.setProperty('--ty', Math.max(60, Math.round(top - 14 - h)) + 'px');
}
addEventListener('resize', placeThumb); ['loadedmetadata', 'resize'].forEach(ev => $('locVid').addEventListener(ev, placeThumb));
function vidUi() {
  const pv = peerCam && !!remoteStream && callState === 'active';
  $('remVid').classList.toggle('hidden', !pv); $('locVid').classList.toggle('hidden', !camOn);
  $('call').classList.toggle('vid', pv || camOn);
  $('btnCam').classList.toggle('on', !camOn || scrOn); $('btnCam').querySelector('i').innerHTML = ic(camOn && !scrOn ? 'video' : 'video-off'); $('btnFlip').classList.toggle('hidden', !camOn || scrOn);
  { const vt = !scrOn && localStream && localStream.getVideoTracks()[0]; if (!vt) HZ = null; else if (!HZ || HZ.tr !== vt) hzInit(vt); }
  { const lv = $('locVid'); lv._mirror = !scrOn && mirrorOf(localStream && localStream.getVideoTracks()[0]); applyT(lv); }
  $('locVid').classList.toggle('scr', scrOn); $('remVid').classList.toggle('scr', peerScr); placeThumb();
  $('btnScr').classList.toggle('hidden', !CAN_SCR || callState !== 'active'); $('btnScr').classList.toggle('on', scrOn); $('scrLbl').textContent = t(scrOn ? 'scrStop' : 'scr');
  drawSync();
}
function camStop(tell = true) {
  if (scrOn) { scrStop(false); return; }
  zpStop(false); zoomReset($('locVid'));
  if (localStream) localStream.getVideoTracks().forEach(tr => { tr.stop(); localStream.removeTrack(tr); });
  try { vidSender && vidSender.replaceTrack(null); } catch {}
  camOn = false; $('locVid').srcObject = null; if (tell && callState === 'active') sendJson({ t: 'cam', on: false }); vidUi();
}
async function camStart() {
  if (scrOn) await scrStop(false);
  let tr; try { tr = (await navigator.mediaDevices.getUserMedia({ video: VIDC() })).getVideoTracks()[0]; } catch { toast(t('noCam'), 4200); return; }
  if (!localStream || !pc || callState !== 'active') { tr.stop(); return; }
  localStream.addTrack(tr);
  if (vidSender) { try { await vidSender.replaceTrack(tr); } catch { vidSender = pc.addTrack(tr, localStream); } } else vidSender = pc.addTrack(tr, localStream);
  camOn = true; $('locVid').srcObject = new MediaStream([tr]); $('locVid').play().catch(() => {}); sendJson({ t: 'cam', on: true }); vidUi(); tuneSender(vidSender);
}
const bigIsLocal = () => $('call').classList.contains('swap');
bindGestures($('locVid'), { enabled: () => bigIsLocal(), track: () => localStream && localStream.getVideoTracks()[0], onTap: () => { if (bigIsLocal()) { $('call').classList.toggle('hideui'); if (!scrOn && camOn && !$('call').classList.contains('hideui')) zbShow(zAdapter($('locVid'))); } else { $('call').classList.toggle('swap'); zoomReset($('locVid')); zoomReset($('remVid')); } } });
bindGestures($('remVid'), { enabled: () => !bigIsLocal(), track: null, onTap: () => { if (!bigIsLocal()) $('call').classList.toggle('hideui'); else { $('call').classList.toggle('swap'); zoomReset($('locVid')); zoomReset($('remVid')); } } });
$('btnCam').onclick = () => { if (callState !== 'active') return; if (scrOn) { scrStop(false).then(camStart); return; } if (camOn) camStop(); else camStart(); };
async function scrStart() {
  if (callState !== 'active' || !pc || !localStream || scrOn) return;
  let tr; try { tr = (await navigator.mediaDevices.getDisplayMedia({ video: { frameRate: { ideal: SCRQ[2], max: SCRQ[2] }, width: { max: SCRQ[0] }, height: { max: SCRQ[1] } }, audio: false })).getVideoTracks()[0]; } catch { return; }
  if (!tr) return; if (callState !== 'active' || !localStream) { tr.stop(); return; }
  zpStop(false); zoomReset($('locVid'));
  try { tr.contentHint = 'motion'; } catch {}
  camWas = camOn && !scrOn;
  localStream.getVideoTracks().forEach(x => { x.stop(); localStream.removeTrack(x); }); localStream.addTrack(tr);
  if (vidSender) { try { await vidSender.replaceTrack(tr); } catch { vidSender = pc.addTrack(tr, localStream); } } else vidSender = pc.addTrack(tr, localStream);
  dbg('screen share start'); scrTrack = tr; scrOn = true; camOn = true; tuneSender(vidSender); tr.onended = () => { if (scrTrack === tr) scrStop(true); };
  $('locVid').srcObject = new MediaStream([tr]); $('locVid').play().catch(() => {}); sendJson({ t: 'cam', on: true, scr: 1 }); vidUi();
  if (callMin) { callMin = false; callUi(); }
}
async function scrStop(restoreCam = true) {
  if (!scrOn) return; dbg('screen share stop'); const tr = scrTrack; scrOn = false; scrTrack = null; camOn = false;
  try { tr.onended = null; tr.stop(); } catch {} try { localStream && localStream.removeTrack(tr); } catch {}
  try { vidSender && await vidSender.replaceTrack(null); } catch {}
  $('locVid').srcObject = null; if (callState === 'active') sendJson({ t: 'cam', on: false });
  const again = restoreCam && camWas && callState === 'active'; camWas = false; vidUi();
  if (again) await camStart();
}
$('btnShrink').onclick = () => { $('call').classList.remove('swap', 'hideui'); zoomReset($('locVid')); zoomReset($('remVid')); vidUi(); };
$('btnScr').onclick = () => { if (scrOn) scrStop(true); else scrStart(); };
$('btnFlip').onclick = async () => {
  if (!camOn || !localStream) return;
  const prev = camFacing; camFacing = prev === 'user' ? 'environment' : 'user';
  zpStop(false); zoomReset($('locVid'));
  localStream.getVideoTracks().forEach(tr => { tr.stop(); localStream.removeTrack(tr); });
  let tr; try { tr = (await navigator.mediaDevices.getUserMedia({ video: VIDC() })).getVideoTracks()[0]; }
  catch { camFacing = prev; try { tr = (await navigator.mediaDevices.getUserMedia({ video: VIDC() })).getVideoTracks()[0]; } catch { camStop(); toast(t('noCam'), 4200); return; } }
  localStream.addTrack(tr); try { await vidSender.replaceTrack(tr); } catch {} $('locVid').srcObject = new MediaStream([tr]); vidUi(); tuneSender(vidSender);
};
$('btnMute').onclick = () => { if (!localStream) return; muted = !muted; localStream.getAudioTracks().forEach(tr => tr.enabled = !muted); $('btnMute').classList.toggle('on', muted); $('btnMute').querySelector('i').innerHTML = ic(muted ? 'mic-off' : 'mic'); vib(10); };
$('btnHang').onclick = () => endCall(true); $('pillEnd').onclick = () => endCall(true);
$('callMin').onclick = () => { callMin = true; callUi(); }; $('pillMute').onclick = () => $('btnMute').click();
$('pillCam').onclick = async () => { if (callState !== 'active') return; if (camOn) camStop(); else { await camStart(); if (camOn) { callMin = false; callUi(); } } };
$('callPill').onclick = e => { if (e.target.closest('#pillEnd,.pb')) return; callMin = false; callUi(); };
function endCall(notifyPeer) {
  if (notifyPeer && callState) sendJson({ t: 'hangup' });
  stopRing(); wakeOff(); sdpUntil = Date.now() + 8000;
  zpStop(false); if (localStream) { localStream.getTracks().forEach(tr => tr.stop()); localStream = null; }
  if (pc && pc.signalingState !== 'closed') pc.getSenders().forEach(s => { try { pc.removeTrack(s); } catch {} });
  try { srcNode && srcNode.disconnect(); } catch {} srcNode = null; remoteStream = null;
  camOn = peerCam = peerScr = callVid = scrOn = camWas = false; scrTrack = null; vidSender = null; drawReset(); $('call').classList.remove('swap', 'hideui'); zoomReset($('locVid')); zoomReset($('remVid')); $('remVid').srcObject = null; $('locVid').srcObject = null;
  try { if (navigator.audioSession) navigator.audioSession.type = 'auto'; } catch {}
  setHidden($('incoming'), true, 260); volOpen(false); try { audioEl.pause(); } catch {} audioEl.srcObject = null; callState = null;
  stopTones(); try { gainNode && gainNode.disconnect(); compNode && compNode.disconnect(); } catch {} gainNode = compNode = null; try { AC && AC.state === 'running' && AC.suspend(); } catch {}
   callMin = false; callUi(); vidUi();
}


['loadedmetadata', 'resize'].forEach(ev => $('remVid').addEventListener(ev, () => dbg('remote video', $('remVid').videoWidth + 'x' + $('remVid').videoHeight)));

let volT = 0;
function volOpen(on) { clearTimeout(volT); $('volBox').classList.toggle('open', on); $('volBtn').setAttribute('aria-expanded', on ? 'true' : 'false'); if (on) volT = setTimeout(() => volOpen(false), 4000); }
$('volBtn').onclick = () => volOpen(!$('volBox').classList.contains('open'));
$('vol').addEventListener('input', () => volOpen(true));

addEventListener('pagehide', e => {
  if (e.persisted) return;
  try { stopTones(); audioEl.pause(); audioEl.srcObject = null; if (localStream) localStream.getTracks().forEach(tr => tr.stop()); srcNode && srcNode.disconnect(); AC && AC.close(); } catch {}
  AC = gainNode = compNode = srcNode = null;
});

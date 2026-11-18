'use strict';
const DRAW = { on: false, strokes: [], raf: 0, cur: null, told: false, n: 0 };
const D_LIFE = 2000, D_FADE = 450, D_CHUNK = 12, D_MAX = 3000, D_COLORS = ['#ffd60a', '#ff453a', '#32d74b', '#64d2ff', '#bf5af2', '#ff9f0a'];
const dCv = document.createElement('canvas'); dCv.id = 'drawCv'; document.body.append(dCv);
const dCtx = dCv.getContext('2d');

function drawTargets() {
  const out = [];
  if (typeof callState !== 'undefined' && callState === 'active' && !$('call').classList.contains('hidden')) {
    [['r', $('remVid')], ['l', $('locVid')]].forEach(([k, v]) => { if (!v.classList.contains('hidden') && v.videoWidth) out.push({ key: k, el: v }); });
  }
  return out;
}
function dFit(el) {
  const r = el.getBoundingClientRect(), vw = el.videoWidth, vh = el.videoHeight; if (!vw || !vh || r.width < 2) return null;
  const k = (getComputedStyle(el).objectFit === 'cover' ? Math.max : Math.min)(r.width / vw, r.height / vh), w = vw * k, h = vh * k;
  return { r, x: r.left + (r.width - w) / 2, y: r.top + (r.height - h) / 2, w, h };
}
const dMirror = el => !!el._mirror;
const dHash = s => { let h = 0; for (const c of String(s)) h = (h * 31 + c.charCodeAt(0)) >>> 0; return h; };


function dTrace(c, xs, ys, a, b) {
  const n = xs.length, mx = i => (xs[i] + xs[i + 1]) / 2, my = i => (ys[i] + ys[i + 1]) / 2;
  if (a === 0) c.moveTo(xs[0], ys[0]); else c.moveTo(mx(a - 1), my(a - 1));
  for (let i = a; i <= b; i++) { if (i >= n - 1) c.lineTo(xs[n - 1], ys[n - 1]); else c.quadraticCurveTo(xs[i], ys[i], mx(i), my(i)); }
}
let dSig = '';
function dFrame() {
  DRAW.raf = 0; const now = performance.now(), dpr = Math.min(2, window.devicePixelRatio || 1), W = innerWidth, H = innerHeight;
  DRAW.strokes = DRAW.strokes.filter(s => { const last = s.pts[s.pts.length - 1]; return last && now - last.t < D_LIFE + D_FADE; });
  const ts = drawTargets(); let fading = false, sig = W + 'x' + H + ':';
  for (const x of ts) { const r = x.el.getBoundingClientRect(); sig += x.key + [r.left, r.top, r.width, r.height].map(Math.round) + (x.el._mirror ? 'm' : '') + ';'; }
  for (const s of DRAW.strokes) { const last = s.pts[s.pts.length - 1]; if (now - last.t > D_LIFE) fading = true; sig += s.pts.length + ','; }
  if (fading || sig !== dSig || dCv.width !== Math.round(W * dpr)) {
    dSig = sig;
    if (dCv.width !== Math.round(W * dpr) || dCv.height !== Math.round(H * dpr)) { dCv.width = Math.round(W * dpr); dCv.height = Math.round(H * dpr); }
    dCtx.setTransform(dpr, 0, 0, dpr, 0, 0); dCtx.clearRect(0, 0, W, H);
    for (const s of DRAW.strokes) {
      const tg = ts.find(x => x.key === s.k); if (!tg) continue; const f = dFit(tg.el); if (!f) continue; const mir = dMirror(tg.el);
      const u = Math.min(1, Math.max(0, (now - s.pts[s.pts.length - 1].t - D_LIFE) / D_FADE)), sc = (1 - u) * (1 - u); if (sc < .03) continue;
      const lw = Math.max(4, f.w * 0.009) * sc, n = s.pts.length, xs = new Float32Array(n), ys = new Float32Array(n);
      for (let i = 0; i < n; i++) { const q = s.pts[i]; xs[i] = f.x + (mir ? 1 - q.x : q.x) * f.w; ys[i] = f.y + q.y * f.h; }
      dCtx.save(); dCtx.beginPath(); dCtx.rect(f.r.left, f.r.top, f.r.width, f.r.height); dCtx.clip(); dCtx.lineCap = dCtx.lineJoin = 'round';
      if (n === 1) { dCtx.fillStyle = 'hsl(' + (((s.pts[0].h % 360) + 360) % 360) + ',100%,58%)'; dCtx.beginPath(); dCtx.arc(xs[0], ys[0], lw * .75, 0, 6.2832); dCtx.fill(); dCtx.restore(); continue; }
      dCtx.strokeStyle = 'rgba(0,0,0,.38)'; dCtx.lineWidth = lw + 3 * sc; dCtx.beginPath(); dTrace(dCtx, xs, ys, 0, n - 1); dCtx.stroke();
      dCtx.lineWidth = lw;
      for (let a = 0; a < n; a += D_CHUNK) {
        const b = Math.min(n - 1, a + D_CHUNK - 1), h = s.pts[Math.min(n - 1, (a + b) >> 1)].h;
        dCtx.strokeStyle = 'hsl(' + (((h % 360) + 360) % 360) + ',100%,58%)'; dCtx.beginPath(); dTrace(dCtx, xs, ys, a, b); dCtx.stroke();
      }
      dCtx.restore();
    }
  }
  if (DRAW.strokes.length) DRAW.raf = requestAnimationFrame(dFrame); else if (dSig) { dSig = ''; dCtx.setTransform(1, 0, 0, 1, 0, 0); dCtx.clearRect(0, 0, dCv.width, dCv.height); }
}
const dKick = () => { if (!DRAW.raf) DRAW.raf = requestAnimationFrame(dFrame); };
function drawAdd(from, id, key, color, pts, spread) {
  const now = performance.now(), sid = from + ':' + id; let s = DRAW.strokes.find(x => x.id === sid);
  if (!s) { if (DRAW.strokes.length >= 60) DRAW.strokes.shift(); s = { id: sid, k: key, c: color, len: 0, pts: [] }; DRAW.strokes.push(s); }
  if (DRAW.strokes.reduce((a, x) => a + x.pts.length, 0) > D_MAX) return;
  pts.forEach((p, i) => {
    const l = s.pts[s.pts.length - 1]; if (l) s.len += Math.hypot(p[0] - l.x, p[1] - l.y);
    s.pts.push({ x: p[0], y: p[1], t: now - (pts.length - 1 - i) * (spread || 0), h: 28 - 50 * Math.min(1, s.len / .6) });
  });
  dKick();
}
function drawSend(m) { try { sendJson(m); } catch {} }
function drawRecv(m, from) {
  if (!m || typeof m.i !== 'string' || m.i.length > 16 || typeof m.k !== 'string' || m.k.length > 40 || !Array.isArray(m.p) || m.p.length > 80) return;
  const pts = []; for (const q of m.p) { if (!Array.isArray(q) || q.length !== 2 || !Number.isFinite(q[0]) || !Number.isFinite(q[1])) return; pts.push([Math.min(1, Math.max(0, q[0] / 10000)), Math.min(1, Math.max(0, q[1] / 10000))]); }
  if (!pts.length) return;
  let key, who;
  if (from) { key = m.k; who = from.id; } else { key = m.k === 'r' ? 'l' : m.k === 'l' ? 'r' : null; who = 'peer'; }
  if (!key) return;
  drawAdd(who, m.i, key, D_COLORS[1 + dHash(who) % (D_COLORS.length - 1)], pts, 45 / pts.length);
}

function drawMode(on) {
  DRAW.on = !!on && drawTargets().length > 0; document.body.classList.toggle('drawing', DRAW.on);
  ['btnPen'].forEach(id => { const b = document.getElementById(id); if (b) b.classList.toggle('on', DRAW.on); });
  if (DRAW.on) { $('call').classList.remove('hideui'); if (!DRAW.told) { DRAW.told = true; toast(t('drawHint'), 3200); } }
  else if (DRAW.cur) dEnd();
}
function drawSync() {
  const has = drawTargets().length > 0;
  ['btnPen'].forEach(id => { const b = document.getElementById(id); if (b) b.classList.toggle('hidden', !has); });
  if (!has && DRAW.on) drawMode(false);
}
function drawReset() { DRAW.strokes = []; drawMode(false); drawSync(); dKick(); }
function dHit(e) { const ts = drawTargets().reverse(); for (const tg of ts) { const r = tg.el.getBoundingClientRect(); if (e.clientX >= r.left && e.clientX <= r.right && e.clientY >= r.top && e.clientY <= r.bottom) return tg; } return null; }
function dNorm(tg, e) {
  const f = dFit(tg.el); if (!f) return null; let x = (e.clientX - f.x) / f.w; const y = (e.clientY - f.y) / f.h; if (dMirror(tg.el)) x = 1 - x;
  return [Math.min(1, Math.max(0, x)), Math.min(1, Math.max(0, y))];
}
function dFlush(end) {
  const c = DRAW.cur; if (!c) return; clearTimeout(c.tm); c.tm = 0;
  if (c.buf.length) { drawSend({ t: 'draw', k: c.key, i: c.id, p: c.buf.map(p => [Math.round(p[0] * 10000), Math.round(p[1] * 10000)]) }); c.buf = []; }
}
function dEnd() { const c = DRAW.cur; if (!c) return; dFlush(true); DRAW.cur = null; }
addEventListener('pointerdown', e => {
  if (!DRAW.on || (e.pointerType === 'mouse' && e.button !== 0)) return;
  if (e.target.closest && e.target.closest('button,input,.cbtns,.rmctl,.vol,.callpill,.sheetbg')) return;
  const tg = dHit(e); if (!tg) return; const p = dNorm(tg, e); if (!p) return;
  e.preventDefault(); e.stopPropagation();
  DRAW.cur = { pid: e.pointerId, key: tg.key, id: (++DRAW.n).toString(36) + Math.floor(Math.random() * 1296).toString(36), buf: [p], tm: 0, lastP: p, tg };
  drawAdd('me', DRAW.cur.id, tg.key, D_COLORS[0], [p], 0);
  DRAW.cur.tm = setTimeout(() => dFlush(false), 45);
}, true);
addEventListener('pointermove', e => {
  const c = DRAW.cur; if (!c || e.pointerId !== c.pid) return; e.preventDefault(); e.stopPropagation();
  const evs = e.getCoalescedEvents && e.getCoalescedEvents().length ? e.getCoalescedEvents() : [e], f = dFit(c.tg.el);
  for (const ev of evs) {
    const p = dNorm(c.tg, ev); if (!p || !f) continue;
    if (Math.hypot((p[0] - c.lastP[0]) * f.w, (p[1] - c.lastP[1]) * f.h) < 2.5) continue;
    c.lastP = p; drawAdd('me', c.id, c.key, D_COLORS[0], [p], 0); c.buf.push(p);
  }
  if (c.buf.length >= 40) dFlush(false); else if (!c.tm) c.tm = setTimeout(() => dFlush(false), 45);
}, true);
['pointerup', 'pointercancel'].forEach(ev => addEventListener(ev, e => { const c = DRAW.cur; if (!c || e.pointerId !== c.pid) return; e.stopPropagation(); dEnd(); }, true));
$('btnPen').onclick = () => drawMode(!DRAW.on);
['loadedmetadata', 'emptied', 'resize'].forEach(ev => document.addEventListener(ev, e => { if (e.target && e.target.tagName === 'VIDEO') drawSync(); }, true));

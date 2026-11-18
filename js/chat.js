'use strict';
const log = $('log'); let lastDay = ''; const ticks = new Map();
const scrollLog = () => { log.scrollTop = log.scrollHeight; requestAnimationFrame(() => { log.scrollTop = log.scrollHeight; }); };
const nearBottom = () => log.scrollHeight - log.scrollTop - log.clientHeight < 160;
function removeMsg(el) {
  if (!el || !el.isConnected || el._gone) return; el._gone = true; delete el.dataset.mid; el.style.pointerEvents = 'none';
  if (reduceMotion()) { el.remove(); return; }
  el.style.animation = 'none'; el.style.height = el.offsetHeight + 'px'; void el.offsetHeight;
  el.classList.add('gone'); setTimeout(() => el.remove(), 520);
}
const byMid = id => log.querySelector(`.m[data-mid="${CSS.escape(id)}"]`);
function clearLog() { log.innerHTML = ''; lastDay = ''; ticks.clear(); clearReply('chat'); }
function sys(text, cls) { const d = document.createElement('div'); d.className = 'sys' + (cls ? ' ' + cls : ''); d.textContent = text; log.append(d); scrollLog(true); }
function dayLabel(ts) {
  const d = new Date(ts), n = new Date(), y = new Date(); y.setDate(n.getDate() - 1);
  if (d.toDateString() === n.toDateString()) return t('today'); if (d.toDateString() === y.toDateString()) return t('yesterday');
  return d.toLocaleDateString(loc(), { day: 'numeric', month: 'long', year: d.getFullYear() !== n.getFullYear() ? 'numeric' : undefined });
}
function setTick(tk, st) { tk.textContent = st ? '✓✓' : '✓'; tk.className = 'tk' + (st === 2 ? ' r' : st === 1 ? ' d' : ''); tk._s = st; }
function bumpTick(id, st) {
  const tk = ticks.get(id); if (tk && (tk._s || 0) < st) setTick(tk, st);
}
function attachActions(el) { attachMsg(el, () => msgSheet(el), () => startReply(el, 'chat')); }
function bubble(who, ts, id) {
  ts = ts || Date.now(); const k = new Date(ts).toDateString();
  if (k !== lastDay) { lastDay = k; const s = document.createElement('div'); s.className = 'sys day'; s.textContent = dayLabel(ts); log.append(s); }
  const d = document.createElement('div'); d.className = 'm ' + who; if (id) d.dataset.mid = id; d.dataset.w = who; d._text = '';
  const body = document.createElement('div'), tm = document.createElement('span'); tm.className = 't'; tm.textContent = clock(ts);
  let tick = null; if (who === 'me') { tick = document.createElement('b'); tick.className = 'tk'; tick.textContent = '✓'; tm.append(tick); }
  d.append(body, tm); if (id) attachActions(d); log.append(d); scrollLog(true); return { el: d, body, tick };
}
function markDeleted(el) {
  el.classList.add('del'); el._text = ''; el.dataset.deleted = '1'; delete el.dataset.unread; el._rx = null;
  const body = el.firstChild; body.textContent = '🚫 ' + t('msgDeleted');
  const tk = el.querySelector('.tk'); if (tk) { tk.remove(); ticks.delete(el.dataset.mid); }
  const rx = el.querySelector(':scope > .rx'); if (rx) rx.remove(); el.classList.remove('hasrx');
}
function renderEntry(e) {
  const b = bubble(e.w, e.ts, e.id);
  if (e.del) { markDeleted(b.el); return b; }
  if (e.k === 'text') { linkify(b.body, e.t); b.el._text = e.t; if (e.rp) b.body.prepend(quoteEl(e.rp, e.w, 'chat')); if (shareMode()) addCopy(b.el, e.t); } else fileBody(b.body, e.name, e.size, null, null);
  if (b.tick && e.id) { ticks.set(e.id, b.tick); setTick(b.tick, e.s || (e.d ? 1 : 0)); }
  if (e.w === 'them' && !e.r && e.id) b.el.dataset.unread = '1';
  return b;
}
function addCopy(el, text) {
  const c = document.createElement('button'); c.type = 'button'; c.className = 'cpy'; c.setAttribute('aria-label', t('copy')); c.innerHTML = '<svg class="ic sm"><use href="#i-copy"/></svg>';
  c.onclick = async e => { e.stopPropagation(); try { await navigator.clipboard.writeText(text); toast(t('copied')); } catch { toast(t('copyFail')); } };
  el.append(c);
}
const RASTER = /^image\/(png|jpe?g|gif|webp|avif)$/i;
function saveBlob(blob, name) {
  const dl = () => { const a = document.createElement('a'); a.href = trackUrl(blob); a.download = name; document.body.append(a); a.click(); a.remove(); };
  try {
    const f = new File([blob], name, { type: blob.type });
    if (matchMedia('(pointer:coarse)').matches && navigator.canShare && navigator.canShare({ files: [f] })) { navigator.share({ files: [f] }).catch(e => { if (e && e.name !== 'AbortError') dl(); }); return; }
  } catch {}
  dl();
}
function fileBody(el, name, size, blob, mime, note) {
  el.innerHTML = ''; const bub = el.parentNode;
  const isImg = !!(blob && mime && RASTER.test(mime));
  if (bub && bub.classList) bub.classList.toggle('media', isImg);
  if (isImg) {
    const url = trackUrl(blob), box = document.createElement('div'), img = document.createElement('img'), sv = document.createElement('button');
    box.className = 'pic'; box.setAttribute('role', 'button'); box.tabIndex = 0;
    img.alt = name; img.decoding = 'async'; img.draggable = false;
    img.onload = () => { box.classList.add('ld'); if (nearBottom()) scrollLog(); };
    img.src = url;
    sv.type = 'button'; sv.className = 'pdl'; sv.setAttribute('aria-label', t('saveImg')); sv.innerHTML = ic('download', 'sm');
    sv.onclick = e => { e.stopPropagation(); saveBlob(blob, name); };
    box.onclick = () => { if (bub && Date.now() - (bub._lpAt || 0) < 800) return; openViewer(url, name, blob); };
    box.onkeydown = e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); box.click(); } };
    box.append(img, sv); el.append(box); return;
  }
  const f = document.createElement('div'); f.className = 'file'; const i = document.createElement('i'); i.textContent = blob ? '⬇' : '📎';
  const w = document.createElement('div'); const n = document.createElement('div'); n.textContent = name; const s = document.createElement('span'); s.textContent = fmtSize(size) + (blob ? ' · ' + t('tapSave') : ' · ' + (note || t('notSaved')));
  w.append(n, s); f.append(i, w); el.append(f);
  if (blob) { f.style.cursor = 'pointer'; f.onclick = () => saveBlob(blob, name); }
}

let viewerOpen = false, vwBlob = null, vwName = '';
const vw = { s: 1, x: 0, y: 0 };
function vwPaint(snap) {
  const img = $('vwImg'); img.style.transition = snap ? 'transform .38s var(--spring)' : 'none';
  img.style.transform = `translate(${vw.x}px,${vw.y}px) scale(${vw.s})`;
}
function vwClamp() {
  const img = $('vwImg'), st = $('vwStage'), mx = Math.max(0, (img.clientWidth * vw.s - st.clientWidth) / 2), my = Math.max(0, (img.clientHeight * vw.s - st.clientHeight) / 2);
  vw.x = Math.max(-mx, Math.min(mx, vw.x)); vw.y = Math.max(-my, Math.min(my, vw.y));
}
function openViewer(url, name, blob) {
  if (viewerOpen) return; viewerOpen = true; vwBlob = blob; vwName = name;
  const v = $('viewer'); $('vwImg').src = url; $('vwName').textContent = name;
  vw.s = 1; vw.x = vw.y = 0; vwPaint(false); v.style.setProperty('--vk', '1'); v.style.removeProperty('--vo'); v.classList.remove('nochrome');
  setHidden(v, false); try { document.activeElement && document.activeElement.blur(); } catch {}
}
function closeViewer(now) {
  if (!viewerOpen) return; viewerOpen = false; const v = $('viewer');
  v.style.setProperty('--vo', getComputedStyle(v).getPropertyValue('--vk') || '1');
  if (now) { v.classList.add('hidden'); v.classList.remove('out'); $('vwImg').removeAttribute('src'); return; }
  setHidden(v, true, 300); setTimeout(() => { if (!viewerOpen) $('vwImg').removeAttribute('src'); }, 340);
}
(() => {
  const st = $('vwStage'), v = $('viewer'), ptrs = new Map(); let d0 = 0, s0 = 1, moved = 0, t0 = 0, lastTap = 0, tapT = 0, dismiss = false, vy = 0, ly = 0, lt = 0, onImg = false;
  const dist = () => { const [a, b] = [...ptrs.values()]; return Math.hypot(a.x - b.x, a.y - b.y); };
  const zoomAt = (px, py, s2) => {
    const r = st.getBoundingClientRect(), cx = px - r.left - r.width / 2, cy = py - r.top - r.height / 2, k = s2 / vw.s;
    vw.x = cx - (cx - vw.x) * k; vw.y = cy - (cy - vw.y) * k; vw.s = s2; if (s2 <= 1) { vw.x = vw.y = 0; } vwClamp();
  };
  const bg = k => v.style.setProperty('--vk', String(Math.max(0, Math.min(1, k))));
  st.addEventListener('pointerdown', e => {
    try { st.setPointerCapture(e.pointerId); } catch {} ptrs.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (ptrs.size === 1) { moved = 0; t0 = Date.now(); dismiss = false; vy = 0; ly = e.clientY; lt = t0; onImg = e.target === $('vwImg'); } else { d0 = dist(); s0 = vw.s; moved = 99; dismiss = false; bg(1); }
  });
  st.addEventListener('pointermove', e => {
    const p = ptrs.get(e.pointerId); if (!p) return; const dx = e.clientX - p.x, dy = e.clientY - p.y; p.x = e.clientX; p.y = e.clientY; moved += Math.abs(dx) + Math.abs(dy);
    if (ptrs.size === 2 && d0) { vw.s = Math.max(1, Math.min(6, s0 * dist() / d0)); if (vw.s === 1) vw.x = vw.y = 0; vwClamp(); vwPaint(false); }
    else if (ptrs.size === 1) {
      if (vw.s > 1.02) { vw.x += dx; vw.y += dy; vwClamp(); vwPaint(false); }
      else if (dismiss || (moved > 10 && Math.abs(vw.y + dy) > Math.abs(dx))) {
        dismiss = true; vw.y += dy; vw.x += dx * .35; const n = Date.now(); vy = (e.clientY - ly) / Math.max(1, n - lt); ly = e.clientY; lt = n;
        bg(1 - Math.abs(vw.y) / (innerHeight * .55)); vwPaint(false);
      }
    }
  });
  const up = e => {
    if (!ptrs.has(e.pointerId)) return; const n = ptrs.size; ptrs.delete(e.pointerId);
    if (n === 2) { if (vw.s < 1.05) { vw.s = 1; vw.x = vw.y = 0; vwPaint(true); } return; }
    if (dismiss) {
      dismiss = false;
      if (Math.abs(vw.y) > 120 || Math.abs(vy) > .7) { const dir = vw.y < 0 ? -1 : 1; vw.y = dir * innerHeight * .7; bg(0); vwPaint(true); setTimeout(() => closeViewer(), 120); }
      else { vw.x = vw.y = 0; bg(1); vwPaint(true); }
      return;
    }
    if (moved < 10 && Date.now() - t0 < 350) {
      const now = Date.now();
      if (now - lastTap < 300) { clearTimeout(tapT); lastTap = 0; zoomAt(e.clientX, e.clientY, vw.s > 1.3 ? 1 : 2.6); vwPaint(true); return; }
      lastTap = now; clearTimeout(tapT);
      const hit = onImg; tapT = setTimeout(() => { if (!hit) closeViewer(); else v.classList.toggle('nochrome'); }, 280);
    }
  };
  st.addEventListener('pointerup', up); st.addEventListener('pointercancel', e => { ptrs.delete(e.pointerId); if (!ptrs.size && (dismiss || vw.s < 1.05)) { dismiss = false; vw.s = 1; vw.x = vw.y = 0; bg(1); vwPaint(true); } });
  st.addEventListener('wheel', e => { e.preventDefault(); zoomAt(e.clientX, e.clientY, Math.max(1, Math.min(6, vw.s * Math.exp(-e.deltaY * .0025)))); vwPaint(false); }, { passive: false });
  $('vwClose').onclick = () => closeViewer(); $('vwSave').onclick = () => vwBlob && saveBlob(vwBlob, vwName);
  document.addEventListener('keydown', e => { if (e.key === 'Escape' && viewerOpen) closeViewer(); });
})();
function flushRead() {
  if (!(screen === 'chat' && !document.hidden && hello && session && liveConn() && peer)) return;
  const els = [...log.querySelectorAll('.m.them[data-unread="1"]')]; if (!els.length) return;
  const ids = els.map(e => e.dataset.mid); els.forEach(e => delete e.dataset.unread);
  if (cfg.receipts) for (let i = 0; i < ids.length; i += 40) sendJson({ t: 'read', ids: ids.slice(i, i + 40) });
}
document.addEventListener('visibilitychange', () => { if (!document.hidden) flushRead(); });
addEventListener('focus', flushRead);

function msgSheet(el) {
  if (sheetOpen || !peer) return; const id = el.dataset.mid; if (!id) return;
  const gone = !!el.dataset.deleted;
  openSheet(`<h3>${esc(t('msgH'))}</h3>
    ${gone ? '' : rxRowHtml(el) + `<button class="btn sec" id="mdReply">${ic('reply', 'sm')}${esc(t('msgReply'))}</button>`}
    ${!gone && el._text ? `<button class="btn sec" id="mdCopy">${ic('copy', 'sm')}${esc(t('copy'))}</button>` : ''}
    <button class="btn danger" id="mdAll">${ic('trash', 'sm')}${esc(t('msgDel'))}</button>
    <button class="btn sec" id="mdNo">${esc(t('cancel'))}</button>`, s => {
    if (!gone) { rxRowBind(s, el); s.querySelector('#mdReply').onclick = () => { closeSheet(); startReply(el, 'chat'); }; }
    const c = s.querySelector('#mdCopy'); if (c) c.onclick = async () => { closeSheet(); try { await navigator.clipboard.writeText(el._text); toast(t('copied')); } catch { toast(t('copyFail')); } };
    s.querySelector('#mdAll').onclick = () => { closeSheet(); deleteForAll(id); };
    s.querySelector('#mdNo').onclick = closeSheet;
  });
}
function deleteLocal(id) {
  const el = byMid(id); if (el) removeMsg(el); ticks.delete(id); scrubQuotes('chat', id);
}
function deleteForAll(id) {
  if (!peer) return; deleteLocal(id);
  if (liveWith(peer.id)) sendJson({ t: 'mdel', id });
}

let typingT = null, lastTypingSent = 0;
function onChunk(u8) {
  const f = incomingFile; if (!f) return;
  if (f.got + u8.length > f.size) { sys(t('sys_fileBad'), 'warn'); try { f.w && f.w.abort(); } catch {} incomingFile = null; return; }
  if (f.w) f.q = f.q.then(() => f.w.write(u8)).catch(() => {}); else f.parts.push(u8);
  f.got += u8.length;
  f.ui.upd(f.got, f.size);
  if (f.size > consentAt() && f.got - f.acked >= 4 * 1024 * 1024) { f.acked = f.got; sendJson({ t: 'file-ack', id: f.id, n: f.got }); }
}
async function onFileAsk(m) {
  const size = +m.size, name = cleanFile(m.name), id = typeof m.id === 'string' ? m.id.slice(0, 24) : '';
  if (!id || !(size > consentAt() && size <= maxFile()) || fileAsk) { sendJson({ t: 'file-no', id }); return; }
  fileAsk = id;
  const ok = await askConfirm(t('fileAskQ'), t('fileAskT', { p: peer ? peer.name : t('peer'), n: name, s: fmtSize(size) }), t('accept'));
  const still = fileAsk === id; fileAsk = null;
  if (!still || !liveConn()) return;
  if (!ok) { sendJson({ t: 'file-no', id }); return; }
  let w = null;
  if (window.showSaveFilePicker) { try { const h = await showSaveFilePicker({ suggestedName: name }); w = await h.createWritable(); } catch { sendJson({ t: 'file-no', id }); return; } }
  else if (size > MEM_CAP) { toast(t('fileNoMem'), 6000); sendJson({ t: 'file-no', id }); return; }
  consent.set(id, { size, w }); sendJson({ t: 'file-yes', id });
}
function onMsg(m) {
  if (!m || typeof m !== 'object' || !hello) return;
  if (shareMode() && !shReady() && m.t !== 'vok' && m.t !== 'vno' && m.t !== 'bye' && m.t !== 'rs') return;
  switch (m.t) {
    case 'rs': if (viaPw && !RS && typeof m.s === 'string') { try { const u = b64d(m.s); if (u.length === 32) RS = u; } catch {} } break;
    case 'vok': shPeerOk(); break;
    case 'vno': shPeerNo(); break;
    case 'msg': {
      if (typeof m.text !== 'string') return;
      const txt = bidi(m.text.slice(0, 8000)), id = typeof m.id === 'string' && m.id ? m.id.slice(0, 24) : rid();
      if (byMid(id)) return;
      renderEntry({ w: 'them', k: 'text', t: txt, ts: Date.now(), id, rp: cleanRp(m.rp) }); notify(txt);
      sendJson({ t: 'ack', id }); setTyping(false);
      if (screen === 'chat' && !document.hidden) flushRead();
      break;
    }
    case 'ack': if (typeof m.id === 'string') bumpTick(m.id, 1); break;
    case 'read': if (Array.isArray(m.ids)) m.ids.slice(0, 100).forEach(id => { if (typeof id === 'string') bumpTick(id, 2); }); break;
    case 'react': {
      if (typeof m.id !== 'string' || typeof m.e !== 'string' || (m.e && !RX.includes(m.e))) break;
      const el = byMid(m.id.slice(0, 24)); if (!el || el.dataset.deleted) break;
      rxSet(el, 'them', m.e); if (m.e && el.dataset.w === 'me') notify(m.e, 'rx'); break;
    }
    case 'typing': if (cfg.typing) setTyping(true); break;
    case 'mdel': if (typeof m.id === 'string') deleteLocal(m.id); break;
    case 'file-ask': onFileAsk(m); break;
    case 'file-yes': case 'file-no': { const r = typeof m.id === 'string' && askWait.get(m.id); if (r) r(m.t === 'file-yes' ? 'yes' : 'no'); break; }
    case 'file-cancel': if (fileAsk && fileAsk === m.id) { fileAsk = null; closeSheet(); toast(t('fileCancelled')); } break;
    case 'file-abort': { if (typeof m.id !== 'string') break; if (incomingFile && incomingFile.id === m.id) { const f = incomingFile; incomingFile = null; try { f.w && f.w.abort(); } catch {} try { removeMsg(f.b.el); } catch {} toast(t('fileCancelled')); } else cancelled.add(m.id.slice(0, 24)); break; }
    case 'file-ack': if (typeof m.id === 'string' && +m.n >= 0) fileAcks.set(m.id, +m.n); break;
    case 'file-start': {
      const size = Math.max(0, +m.size || 0), name = cleanFile(m.name), id = typeof m.id === 'string' && m.id ? m.id.slice(0, 24) : rid();
      if (size > maxFile()) { sys(t('sys_fileBig')); return; }
      if (incomingFile) { sys(t('sys_fileBusy'), 'warn'); return; }
      let w = null;
      if (size > consentAt()) { const c = consent.get(id); consent.delete(id); if (!c || c.size !== size) { sendJson({ t: 'file-no', id }); return; } w = c.w; }
      const b = bubble('them', Date.now(), id); fileBody(b.body, name, size, null, null); const ui = xferUi(b.body, id, () => { if (incomingFile && incomingFile.id === id) { const f = incomingFile; incomingFile = null; try { f.w && f.w.abort(); } catch {} try { removeMsg(f.b.el); } catch {} sendJson({ t: 'file-abort', id }); toast(t('fileCancelled')); } });
      incomingFile = { b, id, name, size, mime: String(m.mime || '').slice(0, 80), parts: [], got: 0, acked: 0, ui, w, q: Promise.resolve() }; break;
    }
    case 'file-end': {
      if (!incomingFile) return; const f = incomingFile; incomingFile = null;
      if (f.got !== f.size) { sys(t('sys_fileBad'), 'warn'); try { f.w && f.w.abort(); } catch {} return; }
      if (f.w) { f.q.then(() => f.w.close()).then(() => { fileBody(f.b.body, f.name, f.size, null, null, t('fileSaved')); }).catch(() => sys(t('sys_fileBad'), 'warn')); }
      else { const blob = new Blob(f.parts, { type: f.mime }); fileBody(f.b.body, f.name, blob.size, blob, f.mime); }
      sendJson({ t: 'ack', id: f.id }); scrollLog(); notify(f.name, 'file');
      f.b.el.dataset.unread = '1'; if (screen === 'chat' && !document.hidden) flushRead();
      break;
    }
    case 'sdp': onSdp(m.d, m.ice === true); break;
    case 'call': onCallInvite(m); break;
    case 'draw': if (callState === 'active') drawRecv(m, null); break;
    case 'cam': if (callState) { const was = peerCam; peerCam = !!m.on; peerScr = peerCam && !!m.scr; dbg('peer video', peerCam ? (peerScr ? 'screen' : 'camera') : 'off'); if (peerCam && !was && callMin && callState === 'active') { callMin = false; callUi(); } vidUi(); } break;
    case 'bye': { closeSheet(); toast(t('peerEnded'), 4500); wipeChat(); setOnline(false); show('list', false, true); break; }
    case 'call-accept': if (callState === 'calling') beginMedia(); break;
    case 'call-decline': if (callState === 'calling') { toast(t('callDeclined')); endCall(false); } break;
    case 'hangup': if (callState) { toast(t('callEnded')); endCall(false); } break;
  }
}
function setTyping(on) {
  clearTimeout(typingT); if (!peer || !liveConn()) return;
  $('chSt').textContent = on ? t('typing') : t('online'); $('chSt').className = 'on';
  if (on) typingT = setTimeout(() => setTyping(false), 3000);
}
function notify(text, kind, who) {
  if (document.hidden) { vib(80); document.title = '● ' + BASE_TITLE; }
  if (kind !== 'quiet' && (document.hidden || window.AndroidBridge)) appNotify(kind || 'msg', text, who);
}
function appNotify(kind, text, who) {
  if (!window.AndroidBridge || !AndroidBridge.notify) return;
  try {
    const title = who || (peer ? peer.name : '') || t('appName');
    const body = kind === 'rx' ? t('ntRx', { e: text }) : kind === 'file' ? t('ntFile') : kind === 'call' ? t('ntCall') : (cfg.ntxt && text ? String(text).slice(0, 200) : t('ntMsg'));
    AndroidBridge.notify(kind, String(title), body);
  } catch {}
}
document.addEventListener('visibilitychange', () => { if (!document.hidden) document.title = BASE_TITLE; });

const canSend = () => !!(hello && session && liveConn() && peer && shReady());
const MEM_CAP = 500 * 1024 ** 2, CHUNK = 60000;
const cancelled = new Set();
const consentAt = () => shareMode() ? MEM_CAP : 50 * 1024 * 1024, maxFile = () => shareMode() ? Infinity : 2 * 1024 ** 3;
const askWait = new Map(), fileAcks = new Map(), consent = new Map(); let fileAsk = null;
const sleep = ms => new Promise(r => setTimeout(r, ms));
function sendText() {
  const txt = $('text').value.trim(); if (!txt || !canSend()) return;
  const id = rid(), rp = takeReply('chat'); sendJson(rp ? { t: 'msg', id, text: txt.slice(0, 8000), rp } : { t: 'msg', id, text: txt.slice(0, 8000) });
  $('text').value = ''; autosize();
  renderEntry({ w: 'me', k: 'text', t: txt, ts: Date.now(), id, rp });
  vib(8);
}
$('form').addEventListener('submit', e => { e.preventDefault(); sendText(); $('text').focus(); });
function tapToDismissKeyboard(box) {
  let x0 = 0, y0 = 0, t0 = 0, on = false;
  box.addEventListener('pointerdown', e => { on = true; x0 = e.clientX; y0 = e.clientY; t0 = Date.now(); });
  box.addEventListener('pointercancel', () => { on = false; });
  box.addEventListener('pointerup', e => {
    if (!on) return; on = false;
    if (Math.abs(e.clientX - x0) > 9 || Math.abs(e.clientY - y0) > 9 || Date.now() - t0 > 450) return;
    if (e.target.closest && e.target.closest('.rxc,.rq')) return;
    const a = document.activeElement; if (a && a.matches && a.matches('textarea,input') && !box.contains(a)) a.blur();
  });
}
tapToDismissKeyboard(log); tapToDismissKeyboard($('rmLog'));
function autosize() { const x = $('text'); x.style.height = 'auto'; x.style.height = Math.min(140, x.scrollHeight) + 'px'; }
$('text').addEventListener('input', () => {
  autosize();
  const n = Date.now(); if (cfg.typing && hello && n - lastTypingSent > 2500) { lastTypingSent = n; sendJson({ t: 'typing' }); }
});
$('text').addEventListener('keydown', e => { if (e.key === 'Enter' && !e.shiftKey && matchMedia('(pointer:fine)').matches) { e.preventDefault(); sendText(); } });
$('btnAttach').onclick = () => $('file').click();
$('text').addEventListener('paste', e => { const fs = [...((e.clipboardData && e.clipboardData.files) || [])]; if (fs.length && canSend()) { e.preventDefault(); queueFiles(fs); } });
function xferUi(body, id, onCancel) {
  const bar = document.createElement('div'); bar.className = 'bar'; bar.innerHTML = '<i></i>';
  const row = document.createElement('div'); row.className = 'xrow'; const sp = document.createElement('span'); sp.className = 'fsp';
  const x = document.createElement('button'); x.type = 'button'; x.className = 'fcancel'; x.textContent = '✕'; x.setAttribute('aria-label', t('cancel')); x.onclick = e => { e.stopPropagation(); onCancel(); };
  row.append(sp, x); body.append(bar, row); const t0 = Date.now();
  return { bar: bar.firstChild, upd(done, total) {
    bar.firstChild.style.width = Math.min(100, done / Math.max(1, total) * 100) + '%';
    const dt = (Date.now() - t0) / 1000; if (dt > 0.7) { const v = done / dt; sp.textContent = fmtSize(v) + '/' + t('sec') + (v > 0 ? ' · ' + fmtDur((total - done) / v * 1000) : ''); }
  } };
}
let fileQ = Promise.resolve();
function queueFiles(list) { for (const f of list) { if (f && f.size >= 0) fileQ = fileQ.then(() => sendFile(f)).catch(e => console.error('file', e)); } }
$('file').onchange = () => { const l = [...$('file').files]; $('file').value = ''; queueFiles(l); };
(() => {
  const sc = $('s-chat'); let depth = 0; const has = e => e.dataTransfer && [...(e.dataTransfer.types || [])].includes('Files');
  sc.addEventListener('dragenter', e => { if (has(e)) { e.preventDefault(); depth++; sc.classList.add('drop'); } });
  sc.addEventListener('dragover', e => { if (has(e)) e.preventDefault(); });
  sc.addEventListener('dragleave', e => { if (has(e) && --depth <= 0) { depth = 0; sc.classList.remove('drop'); } });
  sc.addEventListener('drop', e => { if (!has(e)) return; e.preventDefault(); depth = 0; sc.classList.remove('drop'); if (!canSend()) return toast(t('noLink')); queueFiles([...e.dataTransfer.files].filter(f => f.type || f.size)); });
})();
async function sendFile(f) {
  if (!f || !canSend()) return;
  if (f.size > maxFile()) return toast(t('maxFile', { s: fmtSize(maxFile()) }));
  const id = rid(), name = cleanFile(f.name), big = f.size > consentAt();
  const b = bubble('me', Date.now(), id); fileBody(b.body, name, f.size, null, null, big ? t('fileWaiting') : undefined);
  ticks.set(id, b.tick);
  if (big) {
    sendJson({ t: 'file-ask', id, name, size: f.size, mime: f.type });
    const ans = await new Promise(res => { askWait.set(id, res); setTimeout(() => res('timeout'), 5 * 60 * 1000); });
    askWait.delete(id);
    if (ans !== 'yes') { removeMsg(b.el); ticks.delete(id); if (ans === 'timeout') { sendJson({ t: 'file-cancel', id }); toast(t('fileNoAnswer')); } else if (ans === 'no') toast(t('fileDeclined'), 4500); return; }
    fileBody(b.body, name, f.size, null, null);
  }
  const ui = xferUi(b.body, id, () => { cancelled.add(id); });
  sendJson({ t: 'file-start', id, name, size: f.size, mime: f.type });
  const BLOCK = 1024 * 1024; let last = null;
  for (let base = 0; base < f.size; base += BLOCK) {
    const blk = new Uint8Array(await f.slice(base, base + BLOCK).arrayBuffer());
    for (let o = 0; o < blk.length; o += CHUNK) {
      if (cancelled.has(id)) { cancelled.delete(id); sendJson({ t: 'file-abort', id }); removeMsg(b.el); ticks.delete(id); fileAcks.delete(id); toast(t('fileCancelled')); return; }
      if (!liveConn()) { sys(t('sys_xferBroken')); removeMsg(b.el); ticks.delete(id); return; }
      while (big && base + o - (fileAcks.get(id) || 0) > 16 * 1024 * 1024 && liveConn()) await sleep(30);
      last = sendBin(blk.subarray(o, o + CHUNK));
      if (((base + o) / CHUNK) % 6 === 5) { await last; ui.upd(base + o + CHUNK, f.size); }
    }
  }
  if (last) await last;
  if (cancelled.has(id)) { cancelled.delete(id); sendJson({ t: 'file-abort', id }); removeMsg(b.el); ticks.delete(id); fileAcks.delete(id); toast(t('fileCancelled')); return; }
  fileAcks.delete(id); sendJson({ t: 'file-end' }); fileBody(b.body, name, f.size, f, f.type);
}



async function onSdp(d, ice) {
  if (!pc || !d || typeof d.sdp !== 'string' || (d.type !== 'offer' && d.type !== 'answer')) return;
  if (Date.now() > sdpUntil) {
    if (!ice || !pc.remoteDescription) return;
    if (d.type === 'answer' && pc.signalingState !== 'have-local-offer') return;
    const mc = x => (String(x).match(/^m=/gm) || []).length;
    if (mc(d.sdp) !== mc(pc.remoteDescription.sdp)) return;
  }
  try {
    if (hs && hs.fpR && fpOf(d.sdp) && fpOf(d.sdp) !== hs.fpR) { sys(t('sys_fpChanged'), 'warn'); failSecure(); return; }
    const collision = d.type === 'offer' && (makingOffer || pc.signalingState !== 'stable');
    if (collision && !polite) return;
    await pc.setRemoteDescription({ type: d.type, sdp: d.sdp });
    if (d.type === 'offer') { await pc.setLocalDescription(); sendJson({ t: 'sdp', d: pc.localDescription.toJSON(), ice: !!ice }); }
    dbg('sdp ' + d.type + (ice ? ' (ice restart)' : '') + ' applied');
  } catch (e) { console.error('sdp', e); }
}

const EMO = ['🐶','🐱','🐭','🐹','🐰','🦊','🐻','🐼','🐨','🐯','🦁','🐮','🐷','🐸','🐵','🐔','🐧','🐦','🦆','🦉','🦄','🐝','🐛','🦋','🐌','🐞','🐢','🐍','🐙','🦀','🐠','🐳','🍎','🍐','🍊','🍋','🍌','🍉','🍇','🍓','🍒','🍑','🥝','🍅','🥕','🌽','🍄','🌵','🌲','🌻','🌸','⭐','🌙','🔥','💧','⚡','🎈','🎁','🎵','🚀','⚓','🔑','🎲','🧲'];
async function safetyOf() {
  if (!cur || !cur.ik || !cur.mik) return null;
  const s = await E2E.safety(b64d(cur.mik), b64d(cur.ik));
  return { digits: s.digits, emo: s.emo.map(i => EMO[i]).join(' ') };
}
async function chatSheet(p) {
  const code = await safetyOf(), c = cur || {};
  openSheet(`<div class="hd"><div class="av"></div><div><h3 style="margin:0"></h3><small class="selectable"></small></div></div>
    ${code ? `<p class="note">${esc(t('sasP'))}</p><div class="sas"><div class="dg">${code.digits.map(d => `<span>${d}</span>`).join('')}</div><div class="em">${code.emo}</div></div>
      <button class="btn ${c.ver ? 'sec' : 'ok'}" id="shVer">${esc(c.ver ? t('unverify') : t('verifyOk'))}</button>
      ${c.ver ? '' : `<button class="btn danger" id="shBad">${esc(t('verifyBad'))}</button>`}`
      : `<p class="note">${esc(t('sasNone'))}</p>`}
    <button class="btn sec" id="shSec">${ic('shield', 'sm')}${esc(t('secCheck'))}</button>
    <button class="btn sec" id="shOk">${esc(t('close'))}</button>`,
    s => {
      setAv(s.querySelector('.av'), p.name, p.id); s.querySelector('h3').textContent = (c.ver ? '✅ ' : '') + p.name; s.querySelector('small').textContent = 'ID: ' + p.id;
      s.querySelector('#shOk').onclick = closeSheet;
      s.querySelector('#shSec').onclick = () => { closeSheet(); setTimeout(secSheet, 30); };
      const v = s.querySelector('#shVer'); if (v) v.onclick = () => { cur.ver = !cur.ver; closeSheet(); drawLock(); toast(cur.ver ? t('verified') : t('unverified')); };
      const bad = s.querySelector('#shBad'); if (bad) bad.onclick = () => { closeSheet(); wipeChat(); setOnline(false); show('list', false, true); toast(t('verifyBadDone'), 5000); };
    });
}
$('chInfo').onclick = () => { if (peer) chatSheet({ id: peer.id, name: peer.name }); };
$('chLk').onclick = e => { e.stopPropagation(); secSheet(); };

async function liveCheck(pcx, h, sess, ik) {
  const o = { sig: false, fpSame: false, certMatch: null, dtls: '', cipher: '', path: '', keys: null };
  try {
    const fpR = fpOf(pcx.remoteDescription && pcx.remoteDescription.sdp), fpL = fpOf(pcx.localDescription && pcx.localDescription.sdp);
    o.fpSame = !!fpR && fpR === h.fpR && fpL === h.fpL;
    o.sig = !!h.sig && await E2E.verifyHello(ik, h.sig, h.ek, fpR, fpL, h.nm);
  } catch {}
  try {
    const st = await pcx.getStats(), certs = new Map(), all = new Map(); let tr = null;
    st.forEach(r => { all.set(r.id, r); if (r.type === 'transport') tr = r; if (r.type === 'certificate') certs.set(r.id, r); });
    if (tr) {
      o.dtls = tr.dtlsState || ''; o.cipher = [tr.tlsVersion, tr.dtlsCipher].filter(Boolean).join(' ');
      const rc = certs.get(tr.remoteCertificateId), want = (h.fpR.split(' ')[1] || '').toUpperCase();
      if (rc && rc.fingerprint) o.certMatch = rc.fingerprint.toUpperCase() === want;
      const pair = all.get(tr.selectedCandidatePairId), lc = pair && all.get(pair.localCandidateId), rm = pair && all.get(pair.remoteCandidateId);
      if (lc && rm) o.path = (lc.candidateType === 'relay' || rm.candidateType === 'relay') ? 'relay' : 'direct';
    }
  } catch {}
  try {
    const { P, W } = await sess.probe();
    const n = E2E.hex(crypto.getRandomValues(new Uint8Array(8))), f = await P.sealJson({ t: 'probe', n }), r1 = await P.open(f);
    const round = JSON.parse(td.decode(r1.payload)).n === n;
    const f2 = await P.sealJson({ t: 'probe2' }), bad = f2.slice(); bad[bad.length - 3] ^= 1; let tamper = false; try { await P.open(bad); } catch { tamper = true; }
    let replay = false; try { await P.open(f); } catch { replay = true; }
    let wrong = false; try { await W.open(f2); } catch { wrong = true; }
    o.keys = { round, tamper, replay, wrong, ok: round && tamper && replay && wrong };
  } catch { o.keys = { ok: false }; }
  return o;
}
function liveRows(row, o) {
  let h = '';
  h += row(o.sig, t('lv_sig'), o.sig ? t('lv_sigS') : t('lv_bad'));
  h += row(o.fpSame && o.certMatch !== false, t('lv_fp'), o.certMatch === true ? t('lv_fpS') + ' ' + t('lv_certOk') : o.certMatch === null ? t('lv_fpS') + ' ' + t('lv_certNo') : t('lv_bad'));
  h += row(o.dtls === 'connected', t('lv_dtls', { s: o.dtls || '?', c: o.cipher || '' }), t('lv_dtlsS'));
  if (o.path) h += row(true, t('lv_path', { p: t(o.path === 'relay' ? 'lv_pathRelay' : 'lv_pathDirect') }), '');
  h += row(!!(o.keys && o.keys.ok), t('lv_probe'), o.keys && o.keys.ok ? t('lv_probeS') : t('lv_bad'));
  return h;
}
async function secSheet() {
  openSheet(`<h3>${esc(t('secH'))}</h3><p class="note" style="margin:0 0 4px">${esc(t('secP'))}</p><div id="secBody"><p class="note">…</p></div><button class="btn" id="secOk">${esc(t('close'))}</button>`, async s => {
    s.querySelector('#secOk').onclick = closeSheet;
    const row = (ok, title, sub) => `<div class="chk ${ok === true ? 'ok' : ok === false ? 'no' : 'wn'}"><i>${ok === true ? '✓' : ok === false ? '✗' : '!'}</i><div>${esc(title)}${sub ? `<small>${esc(sub)}</small>` : ''}</div></div>`;
    let h = `<h4>${esc(t('secLive'))}</h4>`;
    if (session && hs && pc) {
      const c = cur || {}, o = await liveCheck(pc, hs, session, hs.ik);
      h += liveRows(row, o);
      h += `<div class="mono">${esc(t('lv_you'))}: ${esc(hs.fpL.slice(0, 40))}…<br>${esc(t('lv_peer'))}: ${esc(hs.fpR.slice(0, 40))}…</div>`;
      h += row(wireLog.bad === 0, t('lv_ctr', { o: wireLog.nOut, i: wireLog.nIn, b: wireLog.bad }), t('lv_ctrS'));
      h += row(curPsk ? true : null, curPsk ? t('lv_pskYes') : t('lv_pskNo'), curPsk ? t('lv_pskYesS') : t('lv_pskNoS'));
      h += row(c.ver ? true : null, c.ver ? t('lv_verYes') : t('lv_verNo'), c.ver ? '' : t('lv_verNoS'));
    } else h += `<p class="note">${esc(t('lv_none'))}</p>`;
    h += `<h4>${esc(t('secTests'))}</h4>`;
    let tests = []; try { tests = await E2E.selfTest(); } catch (e) { tests = [{ k: 'err', ok: false }]; }
    for (const x of tests) h += row(x.ok, t('tst_' + x.k), t('tsd_' + x.k));
    h += `<h4>${esc(t('secWire'))}</h4><p class="note" style="margin:0 0 6px">${esc(t('secWireP'))}</p>`;
    for (const d of ['out', 'in']) {
      const w = wireLog[d];
      h += `<div class="mono"><b>${esc(t(d === 'out' ? 'wireOut' : 'wireIn'))}</b><br>${w ? esc(t('wirePlain')) + ': ' + esc(w.plain) + '<br>' + esc(t('wireBytes', { n: w.len })) + ':<br>' + esc(w.hex.replace(/(.{8})/g, '$1 ')) + '…' : '—'}</div>`;
    }
    h += `<h4>${esc(t('secLimits'))}</h4><p class="note">${esc(t('secLimitsT'))}</p>`;
    const body = s.querySelector('#secBody'); if (body) body.innerHTML = h;
  });
}


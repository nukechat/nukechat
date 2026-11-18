'use strict';

const RX = ['👍', '❤️', '😂', '😮', '😢', '🙏', '🔥', '👎'];
const snip = s => bidi(String(s || '')).replace(/\s+/g, ' ').trim().slice(0, 140);

const RPL = { chat: null, room: null }, RPB = {};
function rpBar(scope) {
  if (RPB[scope]) return RPB[scope];
  const bar = document.createElement('div'); bar.className = 'rpbar hidden';
  bar.innerHTML = '<div class="rpq"><b></b><span></span></div><button type="button" class="rpx">✕</button>';
  bar.querySelector('.rpx').setAttribute('aria-label', t('cancel')); bar.querySelector('.rpx').onclick = () => clearReply(scope);
  $(scope === 'room' ? 'rmForm' : 'form').before(bar); return (RPB[scope] = bar);
}
const scopeLog = scope => $(scope === 'room' ? 'rmLog' : 'log');
const scopeEl = (scope, id) => scopeLog(scope).querySelector(`.m[data-mid="${CSS.escape(id)}"]`);
function clearReply(scope) {
  RPL[scope] = null; if (RPB[scope]) RPB[scope].classList.add('hidden');
}
function authorOf(el, scope) { return el.dataset.w === 'me' || el._w === 'me' ? t('rpYou') : scope === 'room' ? (el._name || '') : (peer ? peer.name : t('peer')); }
function msgSnippet(el) {
  if (el._text) return snip(el._text);
  const n = el.querySelector('.file > div > div'), im = el.querySelector('.pic img');
  return '📎 ' + snip(n ? n.textContent : im ? im.alt : '');
}
function startReply(el, scope) {
  if (!el || !el.dataset.mid || el.dataset.deleted) return;
  const mine = el.dataset.w === 'me' || el._w === 'me';
  RPL[scope] = { id: el.dataset.mid, mine, name: scope === 'room' ? (mine ? (R ? R.name : '') : el._name || '') : '', x: msgSnippet(el) };
  const bar = rpBar(scope); bar.querySelector('b').textContent = authorOf(el, scope); bar.querySelector('span').textContent = RPL[scope].x;
  bar.classList.remove('hidden'); try { $(scope === 'room' ? 'rmText' : 'text').focus(); } catch {}
}
function takeReply(scope) {
  const r = RPL[scope]; if (!r) return null;
  const el = scopeEl(scope, r.id); clearReply(scope); if (!el || el.dataset.deleted) return null;
  return scope === 'room' ? { i: r.id, n: r.name, x: r.x } : { i: r.id, o: r.mine ? 1 : 0, x: r.x };
}
function cleanRp(rp) {
  if (!rp || typeof rp !== 'object' || typeof rp.i !== 'string' || !rp.i || typeof rp.x !== 'string') return null;
  return { i: rp.i.slice(0, 24), o: rp.o ? 1 : 0, n: typeof rp.n === 'string' ? bidi(rp.n).slice(0, 40) : '', x: snip(rp.x) };
}
function quoteEl(rp, w, scope) {
  const q = document.createElement('div'), nm = document.createElement('b'), tx = document.createElement('span');
  q.className = 'rq'; q.dataset.rid = rp.i;
  let name;
  const orig = scopeEl(scope, rp.i);
  if (scope === 'room') name = orig ? authorOf(orig, 'room') : (rp.n || '…');
  else name = (rp.o ? w : (w === 'me' ? 'them' : 'me')) === 'me' ? t('rpYou') : (peer ? peer.name : t('peer'));
  nm.textContent = name; tx.textContent = rp.x; q.append(nm, tx);
  q.onclick = e => { e.stopPropagation(); if (q.classList.contains('dead')) return; jumpTo(scope, rp.i); };
  return q;
}
function jumpTo(scope, id) {
  const el = scopeEl(scope, id); if (!el) return;
  el.scrollIntoView({ block: 'center', behavior: reduceMotion() ? 'auto' : 'smooth' });
  el.classList.remove('hl'); void el.offsetWidth; el.classList.add('hl'); setTimeout(() => el.classList.remove('hl'), 1300);
}
function scrubQuotes(scope, id) {
  scopeLog(scope).querySelectorAll(`.rq[data-rid="${CSS.escape(id)}"]`).forEach(q => { q.classList.add('dead'); q.querySelector('span').textContent = '🚫 ' + t('msgDeleted'); });
  if (RPL[scope] && RPL[scope].id === id) clearReply(scope);
}

function rxRender(el) {
  const old = el.querySelector(':scope > .rx'); if (old) old.remove();
  const m = el._rx; el.classList.toggle('hasrx', !!(m && m.size)); if (!m || !m.size) return;
  const cnt = new Map(); m.forEach(e => cnt.set(e, (cnt.get(e) || 0) + 1));
  const box = document.createElement('div'); box.className = 'rx';
  for (const e of RX) {
    if (!cnt.has(e)) continue;
    const b = document.createElement('button'); b.type = 'button'; b.className = 'rxc' + (m.get('me') === e ? ' on' : ''); b.append(e);
    if (cnt.get(e) > 1) { const s = document.createElement('small'); s.textContent = cnt.get(e); b.append(s); }
    b.onclick = ev => { ev.stopPropagation(); if (Date.now() - (el._lpAt || 0) < 800) return; reactTo(el, e); };
    box.append(b);
  }
  el.append(box);
  if (scopeOf(el) === 'chat' && nearBottom()) scrollLog();
}
const scopeOf = el => (el.closest('#rmLog') ? 'room' : 'chat');
function rxSet(el, who, e) {
  if (!el._rx) el._rx = new Map();
  if (e) el._rx.set(who, e); else el._rx.delete(who);
  rxRender(el);
}
function reactTo(el, e) {
  const scope = scopeOf(el), id = el.dataset.mid; if (!id || el.dataset.deleted) return;
  const next = el._rx && el._rx.get('me') === e ? '' : e;
  if (scope === 'room') { if (!R || !R.gk) { toast(t('rmNoKey'), 2500); return; } rSealSend({ rx: { i: id, e: next } }); }
  else { if (!peer || !liveWith(peer.id)) { toast(t('noLink')); return; } sendJson({ t: 'react', id, e: next }); }
  rxSet(el, 'me', next); vib(8);
}
function rxRowHtml(el) {
  const mine = el._rx && el._rx.get('me');
  return `<div class="rxrow">${RX.map(e => `<button type="button" class="rxb${mine === e ? ' on' : ''}" data-e="${e}" aria-label="${e}">${e}</button>`).join('')}</div>`;
}
function rxRowBind(s, el) {
  s.querySelectorAll('.rxb').forEach(b => b.onclick = () => { closeSheet(); reactTo(el, b.dataset.e); });
}

const SW_MAX = 84, SW_GO = 44;
function attachMsg(el, openFn, replyFn) {
  let lpT = null, x0 = 0, y0 = 0, pid = 0, on = false, act = false, dx = 0, ico = null, armed = false;
  const stop = () => clearTimeout(lpT);
  const icon = dir => {
    if (!ico) { ico = document.createElement('span'); ico.className = 'swic'; ico.innerHTML = ic('reply'); }
    ico.dataset.d = dir > 0 ? 'r' : 'l'; if (!ico.isConnected) el.append(ico); return ico;
  };
  el.addEventListener('pointerdown', e => {
    if (e.pointerType === 'mouse' && e.button !== 0) return;
    on = true; act = false; armed = false; dx = 0; x0 = e.clientX; y0 = e.clientY; pid = e.pointerId;
    stop(); lpT = setTimeout(() => { on = false; el._lpAt = Date.now(); vib(15); openFn(); }, 450);
  });
  el.addEventListener('pointermove', e => {
    if (!on || e.pointerId !== pid) return;
    const mx = e.clientX - x0, my = e.clientY - y0;
    if (!act) {
      if (Math.abs(mx) < 10 && Math.abs(my) < 10) return;
      stop();
      if (e.pointerType === 'mouse' || Math.abs(my) > Math.abs(mx) * 0.8) { on = false; return; }
      act = true; el._lpAt = Date.now(); try { el.setPointerCapture(pid); } catch {}
    }
    dx = Math.max(-SW_MAX, Math.min(SW_MAX, mx * 0.7));
    el.style.transition = 'none'; el.style.transform = `translateX(${dx}px)`;
    const k = Math.min(1, Math.abs(dx) / SW_GO), ci = icon(dx), was = armed; armed = Math.abs(dx) >= SW_GO;
    ci.style.opacity = String(k); ci.style.transform = `translateY(-50%) scale(${0.5 + 0.5 * k})`; ci.classList.toggle('go', armed);
    if (armed && !was) vib(10);
  });
  const end = () => {
    stop();
    if (act) {
      el._lpAt = Date.now(); el.style.transition = 'transform .3s var(--spring)'; el.style.transform = '';
      setTimeout(() => { el.style.transition = ''; if (ico) { ico.remove(); ico = null; } }, 320);
      if (Math.abs(dx) >= SW_GO) replyFn();
    }
    on = false; act = false; armed = false;
  };
  el.addEventListener('pointerup', end); el.addEventListener('pointercancel', end);
  el.addEventListener('contextmenu', e => { e.preventDefault(); stop(); openFn(); });
}

function rMsgSheet(el) {
  if (sheetOpen || !R || !el.dataset.mid) return;
  const gone = !!el.dataset.deleted;
  openSheet(`<h3>${esc(t('msgH'))}</h3>${rxRowHtml(el)}
    <button class="btn sec" id="mdReply">${ic('reply', 'sm')}${esc(t('msgReply'))}</button>
    ${el._text ? `<button class="btn sec" id="mdCopy">${ic('copy', 'sm')}${esc(t('copy'))}</button>` : ''}
    <button class="btn sec" id="mdNo">${esc(t('cancel'))}</button>`, s => {
    rxRowBind(s, el);
    s.querySelector('#mdReply').onclick = () => { closeSheet(); startReply(el, 'room'); };
    const c = s.querySelector('#mdCopy'); if (c) c.onclick = async () => { closeSheet(); try { await navigator.clipboard.writeText(el._text); toast(t('copied')); } catch { toast(t('copyFail')); } };
    s.querySelector('#mdNo').onclick = closeSheet;
    if (gone) s.querySelector('#mdReply').remove();
  });
}

const keepFocus = e => { const b = e.target.closest && e.target.closest('button'); if (b && !e.target.closest('input,textarea')) e.preventDefault(); };
$('sheet').addEventListener('mousedown', keepFocus);
$('log').addEventListener('mousedown', e => { if (e.target.closest && e.target.closest('.rxc')) e.preventDefault(); });
$('rmLog').addEventListener('mousedown', e => { if (e.target.closest && e.target.closest('.rxc')) e.preventDefault(); });

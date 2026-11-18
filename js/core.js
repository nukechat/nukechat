'use strict';
const $ = id => document.getElementById(id);
const te = new TextEncoder(), td = new TextDecoder();
function wipeLegacy() {
  try { for (const k of Object.keys(localStorage)) if (k.startsWith('p2p.')) localStorage.removeItem(k); } catch {}
  try { indexedDB.deleteDatabase('p2p-identity'); } catch {}
}
const ic = (n, c = '') => `<svg class="ic ${c}"><use href="#i-${n}"/></svg>`;
const vib = p => { try { if (navigator.userActivation && !navigator.userActivation.hasBeenActive) return; navigator.vibrate && navigator.vibrate(p); } catch {} };
const b64e = E2E.b64e, b64d = E2E.b64d;
const esc = s => String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

const DONATE = [['ETH / EVM', '0x58204974188076e3196ba44fe750cbe21b3686f5'], ['SOL / SPL', 'C5mHPkEpiCGhhfKgRfJ6PUBPBp8xs2YJX4UwdmXVUYJ9'], ['TRX / TRC', 'TFPEGhyY5ufZE8MbXgQBd2uxstb3eA6N2c']];
function donateSheet() {
  openSheet(`<h3>${esc('❤ ' + t('donate'))}</h3><p class="note" style="margin:0 0 8px">${esc(t('donateP'))}</p>
    ${DONATE.map((d, i) => `<div class="dn" data-i="${i}"><b>${esc(d[0])}</b><code class="selectable">${esc(d[1])}</code>
      <div class="btns"><button class="btn sec small dnCp"><svg class="ic sm"><use href="#i-copy"/></svg><span>${esc(t('copy'))}</span></button><button class="btn sec small dnQr"><svg class="ic sm"><use href="#i-scan"/></svg><span>${esc(t('pwQr'))}</span></button></div>
      <div class="qrbox hidden"></div></div>`).join('')}
    <button class="btn" id="dnOk">${esc(t('close'))}</button>`,
  s => {
    s.querySelectorAll('.dn').forEach(row => {
      const addr = DONATE[+row.dataset.i][1], box = row.querySelector('.qrbox');
      row.querySelector('.dnCp').onclick = async () => { try { await navigator.clipboard.writeText(addr); toast(t('copied')); } catch { toast(t('copyFail')); } };
      row.querySelector('.dnQr').onclick = () => {
        const open = box.classList.contains('hidden');
        s.querySelectorAll('.dn .qrbox').forEach(b => { b.classList.add('hidden'); clearInterval(b._t); b.innerHTML = ''; });
        if (open) { box.classList.remove('hidden'); showQr(box, addr); }
      };
    });
    s.querySelector('#dnOk').onclick = closeSheet;
  });
}

const DBG = [], dbgT0 = Date.now();
function dbg(...a) {
  const line = '+' + ((Date.now() - dbgT0) / 1000).toFixed(1) + 's ' + a.map(x => typeof x === 'string' ? x : (() => { try { return JSON.stringify(x); } catch { return String(x); } })()).join(' ');
  DBG.push(line); if (DBG.length > 600) DBG.shift(); console.log('[p2p]', line);
}
function netInfo() {
  const c = navigator.connection || {};
  return 'online=' + navigator.onLine + (c.type ? ' type=' + c.type : '') + (c.effectiveType ? ' eff=' + c.effectiveType : '') + (c.rtt != null ? ' rtt=' + c.rtt : '') + (c.saveData ? ' saveData' : '');
}
const cfg = { stun: true, sounds: true, theme: 'auto', ice: '', receipts: true, typing: true, relay: false, ntxt: false };

if (cfg.theme === 'auto') { try { cfg.theme = matchMedia('(prefers-color-scheme:light)').matches ? 'light' : 'dark'; } catch { cfg.theme = 'dark'; } }
const lang = 'en';
const t = (k, p) => {
  let s = (L[lang] && L[lang][k]) ?? L.en[k] ?? k;
  if (p) for (const a in p) s = s.split('{' + a + '}').join(p[a]);
  return s;
};
function applyI18n() {
  document.documentElement.lang = lang;
  const has = k => !!((L[lang] && L[lang][k] !== undefined) || L.en[k] !== undefined);
  document.querySelectorAll('[data-t]').forEach(e => { if (has(e.dataset.t)) e.textContent = t(e.dataset.t); });
  document.querySelectorAll('[data-tp]').forEach(e => { if (has(e.dataset.tp)) e.placeholder = t(e.dataset.tp); });
  document.querySelectorAll('[data-ta]').forEach(e => { if (has(e.dataset.ta)) e.setAttribute('aria-label', t(e.dataset.ta)); });
  document.title = t('appName');
  drawViz();
}

function applyTheme() {
  const r = document.documentElement;
  if (cfg.theme === 'auto') r.removeAttribute('data-theme'); else r.setAttribute('data-theme', cfg.theme);
  requestAnimationFrame(() => { const m = document.querySelector('meta[name=theme-color]'); if (m) m.setAttribute('content', getComputedStyle(r).getPropertyValue('--bg').trim() || '#050608'); });
}
try { matchMedia('(prefers-color-scheme:light)').addEventListener('change', applyTheme); } catch {}

async function pipe(u8, ts, max = 1 << 20) {
  const rd = new Blob([u8]).stream().pipeThrough(ts).getReader(), parts = []; let n = 0;
  for (;;) { const { done, value } = await rd.read(); if (done) break; n += value.length; if (n > max) { try { await rd.cancel(); } catch {} throw new Error('too big'); } parts.push(value); }
  const o = new Uint8Array(n); let p = 0; for (const x of parts) { o.set(x, p); p += x.length; } return o;
}
const canZip = typeof CompressionStream !== 'undefined' && typeof DecompressionStream !== 'undefined';
async function keyFrom(pass, salt) {
  const km = await crypto.subtle.importKey('raw', te.encode(pass), 'PBKDF2', false, ['deriveKey']);
  return crypto.subtle.deriveKey({ name: 'PBKDF2', salt, iterations: 310000, hash: 'SHA-256' }, km, { name: 'AES-GCM', length: 256 }, false, ['encrypt', 'decrypt']);
}
function slim(sdp) {
  return sdp.split(/\r?\n/).filter(l => l && !(/^a=candidate:/.test(l) && (/ tcp /i.test(l) || / fe80:/i.test(l))))
    .map(l => /^a=candidate:/.test(l) ? l.replace(/ raddr \S+ rport \d+/, ' raddr 0.0.0.0 rport 0') : l).join('\r\n') + '\r\n';
}
const hexOf = u8 => Array.from(u8, x => x.toString(16).padStart(2, '0')).join('');
function parseSdp(sdp) {
  const g = re => { const m = re.exec(sdp); return m && m[1]; };
  const ufrag = g(/^a=ice-ufrag:(\S+)/m), pwd = g(/^a=ice-pwd:(\S+)/m), fm = /^a=fingerprint:sha-256 ((?:[0-9A-Fa-f]{2}:){31}[0-9A-Fa-f]{2})/m.exec(sdp);
  const cands = []; for (const m of sdp.matchAll(/^a=candidate:\S+ 1 udp \d+ (\S+) (\d+) typ (host|srflx|relay)/gm)) if (!/^fe80:/i.test(m[1])) cands.push({ ip: m[1], port: +m[2], typ: m[3] });
  if (!ufrag || !pwd || !fm || !cands.length || ufrag.length > 255 || pwd.length > 255 || !/^[\x21-\x7e]+$/.test(ufrag + pwd) || cands.length > 20) return null;
  return { ufrag, pwd, fp: fm[1].toUpperCase(), cands };
}
const refOf = async sdp => { const p = parseSdp(sdp); return shortHash(p ? p.fp + '|' + p.ufrag + '|' + p.pwd : slim(sdp)); };
const v6bytes = ip => { const [a, b] = ip.split('::'), h = s => s ? s.split(':') : [], A = h(a), B = b === undefined ? [] : h(b), mid = b === undefined ? [] : Array(8 - A.length - B.length).fill('0'), w = [...A, ...mid, ...B]; if (w.length !== 8) return null; const o = new Uint8Array(16); for (let i = 0; i < 8; i++) { const v = parseInt(w[i], 16); if (!(v >= 0 && v < 65536)) return null; o[2 * i] = v >> 8; o[2 * i + 1] = v & 255; } return o; };
function compactEncode(type, sdp, ref) {
  const p = parseSdp(sdp); if (!p) return null; const out = [];
  out.push(1, (type === 'answer' ? 1 : 0) | (ref ? 2 : 0));
  p.fp.split(':').forEach(h => out.push(parseInt(h, 16)));
  for (const s of [p.ufrag, p.pwd]) { out.push(s.length); for (const ch of s) out.push(ch.charCodeAt(0)); }
  if (ref) { if (!/^[0-9a-f]{10}$/.test(ref)) return null; for (let i = 0; i < 10; i += 2) out.push(parseInt(ref.slice(i, i + 2), 16)); }
  out.push(p.cands.length);
  for (const c of p.cands) {
    const ti = ['host', 'srflx', 'relay'].indexOf(c.typ); let addr, kind;
    if (/^\d+\.\d+\.\d+\.\d+$/.test(c.ip)) { addr = c.ip.split('.').map(Number); kind = 0; if (addr.some(v => v > 255)) return null; }
    else if (c.ip.includes(':')) { addr = v6bytes(c.ip); kind = 1; if (!addr) return null; addr = Array.from(addr); }
    else { if (c.ip.length > 255 || !/^[\x21-\x7e]+$/.test(c.ip)) return null; addr = [c.ip.length, ...Array.from(c.ip, ch => ch.charCodeAt(0))]; kind = 2; }
    out.push(ti | (kind << 2), ...addr, c.port >> 8, c.port & 255);
  }
  return new Uint8Array(out);
}
function compactDecode(u) {
  let i = 0; const need = n => { if (i + n > u.length) throw new Error('short'); }, rd = n => { need(n); const r = u.slice(i, i + n); i += n; return r; };
  if (rd(1)[0] !== 1) throw new Error('ver'); const fl = rd(1)[0], ans = fl & 1;
  const fp = Array.from(rd(32), x => x.toString(16).padStart(2, '0').toUpperCase()).join(':');
  const str = () => { const n = rd(1)[0]; return String.fromCharCode(...rd(n)); };
  const ufrag = str(), pwd = str(), ref = fl & 2 ? hexOf(rd(5)) : undefined, n = rd(1)[0];
  if (n > 20) throw new Error('many');
  if (!/^[\x21-\x7e]{4,255}$/.test(ufrag) || !/^[\x21-\x7e]{8,255}$/.test(pwd)) throw new Error('chars');
  const typs = ['host', 'srflx', 'relay'], prio = [2113937151, 1677729535, 33562623], lines = [];
  for (let k = 0; k < n; k++) {
    const b = rd(1)[0], ti = b & 3, kind = b >> 2; if (ti > 2) throw new Error('typ'); let ip;
    if (kind === 0) ip = Array.from(rd(4)).join('.');
    else if (kind === 1) { const a = rd(16); ip = Array.from({ length: 8 }, (_, j) => ((a[2 * j] << 8) | a[2 * j + 1]).toString(16)).join(':'); }
    else if (kind === 2) { ip = str(); if (!/^[A-Za-z0-9-]{1,63}(\.[A-Za-z0-9-]{1,63})*\.local$/.test(ip) || ip.length > 80) throw new Error('host'); } else throw new Error('kind');
    const pt = rd(2), port = (pt[0] << 8) | pt[1];
    lines.push(`a=candidate:${k + 1} 1 udp ${prio[ti] - k} ${ip} ${port} typ ${typs[ti]}` + (ti ? ' raddr 0.0.0.0 rport 0' : '') + ' generation 0');
  }
  const sdp = ['v=0', 'o=- 4611731400430051336 2 IN IP4 127.0.0.1', 's=-', 't=0 0', 'a=group:BUNDLE 0', 'a=extmap-allow-mixed', 'a=msid-semantic: WMS',
    'm=application 9 UDP/DTLS/SCTP webrtc-datachannel', 'c=IN IP4 0.0.0.0', 'a=ice-ufrag:' + ufrag, 'a=ice-pwd:' + pwd, 'a=ice-options:trickle',
    'a=fingerprint:sha-256 ' + fp, 'a=setup:' + (ans ? 'active' : 'actpass'), 'a=mid:0', 'a=sctp-port:5000', 'a=max-message-size:262144', ...lines].join('\r\n') + '\r\n';
  return { type: ans ? 'answer' : 'offer', sdp, ref };
}
async function pack(desc, pass, ref) {
  const cb = compactEncode(desc.type, desc.sdp, ref);
  if (cb) {
    if (!pass) return 'C' + b64e(cb);
    const salt = crypto.getRandomValues(new Uint8Array(16)), iv = crypto.getRandomValues(new Uint8Array(12));
    const ct = new Uint8Array(await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, await keyFrom(pass, salt), cb));
    const o = new Uint8Array(28 + ct.length); o.set(salt); o.set(iv, 16); o.set(ct, 28); return 'Ec' + b64e(o);
  }
  let raw = te.encode(JSON.stringify({ t: desc.type, s: slim(desc.sdp), r: ref }));
  let kind = 'R';
  if (canZip) { raw = await pipe(raw, new CompressionStream('deflate-raw')); kind = 'Z'; }
  if (pass) {
    const salt = crypto.getRandomValues(new Uint8Array(16)), iv = crypto.getRandomValues(new Uint8Array(12));
    const ct = new Uint8Array(await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, await keyFrom(pass, salt), raw));
    const o = new Uint8Array(28 + ct.length); o.set(salt); o.set(iv, 16); o.set(ct, 28);
    return 'E' + (canZip ? 'z' : 'r') + b64e(o);
  }
  return kind + b64e(raw);
}
class UErr extends Error {}
async function unpack0(code, pass) {
  code = code.replace(/\s+/g, ''); if (code.length > 30000) throw new UErr(t('e_notCode'));
  const m = /#i=([A-Za-z0-9_-]+)$/.exec(code); if (m) code = m[1];
  let kind = code[0], zipped = kind === 'Z', bytes;
  if (kind === 'C') {
    let r; try { r = compactDecode(b64d(code.slice(1))); } catch { throw new UErr(t('e_notCode')); }
    return { desc: { type: r.type, sdp: r.sdp }, ref: r.ref, enc: false };
  }
  if (kind === 'E') {
    if (!pass) throw new UErr(t('e_needPass'));
    zipped = code[1] === 'z';
    const o = b64d(code.slice(2));
    try { bytes = new Uint8Array(await crypto.subtle.decrypt({ name: 'AES-GCM', iv: o.slice(16, 28) }, await keyFrom(pass, o.slice(0, 16)), o.slice(28))); }
    catch { throw new UErr(t('e_badPass')); }
    if (code[1] === 'c') { let r; try { r = compactDecode(bytes); } catch { throw new UErr(t('e_notCode')); } return { desc: { type: r.type, sdp: r.sdp }, ref: r.ref, enc: true }; }
  } else if (kind === 'Z' || kind === 'R') bytes = b64d(code.slice(1));
  else throw new UErr(t('e_notCode'));
  if (zipped) { if (!canZip) throw new UErr(t('e_noZip')); bytes = await pipe(bytes, new DecompressionStream('deflate-raw')); }
  let j; try { j = JSON.parse(td.decode(bytes)); } catch { throw new UErr(t('e_notCode')); }
  if (!j || (j.t !== 'offer' && j.t !== 'answer') || typeof j.s !== 'string' || j.s.length > 20000) throw new UErr(t('e_notCode'));
  return { desc: { type: j.t, sdp: j.s }, ref: j.r, enc: kind === 'E' };
}
async function unpack(code, pass) { try { return await unpack0(code, pass); } catch (e) { throw e instanceof UErr ? e : new UErr(t('e_notCode')); } }
const shortHash = async x => Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256', te.encode(x))).slice(0, 5), v => v.toString(16).padStart(2, '0')).join('');
function fpOf(sdp) {
  const m = /^a=fingerprint:(\S+)\s+(\S+)/mi.exec(sdp || ''); return m ? m[1].toLowerCase() + ' ' + m[2].toUpperCase() : '';
}

let ident = null;
const me = { name: '' };
const NICK_A = ['Swift','Quiet','Brave','Lucky','Misty','Amber','Cosmic','Silent','Gentle','Rapid','Frosty','Golden','Hidden','Jolly','Lunar','Mellow','Noble','Orange','Proud','Rusty','Silver','Sunny','Tiny','Velvet','Wild','Witty','Zesty','Calm','Bold','Clever'];
const NICK_B = ['Fox','Owl','Wolf','Otter','Panda','Falcon','Lynx','Heron','Badger','Koala','Raven','Tiger','Moose','Gecko','Bison','Crane','Dingo','Eagle','Finch','Hare','Ibis','Jaguar','Kiwi','Lemur','Manta','Newt','Orca','Puma','Quail','Seal'];
const rnd = n => { const a = new Uint32Array(1); crypto.getRandomValues(a); return a[0] % n; };
const randomNick = () => NICK_A[rnd(NICK_A.length)] + NICK_B[rnd(NICK_B.length)] + (100 + rnd(900));

let cur = null;
const blobUrls = new Set(), trackUrl = b => { const u = URL.createObjectURL(b); blobUrls.add(u); return u; };

const reduceMotion = () => matchMedia('(prefers-reduced-motion:reduce)').matches;
function setHidden(el, hide, ms = 300) {
  if (!el) return; clearTimeout(el._hT);
  if (!hide) { el.classList.remove('out', 'hidden'); return; }
  if (el.classList.contains('hidden')) return;
  if (reduceMotion()) { el.classList.add('hidden'); el.classList.remove('out'); return; }
  el.classList.add('out'); el._hT = setTimeout(() => { el.classList.add('hidden'); el.classList.remove('out'); }, ms);
}
function toast(m, ms = 2600) { const e = $('toast'); clearTimeout(toast._t); clearTimeout(toast._o); e.classList.remove('out'); e.textContent = m; e.classList.remove('hidden'); toast._t = setTimeout(() => { e.classList.add('out'); toast._o = setTimeout(() => { e.classList.add('hidden'); e.classList.remove('out'); }, 260); }, ms); }
const AVP = [['#5f94f5', '#3a6ddb', '#8db3ff'], ['#2cc4b2', '#17897f', '#62dccb'], ['#7f84f2', '#5258d4', '#a3a7ff'], ['#a67cf0', '#7a4fd0', '#c4a3ff'], ['#dc72bb', '#b2458f', '#f19ad2'],
  ['#f27a7f', '#d04b5c', '#ff9ea2'], ['#f0924a', '#cb6a2c', '#ffb272'], ['#3cbd7c', '#228856', '#6fdba0'], ['#3aaee6', '#1f7fba', '#74cbf5'], ['#8590ac', '#5b6684', '#aab3cb']];
const avIx = s => { let h = 0; for (const c of s) h = (h * 31 + c.charCodeAt(0)) >>> 0; return h % AVP.length; };
const avTint = id => AVP[avIx(id || '?')][2];
const gSeg = typeof Intl !== 'undefined' && Intl.Segmenter ? new Intl.Segmenter(undefined, { granularity: 'grapheme' }) : null;
const g1 = s => { s = (s || '').trim(); if (!s) return ''; if (gSeg) for (const x of gSeg.segment(s)) return x.segment; return Array.from(s)[0]; };
function initials(name) {
  const m = /^(\p{Lu})\p{Ll}*(\p{Lu})/u.exec(name || ''); return m ? m[1] + m[2] : (g1(name) || '?').toUpperCase();
}
function setAv(el, name, id) { el.textContent = initials(name); const c = AVP[avIx(id || name || '?')]; el.style.background = `linear-gradient(135deg,${c[0]},${c[1]})`; }
const loc = () => 'en-US';
const clock = ts => new Date(ts).toLocaleTimeString(loc(), { hour: '2-digit', minute: '2-digit' });
const fmtSize = n => n > 1048576 ? (n / 1048576).toFixed(1) + ' ' + t('mb') : Math.max(1, Math.round(n / 1024)) + ' ' + t('kb');
const fmtDur = ms => { const s = Math.floor(ms / 1000); return String(Math.floor(s / 60)).padStart(2, '0') + ':' + String(s % 60).padStart(2, '0'); };
function linkify(el, text) {
  const re = /https?:\/\/[^\s<]+/g; let last = 0, m;
  while ((m = re.exec(text))) {
    el.append(text.slice(last, m.index));
    const url = m[0].replace(/[.,;:!?)\]»”'"]+$/, '');
    re.lastIndex = m.index + url.length;
    const a = document.createElement('a'); a.href = url; a.textContent = url; a.rel = 'noopener noreferrer';
    a.addEventListener('click', ev => { ev.preventDefault(); askConfirm(t('linkQ'), t('linkT', { u: url.slice(0, 200) }), t('open')).then(ok => { if (ok) window.open(url, '_blank', 'noopener,noreferrer'); }); });
    el.append(a);
    last = m.index + url.length;
  }
  el.append(text.slice(last));
}
const bidi = s => String(s).replace(/[\u202a-\u202e\u2066-\u2069]/g, '');
const rid = () => b64e(crypto.getRandomValues(new Uint8Array(8)));
const cleanName = s => String(s || '').replace(/[\u0000-\u001f\u007f‪-‮⁦-⁩]/g, '').trim().slice(0, 24);
const cleanFile = s => String(s || 'file').replace(/[\\/:*?"<>|\u0000-\u001f‪-‮]/g, '_').slice(0, 120) || 'file';

let curPsk = null, sdpUntil = 0;
let pc = null, dc = null, polite = false, makingOffer = false, ready = false, genId = 0;
let peer = null, hello = false, incomingFile = null, session = null, hs = null, hsP = null, rxQ = Promise.resolve(), txQ = Promise.resolve();
let offerRef = '', lastOffer = '', busy = false;
const liveConn = () => !!(dc && dc.readyState === 'open');
const liveWith = id => liveConn() && hello && peer && peer.id === id && !!session;

let screen = 'list';
function show(name, fromPop, replace) {
  if (screen === 'room' && name !== 'room' && R) return;
  if (screen === 'pw' && name !== 'pw' && name !== 'chat' && typeof PW !== 'undefined') { if (PW.on) pwStop(); else if (PW.seam) pwAbort(); else if (!liveConn()) teardown(); }
  const nxt = $('s-' + name); nxt && nxt.classList.remove('leaving', 'back');
  const prev = document.querySelector('.screen.active'), back = !!fromPop || name === 'list';
  document.querySelectorAll('.screen').forEach(s => s.classList.toggle('active', s.id === 's-' + name));
  if (prev && prev.id !== 's-' + name && !matchMedia('(prefers-reduced-motion:reduce)').matches) {
    prev.classList.remove('leaving', 'back'); void prev.offsetWidth; prev.classList.add('leaving'); prev.classList.toggle('back', back);
    clearTimeout(prev._lv); prev._lv = setTimeout(() => prev.classList.remove('leaving', 'back'), 340);
  }
  if (!fromPop && name !== screen) history[replace ? 'replaceState' : 'pushState']({ s: name }, '');
  screen = name;
  if (name === 'list') renderList();
  if (name === 'chat') { scrollLog(); flushRead(); }
}
history.replaceState({ s: 'list' }, '');
addEventListener('popstate', e => {
  if (typeof viewerOpen !== 'undefined' && viewerOpen) { closeViewer(); history.pushState({ s: screen }, ''); return; }
  if (sheetOpen) { closeSheet(); history.pushState({ s: screen }, ''); return; }
  const to = (e.state && e.state.s) || 'list';
  if (screen === 'room' && R && to !== 'room') { history.pushState({ s: 'room' }, ''); roomLeave(true); return; }
  if (screen === 'chat' && to !== 'chat') { history.pushState({ s: 'chat' }, ''); endChat(); return; }
  show(to, true);
});
document.querySelectorAll('[data-back]').forEach(b => b.onclick = () => history.back());
$('s-chat').querySelector('[data-back]').onclick = () => endChat();
async function endChat(ask = true) {
  if (ask && liveConn() && !await (shareMode() ? askConfirm(t('shDelQ'), t('shDelT'), t('shDelYes'), true, t('shDelNo')) : askConfirm(t('endQ'), t('endT'), t('endOk'), true))) return;
  if (session && liveConn()) { try { await sendJson({ t: 'bye' }); await new Promise(r => setTimeout(r, 250)); } catch {} }
  wipeChat(); setOnline(false); show('list', false, true);
}

let sheetOpen = false, sheetCb = null;
function openSheet(html, init, onClose) {
  if (sheetOpen) closeSheet();
  const s = $('sheet'); s.innerHTML = '<i class="grab"></i>' + html; clearTimeout(sheetHideT); s.style.cssText = ''; $('sheetBg').style.cssText = ''; $('sheetBg').classList.remove('closing'); $('sheetBg').classList.remove('hidden');
  sheetOpen = true; sheetCb = onClose || null; s.scrollTop = 0; init && init(s);
}
let sheetHideT = null;
function closeSheet() {
  if (!sheetOpen) return; sheetOpen = false; const cb = sheetCb; sheetCb = null;
  const bg = $('sheetBg'), sh = $('sheet');
  if (matchMedia('(prefers-reduced-motion:reduce)').matches) { bg.classList.add('hidden'); cb && cb(); return; }
  sh.style.animation = 'none'; if (!sh.style.transform) sh.style.transform = 'translateY(0)';
  bg.style.transition = '--k .36s cubic-bezier(.32,.72,0,1)'; void sh.offsetHeight;
  bg.classList.add('closing'); bg.style.setProperty('--k', '0'); clearTimeout(sheetHideT);
  sheetHideT = setTimeout(() => { if (!sheetOpen) { bg.classList.add('hidden'); bg.classList.remove('closing'); sh.style.cssText = ''; bg.style.cssText = ''; } }, 400);
  cb && cb();
}
if (window.visualViewport) {
  const fitSheet = () => { const vv = visualViewport, b = $('sheetBg'); b.style.top = vv.offsetTop + 'px'; b.style.bottom = 'auto'; b.style.height = vv.height + 'px'; };
  visualViewport.addEventListener('resize', fitSheet); visualViewport.addEventListener('scroll', fitSheet); fitSheet();
}
$('sheet').addEventListener('focusin', e => { if (e.target.matches('input,textarea')) setTimeout(() => { try { e.target.scrollIntoView({ block: 'center', behavior: 'smooth' }); } catch {} }, 300); });
$('sheetBg').onclick = e => { if (e.target === $('sheetBg') || e.target.classList.contains('grab')) closeSheet(); };
document.addEventListener('keydown', e => { if (e.key === 'Escape' && sheetOpen) closeSheet(); });
(() => {
  const sh = $('sheet'), bg = $('sheetBg'); let y0 = 0, x0 = 0, t0 = 0, dy = 0, on = false, armed = false, lastY = 0, lastT = 0, vel = 0;
  const skip = el => el.closest && el.closest('input,textarea,select,.qrbox,canvas');
  const begin = (x, y, el) => { armed = !skip(el); on = false; y0 = lastY = y; x0 = x; t0 = lastT = Date.now(); dy = 0; vel = 0; };
  const move = (x, y, ev, fromHandle) => {
    if (!armed) return; const d = y - y0;
    if (!on) {
      if (Math.abs(d) < 8 || Math.abs(x - x0) > Math.abs(d)) return;
      if (d < 0 || (sh.scrollTop > 0 && !fromHandle)) { armed = false; return; }
      on = true; sh.style.animation = 'none'; sh.style.transition = 'none'; bg.style.transition = 'none';
    }
    if (ev.cancelable) ev.preventDefault();
    dy = Math.max(0, d); const now = Date.now(); vel = (y - lastY) / Math.max(1, now - lastT); lastY = y; lastT = now;
    const r = dy > 0 ? dy : 0; sh.style.transform = `translateY(${r}px)`; bg.style.setProperty('--k', String(Math.max(0, 1 - r / (sh.offsetHeight * 1.05))));
  };
  const end = () => {
    if (!armed && !on) return; armed = false; if (!on) return; on = false;
    const far = dy > Math.min(140, sh.offsetHeight * .3) || vel > .6;
    if (far) { closeSheet(); }
    else {
      sh.style.transition = 'transform .5s cubic-bezier(.34,1.42,.64,1)'; bg.style.transition = '--k .4s ease'; sh.style.transform = 'translateY(0)'; bg.style.setProperty('--k', '1');
      setTimeout(() => { if (sheetOpen) { sh.style.transition = ''; bg.style.cssText = ''; } }, 520);
    }
  };
  sh.addEventListener('touchstart', e => { if (e.touches.length === 1) begin(e.touches[0].clientX, e.touches[0].clientY, e.target); else armed = false; }, { passive: true });
  sh.addEventListener('touchmove', e => { if (e.touches.length === 1) move(e.touches[0].clientX, e.touches[0].clientY, e, !!e.target.closest('.grab')); }, { passive: false });
  sh.addEventListener('touchend', end); sh.addEventListener('touchcancel', end);
  sh.addEventListener('pointerdown', e => { if (e.pointerType !== 'mouse' || !e.target.classList.contains('grab')) return; begin(e.clientX, e.clientY, e.target); e.target.setPointerCapture(e.pointerId); e.target._drag = true; });
  sh.addEventListener('pointermove', e => { if (e.target._drag) move(e.clientX, e.clientY, e, true); });
  sh.addEventListener('pointerup', e => { if (e.target._drag) { e.target._drag = false; end(); } });
})();
function askConfirm(title, text, ok, danger = false, no) {
  return new Promise(res => {
    let r = false;
    openSheet(`<h3></h3><p class="note" style="margin:0 0 6px"></p><button class="btn ${danger ? 'danger' : ''}" id="cfOk"></button><button class="btn sec" id="cfNo"></button>`, s => {
      s.querySelector('h3').textContent = title; s.querySelector('p').textContent = text; s.querySelector('#cfOk').textContent = ok || t('confirm'); s.querySelector('#cfNo').textContent = no || t('cancel');
      s.querySelector('#cfOk').onclick = () => { r = true; closeSheet(); }; s.querySelector('#cfNo').onclick = closeSheet;
    }, () => res(r));
  });
}

function renderList() {
  const box = $('chatList');
  if (box.dataset.l === lang && box.firstChild) return;
  box.dataset.l = lang;
  box.innerHTML = `<div class="hero"><div class="orb"><span>💬</span></div>
      <h2>${esc(t('heroH'))}</h2><p>${esc(t('heroP'))}</p>
      <button class="btn sec" id="heroPw">${ic('bolt', 'sm')}${esc(t('heroPw'))}</button>
      <button class="btn sec" id="heroShare">${ic('file', 'sm')}${esc(t('heroShare'))}</button>
      <button class="btn sec" id="heroManual">${ic('lock', 'sm')}${esc(t('heroManual'))}</button>
      <div class="chips"><span class="chip">${ic('shield')}${esc(t('chipE2E'))}</span><span class="chip">${ic('bolt')}${esc(t('chipDirect'))}</span><span class="chip">${ic('phone')}${esc(t('chipCalls'))}</span><span class="chip">${ic('lock')}${esc(t('chipNoAcc'))}</span></div>
      <button class="donate" id="heroDonate">${esc('❤ ' + t('donate'))}</button></div>`;
  $('heroManual').onclick = () => startConnect('create'); $('heroPw').onclick = () => openPw(); $('heroShare').onclick = () => openPw(null, 'share'); $('heroDonate').onclick = donateSheet;
}

function segBind(root, vals, get, set) {
  const draw = () => { root.dataset.v = vals.indexOf(get()); if (vals.length === 2) root.classList.toggle('j', vals.indexOf(get()) === 1); root.querySelectorAll('button').forEach(b => b.classList.toggle('on', b.dataset.v === get())); };
  root.querySelectorAll('button').forEach(b => b.onclick = () => { set(b.dataset.v); draw(); }); draw();
}
$('btnSettings').onclick = () => { openSheet(
  `<h3>${esc(t('settings'))}</h3>
   <div class="srow"><div class="sr-t"><b>${esc(t('setSnd'))}</b><small>${esc(t('setSndS'))}</small></div><label class="sw"><input type="checkbox" id="setSnd"><i></i></label></div>
   <div class="srow"><div class="sr-t"><b>${esc(t('setRecv'))}</b><small>${esc(t('setRecvS'))}</small></div><label class="sw"><input type="checkbox" id="setRecv"><i></i></label></div>
   <div class="srow"><div class="sr-t"><b>${esc(t('setTyp'))}</b><small>${esc(t('setTypS'))}</small></div><label class="sw"><input type="checkbox" id="setTyp"><i></i></label></div>
   ${window.AndroidBridge ? `<div class="srow"><div class="sr-t"><b>${esc(t('setNtxt'))}</b><small>${esc(t('setNtxtS'))}</small></div><label class="sw"><input type="checkbox" id="setNtxt"><i></i></label></div>` : ''}
   <div class="srow" style="display:block"><b style="display:block;margin-bottom:8px">${esc(t('theme'))}</b><div class="seg" id="setTheme" data-v="0"><i></i><button data-v="dark">${esc(t('thDark'))}</button><button data-v="light">${esc(t('thLight'))}</button></div></div>
   <details class="adv"><summary>${esc(t('advanced'))}</summary>
   <div class="srow"><div class="sr-t"><b>${esc(t('setStun'))}</b><small>${esc(t('setStunS'))}</small></div><label class="sw"><input type="checkbox" id="setStun"><i></i></label></div>
   <div class="srow"><div class="sr-t"><b>${esc(t('setRelay'))}</b><small>${esc(t('setRelayS'))}</small></div><label class="sw"><input type="checkbox" id="setRelay"><i></i></label></div>
   <div class="srow" style="display:block"><b style="display:block;margin-bottom:4px">${esc(t('setIce'))}</b><small class="mut" style="display:block;margin-bottom:8px;font-size:13px">${esc(t('setIceS'))}</small><textarea class="field" id="setIce" rows="3" style="font:12px/1.4 ui-monospace,Menlo,monospace;resize:none" placeholder="turn:turn.example.com:3478 user pass"></textarea></div>
   <div class="srow"><div class="sr-t"><b>${esc(t('netH'))}</b><small>${esc(t('netP'))}</small></div><button class="btn sec small" id="netOpen" style="width:auto;margin:0">${esc(t('netBtn'))}</button></div>
   <div class="srow"><div class="sr-t"><b>${esc(t('dbgBtn'))}</b><small>${esc(t('dbgS'))}</small></div><button class="btn sec small" id="dbgCopy" style="width:auto;margin:0">${esc(t('copy'))}</button></div>
   </details>
   <p class="note">${esc(t('storedLocal'))}</p>
   <button class="btn" id="setOk">${esc(t('done'))}</button>`,
  s => {
    s.querySelector('#setIce').value = cfg.ice || '';
    const bind = (id, key) => { const e = s.querySelector('#' + id); e.checked = !!cfg[key]; e.onchange = () => { cfg[key] = e.checked; }; };
         bind('setSnd', 'sounds'); bind('setStun', 'stun'); bind('setRecv', 'receipts'); bind('setTyp', 'typing'); if (s.querySelector('#setNtxt')) bind('setNtxt', 'ntxt');
    { const e = s.querySelector('#setRelay'); e.checked = !!cfg.relay; e.onchange = () => { const ice = s.querySelector('#setIce').value; if (e.checked && !/^\s*turns?:/mi.test(ice)) { e.checked = false; toast(t('relayNeedTurn'), 4500); return; } cfg.relay = e.checked; cfg.ice = ice; }; }
    segBind(s.querySelector('#setTheme'), ['dark', 'light'], () => cfg.theme, v => { cfg.theme = v; applyTheme(); });
    s.querySelector('#dbgCopy').onclick = async () => { try { await navigator.clipboard.writeText(DBG.join('\n')); toast(t('copied')); } catch { toast(t('copyFail')); } };
    s.querySelector('#netOpen').onclick = () => { closeSheet(); setTimeout(netSheet, 380); };
    s.querySelector('#setOk').onclick = closeSheet;
  },
  () => {
    const i = $('sheet').querySelector('#setIce'); if (i) { cfg.ice = i.value.slice(0, 1500); }
  }); };

function splitCode(code) {
  if (code.length <= 560) return [code];
  const id = Math.random().toString(36).slice(2, 6), size = 430, n = Math.ceil(code.length / size);
  return Array.from({ length: n }, (_, i) => `P2P|${id}|${i + 1}|${n}|` + code.slice(i * size, (i + 1) * size));
}
function drawQr(cv, text) {
  const qr = qrcode(0, 'L'); qr.addData(text, 'Byte'); qr.make();
  const n = qr.getModuleCount(), q = 4, cell = Math.max(3, Math.floor(720 / (n + q * 2)));
  cv.width = cv.height = (n + q * 2) * cell;
  const cx = cv.getContext('2d'); cx.fillStyle = '#fff'; cx.fillRect(0, 0, cv.width, cv.height); cx.fillStyle = '#000';
  for (let r = 0; r < n; r++) for (let c = 0; c < n; c++) if (qr.isDark(r, c)) cx.fillRect((c + q) * cell, (r + q) * cell, cell, cell);
}
function showQr(box, code) {
  clearInterval(box._t); box.innerHTML = '';
  const parts = splitCode(code), cv = document.createElement('canvas'), cap = document.createElement('div'); cap.className = 'qrcap';
  box.append(cv, cap); let i = 0;
  const draw = () => { drawQr(cv, parts[i]); cap.textContent = parts.length > 1 ? t('qrFrames', { i: i + 1, n: parts.length }) : t('qrScanThis'); };
  draw(); if (parts.length > 1) box._t = setInterval(() => { i = (i + 1) % parts.length; draw(); }, 1100);
}

function scanQr() {
  return new Promise(async res => {
    const ov = $('scanner'), vid = $('vid'), hint = $('scanHint');
    let stream = null, stopped = false, last = 0; const parts = new Map();
    const cv = document.createElement('canvas'), cx = cv.getContext('2d', { willReadFrequently: true });
    const done = v => { if (stopped) return; stopped = true; stream && stream.getTracks().forEach(tr => tr.stop()); vid.srcObject = null; setHidden(ov, true, 260); res(v); };
    const feed = text => {
      const s = text.trim(), m = /^P2P\|(\w+)\|(\d+)\|(\d+)\|(.+)$/.exec(s);
      if (m) {
        const idx = +m[2], total = +m[3]; if (!(total >= 1 && total <= 50 && idx >= 1 && idx <= total)) return null;
        let p = parts.get(m[1]); if (!p) parts.set(m[1], p = { n: total, g: new Map() }); if (p.n !== total) return null;
        p.g.set(idx, m[4]); const c = p.g.size; hint.textContent = t('scanGot', { c, n: p.n });
        if (c === p.n) { let o = ''; for (let j = 1; j <= p.n; j++) o += p.g.get(j); return o; }
        return null;
      }
      const l = /#[ij]=([A-Za-z0-9_-]{20,})$/.exec(s); if (l) return l[1];
      if (/^(PW1|FS1|GR1):.{10,100}$/s.test(s)) return s;
      if (/#[gps]=[a-z0-9-]{16,24}$/.test(s)) return s;
      return /^[CZRE][A-Za-z0-9_-]{20,}$/.test(s) ? s : null;
    };
    const decode = (src, w, h) => {
      const k = Math.min(1, 1100 / Math.max(w, h)); cv.width = Math.round(w * k); cv.height = Math.round(h * k); cx.drawImage(src, 0, 0, cv.width, cv.height);
      const img = cx.getImageData(0, 0, cv.width, cv.height); return jsQR(img.data, img.width, img.height, { inversionAttempts: 'attemptBoth' });
    };
    $('scanClose').onclick = () => done(null);
    $('scanGallery').onclick = () => $('scanFile').click();
    $('scanFile').onchange = async () => {
      const f = $('scanFile').files[0]; $('scanFile').value = ''; if (!f) return;
      try {
        const bmp = await createImageBitmap(f), r = decode(bmp, bmp.width, bmp.height);
        if (!r || !r.data) return toast(t('scanNoQr'));
        const c = feed(r.data); if (c) done(c); else toast(t('scanMore'));
      } catch { toast(t('scanBadPhoto')); }
    };
    setHidden(ov, false); hint.textContent = t('scanAim');
    try { stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: { ideal: 'environment' }, width: { ideal: 1280 } }, audio: false }); }
    catch { hint.textContent = t('scanNoCam'); return; }
    if (stopped) { stream.getTracks().forEach(tr => tr.stop()); return; }
    vid.srcObject = stream; await vid.play().catch(() => {});
    const tick = ts => {
      if (stopped) return; requestAnimationFrame(tick);
      if (ts - last < 110 || vid.readyState < 2 || !vid.videoWidth) return; last = ts;
      const r = decode(vid, vid.videoWidth, vid.videoHeight); if (!r || !r.data) return;
      const c = feed(r.data); if (c) { vib(60); done(c); }
    };
    requestAnimationFrame(tick);
  });
}

document.addEventListener('visibilitychange', () => dbg('visibility', document.hidden ? 'hidden' : 'visible'));
addEventListener('online', () => dbg('network online')); addEventListener('offline', () => dbg('network offline'));

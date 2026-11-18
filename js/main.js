'use strict';
function refreshAll() {
  renderList(); drawViz();
  if (screen === 'connect') $('cTitle').textContent = t('newConn');
  if (peer) setHead(peer.name, liveWith(peer.id) ? t('online') : t('offlineSt'), liveWith(peer.id));
  callUi();
}
async function handleInvite(code) {
  await startConnect('join'); $('offerIn').value = code; syncPassJ();
  if (code[0] !== 'E') { if (await askConfirm(t('invConfirmQ'), t('invConfirmT'), t('accept'))) guestAnswer(code); } else { toast(t('invGot')); $('passJ').focus(); }
}
applyI18n(); applyTheme();
wipeLegacy();
if ('serviceWorker' in navigator && (location.protocol === 'https:' || location.hostname === 'localhost')) addEventListener('load', () => { navigator.serviceWorker.register('sw.js').catch(() => {}); });
if (!(window.crypto && crypto.subtle)) { document.body.textContent = 'Web Crypto unavailable'; throw new Error('Web Crypto unavailable'); }
me.name = randomNick();
renderList(); setOnline(false); callUi();
const pl = /^#[ps]=([A-Za-z0-9-]+)$/.exec(location.hash), plK = /^#s=/.test(location.hash) ? 'share' : 'chat';
if (pl) { history.replaceState({ s: 'list' }, '', location.pathname + location.search); pwLinkOpen(pl[1], plK); }
const gl = /^#g=([A-Za-z0-9-]+)$/.exec(location.hash);
if (gl) { history.replaceState({ s: 'list' }, '', location.pathname + location.search); roomLink(gl[1]); }
const inv = /^#i=([A-Za-z0-9_-]+)$/.exec(location.hash);
if (inv) { history.replaceState({ s: 'list' }, '', location.pathname + location.search); handleInvite(inv[1]); }

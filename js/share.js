let chatMode = 'chat', shLocal = false, shPeer = false;
const shareMode = () => chatMode === 'share';
const shReady = () => !shareMode() || (shLocal && shPeer);
const deviceEmoji = () => /Android|iPhone|iPad|iPod|Mobile|Silk/i.test(navigator.userAgent) || (/Macintosh/.test(navigator.userAgent) && navigator.maxTouchPoints > 1) ? '📱' : '💻';
function fadeHide(el) { if (el.classList.contains('hidden')) return; el.classList.add('out'); setTimeout(() => { el.classList.add('hidden'); el.classList.remove('out'); }, 280); }
function setMode(m) {
  chatMode = m; shLocal = shPeer = false; document.body.classList.toggle('share', m === 'share');
  if (m !== 'share') { $('shGate').classList.add('hidden'); }
}
async function shGateOpen() {
  const code = await safetyOf(); if (!shareMode() || !code) return;
  $('shSas').innerHTML = `<div class="dg">${code.digits.map(d => `<span>${d}</span>`).join('')}</div><div class="em">${code.emo}</div>`;
  $('shWait').classList.add('hidden'); $('shYes').disabled = false; $('shYes').classList.remove('hidden');
  $('shGate').classList.remove('hidden');
}
function shCheck() {
  if (!shareMode() || !shReady()) return;
  fadeHide($('shGate')); if (cur) cur.ver = true; drawLock(); setOnline(true);
  sys(t('shOpen')); try { $('text').focus(); } catch {}
}
$('shYes').onclick = () => {
  if (!shareMode() || !liveConn()) return;
  shLocal = true; sendJson({ t: 'vok' }); $('shYes').classList.add('hidden');
  if (!shPeer) { $('shWait').textContent = t('shWaiting'); $('shWait').classList.remove('hidden'); }
  shCheck();
};
function shPeerOk() { if (!shareMode() || shPeer) return; shPeer = true; shCheck(); if (!shLocal) { $('shWait').textContent = t('shPeerOk'); $('shWait').classList.remove('hidden'); } }
function shPeerNo() { if (!shareMode()) return; closeSheet(); toast(t('shPeerNo'), 6000); wipeChat(); setOnline(false); show('list', false, true); }
$('shNo').onclick = async () => {
  if (liveConn()) { try { await sendJson({ t: 'vno' }); await new Promise(r => setTimeout(r, 250)); } catch {} }
  toast(t('shNoDone'), 6000); wipeChat(); setOnline(false); show('list', false, true);
};
$('btnTrash').onclick = () => endChat();

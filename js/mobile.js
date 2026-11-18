'use strict';
if (window.visualViewport) {
  const vvVars = () => { const r = document.documentElement.style; r.setProperty('--vvh', visualViewport.height + 'px'); r.setProperty('--vvt', visualViewport.offsetTop + 'px'); };
  const fit = () => { $('app').style.height = visualViewport.height + 'px'; vvVars(); scrollLog(); };
  visualViewport.addEventListener('resize', fit); visualViewport.addEventListener('scroll', () => { scrollTo(0, 0); vvVars(); }); fit();
}
['gesturestart', 'gesturechange', 'gestureend'].forEach(ev => document.addEventListener(ev, e => e.preventDefault(), { passive: false }));
let lastTap = 0;
document.addEventListener('touchend', e => {
  const n = Date.now();
  if (n - lastTap < 350 && !e.target.closest('button,a,input,textarea,label,select,.m,.sas')) e.preventDefault();
  lastTap = n;
}, { passive: false });
document.addEventListener('dblclick', e => { if (!e.target.closest('input,textarea,.m,.sas')) e.preventDefault(); });
addEventListener('beforeunload', e => { try { sendJson({ t: 'hangup' }); } catch {} if (callState === 'active') { e.preventDefault(); e.returnValue = ''; } });
addEventListener('pagehide', e => { if (!e.persisted) try { dc && dc.close(); } catch {} });


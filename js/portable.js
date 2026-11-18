'use strict';
async function buildPortable() {
  const base = location.href.split('#')[0].split('?')[0];
  const res = await fetch(base, { cache: 'no-cache' });
  if (!res.ok) throw new Error('index');
  const raw = await res.text();
  const doc = new DOMParser().parseFromString(raw, 'text/html');
  const scripts = [...doc.querySelectorAll('script[src]')];
  if (!scripts.length) return raw;
  const text = async u => {
    const r = await fetch(new URL(u, base).href, { cache: 'no-cache' });
    if (!r.ok) throw new Error(u);
    return r.text();
  };
  for (const l of [...doc.querySelectorAll('link[rel="stylesheet"]')]) {
    const st = doc.createElement('style');
    st.textContent = await text(l.getAttribute('href'));
    l.replaceWith(st);
  }
  doc.querySelectorAll('link[rel="manifest"], link[rel="apple-touch-icon"][href$=".png"]').forEach(l => l.remove());
  const hashes = [];
  for (const s of scripts) {
    const code = (await text(s.getAttribute('src'))).replace(/<\/(script)/gi, '<\\/$1');
    const n = doc.createElement('script');
    n.textContent = code;
    s.replaceWith(n);
    const d = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(code));
    hashes.push("'sha256-" + btoa(String.fromCharCode(...new Uint8Array(d))) + "'");
  }
  const csp = doc.querySelector('meta[http-equiv="Content-Security-Policy"]');
  if (csp) csp.setAttribute('content', csp.getAttribute('content').replace("script-src 'self'", 'script-src ' + hashes.join(' ')).replace(/; manifest-src 'self'/, '').replace(/; worker-src 'self'/, ''));
  return '<!doctype html>\n' + doc.documentElement.outerHTML + '\n';
}
async function downloadPortable() {
  try {
    toast(t('dlBusy'));
    const html = await buildPortable();
    const a = document.createElement('a');
    a.href = URL.createObjectURL(new Blob([html], { type: 'text/html' }));
    a.download = 'index.html';
    document.body.append(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(a.href), 10000);
    toast(t('dlDone'));
  } catch { toast(t('dlFail'), 5000); }
}
function portableHelpSheet() {
  openSheet(`<h3>${esc(t('dlHelpH'))}</h3><p class="note" style="margin:0 0 8px">${esc(t('dlHelpP1'))}</p><p class="note" style="margin:0 0 8px">${esc(t('dlHelpP2'))}</p><p class="note" style="margin:0 0 8px">${esc(t('dlHelpP3'))}</p><button class="btn" id="dlHelpOk">${esc(t('close'))}</button>`,
    s => { s.querySelector('#dlHelpOk').onclick = closeSheet; });
}

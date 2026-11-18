'use strict';
const WP = [
  { h: 'Abstract', p: ["nuke.chat is a messenger that runs entirely in the browser and talks directly between devices. There is no account, no message server and no database: text, files, voice and video travel peer-to-peer over WebRTC, wrapped in an end-to-end encryption layer built on the browser's own Web Crypto API. Nothing is written to disk, and everything disappears when the chat is closed. The whole product is a handful of static files, so anyone can host it on any static hosting, or even as a single downloadable index.html."] },
  { h: 'The problem', p: ["Mainstream messengers route every message through a company's servers. Even with end-to-end encryption, the operator still holds your account, your contact graph and metadata about who talks to whom and when. Sign-up usually needs a phone number or an email, and one leaked account or one legal request exposes the rest.", "Many people only need a short private conversation, or a way to pass a file between two of their own devices, without installing an app or creating an identity. nuke.chat is built for exactly that."] },
  { h: 'How it works', p: ['Two browsers meet through a public relay, then talk directly. The relay never sees a message.'], ol: [
    '<b>Meet.</b> One person creates a one-time code, shown as text, a link or a QR code. The code is stretched into a key and a meeting topic, and both browsers use them to exchange encrypted connection offers through the public relays.',
    '<b>Connect.</b> The browsers ask STUN servers for their public addresses, swap them, and open a direct WebRTC channel.',
    '<b>Verify.</b> Each side signs its keys, and the signatures are bound to both DTLS fingerprints, so a swapped key is noticed.',
    '<b>Renew.</b> A second channel with new one-time keys is raised inside the first, then the old channel is closed.',
    '<b>Talk.</b> Messages, files and calls flow directly, encrypted end to end.'], p2: ['In manual mode, step 1 is replaced by exchanging an invitation and a reply yourself, so no relay is used at all.'] },
  { h: 'Security model', p: ['Every session is authenticated and encrypted by code running in the browser, so relays and hosting only ever see ciphertext.'], table: [
    ['Transport', 'WebRTC DataChannel (DTLS), directly between the two browsers'],
    ['Identity', 'A fresh ECDSA P-256 key per session; handshake messages are signed and bound to both DTLS fingerprints'],
    ['Key agreement', 'Ephemeral ECDH P-256, then HKDF-SHA-256'],
    ['Messages', 'AES-GCM, per-message keys derived from a chain key, counters against replay and reordering, padding to fixed sizes (256 B to 8 KiB)'],
    ['Quick-chat code', 'PBKDF2-SHA-256 with 600,000 iterations derives the meeting topic and key; an optional second password is mixed in'],
    ['Key renewal', 'After the handshake a second channel with new one-time keys replaces the first, which is closed'],
    ['Verification', 'A safety code of digits and emoji that both people compare; in file-sharing mode sending stays locked until both confirm'],
    ['Web hardening', 'A content security policy with no inline scripts; connections only to five public MQTT relays and ntfy.sh']],
    p2: ['The public relays exist only so that two browsers can find each other. They carry encrypted offers tied to the one-time code; once the direct channel is up, they are no longer involved.'] },
  { h: 'Features', ul: [
    '<b>Quick chat:</b> start with a one-time password, a QR code or a link; the code is burned after use.',
    '<b>Manual connection:</b> exchange an invitation and a reply as a QR code or text, with no relay involved.',
    '<b>File sharing mode:</b> files and text between your own devices, with no size cap beyond what the browser allows, mandatory key comparison on both sides and a one-tap button that closes the connection and wipes everything.',
    '<b>Files in chat:</b> up to 2 GB per file; the recipient must consent above 50 MB.',
    '<b>Calls:</b> one-to-one voice and video, screen sharing, camera zoom and a drawing tool.',
    '<b>Group rooms:</b> up to 6 people in a full mesh, group keys renewed whenever membership changes, group calls.',
    '<b>Messaging:</b> replies, emoji reactions, message deletion, read receipts and a typing indicator (both can be switched off).',
    '<b>Privacy controls:</b> an option to route all traffic through your own TURN server so your contact never sees your IP address.',
    '<b>App experience:</b> light and dark themes, installable as a PWA, no sign-up.'] },
  { h: 'Advantages', ul: [
    '<b>No accounts, no phone numbers.</b> There is no identity to leak or link; each session gets a random nickname.',
    '<b>No message server.</b> Nothing to breach, subpoena or shut down, because messages never pass through one.',
    '<b>Nothing is stored.</b> Chats and files live in memory only and vanish when the chat closes.',
    '<b>Open to inspection.</b> Plain scripts, no build step, standard Web Crypto primitives and a strict content security policy make the code easy to read and verify.',
    '<b>Zero install.</b> It opens in any modern browser on phone or desktop and can be installed as an app.',
    '<b>Self-hosting in minutes.</b> The product is static files; the portable build is a single index.html of about 650 KB that any static host can serve.',
    '<b>Almost no running cost.</b> Traffic flows between users, not through the host, so the host serves one file and load does not grow with usage.',
    '<b>No central point of failure.</b> Meeting relays are interchangeable, and you can add your own TURN server for hard networks.',
    '<b>Files without a cap.</b> File-sharing mode streams large files straight to disk in supporting browsers.'] },
  { h: 'Limitations and threat model', p: ['nuke.chat trades convenience for privacy, and it is honest about the cost.'], ul: [
    '<b>Both people must be online at the same time.</b> There is no offline delivery, no history and no multi-device sync, by design.',
    '<b>Some metadata is still visible.</b> STUN servers and your contact can see your IP address unless you use your own TURN server; public relays can see that someone is looking for a peer and when.',
    '<b>Hard networks need help.</b> Strict NATs, corporate firewalls and some VPNs block direct links. Add a TURN server, and if you use a VPN, enable Xray TUN mode.',
    '<b>Voice and video</b> use the browser\'s DTLS-SRTP encryption, with no second layer on top.',
    '<b>The protocol has not been independently audited.</b> It uses standard primitives in a custom arrangement, so treat it as unaudited until a third-party review exists.',
    '<b>The device and the host are trusted.</b> Malware, a compromised browser or screenshots defeat any chat app. Whoever controls the website could serve altered code, so for high-risk use host the portable file yourself and check it before use.'] },
  { h: 'Deployment and the portable version', p: ['There is no backend, database or environment configuration to set up.'], ol: [
    'Open Settings and press <b>Download portable</b>. The app builds a single index.html with all markup, styles and scripts inside (about 650 KB).',
    'Upload that file to any static host: Cloudflare Pages, GitHub Pages, Netlify or your own nginx.',
    'Serve it over HTTPS. Browsers require it for calls, the camera, Web Crypto and installation.',
    'Optional: add your own TURN server under Settings, Advanced, for strict networks.'], p2: ['The portable file keeps its strict security policy: each embedded script is allowed by its hash, so nothing else can run. Installing it as an offline PWA needs the full folder of files instead of the single file.'] },
  { h: 'Conclusion', p: ['nuke.chat removes the server from private messaging instead of trying to trust it. Two browsers find each other once, verify each other with a safety code, and talk directly with nothing stored afterwards. It fits short private conversations, quick file transfers between your own devices and small groups, and it costs almost nothing to host. It is not a replacement for a long-lived, multi-device messenger, and it should be used with its limits in mind.'] }
];
function whitepaperSheet() {
  const P = a => (a || []).map(x => `<p class="wp-p">${esc(x)}</p>`).join('');
  const body = WP.map(s => `<h4 class="wp-h">${esc(s.h)}</h4>${P(s.p)}${s.ol ? `<ol class="wp-l">${s.ol.map(x => `<li>${x}</li>`).join('')}</ol>` : ''}${s.ul ? `<ul class="wp-l">${s.ul.map(x => `<li>${x}</li>`).join('')}</ul>` : ''}${s.table ? `<div class="wp-t">${s.table.map(r => `<div><b>${esc(r[0])}</b><span>${esc(r[1])}</span></div>`).join('')}</div>` : ''}${P(s.p2)}`).join('');
  openSheet(`<h3>${esc(t('wpTitle'))}</h3><div class="wp">${body}</div><button class="btn" id="wpOk">${esc(t('close'))}</button>`, s => { s.querySelector('#wpOk').onclick = closeSheet; });
}

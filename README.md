# nuke.chat

Serverless P2P chat: WebRTC DataChannel plus a custom end-to-end encryption layer, quick chat with a one-time password
(peers find each other through public MQTT relays), manual connection via QR/code, files, 1:1 calls and group rooms.

## Structure
```
index.html            markup and SVG icons (no inline scripts)
css/style.css         all styles
js/vendor/qrcode.js   QR generator (MIT)
js/vendor/jsqr.js     QR reading from camera and photos (Apache-2.0)
js/crypto.js          E2E layer: ECDSA signatures, ECDH + HKDF, AES-GCM, self-tests (window.E2E)
js/i18n.js            English UI strings
js/core.js            utilities, settings, screens, sheets, QR, chat list / home screen
js/webrtc.js          WebRTC, DataChannel, handshake, connection swap after the password step
js/chat.js            messages, files (recipient consent above 50 MB), encryption check
js/quickchat.js       quick chat by password: MQTT, connection stages, #p= links
js/room.js            group room: #g= invitations, full mesh, key epochs, call
js/replies.js         message replies (quote, swipe right) and reactions 👍❤️😂😮😢🙏🔥👎, private chat and room
js/calls.js           1:1 calls, video, gestures
js/mobile.js          mobile: keyboard, page zoom
js/whitepaper.js      English white paper shown from the home screen
js/portable.js        "Download portable" button: builds a single-file index.html
js/main.js            startup
sw.js, manifest.webmanifest, icon-*.png    PWA
```
Scripts are plain (not modules), loaded in order and sharing one global scope, so the order in `index.html` matters.
This lets the app open over `file://` as well.

## Running
Any static server: `python3 -m http.server`. PWA and invitation links work only over HTTPS (or localhost).

## Security
CSP policy in `index.html`: `script-src 'self'` (no inline scripts), connections only to five MQTT relays (three services, two of them reachable under fallback names).
`style-src` keeps `'unsafe-inline'` because the markup and templates use `style` attributes.

## File sharing
The third button on the home screen. Password/QR/link work as in quick chat (`FS1:` / `#s=`), but: no calls, no file size limits
(above 500 MB the recipient must consent and the file is streamed to disk), every text message has a "copy" button, and instead of nicknames
there are 📱/💻 emoji based on the user agent. Sending stays locked until BOTH devices confirm that the digits and emoji match. The red trash can closes
the connection and wipes everything (on both sides).

## Replies and reactions
Long-press (or right-click) on a message opens a menu: a row of emoji reactions, "Reply", "Copy", "Delete". On a phone a message
can be swiped right, which also means "reply". The quote travels with the message (`msg.rp`), a reaction is a separate frame `{t:'react', id, e}`;
in a room both travel inside the message encrypted with the group key. Deleting a message also erases its quotes in other bubbles. Nothing is stored.

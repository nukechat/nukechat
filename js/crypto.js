(function () {
'use strict';
const G = globalThis, subtle = G.crypto.subtle, te = new TextEncoder(), td = new TextDecoder();
const b64e = u8 => { let s = ''; for (let i = 0; i < u8.length; i += 0x8000) s += String.fromCharCode.apply(null, u8.subarray(i, i + 0x8000));
  return btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, ''); };
const b64d = s => { s = s.replace(/-/g, '+').replace(/_/g, '/'); while (s.length % 4) s += '='; return Uint8Array.from(atob(s), c => c.charCodeAt(0)); };
const cat = (...a) => { let n = 0; for (const x of a) n += x.length; const o = new Uint8Array(n); let p = 0; for (const x of a) { o.set(x, p); p += x.length; } return o; };
const u32 = n => new Uint8Array([(n >>> 24) & 255, (n >>> 16) & 255, (n >>> 8) & 255, n & 255]);
const lp = x => { if (typeof x === 'string') x = te.encode(x); return cat(u32(x.length), x); };
const sha = async u8 => new Uint8Array(await subtle.digest('SHA-256', u8));
const cmp = (a, b) => { const n = Math.min(a.length, b.length); for (let i = 0; i < n; i++) if (a[i] !== b[i]) return a[i] - b[i]; return a.length - b.length; };
const eq = (a, b) => a.length === b.length && cmp(a, b) === 0;
const hex = u8 => Array.from(u8, x => x.toString(16).padStart(2, '0')).join('');
const K_JSON = 0x4A, K_BIN = 0x42, VER = 2;

async function genIdentity() {
  const kp = await subtle.generateKey({ name: 'ECDSA', namedCurve: 'P-256' }, false, ['sign', 'verify']);
  return { priv: kp.privateKey, pub: new Uint8Array(await subtle.exportKey('raw', kp.publicKey)) };
}
async function idFromPub(pub) { return b64e((await sha(pub)).slice(0, 12)); }
async function newEphemeral() {
  const kp = await subtle.generateKey({ name: 'ECDH', namedCurve: 'P-256' }, false, ['deriveBits']);
  return { priv: kp.privateKey, pub: new Uint8Array(await subtle.exportKey('raw', kp.publicKey)) };
}
const helloBytes = (ek, fpOwn, fpPeer, name) => cat(te.encode('P2P-HELLO-v2'), lp(ek), lp(fpOwn), lp(fpPeer), lp(name));
async function signHello(priv, ek, fpLocal, fpRemote, name) {
  return new Uint8Array(await subtle.sign({ name: 'ECDSA', hash: 'SHA-256' }, priv, helloBytes(ek, fpLocal, fpRemote, name)));
}
async function verifyHello(ik, sig, ek, fpTheirOwn, fpTheirPeer, name) {
  try {
    const key = await subtle.importKey('raw', ik, { name: 'ECDSA', namedCurve: 'P-256' }, false, ['verify']);
    return await subtle.verify({ name: 'ECDSA', hash: 'SHA-256' }, key, sig, helloBytes(ek, fpTheirOwn, fpTheirPeer, name));
  } catch { return false; }
}
async function signBlob(priv, label, bytes) { return new Uint8Array(await subtle.sign({ name: 'ECDSA', hash: 'SHA-256' }, priv, cat(te.encode(label), bytes))); }
async function verifyBlob(ik, sig, label, bytes) {
  try { const key = await subtle.importKey('raw', ik, { name: 'ECDSA', namedCurve: 'P-256' }, false, ['verify']); return await subtle.verify({ name: 'ECDSA', hash: 'SHA-256' }, key, sig, cat(te.encode(label), bytes)); } catch { return false; }
}
const impAes = raw => subtle.importKey('raw', raw, 'AES-GCM', false, ['encrypt', 'decrypt']);

const hmac = async (k, b) => { const key = await subtle.importKey('raw', k, { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']); return new Uint8Array(await subtle.sign('HMAC', key, new Uint8Array([b]))); };
const MAX_SKIP = 2000;
const BUCKETS = [256, 512, 1024, 2048, 4096, 8192];
const bucketOf = n => { for (const x of BUCKETS) if (n <= x) return x; return Math.ceil(n / 4096) * 4096; };
class Session {
  constructor(sck, rck, sp, rp) { this.sck = sck; this.rck = rck; this.sp = sp; this.rp = rp; this.sendCtr = 0; this.recvCtr = -1; this._q = Promise.resolve(); this._rq = Promise.resolve(); }
  _nonce(prefix, hi, lo) { const n = new Uint8Array(12), dv = new DataView(n.buffer); n[0] = 0x50; n[3] = prefix; dv.setUint32(4, hi); dv.setUint32(8, lo); return n; }
  seal(kind, payload) { const p = this._q.then(() => this._seal(kind, payload)); this._q = p.catch(() => {}); return p; }
  async _seal(kind, payload) {
    const ctr = this.sendCtr; if (ctr >= 2 ** 48) throw new Error('counter exhausted');
    const hi = Math.floor(ctr / 2 ** 32), lo = ctr >>> 0, hdr = new Uint8Array(9), dv = new DataView(hdr.buffer);
    hdr[0] = VER; dv.setUint32(1, hi); dv.setUint32(5, lo);
    const mk = await hmac(this.sck, 1), next = await hmac(this.sck, 2);
    const ct = new Uint8Array(await subtle.encrypt({ name: 'AES-GCM', iv: this._nonce(this.sp, hi, lo), additionalData: hdr, tagLength: 128 }, await impAes(mk), cat(new Uint8Array([kind]), payload)));
    mk.fill(0); this.sck.fill(0); this.sck = next; this.sendCtr = ctr + 1;
    return cat(hdr, ct);
  }
  async sealJson(obj) {
    const b = te.encode(JSON.stringify(obj)), padn = bucketOf(1 + b.length) - (1 + b.length);
    return this.seal(K_JSON, cat(b, new Uint8Array(padn).fill(32)));
  }
  open(frame) { const p = this._rq.then(() => this._open(frame)); this._rq = p.catch(() => {}); return p; }
  async _open(frame) {
    if (!(frame instanceof Uint8Array) || frame.length < 9 + 17 || frame[0] !== VER) throw new Error('bad frame');
    const dv = new DataView(frame.buffer, frame.byteOffset, 9), hi = dv.getUint32(1), lo = dv.getUint32(5);
    if (hi > 0x1FFFFF) throw new Error('bad counter');
    const ctr = hi * 2 ** 32 + lo; if (ctr <= this.recvCtr) throw new Error('replay');
    if (ctr - (this.recvCtr + 1) > MAX_SKIP) throw new Error('gap');
    let ck = this.rck, mk = null;
    for (let i = this.recvCtr + 1; i <= ctr; i++) { mk = await hmac(ck, 1); const nx = await hmac(ck, 2); if (ck !== this.rck) ck.fill(0); ck = nx; if (i < ctr) mk.fill(0); }
    const pt = new Uint8Array(await subtle.decrypt({ name: 'AES-GCM', iv: this._nonce(this.rp, hi, lo), additionalData: frame.slice(0, 9), tagLength: 128 }, await impAes(mk), frame.slice(9)));
    mk.fill(0); this.rck.fill(0); this.rck = ck; this.recvCtr = ctr; return { kind: pt[0], payload: pt.slice(1) };
  }
  async probe() {
    const k = await hmac(this.sck, 0x70), w = await hmac(this.rck, 0x70);
    return { P: new Session(k.slice(), k.slice(), this.sp, this.sp), W: new Session(w.slice(), w.slice(), this.sp, this.sp) };
  }
}
async function deriveSession(o) {
  if (eq(o.ownEk, o.peerEk)) throw new Error('reflection');
  const pk = await subtle.importKey('raw', o.peerEk, { name: 'ECDH', namedCurve: 'P-256' }, false, []);
  const shared = new Uint8Array(await subtle.deriveBits({ name: 'ECDH', public: pk }, o.ephPriv, 256));
  const fps = [o.fpL, o.fpR].sort();
  const salt = await sha(cat(te.encode('P2P-SALT-v2'), lp(fps[0]), lp(fps[1]), lp(o.psk || new Uint8Array(0))));
  const lowMe = cmp(o.ownEk, o.peerEk) < 0;
  const [lowEk, highEk] = lowMe ? [o.ownEk, o.peerEk] : [o.peerEk, o.ownEk];
  const [lowIk, highIk] = lowMe ? [o.ownIk, o.peerIk] : [o.peerIk, o.ownIk];
  const info = cat(te.encode('P2P-KEYS-v2'), lp(lowEk), lp(highEk), lp(lowIk), lp(highIk));
  const base = await subtle.importKey('raw', shared, 'HKDF', false, ['deriveBits']);
  const okm = new Uint8Array(await subtle.deriveBits({ name: 'HKDF', hash: 'SHA-256', salt, info }, base, 512));
  const kLH = okm.slice(0, 32), kHL = okm.slice(32);
  shared.fill(0); okm.fill(0);
  return new Session(lowMe ? kLH : kHL, lowMe ? kHL : kLH, lowMe ? 1 : 2, lowMe ? 2 : 1);
}
async function safety(ikA, ikB) {
  const [a, b] = cmp(ikA, ikB) < 0 ? [ikA, ikB] : [ikB, ikA];
  const h = await sha(cat(te.encode('P2P-SAFETY-v2'), lp(a), lp(b))), dv = new DataView(h.buffer);
  const digits = []; for (let i = 0; i < 6; i++) digits.push(String(dv.getUint32(i * 4) % 100000).padStart(5, '0'));
  return { digits, emo: Array.from(h.slice(24, 32), x => x & 63) };
}

async function selfTest() {
  const R = [], add = (k, ok) => R.push({ k, ok: !!ok });
  const fpA = 'AA:11:22', fpB = 'BB:33:44';
  async function party(name, fpL, fpR) { const id = await genIdentity(), eph = await newEphemeral(); return { name, id, eph, fpL, fpR, sig: await signHello(id.priv, eph.pub, fpL, fpR, name) }; }
  const A = await party('A', fpA, fpB), B = await party('B', fpB, fpA);
  add('sig', await verifyHello(B.id.pub, B.sig, B.eph.pub, fpB, fpA, 'B') && await verifyHello(A.id.pub, A.sig, A.eph.pub, fpA, fpB, 'A'));
  add('mitm', !(await verifyHello(B.id.pub, B.sig, B.eph.pub, 'CC:99:99', fpA, 'B')) && !(await verifyHello(B.id.pub, B.sig, B.eph.pub, fpB, fpA, 'Bx')));
  const sA = await deriveSession({ ephPriv: A.eph.priv, ownEk: A.eph.pub, peerEk: B.eph.pub, ownIk: A.id.pub, peerIk: B.id.pub, fpL: fpA, fpR: fpB });
  const sB = await deriveSession({ ephPriv: B.eph.priv, ownEk: B.eph.pub, peerEk: A.eph.pub, ownIk: B.id.pub, peerIk: A.id.pub, fpL: fpB, fpR: fpA });
  const secret = 'secret message 123';
  const f1 = await sA.sealJson({ t: 'msg', text: secret }), f2 = await sB.sealJson({ t: 'msg', text: 'reply' });
  const o1 = await sB.open(f1), o2 = await sA.open(f2);
  add('roundtrip', JSON.parse(td.decode(o1.payload)).text === secret && JSON.parse(td.decode(o2.payload)).text === 'reply');
  add('opaque', !hex(f1).includes(hex(te.encode('secret'))) && BUCKETS.includes(f1.length - 9 - 16));
  const t = f1.slice(); t[20] ^= 1; let bad = false; try { await sB.open(t); } catch { bad = true; } add('tamper', bad);
  let rep = false; try { await sB.open(f1); } catch { rep = true; } add('replay', rep);
  const f3 = await sA.sealJson({ t: 'x' }), f4 = await sA.sealJson({ t: 'x' }); add('nonce', hex(f3.slice(1, 9)) !== hex(f4.slice(1, 9)));
  const sC = await deriveSession({ ephPriv: (await newEphemeral()).priv, ownEk: B.eph.pub, peerEk: A.eph.pub, ownIk: B.id.pub, peerIk: A.id.pub, fpL: fpB, fpR: fpA });
  let wk = false; try { await sC.open(await sA.sealJson({ t: 'y' })); } catch { wk = true; } add('wrongkey', wk);
  const psk1 = te.encode('pw1'), mk = psk => deriveSession({ ephPriv: A.eph.priv, ownEk: A.eph.pub, peerEk: B.eph.pub, ownIk: A.id.pub, peerIk: B.id.pub, fpL: fpA, fpR: fpB, psk });
  const sP = await mk(psk1), sQ = await deriveSession({ ephPriv: B.eph.priv, ownEk: B.eph.pub, peerEk: A.eph.pub, ownIk: B.id.pub, peerIk: A.id.pub, fpL: fpB, fpR: fpA, psk: te.encode('other') });
  let pk = false; try { await sQ.open(await sP.sealJson({ t: 'z' })); } catch { pk = true; } add('psk', pk);
  const n1 = await safety(A.id.pub, B.id.pub), n2 = await safety(B.id.pub, A.id.pub), n3 = await safety(A.id.pub, (await genIdentity()).pub);
  add('safety', n1.digits.join() === n2.digits.join() && n1.digits.join() !== n3.digits.join());
  return R;
}
G.E2E = { b64e, b64d, hex, genIdentity, idFromPub, newEphemeral, signHello, verifyHello, deriveSession, safety, selfTest, Session, signBlob, verifyBlob, lp, K_JSON, K_BIN, sha, cat };
if (typeof module !== 'undefined') module.exports = G.E2E;
})();

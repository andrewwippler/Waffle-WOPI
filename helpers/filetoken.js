const crypto = require('crypto');
const { JWT_SECRET } = require('./vars.js');
const path = require('path');

function base64UrlEncode(buf) {
  return buf.toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '');
}

function base64UrlDecode(str) {
  str = str.replace(/-/g, '+').replace(/_/g, '/');
  // pad
  while (str.length % 4) str += '=';
  return Buffer.from(str, 'base64').toString();
}

function base64UrlToBuffer(s) {
  s = s.replace(/-/g, '+').replace(/_/g, '/');
  while (s.length % 4) s += '=';
  return Buffer.from(s, 'base64');
}

function hmac(data) {
  return crypto.createHmac('sha256', JWT_SECRET).update(data).digest();
}

function createFileToken(relPath) {
  // normalize to forward slashes
  const normalized = relPath.replace(/\\/g, '/');
  const payload = base64UrlEncode(Buffer.from(normalized));
  const sig = base64UrlEncode(hmac(normalized));
  return `${payload}.${sig}`;
}

function decodeFileToken(token) {
  if (!token || typeof token !== 'string') throw new Error('Invalid token');
  const parts = token.split('.');
  if (parts.length !== 2) throw new Error('Invalid token');
  const [payload, sig] = parts;
  const rel = base64UrlDecode(payload);
  const expected = base64UrlEncode(hmac(rel));
  const sigBuf = base64UrlToBuffer(sig);
  const expBuf = base64UrlToBuffer(expected);
  if (sigBuf.length !== expBuf.length || !crypto.timingSafeEqual(sigBuf, expBuf)) {
    throw new Error('Invalid signature');
  }
  // prevent path traversal
  const clean = path.normalize(rel).replace(/\\/g, '/');
  if (clean.startsWith('..')) throw new Error('Invalid path');
  return clean;
}

module.exports = {
  createFileToken,
  decodeFileToken,
};

// Encrypts per-user secrets (OpenRouter keys) at rest with AES-256-GCM.
// Format: "v1.<iv>.<tag>.<ciphertext>", base64url parts. AAD binds a blob to its owner ("user:<id>").
import crypto from 'node:crypto';

const VERSION = 'v1';
const IV_BYTES = 12;
const TAG_BYTES = 16;

// Read lazily so tests (and late dotenv loads) see the current value.
function masterKey() {
  const raw = String(process.env.API_KEY_ENCRYPTION_KEY || '').trim();
  let buf = null;
  if (/^[0-9a-fA-F]{64}$/.test(raw)) buf = Buffer.from(raw, 'hex');
  else if (/^[A-Za-z0-9+/_-]{43}=?$/.test(raw)) buf = Buffer.from(raw, 'base64');
  return buf && buf.length === 32 ? buf : null;
}

export function vaultConfigured() {
  return masterKey() !== null;
}

function requireKey() {
  const key = masterKey();
  if (!key) throw new Error('Key vault is not configured (API_KEY_ENCRYPTION_KEY)');
  return key;
}

function requireAad(aad) {
  if (typeof aad !== 'string' || !aad) throw new Error('AAD is required');
  return Buffer.from(aad, 'utf8');
}

export function encryptSecret(plaintext, aad) {
  if (typeof plaintext !== 'string') throw new Error('plaintext must be a string');
  const key = requireKey();
  const iv = crypto.randomBytes(IV_BYTES);
  const cipher = crypto.createCipheriv('aes-256-gcm', key, iv, { authTagLength: TAG_BYTES });
  cipher.setAAD(requireAad(aad));
  const ct = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();
  return [VERSION, iv, tag, ct].map((p) => (typeof p === 'string' ? p : p.toString('base64url'))).join('.');
}

export function decryptSecret(blob, aad) {
  const parts = String(blob || '').split('.');
  if (parts.length !== 4 || parts[0] !== VERSION) throw new Error('Unknown secret format');
  const [, ivB64, tagB64, ctB64] = parts;
  const iv = Buffer.from(ivB64, 'base64url');
  const tag = Buffer.from(tagB64, 'base64url');
  const ct = Buffer.from(ctB64, 'base64url');
  if (iv.length !== IV_BYTES || tag.length !== TAG_BYTES) throw new Error('Malformed secret');
  const decipher = crypto.createDecipheriv('aes-256-gcm', requireKey(), iv, { authTagLength: TAG_BYTES });
  decipher.setAAD(requireAad(aad));
  decipher.setAuthTag(tag);
  return Buffer.concat([decipher.update(ct), decipher.final()]).toString('utf8');
}

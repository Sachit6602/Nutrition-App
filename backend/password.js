// Password hashing on Web Crypto (built into Workers and Node 20+). No database access, so it is unit-tested in Node.
// PBKDF2-SHA256, stored as "pbkdf2$<iterations>$<salt>$<hash>" (base64url). The count is stored with each hash,
// so changing PBKDF2_ITERATIONS later keeps existing passwords working.
// ponytail: Workers refuses PBKDF2 above 100k iterations, so 100k is both the default and the ceiling (OWASP
// would like 600k). At 100k a hash costs roughly 20-30 ms of CPU: fine on Workers Paid; on the Free plan's
// 10 ms budget logins can be cut off, so either upgrade or lower PBKDF2_ITERATIONS (weaker) in wrangler.jsonc.
const MAX_ITERATIONS = 100_000;
const ITERATIONS = () => Math.min(MAX_ITERATIONS, Number(process.env.PBKDF2_ITERATIONS) || MAX_ITERATIONS);

export const b64u = (bytes) => btoa(String.fromCharCode(...new Uint8Array(bytes))).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
const unb64u = (s) => Uint8Array.from(atob(s.replace(/-/g, '+').replace(/_/g, '/')), (c) => c.charCodeAt(0));

const derive = async (password, salt, iterations) => {
  const key = await crypto.subtle.importKey('raw', new TextEncoder().encode(password), 'PBKDF2', false, ['deriveBits']);
  return new Uint8Array(await crypto.subtle.deriveBits({ name: 'PBKDF2', hash: 'SHA-256', salt, iterations }, key, 256));
};

export const hashPassword = async (password) => {
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const iterations = ITERATIONS();
  return `pbkdf2$${iterations}$${b64u(salt)}$${b64u(await derive(password, salt, iterations))}`;
};

export const verifyPassword = async (password, stored) => {
  const [scheme, iter, salt, hash] = String(stored || '').split('$');
  if (!password || scheme !== 'pbkdf2' || !hash) return false;
  const expected = unb64u(hash);
  const actual = await derive(password, unb64u(salt), Number(iter));
  let diff = expected.length ^ actual.length;
  for (let i = 0; i < Math.min(expected.length, actual.length); i++) diff |= expected[i] ^ actual[i];
  return diff === 0; // constant-time compare
};

// Login sessions and the register/login/logout handlers. Password hashing lives in password.js.
import { env } from 'cloudflare:workers';
import { createSession, createUser, deleteSession, deleteUser, getSessionUser, getUserByEmail } from './db.js';
import { b64u, hashPassword, verifyPassword } from './password.js';

const MIN_PASSWORD = 8;
// Keep in sync with TERMS_VERSION in frontend/src/Legal.jsx; stored with each account as its consent record.
const TERMS_VERSION = '2026-11-04';

// True when this key has used up its attempts (AUTH_LIMITER in wrangler.jsonc). Checked before any hashing,
// so a flood of guesses costs no PBKDF2 CPU.
const limited = async (key) => {
  if (!env.AUTH_LIMITER) return false;
  const { success } = await env.AUTH_LIMITER.limit({ key });
  return !success;
};
const TOO_MANY = { error: 'Too many attempts. Wait a minute and try again.' };

// ---------- Sessions: random token in an HttpOnly cookie, its SHA-256 in D1 ----------
const COOKIE = 'sid';
const TTL_SECONDS = 7 * 24 * 60 * 60;

const sha256 = async (s) => b64u(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(s)));

const readToken = (req) => {
  for (const part of String(req.headers.cookie || '').split(';')) {
    const [k, ...v] = part.trim().split('=');
    if (k === COOKIE) return v.join('=');
  }
  return null;
};

// Same-origin by default (the Worker serves the frontend too). Set COOKIE_SAMESITE=none only when the
// frontend is hosted on a different site; that also forces Secure.
const cookieAttrs = (req) => {
  const host = String(req.headers.host || '');
  const local = /^(localhost|127\.0\.0\.1)(:\d+)?$/.test(host);
  const sameSite = process.env.COOKIE_SAMESITE === 'none' ? 'None' : 'Lax';
  return `Path=/; HttpOnly; SameSite=${sameSite}${local && sameSite !== 'None' ? '' : '; Secure'}`;
};

const startSession = async (req, res, userId) => {
  const token = b64u(crypto.getRandomValues(new Uint8Array(32)));
  await createSession(await sha256(token), userId, TTL_SECONDS);
  res.append('Set-Cookie', `${COOKIE}=${token}; Max-Age=${TTL_SECONDS}; ${cookieAttrs(req)}`);
};

// The signed-in user for this request, or null.
export const currentUser = async (req) => {
  const token = readToken(req);
  return token ? getSessionUser(await sha256(token)) : null;
};

export const authenticate = async (req, res, next) => {
  try {
    const user = await currentUser(req);
    if (!user) return res.status(401).json({ error: 'Not authenticated. Please login first.' });
    req.userId = user.id;
    req.user = user;
    next();
  } catch (err) {
    next(err);
  }
};

const credentials = (req) => ({
  email: typeof req.body?.email === 'string' ? req.body.email.trim() : '',
  password: typeof req.body?.password === 'string' ? req.body.password : '',
});

export const register = async (req, res) => {
  try {
    const { email, password } = credentials(req);
    if (!email || !password) return res.status(400).json({ error: 'Email and password are required' });
    if (password.length < MIN_PASSWORD) return res.status(400).json({ error: `Use a password of at least ${MIN_PASSWORD} characters.` });
    // Consent must be an explicit yes (DPDP Act): the checkbox sends accept_terms: true.
    if (req.body?.accept_terms !== true) {
      return res.status(400).json({ error: 'Please confirm you are 18 or older and agree to the Terms and Privacy Policy.' });
    }
    if (await limited(`register:${req.headers['cf-connecting-ip'] || 'local'}`)) return res.status(429).json(TOO_MANY);
    if (await getUserByEmail(email)) return res.status(400).json({ error: 'Email already registered' });

    let user;
    try {
      user = await createUser(email, await hashPassword(password), TERMS_VERSION);
    } catch (err) {
      // Two sign-ups with the same email at once: the UNIQUE constraint catches the second.
      if (/UNIQUE constraint failed/i.test(String(err?.message))) return res.status(400).json({ error: 'Email already registered' });
      throw err;
    }
    await startSession(req, res, user.id);
    res.status(201).json({ success: true, user: { id: user.id, email: user.email }, message: 'Registration successful' });
  } catch (error) {
    console.error('Registration error:', error?.message);
    res.status(500).json({ error: 'Internal server error' });
  }
};

export const login = async (req, res) => {
  try {
    const { email, password } = credentials(req);
    if (!email || !password) return res.status(400).json({ error: 'Email and password are required' });
    if (await limited(`login:${email.toLowerCase()}`)) return res.status(429).json(TOO_MANY);
    const user = await getUserByEmail(email);
    if (!user || !(await verifyPassword(password, user.password_hash))) {
      return res.status(401).json({ error: 'Invalid email or password' });
    }
    await startSession(req, res, user.id);
    res.json({ success: true, user: { id: user.id, email: user.email }, message: 'Login successful' });
  } catch (error) {
    console.error('Login error:', error?.message);
    res.status(500).json({ error: 'Internal server error' });
  }
};

// DELETE /me/account { password }: the right to erasure. Re-checks the password so a stolen session alone
// can't wipe an account; cascades remove everything the account owns.
export const deleteAccount = async (req, res) => {
  try {
    const password = typeof req.body?.password === 'string' ? req.body.password : '';
    if (!password) return res.status(400).json({ error: 'Enter your password to confirm.' });
    if (await limited(`delete:${req.userId}`)) return res.status(429).json(TOO_MANY);
    const user = await getUserByEmail(req.user.email);
    if (!user || !(await verifyPassword(password, user.password_hash))) {
      return res.status(401).json({ error: 'That password is not right.' });
    }
    await deleteUser(user.id);
    res.append('Set-Cookie', `${COOKIE}=; Max-Age=0; ${cookieAttrs(req)}`);
    res.json({ success: true, message: 'Account deleted' });
  } catch (error) {
    console.error('Delete account error:', error?.message);
    res.status(500).json({ error: 'Internal server error' });
  }
};

export const logout = async (req, res) => {
  try {
    const token = readToken(req);
    if (token) await deleteSession(await sha256(token));
    res.append('Set-Cookie', `${COOKIE}=; Max-Age=0; ${cookieAttrs(req)}`);
    res.json({ success: true, message: 'Logout successful' });
  } catch (error) {
    console.error('Logout error:', error?.message);
    res.status(500).json({ error: 'Failed to logout' });
  }
};

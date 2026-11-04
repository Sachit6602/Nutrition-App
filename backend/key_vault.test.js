import { test, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import { encryptSecret, decryptSecret, vaultConfigured } from './key_vault.js';
import { detectProvider, toAnthropic, verifyKey } from './ai_client.js';

const KEY_B64 = crypto.randomBytes(32).toString('base64');
const SECRET = 'sk-or-v1-0123456789abcdef0123456789abcdef';
const AAD = 'user:42';

beforeEach(() => {
  process.env.API_KEY_ENCRYPTION_KEY = KEY_B64;
});

// Flip one byte of a base64url segment.
const flip = (blob, part) => {
  const parts = blob.split('.');
  const buf = Buffer.from(parts[part], 'base64url');
  buf[0] ^= 0x01;
  parts[part] = buf.toString('base64url');
  return parts.join('.');
};

test('round trip', () => {
  const blob = encryptSecret(SECRET, AAD);
  assert.match(blob, /^v1\.[\w-]+\.[\w-]+\.[\w-]+$/);
  assert.ok(!blob.includes(SECRET));
  assert.equal(decryptSecret(blob, AAD), SECRET);
});

test('hex master key works too', () => {
  process.env.API_KEY_ENCRYPTION_KEY = crypto.randomBytes(32).toString('hex');
  assert.equal(vaultConfigured(), true);
  assert.equal(decryptSecret(encryptSecret(SECRET, AAD), AAD), SECRET);
});

test('two encryptions of the same plaintext differ', () => {
  assert.notEqual(encryptSecret(SECRET, AAD), encryptSecret(SECRET, AAD));
});

test('tampered ciphertext, tag or iv throws', () => {
  const blob = encryptSecret(SECRET, AAD);
  assert.throws(() => decryptSecret(flip(blob, 3), AAD));
  assert.throws(() => decryptSecret(flip(blob, 2), AAD));
  assert.throws(() => decryptSecret(flip(blob, 1), AAD));
});

test('wrong AAD throws (ciphertext cannot move to another user)', () => {
  const blob = encryptSecret(SECRET, AAD);
  assert.throws(() => decryptSecret(blob, 'user:43'));
});

test('unknown version or garbage throws', () => {
  const blob = encryptSecret(SECRET, AAD);
  assert.throws(() => decryptSecret(blob.replace(/^v1/, 'v2'), AAD));
  assert.throws(() => decryptSecret('not-a-blob', AAD));
  assert.throws(() => decryptSecret(null, AAD));
});

test('different master key cannot decrypt', () => {
  const blob = encryptSecret(SECRET, AAD);
  process.env.API_KEY_ENCRYPTION_KEY = crypto.randomBytes(32).toString('base64');
  assert.throws(() => decryptSecret(blob, AAD));
});

test('unconfigured or wrong-size master key reports false', () => {
  for (const v of [undefined, '', 'short', crypto.randomBytes(16).toString('base64'), crypto.randomBytes(31).toString('hex')]) {
    if (v === undefined) delete process.env.API_KEY_ENCRYPTION_KEY;
    else process.env.API_KEY_ENCRYPTION_KEY = v;
    assert.equal(vaultConfigured(), false, `expected unconfigured for ${JSON.stringify(v)}`);
    assert.throws(() => encryptSecret(SECRET, AAD));
  }
});

test('verifyKey maps responses per provider (fake fetch, no network)', async () => {
  const fake = (expectUrl, status) => async (url, init) => {
    assert.equal(url, expectUrl);
    assert.equal(init.headers.Authorization, `Bearer ${SECRET}`);
    assert.ok(init.signal);
    return { ok: status >= 200 && status < 300, status };
  };
  const OR = 'https://openrouter.ai/api/v1/key';
  assert.equal(await verifyKey('openrouter', SECRET, fake(OR, 200)), 'valid');
  assert.equal(await verifyKey('openrouter', SECRET, fake(OR, 401)), 'invalid');
  assert.equal(await verifyKey('openrouter', SECRET, fake(OR, 403)), 'invalid');
  assert.equal(await verifyKey('openrouter', SECRET, fake(OR, 503)), 'unverified');
  assert.equal(await verifyKey('openrouter', SECRET, async () => { throw new Error('offline'); }), 'unverified');
  // xAI answers a bad key with 400; for OpenAI a 400 is not proof of a bad key.
  assert.equal(await verifyKey('xai', SECRET, fake('https://api.x.ai/v1/models', 400)), 'invalid');
  assert.equal(await verifyKey('openai', SECRET, fake('https://api.openai.com/v1/models', 400)), 'unverified');
  assert.equal(await verifyKey('nope', SECRET, fake(OR, 200)), 'invalid');
});

test('detectProvider reads key prefixes, and stays quiet when ambiguous', () => {
  assert.equal(detectProvider('sk-or-v1-abc'), 'openrouter');
  assert.equal(detectProvider('sk-ant-api03-abc'), 'anthropic');
  assert.equal(detectProvider('sk-proj-abc'), 'openai');
  assert.equal(detectProvider('AIzaSyabc'), 'google');
  assert.equal(detectProvider('gsk_abc'), 'groq');
  assert.equal(detectProvider('pplx-abc'), 'perplexity');
  assert.equal(detectProvider('xai-abc'), 'xai');
  assert.equal(detectProvider('sk-0123456789abcdef'), null); // OpenAI legacy or DeepSeek: user picks
  assert.equal(detectProvider('abcDEF0123456789'), null); // Mistral: user picks
});

test('toAnthropic moves system to the top and turns data URLs into base64 image blocks', () => {
  const { system, messages } = toAnthropic([
    { role: 'system', content: 'Be brief.' },
    { role: 'user', content: [{ type: 'text', text: 'What is this?' }, { type: 'image_url', image_url: { url: 'data:image/jpeg;base64,QUJD' } }] },
    { role: 'assistant', content: 'A plate.' },
  ]);
  assert.equal(system, 'Be brief.');
  assert.deepEqual(messages[0].content[1], { type: 'image', source: { type: 'base64', media_type: 'image/jpeg', data: 'QUJD' } });
  assert.deepEqual(messages[1], { role: 'assistant', content: 'A plate.' });
});

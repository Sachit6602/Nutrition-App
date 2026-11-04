import { test } from 'node:test';
import assert from 'node:assert/strict';
import { hashPassword, verifyPassword } from './password.js';

test('hash round-trips, rejects the wrong password, and salts every hash', async () => {
  process.env.PBKDF2_ITERATIONS = '1000'; // keep the test fast; the format stores the count
  const a = await hashPassword('correct horse');
  assert.match(a, /^pbkdf2\$1000\$[\w-]+\$[\w-]+$/);
  assert.equal(await verifyPassword('correct horse', a), true);
  assert.equal(await verifyPassword('correct horsf', a), false);
  assert.notEqual(await hashPassword('correct horse'), a);
});

test('iterations are capped at the Workers PBKDF2 limit, and junk hashes never verify', async () => {
  process.env.PBKDF2_ITERATIONS = '600000';
  assert.match(await hashPassword('x'), /^pbkdf2\$100000\$/);
  for (const bad of [null, '', 'bcrypt$2b$10$abc', 'pbkdf2$1000$salt']) assert.equal(await verifyPassword('x', bad), false);
  assert.equal(await verifyPassword('', await hashPassword('x')), false);
});

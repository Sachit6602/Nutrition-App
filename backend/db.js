// Data access on Cloudflare D1 (SQLite). The binding is `DB` in wrangler.jsonc; the schema lives in migrations/.
// Queries use D1's numbered parameters (?1, ?2, ...).
import { env } from 'cloudflare:workers';

const db = () => {
  if (!env.DB) throw new Error('D1 binding "DB" is missing. Check d1_databases in wrangler.jsonc.');
  return env.DB;
};
const q = (sql, ...params) => db().prepare(sql).bind(...params);
const rows = async (sql, ...params) => (await q(sql, ...params).all()).results;
const one = (sql, ...params) => q(sql, ...params).first();
const run = async (sql, ...params) => (await q(sql, ...params).run()).meta;

// Input checks shared by every writer, so a bad value is a clear 400 (server.js serverError) rather than a
// D1 constraint error. Mirrors the CHECK constraints in migrations/0001_init.sql.
export class BadInput extends Error {}
const ENUMS = {
  goal: ['gain', 'lose', 'maintain'], sex: ['male', 'female'], activity_level: ['low', 'medium', 'high'],
  source_type: ['generated_recipe', 'saved_food', 'manual'],
};
const NUMBERS = new Set([
  'target_calories', 'height_cm', 'weight_kg', 'age', 'intensity_percent', 'calories', 'protein_g', 'carbs_g',
  'fat_g', 'servings', 'default_servings', 'steps', 'active_minutes', 'calories_burned',
]);
const check = (fields) => {
  for (const [k, v] of Object.entries(fields)) {
    if (v == null || k.endsWith('_json')) continue;
    if (ENUMS[k] && !ENUMS[k].includes(v)) throw new BadInput(`${k} must be one of: ${ENUMS[k].join(', ')}`);
    if (NUMBERS.has(k) && !Number.isFinite(Number(v))) throw new BadInput(`${k} must be a number`);
    if (!NUMBERS.has(k) && typeof v === 'object') throw new BadInput(`${k} must be text`);
  }
};

// ---------- Users ----------
// Only the columns login needs. Never SELECT * on users: it holds password_hash and the encrypted key.
export const getUserByEmail = (email) => one('SELECT id, email, password_hash FROM users WHERE email = ?1', email);

export const getUserById = (id) => one('SELECT id, email, created_at FROM users WHERE id = ?1', id);

// User and empty profile in one atomic batch.
export const createUser = async (email, passwordHash) => {
  const [userRes] = await db().batch([
    q('INSERT INTO users (email, password_hash) VALUES (?1, ?2) RETURNING id', email, passwordHash),
    q('INSERT INTO user_profiles (user_id) SELECT id FROM users WHERE email = ?1', email),
  ]);
  return { id: userRes.results[0].id, email };
};

// ---------- Sessions (cookie token -> user) ----------
const now = () => Math.floor(Date.now() / 1000);

export const createSession = async (tokenHash, userId, ttlSeconds) => {
  // Opportunistic cleanup keeps the table small without a cron job.
  await db().batch([
    q('DELETE FROM sessions WHERE expires_at < ?1', now()),
    q('INSERT INTO sessions (token_hash, user_id, expires_at) VALUES (?1, ?2, ?3)', tokenHash, userId, now() + ttlSeconds),
  ]);
};

export const getSessionUser = (tokenHash) => one(
  `SELECT u.id, u.email, u.created_at FROM sessions s JOIN users u ON u.id = s.user_id
   WHERE s.token_hash = ?1 AND s.expires_at > ?2`,
  tokenHash, now(),
);

export const deleteSession = (tokenHash) => run('DELETE FROM sessions WHERE token_hash = ?1', tokenHash);

// ---------- AI provider key ----------
export const getUserApiKeyRecord = (userId) => one(
  `SELECT openrouter_key_enc AS enc, openrouter_key_last4 AS last4, openrouter_key_updated_at AS updated_at,
          COALESCE(api_key_provider, 'openrouter') AS provider
   FROM users WHERE id = ?1`,
  userId,
);

export const setUserApiKey = (userId, enc, last4, provider) => one(
  `UPDATE users SET openrouter_key_enc = ?2, openrouter_key_last4 = ?3, openrouter_key_updated_at = CURRENT_TIMESTAMP, api_key_provider = ?4
   WHERE id = ?1
   RETURNING openrouter_key_enc AS enc, openrouter_key_last4 AS last4, openrouter_key_updated_at AS updated_at, api_key_provider AS provider`,
  userId, enc, last4, provider,
);

export const clearUserApiKey = (userId) => run(
  `UPDATE users SET openrouter_key_enc = NULL, openrouter_key_last4 = NULL, openrouter_key_updated_at = NULL, api_key_provider = NULL
   WHERE id = ?1`,
  userId,
);

// ---------- Profile ----------
export const getProfile = async (userId) => {
  const profile = await one('SELECT * FROM user_profiles WHERE user_id = ?1', userId);
  if (!profile) return null;
  return {
    ...profile,
    allergies: JSON.parse(profile.allergies_json || '[]'),
    preferences: JSON.parse(profile.preferences_json || '{}'),
  };
};

const PROFILE_FIELDS = [
  'goal', 'target_calories', 'height_cm', 'weight_kg', 'age', 'sex',
  'activity_level', 'intensity_percent', 'allergies_json', 'diet_type', 'preferences_json',
];

export const updateProfile = async (userId, data) => {
  const entries = Object.entries(data).filter(([key]) => PROFILE_FIELDS.includes(key));
  if (entries.length === 0) return getProfile(userId);
  check(Object.fromEntries(entries));
  const sets = entries.map(([key], i) => `${key} = ?${i + 1}`);
  const values = entries.map(([key, value]) => (key.endsWith('_json') ? JSON.stringify(value) : value ?? null));
  await run(`UPDATE user_profiles SET ${sets.join(', ')} WHERE user_id = ?${entries.length + 1}`, ...values, userId);
  return getProfile(userId);
};

// ---------- Intake ----------
export const addIntake = async (userId, { date, source_type, item_name, calories, protein_g, carbs_g, fat_g, servings, image_url }) => {
  check({ date, source_type, item_name, calories, protein_g, carbs_g, fat_g, servings, image_url });
  const row = await one(
    `INSERT INTO daily_intake_logs (user_id, date, source_type, item_name, calories, protein_g, carbs_g, fat_g, servings, image_url)
     VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10) RETURNING id`,
    userId, date, source_type ?? 'manual', item_name, calories, protein_g ?? null, carbs_g ?? null, fat_g ?? null, servings || 1, image_url || null,
  );
  return { id: row.id };
};

export const getIntakeByDate = (userId, date) =>
  rows('SELECT * FROM daily_intake_logs WHERE user_id = ?1 AND date = ?2 ORDER BY created_at DESC, id DESC', userId, date);

export const getIntakeTotalsByDate = (userId, date) => one(
  `SELECT COALESCE(SUM(calories), 0) AS calories_total,
          COALESCE(SUM(protein_g), 0) AS protein_total,
          COALESCE(SUM(carbs_g), 0) AS carbs_total,
          COALESCE(SUM(fat_g), 0) AS fat_total
   FROM daily_intake_logs WHERE user_id = ?1 AND date = ?2`,
  userId, date,
);

export const getFrequentIntake = (userId, limit = 20) => rows(
  `SELECT item_name, source_type, COUNT(*) AS count, AVG(calories) AS avg_calories,
          AVG(COALESCE(protein_g, 0)) AS avg_protein, AVG(COALESCE(carbs_g, 0)) AS avg_carbs, AVG(COALESCE(fat_g, 0)) AS avg_fat
   FROM daily_intake_logs WHERE user_id = ?1
   GROUP BY item_name, source_type
   ORDER BY count DESC
   LIMIT ?2`,
  userId, limit,
);

export const getIntakeCalendarTotals = (userId, monthPrefix) => rows(
  `SELECT date,
          COALESCE(SUM(calories), 0) AS calories_total,
          COALESCE(SUM(protein_g), 0) AS protein_total,
          COALESCE(SUM(carbs_g), 0) AS carbs_total,
          COALESCE(SUM(fat_g), 0) AS fat_total
   FROM daily_intake_logs WHERE user_id = ?1 AND date LIKE ?2
   GROUP BY date ORDER BY date ASC`,
  userId, `${monthPrefix}%`,
);

const INTAKE_FIELDS = ['item_name', 'calories', 'protein_g', 'carbs_g', 'fat_g', 'servings', 'source_type', 'date', 'image_url'];

export const updateIntake = async (userId, intakeId, fields) => {
  const entries = Object.entries(fields).filter(([key]) => INTAKE_FIELDS.includes(key));
  if (entries.length === 0) return { changes: 0 };
  check(Object.fromEntries(entries));
  const n = entries.length;
  const sets = entries.map(([key], i) => `${key} = ?${i + 1}`);
  const meta = await run(
    `UPDATE daily_intake_logs SET ${sets.join(', ')} WHERE id = ?${n + 1} AND user_id = ?${n + 2}`,
    ...entries.map(([, v]) => v ?? null), intakeId, userId,
  );
  return { changes: meta.changes };
};

export const deleteIntake = async (userId, intakeId) =>
  ({ changes: (await run('DELETE FROM daily_intake_logs WHERE id = ?1 AND user_id = ?2', intakeId, userId)).changes });

// ---------- Activity ----------
export const addActivity = async (userId, { date, steps = 0, active_minutes = null, calories_burned = 0 }) => {
  check({ date, steps, active_minutes, calories_burned });
  const row = await one(
    `INSERT INTO daily_activity_logs (user_id, date, steps, active_minutes, calories_burned)
     VALUES (?1, ?2, ?3, ?4, ?5)
     ON CONFLICT (user_id, date) DO UPDATE SET
       steps = excluded.steps, active_minutes = excluded.active_minutes, calories_burned = excluded.calories_burned
     RETURNING id`,
    userId, date, steps, active_minutes, calories_burned,
  );
  return { id: row.id };
};

export const getActivityByDate = async (userId, date) =>
  (await one('SELECT * FROM daily_activity_logs WHERE user_id = ?1 AND date = ?2', userId, date))
  || { steps: 0, active_minutes: 0, calories_burned: 0 };

export const getActivityCalendarTotals = (userId, monthPrefix) => rows(
  `SELECT date, COALESCE(SUM(calories_burned), 0) AS calories_burned_total
   FROM daily_activity_logs WHERE user_id = ?1 AND date LIKE ?2
   GROUP BY date ORDER BY date ASC`,
  userId, `${monthPrefix}%`,
);

// Per-day totals for a date range in one query each (D1's free plan allows 50 queries per request,
// so a 90-day view can't afford one query per day).
export const getIntakeTotalsRange = (userId, from, to) => rows(
  `SELECT date,
          COALESCE(SUM(calories), 0) AS calories_total,
          COALESCE(SUM(protein_g), 0) AS protein_total,
          COALESCE(SUM(carbs_g), 0) AS carbs_total,
          COALESCE(SUM(fat_g), 0) AS fat_total
   FROM daily_intake_logs WHERE user_id = ?1 AND date BETWEEN ?2 AND ?3
   GROUP BY date`,
  userId, from, to,
);

export const getActivityRange = (userId, from, to) =>
  rows('SELECT * FROM daily_activity_logs WHERE user_id = ?1 AND date BETWEEN ?2 AND ?3', userId, from, to);

// ---------- Saved foods ----------
export const addSavedFood = async (userId, { name, calories, protein_g, carbs_g, fat_g, default_servings }) => {
  check({ name, calories, protein_g, carbs_g, fat_g, default_servings });
  const row = await one(
    `INSERT INTO saved_foods (user_id, name, calories, protein_g, carbs_g, fat_g, default_servings)
     VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7) RETURNING id`,
    userId, name, calories, protein_g ?? null, carbs_g ?? null, fat_g ?? null, default_servings || 1,
  );
  return { id: row.id };
};

export const getSavedFoods = (userId) => rows('SELECT * FROM saved_foods WHERE user_id = ?1 ORDER BY name ASC', userId);

export const deleteSavedFood = async (userId, id) =>
  ({ changes: (await run('DELETE FROM saved_foods WHERE id = ?1 AND user_id = ?2', id, userId)).changes });

// ---------- Coach debug data ----------
export const getSessionData = (userId) => one('SELECT * FROM user_session_data WHERE user_id = ?1', userId);

export const updateSessionData = (userId, requestJson, responseJson) => run(
  `INSERT INTO user_session_data (user_id, last_request_json, last_response_json, updated_at)
   VALUES (?1, ?2, ?3, CURRENT_TIMESTAMP)
   ON CONFLICT (user_id) DO UPDATE SET
     last_request_json = excluded.last_request_json,
     last_response_json = excluded.last_response_json,
     updated_at = CURRENT_TIMESTAMP`,
  userId, requestJson, responseJson,
);

import { Pool } from 'pg';
import { config } from 'dotenv';
config();

// Initialize PostgreSQL connection
const pool = new Pool({
  user: process.env.DB_USER,
  host: process.env.DB_HOST,
  database: process.env.DB_NAME,
  password: process.env.DB_PASSWORD,
  port: process.env.DB_PORT,
});

// Example function to test database connection
export const testConnection = async () => {
  try {
    const res = await pool.query('SELECT NOW()');
    console.log('Database connected:', res.rows[0]);
  } catch (err) {
    console.error('Database connection error:', err);
  }
};

// Replace SQLite-specific functions with PostgreSQL queries
export const getUserByEmail = async (email) => {
  const res = await pool.query('SELECT * FROM users WHERE email = $1', [email]);
  return res.rows[0];
};

export const getUserById = async (id) => {
  const res = await pool.query('SELECT id, email, created_at FROM users WHERE id = $1', [id]);
  return res.rows[0];
};

export const createUser = async (email, passwordHash) => {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const userRes = await client.query(
      'INSERT INTO users (email, password_hash) VALUES ($1, $2) RETURNING id',
      [email, passwordHash]
    );
    const userId = userRes.rows[0].id;
    await client.query('INSERT INTO user_profiles (user_id) VALUES ($1)', [userId]);
    await client.query('COMMIT');
    return { id: userId, email };
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
};

export const getProfile = async (userId) => {
  const res = await pool.query('SELECT * FROM user_profiles WHERE user_id = $1', [userId]);
  const profile = res.rows[0];
  if (!profile) return null;
  return {
    ...profile,
    allergies: JSON.parse(profile.allergies_json || '[]'),
    preferences: JSON.parse(profile.preferences_json || '{}'),
  };
};

export const updateProfile = async (userId, data) => {
  const allowedFields = [
    'goal', 'target_calories', 'height_cm', 'weight_kg', 'age', 'sex',
    'activity_level', 'intensity_percent', 'allergies_json', 'diet_type', 'preferences_json'
  ];
  const updates = [];
  const values = [];
  let index = 1;

  for (const [key, value] of Object.entries(data)) {
    if (!allowedFields.includes(key)) continue;
    updates.push(`${key} = $${index}`);
    values.push(
      key === 'allergies_json' || key === 'preferences_json'
        ? JSON.stringify(value)
        : value
    );
    index++;
  }

  if (updates.length === 0) return getProfile(userId);

  values.push(userId);
  const sql = `UPDATE user_profiles SET ${updates.join(', ')} WHERE user_id = $${index}`;
  await pool.query(sql, values);
  return getProfile(userId);
};

export const addIntake = async (userId, { date, source_type, item_name, calories, protein_g, carbs_g, fat_g, servings, image_url }) => {
  const res = await pool.query(
    `INSERT INTO daily_intake_logs (user_id, date, source_type, item_name, calories, protein_g, carbs_g, fat_g, servings, image_url)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10) RETURNING id`,
    [userId, date, source_type, item_name, calories, protein_g, carbs_g, fat_g, servings || 1, image_url || null]
  );
  return { id: res.rows[0].id };
};

export const getIntakeByDate = async (userId, date) => {
  const res = await pool.query(
    'SELECT * FROM daily_intake_logs WHERE user_id = $1 AND date = $2 ORDER BY created_at DESC',
    [userId, date]
  );
  return res.rows;
};

export const getIntakeTotalsByDate = async (userId, date) => {
  const res = await pool.query(
    `SELECT
       COALESCE(SUM(calories), 0) AS calories_total,
       COALESCE(SUM(protein_g), 0) AS protein_total,
       COALESCE(SUM(carbs_g), 0) AS carbs_total,
       COALESCE(SUM(fat_g), 0) AS fat_total
     FROM daily_intake_logs
     WHERE user_id = $1 AND date = $2`,
    [userId, date]
  );
  return res.rows[0];
};

export const addActivity = async (userId, { date, steps = 0, active_minutes = null, calories_burned = 0 }) => {
  const res = await pool.query(
    `INSERT INTO daily_activity_logs (user_id, date, steps, active_minutes, calories_burned)
     VALUES ($1, $2, $3, $4, $5)
     ON CONFLICT (user_id, date) DO UPDATE SET
       steps = EXCLUDED.steps,
       active_minutes = EXCLUDED.active_minutes,
       calories_burned = EXCLUDED.calories_burned
     RETURNING id`,
    [userId, date, steps, active_minutes, calories_burned]
  );
  return { id: res.rows[0].id };
};

export const getActivityByDate = async (userId, date) => {
  const res = await pool.query(
    'SELECT * FROM daily_activity_logs WHERE user_id = $1 AND date = $2',
    [userId, date]
  );
  return res.rows[0] || { steps: 0, active_minutes: 0, calories_burned: 0 };
};

export const getFrequentIntake = async (userId, limit = 20) => {
  const res = await pool.query(
    `SELECT item_name, source_type, COUNT(*) AS count, AVG(calories) AS avg_calories,
            AVG(COALESCE(protein_g, 0)) AS avg_protein, AVG(COALESCE(carbs_g, 0)) AS avg_carbs, AVG(COALESCE(fat_g, 0)) AS avg_fat
     FROM daily_intake_logs
     WHERE user_id = $1
     GROUP BY item_name, source_type
     ORDER BY count DESC
     LIMIT $2`,
    [userId, limit]
  );
  return res.rows;
};

export const addSavedFood = async (userId, { name, calories, protein_g, carbs_g, fat_g, default_servings }) => {
  const res = await pool.query(
    `INSERT INTO saved_foods (user_id, name, calories, protein_g, carbs_g, fat_g, default_servings)
     VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING id`,
    [userId, name, calories, protein_g, carbs_g, fat_g, default_servings || 1]
  );
  return { id: res.rows[0].id };
};

export const getIntakeCalendarTotals = async (userId, monthPrefix) => {
  const res = await pool.query(
    `SELECT date,
            COALESCE(SUM(calories), 0) AS calories_total,
            COALESCE(SUM(protein_g), 0) AS protein_total,
            COALESCE(SUM(carbs_g), 0) AS carbs_total,
            COALESCE(SUM(fat_g), 0) AS fat_total
     FROM daily_intake_logs
     WHERE user_id = $1 AND date LIKE $2
     GROUP BY date
     ORDER BY date ASC`,
    [userId, `${monthPrefix}%`]
  );
  return res.rows;
};

export const getActivityCalendarTotals = async (userId, monthPrefix) => {
  const res = await pool.query(
    `SELECT date,
            COALESCE(SUM(calories_burned), 0) AS calories_burned_total
     FROM daily_activity_logs
     WHERE user_id = $1 AND date LIKE $2
     GROUP BY date
     ORDER BY date ASC`,
    [userId, `${monthPrefix}%`]
  );
  return res.rows;
};

export const updateIntake = async (userId, intakeId, fields) => {
  const allowed = ['item_name', 'calories', 'protein_g', 'carbs_g', 'fat_g', 'servings', 'source_type', 'date', 'image_url'];
  const updates = [];
  const values = [];
  let index = 1;

  for (const [key, value] of Object.entries(fields)) {
    if (!allowed.includes(key)) continue;
    updates.push(`${key} = $${index}`);
    values.push(value);
    index++;
  }

  if (updates.length === 0) return { changes: 0 };

  values.push(intakeId, userId);
  const sql = `UPDATE daily_intake_logs SET ${updates.join(', ')} WHERE id = $${index} AND user_id = $${index + 1}`;
  const res = await pool.query(sql, values);
  return { changes: res.rowCount };
};

export const deleteIntake = async (userId, intakeId) => {
  const res = await pool.query(
    'DELETE FROM daily_intake_logs WHERE id = $1 AND user_id = $2',
    [intakeId, userId]
  );
  return { changes: res.rowCount };
};

export const getSavedFoods = async (userId) => {
  const res = await pool.query(
    'SELECT * FROM saved_foods WHERE user_id = $1 ORDER BY name ASC',
    [userId]
  );
  return res.rows;
};

export const deleteSavedFood = async (userId, id) => {
  const res = await pool.query(
    'DELETE FROM saved_foods WHERE id = $1 AND user_id = $2',
    [id, userId]
  );
  return { changes: res.rowCount };
};

export const getSessionData = async (userId) => {
  const res = await pool.query(
    'SELECT * FROM user_session_data WHERE user_id = $1',
    [userId]
  );
  return res.rows[0];
};

export const updateSessionData = async (userId, requestJson, responseJson) => {
  await pool.query(
    `INSERT INTO user_session_data (user_id, last_request_json, last_response_json, updated_at)
     VALUES ($1, $2, $3, CURRENT_TIMESTAMP)
     ON CONFLICT (user_id) DO UPDATE SET
       last_request_json = EXCLUDED.last_request_json,
       last_response_json = EXCLUDED.last_response_json,
       updated_at = CURRENT_TIMESTAMP`,
    [userId, requestJson, responseJson]
  );
};

export default pool;

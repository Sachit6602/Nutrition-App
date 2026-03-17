import Database from 'better-sqlite3';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { readFileSync } from 'fs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Initialize database connection
const dbPath = join(__dirname, 'app.db');
const db = new Database(dbPath);

// Enable foreign keys
db.pragma('foreign_keys = ON');

// Initialize database schema if tables don't exist
function initializeDatabase() {
  try {
    const schemaPath = join(__dirname, 'schema.sql');
    const schema = readFileSync(schemaPath, 'utf8');

    // Execute schema (better-sqlite3 executes statements sequentially)
    db.exec(schema);
    migrateSchema();
    console.log('✅ Database initialized successfully');
  } catch (error) {
    // If schema file doesn't exist or error, create tables manually
    console.log('⚠️  Schema file not found, creating tables manually...');
    createTables();
    migrateSchema();
  }
}

// Add new columns to existing user_profiles (idempotent)
function migrateSchema() {
  const columns = [
    { name: 'age', def: 'INTEGER' },
    { name: 'sex', def: "TEXT CHECK(sex IN ('male', 'female'))" },
    { name: 'intensity_percent', def: 'INTEGER DEFAULT 0' },
  ];
  for (const { name, def } of columns) {
    try {
      db.exec(`ALTER TABLE user_profiles ADD COLUMN ${name} ${def}`);
      console.log(`✅ Added column user_profiles.${name}`);
    } catch (e) {
      if (!/duplicate column name/i.test(e.message)) throw e;
    }
  }
  // Add image_url to intake logs if missing
  try {
    db.exec(`ALTER TABLE daily_intake_logs ADD COLUMN image_url TEXT`);
    console.log('✅ Added column daily_intake_logs.image_url');
  } catch (e) {
    if (!/duplicate column name/i.test(e.message)) {
      // ignore if table doesn't exist yet or other errors
    }
  }
}

function createTables() {
  // Users table
  db.exec(`
    CREATE TABLE IF NOT EXISTS users (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      email TEXT UNIQUE NOT NULL,
      password_hash TEXT NOT NULL,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );
  `);

  // User profiles table
  db.exec(`
    CREATE TABLE IF NOT EXISTS user_profiles (
      user_id INTEGER PRIMARY KEY,
      goal TEXT CHECK(goal IN ('gain', 'lose', 'maintain')),
      target_calories INTEGER,
      height_cm INTEGER,
      weight_kg REAL,
      age INTEGER,
      sex TEXT CHECK(sex IN ('male', 'female')),
      activity_level TEXT CHECK(activity_level IN ('low', 'medium', 'high')),
      intensity_percent INTEGER DEFAULT 0,
      allergies_json TEXT DEFAULT '[]',
      diet_type TEXT DEFAULT 'none',
      preferences_json TEXT DEFAULT '{}',
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
    );
  `);

  // User session data table
  db.exec(`
    CREATE TABLE IF NOT EXISTS user_session_data (
      user_id INTEGER PRIMARY KEY,
      last_request_json TEXT,
      last_response_json TEXT,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
    );
  `);

  // Daily intake logs table
  db.exec(`
    CREATE TABLE IF NOT EXISTS daily_intake_logs (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER NOT NULL,
      date TEXT NOT NULL,
      source_type TEXT CHECK(source_type IN ('generated_recipe','saved_food','manual')) DEFAULT 'manual',
      item_name TEXT NOT NULL,
      calories REAL NOT NULL,
      protein_g REAL,
      carbs_g REAL,
      fat_g REAL,
      servings REAL DEFAULT 1,
      image_url TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
    );
  `);

  // Daily activity logs table
  db.exec(`
    CREATE TABLE IF NOT EXISTS daily_activity_logs (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER NOT NULL,
      date TEXT NOT NULL,
      steps INTEGER DEFAULT 0,
      active_minutes INTEGER,
      calories_burned REAL DEFAULT 0,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
    );
  `);

  // Saved foods table (predefined user foods)
  db.exec(`
    CREATE TABLE IF NOT EXISTS saved_foods (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER NOT NULL,
      name TEXT NOT NULL,
      calories REAL NOT NULL,
      protein_g REAL,
      carbs_g REAL,
      fat_g REAL,
      default_servings REAL DEFAULT 1,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
    );
  `);

  // Create indexes
  db.exec(`
    CREATE INDEX IF NOT EXISTS idx_users_email ON users(email);
    CREATE INDEX IF NOT EXISTS idx_user_profiles_user_id ON user_profiles(user_id);
    CREATE INDEX IF NOT EXISTS idx_saved_foods_user ON saved_foods(user_id);
    -- Ensure one activity row per user/date for upsert behavior
    CREATE UNIQUE INDEX IF NOT EXISTS idx_daily_activity_user_date_unique ON daily_activity_logs(user_id, date);
  `);

  // Create indexes
  db.exec(`
    CREATE INDEX IF NOT EXISTS idx_users_email ON users(email);
    CREATE INDEX IF NOT EXISTS idx_user_profiles_user_id ON user_profiles(user_id);
  `);
}

// Initialize on module load
initializeDatabase();

// User functions
export const getUserByEmail = (email) => {
  const stmt = db.prepare('SELECT * FROM users WHERE email = ?');
  return stmt.get(email);
};

export const getUserById = (id) => {
  const stmt = db.prepare('SELECT id, email, created_at FROM users WHERE id = ?');
  return stmt.get(id);
};

export const createUser = (email, passwordHash) => {
  const insertUser = db.prepare('INSERT INTO users (email, password_hash) VALUES (?, ?)');
  const insertProfile = db.prepare('INSERT INTO user_profiles (user_id) VALUES (?)');
  
  const transaction = db.transaction((email, passwordHash) => {
    const result = insertUser.run(email, passwordHash);
    const userId = result.lastInsertRowid;
    insertProfile.run(userId);
    return { id: userId, email };
  });
  
  return transaction(email, passwordHash);
};

// Profile functions
export const getProfile = (userId) => {
  const stmt = db.prepare('SELECT * FROM user_profiles WHERE user_id = ?');
  const profile = stmt.get(userId);
  
  if (!profile) return null;
  
  // Parse JSON fields
  return {
    ...profile,
    allergies: JSON.parse(profile.allergies_json || '[]'),
    preferences: JSON.parse(profile.preferences_json || '{}')
  };
};

export const updateProfile = (userId, data) => {
  const allowedFields = [
    'goal', 'target_calories', 'height_cm', 'weight_kg', 'age', 'sex',
    'activity_level', 'intensity_percent', 'allergies_json', 'diet_type', 'preferences_json'
  ];
  
  const updates = [];
  const values = [];
  
  for (const [key, value] of Object.entries(data)) {
    if (!allowedFields.includes(key)) continue;
    if (key === 'allergies_json') {
      updates.push('allergies_json = ?');
      values.push(Array.isArray(value) ? JSON.stringify(value) : value);
    } else if (key === 'preferences_json') {
      updates.push('preferences_json = ?');
      values.push(typeof value === 'object' && value !== null ? JSON.stringify(value) : value);
    } else {
      updates.push(`${key} = ?`);
      values.push(value);
    }
  }
  
  if (updates.length === 0) {
    return getProfile(userId);
  }
  
  values.push(userId);
  const sql = `UPDATE user_profiles SET ${updates.join(', ')} WHERE user_id = ?`;
  const stmt = db.prepare(sql);
  stmt.run(...values);
  
  return getProfile(userId);
};

// Session data functions
export const getSessionData = (userId) => {
  const stmt = db.prepare('SELECT * FROM user_session_data WHERE user_id = ?');
  return stmt.get(userId);
};

export const updateSessionData = (userId, requestJson, responseJson) => {
  const stmt = db.prepare(`
    INSERT INTO user_session_data (user_id, last_request_json, last_response_json, updated_at)
    VALUES (?, ?, ?, CURRENT_TIMESTAMP)
    ON CONFLICT(user_id) DO UPDATE SET
      last_request_json = ?,
      last_response_json = ?,
      updated_at = CURRENT_TIMESTAMP
  `);
  stmt.run(userId, requestJson, responseJson, requestJson, responseJson);
};

// -------------------- Intake & Activity helpers --------------------
export const addIntake = (userId, { date, source_type, item_name, calories, protein_g, carbs_g, fat_g, servings, image_url }) => {
  const stmt = db.prepare(`
    INSERT INTO daily_intake_logs (user_id, date, source_type, item_name, calories, protein_g, carbs_g, fat_g, servings, image_url)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);
  const result = stmt.run(userId, date, source_type, item_name, calories, protein_g, carbs_g, fat_g, servings || 1, image_url || null);
  return { id: result.lastInsertRowid };
};

export const getIntakeByDate = (userId, date) => {
  const stmt = db.prepare(`SELECT * FROM daily_intake_logs WHERE user_id = ? AND date = ? ORDER BY created_at DESC`);
  const rows = stmt.all(userId, date);
  return rows;
};

export const getIntakeTotalsByDate = (userId, date) => {
  const stmt = db.prepare(`
    SELECT
      COALESCE(SUM(calories),0) AS calories_total,
      COALESCE(SUM(protein_g),0) AS protein_total,
      COALESCE(SUM(carbs_g),0) AS carbs_total,
      COALESCE(SUM(fat_g),0) AS fat_total
    FROM daily_intake_logs
    WHERE user_id = ? AND date = ?
  `);
  return stmt.get(userId, date);
};

export const getIntakeCalendarTotals = (userId, monthPrefix) => {
  // monthPrefix like '2026-01' - returns totals grouped by date
  const stmt = db.prepare(`
    SELECT date,
      COALESCE(SUM(calories),0) AS calories_total,
      COALESCE(SUM(protein_g),0) AS protein_total,
      COALESCE(SUM(carbs_g),0) AS carbs_total,
      COALESCE(SUM(fat_g),0) AS fat_total
    FROM daily_intake_logs
    WHERE user_id = ? AND date LIKE ?
    GROUP BY date
    ORDER BY date ASC
  `);
  return stmt.all(userId, `${monthPrefix}%`);
};

// Activity totals grouped by date for a month (monthPrefix like '2026-01')
export const getActivityCalendarTotals = (userId, monthPrefix) => {
  const stmt = db.prepare(`
    SELECT date,
      COALESCE(SUM(calories_burned),0) AS calories_burned_total
    FROM daily_activity_logs
    WHERE user_id = ? AND date LIKE ?
    GROUP BY date
    ORDER BY date ASC
  `);
  return stmt.all(userId, `${monthPrefix}%`);
};

export const getFrequentIntake = (userId, limit = 20) => {
  const stmt = db.prepare(`
    SELECT item_name, source_type, COUNT(*) AS count, AVG(calories) AS avg_calories,
      AVG(COALESCE(protein_g,0)) AS avg_protein, AVG(COALESCE(carbs_g,0)) AS avg_carbs, AVG(COALESCE(fat_g,0)) AS avg_fat
    FROM daily_intake_logs
    WHERE user_id = ?
    GROUP BY item_name
    ORDER BY count DESC
    LIMIT ?
  `);
  return stmt.all(userId, limit);
};

// Update an intake row (only if owned by user)
export const updateIntake = (userId, intakeId, fields) => {
  const allowed = ['item_name','calories','protein_g','carbs_g','fat_g','servings','source_type','date','image_url'];
  const updates = [];
  const values = [];
  for (const [k,v] of Object.entries(fields)) {
    if (!allowed.includes(k)) continue;
    updates.push(`${k} = ?`);
    values.push(v);
  }
  if (updates.length === 0) return { changes: 0 };
  values.push(intakeId, userId);
  const sql = `UPDATE daily_intake_logs SET ${updates.join(', ')} WHERE id = ? AND user_id = ?`;
  const stmt = db.prepare(sql);
  const result = stmt.run(...values);
  return { changes: result.changes };
};

export const deleteIntake = (userId, intakeId) => {
  const stmt = db.prepare('DELETE FROM daily_intake_logs WHERE id = ? AND user_id = ?');
  const result = stmt.run(intakeId, userId);
  return { changes: result.changes };
};

// Saved foods helpers
export const addSavedFood = (userId, { name, calories, protein_g, carbs_g, fat_g, default_servings }) => {
  const stmt = db.prepare(`INSERT INTO saved_foods (user_id, name, calories, protein_g, carbs_g, fat_g, default_servings) VALUES (?, ?, ?, ?, ?, ?, ?)`);
  const res = stmt.run(userId, name, calories, protein_g, carbs_g, fat_g, default_servings || 1);
  return { id: res.lastInsertRowid };
};

export const getSavedFoods = (userId) => {
  const stmt = db.prepare('SELECT * FROM saved_foods WHERE user_id = ? ORDER BY name ASC');
  return stmt.all(userId);
};

export const deleteSavedFood = (userId, id) => {
  const stmt = db.prepare('DELETE FROM saved_foods WHERE id = ? AND user_id = ?');
  const res = stmt.run(id, userId);
  return { changes: res.changes };
};

export const addActivity = (userId, { date, steps = 0, active_minutes = null, calories_burned = 0 }) => {
  const stmt = db.prepare(`
    INSERT INTO daily_activity_logs (user_id, date, steps, active_minutes, calories_burned)
    VALUES (?, ?, ?, ?, ?)
    ON CONFLICT(user_id, date) DO UPDATE SET
      steps = excluded.steps,
      active_minutes = excluded.active_minutes,
      calories_burned = excluded.calories_burned,
      created_at = CURRENT_TIMESTAMP
  `);
  stmt.run(userId, date, steps, active_minutes, calories_burned);
  return { success: true };
};

export const getActivityByDate = (userId, date) => {
  const stmt = db.prepare(`SELECT * FROM daily_activity_logs WHERE user_id = ? AND date = ?`);
  return stmt.get(userId, date) || { steps: 0, active_minutes: 0, calories_burned: 0 };
};

export default db;

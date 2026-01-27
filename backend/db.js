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

export default db;

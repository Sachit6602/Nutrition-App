-- D1 (SQLite) schema for the Nutrition App.
-- Apply locally:  npx wrangler d1 migrations apply nutrition-db --local
-- Apply remotely: npx wrangler d1 migrations apply nutrition-db --remote

CREATE TABLE IF NOT EXISTS users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    email TEXT UNIQUE NOT NULL COLLATE NOCASE,
    password_hash TEXT NOT NULL,           -- "pbkdf2$<iterations>$<salt b64url>$<hash b64url>" (see auth.js)
    created_at TEXT DEFAULT CURRENT_TIMESTAMP,
    -- Bring-your-own AI key: AES-256-GCM blob "v1.<iv>.<tag>.<ct>" (see key_vault.js).
    -- The openrouter_* names predate multi-provider support; api_key_provider names the provider (NULL = openrouter).
    openrouter_key_enc TEXT,
    openrouter_key_last4 TEXT,
    openrouter_key_updated_at TEXT,
    api_key_provider TEXT
);

-- Login sessions. The cookie holds a random token; only its SHA-256 is stored, so a leaked table can't be replayed.
CREATE TABLE IF NOT EXISTS sessions (
    token_hash TEXT PRIMARY KEY,
    user_id INTEGER NOT NULL,
    expires_at INTEGER NOT NULL,           -- unix seconds
    created_at TEXT DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS idx_sessions_user ON sessions(user_id);

CREATE TABLE IF NOT EXISTS user_profiles (
    user_id INTEGER PRIMARY KEY,
    goal TEXT CHECK(goal IN ('gain', 'lose', 'maintain')),
    target_calories INTEGER,
    height_cm INTEGER,
    weight_kg REAL,
    age INTEGER,
    sex TEXT CHECK(sex IN ('male', 'female')),
    activity_level TEXT CHECK(activity_level IN ('low', 'medium', 'high')),
    intensity_percent INTEGER DEFAULT 0,  -- deficit/surplus e.g. -20 (lose), +10 (gain)
    allergies_json TEXT DEFAULT '[]',     -- JSON array of strings
    diet_type TEXT DEFAULT 'none',
    preferences_json TEXT DEFAULT '{}',   -- JSON object: cuisine, cookingTime, mealType
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

-- Last coach request/response per user, kept for debugging.
CREATE TABLE IF NOT EXISTS user_session_data (
    user_id INTEGER PRIMARY KEY,
    last_request_json TEXT,
    last_response_json TEXT,
    updated_at TEXT DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS daily_intake_logs (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL,
    date TEXT NOT NULL,                    -- YYYY-MM-DD
    source_type TEXT CHECK(source_type IN ('generated_recipe', 'saved_food', 'manual')) DEFAULT 'manual',
    item_name TEXT NOT NULL,
    calories REAL NOT NULL,
    protein_g REAL,
    carbs_g REAL,
    fat_g REAL,
    servings REAL DEFAULT 1,
    image_url TEXT,
    created_at TEXT DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS idx_daily_intake_user_date ON daily_intake_logs(user_id, date);

CREATE TABLE IF NOT EXISTS daily_activity_logs (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL,
    date TEXT NOT NULL,                    -- YYYY-MM-DD
    steps INTEGER DEFAULT 0,
    active_minutes INTEGER,
    calories_burned REAL DEFAULT 0,
    created_at TEXT DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);
-- One activity row per user and day (the upsert in db.js relies on it).
CREATE UNIQUE INDEX IF NOT EXISTS idx_daily_activity_user_date_unique ON daily_activity_logs(user_id, date);

CREATE TABLE IF NOT EXISTS saved_foods (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL,
    name TEXT NOT NULL,
    calories REAL NOT NULL,
    protein_g REAL,
    carbs_g REAL,
    fat_g REAL,
    default_servings REAL DEFAULT 1,
    created_at TEXT DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS idx_saved_foods_user ON saved_foods(user_id);

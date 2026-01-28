-- SQLite schema for Nutrition App
-- Run this once to initialize the database

-- Users table: stores account credentials
CREATE TABLE IF NOT EXISTS users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    email TEXT UNIQUE NOT NULL,
    password_hash TEXT NOT NULL,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- User profiles table: stores user preferences and dietary information
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
    allergies_json TEXT DEFAULT '[]',  -- JSON array of strings
    diet_type TEXT DEFAULT 'none',  -- 'none', 'veg', 'vegan', 'keto', etc.
    preferences_json TEXT DEFAULT '{}',  -- JSON object for cuisine, cookingTime, mealType, etc.
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

-- User session data: stores last request/response for context
CREATE TABLE IF NOT EXISTS user_session_data (
    user_id INTEGER PRIMARY KEY,
    last_request_json TEXT,
    last_response_json TEXT,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

-- Create indexes for better query performance
CREATE INDEX IF NOT EXISTS idx_users_email ON users(email);
CREATE INDEX IF NOT EXISTS idx_user_profiles_user_id ON user_profiles(user_id);

-- Daily intake logs (v1)
CREATE TABLE IF NOT EXISTS daily_intake_logs (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL,
    date TEXT NOT NULL, -- YYYY-MM-DD
    source_type TEXT CHECK(source_type IN ('generated_recipe','saved_food','manual')) DEFAULT 'manual',
    item_name TEXT NOT NULL,
    calories REAL NOT NULL,
    protein_g REAL,
    carbs_g REAL,
    fat_g REAL,
    servings REAL DEFAULT 1,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

-- Daily activity logs (v1)
CREATE TABLE IF NOT EXISTS daily_activity_logs (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL,
    date TEXT NOT NULL, -- YYYY-MM-DD
    steps INTEGER DEFAULT 0,
    active_minutes INTEGER,
    calories_burned REAL DEFAULT 0,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_daily_intake_user_date ON daily_intake_logs(user_id, date);
CREATE INDEX IF NOT EXISTS idx_daily_activity_user_date ON daily_activity_logs(user_id, date);
-- Ensure one activity row per user and date (for upserts)
CREATE UNIQUE INDEX IF NOT EXISTS idx_daily_activity_user_date_unique ON daily_activity_logs(user_id, date);

-- Saved foods (predefined user foods)
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

CREATE INDEX IF NOT EXISTS idx_saved_foods_user ON saved_foods(user_id);

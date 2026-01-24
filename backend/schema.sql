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
    activity_level TEXT CHECK(activity_level IN ('low', 'medium', 'high')),
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

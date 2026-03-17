-- PostgreSQL schema for Nutrition App
-- Use this schema to initialize the database on Supabase or other PostgreSQL-compatible platforms

-- Users table: stores account credentials
CREATE TABLE IF NOT EXISTS users (
    id SERIAL PRIMARY KEY,
    email TEXT UNIQUE NOT NULL,
    password_hash TEXT NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
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
    allergies_json JSONB DEFAULT '[]',  -- JSON array of strings
    diet_type TEXT DEFAULT 'none',  -- 'none', 'veg', 'vegan', 'keto', etc.
    preferences_json JSONB DEFAULT '{}',  -- JSON object for cuisine, cookingTime, mealType, etc.
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

-- User session data: stores last request/response for context
CREATE TABLE IF NOT EXISTS user_session_data (
    user_id INTEGER PRIMARY KEY,
    last_request_json JSONB,
    last_response_json JSONB,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

-- Create indexes for better query performance
CREATE INDEX IF NOT EXISTS idx_users_email ON users(email);
CREATE INDEX IF NOT EXISTS idx_user_profiles_user_id ON user_profiles(user_id);

-- Daily intake logs (v1)
CREATE TABLE IF NOT EXISTS daily_intake_logs (
    id SERIAL PRIMARY KEY,
    user_id INTEGER NOT NULL,
    date DATE NOT NULL, -- YYYY-MM-DD
    source_type TEXT CHECK(source_type IN ('generated_recipe','saved_food','manual')) DEFAULT 'manual',
    item_name TEXT NOT NULL,
    calories REAL NOT NULL,
    protein_g REAL,
    carbs_g REAL,
    fat_g REAL,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

-- Create indexes for daily intake logs
CREATE INDEX IF NOT EXISTS idx_daily_intake_logs_user_id ON daily_intake_logs(user_id);
CREATE INDEX IF NOT EXISTS idx_daily_intake_logs_date ON daily_intake_logs(date);

-- Daily activity logs
CREATE TABLE IF NOT EXISTS daily_activity_logs (
    id SERIAL PRIMARY KEY,
    user_id INTEGER NOT NULL,
    date DATE NOT NULL, -- YYYY-MM-DD
    activity_type TEXT CHECK(activity_type IN ('exercise', 'steps', 'other')) NOT NULL,
    duration_minutes INTEGER DEFAULT 0, -- Duration of activity in minutes
    calories_burned REAL DEFAULT 0, -- Calories burned during the activity
    notes TEXT, -- Optional notes about the activity
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

-- Create indexes for daily activity logs
CREATE INDEX IF NOT EXISTS idx_daily_activity_logs_user_id ON daily_activity_logs(user_id);
CREATE INDEX IF NOT EXISTS idx_daily_activity_logs_date ON daily_activity_logs(date);

-- Saved foods table: stores user-saved food items for quick access
CREATE TABLE IF NOT EXISTS saved_foods (
    id SERIAL PRIMARY KEY,
    user_id INTEGER NOT NULL,
    name TEXT NOT NULL, -- Name of the food item
    calories REAL NOT NULL, -- Calories per serving
    protein_g REAL DEFAULT 0, -- Protein content per serving
    carbs_g REAL DEFAULT 0, -- Carbohydrate content per serving
    fat_g REAL DEFAULT 0, -- Fat content per serving
    serving_size TEXT, -- Description of serving size (e.g., "1 cup", "100g")
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP, -- When the food was saved
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

-- Create indexes for saved foods
CREATE INDEX IF NOT EXISTS idx_saved_foods_user_id ON saved_foods(user_id);
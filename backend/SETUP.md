# Database Setup Guide

## Installation

Since you already have SQLite3 installed at `C:\sqlite`, you just need to install the Node.js packages:

```bash
cd backend
npm install
```

This will install:
- `better-sqlite3` - SQLite database driver for Node.js
- `jsonwebtoken` - For JWT authentication tokens
- `bcrypt` - For password hashing

## Database Initialization

The database will be automatically created when you first run the server. The `db.js` module will:
1. Create `app.db` in the `backend` directory
2. Initialize all tables (users, user_profiles, user_session_data)
3. Create necessary indexes

You can also manually initialize the database using the schema file:

```bash
# Using your SQLite installation
C:\sqlite\sqlite3.exe backend\app.db < backend\schema.sql
```

Or just run the server - it will auto-initialize on first run.

## Environment Variables

Make sure your `.env` file includes:

```env
OPENROUTER_API_KEY=your-key-here
PORT=3001
SESSION_SECRET=your-session-secret-key-change-in-production
```

**Important**: Change `SESSION_SECRET` to a strong random string in production!

## API Endpoints

### Authentication
- `POST /auth/register` - Register new user
  ```json
  {
    "email": "user@example.com",
    "password": "password123"
  }
  ```

- `POST /auth/login` - Login user
  ```json
  {
    "email": "user@example.com",
    "password": "password123"
  }
  ```
  Returns: `{ success: true, user: {...}, message: "Login successful" }`
  Note: Session is automatically created and stored in cookies.

- `POST /auth/logout` - Logout user (clears session)

- `GET /auth/status` - Check if user is authenticated
  Returns: `{ authenticated: true/false, user: {...} }`

### Profile Management
- `GET /me/profile` - Get user profile (requires session/authentication)
- `PUT /me/profile` - Update user profile (requires session/authentication)
  ```json
  {
    "goal": "lose",
    "target_calories": 1800,
    "height_cm": 170,
    "weight_kg": 70,
    "activity_level": "medium",
    "allergies": ["peanuts", "dairy"],
    "diet_type": "veg",
    "preferences": {
      "cuisine": "italian",
      "cookingTime": "30 minutes",
      "mealType": "dinner"
    }
  }
  ```

### Meal Planning
- `POST /me/plan_meal` - Get meal plan using stored profile (requires session/authentication)
  ```json
  {
    "request": "I want a healthy breakfast"
  }
  ```
  Optional overrides: `goal`, `targetCalories`, `allergies`, `dietType`, `preferences`, `request`

- `POST /api/plan_meal` - Legacy endpoint (no auth, uses request body directly)

### Recipe Analysis
- `POST /me/analyze_recipe` - Analyze recipe from URL (requires session/authentication)
  ```json
  {
    "url": "https://example.com/recipe"
  }
  ```

## Testing

You can test the API using:
- Postman
- curl
- Your frontend application

Example curl commands:

```bash
# Register
curl -X POST http://localhost:3001/auth/register \
  -H "Content-Type: application/json" \
  -d '{"email":"test@example.com","password":"test123"}'

# Login (saves session cookie automatically)
curl -X POST http://localhost:3001/auth/login \
  -H "Content-Type: application/json" \
  -c cookies.txt \
  -d '{"email":"test@example.com","password":"test123"}'

# Get profile (uses session cookie)
curl -X GET http://localhost:3001/me/profile \
  -b cookies.txt

# Update profile
curl -X PUT http://localhost:3001/me/profile \
  -H "Content-Type: application/json" \
  -b cookies.txt \
  -d '{"goal":"lose","target_calories":1800,"allergies":["peanuts"]}'

# Plan meal
curl -X POST http://localhost:3001/me/plan_meal \
  -H "Content-Type: application/json" \
  -b cookies.txt \
  -d '{"request":"healthy breakfast"}'

# Logout
curl -X POST http://localhost:3001/auth/logout \
  -b cookies.txt
```

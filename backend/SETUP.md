# Database Setup Guide

## Installation

Install backend dependencies:

```bash
cd backend
npm install
```

## Database Initialization

This backend uses PostgreSQL in production.

1. Create a PostgreSQL database.
2. Run `backend/schema_postgres.sql` against that database.
3. Set `DATABASE_URL` in your environment.

Example using `psql`:

```bash
psql "$DATABASE_URL" -f backend/schema_postgres.sql
```

### Railway + Supabase

If your backend is deployed on Railway and PostgreSQL is hosted on Supabase, do not use the direct database host if it resolves only to IPv6. Railway will fail with `ENETUNREACH` during connection attempts.

Use the Supabase pooler connection string in your Railway `DATABASE_URL` instead. In Supabase, copy the Transaction or Session pooler URI from the database connection settings and use that as `DATABASE_URL` for Railway.

The server now verifies that the database connection works and that the `users` and `user_profiles` tables exist before it starts listening.

## Environment Variables

Make sure your `.env` file includes:

```env
DATABASE_URL=postgresql://user:password@host:5432/database
OPENROUTER_API_KEY=your-key-here
PORT=3001
SESSION_SECRET=your-session-secret-key-change-in-production
```

**Important**: Change `SESSION_SECRET` to a strong random string in production!
**Important**: `DATABASE_URL` must point to a PostgreSQL database with the schema from `backend/schema_postgres.sql` applied.

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

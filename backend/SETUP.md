# Backend Setup Guide

The backend is a Cloudflare Worker (`server.js`, Express 5) with a D1 database. Config is in `wrangler.jsonc`.

## Installation

```bash
cd backend
npm install
```

## Database (D1)

The schema lives in `migrations/` and is applied with Wrangler:

```bash
npx wrangler d1 migrations apply nutrition-db --local    # your machine (npm run dev does this for you)
npx wrangler d1 migrations apply nutrition-db --remote   # the deployed database
```

To change the schema, add a new numbered file (`npx wrangler d1 migrations create nutrition-db <name>`); never edit an applied migration.

Locally the database is a SQLite file under `.wrangler/`; delete that folder to start over.

## Secrets

Local: `backend/.dev.vars` (copy `.dev.vars.example`). Production: `npx wrangler secret put API_KEY_ENCRYPTION_KEY`.

Generate `API_KEY_ENCRYPTION_KEY` with `node -e "console.log(require('crypto').randomBytes(32).toString('base64'))"`. It encrypts each user's own AI provider key; there is no shared AI key. See "Bring your own AI key" in the root README.

There is no session secret: sessions are random tokens stored (hashed) in the D1 `sessions` table, so logging out revokes them.

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

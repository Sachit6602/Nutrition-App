# API Testing Guide

## Quick Test Script

Run the automated test script:

```bash
cd backend
node test-api.js
```

This will test:
- User registration/login
- Profile management
- Meal planning
- Legacy endpoints

## Manual Testing Options

### Option 1: Using curl (Command Line)

#### 1. Register a new user
```bash
curl -X POST http://localhost:3001/auth/register \
  -H "Content-Type: application/json" \
  -d "{\"email\":\"test@example.com\",\"password\":\"test123\"}" \
  -c cookies.txt -v
```

#### 2. Login (if user exists)
```bash
curl -X POST http://localhost:3001/auth/login \
  -H "Content-Type: application/json" \
  -d "{\"email\":\"test@example.com\",\"password\":\"test123\"}" \
  -c cookies.txt -v
```

#### 3. Check authentication status
```bash
curl -X GET http://localhost:3001/auth/status \
  -b cookies.txt
```

#### 4. Get user profile
```bash
curl -X GET http://localhost:3001/me/profile \
  -b cookies.txt
```

#### 5. Update user profile
```bash
curl -X PUT http://localhost:3001/me/profile \
  -H "Content-Type: application/json" \
  -b cookies.txt \
  -d "{\"goal\":\"lose\",\"target_calories\":1800,\"allergies\":[\"peanuts\",\"dairy\"],\"diet_type\":\"veg\"}"
```

#### 6. Plan a meal (uses stored profile)
```bash
curl -X POST http://localhost:3001/me/plan_meal \
  -H "Content-Type: application/json" \
  -b cookies.txt \
  -d "{\"request\":\"healthy breakfast\"}"
```

#### 7. Test legacy endpoint (no auth required)
```bash
curl -X POST http://localhost:3001/api/plan_meal \
  -H "Content-Type: application/json" \
  -d "{\"goals\":\"lose\",\"targetCalories\":1800,\"allergies\":[\"peanuts\"],\"request\":\"healthy lunch\"}"
```

#### 8. Logout
```bash
curl -X POST http://localhost:3001/auth/logout \
  -b cookies.txt
```

---

### Option 2: Using Postman

1. **Create a new Collection** called "Nutrition App API"

2. **Set up Environment Variables:**
   - `base_url`: `http://localhost:3001`
   - `session_cookie`: (will be set automatically)

3. **Register User:**
   - Method: `POST`
   - URL: `{{base_url}}/auth/register`
   - Body (raw JSON):
     ```json
     {
       "email": "test@example.com",
       "password": "test123"
     }
     ```
   - In Tests tab, add:
     ```javascript
     // Save session cookie
     const cookies = pm.response.headers.get("Set-Cookie");
     if (cookies) {
       pm.environment.set("session_cookie", cookies.split(";")[0]);
     }
     ```

4. **Login:**
   - Method: `POST`
   - URL: `{{base_url}}/auth/login`
   - Body (raw JSON):
     ```json
     {
       "email": "test@example.com",
       "password": "test123"
     }
     ```

5. **Get Profile:**
   - Method: `GET`
   - URL: `{{base_url}}/me/profile`
   - Headers: Add `Cookie: {{session_cookie}}`

6. **Update Profile:**
   - Method: `PUT`
   - URL: `{{base_url}}/me/profile`
   - Headers: Add `Cookie: {{session_cookie}}`
   - Body (raw JSON):
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

7. **Plan Meal:**
   - Method: `POST`
   - URL: `{{base_url}}/me/plan_meal`
   - Headers: Add `Cookie: {{session_cookie}}`
   - Body (raw JSON):
     ```json
     {
       "request": "healthy breakfast"
     }
     ```

---

### Option 3: Using Browser Console (JavaScript)

Open your browser's developer console and run:

```javascript
const API_BASE = 'http://localhost:3001';

// Register
fetch(`${API_BASE}/auth/register`, {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  credentials: 'include', // Important for cookies
  body: JSON.stringify({
    email: 'test@example.com',
    password: 'test123'
  })
})
.then(r => r.json())
.then(console.log);

// Login
fetch(`${API_BASE}/auth/login`, {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  credentials: 'include',
  body: JSON.stringify({
    email: 'test@example.com',
    password: 'test123'
  })
})
.then(r => r.json())
.then(console.log);

// Get Profile
fetch(`${API_BASE}/me/profile`, {
  credentials: 'include'
})
.then(r => r.json())
.then(console.log);

// Update Profile
fetch(`${API_BASE}/me/profile`, {
  method: 'PUT',
  headers: { 'Content-Type': 'application/json' },
  credentials: 'include',
  body: JSON.stringify({
    goal: 'lose',
    target_calories: 1800,
    allergies: ['peanuts']
  })
})
.then(r => r.json())
.then(console.log);

// Plan Meal
fetch(`${API_BASE}/me/plan_meal`, {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  credentials: 'include',
  body: JSON.stringify({
    request: 'healthy breakfast'
  })
})
.then(r => r.json())
.then(console.log);
```

---

### Option 4: Using HTTPie (if installed)

```bash
# Register
http POST localhost:3001/auth/register email=test@example.com password=test123

# Login
http POST localhost:3001/auth/login email=test@example.com password=test123

# Get Profile
http GET localhost:3001/me/profile

# Update Profile
http PUT localhost:3001/me/profile goal=lose target_calories:=1800 allergies:='["peanuts"]'

# Plan Meal
http POST localhost:3001/me/plan_meal request="healthy breakfast"
```

---

## Expected Responses

### Successful Registration/Login
```json
{
  "success": true,
  "user": {
    "id": 1,
    "email": "test@example.com"
  },
  "message": "Registration successful"
}
```

### Profile Response
```json
{
  "success": true,
  "profile": {
    "user_id": 1,
    "goal": "lose",
    "target_calories": 1800,
    "allergies": ["peanuts", "dairy"],
    "diet_type": "veg",
    "preferences": {
      "cuisine": "italian",
      "cookingTime": "30 minutes"
    }
  }
}
```

### Meal Plan Response
```json
{
  "success": true,
  "recipes": "Recipe content from Perplexity AI...",
  "metadata": {
    "model": "perplexity/sonar-pro",
    "usage": { ... }
  }
}
```

---

## Troubleshooting

1. **"Not authenticated" error**: Make sure you're sending the session cookie with requests
2. **CORS errors**: The server is configured to allow credentials, make sure your client sends `credentials: 'include'`
3. **Session not persisting**: Check that cookies are enabled and being sent/received
4. **API key errors**: Make sure `OPENROUTER_API_KEY` is set in your `.env` file

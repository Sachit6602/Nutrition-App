import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import session from 'express-session';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { authenticate, register, login, logout } from './auth.js';
import { writeFileSync } from 'fs';
import {
  getProfile,
  updateProfile,
  updateSessionData,
  getUserById,
  addIntake,
  getIntakeByDate,
  getIntakeTotalsByDate,
  getIntakeCalendarTotals,
  getActivityCalendarTotals,
  getFrequentIntake,
  addActivity,
  getActivityByDate,
  updateIntake,
  deleteIntake,
  addSavedFood,
  getSavedFoods,
  deleteSavedFood,
} from './db.js';

// Get current directory for ES modules
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Load .env file from backend directory
dotenv.config({ path: join(__dirname, '.env') });

const app = express();
// Use PORT from environment if set; default to 4000 to avoid conflicts with frontend dev server
const PORT = process.env.PORT || 4000;

// Session configuration
app.use(session({
  secret: process.env.SESSION_SECRET || 'nutrition-app-secret-key-change-in-production',
  resave: false,
  saveUninitialized: false,
  cookie: {
    secure: false, // Set to true if using HTTPS
    httpOnly: true,
    maxAge: 7 * 24 * 60 * 60 * 1000 // 7 days
  }
}));

// Middleware
app.use(cors({
  origin: ['http://localhost:3000', 'http://127.0.0.1:3000', 'http://localhost:5173', 'http://127.0.0.1:5173'], // Frontend URLs (vite)
  credentials: true, // Allow cookies/sessions
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization']
}));
app.use(express.json());

// Request logging middleware (for debugging)
app.use((req, res, next) => {
  console.log(`${new Date().toISOString()} - ${req.method} ${req.path}`);
  if (req.body && Object.keys(req.body).length > 0) {
    console.log('Request body:', JSON.stringify(req.body, null, 2));
  }
  next();
});

// Activity factors: 1.2 (sedentary), 1.375, 1.55, 1.725, 1.9
const ACTIVITY_FACTORS = { low: 1.2, medium: 1.55, high: 1.725 };

// Default macro assumptions
const PROTEIN_G_PER_KG = 1.8;
const FAT_PERCENT_OF_CALORIES = 0.275; // 27.5%
const CALORIES_PER_G_PROTEIN = 4;
const CALORIES_PER_G_FAT = 9;
const CALORIES_PER_G_CARBS = 4;

/**
 * Compute BMR (Mifflin–St Jeor), TDEE, target calories, and macro targets.
 * @param {object} profile - { age, sex, height_cm, weight_kg, activity_level, goal, intensity_percent }
 * @returns {{ bmr, tdee, calories, protein_g, fat_g, carbs_g, goal } | null}
 */
function calculate_daily_targets(profile) {
  const age = profile?.age;
  const sex = profile?.sex;
  const height_cm = profile?.height_cm;
  const weight_kg = profile?.weight_kg;
  const activity_level = profile?.activity_level || 'medium';
  const goal = profile?.goal || 'maintain';
  const intensity = profile?.intensity_percent != null ? Number(profile.intensity_percent) : (goal === 'lose' ? -20 : goal === 'gain' ? 10 : 0);

  if (age == null || !sex || height_cm == null || weight_kg == null) {
    return null;
  }
  const h = Number(height_cm);
  const w = Number(weight_kg);
  const a = Number(age);
  if (h <= 0 || w <= 0 || a <= 0) return null;

  // BMR Mifflin–St Jeor
  const bmr = sex === 'female'
    ? 10 * w + 6.25 * h - 5 * a - 161
    : 10 * w + 6.25 * h - 5 * a + 5;

  const factor = ACTIVITY_FACTORS[activity_level] ?? ACTIVITY_FACTORS.medium;
  const tdee = Math.round(bmr * factor);

  let calories;
  const override = profile?.target_calories != null && Number(profile.target_calories) > 0;
  if (override) {
    calories = Math.round(Number(profile.target_calories));
  } else {
    let multiplier = 1;
    if (goal === 'maintain') multiplier = 1;
    else if (goal === 'lose') multiplier = Math.max(0.5, 1 + intensity / 100);
    else if (goal === 'gain') multiplier = Math.min(1.5, 1 + intensity / 100);
    calories = Math.round(tdee * multiplier);
  }

  const protein_g = Math.round(weight_kg * PROTEIN_G_PER_KG);
  const protein_cal = protein_g * CALORIES_PER_G_PROTEIN;
  const fat_cal = calories * FAT_PERCENT_OF_CALORIES;
  const fat_g = Math.round(fat_cal / CALORIES_PER_G_FAT);
  const remaining_cal = Math.max(0, calories - protein_cal - fat_cal);
  const carbs_g = Math.round(remaining_cal / CALORIES_PER_G_CARBS);

  return {
    bmr: Math.round(bmr),
    tdee,
    calories,
    protein_g,
    fat_g,
    carbs_g,
    goal,
  };
}

// Helper function to construct prompt from profile data and optional overrides
function constructPrompt(profile, overrides = {}) {
  const {
    goal = overrides.goal,
    target_calories = overrides.targetCalories,
    targets = overrides.targets,
    allergies = overrides.allergies || [],
    diet_type = overrides.dietType || 'none',
    preferences = overrides.preferences || {},
    userRequest = overrides.request
  } = { ...profile, ...overrides };

  let prompt = `Act as a nutrition coach. Use web search to find recipes that match the following requirements:\n\n`;

  // User's daily targets (from BMR/TDEE calculator) — use these for portioning and macro fit
  if (targets && typeof targets.calories === 'number') {
    prompt += `User's daily targets: ${targets.calories} kcal, ${targets.protein_g} g protein, ${targets.carbs_g} g carbs, ${targets.fat_g} g fat. `;
    prompt += `Suggest recipes and portions that fit within these targets. `;
    if (targets.goal) {
      prompt += `Goal: ${targets.goal} weight. `;
    }
    prompt += `\n`;
  }

  // Goals (fallback when no targets)
  if (!targets && goal) {
    prompt += `Goal: ${goal} weight`;
    if (target_calories) {
      prompt += ` (target: ${target_calories} calories per day)`;
    }
    prompt += `\n`;
  }

  // Diet type
  if (diet_type && diet_type !== 'none') {
    prompt += `Diet type: ${diet_type}\n`;
  }

  // Allergies
  const allergiesList = Array.isArray(allergies) ? allergies : [];
  if (allergiesList.length > 0) {
    prompt += `CRITICAL: The user has these allergies/dietary restrictions that MUST be avoided: ${allergiesList.join(', ')}. Do not suggest any recipes containing these ingredients.\n`;
  }

  // Preferences
  if (preferences && typeof preferences === 'object') {
    if (preferences.cuisine) {
      prompt += `Preferred cuisine: ${preferences.cuisine}\n`;
    }
    if (preferences.cookingTime) {
      prompt += `Cooking time preference: ${preferences.cookingTime}\n`;
    }
    if (preferences.mealType) {
      prompt += `Meal type: ${preferences.mealType}\n`;
    }
  }

  // User request
  if (userRequest) {
    prompt += `\nUser request: ${userRequest}\n`;
  }

  prompt += `\n\nIMPORTANT: Return ONLY valid JSON with this exact schema. Do not include any text before or after the JSON:\n`;
  prompt += `{\n`;
  prompt += `  "recipes": [\n`;
  prompt += `    {\n`;
  prompt += `      "title": "Recipe name",\n`;
  prompt += `      "source_url": "https://recipe-source-url.com",\n`;
  prompt += `      "image_url": "https://image-url.com/recipe.jpg",\n`;
  prompt += `      "ingredients": [\n`;
  prompt += `        {"name": "ingredient name", "amount": "quantity", "unit": "unit"}\n`;
  prompt += `      ],\n`;
  prompt += `      "steps": ["step 1", "step 2", "step 3"],\n`;
  prompt += `      "nutrients": {\n`;
  prompt += `        "calories": 500,\n`;
  prompt += `        "protein_g": 30,\n`;
  prompt += `        "carbs_g": 45,\n`;
  prompt += `        "fat_g": 20\n`;
  prompt += `      },\n`;
  prompt += `      "allergy_warnings": ["warning1", "warning2"],\n`;
  prompt += `      "daily_contribution": "This meal is ~35% of daily calories and ~40% of daily protein."\n`;
  prompt += `    }\n`;
  prompt += `  ]\n`;
  prompt += `}\n\n`;
  prompt += `Provide 2-3 recipe options. For each recipe:\n`;
  prompt += `- Find a real recipe URL and image URL from web search\n`;
  prompt += `- Include complete ingredients with amounts and units\n`;
  prompt += `- Provide detailed step-by-step instructions\n`;
  prompt += `- Calculate accurate nutrition values (per serving)\n`;
  prompt += `- Include "daily_contribution": a short sentence saying how this serving contributes to the user's daily totals (e.g. "% of daily calories and % of daily protein")\n`;
  prompt += `- List any allergy warnings if the recipe contains allergens (even if user doesn't have those allergies, list them for safety)\n`;
  prompt += `- If image_url is not available, use an empty string\n`;

  return prompt;
}

// Helper function to parse JSON from LLM response
function parseRecipeJSON(content) {
  // Robust JSON parsing with multiple heuristics to handle slightly malformed model output
  let jsonStr = (content || '').trim();

  // Remove surrounding markdown code fences if present
  jsonStr = jsonStr.replace(/^```json\s*/i, '').replace(/^```\s*/i, '').replace(/\s*```$/i, '');

  // Remove JS/C style comments
  jsonStr = jsonStr.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|\n)\s*\/\/.*(?=\n|$)/g, '\n');

  // Attempt to locate a top-level JSON object or array
  let match = jsonStr.match(/\{[\s\S]*\}/);
  if (!match) match = jsonStr.match(/\[[\s\S]*\]/);
  if (match) jsonStr = match[0];

  const tryParse = (str) => {
    try {
      return { ok: true, value: JSON.parse(str) };
    } catch (e) {
      return { ok: false, error: e };
    }
  };

  // 1) Try naive parse
  let attempt = tryParse(jsonStr);
  if (attempt.ok) {
    const parsed = attempt.value;
    // Accept both { recipes: [...] } and top-level array [...]
    if (Array.isArray(parsed)) return parsed;
    if (parsed && Array.isArray(parsed.recipes)) return parsed.recipes;
    // If parsed object has a single array-like property, try to use it
    for (const v of Object.values(parsed)) {
      if (Array.isArray(v)) return v;
    }
  }

  // 2) Remove trailing commas in arrays/objects: { ... , } or [ ... , ]
  let cleaned = jsonStr.replace(/,\s*(?=[}\]])/g, '');

  // 3) Replace single-quoted strings with double quotes where likely used for JSON
  // This is a best-effort heuristic and may not be perfect.
  cleaned = cleaned.replace(/'(?:[^'\\]|\\.)*'/g, (m) => {
    // Convert outer single quotes to double quotes
    return '"' + m.slice(1, -1).replace(/\"/g, '\\"') + '"';
  });

  // 4) Remove unescaped control characters
  cleaned = cleaned.replace(/\p{Cc}+/gu, '');

  attempt = tryParse(cleaned);
  if (attempt.ok) {
    const parsed = attempt.value;
    if (Array.isArray(parsed)) return parsed;
    if (parsed && Array.isArray(parsed.recipes)) return parsed.recipes;
    for (const v of Object.values(parsed)) {
      if (Array.isArray(v)) return v;
    }
  }

  // 5) As a last resort, try to extract JSON-like lines and join them
  const lines = jsonStr.split(/\r?\n/).map(l => l.trim()).filter(Boolean);
  const joined = lines.join('');
  attempt = tryParse(joined);
  if (attempt.ok) {
    const parsed = attempt.value;
    if (Array.isArray(parsed)) return parsed;
    if (parsed && Array.isArray(parsed.recipes)) return parsed.recipes;
  }

  // Log detailed diagnostics for debugging
  console.error('Failed to parse JSON after multiple attempts. Last error:', (attempt.error || 'unknown'));
  console.error('Original response (first 2000 chars):', String(content).slice(0, 2000));

  // Write raw response to a debug file for inspection
  try {
    const debugName = `debug_recipe_${Date.now()}.json`;
    const debugPath = join(__dirname, debugName);
    writeFileSync(debugPath, String(content), 'utf8');
    console.error('Wrote raw recipe output to', debugPath);
  } catch (e) {
    console.error('Failed to write debug file:', e);
  }

  // Return empty array if parsing ultimately fails
  return [];
}

// Helper function to call Perplexity API
async function callPerplexityAPI(prompt) {
  const openRouterApiKey = process.env.OPENROUTER_API_KEY || process.env.PERPLEXITY_API_KEY;
  if (!openRouterApiKey) {
    throw new Error('OpenRouter API key not configured');
  }

  const modelName = process.env.PERPLEXITY_MODEL || 'perplexity/sonar-pro';
  
  const requestBody = {
    model: modelName,
    messages: [
      {
        role: 'system',
        content: 'You are a nutrition coach and recipe expert. You MUST return ONLY valid JSON. Do not include any explanatory text, markdown formatting, or code blocks. Return pure JSON that matches the exact schema requested.',
      },
      {
        role: 'user',
        content: prompt,
      },
    ],
    temperature: 0.7,
    max_tokens: 2000, // Increased to reduce truncation of recipe output
  };

  const headers = {
    'Authorization': `Bearer ${openRouterApiKey}`,
    'Content-Type': 'application/json',
  };
  
  if (process.env.SITE_URL) {
    headers['HTTP-Referer'] = process.env.SITE_URL;
  }
  if (process.env.SITE_NAME) {
    headers['X-Title'] = process.env.SITE_NAME;
  }
  
  const response = await fetch('https://openrouter.ai/api/v1/chat/completions', {
    method: 'POST',
    headers: headers,
    body: JSON.stringify(requestBody),
  });

  if (!response.ok) {
    const errorText = await response.text();
    let errorDetails;
    try {
      errorDetails = JSON.parse(errorText);
    } catch (e) {
      errorDetails = errorText;
    }
    throw new Error(`Perplexity API error: ${errorDetails?.error?.message || errorDetails?.message || errorText}`);
  }

  const data = await response.json();
  return {
    content: data.choices?.[0]?.message?.content || 'No response received',
    model: data.model,
    usage: data.usage
  };
}

// ==================== AUTHENTICATION ROUTES ====================

// Test endpoint to verify connection
app.get('/auth/test', (req, res) => {
  res.json({ message: 'Backend is reachable!', timestamp: new Date().toISOString() });
});

// Register new user
app.post('/auth/register', async (req, res, next) => {
  try {
    await register(req, res);
  } catch (error) {
    console.error('Unhandled error in register route:', error);
    if (!res.headersSent) {
      res.status(500).json({ error: 'Internal server error', details: error.message });
    }
  }
});

// Login user
app.post('/auth/login', login);

// Logout user
app.post('/auth/logout', logout);

// Check authentication status
app.get('/auth/status', (req, res) => {
  if (req.session && req.session.userId) {
    const user = getUserById(req.session.userId);
    res.json({
      authenticated: true,
      user: user ? { id: user.id, email: user.email } : null
    });
  } else {
    res.json({ authenticated: false });
  }
});

// ==================== PROFILE ROUTES ====================

// Get user profile
app.get('/me/profile', authenticate, (req, res) => {
  try {
    const profile = getProfile(req.userId);
    if (!profile) {
      return res.status(404).json({ error: 'Profile not found' });
    }
    res.json({ success: true, profile });
  } catch (error) {
    console.error('Error getting profile:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Update user profile
app.put('/me/profile', authenticate, (req, res) => {
  try {
    const updateData = { ...req.body };
    
    // Convert allergies array to JSON string if provided
    if (updateData.allergies && Array.isArray(updateData.allergies)) {
      updateData.allergies_json = JSON.stringify(updateData.allergies);
      delete updateData.allergies;
    }
    
    // Convert preferences object to JSON string if provided
    if (updateData.preferences && typeof updateData.preferences === 'object') {
      updateData.preferences_json = JSON.stringify(updateData.preferences);
      delete updateData.preferences;
    }
    
    const updatedProfile = updateProfile(req.userId, updateData);
    res.json({ success: true, profile: updatedProfile });
  } catch (error) {
    console.error('Error updating profile:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Get calculated daily targets (BMR, TDEE, calories, macros)
app.get('/me/targets', authenticate, (req, res) => {
  try {
    const profile = getProfile(req.userId);
    if (!profile) {
      return res.status(404).json({ error: 'Profile not found' });
    }
    const targets = calculate_daily_targets(profile);
    if (!targets) {
      return res.status(400).json({
        error: 'Cannot compute targets. Please set age, sex, height (cm), and weight (kg) in your profile.',
      });
    }
    res.json({ success: true, targets });
  } catch (error) {
    console.error('Error getting targets:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// ==================== MEAL PLANNING ROUTES ====================

// New authenticated meal planning endpoint (uses stored profile)
app.post('/me/plan_meal', authenticate, async (req, res) => {
  try {
    // Get user profile
    const profile = getProfile(req.userId);
    if (!profile) {
      return res.status(404).json({ error: 'Profile not found. Please set up your profile first.' });
    }

    // Compute daily targets (BMR → TDEE → macros) when profile has age, sex, height, weight
    const targets = calculate_daily_targets(profile);

    // Allow optional overrides from request body
    const overrides = {
      goal: req.body.goal,
      targetCalories: req.body.targetCalories,
      allergies: req.body.allergies,
      dietType: req.body.dietType,
      preferences: req.body.preferences,
      request: req.body.request,
      targets: targets || undefined
    };

    // Construct prompt using profile data and calculated targets
    const prompt = constructPrompt(profile, overrides);

    // Call Perplexity API
    const result = await callPerplexityAPI(prompt);

    // Parse JSON response
    const recipes = parseRecipeJSON(result.content);

    // Store session data
    updateSessionData(
      req.userId,
      JSON.stringify({ prompt, overrides }),
      JSON.stringify(result)
    );

    res.json({
      success: true,
      recipes: recipes,
      raw_content: result.content,
      metadata: {
        model: result.model,
        usage: result.usage,
      },
    });
  } catch (error) {
    console.error('Error in plan_meal:', error);
    res.status(500).json({
      error: 'Internal server error',
      details: error instanceof Error ? error.message : 'Unknown error'
    });
  }
});

// Legacy endpoint (backward compatibility - uses request body directly)
app.post('/api/plan_meal', async (req, res) => {
  try {
    const { goals, targetCalories, allergies, preferences, request: userRequest } = req.body;

    // Validate required fields
    if (!goals) {
      return res.status(400).json({
        error: 'Missing required fields: goals'
      });
    }

    // Construct prompt from request body
    const prompt = constructPrompt({}, {
      goal: goals,
      targetCalories,
      allergies: allergies || [],
      preferences,
      request: userRequest
    });

    // Call Perplexity API
    const result = await callPerplexityAPI(prompt);

    // Parse JSON response
    const recipes = parseRecipeJSON(result.content);

    res.json({
      success: true,
      recipes: recipes,
      raw_content: result.content,
      metadata: {
        model: result.model,
        usage: result.usage,
      },
    });
  } catch (error) {
    console.error('Error in plan_meal:', error);
    res.status(500).json({
      error: 'Internal server error',
      details: error instanceof Error ? error.message : 'Unknown error'
    });
  }
});

// ==================== RECIPE ANALYSIS ROUTE ====================

// Analyze recipe from URL
app.post('/me/analyze_recipe', authenticate, async (req, res) => {
  try {
    const { url } = req.body;
    
    if (!url) {
      return res.status(400).json({ error: 'Recipe URL is required' });
    }

    // Get user profile
    const profile = getProfile(req.userId);
    if (!profile) {
      return res.status(404).json({ error: 'Profile not found. Please set up your profile first.' });
    }

    // Build analysis prompt
    let prompt = `Analyze this recipe from the URL: ${url}\n\n`;
    prompt += `User Profile:\n`;
    if (profile.goal) prompt += `- Goal: ${profile.goal} weight\n`;
    if (profile.target_calories) prompt += `- Target calories: ${profile.target_calories} per day\n`;
    if (profile.diet_type && profile.diet_type !== 'none') prompt += `- Diet type: ${profile.diet_type}\n`;
    
    const allergies = Array.isArray(profile.allergies) ? profile.allergies : [];
    if (allergies.length > 0) {
      prompt += `- Allergies/restrictions: ${allergies.join(', ')}\n`;
    }
    
    prompt += `\nPlease provide:\n`;
    prompt += `1. Recipe name and source URL\n`;
    prompt += `2. Complete step-by-step cooking instructions\n`;
    prompt += `3. Full list of ingredients with exact quantities\n`;
    prompt += `4. Calories per serving (calculate if not mentioned in the recipe)\n`;
    prompt += `5. Detailed nutrients: protein (g), carbohydrates (g), fats (g), fiber (g), vitamins, minerals\n`;
    prompt += `6. Safety check: Does this recipe contain any of the user's allergies/restrictions?\n`;
    prompt += `7. Compatibility: Does this match the user's diet type (${profile.diet_type})?\n`;
    prompt += `8. Recommendations: Is this suitable for the user's goal (${profile.goal})?\n`;
    prompt += `\nFormat your response clearly with all sections labeled.`;

    // Call Perplexity API
    const result = await callPerplexityAPI(prompt);

    // Store session data
    updateSessionData(
      req.userId,
      JSON.stringify({ url, prompt }),
      JSON.stringify(result)
    );

    res.json({
      success: true,
      analysis: result.content,
      metadata: {
        model: result.model,
        usage: result.usage,
      },
    });
  } catch (error) {
    console.error('Error in analyze_recipe:', error);
    res.status(500).json({
      error: 'Internal server error',
      details: error instanceof Error ? error.message : 'Unknown error'
    });
  }
});

// ==================== INTAKE / ACTIVITY ROUTES ====================

// Helper to estimate calories burned from steps (very approximate)
function estimateCaloriesFromSteps(steps = 0, weightKg = null) {
  // Base estimate: ~0.04 kcal per step for a 70kg person (~200-300 kcal per 5000-8000 steps)
  const basePerStep = 0.04;
  const weightFactor = weightKg ? (Number(weightKg) / 70) : 1;
  return Math.round(steps * basePerStep * weightFactor);
}

// POST /me/intake - log a food item
app.post('/me/intake', authenticate, (req, res) => {
  try {
    const body = req.body || {};
    const date = body.date || new Date().toISOString().slice(0, 10);
    const item_name = body.item_name;
    const calories = Number(body.calories);
    if (!item_name || Number.isNaN(calories)) {
      return res.status(400).json({ error: 'item_name and calories are required' });
    }

    const payload = {
      date,
      source_type: body.source_type || 'manual',
      item_name,
      calories,
      protein_g: body.protein_g != null ? Number(body.protein_g) : null,
      carbs_g: body.carbs_g != null ? Number(body.carbs_g) : null,
      fat_g: body.fat_g != null ? Number(body.fat_g) : null,
      servings: body.servings != null ? Number(body.servings) : 1,
    };

    const result = addIntake(req.userId, payload);

    // Return created item id and today's totals
    const totals = getIntakeTotalsByDate(req.userId, date);
    res.status(201).json({ success: true, id: result.id, totals });
  } catch (error) {
    console.error('Error in POST /me/intake:', error);
    res.status(500).json({ error: 'Internal server error', details: error.message });
  }
});

// GET /me/intake?date=YYYY-MM-DD - get items for a date + totals
app.get('/me/intake', authenticate, (req, res) => {
  try {
    const date = req.query.date || new Date().toISOString().slice(0, 10);
    const items = getIntakeByDate(req.userId, date);
    const totals = getIntakeTotalsByDate(req.userId, date);
    res.json({ success: true, date, items, totals });
  } catch (error) {
    console.error('Error in GET /me/intake:', error);
    res.status(500).json({ error: 'Internal server error', details: error.message });
  }
});

// GET /me/intake/calendar?month=YYYY-MM - monthly per-day totals
app.get('/me/intake/calendar', authenticate, (req, res) => {
  try {
    const month = req.query.month;
    if (!month) return res.status(400).json({ error: 'month=YYYY-MM required' });
    const totals = getIntakeCalendarTotals(req.userId, month);
    res.json({ success: true, month, totals });
  } catch (error) {
    console.error('Error in GET /me/intake/calendar:', error);
    res.status(500).json({ error: 'Internal server error', details: error.message });
  }
});

// GET /me/intake/frequent - recent/frequent items for quick re-log
app.get('/me/intake/frequent', authenticate, (req, res) => {
  try {
    const rows = getFrequentIntake(req.userId, 30);
    res.json({ success: true, items: rows });
  } catch (error) {
    console.error('Error in GET /me/intake/frequent:', error);
    res.status(500).json({ error: 'Internal server error', details: error.message });
  }
});

// Update an intake item
app.put('/me/intake/:id', authenticate, (req, res) => {
  try {
    const id = Number(req.params.id);
    if (!id) return res.status(400).json({ error: 'Invalid id' });
    const fields = req.body || {};
    const result = updateIntake(req.userId, id, fields);
    if (result.changes === 0) return res.status(404).json({ error: 'Not found or no changes' });
    res.json({ success: true, changes: result.changes });
  } catch (error) {
    console.error('Error in PUT /me/intake/:id', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Delete an intake item
app.delete('/me/intake/:id', authenticate, (req, res) => {
  try {
    const id = Number(req.params.id);
    if (!id) return res.status(400).json({ error: 'Invalid id' });
    const result = deleteIntake(req.userId, id);
    if (result.changes === 0) return res.status(404).json({ error: 'Not found' });
    res.json({ success: true });
  } catch (error) {
    console.error('Error in DELETE /me/intake/:id', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Saved foods endpoints
app.get('/me/saved_foods', authenticate, (req, res) => {
  try {
    const rows = getSavedFoods(req.userId);
    res.json({ success: true, items: rows });
  } catch (error) {
    console.error('Error in GET /me/saved_foods:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

app.post('/me/saved_foods', authenticate, (req, res) => {
  try {
    const body = req.body || {};
    if (!body.name || body.calories == null) return res.status(400).json({ error: 'name and calories required' });
    const result = addSavedFood(req.userId, {
      name: body.name,
      calories: Number(body.calories),
      protein_g: body.protein_g != null ? Number(body.protein_g) : null,
      carbs_g: body.carbs_g != null ? Number(body.carbs_g) : null,
      fat_g: body.fat_g != null ? Number(body.fat_g) : null,
      default_servings: body.default_servings != null ? Number(body.default_servings) : 1,
    });
    res.status(201).json({ success: true, id: result.id });
  } catch (error) {
    console.error('Error in POST /me/saved_foods:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

app.delete('/me/saved_foods/:id', authenticate, (req, res) => {
  try {
    const id = Number(req.params.id);
    if (!id) return res.status(400).json({ error: 'Invalid id' });
    const result = deleteSavedFood(req.userId, id);
    if (result.changes === 0) return res.status(404).json({ error: 'Not found' });
    res.json({ success: true });
  } catch (error) {
    console.error('Error in DELETE /me/saved_foods/:id', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// POST /me/activity - log steps/activity
app.post('/me/activity', authenticate, (req, res) => {
  try {
    const body = req.body || {};
    const date = body.date || new Date().toISOString().slice(0, 10);
    const steps = Number(body.steps) || 0;
    const active_minutes = body.active_minutes != null ? Number(body.active_minutes) : null;

    const profile = getProfile(req.userId) || {};
    const estimatedCalories = estimateCaloriesFromSteps(steps, profile.weight_kg);

    addActivity(req.userId, { date, steps, active_minutes, calories_burned: estimatedCalories });

    res.status(201).json({ success: true, date, steps, calories_burned: estimatedCalories });
  } catch (error) {
    console.error('Error in POST /me/activity:', error);
    res.status(500).json({ error: 'Internal server error', details: error.message });
  }
});

// GET /me/activity?date=YYYY-MM-DD - get activity for day
app.get('/me/activity', authenticate, (req, res) => {
  try {
    const date = req.query.date || new Date().toISOString().slice(0, 10);
    const record = getActivityByDate(req.userId, date);
    res.json({ success: true, date, activity: record });
  } catch (error) {
    console.error('Error in GET /me/activity:', error);
    res.status(500).json({ error: 'Internal server error', details: error.message });
  }
});

// Root endpoint
app.get('/', (req, res) => {
  res.json({ 
    message: 'Nutrition App API',
    endpoints: {
      // Auth
      'POST /auth/register': 'Register new user',
      'POST /auth/login': 'Login user',
      'POST /auth/logout': 'Logout user',
      'GET /auth/status': 'Check authentication status',
      // Profile
      'GET /me/profile': 'Get user profile (auth required)',
      'PUT /me/profile': 'Update user profile (auth required)',
      'GET /me/targets': 'Get calculated daily targets BMR/TDEE/macros (auth required)',
      // Meal Planning
      'POST /me/plan_meal': 'Get meal plan using stored profile (auth required)',
      'POST /api/plan_meal': 'Get meal plan (legacy, no auth)',
      // Recipe Analysis
      'POST /me/analyze_recipe': 'Analyze recipe from URL (auth required)',
  // Intake / Activity
  'POST /me/intake': 'Log a food item (auth required)',
  'GET /me/intake?date=YYYY-MM-DD': 'Get intake items and totals for a day (auth required)',
  'GET /me/intake/calendar?month=YYYY-MM': 'Get per-day totals for a month (auth required)',
  'GET /me/intake/frequent': 'Get frequent/recent foods for quick logging (auth required)',
  'PUT /me/intake/:id': 'Update an intake item (auth required)',
  'DELETE /me/intake/:id': 'Delete an intake item (auth required)',
  'GET /me/saved_foods': 'List saved predefined foods (auth required)',
  'POST /me/saved_foods': 'Create a saved food (auth required)',
  'DELETE /me/saved_foods/:id': 'Delete a saved food (auth required)',
  'POST /me/activity': 'Log activity/steps (auth required)',
  'GET /me/activity?date=YYYY-MM-DD': 'Get activity for a day (auth required)',
  'GET /me/summary?month=YYYY-MM': 'Get per-day summary (intake + burned) for a month (auth required)',
      // Health
      'GET /health': 'Health check'
    }
  });
});

// GET /me/summary?month=YYYY-MM - combined intake + activity totals per day for a month
app.get('/me/summary', authenticate, (req, res) => {
  try {
    const month = req.query.month || new Date().toISOString().slice(0,7);
    const intakeTotals = getIntakeCalendarTotals(req.userId, month) || [];
    const activityTotals = getActivityCalendarTotals(req.userId, month) || [];

    // Merge by date
    const map = {};
    for (const it of intakeTotals) {
      map[it.date] = { date: it.date, calories_total: it.calories_total || 0, calories_burned: 0 };
    }
    for (const a of activityTotals) {
      if (!map[a.date]) map[a.date] = { date: a.date, calories_total: 0, calories_burned: 0 };
      map[a.date].calories_burned = a.calories_burned_total || 0;
    }

    const summary = Object.values(map).sort((x,y) => x.date.localeCompare(y.date));
    res.json({ success: true, month, summary });
  } catch (error) {
    console.error('Error in GET /me/summary:', error);
    res.status(500).json({ error: 'Internal server error', details: error.message });
  }
});

// Helper: compute aggregated insights for last N days
function computeInsightsForDays(userId, days = 7) {
  const results = [];
  const today = new Date();
  for (let i = 0; i < days; i++) {
    const d = new Date(today);
    d.setDate(today.getDate() - i);
    const dateStr = d.toISOString().slice(0,10);
    const intake = getIntakeTotalsByDate(userId, dateStr) || { calories_total: 0, protein_total: 0, carbs_total: 0, fat_total: 0 };
    const activity = getActivityByDate(userId, dateStr) || { steps: 0, calories_burned: 0 };
    results.push({ date: dateStr, intake, activity, weekday: d.getDay() });
  }
  return results.sort((a,b) => a.date.localeCompare(b.date));
}

// GET /me/insights?days=7 - basic averages and simple insights
app.get('/me/insights', authenticate, (req, res) => {
  try {
    const days = Math.min(90, Math.max(1, Number(req.query.days) || 7));
    const profile = getProfile(req.userId) || {};
    const targets = calculate_daily_targets(profile) || {};

    const rows = computeInsightsForDays(req.userId, days);

    let sumCalories = 0, sumProtein = 0, sumCarbs = 0, sumFat = 0, sumSteps = 0;
    let daysHitCalories = 0, proteinBelowWeekday = 0;

    for (const r of rows) {
      const cal = Number(r.intake.calories_total || 0);
      const prot = Number(r.intake.protein_total || 0);
      const carbs = Number(r.intake.carbs_total || 0);
      const fat = Number(r.intake.fat_total || 0);
      const steps = Number(r.activity.steps || 0);

      sumCalories += cal;
      sumProtein += prot;
      sumCarbs += carbs;
      sumFat += fat;
      sumSteps += steps;

      const targetCal = targets.calories || null;
      if (targetCal != null && cal <= targetCal) daysHitCalories++;

      // weekday (Mon-Fri => getDay 1..5) protein check
      if (r.weekday >= 1 && r.weekday <= 5 && targets.protein_g != null) {
        if (prot < Number(targets.protein_g)) proteinBelowWeekday++;
      }
    }

    const count = rows.length || 1;
    const averages = {
      avg_calories: Math.round(sumCalories / count),
      avg_protein: Math.round(sumProtein / count),
      avg_carbs: Math.round(sumCarbs / count),
      avg_fat: Math.round(sumFat / count),
      avg_steps: Math.round(sumSteps / count),
    };

    const insights = [];
    if (targets.calories) {
      insights.push(`You hit your calorie target on ${daysHitCalories}/${count} days.`);
    }
    if (targets.protein_g != null) {
      insights.push(`Protein below target on ${proteinBelowWeekday} of ${count} weekdays.`);
    }

    res.json({ success: true, days: count, averages, profile_targets: targets, insights, rows });
  } catch (error) {
    console.error('Error in GET /me/insights:', error);
    res.status(500).json({ error: 'Internal server error', details: error.message });
  }
});

// POST /me/coach - generate compact stats and ask LLM for observations + suggestions
app.post('/me/coach', authenticate, async (req, res) => {
  try {
    const days = Math.min(90, Math.max(1, Number(req.body.days) || 7));
    const profile = getProfile(req.userId) || {};
    const targets = calculate_daily_targets(profile) || {};

    const rows = computeInsightsForDays(req.userId, days);

    // Build compact stats
    const stats = { days: rows.length, days_data: [] };
    for (const r of rows) {
      stats.days_data.push({ date: r.date, calories: Number(r.intake.calories_total || 0), protein: Number(r.intake.protein_total || 0), carbs: Number(r.intake.carbs_total || 0), fat: Number(r.intake.fat_total || 0), steps: Number(r.activity.steps || 0) });
    }

    // Compact summary text for LLM
    let prompt = `You are an evidence-based nutrition coach. The user profile and compact stats are below. Provide 3-5 concise observations about patterns and exactly 3 very small, specific suggestions the user can try next week. Return ONLY valid JSON with keys \"observations\" (array) and \"suggestions\" (array).\n\n`;
    prompt += `Profile Targets: ${targets.calories || 'N/A'} kcal/day, ${targets.protein_g || 'N/A'} g protein, ${targets.carbs_g || 'N/A'} g carbs, ${targets.fat_g || 'N/A'} g fat. Goal: ${targets.goal || 'N/A'}.\n\n`;
    prompt += `Compact stats (last ${rows.length} days):\n`;
    for (const d of stats.days_data) {
      prompt += `- ${d.date}: ${d.calories} kcal, ${d.protein}g protein, ${d.carbs}g carbs, ${d.fat}g fat, ${d.steps} steps\n`;
    }

    prompt += `\nGive observations in plain, actionable language and suggestions that are specific and measurable (e.g., \"add 20g protein at breakfast\").`;

    const result = await callPerplexityAPI(prompt);

    // Try to parse JSON from model response
    let parsed = null;
    try {
      let content = result.content || '';
      content = content.replace(/^```json\s*/i, '').replace(/^```\s*/i, '').replace(/\s*```$/i, '');
      // Extract first JSON object
      const m = content.match(/\{[\s\S]*\}/);
      const jsonStr = m ? m[0] : content;
      parsed = JSON.parse(jsonStr);
    } catch (e) {
      console.error('Failed to parse coach JSON:', e);
    }

    // Store session data for debugging
    updateSessionData(req.userId, JSON.stringify({ prompt, days }), JSON.stringify(result));

    res.json({ success: true, raw: result.content, parsed });
  } catch (error) {
    console.error('Error in POST /me/coach:', error);
    res.status(500).json({ error: 'Internal server error', details: error.message });
  }
});

// Health check endpoint
app.get('/health', (req, res) => {
  res.json({ status: 'ok' });
});

app.listen(PORT, () => {
  console.log(`Backend server running on http://localhost:${PORT}`);
  console.log(`Health check: http://localhost:${PORT}/health`);
  
  // Check if API key is configured
  if (!process.env.OPENROUTER_API_KEY && !process.env.PERPLEXITY_API_KEY) {
    console.warn('⚠️  WARNING: OPENROUTER_API_KEY not found in .env file');
    console.warn('   Please create backend/.env with your OpenRouter API key');
    console.warn('   Get your key at: https://openrouter.ai/keys');
  } else {
    console.log('✅ API key loaded (using OpenRouter)');
  }
});


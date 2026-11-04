// Cloudflare Worker entry: an Express app served through the Workers Node.js HTTP compatibility layer,
// with D1 as the database (db.js). The same Worker serves the built frontend as static assets.
import express from 'express';
import cors from 'cors';
import { httpServerHandler } from 'cloudflare:node';
import { authenticate, currentUser, register, login, logout } from './auth.js';
import {
  getProfile,
  updateProfile,
  updateSessionData,
  addIntake,
  getIntakeByDate,
  getIntakeTotalsByDate,
  getIntakeTotalsRange,
  getActivityRange,
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
  BadInput,
  getUserApiKeyRecord,
  setUserApiKey,
  clearUserApiKey,
} from './db.js';
import { analyzeFoodImage } from './cv_service.js';
import { AiError, chat, detectProvider, isProvider, PROVIDERS, providerLabel, publicProviders, verifyKey } from './ai_client.js';
import { encryptSecret, decryptSecret, vaultConfigured } from './key_vault.js';

const app = express();
app.set('trust proxy', 1);

// Other sites allowed to call the API with cookies. Only needed when the frontend is hosted elsewhere
// (VITE_API_BASE_URL + COOKIE_SAMESITE=none); the Worker serves the frontend on its own origin by default.
const allowedOrigins = () => [
  'http://localhost:3000', 'http://127.0.0.1:3000', 'http://localhost:5173', 'http://127.0.0.1:5173',
  ...String(process.env.ALLOWED_ORIGINS || '').split(',').map((s) => s.trim()).filter(Boolean),
];
const sameOrigin = (req, origin) => {
  try { return new URL(origin).host === req.headers.host; } catch { return false; }
};
app.use(cors({
  origin: (origin, cb) => cb(null, !origin || allowedOrigins().includes(origin)),
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization'],
}));
// CSRF guard: reject state-changing requests from foreign origins, and bodies that aren't JSON
// (the frontend only sends JSON, and a JSON content type forces a CORS preflight).
app.use((req, res, next) => {
  if (['GET', 'HEAD', 'OPTIONS'].includes(req.method)) return next();
  const origin = req.headers.origin;
  if (origin && !sameOrigin(req, origin) && !allowedOrigins().includes(origin)) {
    return res.status(403).json({ error: 'Forbidden origin' });
  }
  const hasBody = Number(req.headers['content-length']) > 0 || req.headers['transfer-encoding'] !== undefined;
  if (hasBody && !req.is('application/json')) {
    return res.status(415).json({ error: 'Request body must be JSON' });
  }
  next();
});
app.use(express.json({ limit: '10mb' }));
// Express 5 leaves req.body undefined when there is no body; handlers read req.body.x directly.
app.use((req, res, next) => { req.body ??= {}; next(); });

// Request logging middleware. Never log bodies or headers: they carry passwords, API keys and images.
app.use((req, res, next) => {
  console.log(`${new Date().toISOString()} - ${req.method} ${req.path}`);
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
    // Optional debug fields can be safely ignored by the frontend.
    _debug: {
      inputs: { age: a, sex, height_cm: h, weight_kg: w, activity_level, goal, intensity_percent: intensity },
      activity_factor: factor,
      calorie_multiplier: override ? null : (calories / tdee),
      used_target_calories_override: override,
    },
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
    // Only overrides the caller actually sent: an undefined key would otherwise wipe the profile's allergies.
  } = { ...profile, ...Object.fromEntries(Object.entries(overrides).filter(([, v]) => v !== undefined)) };

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

  // Return empty array if parsing ultimately fails
  return [];
}

// Recipe / coach JSON calls on the user's own provider. Uses its web-search model when it has one
// (OpenRouter's Perplexity, Perplexity, OpenAI search); otherwise the plain text model, told not to invent links.
async function callPerplexityAPI(prompt, ai) {
  const base = 'You are a nutrition coach and recipe expert. You MUST return ONLY valid JSON. Do not include any explanatory text, markdown formatting, or code blocks. Return pure JSON that matches the exact schema requested.';
  const offline = ' You cannot browse the web in this conversation: write the recipes yourself, and set any URL field to null rather than guessing a link.';
  const searchable = Boolean(PROVIDERS[ai.provider]?.models.search);
  const result = await chat(ai, [
    { role: 'system', content: base + (searchable ? '' : offline) },
    { role: 'user', content: prompt },
  ], { kind: 'search', temperature: 0.7, maxTokens: 2000 });
  return { content: result.content || 'No response received', model: result.model };
}

// ==================== BRING-YOUR-OWN AI KEY (any provider in ai_client.js) ====================

const VAULT_NOT_CONFIGURED = { error: "Key storage isn't configured on the server.", code: 'VAULT_NOT_CONFIGURED' };
const keyAad = (userId) => `user:${userId}`;
const keyStatus = (rec) => ({
  has_key: Boolean(rec?.enc),
  last4: rec?.enc ? rec.last4 ?? null : null,
  updated_at: rec?.enc && rec.updated_at ? new Date(rec.updated_at).toISOString() : null,
  provider: rec?.enc ? rec.provider || 'openrouter' : null,
  provider_label: rec?.enc ? providerLabel(rec.provider || 'openrouter') : null,
});

// Runs after authenticate. Loads + decrypts the user's key into req.ai = { provider, apiKey }.
async function requireApiKey(req, res, next) {
  try {
    if (!vaultConfigured()) return res.status(503).json(VAULT_NOT_CONFIGURED);
    const rec = await getUserApiKeyRecord(req.userId);
    if (!rec?.enc) {
      return res.status(400).json({ error: 'Add your AI provider key to use AI features.', code: 'API_KEY_REQUIRED' });
    }
    const provider = isProvider(rec.provider) ? rec.provider : 'openrouter';
    try {
      req.ai = { provider, apiKey: decryptSecret(rec.enc, keyAad(req.userId)) };
    } catch {
      // e.g. API_KEY_ENCRYPTION_KEY was rotated; the stored blob can't be read anymore.
      return res.status(400).json({ error: `Your saved ${providerLabel(provider)} key can't be read anymore. Add it again in Profile.`, code: 'API_KEY_REQUIRED' });
    }
    next();
  } catch (error) {
    next(error);
  }
}

// Non-AI route failures: bad input (our validation or a D1 constraint) is the client's 400; anything else is a 500
// whose details stay in the log, never in the response.
function serverError(res, error) {
  const msg = String(error?.message || error);
  if (error instanceof BadInput) return res.status(400).json({ error: error.message });
  if (/CHECK constraint failed|NOT NULL constraint failed|D1_TYPE_ERROR/i.test(msg)) return res.status(400).json({ error: 'Some of those values are not valid.' });
  console.error('Unhandled route error:', msg);
  return res.status(500).json({ error: 'Internal server error' });
}

// One place that turns AI failures into responses. Upstream key/credit errors map to contract codes.
function sendAiError(res, error, where, fallback = 'Internal server error') {
  const status = error instanceof AiError ? error.status : null;
  const label = providerLabel(error?.provider);
  if (error?.code === 'NO_VISION') {
    return res.status(400).json({ error: error.message, code: 'API_KEY_NO_VISION' });
  }
  if (status === 401 || status === 403) {
    return res.status(400).json({ error: `${label} rejected your saved key. Replace it in Profile.`, code: 'API_KEY_INVALID' });
  }
  // OpenAI and others report an empty balance as 429 "insufficient_quota"; OpenRouter uses 402.
  if (status === 402 || (status === 429 && /quota|credit|billing|balance/i.test(error.message))) {
    return res.status(402).json({ error: `Your ${label} account is out of credits.`, code: 'API_KEY_NO_CREDITS' });
  }
  if (status === 429) {
    return res.status(429).json({ error: `${label} is rate-limiting your key. Try again in a minute.`, code: 'API_RATE_LIMITED' });
  }
  if (status === 422) {
    return res.status(422).json({ error: error.message, code: 'AI_DECLINED' });
  }
  console.error(`Error in ${where}:`, error instanceof Error ? error.message : error);
  return res.status(500).json({ error: fallback });
}

// Public: the providers a key can be for (labels, key links, prefixes). No secrets.
app.get('/ai/providers', (req, res) => res.json({ providers: publicProviders() }));

app.get('/me/api_key', authenticate, async (req, res) => {
  try {
    res.json(keyStatus(await getUserApiKeyRecord(req.userId)));
  } catch (error) {
    console.error('Error in GET /me/api_key:', error.message);
    serverError(res, error);
  }
});

app.put('/me/api_key', authenticate, async (req, res) => {
  try {
    const apiKey = typeof req.body?.api_key === 'string' ? req.body.api_key.trim() : '';
    // Printable ASCII only: the key goes into an Authorization header.
    if (apiKey.length < 20 || apiKey.length > 300 || !/^[\x21-\x7e]+$/.test(apiKey)) {
      return res.status(400).json({ error: "That doesn't look like an API key. Paste the whole key, with no spaces.", code: 'API_KEY_FORMAT' });
    }
    // An explicit choice wins; otherwise the key's prefix decides (sk-or-, sk-ant-, AIza, gsk_, ...).
    const requested = typeof req.body?.provider === 'string' ? req.body.provider : '';
    const provider = isProvider(requested) ? requested : detectProvider(apiKey);
    if (!provider) {
      return res.status(400).json({ error: 'Pick which provider this key is for.', code: 'API_KEY_PROVIDER' });
    }
    const label = providerLabel(provider);
    if (!vaultConfigured()) return res.status(503).json(VAULT_NOT_CONFIGURED);

    const verdict = await verifyKey(provider, apiKey);
    if (verdict === 'invalid') {
      return res.status(400).json({ error: `${label} rejected that key. Check it, and that the provider is right.`, code: 'API_KEY_INVALID' });
    }
    if (verdict !== 'valid') {
      return res.status(502).json({ error: `Couldn't reach ${label} to check the key. Try again in a moment.`, code: 'API_KEY_UNVERIFIED' });
    }

    const rec = await setUserApiKey(req.userId, encryptSecret(apiKey, keyAad(req.userId)), apiKey.slice(-4), provider);
    res.json(keyStatus(rec));
  } catch (error) {
    console.error('Error in PUT /me/api_key:', error.message);
    serverError(res, error);
  }
});

app.delete('/me/api_key', authenticate, async (req, res) => {
  try {
    await clearUserApiKey(req.userId);
    res.json(keyStatus(null));
  } catch (error) {
    console.error('Error in DELETE /me/api_key:', error.message);
    serverError(res, error);
  }
});

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
      serverError(res, error);
    }
  }
});

// Login user
app.post('/auth/login', login);

// Logout user
app.post('/auth/logout', logout);

// Check authentication status
app.get('/auth/status', async (req, res, next) => {
  try {
    const user = await currentUser(req);
    res.json(user ? { authenticated: true, user: { id: user.id, email: user.email } } : { authenticated: false });
  } catch (error) {
    next(error);
  }
});

// ==================== PROFILE ROUTES ====================

// Get user profile
app.get('/me/profile', authenticate, async (req, res) => {
  try {
    const profile = await getProfile(req.userId);
    if (!profile) {
      return res.status(404).json({ error: 'Profile not found' });
    }
    res.json({ success: true, profile });
  } catch (error) {
    console.error('Error getting profile:', error);
    serverError(res, error);
  }
});

// Update user profile
app.put('/me/profile', authenticate, async (req, res) => {
  try {
    const updateData = { ...req.body };
    
    // Convert allergies array to JSON string if provided
    if (updateData.allergies && Array.isArray(updateData.allergies)) {
      updateData.allergies_json = updateData.allergies; // db.js updateProfile stringifies *_json once
      delete updateData.allergies;
    }
    
    // Convert preferences object to JSON string if provided
    if (updateData.preferences && typeof updateData.preferences === 'object') {
      updateData.preferences_json = updateData.preferences;
      delete updateData.preferences;
    }
    
    const updatedProfile = await updateProfile(req.userId, updateData);
    res.json({ success: true, profile: updatedProfile });
  } catch (error) {
    console.error('Error updating profile:', error);
    serverError(res, error);
  }
});

// Get calculated daily targets (BMR, TDEE, calories, macros)
app.get('/me/targets', authenticate, async (req, res) => {
  try {
    const profile = await getProfile(req.userId);
    if (!profile) {
      return res.status(404).json({ error: 'Profile not found' });
    }
    const targets = calculate_daily_targets(profile);
    if (!targets) {
      return res.status(400).json({
        error: 'Cannot compute targets. Please set age, sex, height (cm), and weight (kg) in your profile.',
      });
    }
    const debug = String(req.query.debug || '') === '1';
    if (!debug) {
      // Remove debug payload by default to keep response stable/clean.
      const { _debug, ...clean } = targets;
      return res.json({ success: true, targets: clean });
    }
    return res.json({ success: true, targets });
  } catch (error) {
    console.error('Error getting targets:', error);
    serverError(res, error);
  }
});

// ==================== MEAL PLANNING ROUTES ====================

// New authenticated meal planning endpoint (uses stored profile)
app.post('/me/plan_meal', authenticate, requireApiKey, async (req, res) => {
  try {
    // Get user profile
    const profile = await getProfile(req.userId);
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
    const result = await callPerplexityAPI(prompt, req.ai);

    // Parse JSON response
    const recipes = parseRecipeJSON(result.content);

    // Store session data
    await updateSessionData(
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
    sendAiError(res, error, 'plan_meal');
  }
});

// ==================== RECIPE ANALYSIS ROUTE ====================

// Analyze recipe from URL
app.post('/me/analyze_recipe', authenticate, requireApiKey, async (req, res) => {
  try {
    const { url } = req.body;
    
    if (!url) {
      return res.status(400).json({ error: 'Recipe URL is required' });
    }

    // Get user profile
    const profile = await getProfile(req.userId);
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
    const result = await callPerplexityAPI(prompt, req.ai);

    // Store session data
    await updateSessionData(
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
    sendAiError(res, error, 'analyze_recipe');
  }
});

// Search the web for recipes matching a short query/label.
// Returns JSON: { recipes: [ { title, url, source, summary } ] }
app.post('/me/search_recipe', authenticate, requireApiKey, async (req, res) => {
  try {
    const { query } = req.body || {};
    if (!query) return res.status(400).json({ error: 'query is required' });
    const prompt = `Search the web for recipes matching the query:\n\n${String(query)}\n\nReturn ONLY valid JSON with a top-level key "recipes" which is an array of objects with keys: title, url, source, summary (one-paragraph). Return at most 6 results.`;
    const result = await callPerplexityAPI(prompt, req.ai);
    const content = (result.content || '').replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/i, '');
    let parsed = {};
    try {
      parsed = JSON.parse(content);
    } catch (e) {
      const m = content.match(/\{[\s\S]*\}/);
      try {
        parsed = JSON.parse(m ? m[0] : content);
      } catch (e2) {
        return res.json({ success: true, recipes: [], debug: { raw: content, model: result.model } });
      }
    }
    return res.json({ success: true, recipes: parsed.recipes || [], debug: { model: result.model } });
  } catch (error) {
    sendAiError(res, error, '/me/search_recipe');
  }
});

// Debug helpers: development only, never registered in production.
if (process.env.NODE_ENV !== 'production') {
  // Echo path/query/headers to confirm the dev proxy works
  app.get('/debug/proxy', (req, res) => {
    res.json({ success: true, path: req.path, headers: req.headers, query: req.query });
  });

  // (The old /debug/label_image dataset writer is gone: a Worker has no persistent disk.)

  // Test CV responses with full debug info
  app.post('/debug/analyze_image', authenticate, requireApiKey, async (req, res) => {
    try {
      const { image_base64, image_url } = req.body || {};
      if (!image_base64 && !image_url) return res.status(400).json({ error: 'image_base64 or image_url required' });
      const result = await analyzeFoodImage({ image_base64, image_url, ai: req.ai });
      res.json({ success: true, candidates: result.candidates || [], debug: result.debug || null });
    } catch (error) {
      sendAiError(res, error, '/debug/analyze_image', 'analyze failed');
    }
  });
}

// ==================== INTAKE / ACTIVITY ROUTES ====================

// Helper to estimate calories burned from steps (very approximate)
function estimateCaloriesFromSteps(steps = 0, weightKg = null) {
  // Base estimate: ~0.04 kcal per step for a 70kg person (~200-300 kcal per 5000-8000 steps)
  const basePerStep = 0.04;
  const weightFactor = weightKg ? (Number(weightKg) / 70) : 1;
  return Math.round(steps * basePerStep * weightFactor);
}

// POST /me/intake - log a food item
app.post('/me/intake', authenticate, async (req, res) => {
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

    const result = await addIntake(req.userId, payload);

    // Return created item id and today's totals
    const totals = await getIntakeTotalsByDate(req.userId, date);
    res.status(201).json({ success: true, id: result.id, totals });
  } catch (error) {
    console.error('Error in POST /me/intake:', error);
    serverError(res, error);
  }
});

// POST /me/intake/from_image - analyze an uploaded image and return candidate foods (does NOT log)
app.post('/me/intake/from_image', authenticate, requireApiKey, async (req, res) => {
  try {
    const body = req.body || {};
    const date = body.date || new Date().toISOString().slice(0,10);

    // Accept either image_base64 or image_url in the request body
    const { image_base64, image_url } = body;
    if (!image_base64 && !image_url) return res.status(400).json({ error: 'image_base64 or image_url required' });

    const result = await analyzeFoodImage({ image_base64, image_url, ai: req.ai });

    // Map candidates to expected frontend schema
    const candidates = (result.candidates || []).map(c => ({
      label: c.label,
      calories: c.calories,
      protein_g: c.protein_g,
      carbs_g: c.carbs_g,
      fat_g: c.fat_g,
      confidence: c.confidence,
      portion_text: c.portion_text || null
    }));

    res.json({ success: true, date, candidates, debug: result.debug || null });
  } catch (error) {
    sendAiError(res, error, 'POST /me/intake/from_image');
  }
});

// GET /me/intake?date=YYYY-MM-DD - get items for a date + totals
app.get('/me/intake', authenticate, async (req, res) => {
  try {
    const date = req.query.date || new Date().toISOString().slice(0, 10);
    const items = await getIntakeByDate(req.userId, date);
    const totals = await getIntakeTotalsByDate(req.userId, date);
    res.json({ success: true, date, items, totals });
  } catch (error) {
    console.error('Error in GET /me/intake:', error);
    serverError(res, error);
  }
});

// GET /me/intake/calendar?month=YYYY-MM - monthly per-day totals
app.get('/me/intake/calendar', authenticate, async (req, res) => {
  try {
    const month = req.query.month;
    if (!month) return res.status(400).json({ error: 'month=YYYY-MM required' });
    const totals = await getIntakeCalendarTotals(req.userId, month);
    res.json({ success: true, month, totals });
  } catch (error) {
    console.error('Error in GET /me/intake/calendar:', error);
    serverError(res, error);
  }
});

// GET /me/intake/frequent - recent/frequent items for quick re-log
app.get('/me/intake/frequent', authenticate, async (req, res) => {
  try {
    const rows = await getFrequentIntake(req.userId, 30);
    res.json({ success: true, items: rows });
  } catch (error) {
    console.error('Error in GET /me/intake/frequent:', error);
    serverError(res, error);
  }
});

// Update an intake item
app.put('/me/intake/:id', authenticate, async (req, res) => {
  try {
    const id = Number(req.params.id);
    if (!id) return res.status(400).json({ error: 'Invalid id' });
    const fields = req.body || {};
    const result = await updateIntake(req.userId, id, fields);
    if (result.changes === 0) return res.status(404).json({ error: 'Not found or no changes' });
    res.json({ success: true, changes: result.changes });
  } catch (error) {
    console.error('Error in PUT /me/intake/:id', error);
    serverError(res, error);
  }
});

// Delete an intake item
app.delete('/me/intake/:id', authenticate, async (req, res) => {
  try {
    const id = Number(req.params.id);
    if (!id) return res.status(400).json({ error: 'Invalid id' });
    const result = await deleteIntake(req.userId, id);
    if (result.changes === 0) return res.status(404).json({ error: 'Not found' });
    res.json({ success: true });
  } catch (error) {
    console.error('Error in DELETE /me/intake/:id', error);
    serverError(res, error);
  }
});

// Saved foods endpoints
app.get('/me/saved_foods', authenticate, async (req, res) => {
  try {
    const rows = await getSavedFoods(req.userId);
    res.json({ success: true, items: rows });
  } catch (error) {
    console.error('Error in GET /me/saved_foods:', error);
    serverError(res, error);
  }
});

app.post('/me/saved_foods', authenticate, async (req, res) => {
  try {
    const body = req.body || {};
    if (!body.name || body.calories == null) return res.status(400).json({ error: 'name and calories required' });
    const result = await addSavedFood(req.userId, {
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
    serverError(res, error);
  }
});

app.delete('/me/saved_foods/:id', authenticate, async (req, res) => {
  try {
    const id = Number(req.params.id);
    if (!id) return res.status(400).json({ error: 'Invalid id' });
    const result = await deleteSavedFood(req.userId, id);
    if (result.changes === 0) return res.status(404).json({ error: 'Not found' });
    res.json({ success: true });
  } catch (error) {
    console.error('Error in DELETE /me/saved_foods/:id', error);
    serverError(res, error);
  }
});

// POST /me/activity - log steps/activity
app.post('/me/activity', authenticate, async (req, res) => {
  try {
    const body = req.body || {};
    const date = body.date || new Date().toISOString().slice(0, 10);
    const steps = Number(body.steps) || 0;
    const active_minutes = body.active_minutes != null ? Number(body.active_minutes) : null;

    const profile = (await getProfile(req.userId)) || {};
    const estimatedCalories = estimateCaloriesFromSteps(steps, profile.weight_kg);

    await addActivity(req.userId, { date, steps, active_minutes, calories_burned: estimatedCalories });

    res.status(201).json({ success: true, date, steps, calories_burned: estimatedCalories });
  } catch (error) {
    console.error('Error in POST /me/activity:', error);
    serverError(res, error);
  }
});

// GET /me/activity?date=YYYY-MM-DD - get activity for day
app.get('/me/activity', authenticate, async (req, res) => {
  try {
    const date = req.query.date || new Date().toISOString().slice(0, 10);
    const record = await getActivityByDate(req.userId, date);
    res.json({ success: true, date, activity: record });
  } catch (error) {
    console.error('Error in GET /me/activity:', error);
    serverError(res, error);
  }
});

// API index. "/" itself belongs to the frontend, which the same Worker serves as static assets.
app.get('/api', (req, res) => {
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
      // AI provider key (bring your own: OpenRouter, OpenAI, Anthropic, Gemini, Groq, ...)
      'GET /ai/providers': 'Providers a key can be for (public)',
      'GET /me/api_key': 'Key status: has_key, last4, updated_at (auth required)',
      'PUT /me/api_key': 'Save or replace your AI key; body { api_key, provider? } (auth required)',
      'DELETE /me/api_key': 'Remove your AI key (auth required)',
      // AI (auth + saved AI key required)
      'POST /me/plan_meal': 'Get meal plan using stored profile',
      'POST /me/analyze_recipe': 'Analyze recipe from URL',
      'POST /me/search_recipe': 'Search the web for recipes',
      'POST /me/intake/from_image': 'Estimate foods from a photo',
      'POST /me/coach': 'Coach observations and suggestions',
      'POST /me/coach_summary': 'Two-step coach summary',
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
app.get('/me/summary', authenticate, async (req, res) => {
  try {
    const month = req.query.month || new Date().toISOString().slice(0,7);
    const intakeTotals = (await getIntakeCalendarTotals(req.userId, month)) || [];
    const activityTotals = (await getActivityCalendarTotals(req.userId, month)) || [];

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
    serverError(res, error);
  }
});

// Helper: compute aggregated insights for last N days
// The last `days` days, oldest first. Two range queries, then days with no rows are filled with zeros.
async function computeInsightsForDays(userId, days = 7) {
  days = Math.trunc(days); // ?days=7.5 would otherwise index past the array
  const today = new Date();
  const dates = Array.from({ length: days }, (_, i) => {
    const d = new Date(today);
    d.setDate(today.getDate() - (days - 1 - i));
    return d;
  });
  const iso = (d) => d.toISOString().slice(0, 10);
  const [intakeRows, activityRows] = await Promise.all([
    getIntakeTotalsRange(userId, iso(dates[0]), iso(dates[days - 1])),
    getActivityRange(userId, iso(dates[0]), iso(dates[days - 1])),
  ]);
  const intakeBy = new Map(intakeRows.map((r) => [r.date, r]));
  const activityBy = new Map(activityRows.map((r) => [r.date, r]));
  return dates.map((d) => ({
    date: iso(d),
    intake: intakeBy.get(iso(d)) || { calories_total: 0, protein_total: 0, carbs_total: 0, fat_total: 0 },
    activity: activityBy.get(iso(d)) || { steps: 0, calories_burned: 0 },
    weekday: d.getDay(),
  }));
}

// GET /me/insights?days=7 - basic averages and simple insights
app.get('/me/insights', authenticate, async (req, res) => {
  try {
    const days = Math.min(90, Math.max(1, Number(req.query.days) || 7));
    const profile = (await getProfile(req.userId)) || {};
    const targets = calculate_daily_targets(profile) || {};

    const rows = await computeInsightsForDays(req.userId, days);

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
    serverError(res, error);
  }
});

// POST /me/coach - generate compact stats and ask LLM for observations + suggestions
app.post('/me/coach', authenticate, requireApiKey, async (req, res) => {
  try {
    const days = Math.min(90, Math.max(1, Number(req.body.days) || 7));
    const profile = (await getProfile(req.userId)) || {};
    const targets = calculate_daily_targets(profile) || {};

    const rows = await computeInsightsForDays(req.userId, days);

    // Build compact stats
    const stats = { days: rows.length, days_data: [] };
    for (const r of rows) {
      stats.days_data.push({ date: r.date, calories: Number(r.intake.calories_total || 0), protein: Number(r.intake.protein_total || 0), carbs: Number(r.intake.carbs_total || 0), fat: Number(r.intake.fat_total || 0), steps: Number(r.activity.steps || 0) });
    }

    // Compact summary text for LLM
    let prompt = `You are an evidence-based nutrition coach. The user profile and compact stats are below. Provide 3-5 concise observations about patterns and exactly 3 very small, specific suggestions the user can try next week. Return ONLY valid JSON with keys "observations" (array) and "suggestions" (array).\n\n`;
    prompt += `Profile Targets: ${targets.calories || 'N/A'} kcal/day, ${targets.protein_g || 'N/A'} g protein. Goal: ${targets.goal || 'N/A'}.`;
    prompt += `\nLast ${rows.length} days:\n`;
    for (const r of rows) {
      prompt += `- ${r.date}: ${Number(r.intake.calories_total || 0)} kcal, ${Number(r.intake.protein_total || 0)}g protein, ${Number(r.activity.steps || 0)} steps\n`;
    }

    prompt += `\nGive observations in plain, actionable language and suggestions that are specific and measurable (e.g., "add 20g protein at breakfast\").`;

    const result = await callPerplexityAPI(prompt, req.ai);

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

    // Store session data for debugging. Awaited: a Worker may stop work left running after the response.
    await updateSessionData(req.userId, JSON.stringify({ prompt, days }), JSON.stringify(result))
      .catch((e) => console.error('session save failed', e.message));

    res.json({ success: true, raw: result.content, parsed });
  } catch (error) {
    sendAiError(res, error, 'POST /me/coach');
  }
});

// POST /me/coach_summary - 2-step draft-then-refine coach flow
app.post('/me/coach_summary', authenticate, requireApiKey, async (req, res) => {
  try {
    const days = Math.min(90, Math.max(1, Number(req.body.days) || 7));
    const profile = (await getProfile(req.userId)) || {};
    const targets = calculate_daily_targets(profile) || {};

    const rows = await computeInsightsForDays(req.userId, days);

    // Build compact summary for the model
    let compact = `Profile targets: ${targets.calories || 'N/A'} kcal/day, ${targets.protein_g || 'N/A'} g protein. Goal: ${targets.goal || 'N/A'}.`;
    compact += `\nLast ${rows.length} days:\n`;
    for (const r of rows) {
      compact += `- ${r.date}: ${Number(r.intake.calories_total || 0)} kcal, ${Number(r.intake.protein_total || 0)}g protein, ${Number(r.activity.steps || 0)} steps\n`;
    }

    // First call: ask for analysis with reasoning
    const messages1 = [
      { role: 'user', content: `You are an evidence-based nutrition coach. Here are compact stats:\n${compact}\nPlease provide concise observations and 3 specific suggestions.` }
    ];

    const first = await chat(req.ai, messages1, { maxTokens: 800 });

    // Second call: feed back the first answer + ask it to think again
    const messages2 = [
      { role: 'user', content: compact },
      { role: 'assistant', content: first.content },
      { role: 'user', content: 'Are you sure? Think carefully and refine your suggestions if needed.' }
    ];

    const second = await chat(req.ai, messages2, { maxTokens: 800 });

    // Store session data for debugging. Awaited: a Worker may stop work left running after the response.
    await updateSessionData(req.userId, JSON.stringify({ compact, days }), JSON.stringify({ first, second }))
      .catch((e) => console.error('session save failed', e.message));

    res.json({ success: true, coach_text: second.content });
  } catch (error) {
    sendAiError(res, error, 'POST /me/coach_summary', 'Failed to generate coach summary');
  }
});

// Health check endpoint
app.get('/health', (req, res) => {
  res.status(200).json({ status: 'ok', timestamp: new Date().toISOString() });
});

// Global error handling middleware
app.use((err, req, res, next) => {
  // body-parser errors carry the raw request text on err.body (passwords, API keys): never log the object.
  if (err.type === 'entity.parse.failed') return res.status(400).json({ error: 'Invalid JSON body' });
  if (err.status >= 400 && err.status < 500) return res.status(err.status).json({ error: err.expose ? err.message : 'Bad request' });
  console.error('Unhandled error:', err.stack || err.message);
  res.status(500).json({ error: 'Internal Server Error' });
});

// The Workers runtime routes each request to this in-process server (no real socket is opened).
// API paths reach it via assets.run_worker_first in wrangler.jsonc; everything else is the frontend.
const PORT = 8080;
app.listen(PORT);
export default httpServerHandler({ port: PORT });


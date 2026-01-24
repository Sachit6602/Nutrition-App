import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import session from 'express-session';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { authenticate, register, login, logout } from './auth.js';
import { getProfile, updateProfile, updateSessionData, getUserById } from './db.js';

// Get current directory for ES modules
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Load .env file from backend directory
dotenv.config({ path: join(__dirname, '.env') });

const app = express();
const PORT = process.env.PORT || 3001;

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
  origin: ['http://localhost:3000', 'http://127.0.0.1:3000'], // Frontend URL
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

// Helper function to construct prompt from profile data and optional overrides
function constructPrompt(profile, overrides = {}) {
  const {
    goal = overrides.goal,
    target_calories = overrides.targetCalories,
    allergies = overrides.allergies || [],
    diet_type = overrides.dietType || 'none',
    preferences = overrides.preferences || {},
    userRequest = overrides.request
  } = { ...profile, ...overrides };

  let prompt = `Act as a nutrition coach. Use web search to find recipes that match the following requirements:\n\n`;

  // Goals
  if (goal) {
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

  prompt += `\nPlease provide:\n`;
  prompt += `1. Recipe name and source URL\n`;
  prompt += `2. Detailed step-by-step cooking instructions\n`;
  prompt += `3. Complete list of ingredients with quantities\n`;
  prompt += `4. Estimated calories per serving (calculate if not available)\n`;
  prompt += `5. Key macronutrients (protein, carbs, fats) and other important nutrients\n`;
  prompt += `6. Brief description\n`;
  prompt += `7. Confirmation that it avoids the listed allergies and matches the diet type\n`;
  prompt += `\nFormat your response in a clear, structured way. If possible, provide 2-3 recipe options.`;

  return prompt;
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
        content: 'You are a nutrition coach and recipe expert. Always provide structured, accurate information about recipes, nutrition, and dietary restrictions. Format your responses clearly with sections for steps, ingredients, nutrients, and calories.',
      },
      {
        role: 'user',
        content: prompt,
      },
    ],
    temperature: 0.7,
    max_tokens: 2000, // Reduced to fit within credit limits
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

// ==================== MEAL PLANNING ROUTES ====================

// New authenticated meal planning endpoint (uses stored profile)
app.post('/me/plan_meal', authenticate, async (req, res) => {
  try {
    // Get user profile
    const profile = getProfile(req.userId);
    if (!profile) {
      return res.status(404).json({ error: 'Profile not found. Please set up your profile first.' });
    }

    // Allow optional overrides from request body
    const overrides = {
      goal: req.body.goal,
      targetCalories: req.body.targetCalories,
      allergies: req.body.allergies,
      dietType: req.body.dietType,
      preferences: req.body.preferences,
      request: req.body.request
    };

    // Construct prompt using profile data
    const prompt = constructPrompt(profile, overrides);

    // Call Perplexity API
    const result = await callPerplexityAPI(prompt);

    // Store session data
    updateSessionData(
      req.userId,
      JSON.stringify({ prompt, overrides }),
      JSON.stringify(result)
    );

    res.json({
      success: true,
      recipes: result.content,
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

    res.json({
      success: true,
      recipes: result.content,
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
      // Meal Planning
      'POST /me/plan_meal': 'Get meal plan using stored profile (auth required)',
      'POST /api/plan_meal': 'Get meal plan (legacy, no auth)',
      // Recipe Analysis
      'POST /me/analyze_recipe': 'Analyze recipe from URL (auth required)',
      // Health
      'GET /health': 'Health check'
    }
  });
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


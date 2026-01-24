// Simple API test script
// Run with: node test-api.js

const API_BASE = 'http://localhost:3001';

// Helper function to make requests
async function request(method, endpoint, data = null, cookies = '') {
  const options = {
    method,
    headers: {
      'Content-Type': 'application/json',
    },
  };

  if (cookies) {
    options.headers['Cookie'] = cookies;
  }

  if (data) {
    options.body = JSON.stringify(data);
  }

  try {
    const response = await fetch(`${API_BASE}${endpoint}`, options);
    const text = await response.text();
    let json;
    try {
      json = JSON.parse(text);
    } catch (e) {
      json = { raw: text };
    }

    // Extract cookies from response
    const setCookie = response.headers.get('set-cookie');
    const sessionCookie = setCookie ? setCookie.split(';')[0] : '';

    return {
      status: response.status,
      data: json,
      cookies: sessionCookie || cookies,
    };
  } catch (error) {
    return {
      status: 0,
      error: error.message,
      cookies: cookies,
    };
  }
}

// Test functions
async function testAuth() {
  console.log('\n=== Testing Authentication ===\n');

  // Test 1: Register a new user
  console.log('1. Registering new user...');
  const registerResult = await request('POST', '/auth/register', {
    email: 'test@example.com',
    password: 'test123',
  });
  console.log('Status:', registerResult.status);
  console.log('Response:', JSON.stringify(registerResult.data, null, 2));
  let cookies = registerResult.cookies;

  if (registerResult.status === 400 && registerResult.data.error?.includes('already registered')) {
    console.log('   User already exists, trying to login instead...');
    const loginResult = await request('POST', '/auth/login', {
      email: 'test@example.com',
      password: 'test123',
    });
    cookies = loginResult.cookies;
    console.log('   Login Status:', loginResult.status);
    console.log('   Login Response:', JSON.stringify(loginResult.data, null, 2));
  }

  // Test 2: Check auth status
  console.log('\n2. Checking authentication status...');
  const statusResult = await request('GET', '/auth/status', null, cookies);
  console.log('Status:', statusResult.status);
  console.log('Response:', JSON.stringify(statusResult.data, null, 2));

  return cookies;
}

async function testProfile(cookies) {
  console.log('\n=== Testing Profile Management ===\n');

  // Test 1: Get profile (should be empty initially)
  console.log('1. Getting current profile...');
  const getResult = await request('GET', '/me/profile', null, cookies);
  console.log('Status:', getResult.status);
  console.log('Response:', JSON.stringify(getResult.data, null, 2));

  // Test 2: Update profile
  console.log('\n2. Updating profile...');
  const updateData = {
    goal: 'lose',
    target_calories: 1800,
    height_cm: 170,
    weight_kg: 70,
    activity_level: 'medium',
    allergies: ['peanuts', 'dairy'],
    diet_type: 'veg',
    preferences: {
      cuisine: 'italian',
      cookingTime: '30 minutes',
      mealType: 'dinner',
    },
  };
  const updateResult = await request('PUT', '/me/profile', updateData, cookies);
  console.log('Status:', updateResult.status);
  console.log('Response:', JSON.stringify(updateResult.data, null, 2));

  // Test 3: Get updated profile
  console.log('\n3. Getting updated profile...');
  const getUpdatedResult = await request('GET', '/me/profile', null, cookies);
  console.log('Status:', getUpdatedResult.status);
  console.log('Response:', JSON.stringify(getUpdatedResult.data, null, 2));
}

async function testMealPlanning(cookies) {
  console.log('\n=== Testing Meal Planning ===\n');

  console.log('Requesting meal plan...');
  const mealResult = await request(
    'POST',
    '/me/plan_meal',
    {
      request: 'I want a healthy breakfast with eggs',
    },
    cookies
  );
  console.log('Status:', mealResult.status);
  if (mealResult.status === 200) {
    console.log('Success! Recipe received.');
    console.log('Recipe preview:', mealResult.data.recipes?.substring(0, 200) + '...');
  } else {
    console.log('Error:', JSON.stringify(mealResult.data, null, 2));
  }
}

async function testLegacyEndpoint() {
  console.log('\n=== Testing Legacy Endpoint (No Auth) ===\n');

  console.log('Testing legacy /api/plan_meal endpoint...');
  const legacyResult = await request('POST', '/api/plan_meal', {
    goals: 'lose',
    targetCalories: 1800,
    allergies: ['peanuts'],
    request: 'healthy lunch',
  });
  console.log('Status:', legacyResult.status);
  if (legacyResult.status === 200) {
    console.log('Success! Recipe received.');
    console.log('Recipe preview:', legacyResult.data.recipes?.substring(0, 200) + '...');
  } else {
    console.log('Error:', JSON.stringify(legacyResult.data, null, 2));
  }
}

// Main test runner
async function runTests() {
  console.log('🚀 Starting API Tests...\n');
  console.log('Make sure your server is running on http://localhost:3001\n');

  try {
    // Test authentication
    const cookies = await testAuth();

    if (!cookies) {
      console.log('\n❌ Authentication failed. Cannot continue with other tests.');
      return;
    }

    // Test profile management
    await testProfile(cookies);

    // Test meal planning (this will call Perplexity API, so it might take a moment)
    console.log('\n⚠️  Note: Meal planning test will call Perplexity API and may take 10-30 seconds...');
    await testMealPlanning(cookies);

    // Test legacy endpoint
    await testLegacyEndpoint();

    console.log('\n✅ All tests completed!');
  } catch (error) {
    console.error('\n❌ Test error:', error);
  }
}

// Run tests
runTests();

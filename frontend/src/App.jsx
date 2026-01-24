import { useState, useEffect } from 'react';

// Use empty string to use relative URLs (goes through Vite proxy)
const API_BASE = '';

function App() {
  // Auth state
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [user, setUser] = useState(null);
  const [showLogin, setShowLogin] = useState(true);
  const [authLoading, setAuthLoading] = useState(false);
  const [authError, setAuthError] = useState(null);

  // Form state
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');

  // Profile state
  const [profile, setProfile] = useState(null);
  const [profileLoading, setProfileLoading] = useState(false);
  const [showProfileForm, setShowProfileForm] = useState(false);
  const [profileRequired, setProfileRequired] = useState(false);

  // Meal planning state
  const [goals, setGoals] = useState('maintain');
  const [targetCalories, setTargetCalories] = useState('');
  const [allergies, setAllergies] = useState('');
  const [cuisine, setCuisine] = useState('');
  const [cookingTime, setCookingTime] = useState('');
  const [mealType, setMealType] = useState('');
  const [userRequest, setUserRequest] = useState('');
  const [loading, setLoading] = useState(false);
  const [response, setResponse] = useState(null);
  const [error, setError] = useState(null);

  // Check auth status on mount
  useEffect(() => {
    checkAuthStatus();
  }, []);

  // Load profile when authenticated
  useEffect(() => {
    if (isAuthenticated) {
      loadProfile();
    }
  }, [isAuthenticated]);

  // Populate form from profile
  useEffect(() => {
    if (profile) {
      setGoals(profile.goal || 'maintain');
      setTargetCalories(profile.target_calories || '');
      setAllergies(Array.isArray(profile.allergies) ? profile.allergies.join(', ') : '');
      setCuisine(profile.preferences?.cuisine || '');
      setCookingTime(profile.preferences?.cookingTime || '');
      setMealType(profile.preferences?.mealType || '');
    }
  }, [profile]);

  const checkAuthStatus = async () => {
    try {
      const res = await fetch(`${API_BASE}/auth/status`, {
        credentials: 'include',
      });
      const text = await res.text();
      if (!text) return;
      
      const data = JSON.parse(text);
      if (data.authenticated) {
        setIsAuthenticated(true);
        setUser(data.user);
      }
    } catch (err) {
      console.error('Auth check failed:', err);
    }
  };

  const loadProfile = async () => {
    setProfileLoading(true);
    try {
      const res = await fetch(`${API_BASE}/me/profile`, {
        credentials: 'include',
      });
      if (res.ok) {
        const text = await res.text();
        if (text) {
          const data = JSON.parse(text);
          const loadedProfile = data.profile;
          setProfile(loadedProfile);
          
          // Check if profile is empty/incomplete (new user)
          const isProfileEmpty = !loadedProfile || 
            (!loadedProfile.goal && !loadedProfile.target_calories && 
             (!loadedProfile.allergies || loadedProfile.allergies.length === 0));
          
          if (isProfileEmpty) {
            setProfileRequired(true);
            setShowProfileForm(true);
          } else {
            setProfileRequired(false);
          }
        }
      } else if (res.status === 404) {
        // Profile doesn't exist yet - show form
        setProfileRequired(true);
        setShowProfileForm(true);
      }
    } catch (err) {
      console.error('Failed to load profile:', err);
      // If error, assume profile doesn't exist
      setProfileRequired(true);
      setShowProfileForm(true);
    } finally {
      setProfileLoading(false);
    }
  };

  const handleRegister = async (e) => {
    e.preventDefault();
    setAuthLoading(true);
    setAuthError(null);

    if (password !== confirmPassword) {
      setAuthError('Passwords do not match');
      setAuthLoading(false);
      return;
    }

    try {
      const res = await fetch(`${API_BASE}/auth/register`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ email, password }),
      });

      const text = await res.text();
      if (!text) {
        throw new Error('Empty response from server');
      }

      let data;
      try {
        data = JSON.parse(text);
      } catch (parseErr) {
        console.error('Response text:', text);
        throw new Error('Invalid response from server');
      }

      if (!res.ok) {
        throw new Error(data.error || 'Registration failed');
      }

      setIsAuthenticated(true);
      setUser(data.user);
      setEmail('');
      setPassword('');
      setConfirmPassword('');
      // Profile will be loaded automatically via useEffect
    } catch (err) {
      setAuthError(err instanceof Error ? err.message : 'Registration failed');
    } finally {
      setAuthLoading(false);
    }
  };

  const handleLogin = async (e) => {
    e.preventDefault();
    setAuthLoading(true);
    setAuthError(null);

    try {
      const res = await fetch(`${API_BASE}/auth/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ email, password }),
      });

      const text = await res.text();
      if (!text) {
        throw new Error('Empty response from server');
      }

      let data;
      try {
        data = JSON.parse(text);
      } catch (parseErr) {
        console.error('Response text:', text);
        throw new Error('Invalid response from server');
      }

      if (!res.ok) {
        throw new Error(data.error || 'Login failed');
      }

      setIsAuthenticated(true);
      setUser(data.user);
      setEmail('');
      setPassword('');
    } catch (err) {
      setAuthError(err instanceof Error ? err.message : 'Login failed');
    } finally {
      setAuthLoading(false);
    }
  };

  const handleLogout = async () => {
    try {
      await fetch(`${API_BASE}/auth/logout`, {
        method: 'POST',
        credentials: 'include',
      });
      setIsAuthenticated(false);
      setUser(null);
      setProfile(null);
      setResponse(null);
    } catch (err) {
      console.error('Logout failed:', err);
    }
  };

  const handleSaveProfile = async () => {
    setProfileLoading(true);
    try {
      const allergiesList = allergies
        .split(',')
        .map(a => a.trim())
        .filter(a => a.length > 0);

      const profileData = {
        goal: goals,
        target_calories: targetCalories ? parseInt(targetCalories) : null,
        allergies: allergiesList,
        diet_type: 'none', // You can add a diet type selector if needed
        preferences: {
          cuisine: cuisine || undefined,
          cookingTime: cookingTime || undefined,
          mealType: mealType || undefined,
        },
      };

      const res = await fetch(`${API_BASE}/me/profile`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify(profileData),
      });

      if (!res.ok) {
        const text = await res.text();
        let errorMsg = 'Failed to save profile';
        try {
          const errorData = JSON.parse(text);
          errorMsg = errorData.error || errorMsg;
        } catch (e) {
          // Use default error message
        }
        throw new Error(errorMsg);
      }

      const text = await res.text();
      if (text) {
        const data = JSON.parse(text);
        const updatedProfile = data.profile;
        setProfile(updatedProfile);
        
        // Check if profile is now complete
        const isProfileComplete = updatedProfile && 
          (updatedProfile.goal || updatedProfile.target_calories || 
           (updatedProfile.allergies && updatedProfile.allergies.length > 0));
        
        if (isProfileComplete) {
          setProfileRequired(false);
          setShowProfileForm(false);
        }
      }
    } catch (err) {
      setAuthError(err instanceof Error ? err.message : 'Failed to save profile');
    } finally {
      setProfileLoading(false);
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setLoading(true);
    setError(null);
    setResponse(null);

    try {
      const res = await fetch(`${API_BASE}/me/plan_meal`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({
          request: userRequest || undefined,
        }),
      });

      const text = await res.text();
      if (!text) {
        throw new Error('Empty response from server');
      }

      let data;
      try {
        data = JSON.parse(text);
      } catch (parseErr) {
        console.error('Response text:', text);
        throw new Error('Invalid response from server');
      }

      if (!res.ok) {
        throw new Error(data.error || 'Failed to get meal plan');
      }

      setResponse(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'An error occurred');
    } finally {
      setLoading(false);
    }
  };

  // Show login/register if not authenticated
  if (!isAuthenticated) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-green-50 to-blue-50 flex items-center justify-center py-8 px-4">
        <div className="max-w-md w-full bg-white rounded-lg shadow-lg p-8">
          <h1 className="text-3xl font-bold text-center mb-2 text-gray-800">
            🥗 Nutrition App
          </h1>
          <p className="text-center text-gray-600 mb-6">
            AI-powered meal planning with Perplexity Sonar
          </p>

          <div className="flex gap-2 mb-6">
            <button
              onClick={() => {
                setShowLogin(true);
                setAuthError(null);
              }}
              className={`flex-1 py-2 px-4 rounded-md font-medium ${
                showLogin
                  ? 'bg-green-600 text-white'
                  : 'bg-gray-200 text-gray-700 hover:bg-gray-300'
              }`}
            >
              Login
            </button>
            <button
              onClick={() => {
                setShowLogin(false);
                setAuthError(null);
              }}
              className={`flex-1 py-2 px-4 rounded-md font-medium ${
                !showLogin
                  ? 'bg-green-600 text-white'
                  : 'bg-gray-200 text-gray-700 hover:bg-gray-300'
              }`}
            >
              Register
            </button>
          </div>

          {authError && (
            <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-md mb-4">
              {authError}
            </div>
          )}

          {showLogin ? (
            <form onSubmit={handleLogin} className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Email
                </label>
                <input
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  required
                  className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-green-500"
                  placeholder="your@email.com"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Password
                </label>
                <input
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  required
                  className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-green-500"
                  placeholder="••••••••"
                />
              </div>
              <button
                type="submit"
                disabled={authLoading}
                className="w-full bg-green-600 text-white py-3 px-4 rounded-md font-medium hover:bg-green-700 focus:outline-none focus:ring-2 focus:ring-green-500 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {authLoading ? 'Logging in...' : 'Login'}
              </button>
            </form>
          ) : (
            <form onSubmit={handleRegister} className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Email
                </label>
                <input
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  required
                  className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-green-500"
                  placeholder="your@email.com"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Password
                </label>
                <input
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  required
                  minLength={6}
                  className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-green-500"
                  placeholder="••••••••"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Confirm Password
                </label>
                <input
                  type="password"
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  required
                  minLength={6}
                  className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-green-500"
                  placeholder="••••••••"
                />
              </div>
              <button
                type="submit"
                disabled={authLoading}
                className="w-full bg-green-600 text-white py-3 px-4 rounded-md font-medium hover:bg-green-700 focus:outline-none focus:ring-2 focus:ring-green-500 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {authLoading ? 'Registering...' : 'Register'}
              </button>
            </form>
          )}
        </div>
      </div>
    );
  }

  // Main app (authenticated)
  return (
    <div className="min-h-screen bg-gradient-to-br from-green-50 to-blue-50 py-8 px-4">
      <div className="max-w-4xl mx-auto">
        <div className="flex justify-between items-center mb-6">
          <div>
            <h1 className="text-4xl font-bold text-gray-800">🥗 Nutrition App</h1>
            <p className="text-gray-600">Welcome, {user?.email}</p>
          </div>
          <div className="flex gap-2">
            {!profileRequired && (
              <button
                onClick={() => setShowProfileForm(!showProfileForm)}
                className="bg-blue-600 text-white py-2 px-4 rounded-md font-medium hover:bg-blue-700"
              >
                {showProfileForm ? 'Hide Profile' : 'Edit Profile'}
              </button>
            )}
            <button
              onClick={handleLogout}
              className="bg-red-600 text-white py-2 px-4 rounded-md font-medium hover:bg-red-700"
            >
              Logout
            </button>
          </div>
        </div>

        {/* Profile Form - Required for new users */}
        {showProfileForm && (
          <div className="bg-white rounded-lg shadow-lg p-6 mb-6">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-2xl font-bold text-gray-800">
                {profileRequired ? 'Complete Your Profile' : 'Your Profile'}
              </h2>
              {profileRequired && (
                <span className="bg-yellow-100 text-yellow-800 text-sm font-medium px-3 py-1 rounded-full">
                  Required
                </span>
              )}
            </div>
            {profileRequired && (
              <div className="bg-blue-50 border border-blue-200 text-blue-700 px-4 py-3 rounded-md mb-4">
                <p className="font-medium">Welcome! 👋</p>
                <p className="text-sm mt-1">
                  Please fill out your profile to get personalized meal recommendations. 
                  This information helps us suggest recipes that match your dietary needs and goals.
                </p>
              </div>
            )}
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Weight Goal {profileRequired && <span className="text-red-500">*</span>}
                </label>
                <div className="flex gap-4">
                  {['gain', 'lose', 'maintain'].map((goal) => (
                    <label key={goal} className="flex items-center">
                      <input
                        type="radio"
                        value={goal}
                        checked={goals === goal}
                        onChange={(e) => setGoals(e.target.value)}
                        className="mr-2"
                        required={profileRequired}
                      />
                      {goal.charAt(0).toUpperCase() + goal.slice(1)} Weight
                    </label>
                  ))}
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Target Calories (optional)
                </label>
                <input
                  type="number"
                  value={targetCalories}
                  onChange={(e) => setTargetCalories(e.target.value)}
                  placeholder="e.g., 2000"
                  className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-green-500"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Allergies / Dietary Restrictions
                </label>
                <input
                  type="text"
                  value={allergies}
                  onChange={(e) => setAllergies(e.target.value)}
                  placeholder="e.g., nuts, dairy, gluten (comma-separated)"
                  className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-green-500"
                />
              </div>

              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Cuisine (optional)
                  </label>
                  <input
                    type="text"
                    value={cuisine}
                    onChange={(e) => setCuisine(e.target.value)}
                    placeholder="e.g., Italian, Asian"
                    className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-green-500"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Cooking Time (optional)
                  </label>
                  <input
                    type="text"
                    value={cookingTime}
                    onChange={(e) => setCookingTime(e.target.value)}
                    placeholder="e.g., under 30 minutes"
                    className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-green-500"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Meal Type (optional)
                  </label>
                  <input
                    type="text"
                    value={mealType}
                    onChange={(e) => setMealType(e.target.value)}
                    placeholder="e.g., breakfast, dinner"
                    className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-green-500"
                  />
                </div>
              </div>

              <button
                onClick={handleSaveProfile}
                disabled={profileLoading}
                className="w-full bg-green-600 text-white py-3 px-4 rounded-md font-medium hover:bg-green-700 focus:outline-none focus:ring-2 focus:ring-green-500 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {profileLoading 
                  ? 'Saving...' 
                  : profileRequired 
                    ? 'Save Profile & Continue' 
                    : 'Save Profile'}
              </button>
            </div>
          </div>
        )}

        {/* Meal Planning Form - Only show if profile is complete */}
        {!profileRequired && (
          <div className="bg-white rounded-lg shadow-lg p-6 mb-6">
            <h2 className="text-2xl font-bold mb-4 text-gray-800">Get Meal Plan</h2>
            <p className="text-gray-600 mb-4">
              Your saved preferences will be used automatically. You can add a special request below.
            </p>
            <form onSubmit={handleSubmit} className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Special Request (optional)
                </label>
                <textarea
                  value={userRequest}
                  onChange={(e) => setUserRequest(e.target.value)}
                  placeholder="e.g., 'high-protein dinner under 600 kcal' or 'vegetarian meal prep ideas'"
                  rows={3}
                  className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-green-500"
                />
              </div>

              <button
                type="submit"
                disabled={loading}
                className="w-full bg-green-600 text-white py-3 px-4 rounded-md font-medium hover:bg-green-700 focus:outline-none focus:ring-2 focus:ring-green-500 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {loading ? 'Searching for recipes...' : 'Get Meal Plan'}
              </button>
            </form>
          </div>
        )}

        {/* Error Display */}
        {error && (
          <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-md mb-6">
            <strong>Error:</strong> {error}
          </div>
        )}

        {/* Response Display */}
        {response && (
          <div className="bg-white rounded-lg shadow-lg p-6">
            <h2 className="text-2xl font-bold mb-4 text-gray-800">Recipe Suggestions</h2>
            <div className="prose max-w-none">
              <pre className="whitespace-pre-wrap text-sm text-gray-700 bg-gray-50 p-4 rounded-md">
                {response.recipes}
              </pre>
            </div>
            {response.metadata && (
              <div className="mt-4 text-xs text-gray-500">
                Model: {response.metadata.model}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

export default App;

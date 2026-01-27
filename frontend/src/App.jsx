import { useState, useEffect, useCallback } from 'react';

// Use empty string to use relative URLs (goes through Vite proxy)
const API_BASE = '';



function App() {
  // Auth 
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [user, setUser] = useState(null);
  const [showLogin, setShowLogin] = useState(true);
  const [authLoading, setAuthLoading] = useState(false);
  const [authError, setAuthError] = useState(null);

  // Form 
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');

  // Profile
  const [profile, setProfile] = useState(null);
  const [profileLoading, setProfileLoading] = useState(false);
  const [showProfileForm, setShowProfileForm] = useState(false);
  const [profileRequired, setProfileRequired] = useState(false);

  // Daily targets (BMR/TDEE/macros)
  const [targets, setTargets] = useState(null);
  const [targetsLoading, setTargetsLoading] = useState(false);

  // Meal planning
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

  // Profile form fields for calculator
  const [age, setAge] = useState('');
  const [sex, setSex] = useState('');
  const [heightCm, setHeightCm] = useState('');
  const [weightKg, setWeightKg] = useState('');
  const [activityLevel, setActivityLevel] = useState('medium');
  const [intensityPercent, setIntensityPercent] = useState(0);

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
      setTargetCalories(profile.target_calories ?? '');
      setAllergies(Array.isArray(profile.allergies) ? profile.allergies.join(', ') : '');
      setCuisine(profile.preferences?.cuisine || '');
      setCookingTime(profile.preferences?.cookingTime || '');
      setMealType(profile.preferences?.mealType || '');
      setAge(profile.age ?? '');
      setSex(profile.sex || '');
      setHeightCm(profile.height_cm ?? '');
      setWeightKg(profile.weight_kg ?? '');
      setActivityLevel(profile.activity_level || 'medium');
      setIntensityPercent(profile.intensity_percent ?? 0);
    }
  }, [profile]);

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
        setProfileRequired(true);
        setShowProfileForm(true);
      }
    } catch (err) {
      console.error('Failed to load profile:', err);
      setProfileRequired(true);
      setShowProfileForm(true);
    } finally {
      setProfileLoading(false);
    }
  };

  const loadTargets = useCallback(async () => {
    setTargetsLoading(true);
    setTargets(null);
    try {
      const res = await fetch(`${API_BASE}/me/targets`, { credentials: 'include' });
      const text = await res.text();
      if (!text) return;
      const data = JSON.parse(text);
      if (res.ok && data.targets) {
        setTargets(data.targets);
      }
    } catch (err) {
      console.error('Failed to load targets:', err);
    } finally {
      setTargetsLoading(false);
    }
  }, []);


  // Load daily targets when authenticated and profile complete
  useEffect(() => {
    if (isAuthenticated && !profileRequired) {
      loadTargets();
    } else {
      setTargets(null);
    }
  }, [isAuthenticated, profileRequired, profile, loadTargets]);

  // Reset intensity to sensible defaults when goal changes
  useEffect(() => {
    if (goals === 'lose' && intensityPercent > 0) setIntensityPercent(-20);
    if (goals === 'gain' && intensityPercent < 0) setIntensityPercent(10);
  }, [goals]);

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
        target_calories: targetCalories ? parseInt(targetCalories, 10) : null,
        age: age ? parseInt(age, 10) : null,
        sex: sex || null,
        height_cm: heightCm ? parseInt(heightCm, 10) : null,
        weight_kg: weightKg ? parseFloat(weightKg) : null,
        activity_level: activityLevel || null,
        intensity_percent: intensityPercent,
        allergies: allergiesList,
        diet_type: 'none',
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
    if (e && e.preventDefault) {
      e.preventDefault();
    }
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
            🥗 Healthy Diet Tracker Assistant
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
            <h1 className="text-4xl font-bold text-gray-800">🥗 Healthy Diet Tracker Assistant</h1>
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
                  {['gain', 'lose', 'maintain'].map((g) => (
                    <label key={g} className="flex items-center">
                      <input
                        type="radio"
                        value={g}
                        checked={goals === g}
                        onChange={(e) => setGoals(e.target.value)}
                        className="mr-2"
                        required={profileRequired}
                      />
                      {g.charAt(0).toUpperCase() + g.slice(1)} Weight
                    </label>
                  ))}
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">Age</label>
                  <input
                    type="number"
                    min={1}
                    max={120}
                    value={age}
                    onChange={(e) => setAge(e.target.value)}
                    placeholder="e.g. 30"
                    className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-green-500"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">Sex</label>
                  <select
                    value={sex}
                    onChange={(e) => setSex(e.target.value)}
                    className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-green-500"
                  >
                    <option value="">Select</option>
                    <option value="male">Male</option>
                    <option value="female">Female</option>
                  </select>
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">Height (cm)</label>
                  <input
                    type="number"
                    min={1}
                    value={heightCm}
                    onChange={(e) => setHeightCm(e.target.value)}
                    placeholder="e.g. 170"
                    className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-green-500"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">Weight (kg)</label>
                  <input
                    type="number"
                    min={0}
                    step={0.1}
                    value={weightKg}
                    onChange={(e) => setWeightKg(e.target.value)}
                    placeholder="e.g. 70"
                    className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-green-500"
                  />
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">Activity level</label>
                <select
                  value={activityLevel}
                  onChange={(e) => setActivityLevel(e.target.value)}
                  className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-green-500"
                >
                  <option value="low">Low (sedentary)</option>
                  <option value="medium">Medium (moderate)</option>
                  <option value="high">High (very active)</option>
                </select>
              </div>

              {(goals === 'lose' || goals === 'gain') && (
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Intensity: {intensityPercent > 0 ? '+' : ''}{intensityPercent}%
                  </label>
                  <input
                    type="range"
                    min={goals === 'lose' ? -30 : 0}
                    max={goals === 'gain' ? 20 : 0}
                    step={5}
                    value={goals === 'lose'
                      ? Math.max(-30, Math.min(0, intensityPercent))
                      : Math.max(0, Math.min(20, intensityPercent))}
                    onChange={(e) => setIntensityPercent(Number(e.target.value))}
                    className="w-full h-2 bg-gray-200 rounded-lg appearance-none cursor-pointer"
                  />
                  <p className="text-xs text-gray-500 mt-1">
                    {goals === 'lose' ? 'Deficit (e.g. −20% ≈ 0.8× TDEE)' : 'Surplus (e.g. +10% ≈ 1.1× TDEE)'}
                  </p>
                </div>
              )}

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Target Calories (optional override)
                </label>
                <input
                  type="number"
                  value={targetCalories}
                  onChange={(e) => setTargetCalories(e.target.value)}
                  placeholder="Leave empty to use calculated target"
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

        {/* Daily targets card - above prompt when we have BMR/TDEE data */}
        {!profileRequired && (targets || targetsLoading) && (
          <div className="bg-white rounded-lg shadow-lg p-5 mb-6 border-l-4 border-green-500">
            <h2 className="text-lg font-bold text-gray-800 mb-2">
              {targetsLoading
                ? 'Loading targets…'
                : `Daily targets${targets?.goal ? ` (for ${targets.goal === 'lose' ? 'weight loss' : targets.goal === 'gain' ? 'weight gain' : 'maintenance'})` : ''}`}
            </h2>
            {targets && (
              <>
                <p className="text-2xl font-bold text-green-700 mb-3">
                  {targets.calories} kcal/day
                </p>
                <div className="space-y-2 mb-3">
                  <div>
                    <div className="flex justify-between text-sm mb-0.5">
                      <span className="font-medium text-blue-800">Protein</span>
                      <span className="text-blue-700">{targets.protein_g} g</span>
                    </div>
                    <div className="h-2 bg-blue-100 rounded-full overflow-hidden">
                      <div className="h-full bg-blue-500 rounded-full" style={{ width: '100%' }} />
                    </div>
                  </div>
                  <div>
                    <div className="flex justify-between text-sm mb-0.5">
                      <span className="font-medium text-amber-800">Carbs</span>
                      <span className="text-amber-700">{targets.carbs_g} g</span>
                    </div>
                    <div className="h-2 bg-amber-100 rounded-full overflow-hidden">
                      <div className="h-full bg-amber-500 rounded-full" style={{ width: '100%' }} />
                    </div>
                  </div>
                  <div>
                    <div className="flex justify-between text-sm mb-0.5">
                      <span className="font-medium text-purple-800">Fat</span>
                      <span className="text-purple-700">{targets.fat_g} g</span>
                    </div>
                    <div className="h-2 bg-purple-100 rounded-full overflow-hidden">
                      <div className="h-full bg-purple-500 rounded-full" style={{ width: '100%' }} />
                    </div>
                  </div>
                </div>
                <p className="text-xs text-gray-500">
                  Calculated from your age, sex, height, weight, and activity level (BMR → TDEE).
                </p>
              </>
            )}
          </div>
        )}

        {!profileRequired && !targets && !targetsLoading && (
          <p className="text-sm text-gray-500 mb-4">
            Add <strong>age, sex, height & weight</strong> in your profile to see your daily targets (BMR → TDEE → macros).
          </p>
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
          <div className="space-y-6">
            <div className="flex items-center justify-between">
              <h2 className="text-2xl font-bold text-gray-800">Recipe Suggestions</h2>
              {response.metadata && (
                <div className="text-xs text-gray-500">
                  Model: {response.metadata.model}
                </div>
              )}
            </div>
            
            {Array.isArray(response.recipes) && response.recipes.length > 0 ? (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                {response.recipes.map((recipe, index) => (
                  <RecipeCard 
                    key={index} 
                    recipe={recipe}
                    onRegenerate={() => handleSubmit({ preventDefault: () => {} })}
                  />
                ))}
              </div>
            ) : typeof response.recipes === 'string' ? (
              // Fallback for old text-based responses
              <div className="bg-white rounded-lg shadow-lg p-6">
                <div className="prose max-w-none">
                  <pre className="whitespace-pre-wrap text-sm text-gray-700 bg-gray-50 p-4 rounded-md">
                    {response.recipes}
                  </pre>
                </div>
              </div>
            ) : (
              <div className="bg-yellow-50 border border-yellow-200 text-yellow-700 px-4 py-3 rounded-md">
                No recipes found. Please try again with different preferences.
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

// Recipe Card Component
function RecipeCard({ recipe, onRegenerate }) {
  const [showNutrition, setShowNutrition] = useState(false);
  const [copied, setCopied] = useState(false);

  const copyIngredients = () => {
    if (!recipe.ingredients || !Array.isArray(recipe.ingredients)) return;
    
    const ingredientsText = recipe.ingredients
      .map(ing => {
        if (typeof ing === 'string') return ing;
        return `${ing.amount || ''} ${ing.unit || ''} ${ing.name || ''}`.trim();
      })
      .join('\n');
    
    navigator.clipboard.writeText(ingredientsText);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const nutrients = recipe.nutrients || {};
  const allergyWarnings = recipe.allergy_warnings || [];

  return (
    <div className="bg-white rounded-lg shadow-lg overflow-hidden hover:shadow-xl transition-shadow">
      {/* Hero Image */}
      {recipe.image_url && (
        <div className="w-full h-48 bg-gray-200 overflow-hidden">
          <img 
            src={recipe.image_url} 
            alt={recipe.title || 'Recipe'}
            className="w-full h-full object-cover"
            onError={(e) => {
              e.target.style.display = 'none';
              e.target.parentElement.classList.add('bg-gradient-to-br', 'from-green-100', 'to-blue-100');
            }}
          />
        </div>
      )}
      
      {/* Card Content */}
      <div className="p-6">
        {/* Title and Source */}
        <div className="mb-4">
          <h3 className="text-xl font-bold text-gray-800 mb-2">
            {recipe.title || 'Untitled Recipe'}
          </h3>
          {recipe.source_url && (
            <a 
              href={recipe.source_url} 
              target="_blank" 
              rel="noopener noreferrer"
              className="text-sm text-blue-600 hover:text-blue-800 underline"
            >
              View Original Recipe →
            </a>
          )}
        </div>

        {/* Allergy Warnings */}
        {allergyWarnings.length > 0 && (
          <div className="mb-4 flex flex-wrap gap-2">
            {allergyWarnings.map((warning, idx) => (
              <span 
                key={idx}
                className="bg-red-100 text-red-800 text-xs font-medium px-2.5 py-1 rounded-full"
              >
                ⚠️ {warning}
              </span>
            ))}
          </div>
        )}

        {/* Nutrition Badges */}
        <div className="mb-4 flex flex-wrap gap-2">
          {nutrients.calories && (
            <span className="bg-green-100 text-green-800 text-xs font-medium px-2.5 py-1 rounded-full">
              🔥 {nutrients.calories} cal
            </span>
          )}
          {nutrients.protein_g && (
            <span className="bg-blue-100 text-blue-800 text-xs font-medium px-2.5 py-1 rounded-full">
              💪 {nutrients.protein_g}g protein
            </span>
          )}
          {nutrients.carbs_g && (
            <span className="bg-yellow-100 text-yellow-800 text-xs font-medium px-2.5 py-1 rounded-full">
              🍞 {nutrients.carbs_g}g carbs
            </span>
          )}
          {nutrients.fat_g && (
            <span className="bg-purple-100 text-purple-800 text-xs font-medium px-2.5 py-1 rounded-full">
              🥑 {nutrients.fat_g}g fat
            </span>
          )}
        </div>

        {recipe.daily_contribution && (
          <p className="text-sm text-gray-600 italic mb-4">{recipe.daily_contribution}</p>
        )}

        {/* Ingredients Section */}
        {recipe.ingredients && Array.isArray(recipe.ingredients) && recipe.ingredients.length > 0 && (
          <div className="mb-4">
            <div className="flex items-center justify-between mb-2">
              <h4 className="font-semibold text-gray-700">Ingredients</h4>
              <button
                onClick={copyIngredients}
                className="text-xs text-blue-600 hover:text-blue-800 font-medium"
              >
                {copied ? '✓ Copied!' : '📋 Copy'}
              </button>
            </div>
            <ul className="list-disc list-inside space-y-1 text-sm text-gray-600">
              {recipe.ingredients.map((ing, idx) => (
                <li key={idx}>
                  {typeof ing === 'string' 
                    ? ing 
                    : `${ing.amount || ''} ${ing.unit || ''} ${ing.name || ''}`.trim()}
                </li>
              ))}
            </ul>
          </div>
        )}

        {/* Steps Section */}
        {recipe.steps && Array.isArray(recipe.steps) && recipe.steps.length > 0 && (
          <div className="mb-4">
            <h4 className="font-semibold text-gray-700 mb-2">Instructions</h4>
            <ol className="list-decimal list-inside space-y-2 text-sm text-gray-600">
              {recipe.steps.map((step, idx) => (
                <li key={idx} className="pl-2">{step}</li>
              ))}
            </ol>
          </div>
        )}

        {/* Nutrition Details Toggle */}
        {(nutrients.calories || nutrients.protein_g || nutrients.carbs_g || nutrients.fat_g) && (
          <div className="mb-4">
            <button
              onClick={() => setShowNutrition(!showNutrition)}
              className="text-sm text-gray-600 hover:text-gray-800 font-medium"
            >
              {showNutrition ? '▼ Hide' : '▶ Show'} Nutrition Details
            </button>
            {showNutrition && (
              <div className="mt-2 p-3 bg-gray-50 rounded-md text-sm">
                <div className="grid grid-cols-2 gap-2">
                  {nutrients.calories && (
                    <div>
                      <span className="font-medium">Calories:</span> {nutrients.calories}
                    </div>
                  )}
                  {nutrients.protein_g && (
                    <div>
                      <span className="font-medium">Protein:</span> {nutrients.protein_g}g
                    </div>
                  )}
                  {nutrients.carbs_g && (
                    <div>
                      <span className="font-medium">Carbs:</span> {nutrients.carbs_g}g
                    </div>
                  )}
                  {nutrients.fat_g && (
                    <div>
                      <span className="font-medium">Fat:</span> {nutrients.fat_g}g
                    </div>
                  )}
                </div>
              </div>
            )}
          </div>
        )}

        {/* Action Buttons */}
        <div className="flex gap-2 mt-4 pt-4 border-t border-gray-200">
          <button
            onClick={onRegenerate}
            className="flex-1 bg-gray-100 text-gray-700 py-2 px-4 rounded-md font-medium hover:bg-gray-200 text-sm"
          >
            🔄 Regenerate
          </button>
        </div>
      </div>
    </div>
  );
}

export default App;

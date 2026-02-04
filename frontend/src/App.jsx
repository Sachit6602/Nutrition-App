import { useState, useEffect, useCallback, useRef } from 'react';

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

  // Today / logging
  const [todayTotals, setTodayTotals] = useState(null);
  const [todayActivity, setTodayActivity] = useState(null);
  const [frequentItems, setFrequentItems] = useState([]);
  const [lastLogUpdate, setLastLogUpdate] = useState(0);
  // Insights & AI coach
  const [insights, setInsights] = useState(null);
  const [insightsLoading, setInsightsLoading] = useState(false);
  const [coachResult, setCoachResult] = useState(null);
  const [coachLoading, setCoachLoading] = useState(false);
  // Manual logging form state
  const [manualName, setManualName] = useState('');
  const [manualCalories, setManualCalories] = useState('');
  const [manualProtein, setManualProtein] = useState('');
  const [manualCarbs, setManualCarbs] = useState('');
  const [manualFat, setManualFat] = useState('');
  const [manualServings, setManualServings] = useState(1);
  const [manualLoading, setManualLoading] = useState(false);
  const [manualError, setManualError] = useState(null);

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

  // Load insights when authenticated
  useEffect(() => {
    if (isAuthenticated && !profileRequired) loadInsights(7);
  }, [isAuthenticated, profileRequired]);

  const loadInsights = async (days = 7) => {
    if (!isAuthenticated) return;
    setInsightsLoading(true);
    try {
      const res = await fetch(`${API_BASE}/me/insights?days=${days}`, { credentials: 'include' });
      const text = await res.text();
      if (!text) return;
      const data = JSON.parse(text);
      if (res.ok) setInsights(data);
    } catch (err) {
      console.error('Failed to load insights:', err);
    } finally {
      setInsightsLoading(false);
    }
  };

  const askCoach = async (days = 7) => {
    if (!isAuthenticated) return;
    setCoachLoading(true);
    setCoachResult(null);
    try {
      const res = await fetch(`${API_BASE}/me/coach`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, credentials: 'include', body: JSON.stringify({ days }) });
      const text = await res.text();
      if (!text) throw new Error('Empty response');
      const data = JSON.parse(text);
      setCoachResult(data);
    } catch (err) {
      console.error('Coach request failed:', err);
      setCoachResult({ error: err instanceof Error ? err.message : String(err) });
    } finally {
      setCoachLoading(false);
    }
  };

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

  // Add manual item to a specific date (used by calendar popup)
  const addManualToDate = async (date) => {
    if (!date) return alert('No date selected');
    setManualError(null);
    setManualLoading(true);
    try {
      const body = {
        date: date,
        item_name: manualName,
        calories: Number(manualCalories),
        protein_g: manualProtein ? Number(manualProtein) : undefined,
        carbs_g: manualCarbs ? Number(manualCarbs) : undefined,
        fat_g: manualFat ? Number(manualFat) : undefined,
        servings: manualServings || 1,
        source_type: 'manual'
      };

      const res = await fetch(`${API_BASE}/me/intake`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify(body),
      });

      const text = await res.text();
      if (!text) throw new Error('Empty response');
      const data = JSON.parse(text);
      if (!res.ok) throw new Error(data.error || 'Failed to add item');

      // refresh selected day and notify
      await selectDay(date);
      window.dispatchEvent(new Event('logUpdated'));
      // clear form
      setManualName(''); setManualCalories(''); setManualProtein(''); setManualCarbs(''); setManualFat(''); setManualServings(1);
    } catch (err) {
      setManualError(err instanceof Error ? err.message : 'Failed to add');
    } finally {
      setManualLoading(false);
    }
  };

  // Manual add food handler
  const handleManualAdd = async (e) => {
    e?.preventDefault();
    setManualError(null);
    setManualLoading(true);
    try {
      const body = {
        date: new Date().toISOString().slice(0,10),
        item_name: manualName,
        calories: Number(manualCalories),
        protein_g: manualProtein ? Number(manualProtein) : undefined,
        carbs_g: manualCarbs ? Number(manualCarbs) : undefined,
        fat_g: manualFat ? Number(manualFat) : undefined,
        servings: manualServings || 1,
        source_type: 'manual'
      };

      const res = await fetch(`${API_BASE}/me/intake`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify(body),
      });

      const text = await res.text();
      if (!text) throw new Error('Empty response');
      const data = JSON.parse(text);
      if (!res.ok) throw new Error(data.error || 'Failed to add item');

      // notify
      window.dispatchEvent(new Event('logUpdated'));
      // clear form
      setManualName(''); setManualCalories(''); setManualProtein(''); setManualCarbs(''); setManualFat(''); setManualServings(1);
    } catch (err) {
      setManualError(err instanceof Error ? err.message : 'Failed to add');
    } finally {
      setManualLoading(false);
    }
  };

  const handleQuickAdd = async (item) => {
    try {
      const body = {
        date: new Date().toISOString().slice(0,10),
        item_name: item.item_name || item.itemName || item.item_name,
        calories: item.avg_calories || item.calories || 0,
        protein_g: item.avg_protein || 0,
        carbs_g: item.avg_carbs || 0,
        fat_g: item.avg_fat || 0,
        servings: 1,
        source_type: item.source_type || 'saved_food'
      };
      const res = await fetch(`${API_BASE}/me/intake`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, credentials: 'include', body: JSON.stringify(body)
      });
      const text = await res.text();
      if (!text) throw new Error('Empty response');
      const data = JSON.parse(text);
      if (!res.ok) throw new Error(data.error || 'Failed to add item');
      window.dispatchEvent(new Event('logUpdated'));
    } catch (err) {
      console.error('Quick add failed:', err);
      alert('Failed to add item: ' + (err instanceof Error ? err.message : 'unknown'));
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

  // History / calendar UI state
  const [calendarMonth, setCalendarMonth] = useState(() => new Date().toISOString().slice(0,7)); // YYYY-MM
  const [calendarTotals, setCalendarTotals] = useState([]);
  const [selectedDate, setSelectedDate] = useState(null);
  const [selectedDayItems, setSelectedDayItems] = useState([]);
  const [showCalendarPopup, setShowCalendarPopup] = useState(false);
  const [savedFoods, setSavedFoods] = useState([]);
  const [savedLoading, setSavedLoading] = useState(false);
  const popupRef = useRef(null);
  const [manualPopupName, setManualPopupName] = useState('');
  const [manualPopupCalories, setManualPopupCalories] = useState('');
  // Simple client-side routing (home or /calendar)
  const [route, setRoute] = useState(window.location.pathname || '/');

  useEffect(() => {
    const onPop = () => setRoute(window.location.pathname || '/');
    window.addEventListener('popstate', onPop);
    return () => window.removeEventListener('popstate', onPop);
  }, []);

  const navigate = (path) => {
    if (path !== window.location.pathname) window.history.pushState({}, '', path);
    setRoute(path);
  };

  const loadCalendar = async (month) => {
    if (!isAuthenticated) return;
    try {
      const res = await fetch(`${API_BASE}/me/intake/calendar?month=${month}`, { credentials: 'include' });
      if (!res.ok) return;
      const text = await res.text();
      if (!text) return;
      const data = JSON.parse(text);
      setCalendarTotals(data.totals || []);
    } catch (err) {
      console.error('Failed to load calendar totals:', err);
    }
  };

  const loadSavedFoods = async () => {
    if (!isAuthenticated) return;
    setSavedLoading(true);
    try {
      const res = await fetch(`${API_BASE}/me/saved_foods`, { credentials: 'include' });
      if (!res.ok) return;
      const text = await res.text();
      if (!text) return;
      const data = JSON.parse(text);
      setSavedFoods(data.items || []);
    } catch (err) {
      console.error('Failed to load saved foods:', err);
    } finally {
      setSavedLoading(false);
    }
  };

  const openHistory = async () => {
    // keep for compatibility — navigate to calendar route
    navigate('/calendar');
  };

  const closeHistory = () => {
    navigate('/');
    setSelectedDate(null);
    setSelectedDayItems([]);
  };

  const selectDay = async (date) => {
    setSelectedDate(date);
    try {
      const res = await fetch(`${API_BASE}/me/intake?date=${date}`, { credentials: 'include' });
      if (!res.ok) return;
      const text = await res.text();
      if (!text) return;
      const data = JSON.parse(text);
      setSelectedDayItems(data.items || []);
    } catch (err) {
      console.error('Failed to load day items:', err);
    }
  };

  // Edit/delete item flows
  const [editingId, setEditingId] = useState(null);
  const [editFields, setEditFields] = useState({ item_name: '', calories: '', protein_g: '', carbs_g: '', fat_g: '', servings: 1 });

  const startEdit = (item) => {
    setEditingId(item.id);
    setEditFields({
      item_name: item.item_name || '',
      calories: item.calories || '',
      protein_g: item.protein_g || '',
      carbs_g: item.carbs_g || '',
      fat_g: item.fat_g || '',
      servings: item.servings || 1,
    });
  };

  const saveEdit = async (id) => {
    try {
      const res = await fetch(`${API_BASE}/me/intake/${id}`, {
        method: 'PUT', headers: { 'Content-Type': 'application/json' }, credentials: 'include',
        body: JSON.stringify({
          item_name: editFields.item_name,
          calories: Number(editFields.calories),
          protein_g: editFields.protein_g !== '' ? Number(editFields.protein_g) : null,
          carbs_g: editFields.carbs_g !== '' ? Number(editFields.carbs_g) : null,
          fat_g: editFields.fat_g !== '' ? Number(editFields.fat_g) : null,
          servings: editFields.servings !== '' ? Number(editFields.servings) : 1,
        })
      });
      const text = await res.text();
      if (!text) throw new Error('Empty response');
      const data = JSON.parse(text);
      if (!res.ok) throw new Error(data.error || 'Failed to update');
      // refresh day
      await selectDay(selectedDate);
      window.dispatchEvent(new Event('logUpdated'));
      setEditingId(null);
    } catch (err) {
      alert('Failed to save: ' + (err instanceof Error ? err.message : 'unknown'));
    }
  };

  const removeItem = async (id) => {
    if (!confirm('Delete this entry?')) return;
    try {
      const res = await fetch(`${API_BASE}/me/intake/${id}`, { method: 'DELETE', credentials: 'include' });
      const text = await res.text();
      if (!text) throw new Error('Empty response');
      const data = JSON.parse(text);
      if (!res.ok) throw new Error(data.error || 'Failed to delete');
      await selectDay(selectedDate);
      window.dispatchEvent(new Event('logUpdated'));
    } catch (err) {
      alert('Delete failed: ' + (err instanceof Error ? err.message : 'unknown'));
    }
  };

  const addSavedToDate = async (savedItem, date) => {
    try {
      const body = {
        date: date || new Date().toISOString().slice(0,10),
        item_name: savedItem.name,
        calories: Number(savedItem.calories),
        protein_g: savedItem.protein_g != null ? Number(savedItem.protein_g) : undefined,
        carbs_g: savedItem.carbs_g != null ? Number(savedItem.carbs_g) : undefined,
        fat_g: savedItem.fat_g != null ? Number(savedItem.fat_g) : undefined,
        servings: savedItem.default_servings || 1,
        source_type: 'saved_food'
      };
      const res = await fetch(`${API_BASE}/me/intake`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, credentials: 'include', body: JSON.stringify(body) });
      const text = await res.text();
      if (!text) throw new Error('Empty response');
      const data = JSON.parse(text);
      if (!res.ok) throw new Error(data.error || 'Failed to add');
      await selectDay(date || new Date().toISOString().slice(0,10));
      window.dispatchEvent(new Event('logUpdated'));
    } catch (err) {
      alert('Failed to add saved food: ' + (err instanceof Error ? err.message : 'unknown'));
    }
  };

  // Create saved food
  const [newSaved, setNewSaved] = useState({ name: '', calories: '', protein_g: '', carbs_g: '', fat_g: '', default_servings: 1 });
  const createSavedFood = async () => {
    if (!newSaved.name || newSaved.calories === '') return alert('Name and calories required');
    try {
      const res = await fetch(`${API_BASE}/me/saved_foods`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, credentials: 'include', body: JSON.stringify({
        name: newSaved.name,
        calories: Number(newSaved.calories),
        protein_g: newSaved.protein_g !== '' ? Number(newSaved.protein_g) : undefined,
        carbs_g: newSaved.carbs_g !== '' ? Number(newSaved.carbs_g) : undefined,
        fat_g: newSaved.fat_g !== '' ? Number(newSaved.fat_g) : undefined,
        default_servings: newSaved.default_servings || 1,
      })});
      const txt = await res.text();
      if (!txt) throw new Error('Empty response');
      const data = JSON.parse(txt);
      if (!res.ok) throw new Error(data.error || 'Failed to create');
      setNewSaved({ name: '', calories: '', protein_g: '', carbs_g: '', fat_g: '', default_servings: 1 });
      await loadSavedFoods();
    } catch (err) {
      alert('Create failed: ' + (err instanceof Error ? err.message : 'unknown'));
    }
  };

  // Load today's intake/activity and frequent items
  const loadTodayData = useCallback(async (date) => {
    if (!isAuthenticated) return;
    const d = date || new Date().toISOString().slice(0,10);
    try {
      const [intakeRes, activityRes, freqRes] = await Promise.all([
        fetch(`${API_BASE}/me/intake?date=${d}`, { credentials: 'include' }),
        fetch(`${API_BASE}/me/activity?date=${d}`, { credentials: 'include' }),
        fetch(`${API_BASE}/me/intake/frequent`, { credentials: 'include' }),
      ]);

      if (intakeRes.ok) {
        const text = await intakeRes.text();
        if (text) setTodayTotals(JSON.parse(text).totals || null);
      }
      if (activityRes.ok) {
        const text = await activityRes.text();
        if (text) setTodayActivity(JSON.parse(text).activity || null);
      }
      if (freqRes.ok) {
        const text = await freqRes.text();
        if (text) setFrequentItems(JSON.parse(text).items || []);
      }
    } catch (err) {
      console.error('Failed to load today data:', err);
    }
  }, [isAuthenticated]);

  useEffect(() => {
    if (isAuthenticated && !profileRequired) {
      loadTodayData();
    }

    // listen for log updates from child components
    const handler = () => {
      setLastLogUpdate(Date.now());
    };
    window.addEventListener('logUpdated', handler);
    return () => window.removeEventListener('logUpdated', handler);
  }, [isAuthenticated, profileRequired, loadTodayData]);

  // When navigating to calendar page, load month data and saved foods
  useEffect(() => {
    if (route && route.startsWith && route.startsWith('/calendar') && isAuthenticated) {
      loadCalendar(calendarMonth);
      loadSavedFoods();
    }
  }, [route, calendarMonth, isAuthenticated]);

  // When the small popup is opened, load calendar totals for the month
  useEffect(() => {
    if (showCalendarPopup && isAuthenticated) {
      loadCalendar(calendarMonth);
    }
  }, [showCalendarPopup, calendarMonth, isAuthenticated]);

  // reload when a new log happens
  useEffect(() => {
    if (lastLogUpdate) loadTodayData();
  }, [lastLogUpdate, loadTodayData]);

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

        {showCalendarPopup && (
          <div className="absolute right-0 top-full mt-2 z-50 w-96 bg-white rounded-lg shadow-lg p-4">
            <div className="flex items-center justify-between mb-3">
              <div className="flex items-center gap-2">
                <button onClick={() => { const prev = new Date(calendarMonth + '-01'); prev.setMonth(prev.getMonth() - 1); const m = prev.toISOString().slice(0,7); setCalendarMonth(m); loadCalendar(m); }} className="px-2 py-1 border rounded">◀</button>
                <div className="font-medium">{new Date(calendarMonth + '-01').toLocaleString(undefined, { month: 'long', year: 'numeric' })}</div>
                <button onClick={() => { const next = new Date(calendarMonth + '-01'); next.setMonth(next.getMonth() + 1); const m = next.toISOString().slice(0,7); setCalendarMonth(m); loadCalendar(m); }} className="px-2 py-1 border rounded">▶</button>
              </div>
              <div>
                <button onClick={() => setShowCalendarPopup(false)} className="px-2 py-1 text-sm text-gray-600">Close</button>
              </div>
            </div>

            {/* Calendar grid */}
            <div className="grid grid-cols-7 gap-1 text-center text-sm">
              {['Sun','Mon','Tue','Wed','Thu','Fri','Sat'].map(d => (
                <div key={d} className="text-xs text-gray-500">{d}</div>
              ))}

              {(() => {
                const [y, m] = calendarMonth.split('-').map(Number);
                const first = new Date(y, m - 1, 1);
                const start = first.getDay();
                const days = new Date(y, m, 0).getDate();
                const cells = [];
                const activeSet = new Set((calendarTotals || []).map(t => t.date));
                for (let i = 0; i < start; i++) cells.push(<div key={`b${i}`} />);
                for (let d = 1; d <= days; d++) {
                  const dateStr = `${calendarMonth}-${String(d).padStart(2,'0')}`;
                  const isActive = activeSet.has(dateStr);
                  cells.push(
                    <button
                      key={dateStr}
                      onClick={() => { setSelectedDate(dateStr); selectDay(dateStr); }}
                      className={`p-2 rounded ${isActive ? 'bg-blue-600 text-white' : 'hover:bg-gray-100'}`}
                    >
                      {d}
                    </button>
                  );
                }
                return cells;
              })()}
            </div>

            {/* Day details + quick add/edit */}
            <div className="mt-3">
              <div className="font-semibold mb-2">{selectedDate ? `Entries for ${selectedDate}` : 'Select a date'}</div>
              {selectedDate && (
                <div className="space-y-2 max-h-60 overflow-auto">
                  {selectedDayItems.length === 0 && <div className="text-sm text-gray-500">No items logged</div>}
                  {selectedDayItems.map(item => (
                    <div key={item.id} className="p-2 border rounded flex items-start justify-between">
                      <div>
                        <div className="font-medium">{item.item_name}</div>
                        <div className="text-xs text-gray-600">{Math.round(item.calories || 0)} kcal • {item.servings || 1} serving(s)</div>
                      </div>
                      <div className="ml-3 flex flex-col gap-2">
                        <button onClick={() => startEdit(item)} className="px-2 py-1 bg-blue-500 text-white rounded text-sm">Edit</button>
                        <button onClick={() => removeItem(item.id)} className="px-2 py-1 bg-red-600 text-white rounded text-sm">Delete</button>
                      </div>
                    </div>
                  ))}

                  <div className="p-2 border rounded">
                    <div className="text-sm font-medium mb-2">Add manual entry</div>
                    <input className="w-full border px-2 py-1 mb-2" placeholder="Name" value={manualName} onChange={(e) => setManualName(e.target.value)} />
                    <input className="w-full border px-2 py-1 mb-2" placeholder="Calories" value={manualCalories} onChange={(e) => setManualCalories(e.target.value)} />
                    <div className="flex gap-2 mb-2">
                      <input className="flex-1 border px-2 py-1" placeholder="Protein g" value={manualProtein} onChange={(e) => setManualProtein(e.target.value)} />
                      <input className="flex-1 border px-2 py-1" placeholder="Carbs g" value={manualCarbs} onChange={(e) => setManualCarbs(e.target.value)} />
                      <input className="flex-1 border px-2 py-1" placeholder="Fat g" value={manualFat} onChange={(e) => setManualFat(e.target.value)} />
                    </div>
                    <div className="flex gap-2">
                      <button onClick={() => addManualToDate(selectedDate)} className="px-3 py-1 bg-green-600 text-white rounded">Add</button>
                      <button onClick={() => { setManualName(''); setManualCalories(''); setManualProtein(''); setManualCarbs(''); setManualFat(''); setManualServings(1); }} className="px-3 py-1 border rounded">Clear</button>
                    </div>
                  </div>
                </div>
              )}
            </div>
          </div>
        )}
      </div>
    );
  }

  // Main app (authenticated)
  if (route && route.startsWith && route.startsWith('/calendar')) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-green-50 to-blue-50 py-8 px-4">
        <div className="max-w-5xl mx-auto">
          <div className="bg-white rounded-lg shadow-lg w-full p-6 mb-6">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-lg font-bold">Calendar — History & Edit Logs</h3>
              <div className="flex gap-2 items-center">
                <button onClick={() => { const prev = new Date(calendarMonth + '-01'); prev.setMonth(prev.getMonth() - 1); setCalendarMonth(prev.toISOString().slice(0,7)); loadCalendar(prev.toISOString().slice(0,7)); }} className="px-2 py-1 border rounded">◀</button>
                <div className="px-3 py-1 bg-gray-50 rounded">{calendarMonth}</div>
                <button onClick={() => { const next = new Date(calendarMonth + '-01'); next.setMonth(next.getMonth() + 1); setCalendarMonth(next.toISOString().slice(0,7)); loadCalendar(next.toISOString().slice(0,7)); }} className="px-2 py-1 border rounded">▶</button>
                <button onClick={() => navigate('/')} className="ml-4 px-3 py-1 bg-red-600 text-white rounded">Close</button>
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div className="col-span-1 bg-gray-50 p-3 rounded">
                <h4 className="font-semibold mb-2">{new Date(calendarMonth + '-01').toLocaleString(undefined, { month: 'long', year: 'numeric' })}</h4>

                {/* Full month calendar grid */}
                <div className="grid grid-cols-7 gap-1 mb-3 text-center">
                  {['Sun','Mon','Tue','Wed','Thu','Fri','Sat'].map((d, i) => (
                    <div key={`hdr-${i}`} className="text-xs text-gray-500 font-medium">{d}</div>
                  ))}

                  {(() => {
                    const [y, m] = calendarMonth.split('-').map(Number);
                    const year = y, monthIndex = m - 1;
                    const first = new Date(year, monthIndex, 1);
                    const start = first.getDay();
                    const days = new Date(year, monthIndex + 1, 0).getDate();
                    const cells = [];
                    const activeSet = new Set((calendarTotals || []).map(t => t.date));
                    for (let i = 0; i < start; i++) cells.push(<div key={`b-${i}`} />);
                    for (let d = 1; d <= days; d++) {
                      const dateStr = `${calendarMonth}-${String(d).padStart(2,'0')}`;
                      const hasData = activeSet.has(dateStr);
                      const isSelected = selectedDate === dateStr;
                      cells.push(
                        <button
                          key={dateStr}
                          onClick={() => { setSelectedDate(dateStr); selectDay(dateStr); }}
                          className={`h-10 w-10 rounded flex items-center justify-center text-sm ${isSelected ? 'bg-blue-700 text-white' : hasData ? 'bg-blue-100 text-blue-800' : 'hover:bg-gray-100'}`}
                          title={hasData ? `Has data: ${dateStr}` : dateStr}
                        >
                          {d}
                        </button>
                      );
                    }
                    while (cells.length % 7 !== 0) cells.push(<div key={`pad-${cells.length}`} />);
                    return cells;
                  })()}
                </div>

                <h5 className="font-semibold mb-2">Month totals</h5>
                <div className="space-y-2 text-sm">
                  {calendarTotals.length === 0 && <div className="text-gray-500">No data for this month</div>}
                  {calendarTotals.map((d) => (
                    <div key={d.date} className="flex items-center justify-between p-2 rounded hover:bg-white">
                      <div>
                        <div className="font-medium">{d.date}</div>
                        <div className="text-xs text-gray-500">{Math.round(d.calories_total || 0)} kcal</div>
                      </div>
                      <div>
                        <button onClick={() => { selectDay(d.date); setSelectedDate(d.date); }} className="px-2 py-1 bg-blue-600 text-white rounded text-sm">View</button>
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              <div className="col-span-2 bg-white p-3 rounded">
                <h4 className="font-semibold mb-2">{selectedDate ? `Entries for ${selectedDate}` : 'Select a day'}</h4>
                {!selectedDate && <div className="text-sm text-gray-500 mb-2">Click a day from the Month totals to view or edit entries.</div>}
                {selectedDate && (
                  <div>
                    <div className="space-y-3">
                      {selectedDayItems.length === 0 && <div className="text-gray-500">No items logged</div>}
                      {selectedDayItems.map((item) => (
                        <div key={item.id} className="p-2 border rounded flex items-start justify-between">
                          <div className="flex-1">
                            {editingId === item.id ? (
                              <div className="space-y-2">
                                <input className="w-full border px-2 py-1" value={editFields.item_name} onChange={(e) => setEditFields({...editFields, item_name: e.target.value})} />
                                <div className="grid grid-cols-4 gap-2 mt-1">
                                  <input className="border px-2 py-1" value={editFields.calories} onChange={(e) => setEditFields({...editFields, calories: e.target.value})} placeholder="kcal" />
                                  <input className="border px-2 py-1" value={editFields.protein_g} onChange={(e) => setEditFields({...editFields, protein_g: e.target.value})} placeholder="protein g" />
                                  <input className="border px-2 py-1" value={editFields.carbs_g} onChange={(e) => setEditFields({...editFields, carbs_g: e.target.value})} placeholder="carbs g" />
                                  <input className="border px-2 py-1" value={editFields.fat_g} onChange={(e) => setEditFields({...editFields, fat_g: e.target.value})} placeholder="fat g" />
                                </div>
                              </div>
                            ) : (
                              <div>
                                <div className="font-medium">{item.item_name}</div>
                                <div className="text-xs text-gray-600">{Math.round(item.calories || 0)} kcal • {item.servings || 1} serving(s)</div>
                              </div>
                            )}
                          </div>
                          <div className="ml-3 flex flex-col gap-2">
                            {editingId === item.id ? (
                              <>
                                <button onClick={() => saveEdit(item.id)} className="px-2 py-1 bg-green-600 text-white rounded text-sm">Save</button>
                                <button onClick={() => setEditingId(null)} className="px-2 py-1 border rounded text-sm">Cancel</button>
                              </>
                            ) : (
                              <>
                                <button onClick={() => startEdit(item)} className="px-2 py-1 bg-blue-500 hover:bg-blue-600 text-white rounded text-sm">Edit</button>
                                <button onClick={() => removeItem(item.id)} className="px-2 py-1 bg-red-600 text-white rounded text-sm">Delete</button>
                              </>
                            )}
                          </div>
                        </div>
                      ))}
                    </div>

                    <div className="mt-4">
                      <h5 className="font-semibold mb-2">Add saved/predefined food</h5>
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
                        <div className="space-y-2">
                          {savedLoading && <div className="text-sm text-gray-500">Loading saved foods…</div>}
                          {savedFoods.slice(0,10).map((s) => (
                            <div key={s.id} className="flex items-center justify-between p-2 border rounded">
                              <div className="text-sm">
                                <div className="font-medium">{s.name}</div>
                                <div className="text-xs text-gray-500">{Math.round(s.calories || 0)} kcal</div>
                              </div>
                              <div>
                                <button onClick={() => addSavedToDate(s, selectedDate)} className="px-2 py-1 bg-blue-600 text-white rounded text-sm">Add</button>
                              </div>
                            </div>
                          ))}
                        </div>

                        <div className="p-2 border rounded">
                          <div className="text-sm font-medium mb-2">Create saved food</div>
                          <input className="w-full border px-2 py-1 mb-2" placeholder="Name" value={newSaved.name} onChange={(e) => setNewSaved({...newSaved, name: e.target.value})} />
                          <input className="w-full border px-2 py-1 mb-2" placeholder="Calories" value={newSaved.calories} onChange={(e) => setNewSaved({...newSaved, calories: e.target.value})} />
                          <input className="flex-1 border px-2 py-1" placeholder="Protein g" value={newSaved.protein_g} onChange={(e) => setNewSaved({...newSaved, protein_g: e.target.value})} />
                          <input className="flex-1 border px-2 py-1" placeholder="Carbs g" value={newSaved.carbs_g} onChange={(e) => setNewSaved({...newSaved, carbs_g: e.target.value})} />
                          <input className="flex-1 border px-2 py-1 mb-2" placeholder="Fat g" value={newSaved.fat_g} onChange={(e) => setNewSaved({...newSaved, fat_g: e.target.value})} />
                          <div className="flex gap-2">
                            <button onClick={createSavedFood} className="px-3 py-1 bg-green-600 text-white rounded">Create</button>
                            <button onClick={() => setNewSaved({ name: '', calories: '', protein_g: '', carbs_g: '', fat_g: '', default_servings: 1 })} className="px-3 py-1 border rounded">Clear</button>
                          </div>
                        </div>
                      </div>
                    </div>

                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      </div>
    );
  }
  return (
    <div className="min-h-screen bg-gradient-to-br from-green-50 to-blue-50 py-8 px-4">
      <div className="max-w-4xl mx-auto">
        <div className="relative flex justify-between items-center mb-6">
          <div>
            <h1 className="text-4xl font-bold text-gray-800">🥗 Healthy Diet Tracker Assistant</h1>
            <p className="text-gray-600">Welcome, {user?.email}</p>
          </div>
          <div className="flex gap-2">
            {/* History / Calendar button */}
            {!profileRequired && (
              <button
                onClick={() => navigate('/calendar')}
                title="View history & edit logs"
                className="bg-white border px-3 py-2 rounded-md hover:bg-gray-50 text-gray-700"
              >
                📅
              </button>
            )}
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

        {/* Today summary (read-only) */}
        {!profileRequired && (
          <div className="bg-white rounded-lg shadow-lg p-6 mb-6">
            <div className="flex items-center justify-between mb-2">
              <h2 className="text-xl font-bold">Today Summary</h2>
              <div className="text-sm text-gray-600">{todayTotals ? `${todayTotals.calories_total || 0} kcal eaten` : 'No intake logged'} • {todayActivity ? `${todayActivity.calories_burned || 0} kcal burned` : 'No activity'}</div>
            </div>
            <div className="text-sm text-gray-700">
              <div>Consumed: {Math.round(todayTotals?.calories_total || 0)} kcal</div>
              <div>Burned: {Math.round(todayActivity?.calories_burned || 0)} kcal</div>
              <div className="font-medium">Net: {Math.round((todayTotals?.calories_total || 0) - (todayActivity?.calories_burned || 0))} kcal</div>
            </div>
          </div>
        )}

        {/* Insights Card */}
        {!profileRequired && (
          <div className="bg-white rounded-lg shadow-lg p-6 mb-6">
            <div className="flex items-center justify-between mb-2">
              <h2 className="text-xl font-bold">Insights</h2>
              <div className="flex gap-2 items-center">
                <button onClick={() => loadInsights(7)} className="px-2 py-1 border rounded text-sm">Last 7d</button>
                <button onClick={() => loadInsights(30)} className="px-2 py-1 border rounded text-sm">Last 30d</button>
                <button onClick={() => askCoach(7)} className="px-3 py-1 bg-indigo-600 text-white rounded text-sm" disabled={coachLoading}>{coachLoading ? 'Coaching…' : 'Ask coach about last week'}</button>
              </div>
            </div>

            {insightsLoading && <div className="text-sm text-gray-500">Loading insights…</div>}

            {insights && (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <div className="text-sm text-gray-700 mb-2">Averages</div>
                  <div className="text-sm text-gray-800">
                    <div>Calories: {insights.averages?.avg_calories ?? '-'} kcal</div>
                    <div>Protein: {insights.averages?.avg_protein ?? '-'} g</div>
                    <div>Carbs: {insights.averages?.avg_carbs ?? '-'} g</div>
                    <div>Fat: {insights.averages?.avg_fat ?? '-'} g</div>
                    <div>Steps: {insights.averages?.avg_steps ?? '-'} steps</div>
                  </div>
                </div>
                <div>
                  <div className="text-sm text-gray-700 mb-2">Highlights</div>
                  <div className="space-y-2 text-sm text-gray-800">
                    {insights.insights && insights.insights.length > 0 ? (
                      insights.insights.map((s, i) => <div key={i} className="p-2 bg-gray-50 rounded">{s}</div>)
                    ) : (
                      <div className="text-gray-500">No highlights yet</div>
                    )}
                  </div>
                </div>
              </div>
            )}

            {coachResult && (
              <div className="mt-4 p-3 border rounded bg-gray-50">
                <div className="font-semibold mb-2">Coach Suggestions</div>
                {coachResult.parsed ? (
                  <div className="space-y-2 text-sm">
                    {Array.isArray(coachResult.parsed.observations) && (
                      <div>
                        <div className="font-medium">Observations</div>
                        {coachResult.parsed.observations.map((o, i) => <div key={`o${i}`} className="text-sm">• {o}</div>)}
                      </div>
                    )}
                    {Array.isArray(coachResult.parsed.suggestions) && (
                      <div>
                        <div className="font-medium mt-2">Suggestions</div>
                        {coachResult.parsed.suggestions.map((s, i) => <div key={`s${i}`} className="text-sm">• {s}</div>)}
                      </div>
                    )}
                  </div>
                ) : (
                  <pre className="text-xs text-gray-700 whitespace-pre-wrap">{coachResult.raw || coachResult.error || JSON.stringify(coachResult, null, 2)}</pre>
                )}
              </div>
            )}
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
            ) : (
              <div className="bg-yellow-50 border border-yellow-200 text-yellow-700 px-4 py-3 rounded-md">
                No recipes found. Please try again with different preferences.
              </div>
            )}
          </div>
        )}
      

      {/* Calendar popup */}
      {showCalendarPopup && (
        <div
          ref={popupRef}
          className="absolute right-0 mt-12 w-96 z-50 bg-white border rounded-lg shadow-lg p-4"
          style={{ minWidth: 360 }}
        >
          {/* Top: month controls */}
          <div className="flex items-center justify-between mb-3">
            <div className="flex items-center gap-2">
              <button
                onClick={() => {
                  const prev = new Date(calendarMonth + '-01');
                  prev.setMonth(prev.getMonth() - 1);
                  setCalendarMonth(prev.toISOString().slice(0,7));
                  loadCalendar(prev.toISOString().slice(0,7));
                }}
                className="px-2 py-1 border rounded"
              >◀</button>
              <div className="px-3 py-1 bg-gray-50 rounded text-sm">{calendarMonth}</div>
              <button
                onClick={() => {
                  const next = new Date(calendarMonth + '-01');
                  next.setMonth(next.getMonth() + 1);
                  setCalendarMonth(next.toISOString().slice(0,7));
                  loadCalendar(next.toISOString().slice(0,7));
                }}
                className="px-2 py-1 border rounded"
              >▶</button>
            </div>
            <button onClick={() => setShowCalendarPopup(false)} className="text-sm text-red-600">✕</button>
          </div>

          {/* Mini month grid */}
          <div className="grid grid-cols-7 gap-1 text-xs mb-3">
            {['S','M','T','W','T','F','S'].map((d, idx) => (
              <div key={`dow-${idx}`} className="text-center font-medium text-gray-500">{d}</div>
            ))}
            {(() => {
              const [y, m] = calendarMonth.split('-').map(Number);
              const year = y, monthIndex = m - 1;
              const firstDay = new Date(year, monthIndex, 1);
              const startDay = firstDay.getDay();
              const totalDays = new Date(year, monthIndex + 1, 0).getDate();
              const cells = [];
              for (let i = 0; i < startDay; i++) cells.push(<div key={`e-${i}`} />);
              for (let d = 1; d <= totalDays; d++) {
                const dateStr = `${calendarMonth}-${String(d).padStart(2,'0')}`;
                const hasData = calendarTotals.some(ct => ct.date === dateStr);
                const isSelected = selectedDate === dateStr;
                cells.push(
                  <button
                    key={dateStr}
                    onClick={() => {
                      selectDay(dateStr);
                      setShowCalendarPopup(true);
                    }}
                    className={`h-8 w-8 rounded text-sm flex items-center justify-center ${
                      isSelected ? 'bg-blue-700 text-white' : hasData ? 'bg-blue-100 text-blue-800' : 'hover:bg-gray-100'
                    }`}
                    title={hasData ? `Has data: ${dateStr}` : dateStr}
                  >
                    {d}
                  </button>
                );
              }
              // pad to complete grid (optional)
              while (cells.length % 7 !== 0) cells.push(<div key={`pad-${cells.length}`} />);
              return cells;
            })()}
          </div>

          {/* Right: day detail */}
          <div className="border-t pt-3">
            <div className="flex items-center justify-between mb-2">
              <div className="font-medium text-sm">{selectedDate ? `Entries for ${selectedDate}` : 'Select a date'}</div>
              <div className="text-xs text-gray-500">
                {selectedDayItems.length > 0 ? `${selectedDayItems.reduce((s,i)=> s + (i.calories||0), 0)} kcal` : ''}
              </div>
            </div>

            {!selectedDate && <div className="text-xs text-gray-500 mb-2">Click a date to view/edit entries.</div>}

            {selectedDate && (
              <div className="space-y-2 max-h-48 overflow-auto">
                {selectedDayItems.length === 0 && <div className="text-xs text-gray-500">No items logged</div>}
                {selectedDayItems.map(item => (
                  <div key={item.id} className="flex items-start justify-between p-2 border rounded">
                    <div className="flex-1">
                      {editingId === item.id ? (
                        <div className="space-y-2">
                          <input className="w-full border px-2 py-1 text-sm" value={editFields.item_name} onChange={(e) => setEditFields({...editFields, item_name: e.target.value})} />
                          <div className="grid grid-cols-4 gap-1 mt-1">
                            <input className="border px-1 py-1 text-xs" value={editFields.calories} onChange={(e) => setEditFields({...editFields, calories: e.target.value})} placeholder="kcal" />
                            <input className="border px-1 py-1 text-xs" value={editFields.protein_g} onChange={(e) => setEditFields({...editFields, protein_g: e.target.value})} placeholder="protein" />
                            <input className="border px-1 py-1 text-xs" value={editFields.carbs_g} onChange={(e) => setEditFields({...editFields, carbs_g: e.target.value})} placeholder="carbs" />
                            <input className="border px-1 py-1 text-xs" value={editFields.fat_g} onChange={(e) => setEditFields({...editFields, fat_g: e.target.value})} placeholder="fat" />
                          </div>
                        </div>
                      ) : (
                        <div>
                          <div className="font-medium text-sm">{item.item_name}</div>
                          <div className="text-xs text-gray-600">{Math.round(item.calories || 0)} kcal • {item.servings || 1} srv</div>
                        </div>
                      )}
                    </div>

                    <div className="ml-2 flex flex-col gap-1">
                      {editingId === item.id ? (
                        <>
                          <button onClick={() => saveEdit(item.id)} className="px-2 py-1 bg-green-600 text-white rounded text-xs">Save</button>
                          <button onClick={() => setEditingId(null)} className="px-2 py-1 border rounded text-xs">Cancel</button>
                        </>
                      ) : (
                        <>
                          <button onClick={() => startEdit(item)} className="px-2 py-1 bg-blue-500 text-white rounded text-xs">Edit</button>
                          <button onClick={() => removeItem(item.id)} className="px-2 py-1 bg-red-600 text-white rounded text-xs">Delete</button>
                        </>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            )}

            {/* Quick add: saved foods */}
            {selectedDate && (
              <>
                <div className="mt-3 text-xs font-medium">Add saved food</div>
                <div className="flex gap-2 mt-1 overflow-x-auto">
                  {savedLoading && <div className="text-xs text-gray-500">Loading…</div>}
                  {savedFoods.slice(0,6).map(s => (
                    <div key={s.id} className="px-2 py-1 border rounded flex items-center gap-2 text-xs">
                      <div>
                        <div className="font-medium">{s.name}</div>
                        <div className="text-gray-500">{Math.round(s.calories || 0)} kcal</div>
                      </div>
                      <button onClick={() => addSavedToDate(s, selectedDate)} className="ml-2 bg-blue-600 text-white px-2 py-1 rounded text-xs">Add</button>
                    </div>
                  ))}
                </div>

                {/* Manual add small form */}
                <div className="mt-3 border-t pt-3">
                  <div className="text-xs font-medium mb-1">Add manual entry</div>
                  <div className="flex gap-2">
                    <input value={manualPopupName} onChange={(e)=>setManualPopupName(e.target.value)} placeholder="name" className="flex-1 border px-2 py-1 text-xs" />
                    <input value={manualPopupCalories} onChange={(e)=>setManualPopupCalories(e.target.value)} placeholder="kcal" className="w-20 border px-2 py-1 text-xs" />
                    <button
                      onClick={async () => {
                        if (!manualPopupName || manualPopupCalories === '') return alert('name and calories required');
                        try {
                          const body = {
                            date: selectedDate || new Date().toISOString().slice(0,10),
                            item_name: manualPopupName,
                            calories: Number(manualPopupCalories),
                            servings: 1,
                            source_type: 'manual'
                          };
                          const res = await fetch(`${API_BASE}/me/intake`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, credentials: 'include', body: JSON.stringify(body) });
                          const text = await res.text();
                          if (!text) throw new Error('Empty response');
                          const data = JSON.parse(text);
                          if (!res.ok) throw new Error(data.error || 'Failed');
                          setManualPopupName(''); setManualPopupCalories('');
                          await selectDay(selectedDate);
                          window.dispatchEvent(new Event('logUpdated'));
                        } catch (err) {
                          alert('Add failed: ' + (err instanceof Error ? err.message : 'unknown'));
                        }
                      }}
                      className="bg-green-600 text-white px-2 py-1 rounded text-xs"
                    >
                      Add
                    </button>
                  </div>
                </div>
              </>
            )}
          </div>
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
  const nutrients = recipe.nutrients || {};
  // Add to log handler
  const addToLog = async () => {
    try {
      const servingsInput = window.prompt('Servings to add (number):', '1');
      if (!servingsInput) return;
      const servings = Number(servingsInput) || 1;
      const body = {
        date: new Date().toISOString().slice(0,10),
        item_name: recipe.title || 'Recipe',
        calories: (nutrients.calories != null ? Number(nutrients.calories) : 0) * servings,
        protein_g: nutrients.protein_g != null ? Number(nutrients.protein_g) * servings : undefined,
        carbs_g: nutrients.carbs_g != null ? Number(nutrients.carbs_g) * servings : undefined,
        fat_g: nutrients.fat_g != null ? Number(nutrients.fat_g) * servings : undefined,
        servings: servings,
        source_type: 'generated_recipe'
      };

      const res = await fetch(`/me/intake`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, credentials: 'include', body: JSON.stringify(body) });
      const text = await res.text();
      if (!text) throw new Error('No response');
      const data = JSON.parse(text);
      if (!res.ok) throw new Error(data.error || 'Failed to add to log');

      // notify app to reload today's totals
      window.dispatchEvent(new Event('logUpdated'));
      alert('Added to daily log');
    } catch (err) {
      console.error('Add to log failed', err);
      alert('Failed to add to log: ' + (err instanceof Error ? err.message : 'unknown'));
    }
  };

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
          <button
            onClick={addToLog}
            className="bg-green-600 text-white py-2 px-4 rounded-md font-medium hover:bg-green-700 text-sm"
          >
            ➕ Add to log
          </button>
        </div>
      </div>
    </div>
  );
}

export default App;

import { Suspense, lazy, useState, useEffect, useCallback, useRef } from 'react';
import {
  ArrowClockwiseIcon, ArrowSquareOutIcon, BookmarkSimpleIcon, CalendarBlankIcon, CameraIcon, CaretDownIcon, CaretLeftIcon,
  CaretRightIcon, CheckCircleIcon, CheckIcon, ChefHatIcon, EqualsIcon, EyeIcon, EyeSlashIcon, FireIcon, FootprintsIcon, ForkKnifeIcon,
  HouseIcon, KeyIcon, LeafIcon, MonitorIcon, MoonIcon, PencilSimpleIcon, PlusIcon, ShieldCheckIcon, SignOutIcon, SlidersHorizontalIcon,
  SparkleIcon, SunIcon, TrashIcon,
  TrendDownIcon, TrendUpIcon, WarningCircleIcon,
} from '@phosphor-icons/react';
import { CalorieChart, MACROS, MacroMeter, RecipeCard, Ring, Sheet, Toast, fmt, parseDay } from './ui.jsx';
import Legal from './Legal.jsx';

// In development, always use the Vite proxy to reach the local backend.
// In production, set VITE_API_BASE_URL to your deployed backend origin.
const rawApiBase = import.meta.env.DEV ? '' : (import.meta.env.VITE_API_BASE_URL || '').trim();
const normalizedApiBase = rawApiBase
  ? (rawApiBase.startsWith('http://') || rawApiBase.startsWith('https://') ? rawApiBase : `https://${rawApiBase}`)
  : '';
const API_BASE = normalizedApiBase.replace(/\/$/, '');

// One place for fetch + JSON parsing + server error messages.
async function api(path, { method = 'GET', body } = {}) {
  const res = await fetch(`${API_BASE}${path}`, {
    method,
    credentials: 'include',
    headers: body ? { 'Content-Type': 'application/json' } : undefined,
    body: body ? JSON.stringify(body) : undefined,
  });
  const text = await res.text();
  let data = {};
  try {
    data = text ? JSON.parse(text) : {};
  } catch {
    throw new Error(`Unexpected response from server (status ${res.status})`);
  }
  if (!res.ok) throw Object.assign(new Error(data.error || `Request failed (status ${res.status})`), { status: res.status, code: data.code });
  return data;
}

const todayISO = () => new Date().toISOString().slice(0, 10);
const shiftMonth = (ym, delta) => {
  const [y, m] = ym.split('-').map(Number);
  const d = new Date(y, m - 1 + delta, 1);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
};
const monthLabel = (ym) => parseDay(`${ym}-01`).toLocaleDateString(undefined, { month: 'long', year: 'numeric' });
const longDay = (iso) => parseDay(iso).toLocaleDateString(undefined, { weekday: 'long', month: 'long', day: 'numeric' });
const optNum = (v) => (v !== '' && v != null ? Number(v) : undefined);

const EMPTY_MANUAL = { name: '', calories: '', protein: '', carbs: '', fat: '' };
const EMPTY_SAVED = { name: '', calories: '', protein_g: '', carbs_g: '', fat_g: '', default_servings: 1 };
const WEEKDAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const GOALS = [
  { value: 'lose', label: 'Lose weight', icon: TrendDownIcon },
  { value: 'maintain', label: 'Maintain', icon: EqualsIcon },
  { value: 'gain', label: 'Gain weight', icon: TrendUpIcon },
];
const ACTIVITY = [
  { value: 'low', label: 'Low', hint: 'Mostly sitting' },
  { value: 'medium', label: 'Medium', hint: 'On your feet some' },
  { value: 'high', label: 'High', hint: 'Very active' },
];
const IDEAS = ['High-protein dinner under 600 kcal', 'Vegetarian meal prep for 3 days', 'Quick breakfast, no cooking'];

// Codes the backend uses when the user's own AI key is missing, rejected, out of credits or can't do the task.
const KEY_CODES = ['API_KEY_REQUIRED', 'API_KEY_INVALID', 'API_KEY_NO_CREDITS', 'API_KEY_NO_VISION'];

// Matches a pasted key to a provider by prefix (list comes from GET /ai/providers). null = ambiguous, user picks.
const detectProvider = (providers, key) =>
  providers.find((p) => p.prefix && new RegExp(p.prefix).test(key.trim())) || null;

// ---------- Theme: 'system' | 'light' | 'dark', saved per device ----------
// index.html runs the same logic before first paint; this keeps it in sync and follows the OS live on "system".
const THEMES = ['system', 'light', 'dark'];
const THEME_LABEL = { system: 'System', light: 'Light', dark: 'Dark' };
function applyTheme(choice) {
  const dark = choice === 'dark' || (choice === 'system' && window.matchMedia('(prefers-color-scheme: dark)').matches);
  document.documentElement.dataset.theme = dark ? 'dark' : 'light';
  // The landing page sets its own white browser-chrome colour; leave that alone while it is showing.
  const meta = document.querySelector('meta[name="theme-color"]');
  if (meta && !document.querySelector('.lp')) meta.content = dark ? '#080D0B' : '#F4F7F3';
}
function useTheme() {
  const [theme, setTheme] = useState(() => {
    try { return localStorage.getItem('theme') || 'system'; } catch { return 'system'; }
  });
  useEffect(() => {
    applyTheme(theme);
    try {
      if (theme === 'system') localStorage.removeItem('theme');
      else localStorage.setItem('theme', theme);
    } catch { /* storage blocked: the choice lasts for this visit */ }
    if (theme !== 'system') return undefined;
    const mq = window.matchMedia('(prefers-color-scheme: dark)');
    const follow = () => applyTheme('system');
    mq.addEventListener('change', follow);
    return () => mq.removeEventListener('change', follow);
  }, [theme]);
  return [theme, setTheme];
}

// Signed-out marketing page; its JS and CSS load as their own chunk only when needed.
// The import starts at module load so it runs alongside /auth/status instead of after it.
// A failed chunk load (flaky network, stale tab after a redeploy) reloads once, then falls back to the sign-in screen.
const landingChunk = import('./Landing.jsx').then((m) => {
  try { sessionStorage.removeItem('landing-reload'); } catch {}
  return m;
}, () => {
  try {
    if (!sessionStorage.getItem('landing-reload')) {
      sessionStorage.setItem('landing-reload', '1');
      window.location.reload();
    }
  } catch {}
  return { default: function LandingFallback({ onSignIn }) { useEffect(() => { onSignIn(); }, []); return null; } };
});
const Landing = lazy(() => landingChunk);

const Ambient = () => (
  <div className="ambient" aria-hidden="true"><span /><span /><span /></div>
);

const Splash = () => (
  <div className="grid min-h-[100dvh] place-items-center">
    <Ambient />
    <LeafIcon size={40} weight="duotone" className="animate-pulse text-accent" aria-label="Loading" />
  </div>
);

const Brand = ({ compact = false }) => (
  <div className="flex items-center gap-2.5">
    <span className="grid size-9 shrink-0 place-items-center rounded-xl bg-accent text-accent-ink">
      <LeafIcon size={20} weight="fill" aria-hidden="true" />
    </span>
    <span className={`font-semibold tracking-tight ${compact ? 'hidden sm:inline' : 'text-lg'}`}>Healthy Diet Tracker</span>
  </div>
);

const Stat = ({ icon: Icon, label, value }) => (
  <div>
    <div className="flex items-center gap-1.5 text-xs text-ink-2 sm:text-sm"><Icon size={16} aria-hidden="true" />{label}</div>
    <div className="num mt-1 text-xl font-semibold tracking-tight sm:text-2xl">
      {value}<span className="ml-1 text-sm font-normal text-ink-2">kcal</span>
    </div>
  </div>
);

const Segmented = ({ options, value, onChange, label }) => (
  <div className="flex rounded-full bg-surface-2 p-1" role="group" aria-label={label}>
    {options.map(([v, text]) => (
      <button
        key={v}
        type="button"
        aria-pressed={value === v}
        onClick={() => onChange(v)}
        className={`h-9 rounded-full px-4 text-sm font-medium transition ${value === v ? 'bg-surface text-ink shadow-sm' : 'text-ink-2 hover:text-ink'}`}
      >
        {text}
      </button>
    ))}
  </div>
);

const RecipeSkeleton = () => (
  <div className="panel animate-pulse space-y-4 p-6" aria-hidden="true">
    <div className="skeleton aspect-[16/9]" />
    <div className="skeleton h-6 w-2/3" />
    <div className="skeleton h-4 w-1/2" />
    <div className="skeleton h-2 w-full rounded-full" />
  </div>
);

function App() {
  // Auth
  const [authChecked, setAuthChecked] = useState(false);
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [user, setUser] = useState(null);
  const [showLogin, setShowLogin] = useState(true);
  const [acceptTerms, setAcceptTerms] = useState(false);
  // Delete account (profile drawer): asks for the password again before anything is removed.
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [deletePassword, setDeletePassword] = useState('');
  const [deleteError, setDeleteError] = useState(null);
  const [deleting, setDeleting] = useState(false);
  const [authLoading, setAuthLoading] = useState(false);
  const [authError, setAuthError] = useState(null);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');

  // Profile
  const [profile, setProfile] = useState(null);
  const [profileLoading, setProfileLoading] = useState(false);
  const [showProfileForm, setShowProfileForm] = useState(false);
  const [profileRequired, setProfileRequired] = useState(false);
  // Set when /me/profile failed for a reason other than "no profile yet": the app stays usable, onboarding is not forced.
  const [profileError, setProfileError] = useState(false);

  // AI provider key (bring your own). keyStep: null = not needed at login, 'active' = showing, 'done' = saved or skipped.
  const [keyStatus, setKeyStatus] = useState(null);
  const [providers, setProviders] = useState([]);
  const [keyProvider, setKeyProvider] = useState('auto');
  const [keyStep, setKeyStep] = useState(null);
  const [keyInput, setKeyInput] = useState('');
  const [keyShow, setKeyShow] = useState(false);
  const [keyError, setKeyError] = useState(null);
  const [keySaving, setKeySaving] = useState(false);
  const [keyReplacing, setKeyReplacing] = useState(false);
  const [keyFocus, setKeyFocus] = useState(false);
  const keyInputRef = useRef(null);

  // Daily targets (BMR/TDEE/macros)
  const [targets, setTargets] = useState(null);
  const [targetsLoading, setTargetsLoading] = useState(false);

  // Today
  const [todayTotals, setTodayTotals] = useState(null);
  const [todayActivity, setTodayActivity] = useState(null);
  const [frequentItems, setFrequentItems] = useState([]);
  const [steps, setSteps] = useState('');
  const [stepsSaving, setStepsSaving] = useState(false);

  // Insights & AI coach
  const [insights, setInsights] = useState(null);
  const [insightDays, setInsightDays] = useState(7);
  const [insightsLoading, setInsightsLoading] = useState(false);
  const [coachResult, setCoachResult] = useState(null);
  const [coachLoading, setCoachLoading] = useState(false);

  // Manual logging form (shared by Today and History, which never render together)
  const [manual, setManual] = useState(EMPTY_MANUAL);
  const [manualLoading, setManualLoading] = useState(false);
  const [manualError, setManualError] = useState(null);

  // Photo analysis
  const [photoModalVisible, setPhotoModalVisible] = useState(false);
  const [photoCandidates, setPhotoCandidates] = useState([]);
  const [photoUploading, setPhotoUploading] = useState(false);
  const [photoPreviewUrl, setPhotoPreviewUrl] = useState(null);
  const [recipeResults, setRecipeResults] = useState([]);
  const [recipeLoading, setRecipeLoading] = useState(false);
  const imageInputRef = useRef(null);
  // Numbers from the landing-page calculator. They fill empty profile fields until the first save.
  const prefillRef = useRef(null);

  // Meal planning
  const [userRequest, setUserRequest] = useState('');
  const [loading, setLoading] = useState(false);
  const [response, setResponse] = useState(null);
  const [error, setError] = useState(null);
  const resultsRef = useRef(null);

  // Profile form fields
  const [goals, setGoals] = useState('maintain');
  const [targetCalories, setTargetCalories] = useState('');
  const [allergies, setAllergies] = useState('');
  const [cuisine, setCuisine] = useState('');
  const [cookingTime, setCookingTime] = useState('');
  const [mealType, setMealType] = useState('');
  const [age, setAge] = useState('');
  const [sex, setSex] = useState('');
  const [heightCm, setHeightCm] = useState('');
  const [weightKg, setWeightKg] = useState('');
  const [activityLevel, setActivityLevel] = useState('medium');
  const [intensityPercent, setIntensityPercent] = useState(0);

  // History
  const [calendarMonth, setCalendarMonth] = useState(() => new Date().toISOString().slice(0, 7)); // YYYY-MM
  const [calendarTotals, setCalendarTotals] = useState([]);
  const [selectedDate, setSelectedDate] = useState(null);
  const [selectedDayItems, setSelectedDayItems] = useState([]);
  const [savedFoods, setSavedFoods] = useState([]);
  const [savedLoading, setSavedLoading] = useState(false);
  const [newSaved, setNewSaved] = useState(EMPTY_SAVED);
  const [editingId, setEditingId] = useState(null);
  const [editFields, setEditFields] = useState({ item_name: '', calories: '', protein_g: '', carbs_g: '', fat_g: '', servings: 1 });

  // Toast
  const [toast, setToast] = useState(null);
  const notify = useCallback((message, tone = 'ok') => setToast({ message, tone, id: Date.now() }), []);
  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast(null), 3600);
    return () => clearTimeout(t);
  }, [toast]);

  const [theme, setTheme] = useTheme();

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
    window.scrollTo(0, 0);
  };
  const onCalendar = route.startsWith('/calendar');

  // ---------- Loaders ----------
  const checkAuthStatus = async () => {
    try {
      const data = await api('/auth/status');
      if (data.authenticated) {
        setIsAuthenticated(true);
        setUser(data.user);
      }
    } catch (err) {
      console.error('Auth check failed:', err);
    } finally {
      setAuthChecked(true);
    }
  };

  const loadProfile = async () => {
    setProfileLoading(true);
    try {
      const data = await api('/me/profile');
      const loaded = data.profile;
      setProfile(loaded);
      setProfileError(false);
      const isEmpty = !loaded || (!loaded.goal && !loaded.target_calories && (!loaded.allergies || loaded.allergies.length === 0));
      setProfileRequired(isEmpty);
      if (isEmpty) setShowProfileForm(true);
    } catch (err) {
      console.error('Failed to load profile:', err);
      if (err.status === 404) {
        setProfileRequired(true);
        setShowProfileForm(true);
      } else {
        setProfileError(true);
      }
    } finally {
      setProfileLoading(false);
    }
  };

  const loadKeyStatus = async () => {
    let status = { has_key: false, last4: null, updated_at: null };
    try {
      const [s, list] = await Promise.all([api('/me/api_key'), api('/ai/providers').catch(() => ({ providers: [] }))]);
      status = s;
      setProviders(list.providers || []);
    } catch (err) {
      console.error('Failed to load key status:', err);
    }
    setKeyStatus(status);
    setKeyStep(status.has_key ? null : 'active');
  };

  const loadTargets = useCallback(async () => {
    setTargetsLoading(true);
    setTargets(null);
    try {
      const data = await api('/me/targets');
      if (data.targets) setTargets(data.targets);
    } catch (err) {
      console.error('Failed to load targets:', err);
    } finally {
      setTargetsLoading(false);
    }
  }, []);

  const loadInsights = async (days = 7) => {
    if (!isAuthenticated) return;
    setInsightDays(days);
    setInsightsLoading(true);
    try {
      setInsights(await api(`/me/insights?days=${days}`));
    } catch (err) {
      console.error('Failed to load insights:', err);
    } finally {
      setInsightsLoading(false);
    }
  };

  const loadTodayData = useCallback(async () => {
    if (!isAuthenticated) return;
    const d = todayISO();
    const [intake, activity, frequent] = await Promise.allSettled([
      api(`/me/intake?date=${d}`),
      api(`/me/activity?date=${d}`),
      api('/me/intake/frequent'),
    ]);
    if (intake.status === 'fulfilled') setTodayTotals(intake.value.totals || null);
    if (activity.status === 'fulfilled') setTodayActivity(activity.value.activity || null);
    if (frequent.status === 'fulfilled') setFrequentItems(frequent.value.items || []);
  }, [isAuthenticated]);

  const loadCalendar = async (month) => {
    if (!isAuthenticated) return;
    try {
      const data = await api(`/me/intake/calendar?month=${month}`);
      setCalendarTotals(data.totals || []);
    } catch (err) {
      console.error('Failed to load calendar totals:', err);
    }
  };

  const loadSavedFoods = async () => {
    if (!isAuthenticated) return;
    setSavedLoading(true);
    try {
      const data = await api('/me/saved_foods');
      setSavedFoods(data.items || []);
    } catch (err) {
      console.error('Failed to load saved foods:', err);
    } finally {
      setSavedLoading(false);
    }
  };

  const selectDay = async (date) => {
    setSelectedDate(date);
    setEditingId(null);
    try {
      const data = await api(`/me/intake?date=${date}`);
      setSelectedDayItems(data.items || []);
    } catch (err) {
      console.error('Failed to load day items:', err);
    }
  };

  // After any log change: refresh today, the chart, and (on History) the month + selected day.
  const refreshLogs = async (date) => {
    loadTodayData();
    loadInsights(insightDays);
    if (onCalendar) {
      loadCalendar(calendarMonth);
      if (date) await selectDay(date);
    }
  };

  // ---------- Effects ----------
  useEffect(() => { checkAuthStatus(); }, []);

  useEffect(() => {
    if (!isAuthenticated) return;
    loadProfile();
    loadKeyStatus();
  }, [isAuthenticated]);

  // Signed-in users have no business on the sign-in screen.
  useEffect(() => {
    if (isAuthenticated && route === '/signin') {
      window.history.replaceState({}, '', '/');
      setRoute('/');
    }
  }, [isAuthenticated, route]);

  // Focus the key field when the drawer was opened because of a key error (dialog is open by now).
  useEffect(() => {
    if (!showProfileForm || !keyFocus) return;
    keyInputRef.current?.focus();
    setKeyFocus(false);
  }, [showProfileForm, keyFocus]);

  useEffect(() => {
    if (isAuthenticated && !profileRequired) {
      loadInsights(7);
      loadTodayData();
    }
  }, [isAuthenticated, profileRequired, loadTodayData]);

  useEffect(() => {
    if (isAuthenticated && !profileRequired) loadTargets();
    else setTargets(null);
  }, [isAuthenticated, profileRequired, profile, loadTargets]);

  useEffect(() => {
    if (!profile) return;
    const f = prefillRef.current || {};
    setGoals(profile.goal || f.goal || 'maintain');
    setTargetCalories(profile.target_calories ?? '');
    setAllergies(Array.isArray(profile.allergies) ? profile.allergies.join(', ') : '');
    setCuisine(profile.preferences?.cuisine || '');
    setCookingTime(profile.preferences?.cookingTime || '');
    setMealType(profile.preferences?.mealType || '');
    setAge(profile.age ?? f.age ?? '');
    setSex(profile.sex || f.sex || '');
    setHeightCm(profile.height_cm ?? f.height_cm ?? '');
    setWeightKg(profile.weight_kg ?? f.weight_kg ?? '');
    setActivityLevel(profile.activity_level || f.activity_level || 'medium');
    setIntensityPercent(profile.intensity_percent || (f.goal === 'lose' ? -20 : f.goal === 'gain' ? 10 : 0));
  }, [profile]);

  useEffect(() => {
    setSteps(todayActivity?.steps ? String(todayActivity.steps) : '');
  }, [todayActivity]);

  useEffect(() => {
    if (onCalendar && isAuthenticated) {
      loadCalendar(calendarMonth);
      loadSavedFoods();
    }
  }, [route, calendarMonth, isAuthenticated]);

  // Entering History: refresh the selected day (defaults to today) so it never shows stale entries.
  useEffect(() => {
    if (onCalendar && isAuthenticated) selectDay(selectedDate || todayISO());
  }, [route, isAuthenticated]);

  // Reset intensity to sensible defaults when goal changes
  useEffect(() => {
    if (goals === 'lose' && intensityPercent > 0) setIntensityPercent(-20);
    if (goals === 'gain' && intensityPercent < 0) setIntensityPercent(10);
  }, [goals]);

  useEffect(() => {
    if (!response || !resultsRef.current) return;
    const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    resultsRef.current.scrollIntoView({ behavior: reduce ? 'auto' : 'smooth', block: 'start' });
  }, [response]);

  // ---------- Actions ----------
  const handleAuth = async (e) => {
    e.preventDefault();
    setAuthError(null);
    if (!showLogin && password !== confirmPassword) {
      setAuthError('Passwords do not match');
      return;
    }
    if (!showLogin && !acceptTerms) {
      setAuthError('Please confirm you are 18 or older and agree to the Terms and Privacy Policy.');
      return;
    }
    setAuthLoading(true);
    try {
      const data = await api(showLogin ? '/auth/login' : '/auth/register', {
        method: 'POST',
        body: showLogin ? { email, password } : { email, password, accept_terms: acceptTerms },
      });
      setIsAuthenticated(true);
      setUser(data.user);
      setEmail('');
      setPassword('');
      setConfirmPassword('');
      navigate('/');
    } catch (err) {
      setAuthError(err.message || (showLogin ? 'Login failed' : 'Registration failed'));
    } finally {
      setAuthLoading(false);
    }
  };

  const deleteAccount = async (e) => {
    e.preventDefault();
    if (!deletePassword) return setDeleteError('Enter your password to confirm.');
    setDeleteError(null);
    setDeleting(true);
    try {
      await api('/me/account', { method: 'DELETE', body: { password: deletePassword } });
      // Everything is gone server-side, including the session: start fresh on the landing page.
      window.location.assign('/');
    } catch (err) {
      setDeleteError(err.message || 'Couldn’t delete the account');
      setDeleting(false);
    }
  };

  const handleLogout = async () => {
    try {
      await api('/auth/logout', { method: 'POST' });
    } catch (err) {
      console.error('Logout failed:', err);
    }
    setIsAuthenticated(false);
    setUser(null);
    setProfile(null);
    prefillRef.current = null;
    setProfileRequired(false);
    setProfileError(false);
    setResponse(null);
    setInsights(null);
    setCoachResult(null);
    setTodayTotals(null);
    setTodayActivity(null);
    setFrequentItems([]);
    setTargets(null);
    setSelectedDate(null);
    setSelectedDayItems([]);
    setCalendarTotals([]);
    setSavedFoods([]);
    setUserRequest('');
    setError(null);
    setShowProfileForm(false);
    closePhoto();
    setKeyStatus(null);
    setKeyStep(null);
    resetKeyForm();
    navigate('/');
  };

  // ---------- AI provider key ----------
  const resetKeyForm = () => {
    setKeyInput('');
    setKeyProvider('auto');
    setKeyShow(false);
    setKeyError(null);
    setKeyReplacing(false);
  };

  const closeProfile = () => {
    setShowProfileForm(false);
    resetKeyForm();
  };

  // Opens the drawer with the key field ready, e.g. after an AI request failed on the key.
  const openKeySettings = (reason) => {
    resetKeyForm();
    if (typeof reason === 'string') setKeyError(reason);
    setKeyReplacing(true);
    setKeyFocus(true);
    setShowProfileForm(true);
  };

  // Returns true when the error was about the user's key and has been handled.
  const handleKeyError = (err) => {
    if (!KEY_CODES.includes(err?.code)) return false;
    // The drawer shows the reason inline (role=alert); only the no-credits case, which doesn't open it, needs a toast.
    if (err.code === 'API_KEY_NO_CREDITS') notify(err.message, 'error');
    else openKeySettings(err.message);
    return true;
  };

  const saveKey = async (e) => {
    e.preventDefault();
    const key = keyInput.trim();
    if (!key) return setKeyError('Paste your API key first.');
    const provider = keyProvider !== 'auto' ? keyProvider : detectProvider(providers, key)?.id;
    if (!provider && providers.length) return setKeyError('We can’t tell which provider this key is for. Pick it above.');
    setKeyError(null);
    setKeySaving(true);
    try {
      const data = await api('/me/api_key', { method: 'PUT', body: { api_key: key, provider } });
      setKeyStatus(data);
      resetKeyForm();
      setKeyStep((s) => (s === 'active' ? 'done' : s));
      notify(`${data.provider_label || 'Key'} connected, ending in ${data.last4}`);
    } catch (err) {
      setKeyError(err.message || 'Couldn’t save the key');
    } finally {
      setKeySaving(false);
    }
  };

  const removeKey = async () => {
    if (!window.confirm(`Remove your ${keyStatus?.provider_label || 'AI'} key? AI features stop working until you add one again.`)) return;
    try {
      setKeyStatus(await api('/me/api_key', { method: 'DELETE' }));
      resetKeyForm();
      notify('Key removed');
    } catch (err) {
      notify(`Couldn’t remove key: ${err.message}`, 'error');
    }
  };

  const handleSaveProfile = async () => {
    setProfileLoading(true);
    try {
      const data = await api('/me/profile', {
        method: 'PUT',
        body: {
          goal: goals,
          target_calories: targetCalories ? parseInt(targetCalories, 10) : null,
          age: age ? parseInt(age, 10) : null,
          sex: sex || null,
          height_cm: heightCm ? parseInt(heightCm, 10) : null,
          weight_kg: weightKg ? parseFloat(weightKg) : null,
          activity_level: activityLevel || null,
          intensity_percent: intensityPercent,
          allergies: allergies.split(',').map((a) => a.trim()).filter(Boolean),
          diet_type: 'none',
          preferences: {
            cuisine: cuisine || undefined,
            cookingTime: cookingTime || undefined,
            mealType: mealType || undefined,
          },
        },
      });
      const updated = data.profile;
      prefillRef.current = null;
      setProfile(updated);
      if (updated && (updated.goal || updated.target_calories || (updated.allergies && updated.allergies.length > 0))) {
        setProfileRequired(false);
        setShowProfileForm(false);
        notify('Profile saved');
      }
    } catch (err) {
      notify(err.message || 'Failed to save profile', 'error');
    } finally {
      setProfileLoading(false);
    }
  };

  const logManual = async (date) => {
    setManualError(null);
    setManualLoading(true);
    try {
      await api('/me/intake', {
        method: 'POST',
        body: {
          date,
          item_name: manual.name,
          calories: Number(manual.calories),
          protein_g: optNum(manual.protein),
          carbs_g: optNum(manual.carbs),
          fat_g: optNum(manual.fat),
          servings: 1,
          source_type: 'manual',
        },
      });
      notify(`Logged ${manual.name}`);
      setManual(EMPTY_MANUAL);
      await refreshLogs(date);
    } catch (err) {
      setManualError(err.message || 'Failed to add');
    } finally {
      setManualLoading(false);
    }
  };

  const handleQuickAdd = async (item) => {
    try {
      await api('/me/intake', {
        method: 'POST',
        body: {
          date: todayISO(),
          item_name: item.item_name,
          calories: Number(item.avg_calories) || 0,
          protein_g: Number(item.avg_protein) || 0,
          carbs_g: Number(item.avg_carbs) || 0,
          fat_g: Number(item.avg_fat) || 0,
          servings: 1,
          source_type: item.source_type || 'saved_food',
        },
      });
      notify(`Logged ${item.item_name}`);
      refreshLogs();
    } catch (err) {
      notify(`Couldn’t add item: ${err.message}`, 'error');
    }
  };

  const logSteps = async (e) => {
    e.preventDefault();
    setStepsSaving(true);
    try {
      await api('/me/activity', { method: 'POST', body: { date: todayISO(), steps: Number(steps) || 0 } });
      notify('Steps saved');
      refreshLogs();
    } catch (err) {
      notify(`Couldn’t save steps: ${err.message}`, 'error');
    } finally {
      setStepsSaving(false);
    }
  };

  // Resize image file to JPEG base64 to reduce upload size and normalize inputs
  const fileToResizedBase64 = (file, maxWidth = 1024, quality = 0.8) => new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = reject;
    reader.onload = () => {
      const img = new Image();
      img.onerror = reject;
      img.onload = () => {
        const scale = Math.min(1, maxWidth / img.width);
        const canvas = document.createElement('canvas');
        canvas.width = Math.round(img.width * scale);
        canvas.height = Math.round(img.height * scale);
        canvas.getContext('2d').drawImage(img, 0, 0, canvas.width, canvas.height);
        try {
          resolve(String(canvas.toDataURL('image/jpeg', quality)).replace(/^data:image\/(png|jpeg);base64,/, ''));
        } catch (err) {
          reject(err);
        }
      };
      img.src = String(reader.result);
    };
    reader.readAsDataURL(file);
  });

  const handlePhotoFileChange = async (e) => {
    const file = e.target.files && e.target.files[0];
    e.target.value = ''; // allow picking the same file again
    if (!file) return;
    setPhotoUploading(true);
    setPhotoCandidates([]);
    setRecipeResults([]);
    try {
      const image_base64 = await fileToResizedBase64(file, 1024, 0.78);
      setPhotoPreviewUrl(`data:image/jpeg;base64,${image_base64}`);
      const data = await api('/me/intake/from_image', { method: 'POST', body: { date: todayISO(), image_base64 } });
      setPhotoCandidates(data.candidates || []);
      setPhotoModalVisible(true);
    } catch (err) {
      console.error('Image analysis error:', err);
      if (!handleKeyError(err)) notify(`Image analysis failed: ${err.message}`, 'error');
    } finally {
      setPhotoUploading(false);
    }
  };

  const closePhoto = () => {
    setPhotoModalVisible(false);
    setPhotoCandidates([]);
    setPhotoPreviewUrl(null);
    setRecipeResults([]);
  };

  const saveCandidateToDate = async (candidate, date) => {
    try {
      await api('/me/intake', {
        method: 'POST',
        body: {
          date: date || todayISO(),
          item_name: candidate.label,
          calories: Number(candidate.calories || 0),
          protein_g: candidate.protein_g != null ? Number(candidate.protein_g) : undefined,
          carbs_g: candidate.carbs_g != null ? Number(candidate.carbs_g) : undefined,
          fat_g: candidate.fat_g != null ? Number(candidate.fat_g) : undefined,
          servings: 1,
          source_type: 'generated_recipe',
          image_url: photoPreviewUrl || null,
        },
      });
      closePhoto();
      notify(`Logged ${candidate.label}`);
      refreshLogs();
    } catch (err) {
      notify(`Save failed: ${err.message}`, 'error');
    }
  };

  const searchRecipes = async (query) => {
    if (!query) return;
    setRecipeLoading(true);
    setRecipeResults([]);
    try {
      const data = await api('/me/search_recipe', { method: 'POST', body: { query } });
      setRecipeResults((data.recipes || []).map((r) => ({
        title: r.title || r.name || 'Recipe',
        source_url: r.url || r.source_url || null,
        image_url: r.image || null,
        daily_contribution: r.summary || null,
        source: r.source || undefined,
      })));
    } catch (err) {
      console.error('Recipe search failed:', err);
      if (!handleKeyError(err)) notify(`Recipe search failed: ${err.message}`, 'error');
    } finally {
      setRecipeLoading(false);
    }
  };

  const addRecipeToLog = async (recipe, servings) => {
    const n = recipe.nutrients || {};
    const scaled = (v) => (v != null ? Number(v) * servings : undefined);
    try {
      await api('/me/intake', {
        method: 'POST',
        body: {
          date: todayISO(),
          item_name: recipe.title || 'Recipe',
          calories: (n.calories != null ? Number(n.calories) : 0) * servings,
          protein_g: scaled(n.protein_g),
          carbs_g: scaled(n.carbs_g),
          fat_g: scaled(n.fat_g),
          servings,
          source_type: 'generated_recipe',
        },
      });
      notify(`Added ${recipe.title || 'recipe'} to today`);
      refreshLogs();
    } catch (err) {
      notify(`Couldn’t add to log: ${err.message}`, 'error');
    }
  };

  const askCoach = async (days = 7) => {
    setCoachLoading(true);
    setCoachResult(null);
    try {
      setCoachResult(await api('/me/coach', { method: 'POST', body: { days } }));
    } catch (err) {
      console.error('Coach request failed:', err);
      handleKeyError(err);
      setCoachResult({ error: err.message, code: err.code });
    } finally {
      setCoachLoading(false);
    }
  };

  const handleSubmit = async (e) => {
    e?.preventDefault?.();
    setLoading(true);
    setError(null);
    setResponse(null);
    try {
      setResponse(await api('/me/plan_meal', { method: 'POST', body: { request: userRequest || undefined } }));
    } catch (err) {
      if (!handleKeyError(err)) setError(err.message || 'An error occurred');
    } finally {
      setLoading(false);
    }
  };

  const startEdit = (item) => {
    setEditingId(item.id);
    setEditFields({
      item_name: item.item_name || '',
      calories: item.calories ?? '',
      protein_g: item.protein_g ?? '',
      carbs_g: item.carbs_g ?? '',
      fat_g: item.fat_g ?? '',
      servings: item.servings || 1,
    });
  };

  const saveEdit = async (id) => {
    try {
      await api(`/me/intake/${id}`, {
        method: 'PUT',
        body: {
          item_name: editFields.item_name,
          calories: Number(editFields.calories),
          protein_g: editFields.protein_g !== '' ? Number(editFields.protein_g) : null,
          carbs_g: editFields.carbs_g !== '' ? Number(editFields.carbs_g) : null,
          fat_g: editFields.fat_g !== '' ? Number(editFields.fat_g) : null,
          servings: editFields.servings !== '' ? Number(editFields.servings) : 1,
        },
      });
      setEditingId(null);
      notify('Entry updated');
      await refreshLogs(selectedDate);
    } catch (err) {
      notify(`Couldn’t save: ${err.message}`, 'error');
    }
  };

  const removeItem = async (item) => {
    if (!window.confirm(`Delete ${item.item_name}?`)) return;
    try {
      await api(`/me/intake/${item.id}`, { method: 'DELETE' });
      notify(`Deleted ${item.item_name}`);
      await refreshLogs(selectedDate);
    } catch (err) {
      notify(`Delete failed: ${err.message}`, 'error');
    }
  };

  const addSavedToDate = async (savedItem, date) => {
    const day = date || todayISO();
    try {
      await api('/me/intake', {
        method: 'POST',
        body: {
          date: day,
          item_name: savedItem.name,
          calories: Number(savedItem.calories),
          protein_g: savedItem.protein_g != null ? Number(savedItem.protein_g) : undefined,
          carbs_g: savedItem.carbs_g != null ? Number(savedItem.carbs_g) : undefined,
          fat_g: savedItem.fat_g != null ? Number(savedItem.fat_g) : undefined,
          servings: savedItem.default_servings || 1,
          source_type: 'saved_food',
        },
      });
      notify(`Logged ${savedItem.name}`);
      await refreshLogs(day);
    } catch (err) {
      notify(`Couldn’t add saved food: ${err.message}`, 'error');
    }
  };

  const createSavedFood = async () => {
    if (!newSaved.name || newSaved.calories === '') return notify('Name and calories are required', 'error');
    try {
      await api('/me/saved_foods', {
        method: 'POST',
        body: {
          name: newSaved.name,
          calories: Number(newSaved.calories),
          protein_g: optNum(newSaved.protein_g),
          carbs_g: optNum(newSaved.carbs_g),
          fat_g: optNum(newSaved.fat_g),
          default_servings: newSaved.default_servings || 1,
        },
      });
      notify(`Saved ${newSaved.name}`);
      setNewSaved(EMPTY_SAVED);
      await loadSavedFoods();
    } catch (err) {
      notify(`Create failed: ${err.message}`, 'error');
    }
  };

  const setM = (k) => (e) => setManual((m) => ({ ...m, [k]: e.target.value }));
  const setE = (k) => (e) => setEditFields((f) => ({ ...f, [k]: e.target.value }));
  const setS = (k) => (e) => setNewSaved((s) => ({ ...s, [k]: e.target.value }));
  const openPhotoPicker = () => imageInputRef.current?.click();

  // ---------- Shared blocks ----------
  const manualForm = (date, idPrefix, submitLabel) => (
    <form onSubmit={(e) => { e.preventDefault(); logManual(date); }} className="space-y-3">
      <div className="grid grid-cols-[1fr_6.5rem] gap-3">
        <div>
          <label htmlFor={`${idPrefix}-name`} className="label">Food</label>
          <input id={`${idPrefix}-name`} required className="field" value={manual.name} onChange={setM('name')} placeholder="Greek yogurt" autoComplete="off" />
        </div>
        <div>
          <label htmlFor={`${idPrefix}-kcal`} className="label">kcal</label>
          <input id={`${idPrefix}-kcal`} required type="number" min={0} step="any" inputMode="decimal" className="field num" value={manual.calories} onChange={setM('calories')} placeholder="150" />
        </div>
      </div>
      <div className="grid grid-cols-3 gap-3">
        {MACROS.map((m) => (
          <div key={m.key}>
            <label htmlFor={`${idPrefix}-${m.key}`} className="label flex items-center gap-1.5">
              <span className={`size-2 rounded-full ${m.dot}`} aria-hidden="true" />{m.label}
            </label>
            <input id={`${idPrefix}-${m.key}`} type="number" min={0} step="any" inputMode="decimal" className="field num" value={manual[m.key]} onChange={setM(m.key)} placeholder="g" />
          </div>
        ))}
      </div>
      {manualError && (
        <p role="alert" className="flex items-center gap-2 text-sm text-danger"><WarningCircleIcon size={16} />{manualError}</p>
      )}
      <button type="submit" disabled={manualLoading} className="btn-primary w-full">
        <PlusIcon size={18} weight="bold" />{manualLoading ? 'Adding…' : submitLabel}
      </button>
    </form>
  );

  // Only one of these renders at a time (onboarding or the drawer), so they share state and the ref.
  const detected = detectProvider(providers, keyInput);
  const chosen = keyProvider !== 'auto' ? providers.find((p) => p.id === keyProvider) : detected;
  const keyForm = (idPrefix, extraAction) => (
    <form onSubmit={saveKey} noValidate className="space-y-4">
      {providers.length > 0 && (
        <div>
          <label htmlFor={`${idPrefix}-prov`} className="label">Provider</label>
          <select
            id={`${idPrefix}-prov`}
            className="field"
            value={keyProvider}
            onChange={(e) => { setKeyProvider(e.target.value); setKeyError(null); }}
          >
            <option value="auto">{detected ? `Detect from key: ${detected.label}` : 'Detect from key'}</option>
            {providers.map((p) => <option key={p.id} value={p.id}>{p.label}</option>)}
          </select>
          <p className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-sm text-ink-2">
            {chosen ? (
              <a href={chosen.keyUrl} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 font-medium text-accent hover:underline">
                Get your {chosen.label} key<ArrowSquareOutIcon size={14} aria-hidden="true" />
              </a>
            ) : 'Works with OpenAI, Anthropic, Google Gemini, OpenRouter, Groq, Perplexity, xAI, Mistral and DeepSeek.'}
          </p>
          {chosen && (!chosen.vision || !chosen.webSearch) && (
            <ul className="mt-2 space-y-1 text-sm text-ink-2">
              {!chosen.vision && <li>Photo logging isn’t available with {chosen.label}.</li>}
              {!chosen.webSearch && <li>Meal plans are written by the model, without live web search.</li>}
            </ul>
          )}
        </div>
      )}
      <div>
        <label htmlFor={`${idPrefix}-key`} className="label">API key</label>
        <div className="relative">
          <input
            ref={keyInputRef}
            id={`${idPrefix}-key`}
            name="ai_api_key"
            type={keyShow ? 'text' : 'password'}
            autoComplete="off"
            autoCapitalize="off"
            autoCorrect="off"
            spellCheck={false}
            placeholder={chosen?.placeholder || 'Paste your key'}
            value={keyInput}
            onChange={(e) => { setKeyInput(e.target.value); setKeyError(null); }}
            aria-invalid={keyError ? true : undefined}
            aria-describedby={keyError ? `${idPrefix}-key-err` : undefined}
            className="field pr-12"
          />
          <button
            type="button"
            className="icon-btn absolute right-0 top-0"
            aria-label="Show key"
            aria-pressed={keyShow}
            onClick={() => setKeyShow((v) => !v)}
          >
            {keyShow ? <EyeSlashIcon size={20} /> : <EyeIcon size={20} />}
          </button>
        </div>
        {keyError && (
          <p id={`${idPrefix}-key-err`} role="alert" className="mt-2 flex items-start gap-2 text-sm text-danger">
            <WarningCircleIcon size={16} className="mt-0.5 shrink-0" />{keyError}
          </p>
        )}
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <button type="submit" disabled={keySaving} className="btn-primary">
          <KeyIcon size={18} weight="bold" />{keySaving ? 'Checking key…' : 'Save key'}
        </button>
        {extraAction}
      </div>
    </form>
  );

  const securityNote = (
    <p className="flex items-start gap-2.5 rounded-2xl bg-surface-2/60 p-4 text-sm leading-relaxed text-ink-2">
      <ShieldCheckIcon size={20} className="mt-px shrink-0 text-accent" aria-hidden="true" />
      Encrypted on our server with AES-256-GCM. We only ever show the last 4 characters, and you can replace or remove it any time.
    </p>
  );

  const keySection = (
    <section aria-labelledby="key-h" className="space-y-4 rounded-2xl border border-line p-5">
      <h3 id="key-h" className="flex items-center gap-2 text-base font-semibold">
        <KeyIcon size={20} className="text-accent" aria-hidden="true" />AI provider key
      </h3>
      {keyStatus?.has_key && !keyReplacing ? (
        <div className="flex flex-wrap items-center gap-2">
          <p className="mr-auto text-[15px] text-ink-2">
            Connected to <span className="font-semibold text-ink">{keyStatus.provider_label || 'your provider'}</span>, ending in <span className="num font-semibold text-ink">{keyStatus.last4}</span>
          </p>
          <button type="button" className="btn-ghost h-10 px-4 text-sm" onClick={() => { resetKeyForm(); setKeyReplacing(true); setKeyFocus(true); }}>Replace</button>
          <button type="button" className="btn-quiet h-10 px-4 text-sm hover:text-danger" onClick={removeKey}>
            <TrashIcon size={16} aria-hidden="true" />Remove
          </button>
        </div>
      ) : (
        <>
          <p className="text-sm text-ink-2">
            {keyStatus?.has_key
              ? 'Paste a new key to replace the saved one.'
              : 'Photo logging, meal plans and the coach run on your own AI provider account.'}
          </p>
          {keyForm('kp', keyStatus?.has_key && (
            <button type="button" className="btn-quiet" onClick={resetKeyForm}>Cancel</button>
          ))}
          {securityNote}
        </>
      )}
    </section>
  );

  const profileForm = (
    <form onSubmit={(e) => { e.preventDefault(); handleSaveProfile(); }} className="space-y-8">
      <fieldset>
        <legend className="label">Goal</legend>
        <div className="grid grid-cols-3 gap-2">
          {GOALS.map(({ value, label, icon: Icon }) => (
            <label
              key={value}
              className={`flex cursor-pointer flex-col items-center gap-2 rounded-2xl border p-4 text-center text-sm font-medium transition has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-accent ${goals === value ? 'border-accent bg-accent-soft text-ink' : 'border-line text-ink-2 hover:border-ink-2/40 hover:text-ink'}`}
            >
              <input type="radio" name="goal" value={value} checked={goals === value} onChange={(e) => setGoals(e.target.value)} className="sr-only" required={profileRequired} />
              <Icon size={22} weight={goals === value ? 'bold' : 'regular'} aria-hidden="true" />
              {label}
            </label>
          ))}
        </div>
      </fieldset>

      <fieldset className="space-y-4">
        <legend className="text-base font-semibold">Body</legend>
        <p className="!mt-1 text-sm text-ink-2">Used to calculate your daily energy needs (BMR, then TDEE).</p>
        <div className="grid grid-cols-2 gap-4">
          <div>
            <label htmlFor="p-age" className="label">Age</label>
            <input id="p-age" type="number" min={1} max={120} inputMode="numeric" value={age} onChange={(e) => setAge(e.target.value)} placeholder="30" className="field num" />
          </div>
          <div>
            <label htmlFor="p-sex" className="label">Sex</label>
            <select id="p-sex" value={sex} onChange={(e) => setSex(e.target.value)} className="field">
              <option value="">Select</option>
              <option value="male">Male</option>
              <option value="female">Female</option>
            </select>
          </div>
          <div>
            <label htmlFor="p-height" className="label">Height (cm)</label>
            <input id="p-height" type="number" min={1} inputMode="numeric" value={heightCm} onChange={(e) => setHeightCm(e.target.value)} placeholder="170" className="field num" />
          </div>
          <div>
            <label htmlFor="p-weight" className="label">Weight (kg)</label>
            <input id="p-weight" type="number" min={0} step={0.1} inputMode="decimal" value={weightKg} onChange={(e) => setWeightKg(e.target.value)} placeholder="70" className="field num" />
          </div>
        </div>

        <div>
          <span className="label" id="p-activity">Activity level</span>
          <div className="grid grid-cols-3 gap-2" role="radiogroup" aria-labelledby="p-activity">
            {ACTIVITY.map((a) => (
              <label
                key={a.value}
                className={`cursor-pointer rounded-2xl border px-3 py-3 text-center transition has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-accent ${activityLevel === a.value ? 'border-accent bg-accent-soft' : 'border-line hover:border-ink-2/40'}`}
              >
                <input type="radio" name="activity" value={a.value} checked={activityLevel === a.value} onChange={(e) => setActivityLevel(e.target.value)} className="sr-only" />
                <span className="block text-sm font-medium">{a.label}</span>
                <span className="block text-xs text-ink-2">{a.hint}</span>
              </label>
            ))}
          </div>
        </div>

        {(goals === 'lose' || goals === 'gain') && (
          <div>
            <label htmlFor="p-intensity" className="label flex justify-between">
              <span>{goals === 'lose' ? 'Deficit' : 'Surplus'}</span>
              <span className="num font-semibold text-ink">{intensityPercent > 0 ? '+' : ''}{intensityPercent}%</span>
            </label>
            <input
              id="p-intensity"
              type="range"
              min={goals === 'lose' ? -30 : 0}
              max={goals === 'gain' ? 20 : 0}
              step={5}
              value={goals === 'lose' ? Math.max(-30, Math.min(0, intensityPercent)) : Math.max(0, Math.min(20, intensityPercent))}
              onChange={(e) => setIntensityPercent(Number(e.target.value))}
              className="w-full cursor-pointer"
            />
            <p className="mt-1 text-xs text-ink-2">
              {goals === 'lose' ? 'For example, −20% eats about 0.8× your TDEE.' : 'For example, +10% eats about 1.1× your TDEE.'}
            </p>
          </div>
        )}
      </fieldset>

      <fieldset className="space-y-4">
        <legend className="text-base font-semibold">Targets and diet</legend>
        <div>
          <label htmlFor="p-target" className="label">Target calories (optional)</label>
          <input id="p-target" type="number" inputMode="numeric" value={targetCalories} onChange={(e) => setTargetCalories(e.target.value)} placeholder="Leave empty to use your calculated target" className="field num" />
        </div>
        <div>
          <label htmlFor="p-allergies" className="label">Allergies or restrictions</label>
          <input id="p-allergies" type="text" value={allergies} onChange={(e) => setAllergies(e.target.value)} placeholder="nuts, dairy, gluten" className="field" />
          <p className="mt-1.5 text-xs text-ink-2">Separate with commas.</p>
        </div>
      </fieldset>

      <fieldset className="space-y-4">
        <legend className="text-base font-semibold">Meal preferences</legend>
        <div className="grid gap-4 sm:grid-cols-3">
          <div>
            <label htmlFor="p-cuisine" className="label">Cuisine</label>
            <input id="p-cuisine" type="text" value={cuisine} onChange={(e) => setCuisine(e.target.value)} placeholder="Italian, Asian" className="field" />
          </div>
          <div>
            <label htmlFor="p-time" className="label">Cooking time</label>
            <input id="p-time" type="text" value={cookingTime} onChange={(e) => setCookingTime(e.target.value)} placeholder="Under 30 min" className="field" />
          </div>
          <div>
            <label htmlFor="p-meal" className="label">Meal type</label>
            <input id="p-meal" type="text" value={mealType} onChange={(e) => setMealType(e.target.value)} placeholder="Dinner" className="field" />
          </div>
        </div>
      </fieldset>

      <button type="submit" disabled={profileLoading} className="btn-primary w-full">
        {profileLoading ? 'Saving…' : profileRequired ? 'Save and continue' : 'Save profile'}
      </button>
    </form>
  );

  // ---------- Screens ----------
  // Legal pages work signed in or out, and before the auth check finishes.
  if (route === '/terms' || route === '/privacy') {
    return <Legal page={route.slice(1)} onBack={() => (window.history.length > 1 ? window.history.back() : navigate('/'))} />;
  }

  if (!authChecked || (isAuthenticated && ((!profile && !profileRequired && !profileError) || !keyStatus))) return <Splash />;

  if (!isAuthenticated && route === '/') {
    return (
      <Suspense fallback={<Splash />}>
        <Landing
          onSignIn={() => { setShowLogin(true); setAuthError(null); navigate('/signin'); }}
          onCreateAccount={(p) => {
            // From the landing calculator: the profile step starts from what they already entered.
            prefillRef.current = p || null;
            setShowLogin(false); setAuthError(null); navigate('/signin');
          }}
        />
      </Suspense>
    );
  }

  if (!isAuthenticated) {
    return (
      <div className="min-h-[100dvh]">
        <Ambient />
        <main className="mx-auto grid min-h-[100dvh] max-w-6xl items-center gap-10 px-4 py-10 sm:px-6 lg:grid-cols-[1.15fr_0.85fr] lg:gap-16">
          <section className="rise space-y-10">
            <a href="/" onClick={(e) => { e.preventDefault(); navigate('/'); }} className="inline-flex rounded-xl" aria-label="Healthy Diet Tracker home">
              <Brand />
            </a>
            <div className="space-y-5">
              <h1 className="max-w-xl text-balance text-4xl font-semibold leading-[1.05] tracking-tight sm:text-5xl lg:text-6xl">
                Know your numbers, then eat to them.
              </h1>
              <p className="max-w-[46ch] text-lg leading-relaxed text-ink-2">
                Log meals by photo or by hand, track them against your daily targets, and get meals planned to fit.
              </p>
            </div>

            {/* Live component preview with example values (not a screenshot). */}
            <div className="rise panel hidden max-w-xl items-center gap-8 p-6 lg:flex" style={{ '--i': 2 }} aria-hidden="true">
              <div className="w-40 shrink-0">
                <Ring value={1460} max={2150} label="">
                  <div>
                    <div className="num text-3xl font-semibold tracking-tight">690</div>
                    <div className="text-xs text-ink-2">kcal left</div>
                  </div>
                </Ring>
              </div>
              <div className="flex-1 space-y-4">
                <p className="text-sm text-ink-2">Example day</p>
                <MacroMeter label="Protein" dot="bg-protein" value={96} target={140} />
                <MacroMeter label="Carbs" dot="bg-carbs" value={162} target={240} />
                <MacroMeter label="Fat" dot="bg-fat" value={41} target={70} />
              </div>
            </div>
          </section>

          <section className="rise panel p-6 sm:p-8" style={{ '--i': 1 }} aria-label={showLogin ? 'Sign in' : 'Create account'}>
            <div className="mb-8 grid grid-cols-2 rounded-full bg-surface-2 p-1">
              {[['Sign in', true], ['Create account', false]].map(([label, isLogin]) => (
                <button
                  key={label}
                  type="button"
                  aria-pressed={showLogin === isLogin}
                  onClick={() => { setShowLogin(isLogin); setAuthError(null); }}
                  className={`h-10 rounded-full text-sm font-medium transition ${showLogin === isLogin ? 'bg-surface text-ink shadow-sm' : 'text-ink-2 hover:text-ink'}`}
                >
                  {label}
                </button>
              ))}
            </div>

            <form onSubmit={handleAuth} className="space-y-5">
              <div>
                <label htmlFor="a-email" className="label">Email</label>
                <input id="a-email" autoFocus={route === '/signin'} name="email" type="email" autoComplete="email" spellCheck={false} required value={email} onChange={(e) => setEmail(e.target.value)} className="field" placeholder="you@example.com" />
              </div>
              <div>
                <label htmlFor="a-password" className="label">Password</label>
                <input
                  id="a-password"
                  name="password"
                  type="password"
                  autoComplete={showLogin ? 'current-password' : 'new-password'}
                  required
                  minLength={showLogin ? undefined : 8}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="field"
                />
                {!showLogin && <p className="mt-1.5 text-xs text-ink-2">At least 8 characters.</p>}
              </div>
              {!showLogin && (
                <div>
                  <label htmlFor="a-confirm" className="label">Confirm password</label>
                  <input id="a-confirm" type="password" autoComplete="new-password" required minLength={8} value={confirmPassword} onChange={(e) => setConfirmPassword(e.target.value)} className="field" />
                </div>
              )}
              {!showLogin && (
                <label htmlFor="a-terms" className="flex cursor-pointer items-start gap-3 rounded-xl bg-surface-2/60 p-3.5 text-sm leading-relaxed text-ink-2">
                  <input
                    id="a-terms"
                    type="checkbox"
                    required
                    checked={acceptTerms}
                    onChange={(e) => setAcceptTerms(e.target.checked)}
                    className="mt-0.5 size-5 shrink-0 accent-[rgb(var(--accent))]"
                  />
                  <span>
                    I’m 18 or older, I agree to the{' '}
                    <a href="/terms" target="_blank" rel="noopener" className="font-medium text-accent underline-offset-2 hover:underline">Terms of Service</a>
                    {' '}and{' '}
                    <a href="/privacy" target="_blank" rel="noopener" className="font-medium text-accent underline-offset-2 hover:underline">Privacy Policy</a>,
                    and I consent to my health details (like weight, allergies and food logs) being used to run the app.
                  </span>
                </label>
              )}
              {authError && (
                <p role="alert" className="flex items-start gap-2 rounded-xl bg-danger/10 px-3.5 py-3 text-sm text-danger">
                  <WarningCircleIcon size={18} className="mt-px shrink-0" />{authError}
                </p>
              )}
              <button type="submit" disabled={authLoading} className="btn-primary w-full">
                {authLoading ? (showLogin ? 'Signing in…' : 'Creating account…') : (showLogin ? 'Sign in' : 'Create account')}
              </button>
            </form>
            <p className="mt-6 text-center text-xs text-ink-2">
              <a href="/terms" className="hover:text-ink hover:underline">Terms of Service</a>
              <span aria-hidden="true"> · </span>
              <a href="/privacy" className="hover:text-ink hover:underline">Privacy Policy</a>
            </p>
          </section>
        </main>
      </div>
    );
  }

  const onboarding = profileRequired || keyStep === 'active';

  const navLink = (to, Icon, children) => {
    const active = to === '/' ? !onCalendar : onCalendar;
    return (
      <a
        href={to}
        onClick={(e) => { e.preventDefault(); navigate(to); }}
        aria-current={active ? 'page' : undefined}
        className={`flex h-9 items-center gap-2 rounded-full px-3.5 text-sm font-medium transition sm:px-4 ${active ? 'bg-surface text-ink shadow-sm' : 'text-ink-2 hover:text-ink'}`}
      >
        <Icon size={18} weight={active ? 'fill' : 'regular'} aria-hidden="true" />{children}
      </a>
    );
  };

  const nav = (
    <header className="sticky top-0 z-30 border-b border-line/60 bg-bg/70 backdrop-blur-xl">
      <div className="mx-auto flex h-16 max-w-6xl items-center gap-3 px-4 sm:px-6">
        <Brand compact />
        {!onboarding && (
          <nav className="ml-auto flex items-center rounded-full bg-surface-2/80 p-1" aria-label="Primary">
            {navLink('/', HouseIcon, 'Today')}
            {navLink('/calendar', CalendarBlankIcon, 'History')}
          </nav>
        )}
        <div className={`flex items-center ${onboarding ? 'ml-auto' : ''}`}>
          <button
            type="button"
            className="icon-btn"
            onClick={() => setTheme(THEMES[(THEMES.indexOf(theme) + 1) % THEMES.length])}
            aria-label={`Theme: ${THEME_LABEL[theme]}. Switch to ${THEME_LABEL[THEMES[(THEMES.indexOf(theme) + 1) % THEMES.length]]}`}
            title={`Theme: ${THEME_LABEL[theme]}`}
          >
            {theme === 'light' ? <SunIcon size={20} aria-hidden="true" /> : theme === 'dark' ? <MoonIcon size={20} aria-hidden="true" /> : <MonitorIcon size={20} aria-hidden="true" />}
          </button>
          {!onboarding && (
            <button type="button" className="icon-btn" aria-label="Profile and targets" title="Profile and targets" onClick={() => setShowProfileForm(true)}>
              <SlidersHorizontalIcon size={20} />
            </button>
          )}
          <button type="button" className="icon-btn" aria-label="Sign out" title="Sign out" onClick={handleLogout}>
            <SignOutIcon size={20} />
          </button>
        </div>
      </div>
    </header>
  );

  const shell = (content) => (
    <div className="min-h-[100dvh]">
      <Ambient />
      {nav}
      {content}
      <input ref={imageInputRef} type="file" accept="image/*" className="hidden" onChange={handlePhotoFileChange} />

      <Sheet side open={showProfileForm && !onboarding} onClose={closeProfile} title="Profile and targets">
        {keySection}
        <div className="mt-8 border-t border-line pt-8">
          {profileError && !profile ? (
            <div role="alert" className="space-y-4">
              <p className="flex items-start gap-2 text-sm text-danger">
                <WarningCircleIcon size={16} className="mt-0.5 shrink-0" />Couldn’t load your profile, so it can’t be edited right now.
              </p>
              <button type="button" className="btn-ghost h-10 px-4 text-sm" onClick={loadProfile} disabled={profileLoading}>
                {profileLoading ? 'Loading…' : 'Try again'}
              </button>
            </div>
          ) : profileForm}
        </div>

        <section aria-labelledby="del-h" className="mt-10 space-y-3 rounded-2xl border border-danger/30 p-5">
          <h3 id="del-h" className="flex items-center gap-2 text-base font-semibold text-danger">
            <TrashIcon size={20} aria-hidden="true" />Delete account
          </h3>
          <p className="text-sm leading-relaxed text-ink-2">
            Permanently removes your account, profile, food and activity logs, saved foods and AI key. This can’t be undone.
            {' '}<a href="/privacy" className="font-medium text-accent hover:underline">Privacy Policy</a>
          </p>
          {!deleteOpen ? (
            <button type="button" className="btn-ghost h-10 px-4 text-sm text-danger hover:bg-danger/10" onClick={() => { setDeleteOpen(true); setDeleteError(null); }}>
              Delete my account…
            </button>
          ) : (
            <form onSubmit={deleteAccount} className="space-y-3" noValidate>
              <div>
                <label htmlFor="del-pw" className="label">Enter your password to confirm</label>
                <input id="del-pw" type="password" autoComplete="current-password" value={deletePassword} onChange={(e) => { setDeletePassword(e.target.value); setDeleteError(null); }} className="field" />
              </div>
              {deleteError && (
                <p role="alert" className="flex items-start gap-2 text-sm text-danger"><WarningCircleIcon size={16} className="mt-0.5 shrink-0" />{deleteError}</p>
              )}
              <div className="flex flex-wrap gap-2">
                <button type="submit" disabled={deleting} className="btn h-10 bg-danger px-4 text-sm text-white hover:brightness-95">
                  {deleting ? 'Deleting…' : 'Delete everything permanently'}
                </button>
                <button type="button" className="btn-quiet h-10 px-4 text-sm" onClick={() => { setDeleteOpen(false); setDeletePassword(''); setDeleteError(null); }}>Cancel</button>
              </div>
            </form>
          )}
        </section>
      </Sheet>

      <Sheet open={photoModalVisible} onClose={closePhoto} title="What’s on the plate">
        <div className="grid gap-6 sm:grid-cols-[11rem_1fr]">
          {photoPreviewUrl && <img src={photoPreviewUrl} alt="Your photo" className="aspect-square w-full rounded-2xl object-cover" />}
          <div>
            <p className="text-[15px] text-ink-2">Pick the closest match to log it, or look up recipes for it.</p>
            <ul className="mt-4 space-y-2">
              {photoCandidates.length === 0 && (
                <li className="rounded-2xl bg-surface-2/60 p-4 text-[15px] text-ink-2">Nothing recognized in this photo. Try another angle, or add it by hand.</li>
              )}
              {photoCandidates.map((c, i) => (
                <li key={`pc-${i}`} className="rounded-2xl border border-line p-4">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="font-medium">{c.label}</p>
                      <p className="text-sm text-ink-2">
                        {[c.portion_text, `${Math.round((c.confidence || 0) * 100)}% match`].filter(Boolean).join(', ')}
                      </p>
                    </div>
                    <p className="num shrink-0 font-semibold">{fmt(c.calories)} <span className="text-sm font-normal text-ink-2">kcal</span></p>
                  </div>
                  <div className="mt-3 flex flex-wrap gap-2">
                    <button type="button" className="btn-primary h-10 px-4 text-sm" onClick={() => saveCandidateToDate(c)}>
                      <PlusIcon size={16} weight="bold" />Log it
                    </button>
                    <button type="button" className="btn-ghost h-10 px-4 text-sm" onClick={() => searchRecipes(c.label)} disabled={recipeLoading}>
                      Find recipes
                    </button>
                  </div>
                </li>
              ))}
            </ul>
          </div>
        </div>
        {recipeLoading && <div className="mt-8"><RecipeSkeleton /></div>}
        {recipeResults.length > 0 && (
          <div className="mt-8 space-y-4">
            <h3 className="font-semibold">Recipes</h3>
            {recipeResults.map((r, i) => (
              <RecipeCard key={`r-${i}`} recipe={r} style={{ '--i': i }} onAddToLog={addRecipeToLog} />
            ))}
          </div>
        )}
      </Sheet>

      <Toast toast={toast} />
    </div>
  );

  // Onboarding step 1: connect an AI provider key (skippable for this session)
  if (keyStep === 'active') {
    return shell(
      <main className="mx-auto max-w-2xl px-4 py-10 sm:px-6 sm:py-14">
        <div className="rise">
          {profileRequired && <p className="mb-3 text-sm font-medium text-ink-2">Step 1 of 2</p>}
          <h1 className="text-3xl font-semibold tracking-tight sm:text-4xl">Connect your AI key</h1>
          <p className="mt-3 max-w-[60ch] text-[15px] leading-relaxed text-ink-2">
            Photo logging, meal plans and the coach run on your own AI account, so you stay in control of usage and cost.
            Paste a key from OpenAI, Anthropic, Google Gemini, OpenRouter or another supported provider.
          </p>
        </div>
        <div className="rise panel mt-8 space-y-6 p-6 sm:p-8" style={{ '--i': 1 }}>
          {keyForm('ko', (
            <button type="button" className="btn-quiet" onClick={() => { resetKeyForm(); setKeyStep('done'); }}>Skip for now</button>
          ))}
          {securityNote}
        </div>
      </main>
    );
  }

  // Onboarding: profile is required before anything else
  if (profileRequired) {
    return shell(
      <main className="mx-auto max-w-2xl px-4 py-10 sm:px-6 sm:py-14">
        <div className="rise">
          {keyStep && <p className="mb-3 text-sm font-medium text-ink-2">Step 2 of 2</p>}
          <h1 className="text-3xl font-semibold tracking-tight sm:text-4xl">Set up your profile</h1>
          <p className="mt-3 max-w-[60ch] text-[15px] leading-relaxed text-ink-2">
            Your goal and body stats set your daily calorie and macro targets. Allergies and preferences shape the meals we suggest.
          </p>
        </div>
        <div className="rise panel mt-8 p-6 sm:p-8" style={{ '--i': 1 }}>{profileForm}</div>
      </main>
    );
  }

  // History
  if (onCalendar) {
    const [cy, cm] = calendarMonth.split('-').map(Number);
    const lead = new Date(cy, cm - 1, 1).getDay();
    const daysIn = new Date(cy, cm, 0).getDate();
    const byDate = Object.fromEntries(calendarTotals.map((t) => [String(t.date).slice(0, 10), Number(t.calories_total || 0)]));
    const logged = Object.values(byDate);
    const monthAvg = logged.length ? logged.reduce((a, b) => a + b, 0) / logged.length : 0;
    const scale = targets?.calories || Math.max(...logged, 1);
    const today = todayISO();
    const dayTotal = selectedDayItems.reduce((s, i) => s + (Number(i.calories) || 0), 0);
    const shade = (kcal) => 0.18 + 0.6 * Math.min(kcal / scale, 1);

    return shell(
      <main className="mx-auto max-w-6xl px-4 py-8 sm:px-6 sm:py-10">
        <div className="rise flex flex-wrap items-center justify-between gap-4">
          <h1 className="text-3xl font-semibold tracking-tight sm:text-4xl">History</h1>
          <div className="flex items-center gap-1 rounded-full border border-line bg-surface/70 p-0.5 backdrop-blur">
            <button type="button" className="icon-btn" aria-label="Previous month" onClick={() => setCalendarMonth((m) => shiftMonth(m, -1))}><CaretLeftIcon size={18} /></button>
            <span className="min-w-[9.5rem] text-center text-sm font-medium" aria-live="polite">{monthLabel(calendarMonth)}</span>
            <button type="button" className="icon-btn" aria-label="Next month" onClick={() => setCalendarMonth((m) => shiftMonth(m, 1))}><CaretRightIcon size={18} /></button>
          </div>
        </div>

        <div className="mt-6 grid items-start gap-5 lg:grid-cols-12">
          <section className="rise panel p-4 sm:p-6 lg:col-span-7" style={{ '--i': 1 }} aria-label={`Calendar for ${monthLabel(calendarMonth)}`}>
            <div className="grid grid-cols-7 gap-1.5 pb-2 text-center text-xs font-medium text-ink-2" aria-hidden="true">
              {WEEKDAYS.map((d) => <div key={d}>{d}</div>)}
            </div>
            <div className="grid grid-cols-7 gap-1.5">
              {Array.from({ length: lead }, (_, i) => <div key={`b${i}`} />)}
              {Array.from({ length: daysIn }, (_, i) => {
                const iso = `${calendarMonth}-${String(i + 1).padStart(2, '0')}`;
                const kcal = byDate[iso];
                const has = kcal != null;
                const alpha = has ? shade(kcal) : 0;
                const selected = selectedDate === iso;
                return (
                  <button
                    key={iso}
                    type="button"
                    onClick={() => selectDay(iso)}
                    aria-pressed={selected}
                    aria-label={`${longDay(iso)}, ${has ? `${fmt(kcal)} kcal` : 'nothing logged'}`}
                    className={`relative flex aspect-square flex-col items-center justify-center rounded-xl text-sm transition hover:ring-1 hover:ring-ink-2/40
                      ${selected ? 'ring-2 ring-accent ring-offset-2 ring-offset-surface' : ''}
                      ${iso === today ? 'font-bold' : ''} ${alpha > 0.55 ? 'text-on-tint' : 'text-ink'}`}
                    style={has ? { background: `rgb(var(--accent) / ${alpha})` } : undefined}
                  >
                    <span className="num">{i + 1}</span>
                    {has && <span className="num hidden text-[11px] font-medium opacity-80 sm:block">{fmt(kcal)}</span>}
                    {iso === today && !selected && <span className="absolute inset-1 rounded-lg border border-ink-2/40" aria-hidden="true" />}
                  </button>
                );
              })}
            </div>
            <div className="mt-6 flex flex-wrap items-center justify-between gap-4 border-t border-line pt-5 text-sm text-ink-2">
              <p>
                <span className="num font-semibold text-ink">{logged.length}</span> {logged.length === 1 ? 'day' : 'days'} logged
                {logged.length > 0 && <>, averaging <span className="num font-semibold text-ink">{fmt(monthAvg)}</span> kcal</>}
              </p>
              <div className="flex items-center gap-1.5" aria-hidden="true">
                <span className="mr-1">Less</span>
                {[0.18, 0.38, 0.58, 0.78].map((a) => <span key={a} className="size-4 rounded" style={{ background: `rgb(var(--accent) / ${a})` }} />)}
                <span className="ml-1">{targets?.calories ? 'At target' : 'More'}</span>
              </div>
            </div>
          </section>

          <section className="rise panel p-6 lg:col-span-5" style={{ '--i': 2 }} aria-labelledby="day-h">
            {!selectedDate ? (
              <div className="py-10 text-center text-ink-2">
                <CalendarBlankIcon size={32} className="mx-auto text-accent" aria-hidden="true" />
                <p className="mt-3">Pick a day to see and edit what you logged.</p>
              </div>
            ) : (
              <>
                <div className="flex items-baseline justify-between gap-3">
                  <h2 id="day-h" className="text-xl font-semibold tracking-tight">{longDay(selectedDate)}</h2>
                  <span className="num shrink-0 text-sm text-ink-2"><span className="font-semibold text-ink">{fmt(dayTotal)}</span> kcal</span>
                </div>

                <ul className="mt-5 space-y-2">
                  {selectedDayItems.length === 0 && (
                    <li className="rounded-2xl bg-surface-2/60 px-4 py-6 text-center text-[15px] text-ink-2">Nothing logged on this day yet.</li>
                  )}
                  {selectedDayItems.map((item) => (
                    <li key={item.id} className="rounded-2xl bg-surface-2/60 p-3 pl-4">
                      {editingId === item.id ? (
                        <form onSubmit={(e) => { e.preventDefault(); saveEdit(item.id); }} className="space-y-3 py-1 pr-1">
                          <div>
                            <label htmlFor={`e-name-${item.id}`} className="label">Food</label>
                            <input id={`e-name-${item.id}`} required className="field" value={editFields.item_name} onChange={setE('item_name')} />
                          </div>
                          <div className="grid grid-cols-4 gap-2">
                            {[['calories', 'kcal'], ['protein_g', 'Protein'], ['carbs_g', 'Carbs'], ['fat_g', 'Fat']].map(([k, l]) => (
                              <div key={k}>
                                <label htmlFor={`e-${k}-${item.id}`} className="label text-xs">{l}</label>
                                <input id={`e-${k}-${item.id}`} type="number" min={0} step="any" inputMode="decimal" className="field num px-2.5" value={editFields[k]} onChange={setE(k)} required={k === 'calories'} />
                              </div>
                            ))}
                          </div>
                          <div className="flex justify-end gap-2">
                            <button type="button" className="btn-quiet" onClick={() => setEditingId(null)}>Cancel</button>
                            <button type="submit" className="btn-primary"><CheckIcon size={18} weight="bold" />Save</button>
                          </div>
                        </form>
                      ) : (
                        <div className="flex items-center gap-1">
                          <div className="min-w-0 flex-1">
                            <p className="truncate font-medium">{item.item_name}</p>
                            <p className="num text-sm text-ink-2">
                              {fmt(item.calories)} kcal{Number(item.servings) > 1 ? `, ${item.servings} servings` : ''}
                            </p>
                          </div>
                          <button type="button" className="icon-btn" aria-label={`Edit ${item.item_name}`} onClick={() => startEdit(item)}><PencilSimpleIcon size={18} /></button>
                          <button type="button" className="icon-btn hover:text-danger" aria-label={`Delete ${item.item_name}`} onClick={() => removeItem(item)}><TrashIcon size={18} /></button>
                        </div>
                      )}
                    </li>
                  ))}
                </ul>

                <div className="mt-8">
                  <h3 className="font-semibold">Add from saved foods</h3>
                  {savedLoading && savedFoods.length === 0 ? (
                    <div className="mt-3 flex animate-pulse gap-2" aria-hidden="true">{[0, 1, 2].map((i) => <div key={i} className="skeleton h-9 w-28 rounded-full" />)}</div>
                  ) : savedFoods.length === 0 ? (
                    <p className="mt-2 text-sm text-ink-2">Save foods you eat often to add them in one tap.</p>
                  ) : (
                    <div className="mt-3 flex flex-wrap gap-2">
                      {savedFoods.slice(0, 12).map((s) => (
                        <button key={s.id} type="button" className="chip max-w-full" onClick={() => addSavedToDate(s, selectedDate)} aria-label={`Add ${s.name}, ${fmt(s.calories)} kcal`}>
                          <PlusIcon size={14} weight="bold" className="shrink-0 text-accent" />
                          <span className="truncate">{s.name}</span>
                          <span className="num text-ink-2">{fmt(s.calories)}</span>
                        </button>
                      ))}
                    </div>
                  )}

                  <details className="group mt-3">
                    <summary className="btn-quiet -ml-3 cursor-pointer list-none px-3 text-sm">
                      <BookmarkSimpleIcon size={18} aria-hidden="true" />Create a saved food
                      <CaretDownIcon size={16} className="transition group-open:rotate-180" aria-hidden="true" />
                    </summary>
                    <form onSubmit={(e) => { e.preventDefault(); createSavedFood(); }} className="mt-3 space-y-3 rounded-2xl border border-line p-4">
                      <div className="grid grid-cols-[1fr_6.5rem] gap-3">
                        <div>
                          <label htmlFor="s-name" className="label">Name</label>
                          <input id="s-name" required className="field" value={newSaved.name} onChange={setS('name')} />
                        </div>
                        <div>
                          <label htmlFor="s-kcal" className="label">kcal</label>
                          <input id="s-kcal" required type="number" min={0} step="any" inputMode="decimal" className="field num" value={newSaved.calories} onChange={setS('calories')} />
                        </div>
                      </div>
                      <div className="grid grid-cols-3 gap-3">
                        {MACROS.map((m) => (
                          <div key={m.key}>
                            <label htmlFor={`s-${m.key}`} className="label">{m.label} g</label>
                            <input id={`s-${m.key}`} type="number" min={0} step="any" inputMode="decimal" className="field num" value={newSaved[`${m.key}_g`]} onChange={setS(`${m.key}_g`)} />
                          </div>
                        ))}
                      </div>
                      <button type="submit" className="btn-ghost w-full">Save food</button>
                    </form>
                  </details>
                </div>

                <div className="mt-8 border-t border-line pt-6">
                  <h3 className="mb-4 font-semibold">Add an entry</h3>
                  {manualForm(selectedDate, 'c', 'Add to this day')}
                </div>
              </>
            )}
          </section>
        </div>
      </main>
    );
  }

  // Today
  const eaten = Number(todayTotals?.calories_total || 0);
  const burned = Number(todayActivity?.calories_burned || 0);
  const net = eaten - burned;
  const target = Number(targets?.calories || 0);
  const left = target - net;
  const hour = new Date().getHours();
  const greeting = hour < 12 ? 'Good morning' : hour < 18 ? 'Good afternoon' : 'Good evening';
  const handle = user?.email?.split('@')[0];
  const recipes = Array.isArray(response?.recipes) ? response.recipes : [];

  return shell(
    <main className="mx-auto max-w-6xl px-4 py-8 sm:px-6 sm:py-10">
      <div className="grid gap-5 lg:grid-cols-12">
        <section className="rise panel flex flex-col p-6 sm:p-8 lg:col-span-7" style={{ '--i': 0 }} aria-labelledby="today-h">
          <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
            <h1 id="today-h" className="min-w-0 break-words text-2xl font-semibold tracking-tight sm:text-3xl">{greeting}{handle ? `, ${handle}` : ''}</h1>
            <p className="text-sm text-ink-2">{new Date().toLocaleDateString(undefined, { weekday: 'long', month: 'long', day: 'numeric' })}</p>
          </div>

          <div className="my-8 grid flex-1 items-center gap-8 sm:grid-cols-[minmax(0,15rem)_1fr]">
            <div className="mx-auto w-full max-w-[15rem]">
              {targetsLoading ? (
                <div className="skeleton aspect-square w-full animate-pulse rounded-full" aria-hidden="true" />
              ) : (
                <Ring value={net} max={target} label={target ? `${fmt(net)} of ${fmt(target)} kcal net today` : `${fmt(net)} kcal net today`}>
                  <div>
                    <div className="num text-4xl font-semibold tracking-tight sm:text-5xl">{fmt(Math.abs(target ? left : net))}</div>
                    <div className="mt-1 text-sm text-ink-2">
                      {!target ? 'kcal net today' : left >= 0 ? `kcal left of ${fmt(target)}` : 'kcal over target'}
                    </div>
                  </div>
                </Ring>
              )}
            </div>

            <div className="space-y-5">
              {targetsLoading && [0, 1, 2].map((i) => <div key={i} className="skeleton h-9 animate-pulse" aria-hidden="true" />)}
              {targets && MACROS.map((m) => (
                <MacroMeter key={m.key} label={m.label} dot={m.dot} value={Number(todayTotals?.[`${m.key}_total`] || 0)} target={Number(targets[`${m.key}_g`]) || 0} />
              ))}
              {!targets && !targetsLoading && (
                <div className="rounded-2xl bg-surface-2/70 p-5 text-[15px] leading-relaxed text-ink-2">
                  <p>Add your age, sex, height and weight to get daily calorie and macro targets.</p>
                  <button type="button" className="btn-ghost mt-4" onClick={() => setShowProfileForm(true)}>Complete profile</button>
                </div>
              )}
            </div>
          </div>

          <div className="mt-auto grid grid-cols-3 gap-4 border-t border-line pt-6">
            <Stat icon={ForkKnifeIcon} label="Eaten" value={fmt(eaten)} />
            <Stat icon={FireIcon} label="Burned" value={fmt(burned)} />
            <Stat icon={EqualsIcon} label="Net" value={fmt(net)} />
          </div>
          <form onSubmit={logSteps} className="mt-5 flex flex-wrap items-center gap-3">
            <label htmlFor="steps" className="flex items-center gap-2 text-sm text-ink-2"><FootprintsIcon size={18} aria-hidden="true" />Steps today</label>
            <input id="steps" type="number" min={0} inputMode="numeric" className="field num h-10 w-32" value={steps} onChange={(e) => setSteps(e.target.value)} placeholder="0" />
            <button type="submit" className="btn-ghost h-10" disabled={stepsSaving}>{stepsSaving ? 'Saving…' : 'Save'}</button>
          </form>
        </section>

        <section className="rise panel flex flex-col p-6 sm:p-8 lg:col-span-5" style={{ '--i': 1 }} aria-labelledby="log-h">
          <h2 id="log-h" className="text-xl font-semibold tracking-tight">Log food</h2>
          <button
            type="button"
            onClick={openPhotoPicker}
            disabled={photoUploading}
            className="mt-5 flex items-center gap-4 rounded-2xl border border-dashed border-accent/50 bg-accent-soft/50 p-4 text-left transition hover:bg-accent-soft active:scale-[0.99] disabled:opacity-70"
          >
            <span className="grid size-12 shrink-0 place-items-center rounded-full bg-accent text-accent-ink">
              <CameraIcon size={24} weight="fill" className={photoUploading ? 'animate-pulse' : ''} aria-hidden="true" />
            </span>
            <span>
              <span className="block font-medium">{photoUploading ? 'Analyzing photo…' : 'Log with photo'}</span>
              <span className="block text-sm text-ink-2">Snap your plate and pick the closest match.</span>
            </span>
          </button>

          <div className="my-6 flex items-center gap-3 text-xs text-ink-2" aria-hidden="true">
            <span className="h-px flex-1 bg-line" />or enter it<span className="h-px flex-1 bg-line" />
          </div>

          {manualForm(todayISO(), 't', 'Add to today')}

          {frequentItems.length > 0 && (
            <div className="mt-6">
              <h3 className="text-sm font-medium text-ink-2">Log again</h3>
              <div className="mt-2.5 flex flex-wrap gap-2">
                {frequentItems.slice(0, 6).map((item) => (
                  <button
                    key={`${item.item_name}-${item.source_type}`}
                    type="button"
                    className="chip max-w-full"
                    onClick={() => handleQuickAdd(item)}
                    aria-label={`Log ${item.item_name} again, ${fmt(item.avg_calories)} kcal`}
                  >
                    <PlusIcon size={14} weight="bold" className="shrink-0 text-accent" />
                    <span className="truncate">{item.item_name}</span>
                    <span className="num text-ink-2">{fmt(item.avg_calories)}</span>
                  </button>
                ))}
              </div>
            </div>
          )}
        </section>

        <section className="rise panel p-6 sm:p-8 lg:col-span-8" style={{ '--i': 2 }} aria-labelledby="week-h">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <h2 id="week-h" className="text-xl font-semibold tracking-tight">Calories, last {insightDays} days</h2>
            <Segmented label="Range" value={insightDays} onChange={loadInsights} options={[[7, '7 days'], [30, '30 days']]} />
          </div>
          <div className={`mt-10 transition-opacity ${insightsLoading && insights ? 'opacity-50' : ''}`}>
            {insightsLoading && !insights ? (
              <div className="flex h-44 animate-pulse items-end gap-1" aria-hidden="true">
                {[40, 65, 52, 80, 58, 72, 46].map((h, i) => <div key={i} className="skeleton flex-1 rounded-b-none" style={{ height: `${h}%` }} />)}
              </div>
            ) : insights?.rows?.length ? (
              <CalorieChart rows={insights.rows} target={target} />
            ) : (
              <p className="py-12 text-center text-ink-2">Log a few meals and your week will show up here.</p>
            )}
          </div>
          {insights?.averages && (
            <div className="mt-8 border-t border-line pt-6">
              <h3 className="text-sm font-medium text-ink-2">Daily average</h3>
              <dl className="mt-3 grid grid-cols-3 gap-x-6 gap-y-4 sm:grid-cols-5">
                {[
                  ['Calories', insights.averages.avg_calories, 'kcal'],
                  ['Protein', insights.averages.avg_protein, 'g'],
                  ['Carbs', insights.averages.avg_carbs, 'g'],
                  ['Fat', insights.averages.avg_fat, 'g'],
                  ['Steps', insights.averages.avg_steps, ''],
                ].map(([label, v, unit]) => (
                  <div key={label}>
                    <dt className="text-xs text-ink-2 sm:text-sm">{label}</dt>
                    <dd className="num mt-0.5 text-lg font-semibold">{fmt(v)}{unit && <span className="ml-1 text-sm font-normal text-ink-2">{unit}</span>}</dd>
                  </div>
                ))}
              </dl>
              {insights.insights?.length > 0 && (
                <ul className="mt-5 space-y-2 text-[15px] text-ink-2">
                  {insights.insights.map((s, i) => (
                    <li key={i} className="flex gap-2.5"><CheckCircleIcon size={18} className="mt-0.5 shrink-0 text-accent" aria-hidden="true" />{s}</li>
                  ))}
                </ul>
              )}
            </div>
          )}
        </section>

        <section
          className="rise flex flex-col rounded-card border border-accent/25 bg-accent-soft/60 p-6 backdrop-blur-xl sm:p-8 lg:col-span-4"
          style={{ '--i': 3 }}
          aria-labelledby="coach-h"
        >
          <SparkleIcon size={28} weight="duotone" className="text-accent" aria-hidden="true" />
          <h2 id="coach-h" className="mt-4 text-xl font-semibold tracking-tight">Coach</h2>
          <p className="mb-6 mt-2 text-[15px] leading-relaxed text-ink-2">A read on your last week, plus three small changes to try next.</p>

          {coachLoading && (
            <div className="mt-6 animate-pulse space-y-3" role="status" aria-label="Loading coach suggestions">
              {[92, 76, 84, 60].map((w) => <div key={w} className="h-4 rounded-full bg-surface/70" style={{ width: `${w}%` }} />)}
            </div>
          )}

          {coachResult && !coachLoading && (
            <div className="mt-6 space-y-5 text-[15px] leading-relaxed">
              {coachResult.parsed ? (
                <>
                  {Array.isArray(coachResult.parsed.observations) && (
                    <div>
                      <h3 className="text-sm font-medium text-ink-2">What stood out</h3>
                      <ul className="mt-2 space-y-2">
                        {coachResult.parsed.observations.map((o, i) => <li key={`o${i}`}>{o}</li>)}
                      </ul>
                    </div>
                  )}
                  {Array.isArray(coachResult.parsed.suggestions) && (
                    <div>
                      <h3 className="text-sm font-medium text-ink-2">Try this week</h3>
                      <ol className="mt-2 space-y-2.5">
                        {coachResult.parsed.suggestions.map((s, i) => (
                          <li key={`s${i}`} className="flex gap-3">
                            <span className="num mt-0.5 grid size-6 shrink-0 place-items-center rounded-full bg-accent text-xs font-semibold text-accent-ink">{i + 1}</span>
                            <span>{s}</span>
                          </li>
                        ))}
                      </ol>
                    </div>
                  )}
                </>
              ) : coachResult.error ? (
                <div role="alert" className="space-y-3">
                  <p className="flex items-start gap-2 text-danger"><WarningCircleIcon size={18} className="mt-1 shrink-0" />{coachResult.error}</p>
                  {KEY_CODES.includes(coachResult.code) && (
                    <button type="button" className="btn-ghost h-10 px-4 text-sm" onClick={() => openKeySettings()}>
                      <KeyIcon size={16} aria-hidden="true" />{keyStatus?.has_key ? 'Replace key' : 'Add key'}
                    </button>
                  )}
                </div>
              ) : (
                <p className="whitespace-pre-wrap text-ink-2">{coachResult.raw}</p>
              )}
            </div>
          )}

          {!coachLoading && (
            <button type="button" className={`${coachResult ? 'btn-ghost' : 'btn-primary'} mt-6 self-start lg:mt-auto`} onClick={() => askCoach(7)}>
              {coachResult ? <><ArrowClockwiseIcon size={18} />Ask again</> : <><SparkleIcon size={18} weight="fill" />Ask the coach</>}
            </button>
          )}
        </section>

        <section className="rise panel p-6 sm:p-8 lg:col-span-12" style={{ '--i': 4 }} aria-labelledby="plan-h">
          <div className="grid gap-8 lg:grid-cols-[1fr_22rem]">
            <form onSubmit={handleSubmit} className="space-y-4">
              <div>
                <h2 id="plan-h" className="text-2xl font-semibold tracking-tight">Plan a meal</h2>
                <p className="mt-2 max-w-[60ch] text-[15px] text-ink-2">Uses your targets, allergies and saved preferences. Add anything specific below.</p>
              </div>
              <div>
                <label htmlFor="plan-req" className="label">Special request (optional)</label>
                <textarea id="plan-req" rows={3} className="field resize-none" value={userRequest} onChange={(e) => setUserRequest(e.target.value)} placeholder="High-protein dinner under 600 kcal" />
              </div>
              <div className="flex flex-wrap gap-3">
                <button type="submit" disabled={loading} className="btn-primary">
                  <ChefHatIcon size={18} weight="fill" />{loading ? 'Planning…' : 'Get meal plan'}
                </button>
                <button type="button" onClick={openPhotoPicker} disabled={photoUploading} className="btn-ghost">
                  <CameraIcon size={18} />{photoUploading ? 'Analyzing photo…' : 'Photo to recipe'}
                </button>
              </div>
            </form>
            <div>
              <h3 className="text-sm font-medium text-ink-2">Try asking for</h3>
              <div className="mt-3 flex flex-wrap gap-2">
                {IDEAS.map((idea) => (
                  <button key={idea} type="button" className="chip" onClick={() => setUserRequest(idea)}>{idea}</button>
                ))}
              </div>
            </div>
          </div>
        </section>

        <div ref={resultsRef} className="scroll-mt-24 lg:col-span-12">
          {error && (
            <div role="alert" className="flex items-start gap-3 rounded-card border border-danger/30 bg-danger/10 p-5 text-danger">
              <WarningCircleIcon size={20} className="mt-0.5 shrink-0" />
              <div><p className="font-medium">Couldn’t get a meal plan</p><p className="text-sm">{error}</p></div>
            </div>
          )}

          {loading && (
            <div className="grid items-start gap-5 md:grid-cols-2">{[0, 1].map((i) => <RecipeSkeleton key={i} />)}</div>
          )}

          {response && !loading && (
            <section aria-labelledby="recipes-h">
              <div className="flex flex-wrap items-baseline justify-between gap-2">
                <h2 id="recipes-h" className="text-xl font-semibold tracking-tight">Suggestions</h2>
                {response.metadata?.model && <span className="text-xs text-ink-2">via {response.metadata.model}</span>}
              </div>
              {recipes.length > 0 ? (
                <div className="mt-5 grid items-start gap-5 md:grid-cols-2">
                  {recipes.map((recipe, i) => (
                    <RecipeCard key={i} recipe={recipe} style={{ '--i': i }} onRegenerate={() => handleSubmit()} onAddToLog={addRecipeToLog} />
                  ))}
                </div>
              ) : (
                <p className="mt-4 rounded-card bg-surface-2/70 p-5 text-ink-2">No recipes came back. Try a different request.</p>
              )}
            </section>
          )}
        </div>
      </div>
    </main>
  );
}

export default App;

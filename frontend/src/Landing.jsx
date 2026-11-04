import './landing.css';
import { Fragment, useEffect, useLayoutEffect, useRef, useState } from 'react';
import {
  ArrowCounterClockwiseIcon, ArrowRightIcon, ArrowsClockwiseIcon, CameraIcon, CheckIcon, CopyIcon, EyeSlashIcon,
  GithubLogoIcon, HandTapIcon, LeafIcon, LockKeyIcon, PlusIcon, ProhibitIcon, SparkleIcon, WalletIcon,
} from '@phosphor-icons/react';

const REPO_URL = 'https://github.com/Sachit6602/Nutrition-App';
const SETUP = [
  { label: 'Clone the repo', cmd: `git clone ${REPO_URL}.git` },
  { label: 'Install the frontend and backend', cmd: 'cd Nutrition-App && npm run install:all' },
  { label: 'Add an encryption key for saved AI keys (the file explains how)', cmd: 'cp backend/.dev.vars.example backend/.dev.vars' },
  { label: 'Start both with a local D1 database, then open localhost:3000', cmd: 'npm run dev' },
];
import { CalorieChart, MACROS, MacroMeter, MacroSplit, RecipeCard, Ring, fmt } from './ui.jsx';

// ---------- Fixed example data (never depends on the current date) ----------
const TARGET = 2150;
const WEEK_KCAL = [1980, 2240, 1860, 2105, 2310, 1720];
const weekRows = (today) => [...WEEK_KCAL, today].map((kcal, i) => ({
  date: `2026-03-${String(i + 2).padStart(2, '0')}`,
  intake: { calories_total: kcal },
}));
// March 2026: some days unlogged (null), the rest wobble around target.
const MONTH = Array.from({ length: 31 }, (_, i) => (i % 9 === 4 ? null : 1640 + ((i * 7) % 11) * 72));
const MONTH_ROWS = MONTH.slice(0, 30).map((kcal, i) => ({
  date: `2026-03-${String(i + 1).padStart(2, '0')}`,
  intake: { calories_total: kcal || 0 },
}));
const MONTH_LEAD = new Date(2026, 2, 1).getDay();
const TODAY = { eaten: 1460, protein: 96, carbs: 162, fat: 41 };
const GOALS = { protein: 140, carbs: 240, fat: 70 };
const AGAIN = [
  { name: 'Greek yogurt bowl', kcal: 320, protein: 24, carbs: 38, fat: 8 },
  { name: 'Chicken wrap', kcal: 540, protein: 38, carbs: 52, fat: 18 },
  { name: 'Oat latte', kcal: 140, protein: 5, carbs: 20, fat: 4 },
  { name: 'Banana', kcal: 105, protein: 1, carbs: 27, fat: 0 },
];
const CANDIDATES = [
  { label: 'Grilled salmon with rice', portion: '1 fillet, 1 cup rice', match: 92, kcal: 610 },
  { label: 'Teriyaki salmon bowl', portion: '1 bowl', match: 71, kcal: 680 },
  { label: 'Poke bowl', portion: '1 bowl', match: 38, kcal: 540 },
];
const RECIPE = {
  title: 'Miso salmon with sesame greens',
  nutrients: { calories: 540, protein_g: 42, carbs_g: 38, fat_g: 22 },
  daily_contribution: 'Covers a third of the protein you have left today and keeps you under target.',
  steps: ['Brush the salmon with miso and honey.', 'Roast at 200C for 12 minutes.', 'Toss the greens with sesame and serve.'],
};
const COACH = ['Add a protein snack before 4pm.', 'Swap one takeaway for a planned dinner.', 'Walk 2,000 more steps on rest days.'];
const MEALS = [['Breakfast', 28, 52, 14], ['Lunch', 38, 61, 18], ['Dinner', 44, 48, 24]];
const noop = () => {};
const reducedMotion = () => window.matchMedia('(prefers-reduced-motion: reduce)').matches;

// Mirrors calculate_daily_targets in backend/server.js with its default intensity (lose -20%, gain +10%). Keep in sync.
const FACTORS = { low: 1.2, medium: 1.55, high: 1.725 };
function targetsFor({ sex, age, height, weight, activity, goal }) {
  const bmr = 10 * weight + 6.25 * height - 5 * age + (sex === 'female' ? -161 : 5);
  const tdee = Math.round(bmr * FACTORS[activity]);
  const calories = Math.round(tdee * (goal === 'lose' ? 0.8 : goal === 'gain' ? 1.1 : 1));
  const protein = Math.round(weight * 1.8);
  const fat = Math.round((calories * 0.275) / 9);
  const carbs = Math.round(Math.max(0, calories - protein * 4 - calories * 0.275) / 4);
  return { bmr: Math.round(bmr), tdee, calories, protein, carbs, fat };
}

// ---------- Small pieces ----------
const Brand = ({ compact = false }) => (
  <div className="flex items-center gap-2.5">
    <span className="grid size-9 shrink-0 place-items-center rounded-xl bg-accent text-accent-ink">
      <LeafIcon size={20} weight="fill" aria-hidden="true" />
    </span>
    <span className={`whitespace-nowrap font-semibold tracking-tight ${compact ? 'max-[400px]:sr-only' : ''}`}>Healthy Diet Tracker</span>
  </div>
);

const Card = ({ className = '', children }) => (
  <div className={`lp-card rounded-card border border-line bg-surface ${className}`}>{children}</div>
);

// Tweens a number by writing textContent directly: no React re-render per frame.
function Count({ value }) {
  const ref = useRef(null);
  const shown = useRef(value);
  useLayoutEffect(() => {
    const el = ref.current;
    const start = shown.current;
    if (start === value || reducedMotion()) { shown.current = value; el.textContent = fmt(value); return undefined; }
    let raf = 0;
    const t0 = performance.now();
    const step = (t) => {
      const k = Math.min((t - t0) / 550, 1);
      shown.current = start + (value - start) * (1 - (1 - k) ** 3);
      el.textContent = fmt(shown.current);
      if (k < 1) raf = requestAnimationFrame(step);
    };
    raf = requestAnimationFrame(step);
    return () => cancelAnimationFrame(raf);
  }, [value]);
  return <span ref={ref} />;
}

const TodayCard = ({ big = false, t = TODAY, pop = null }) => {
  const left = TARGET - t.eaten;
  return (
    <Card className={`flex items-center gap-5 ${big ? 'p-6 lg:gap-8 lg:p-8' : 'p-5'}`}>
      <div className={`relative shrink-0 ${big ? 'w-32 lg:w-44' : 'w-24 sm:w-28'}`}>
        <Ring value={t.eaten} max={TARGET} label={`${fmt(t.eaten)} of ${fmt(TARGET)} kcal eaten`}>
          <div>
            <div className={`num font-semibold tracking-tight ${big ? 'text-3xl sm:text-4xl' : 'text-2xl'}`}><Count value={Math.abs(left)} /></div>
            <div className="text-xs text-ink-2">{left >= 0 ? 'kcal left' : 'kcal over'}</div>
          </div>
        </Ring>
        {pop && <span key={pop.id} className="lp-pop num" aria-hidden="true">+{pop.kcal}</span>}
      </div>
      <div className="min-w-0 flex-1 space-y-3.5">
        {MACROS.map((m) => <MacroMeter key={m.key} label={m.label} dot={m.dot} value={t[m.key]} target={GOALS[m.key]} />)}
      </div>
    </Card>
  );
};

// ---------- Hero: a live demo. Tap a meal and the ring, macros and chart update. ----------
function HeroStage({ tiltRef }) {
  const [log, setLog] = useState([]);
  const [wasReset, setWasReset] = useState(false);
  const firstChip = useRef(null);
  const t = log.reduce(
    (s, i) => ({ eaten: s.eaten + AGAIN[i].kcal, protein: s.protein + AGAIN[i].protein, carbs: s.carbs + AGAIN[i].carbs, fat: s.fat + AGAIN[i].fat }),
    TODAY,
  );
  const last = log.length ? AGAIN[log[log.length - 1]] : null;

  return (
    <figure className="m-0">
      <div className="lp-hero-stage">
        <div ref={tiltRef} className="lp-tilt">
          <div className="lp-stack">
            <div className="lp-hp lp-hp1"><TodayCard t={t} pop={last && { id: log.length, kcal: last.kcal }} /></div>
            <div className="lp-hp lp-hp2" aria-hidden="true">
              <Card className="p-5">
                <p className="mb-8 text-sm font-medium text-ink-2">Calories, last 7 days</p>
                <CalorieChart rows={weekRows(t.eaten)} target={TARGET} />
              </Card>
            </div>
            <div className="lp-hp lp-hp3">
              <Card className="p-5">
                <div className="mb-3 flex items-center justify-between gap-3">
                  <p className="text-sm font-medium text-ink-2">Log again</p>
                  {log.length > 0 && (
                    <button type="button" className="-my-3 -mr-2 inline-flex h-11 items-center gap-1.5 rounded-full px-3 text-sm text-ink-2 hover:bg-surface-2 hover:text-ink" onClick={() => { setLog([]); setWasReset(true); firstChip.current?.focus(); }}>
                      <ArrowCounterClockwiseIcon size={14} weight="bold" aria-hidden="true" />Reset
                    </button>
                  )}
                </div>
                <div className="flex flex-wrap gap-2">
                  {AGAIN.map((m, i) => (
                    <button key={m.name} ref={i === 0 ? firstChip : undefined} type="button" className="chip max-w-full" onClick={() => { setWasReset(false); setLog((l) => [...l, i]); }}>
                      <PlusIcon size={14} weight="bold" className="shrink-0 text-accent" aria-hidden="true" />
                      <span className="sr-only">Log </span>
                      <span className="truncate">{m.name}</span>
                      <span className="num text-ink-2">{m.kcal}<span className="sr-only"> kcal</span></span>
                    </button>
                  ))}
                </div>
              </Card>
            </div>
          </div>
        </div>
      </div>
      <figcaption className="mt-10 flex items-center md:mt-3 gap-1.5 text-xs text-ink-2">
        <HandTapIcon size={14} weight="bold" aria-hidden="true" />Example data. Tap a meal to log it.
      </figcaption>
      <p className="sr-only" aria-live="polite">
        {last ? `Logged ${last.name}. ${fmt(t.eaten)} of ${fmt(TARGET)} kcal eaten.` : wasReset ? `Reset. ${fmt(t.eaten)} of ${fmt(TARGET)} kcal eaten.` : ''}
      </p>
    </figure>
  );
}

const PhotoPanel = () => (
  <Card className="p-5 sm:p-6">
    <div className="flex items-center gap-3 border-b border-line pb-4">
      <span className="lp-plate relative grid size-12 shrink-0 place-items-center overflow-hidden rounded-2xl">
        <CameraIcon size={22} weight="fill" />
        <span className="lp-scan" />
      </span>
      <div>
        <p className="font-semibold">What's on the plate</p>
        <p className="text-sm text-ink-2">Pick the closest match to log it.</p>
      </div>
    </div>
    <ul className="mt-4 space-y-2">
      {CANDIDATES.map((c, i) => (
        <li key={c.label} className="rounded-2xl border border-line p-4">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <p className="font-medium">{c.label}</p>
              <p className="text-sm text-ink-2">{c.portion}, {c.match}% match</p>
            </div>
            <p className="num shrink-0 font-semibold">{fmt(c.kcal)} <span className="text-sm font-normal text-ink-2">kcal</span></p>
          </div>
          <div className="mt-3 h-1.5 overflow-hidden rounded-full bg-surface-2">
            <div className={`h-full origin-left rounded-full ${i === 0 ? 'bg-accent' : 'bg-ink-2/40'}`} style={{ transform: `scaleX(${c.match / 100})` }} />
          </div>
          {i === 0 && (
            <div className="mt-3 flex gap-2">
              <span className="btn-primary h-10 px-4 text-sm"><PlusIcon size={16} weight="bold" />Log it</span>
              <span className="btn-ghost h-10 px-4 text-sm">Find recipes</span>
            </div>
          )}
        </li>
      ))}
    </ul>
  </Card>
);

const PlanPanel = () => (
  <div className="relative">
    <div className="ml-auto w-full sm:w-[88%]">
      <RecipeCard recipe={RECIPE} onAddToLog={noop} />
    </div>
    <div className="lp-card relative -mt-4 w-[86%] rounded-card border border-accent/25 bg-accent-soft p-5 sm:w-[62%]">
      <p className="flex items-center gap-2 text-sm font-medium text-ink-2">
        <SparkleIcon size={18} weight="duotone" className="text-accent" />Try this week
      </p>
      <ol className="mt-3 space-y-2 text-sm">
        {COACH.map((s, i) => (
          <li key={s} className="flex gap-2.5">
            <span className="num grid size-5 shrink-0 place-items-center rounded-full bg-accent text-[11px] font-semibold text-accent-ink">{i + 1}</span>
            <span>{s}</span>
          </li>
        ))}
      </ol>
    </div>
  </div>
);

const BEATS = [
  { id: 1, short: 'Snap', title: 'Snap your plate', body: 'Take a photo and pick the closest match. Portion, calories and macros fill in for you.', panel: <PhotoPanel /> },
  { id: 2, short: 'Track', title: 'Hit your targets', body: 'Your goal and body stats set daily calories and macros. Every entry moves the ring.', panel: <TodayCard big /> },
  { id: 3, short: 'Plan', title: 'Plan what comes next', body: 'Ask for a meal that fits what is left today, or let the coach suggest three small changes.', panel: <PlanPanel /> },
];

// ---------- Targets lab: the real formula, live ----------
const Seg = ({ legend, name, value, onChange, options }) => (
  <fieldset className="grid gap-1.5">
    <legend className="label mb-0 pb-1.5">{legend}</legend>
    <div className="flex rounded-full bg-surface-2 p-1">
      {options.map(([v, l]) => (
        <label
          key={v}
          className="flex h-11 min-w-0 flex-1 cursor-pointer items-center justify-center whitespace-nowrap rounded-full px-2 text-sm font-medium text-ink-2 transition hover:text-ink has-[:checked]:bg-surface has-[:checked]:text-ink has-[:checked]:shadow-sm has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-accent"
        >
          <input type="radio" className="sr-only" name={name} value={v} checked={value === v} onChange={() => onChange(v)} />
          {l}
        </label>
      ))}
    </div>
  </fieldset>
);

const Slider = ({ id, label, unit, min, max, value, onChange }) => (
  <div>
    <div className="flex items-baseline justify-between gap-3">
      <label htmlFor={id} className="label mb-0">{label}</label>
      <span className="num text-sm font-semibold" aria-hidden="true">{value} <span className="font-normal text-ink-2">{unit}</span></span>
    </div>
    <input
      id={id} type="range" min={min} max={max} step={1} value={value} aria-valuetext={`${value} ${unit}`}
      onChange={(e) => onChange(Number(e.target.value))}
      className="lp-range mt-1 h-11 w-full cursor-pointer"
      style={{ '--p': `${((value - min) / (max - min)) * 100}%` }}
    />
  </div>
);

function TargetsLab({ onStart }) {
  const [p, setP] = useState({ sex: 'female', age: 32, height: 168, weight: 68, activity: 'medium', goal: 'lose' });
  const set = (k) => (v) => setP((s) => ({ ...s, [k]: v }));
  const t = targetsFor(p);
  const vsMaint = Math.round((t.calories / t.tdee) * 100);

  return (
    <section className="lp-lab lp-cv mx-auto max-w-6xl px-4 py-20 sm:px-6 lg:py-28" aria-labelledby="lp-lab-h">
      <div className="max-w-2xl">
        <h2 id="lp-lab-h" className="text-balance text-3xl font-semibold tracking-tight sm:text-4xl">Find your daily numbers.</h2>
        <p className="mt-3 max-w-[52ch] text-[15px] leading-relaxed text-ink-2">Move the sliders. It's the same formula the app uses to set your targets, and it runs right here in your browser.</p>
      </div>
      <div className="mt-10 grid gap-4 lg:grid-cols-[0.95fr_1.05fr]">
        <form className="panel lp-spot grid content-start gap-6 p-6 sm:p-8" onSubmit={(e) => e.preventDefault()} aria-label="Your details">
          <div className="grid gap-6 sm:grid-cols-2">
            <Seg legend="Sex" name="lp-sex" value={p.sex} onChange={set('sex')} options={[['female', 'Female'], ['male', 'Male']]} />
            <Seg legend="Goal" name="lp-goal" value={p.goal} onChange={set('goal')} options={[['lose', 'Lose'], ['maintain', 'Maintain'], ['gain', 'Gain']]} />
          </div>
          <Slider id="lp-age" label="Age" unit="years" min={18} max={80} value={p.age} onChange={set('age')} />
          <Slider id="lp-height" label="Height" unit="cm" min={140} max={210} value={p.height} onChange={set('height')} />
          <Slider id="lp-weight" label="Weight" unit="kg" min={40} max={160} value={p.weight} onChange={set('weight')} />
          <Seg legend="Activity" name="lp-act" value={p.activity} onChange={set('activity')} options={[['low', 'Light'], ['medium', 'Moderate'], ['high', 'Very active']]} />
        </form>

        <div className="panel lp-spot flex flex-col p-6 sm:p-8">
          <div className="flex flex-col items-center gap-8 sm:flex-row sm:items-center">
            <div className="w-44 shrink-0 sm:w-52">
              <Ring value={t.calories} max={t.tdee * 1.1} label={`${fmt(t.calories)} kcal a day`}>
                <div>
                  <div className="num text-4xl font-semibold tracking-tight sm:text-5xl"><Count value={t.calories} /></div>
                  <div className="text-sm text-ink-2">kcal a day</div>
                </div>
              </Ring>
            </div>
            <div className="w-full min-w-0 flex-1">
              <dl className="space-y-3">
                {MACROS.map((m) => (
                  <div key={m.key} className="flex items-baseline justify-between gap-3">
                    <dt className="flex items-center gap-2 text-ink-2"><span className={`size-2.5 rounded-full ${m.dot}`} aria-hidden="true" />{m.label}</dt>
                    <dd className="num text-lg font-semibold"><Count value={t[m.key]} /> <span className="text-sm font-normal text-ink-2">g</span></dd>
                  </div>
                ))}
              </dl>
              <div className="mt-4"><MacroSplit protein={t.protein} carbs={t.carbs} fat={t.fat} /></div>
            </div>
          </div>
          <dl className="mt-8 grid grid-cols-3 gap-3 border-t border-line pt-6 text-sm">
            <div><dt className="text-ink-2">Maintenance</dt><dd className="num mt-1 font-semibold"><Count value={t.tdee} /> kcal</dd></div>
            <div><dt className="text-ink-2">At rest</dt><dd className="num mt-1 font-semibold"><Count value={t.bmr} /> kcal</dd></div>
            <div><dt className="text-ink-2">Vs maintenance</dt><dd className="num mt-1 font-semibold">{vsMaint}%</dd></div>
          </dl>
          <div className="mt-auto pt-8">
            <button
              type="button"
              className="btn-primary w-full sm:w-auto"
              onClick={() => onStart({ sex: p.sex, age: p.age, height_cm: p.height, weight_kg: p.weight, activity_level: p.activity, goal: p.goal })}
            >
              Start with these numbers <ArrowRightIcon size={18} weight="bold" aria-hidden="true" />
            </button>
            <p className="mt-2 text-xs text-ink-2">We'll fill these into your profile. You can change them any time.</p>
          </div>
        </div>
      </div>
    </section>
  );
}

// ---------- Month heat map: pick a day (roving tabindex, arrow keys move) ----------
const shade = (kcal) => 0.18 + 0.6 * Math.min(kcal / TARGET, 1);
const dayName = (i) => new Date(2026, 2, i + 1).toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric' });

function MonthMap() {
  const [sel, setSel] = useState(13);
  const refs = useRef([]);
  const go = (i) => {
    const n = Math.max(0, Math.min(MONTH.length - 1, i));
    setSel(n);
    refs.current[n]?.focus();
  };
  const onKey = (e, i) => {
    const d = { ArrowRight: 1, ArrowLeft: -1, ArrowDown: 7, ArrowUp: -7, Home: -i, End: MONTH.length - 1 - i }[e.key];
    if (d !== undefined) { e.preventDefault(); go(i + d); }
  };
  const kcal = MONTH[sel];

  return (
    <div className="mt-6">
      <p className="num mb-4 flex min-h-12 flex-col justify-center rounded-2xl bg-surface-2 px-4 py-2 text-sm">
        <span className="font-semibold">{dayName(sel)}</span>
        <span className="text-ink-2">{kcal ? `${fmt(kcal)} kcal, ${Math.round((kcal / TARGET) * 100)}% of target` : 'Nothing logged'}</span>
      </p>
      <div className="grid grid-cols-7 gap-1 pb-1.5 text-center text-[11px] font-medium text-ink-2" aria-hidden="true">
        {['S', 'M', 'T', 'W', 'T', 'F', 'S'].map((d, i) => <div key={i}>{d}</div>)}
      </div>
      <div className="grid grid-cols-7 gap-0.5 sm:gap-1" role="group" aria-label="March 2026">
        {Array.from({ length: MONTH_LEAD }, (_, i) => <div key={`b${i}`} />)}
        {MONTH.map((k, i) => {
          const a = k ? shade(k) : 0;
          return (
            <button
              key={i}
              ref={(el) => { refs.current[i] = el; }}
              type="button"
              tabIndex={i === sel ? 0 : -1}
              aria-pressed={i === sel}
              aria-label={`${dayName(i)}, ${k ? `${fmt(k)} kcal, ${Math.round((k / TARGET) * 100)}% of target` : 'nothing logged'}`}
              onClick={() => go(i)}
              onKeyDown={(e) => onKey(e, i)}
              className={`lp-day num grid aspect-square place-items-center rounded-lg text-[11px] ${a > 0.55 ? 'text-on-tint' : 'text-ink'} ${k ? '' : 'bg-surface-2/70'} ${i === sel ? 'ring-2 ring-ink ring-offset-1 ring-offset-surface' : ''}`}
              style={k ? { background: `rgb(var(--accent) / ${a})` } : undefined}
            >
              {i + 1}
            </button>
          );
        })}
      </div>
    </div>
  );
}

// One terminal line with a copy button. Falls back to selecting the text when the clipboard is refused.
function CopyLine({ cmd }) {
  const [copied, setCopied] = useState(false);
  const codeRef = useRef(null);
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(cmd);
      setCopied(true);
      setTimeout(() => setCopied(false), 1600);
    } catch {
      const r = document.createRange();
      r.selectNodeContents(codeRef.current);
      const sel = window.getSelection();
      sel.removeAllRanges();
      sel.addRange(r);
    }
  };
  return (
    <div className="mt-1.5 flex items-center gap-2 rounded-xl bg-white/[0.06] py-1 pl-3.5 pr-1">
      <code ref={codeRef} className="min-w-0 flex-1 overflow-x-auto whitespace-nowrap py-2 font-mono text-[13px] text-white">
        <span className="select-none text-[#6ee7a0]">$ </span>{cmd}
      </code>
      <button type="button" onClick={copy} className="grid size-11 shrink-0 place-items-center rounded-full text-white/70 transition hover:bg-white/10 hover:text-white" aria-label={copied ? 'Copied' : `Copy: ${cmd}`}>
        {copied ? <CheckIcon size={18} weight="bold" aria-hidden="true" /> : <CopyIcon size={18} aria-hidden="true" />}
      </button>
      <span className="sr-only" aria-live="polite">{copied ? 'Copied to clipboard' : ''}</span>
    </div>
  );
}

const FACTS = [
  [LockKeyIcon, 'Encrypted with AES-256-GCM before it is stored.'],
  [EyeSlashIcon, 'Never shown again in full, only the last 4 characters.'],
  [ArrowsClockwiseIcon, 'Replace or remove it any time.'],
  [WalletIcon, 'AI requests use your own provider account, so you pay your provider directly.'],
];

const PROVIDER_NAMES = ['OpenAI', 'Anthropic', 'Google Gemini', 'OpenRouter', 'Groq', 'Perplexity', 'xAI', 'Mistral', 'DeepSeek'];

const HEADLINE = ['Eat', 'to', 'your', 'numbers.'];

// ---------- Background: 3D food drifting behind the page (src/food3d.js, three.js) ----------
// Loaded after the page has painted and the browser is idle, so the 3D code never delays first render.
function FoodScene() {
  const ref = useRef(null);
  const [ready, setReady] = useState(false);
  useEffect(() => {
    let stop = () => {};
    let cancelled = false;
    const start = () => import('./food3d.js').then((m) => {
      if (cancelled) return;
      stop = m.mount(ref.current, { still: reducedMotion() });
      setReady(true);
    }).catch(() => {});
    const idle = window.requestIdleCallback ? requestIdleCallback(start, { timeout: 1200 }) : setTimeout(start, 300);
    return () => {
      cancelled = true;
      (window.cancelIdleCallback || clearTimeout)(idle);
      stop();
    };
  }, []);
  return <canvas ref={ref} className={`lp-field ${ready ? 'is-ready' : ''}`} aria-hidden="true" />;
}

// ---------- Page ----------
export default function Landing({ onSignIn, onCreateAccount }) {
  const heroRef = useRef(null);
  const tiltRef = useRef(null);

  // Browser chrome matches the white page even in OS dark mode.
  useEffect(() => {
    const m = document.querySelector('meta[name="theme-color"][media*="dark"]');
    const prev = m?.content;
    if (m) m.content = '#ffffff';
    return () => { if (m) m.content = prev; };
  }, []);

  // Pointer tilt on the hero stage: CSS variables only, one write per frame, no React state.
  useEffect(() => {
    const hero = heroRef.current;
    const tilt = tiltRef.current;
    if (!hero || !tilt || !window.matchMedia('(pointer: fine) and (prefers-reduced-motion: no-preference)').matches) return undefined;
    let frame = 0;
    let x = 0;
    let y = 0;
    const write = () => {
      frame = 0;
      tilt.style.setProperty('--lp-px', `${(x * 7).toFixed(2)}deg`);
      tilt.style.setProperty('--lp-py', `${(-y * 5).toFixed(2)}deg`);
    };
    const onMove = (e) => {
      x = e.clientX / window.innerWidth - 0.5;
      y = e.clientY / window.innerHeight - 0.5;
      if (!frame) frame = requestAnimationFrame(write);
    };
    const onLeave = () => { x = 0; y = 0; if (!frame) frame = requestAnimationFrame(write); };
    hero.addEventListener('pointermove', onMove, { passive: true });
    hero.addEventListener('pointerleave', onLeave);
    return () => {
      hero.removeEventListener('pointermove', onMove);
      hero.removeEventListener('pointerleave', onLeave);
      cancelAnimationFrame(frame);
    };
  }, []);

  // Cards light up under the pointer (.lp-spot) and lean toward it ([data-tilt]). One delegated listener for the page.
  useEffect(() => {
    if (!window.matchMedia('(pointer: fine)').matches) return undefined;
    const tiltOk = !reducedMotion();
    let frame = 0;
    let ev = null;
    let cur = null;
    const write = () => {
      frame = 0;
      const el = ev.target instanceof Element ? ev.target.closest('.lp-spot') : null;
      if (cur && cur !== el) { cur.style.removeProperty('--tx'); cur.style.removeProperty('--ty'); }
      cur = el;
      if (!el) return;
      const r = el.getBoundingClientRect();
      const x = ev.clientX - r.left;
      const y = ev.clientY - r.top;
      el.style.setProperty('--mx', `${x.toFixed(0)}px`);
      el.style.setProperty('--my', `${y.toFixed(0)}px`);
      if (tiltOk && el.hasAttribute('data-tilt')) {
        el.style.setProperty('--tx', `${((x / r.width - 0.5) * 5).toFixed(2)}deg`);
        el.style.setProperty('--ty', `${((0.5 - y / r.height) * 5).toFixed(2)}deg`);
      }
    };
    const onMove = (e) => { ev = e; if (!frame) frame = requestAnimationFrame(write); };
    document.addEventListener('pointermove', onMove, { passive: true });
    return () => { document.removeEventListener('pointermove', onMove); cancelAnimationFrame(frame); };
  }, []);

  const getStarted = (cls = 'btn-primary') => <button type="button" className={cls} onClick={() => onCreateAccount()}>Get started</button>;

  return (
    <div className="lp min-h-[100dvh]">
      <div className="ambient" aria-hidden="true"><span /><span /><span /></div>
      <FoodScene />

      <header className="sticky top-0 z-30 border-b border-line/70 bg-white/80 backdrop-blur-xl">
        <div className="mx-auto flex h-16 max-w-6xl items-center gap-2 px-4 sm:px-6">
          <Brand compact />
          <div className="ml-auto flex items-center gap-1 sm:gap-2">
            <a href={REPO_URL} target="_blank" rel="noopener noreferrer" className="icon-btn" aria-label="Source code on GitHub" title="Source code on GitHub">
              <GithubLogoIcon size={22} aria-hidden="true" />
            </a>
            <button type="button" className="btn-quiet px-3 sm:px-5" onClick={onSignIn}>Sign in</button>
            {getStarted('btn-primary px-4 sm:px-5')}
          </div>
        </div>
        <div className="lp-progress" aria-hidden="true" />
      </header>

      <main>
        {/* Hero: split, copy left, live 3D stage of real components right. */}
        <section ref={heroRef} className="lp-hero" aria-labelledby="lp-h1">
          <div className="mx-auto grid max-w-6xl items-center gap-10 px-4 pb-16 pt-12 sm:px-6 md:pt-16 lg:min-h-[calc(100svh-4rem)] lg:grid-cols-[0.95fr_1.05fr] lg:gap-8 lg:pb-12">
            <div className="space-y-6">
              <h1 id="lp-h1" className="max-w-xl text-balance text-5xl font-semibold leading-[1.02] tracking-tight md:text-6xl lg:text-7xl">
                {HEADLINE.map((w, i) => (
                  <Fragment key={w}>
                    {i > 0 && ' '}
                    <span className={`lp-word ${i === HEADLINE.length - 1 ? 'text-accent' : ''}`} style={{ '--i': i }}>{w}</span>
                  </Fragment>
                ))}
              </h1>
              <p className="rise max-w-[42ch] text-lg leading-relaxed text-ink-2" style={{ '--i': 4 }}>
                Log meals by photo, track them against daily targets, and get meals planned to fit what's left.
              </p>
              <div className="rise flex flex-wrap gap-3 pt-2" style={{ '--i': 5 }}>
                {getStarted()}
                <button type="button" className="btn-ghost" onClick={onSignIn}>Sign in</button>
              </div>
            </div>

            <HeroStage tiltRef={tiltRef} />
          </div>
        </section>

        {/* Scroll story: pinned 3D stage at lg, a plain vertical sequence everywhere else. */}
        <section className="lp-story-sec" aria-labelledby="lp-story-h">
          <div className="mx-auto max-w-6xl px-4 pt-16 sm:px-6 lg:pt-24">
            <h2 id="lp-story-h" className="max-w-2xl text-balance text-3xl font-semibold tracking-tight sm:text-4xl">From plate to plan, in one place.</h2>
            <p className="mt-3 max-w-[52ch] text-[15px] leading-relaxed text-ink-2">Real screens from the app, filled with example data.</p>
          </div>
          <div className="lp-story">
            <div className="lp-mark lp-m1" aria-hidden="true" />
            <div className="lp-mark lp-m2" aria-hidden="true" />
            <div className="lp-mark lp-m3" aria-hidden="true" />
            <div className="lp-pin">
              <div className="lp-pin-inner mx-auto max-w-6xl px-4 sm:px-6">
                {BEATS.map((b) => (
                  <article key={b.id} className={`lp-beat lp-b${b.id}`}>
                    <div className="lp-copy">
                      <p className="num text-sm font-semibold text-accent">0{b.id}</p>
                      <h3 className="mt-2 text-2xl font-semibold tracking-tight sm:text-3xl">{b.title}</h3>
                      <p className="mt-3 max-w-[40ch] text-lg leading-relaxed text-ink-2">{b.body}</p>
                    </div>
                    <div className="lp-shot" aria-hidden="true" inert="">{b.panel}</div>
                  </article>
                ))}
                <ol className="lp-steps" aria-hidden="true">
                  {BEATS.map((b) => (
                    <li key={b.id} className={`lp-step lp-s${b.id}`}>
                      <span>{b.short}</span>
                      <i />
                    </li>
                  ))}
                </ol>
              </div>
            </div>
          </div>
        </section>

        <TargetsLab onStart={onCreateAccount} />

        {/* Bento: asymmetric grid, real mini components. */}
        <section className="lp-cv mx-auto max-w-6xl px-4 py-20 sm:px-6 lg:py-28" aria-labelledby="lp-bento-h">
          <h2 id="lp-bento-h" className="max-w-2xl text-balance text-3xl font-semibold tracking-tight sm:text-4xl">The long view, without the spreadsheet.</h2>
          <div className="mt-10 grid gap-4 md:grid-cols-2 lg:grid-cols-6">
            <div className="panel lp-spot p-6 md:col-span-2 lg:col-span-4" data-tilt="">
              <h3 className="text-lg font-semibold tracking-tight">Thirty days at a glance</h3>
              <p className="mt-1 text-[15px] text-ink-2">Every day against your target, so streaks and slips are obvious. Hover a bar for the day.</p>
              <div className="mt-10"><CalorieChart rows={MONTH_ROWS} target={TARGET} /></div>
            </div>

            <div className="panel lp-spot p-4 sm:p-6 lg:col-span-2 lg:row-span-2">
              <h3 className="text-lg font-semibold tracking-tight">A month, shaded</h3>
              <p className="mt-1 text-[15px] text-ink-2">Darker days sit closer to target. Pick a day to see how it went.</p>
              <MonthMap />
            </div>

            <div className="panel lp-spot p-6 lg:col-span-2" data-tilt="">
              <h3 className="text-lg font-semibold tracking-tight">Macros, not just calories</h3>
              <p className="mt-1 text-[15px] text-ink-2">See where each meal's energy comes from.</p>
              <ul className="mt-5 space-y-3.5" aria-hidden="true">
                {MEALS.map(([name, p, c, f]) => (
                  <li key={name}>
                    <div className="mb-1.5 flex justify-between text-sm">
                      <span>{name}</span>
                      <span className="num text-ink-2">{fmt(p * 4 + c * 4 + f * 9)} kcal</span>
                    </div>
                    <MacroSplit protein={p} carbs={c} fat={f} />
                  </li>
                ))}
              </ul>
            </div>

            <div className="lp-spot rounded-card border border-accent/25 bg-accent-soft/70 p-6 md:col-span-2 lg:col-span-2" data-tilt="">
              <h3 className="text-lg font-semibold tracking-tight">Plans that skip your allergens</h3>
              <p className="mt-1 text-[15px] text-ink-2">Add allergies once. Every meal plan works around them.</p>
              <div className="mt-5 flex flex-wrap gap-2" aria-hidden="true">
                {['Peanuts', 'Shellfish', 'Gluten'].map((a) => (
                  <span key={a} className="inline-flex h-8 items-center gap-1.5 rounded-full bg-surface px-3 text-sm">
                    <ProhibitIcon size={14} weight="bold" className="text-danger" />{a}
                  </span>
                ))}
              </div>
            </div>
          </div>
        </section>

        {/* Bring your own key: centered statement, inert sample field, facts grid. */}
        <section className="lp-cv mx-auto max-w-3xl px-4 py-20 text-center sm:px-6 lg:py-28" aria-labelledby="lp-key-h">
          <h2 id="lp-key-h" className="text-balance text-3xl font-semibold tracking-tight sm:text-5xl">Your AI runs on your own key.</h2>
          <p className="mx-auto mt-4 max-w-[48ch] text-lg leading-relaxed text-ink-2">
            Add an API key from the AI provider you already use, once, after you sign in. It follows your account to any device.
          </p>
          <ul className="mx-auto mt-8 flex max-w-xl flex-wrap justify-center gap-2" aria-label="Supported providers">
            {PROVIDER_NAMES.map((n) => (
              <li key={n} className="inline-flex h-9 items-center rounded-full border border-line bg-surface px-3.5 text-sm font-medium">{n}</li>
            ))}
          </ul>
          <div className="lp-card lp-spot mx-auto mt-10 max-w-md rounded-card border border-line bg-surface p-5 text-left" data-tilt="" aria-hidden="true">
            <span className="label">Provider</span>
            <input className="field" readOnly tabIndex={-1} value="Detect from key: Anthropic (Claude)" />
            <span className="label mt-4">API key</span>
            <input className="field num tracking-wide" readOnly tabIndex={-1} value="sk-ant-••••••••••••ab12" />
            <p className="mt-2 flex items-center gap-1.5 text-xs text-ink-2"><LockKeyIcon size={14} weight="bold" className="text-accent" />Saved and encrypted. Only the last 4 characters are shown.</p>
          </div>
          <ul className="mt-12 grid gap-x-8 gap-y-6 text-left sm:grid-cols-2">
            {FACTS.map(([Icon, text]) => (
              <li key={text} className="flex gap-3.5 text-[15px] leading-relaxed">
                <span className="grid size-9 shrink-0 place-items-center rounded-xl bg-accent-soft text-accent">
                  <Icon size={18} weight="bold" aria-hidden="true" />
                </span>
                <span className="pt-1.5">{text}</span>
              </li>
            ))}
          </ul>
        </section>

        {/* Open source: clone and run your own copy. */}
        <section className="lp-cv mx-auto max-w-6xl px-4 pb-20 sm:px-6 lg:pb-28" aria-labelledby="lp-src-h">
          <div className="grid gap-8 lg:grid-cols-[0.85fr_1.15fr] lg:items-center lg:gap-14">
            <div className="min-w-0">
              <h2 id="lp-src-h" className="text-balance text-3xl font-semibold tracking-tight sm:text-4xl">Rather run your own copy?</h2>
              <p className="mt-3 max-w-[46ch] text-[15px] leading-relaxed text-ink-2">
                The whole app is open source on GitHub: a React frontend and an Express API that runs on Cloudflare Workers with a D1 database. Clone it, run it locally, and deploy it to your own Cloudflare account.
              </p>
              <div className="mt-6 flex flex-wrap gap-3">
                <a href={REPO_URL} target="_blank" rel="noopener noreferrer" className="btn-primary">
                  <GithubLogoIcon size={18} weight="bold" aria-hidden="true" />View on GitHub
                </a>
                <a href={`${REPO_URL}#readme`} target="_blank" rel="noopener noreferrer" className="btn-ghost">Setup guide</a>
              </div>
            </div>
            <ol className="lp-term lp-spot min-w-0 space-y-4 rounded-card p-5 sm:p-6" aria-label="Run it locally">
              {SETUP.map((s, i) => (
                <li key={s.cmd} className="min-w-0">
                  <p className="text-sm text-white/70"><span className="num mr-2 text-white/45">{i + 1}</span>{s.label}</p>
                  <CopyLine cmd={s.cmd} />
                </li>
              ))}
            </ol>
          </div>
        </section>

        {/* Final CTA band. */}
        <section className="lp-cv mx-auto max-w-6xl px-4 pb-20 sm:px-6" aria-labelledby="lp-cta-h">
          <div className="lp-cta relative flex flex-col items-start gap-6 overflow-hidden rounded-card bg-accent p-8 text-accent-ink sm:flex-row sm:items-center sm:justify-between sm:p-12">
            <h2 id="lp-cta-h" className="relative text-balance text-2xl font-semibold tracking-tight sm:text-3xl">Start with your goal. We do the math.</h2>
            <button type="button" className="btn relative bg-white text-ink hover:bg-white/90" onClick={() => onCreateAccount()}>
              Get started <ArrowRightIcon size={18} weight="bold" aria-hidden="true" />
            </button>
          </div>
        </section>
      </main>

      <footer className="border-t border-line/70">
        <div className="mx-auto flex max-w-6xl flex-col gap-3 px-4 py-8 text-sm text-ink-2 sm:flex-row sm:items-center sm:justify-between sm:px-6">
          <Brand />
          <p className="flex flex-wrap items-center gap-x-4 gap-y-2">
            Track meals, hit your targets, plan what comes next.
            <a href={REPO_URL} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1.5 rounded-full font-medium text-ink hover:text-accent">
              <GithubLogoIcon size={16} aria-hidden="true" />GitHub
            </a>
          </p>
        </div>
      </footer>
    </div>
  );
}

import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import {
  ArrowClockwiseIcon, ArrowSquareOutIcon, CaretDownIcon, CheckCircleIcon, CheckIcon, CopyIcon,
  MinusIcon, PlusIcon, WarningCircleIcon, WarningIcon, XIcon,
} from '@phosphor-icons/react';

export const MACROS = [
  { key: 'protein', label: 'Protein', dot: 'bg-protein', kcalPerG: 4 },
  { key: 'carbs', label: 'Carbs', dot: 'bg-carbs', kcalPerG: 4 },
  { key: 'fat', label: 'Fat', dot: 'bg-fat', kcalPerG: 9 },
];

export const fmt = (n) => Math.round(Number(n) || 0).toLocaleString();

// Progress ring. Draws in on mount (CSS keyframe from full offset), eases on updates.
export function Ring({ value, max, label, children }) {
  const r = 44;
  const circ = 2 * Math.PI * r;
  const pct = max > 0 ? Math.min(Math.max(value / max, 0), 1) : 0;
  return (
    <div className="relative aspect-square w-full max-w-[15rem]" role="img" aria-label={label}>
      <svg viewBox="0 0 100 100" className="size-full -rotate-90">
        <circle cx="50" cy="50" r={r} fill="none" strokeWidth="7" className="stroke-surface-2" />
        <circle
          cx="50" cy="50" r={r} fill="none" strokeWidth="7" strokeLinecap="round"
          className="ring-draw stroke-accent"
          style={{ strokeDasharray: circ, strokeDashoffset: circ * (1 - pct), '--circ': circ }}
        />
      </svg>
      <div className="absolute inset-0 grid place-items-center text-center">{children}</div>
    </div>
  );
}

export function MacroMeter({ label, dot, value, target }) {
  const pct = target > 0 ? Math.min(value / target, 1) : 0;
  return (
    <div>
      <div className="flex items-baseline justify-between gap-3 text-sm">
        <span className="flex items-center gap-2 text-ink-2">
          <span className={`size-2.5 rounded-full ${dot}`} aria-hidden="true" />
          {label}
        </span>
        <span className="num whitespace-nowrap">
          <span className="font-semibold text-ink">{fmt(value)}</span>
          <span className="text-ink-2"> / {target ? `${fmt(target)} g` : '-'}</span>
        </span>
      </div>
      <div className="mt-2 h-2 overflow-hidden rounded-full bg-surface-2">
        <div className={`fill-grow h-full origin-left rounded-full ${dot}`} style={{ transform: `scaleX(${pct})` }} />
      </div>
    </div>
  );
}

export const parseDay = (iso) => {
  const [y, m, d] = String(iso).slice(0, 10).split('-').map(Number);
  return new Date(y, m - 1, d);
};

// Daily calories as bars against a dashed target line. Single series, so no legend; a table backs it for screen readers.
export function CalorieChart({ rows, target }) {
  const data = rows.map((r) => ({ date: r.date, kcal: Number(r.intake?.calories_total || 0) }));
  const peak = Math.max(target || 0, ...data.map((d) => d.kcal), 1) * 1.15;
  const dense = data.length > 10;
  const dayLabel = (iso, i) => {
    const d = parseDay(iso);
    if (!dense) return d.toLocaleDateString(undefined, { weekday: 'short' });
    return i % 7 === 0 || (i === data.length - 1 && i % 7 >= 3) ? d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' }) : '';
  };

  return (
    <figure>
      <div className="relative h-44" aria-hidden="true">
        {target > 0 && (
          <div className="absolute inset-x-0 border-t border-dashed border-ink-2/50" style={{ bottom: `${(target / peak) * 100}%` }}>
            <span className="num absolute -top-6 right-0 rounded-full bg-surface/90 px-2 py-0.5 text-xs text-ink-2">Target {fmt(target)}</span>
          </div>
        )}
        <div className="absolute inset-0 flex items-end gap-[2px]">
          {data.map((d, i) => {
            const h = (d.kcal / peak) * 100;
            return (
              <div key={d.date} className="group relative flex h-full flex-1 items-end justify-center">
                <div
                  className={`bar-grow w-full max-w-8 origin-bottom rounded-t-[4px] ${d.kcal > 0 ? 'bg-accent group-hover:brightness-110' : 'bg-line'}`}
                  style={{ height: d.kcal > 0 ? `${h}%` : '2px', '--i': i }}
                />
                <div
                  className="pointer-events-none absolute z-10 whitespace-nowrap rounded-xl border border-line bg-surface px-3 py-2 text-xs opacity-0 shadow-lg transition-opacity group-hover:opacity-100"
                  style={{ bottom: `calc(${Math.max(h, 2)}% + 8px)` }}
                >
                  <div className="text-ink-2">{parseDay(d.date).toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric' })}</div>
                  <div className="num font-semibold text-ink">{fmt(d.kcal)} kcal</div>
                </div>
              </div>
            );
          })}
        </div>
      </div>
      <div className="mt-2 flex gap-[2px] text-xs text-ink-2" aria-hidden="true">
        {data.map((d, i) => (
          <div key={d.date} className={`flex min-w-0 flex-1 justify-center ${dense ? "whitespace-nowrap" : "truncate"}`}>{dayLabel(d.date, i)}</div>
        ))}
      </div>
      <table className="sr-only">
        <caption>Calories per day</caption>
        <tbody>
          {data.map((d) => (
            <tr key={d.date}><th scope="row">{d.date}</th><td>{fmt(d.kcal)} kcal</td></tr>
          ))}
        </tbody>
      </table>
    </figure>
  );
}

// Native <dialog>: focus trap, Esc and top layer for free. `side` makes it a right-hand drawer.
export function Sheet({ open, onClose, title, side = false, children }) {
  const ref = useRef(null);
  // Layout effect so content mounts and the dialog opens in the same frame (no empty flash).
  useLayoutEffect(() => {
    const d = ref.current;
    if (!d) return;
    if (open && !d.open) d.showModal();
    if (!open && d.open) d.close();
  }, [open]);

  const shape = side
    ? 'm-0 ml-auto h-dvh max-h-none w-full max-w-xl sm:rounded-l-card'
    : 'w-[calc(100%-2rem)] max-w-2xl max-h-[min(88dvh,56rem)] rounded-card';

  return (
    <dialog
      ref={ref}
      onClose={onClose}
      onClick={(e) => e.target === ref.current && onClose()}
      aria-label={title}
      className={`${shape} overflow-hidden border border-line bg-surface p-0 text-ink shadow-2xl`}
    >
      <div className="flex max-h-[inherit] h-full flex-col">
        <div className="flex items-center justify-between gap-4 border-b border-line px-6 py-4">
          <h2 className="text-lg font-semibold">{title}</h2>
          <button type="button" onClick={onClose} className="icon-btn -mr-2" aria-label="Close">
            <XIcon size={20} />
          </button>
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-6 py-6">{open && children}</div>
      </div>
    </dialog>
  );
}

// Toast lives in a manual popover so it stays above open dialogs (both use the top layer).
export function Toast({ toast }) {
  const ref = useRef(null);
  useEffect(() => {
    const el = ref.current;
    if (!el?.showPopover) return;
    if (el.matches(':popover-open')) el.hidePopover();
    if (toast) el.showPopover();
  }, [toast]);

  const bad = toast?.tone === 'error';
  return (
    <>
      <span className="sr-only" role="status" aria-live="polite">{toast?.message}</span>
      <div
        ref={ref}
        popover="manual"
        aria-hidden="true"
        className="pointer-events-none fixed inset-auto bottom-6 left-1/2 z-40 m-0 -translate-x-1/2 overflow-visible border-0 bg-transparent p-0"
      >
        {toast && (
          <div key={toast.id} className="toast pointer-events-auto flex max-w-[calc(100vw-2rem)] items-center gap-2.5 rounded-full border border-line bg-surface px-4 py-2.5 text-sm text-ink shadow-xl">
            {bad
              ? <WarningCircleIcon size={18} weight="fill" className="shrink-0 text-danger" />
              : <CheckCircleIcon size={18} weight="fill" className="shrink-0 text-accent" />}
            <span>{toast.message}</span>
          </div>
        )}
      </div>
    </>
  );
}

export function MacroSplit({ protein, carbs, fat }) {
  const parts = [
    { key: 'protein', kcal: (Number(protein) || 0) * 4, cls: 'bg-protein' },
    { key: 'carbs', kcal: (Number(carbs) || 0) * 4, cls: 'bg-carbs' },
    { key: 'fat', kcal: (Number(fat) || 0) * 9, cls: 'bg-fat' },
  ];
  const total = parts.reduce((s, p) => s + p.kcal, 0);
  if (!total) return null;
  return (
    <div className="flex h-2 gap-[2px] overflow-hidden rounded-full" aria-hidden="true">
      {parts.filter((p) => p.kcal > 0).map((p) => (
        <div key={p.key} className={`fill-grow origin-left ${p.cls}`} style={{ width: `${(p.kcal / total) * 100}%` }} />
      ))}
    </div>
  );
}

const ingredientText = (ing) => (typeof ing === 'string' ? ing : `${ing.amount || ''} ${ing.unit || ''} ${ing.name || ''}`.trim());

export function RecipeCard({ recipe, onRegenerate, onAddToLog, style }) {
  const [copied, setCopied] = useState(false);
  const [servings, setServings] = useState(1);
  const [adding, setAdding] = useState(false);
  const n = recipe.nutrients || {};
  const ingredients = Array.isArray(recipe.ingredients) ? recipe.ingredients : [];
  const steps = Array.isArray(recipe.steps) ? recipe.steps : [];
  const warnings = recipe.allergy_warnings || [];
  const hasMacros = n.calories || n.protein_g || n.carbs_g || n.fat_g;

  const copyIngredients = async () => {
    await navigator.clipboard.writeText(ingredients.map(ingredientText).join('\n'));
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const add = async () => {
    setAdding(true);
    try { await onAddToLog(recipe, servings); } finally { setAdding(false); }
  };

  return (
    <article className="rise panel overflow-hidden" style={style}>
      {recipe.image_url && (
        <div className="aspect-[16/9] overflow-hidden bg-surface-2">
          <img
            src={recipe.image_url}
            alt={recipe.title || 'Recipe'}
            loading="lazy"
            className="size-full object-cover"
            onError={(e) => { e.currentTarget.parentElement.style.display = 'none'; }}
          />
        </div>
      )}

      <div className="space-y-5 p-6">
        <header className="space-y-1.5">
          <h3 className="text-xl font-semibold leading-snug tracking-tight">{recipe.title || 'Untitled recipe'}</h3>
          {recipe.source_url && (
            <a href={recipe.source_url} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 text-sm text-accent hover:underline">
              Original recipe <ArrowSquareOutIcon size={14} />
            </a>
          )}
        </header>

        {warnings.length > 0 && (
          <div className="flex flex-wrap gap-2">
            {warnings.map((w, i) => (
              <span key={i} className="inline-flex items-center gap-1.5 rounded-full bg-danger/10 px-3 py-1 text-xs font-medium text-danger">
                <WarningIcon size={14} weight="bold" /> {w}
              </span>
            ))}
          </div>
        )}

        {hasMacros && (
          <div className="space-y-3">
            <div className="flex flex-wrap items-end gap-x-6 gap-y-2">
              {n.calories != null && (
                <div>
                  <div className="num text-3xl font-semibold tracking-tight">{fmt(n.calories)}</div>
                  <div className="text-xs text-ink-2">kcal per serving</div>
                </div>
              )}
              {MACROS.map((m) => n[`${m.key}_g`] != null && (
                <div key={m.key} className="text-sm">
                  <div className="num font-semibold">{fmt(n[`${m.key}_g`])} g</div>
                  <div className="flex items-center gap-1.5 text-xs text-ink-2">
                    <span className={`size-2 rounded-full ${m.dot}`} aria-hidden="true" />{m.label}
                  </div>
                </div>
              ))}
            </div>
            <MacroSplit protein={n.protein_g} carbs={n.carbs_g} fat={n.fat_g} />
          </div>
        )}

        {recipe.daily_contribution && <p className="text-[15px] leading-relaxed text-ink-2">{recipe.daily_contribution}</p>}

        {ingredients.length > 0 && (
          <details open className="group">
            <summary className="flex cursor-pointer list-none items-center justify-between py-1 font-medium">
              Ingredients <span className="flex items-center gap-2 text-sm font-normal text-ink-2">{ingredients.length}<CaretDownIcon size={16} className="transition group-open:rotate-180" /></span>
            </summary>
            <ul className="mt-2 space-y-1.5 text-[15px] text-ink-2">
              {ingredients.map((ing, i) => (
                <li key={i} className="flex gap-2.5"><CheckIcon size={16} className="mt-1 shrink-0 text-accent" />{ingredientText(ing)}</li>
              ))}
            </ul>
            <button type="button" onClick={copyIngredients} className="btn-quiet -ml-3 mt-1 h-9 px-3 text-sm">
              {copied ? <><CheckIcon size={16} /> Copied</> : <><CopyIcon size={16} /> Copy list</>}
            </button>
          </details>
        )}

        {steps.length > 0 && (
          <details className="group">
            <summary className="flex cursor-pointer list-none items-center justify-between py-1 font-medium">
              Method <span className="flex items-center gap-2 text-sm font-normal text-ink-2">{steps.length} steps<CaretDownIcon size={16} className="transition group-open:rotate-180" /></span>
            </summary>
            <ol className="mt-2 space-y-3 text-[15px] leading-relaxed text-ink-2">
              {steps.map((s, i) => (
                <li key={i} className="flex gap-3">
                  <span className="num mt-0.5 grid size-6 shrink-0 place-items-center rounded-full bg-accent-soft text-xs font-semibold text-accent">{i + 1}</span>
                  <span>{s}</span>
                </li>
              ))}
            </ol>
          </details>
        )}

        <footer className="flex flex-wrap items-center gap-2 border-t border-line pt-5">
          {onRegenerate && (
            <button type="button" onClick={onRegenerate} className="btn-quiet -ml-3 px-3">
              <ArrowClockwiseIcon size={18} /> Regenerate
            </button>
          )}
          <div className="ml-auto flex items-center gap-2">
            <div className="flex items-center rounded-full border border-line" role="group" aria-label="Servings">
              <button type="button" className="icon-btn size-10" aria-label="Fewer servings" onClick={() => setServings((s) => Math.max(1, s - 1))}><MinusIcon size={16} /></button>
              <span className="num w-6 text-center text-sm font-semibold" aria-live="polite">{servings}</span>
              <button type="button" className="icon-btn size-10" aria-label="More servings" onClick={() => setServings((s) => Math.min(12, s + 1))}><PlusIcon size={16} /></button>
            </div>
            <button type="button" onClick={add} disabled={adding} className="btn-primary">
              <PlusIcon size={18} weight="bold" /> {adding ? 'Adding…' : 'Add to log'}
            </button>
          </div>
        </footer>
      </div>
    </article>
  );
}

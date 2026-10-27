// How Acta looks on this device, beyond light and dark: an accent, the surfaces' warmth, contrast, text size, the
// interface font and motion. It's kept in localStorage and put on the root as data attributes (see globals.css)
// by a script in the root layout before the page paints, and again here whenever it changes

export type Accent = "lapis" | "amethyst" | "rhodonite" | "fluorite" | "obsidian" | "custom";

export type Appearance = {
  accent: Accent;
  // The colour for a custom accent, as #rrggbb
  color: string;
  surface: "warm" | "neutral" | "cool";
  contrast: "normal" | "more";
  size: "sm" | "md" | "lg" | "xl";
  font: "geist" | "system" | "mono";
  motion: "full" | "reduced";
};

export const defaultAppearance: Appearance = {
  accent: "lapis",
  color: "",
  surface: "warm",
  contrast: "normal",
  size: "md",
  font: "geist",
  motion: "full",
};

const key = "acta-appearance";
const fields = ["accent", "surface", "contrast", "size", "font", "motion"] as const;
const hex = /^#[0-9a-f]{6}$/i;

// Public roadmaps wear their owner's look, not the visitor's
const ownLook = "location.pathname.indexOf('/p/')===0";

/** Runs in the root layout before the page paints. Kept in step with paint() below */
export const appearanceScript = `(function(){try{if(${ownLook})return;var a=JSON.parse(localStorage.getItem("${key}")||"null");if(!a)return;var r=document.documentElement;${JSON.stringify(fields)}.forEach(function(k){if(typeof a[k]==="string")r.setAttribute("data-"+k,a[k])});if(a.accent==="custom"&&${hex}.test(a.color)){r.style.setProperty("--accent-custom",a.color);if(a.light)r.setAttribute("data-accent-light","")}}catch(e){}})()`;

const linear = (c: number) => (c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4);

/** Whether text on a colour should be dark */
export function isLight(color: string) {
  if (!hex.test(color)) return false;
  const [r, g, b] = [1, 3, 5].map((i) => linear(parseInt(color.slice(i, i + 2), 16) / 255));
  return 0.2126 * r + 0.7152 * g + 0.0722 * b > 0.4;
}

function parse(raw: string | null): Appearance {
  if (!raw) return defaultAppearance;
  try {
    const stored = JSON.parse(raw) as Partial<Appearance>;
    const next = { ...defaultAppearance };
    for (const k of fields) if (typeof stored[k] === "string") (next as Record<string, string>)[k] = stored[k];
    if (typeof stored.color === "string" && hex.test(stored.color)) next.color = stored.color;
    if (next.accent === "custom" && !next.color) next.accent = "lapis";
    return next;
  } catch {
    return defaultAppearance;
  }
}

function paint(a: Appearance) {
  const root = document.documentElement;
  for (const k of fields) {
    if (a[k] === defaultAppearance[k]) root.removeAttribute(`data-${k}`);
    else root.setAttribute(`data-${k}`, a[k]);
  }
  const custom = a.accent === "custom" && hex.test(a.color);
  if (custom) root.style.setProperty("--accent-custom", a.color);
  else root.style.removeProperty("--accent-custom");
  root.toggleAttribute("data-accent-light", custom && isLight(a.color));
}

const listeners = new Set<() => void>();
let raw: string | null = null;
let current = defaultAppearance;

function read() {
  let next: string | null = null;
  try {
    next = localStorage.getItem(key);
  } catch {}
  if (next !== raw) {
    raw = next;
    current = parse(next);
  }
  return current;
}

// Another tab changed it
function onStorage(e: StorageEvent) {
  if (e.key !== key && e.key !== null) return;
  const before = current;
  if (read() === before) return;
  paint(current);
  listeners.forEach((l) => l());
}

export function subscribeAppearance(listener: () => void) {
  if (!listeners.size) window.addEventListener("storage", onStorage);
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
    if (!listeners.size) window.removeEventListener("storage", onStorage);
  };
}

export const getAppearance = read;
export const serverAppearance = () => defaultAppearance;

export function setAppearance(patch: Partial<Appearance>) {
  const next = { ...read(), ...patch };
  if (next.accent === "custom" && !hex.test(next.color)) next.accent = "lapis";
  // The colour is kept while another accent is on, so it's there to go back to
  const stored = isDefaultAppearance(next) && !next.color ? null : JSON.stringify({ ...next, light: isLight(next.color) });
  try {
    if (stored) localStorage.setItem(key, stored);
    else localStorage.removeItem(key);
  } catch {}
  raw = stored;
  current = next;
  paint(next);
  listeners.forEach((l) => l());
}

export function resetAppearance() {
  setAppearance(defaultAppearance);
}

export const isDefaultAppearance = (a: Appearance) =>
  fields.every((k) => a[k] === defaultAppearance[k]) && (a.accent !== "custom" || !a.color);

// Anything can open the Appearance panel: a button, the account menu, the command palette
export const appearanceEvent = "acta:appearance";
export const openAppearance = () => window.dispatchEvent(new Event(appearanceEvent));

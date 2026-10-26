// ── Theme manager (light / dark) ─────────────────────────────────────────────
// Persists the user's choice in localStorage and applies it via the
// `data-theme` attribute on <html>, which the CSS in index.css keys on.

const THEME_KEY = 'neuroscan-theme';
const THEME_EVENT = 'neuroscan:theme';

export function getTheme() {
  const saved = localStorage.getItem(THEME_KEY);
  return saved === 'light' ? 'light' : 'dark';
}

export function applyTheme(theme) {
  const root = document.documentElement;
  // Brief global transition so the switch feels smooth, not a hard cut
  root.classList.add('theme-transition');
  root.setAttribute('data-theme', theme);
  clearTimeout(window.__neuroscanThemeTimer);
  window.__neuroscanThemeTimer = setTimeout(
    () => root.classList.remove('theme-transition'),
    450
  );
}

export function setTheme(theme) {
  applyTheme(theme);
  localStorage.setItem(THEME_KEY, theme);
  window.dispatchEvent(new CustomEvent(THEME_EVENT, { detail: theme }));
}

export function toggleTheme() {
  setTheme(getTheme() === 'dark' ? 'light' : 'dark');
}

/** Call once before the app renders to avoid a flash of the wrong theme. */
export function initTheme() {
  applyTheme(getTheme());
}

/** Subscribe to theme changes. Returns an unsubscribe function. */
export function onThemeChange(callback) {
  const handler = (e) => callback(e.detail);
  window.addEventListener(THEME_EVENT, handler);
  return () => window.removeEventListener(THEME_EVENT, handler);
}

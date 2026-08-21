import React, { useState } from 'react';
import { Sun, Moon } from 'lucide-react';
import { getTheme, toggleTheme, onThemeChange } from '../theme';

/**
 * Sun/Moon toggle for light & dark mode.
 * Pass `floating` to render it as a fixed button (landing / auth pages).
 */
export default function ThemeToggle({ floating = false }) {
  const [theme, setThemeState] = useState(getTheme());

  React.useEffect(() => onThemeChange(setThemeState), []);

  return (
    <button
      type="button"
      className={`theme-toggle${floating ? ' theme-toggle-float' : ''}`}
      onClick={toggleTheme}
      title={theme === 'dark' ? 'Switch to Light Mode' : 'Switch to Dark Mode'}
      aria-label="Toggle color theme"
    >
      {theme === 'dark' ? <Sun size={16} /> : <Moon size={16} />}
    </button>
  );
}

import { useCallback, useEffect, useRef, useState } from 'react';
import {
  startRadialThemeTransition,
  type ThemeTransitionOrigin,
} from './themeTransition';

type Theme = 'light' | 'dark';

const STORAGE_KEY = 'tornix-theme';
const MEDIA_QUERY = '(prefers-color-scheme: dark)';

function readStoredTheme(): Theme | null {
  if (typeof window === 'undefined') return null;
  try {
    const stored = window.localStorage.getItem(STORAGE_KEY);
    if (stored === 'dark' || stored === 'light') return stored;
  } catch {
    // localStorage may be unavailable (private mode, SSR fallback, etc.)
  }
  return null;
}

function readSystemTheme(): Theme {
  if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') {
    return 'light';
  }
  return window.matchMedia(MEDIA_QUERY).matches ? 'dark' : 'light';
}

function readInitialTheme(): Theme {
  if (typeof document !== 'undefined') {
    const attr = document.documentElement.getAttribute('data-theme');
    if (attr === 'dark' || attr === 'light') return attr;
  }
  return readStoredTheme() ?? readSystemTheme();
}

function applyTheme(t: Theme): void {
  if (typeof document === 'undefined') return;
  if (t === 'dark') {
    document.documentElement.setAttribute('data-theme', 'dark');
  } else {
    document.documentElement.removeAttribute('data-theme');
  }
}

export function useTheme(): {
  theme: Theme;
  toggle: (origin?: ThemeTransitionOrigin, prefersReducedMotion?: boolean) => void;
  setTheme: (t: Theme) => void;
} {
  const [theme, setThemeState] = useState<Theme>(readInitialTheme);
  const transitionInProgress = useRef(false);

  // Sync DOM + state on mount in case the FOUC-prevention script didn't run
  // (e.g. SSR fallback, blocked inline script, or stale attribute).
  useEffect(() => {
    const current = readInitialTheme();
    applyTheme(current);
    setThemeState(current);
  }, []);

  // Follow OS preference only while the user hasn't made an explicit choice.
  // Once a value is in localStorage, manual wins forever.
  useEffect(() => {
    if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') {
      return;
    }
    const mql = window.matchMedia(MEDIA_QUERY);
    const handler = (e: MediaQueryListEvent) => {
      if (readStoredTheme() !== null) return;
      const next: Theme = e.matches ? 'dark' : 'light';
      applyTheme(next);
      setThemeState(next);
    };
    if (typeof mql.addEventListener === 'function') {
      mql.addEventListener('change', handler);
      return () => mql.removeEventListener('change', handler);
    }
    // Safari < 14 fallback
    mql.addListener(handler);
    return () => mql.removeListener(handler);
  }, []);

  const setTheme = useCallback((t: Theme) => {
    applyTheme(t);
    try {
      window.localStorage.setItem(STORAGE_KEY, t);
    } catch {
      // ignore persistence failures
    }
    setThemeState(t);
  }, []);

  const toggle = useCallback((origin?: ThemeTransitionOrigin, prefersReducedMotion = false) => {
    if (transitionInProgress.current) return;

    const updateTheme = () => {
      setThemeState((prev) => {
        const next: Theme = prev === 'dark' ? 'light' : 'dark';
        applyTheme(next);
        try {
          window.localStorage.setItem(STORAGE_KEY, next);
        } catch {
          // ignore persistence failures
        }
        return next;
      });
    };

    if (!origin) {
      updateTheme();
      return;
    }

    const transition = startRadialThemeTransition(
      origin,
      updateTheme,
      prefersReducedMotion,
    );

    if (transition) {
      transitionInProgress.current = true;
      void transition.finally(() => {
        transitionInProgress.current = false;
      });
    }
  }, []);

  return { theme, toggle, setTheme };
}

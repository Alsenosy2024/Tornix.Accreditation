import { useEffect, useState, type MouseEvent } from 'react';
import { Moon, Sun } from 'lucide-react';
import { AnimatePresence, motion } from 'motion/react';
import { useTheme } from '../hooks/useTheme';
import { getThemeTransitionOrigin } from '../hooks/themeTransition';

interface ThemeToggleProps {
  lang?: 'ar' | 'en';
  className?: string;
}

const EASE = [0.22, 1, 0.36, 1] as const;
const DURATION = 0.18; // 180ms

function usePrefersReducedMotion(): boolean {
  const [reduced, setReduced] = useState<boolean>(() => {
    if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') {
      return false;
    }
    return window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  });

  useEffect(() => {
    if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') {
      return;
    }
    const mql = window.matchMedia('(prefers-reduced-motion: reduce)');
    const handler = (e: MediaQueryListEvent) => setReduced(e.matches);
    // Modern browsers
    if (typeof mql.addEventListener === 'function') {
      mql.addEventListener('change', handler);
      return () => mql.removeEventListener('change', handler);
    }
    // Safari < 14 fallback
    mql.addListener(handler);
    return () => mql.removeListener(handler);
  }, []);

  return reduced;
}

export function ThemeToggle({ lang = 'ar', className }: ThemeToggleProps) {
  const { theme, toggle } = useTheme();
  const prefersReducedMotion = usePrefersReducedMotion();

  const label =
    lang === 'en'
      ? theme === 'dark'
        ? 'Switch to light mode'
        : 'Switch to dark mode'
      : theme === 'dark'
        ? 'تفعيل الوضع الفاتح'
        : 'تفعيل الوضع الداكن';

  // Show Moon when light (destination = dark), Sun when dark (destination = light).
  const Icon = theme === 'dark' ? Sun : Moon;

  const handleClick = (event: MouseEvent<HTMLButtonElement>) => {
    const origin = getThemeTransitionOrigin(
      event,
      event.currentTarget.getBoundingClientRect(),
    );
    toggle(origin, prefersReducedMotion);
  };

  return (
    <button
      type="button"
      onClick={handleClick}
      aria-pressed={theme === 'dark'}
      aria-label={label}
      title={label}
      className={
        'inline-flex h-9 w-9 items-center justify-center rounded-full border bg-transparent transition-colors hover:bg-[color:var(--border-hairline)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[color:var(--primary)] focus-visible:ring-offset-2' +
        (className ? ' ' + className : '')
      }
      style={{ borderColor: 'var(--border-hairline)', color: 'var(--text)' }}
    >
      {prefersReducedMotion ? (
        <Icon size={16} aria-hidden="true" />
      ) : (
        <AnimatePresence mode="wait" initial={false}>
          <motion.span
            key={theme}
            initial={{ opacity: 0, rotate: -30 }}
            animate={{ opacity: 1, rotate: 0 }}
            exit={{ opacity: 0, rotate: 30 }}
            transition={{ duration: DURATION, ease: EASE }}
            className="inline-flex"
            aria-hidden="true"
          >
            <Icon size={16} />
          </motion.span>
        </AnimatePresence>
      )}
    </button>
  );
}

export default ThemeToggle;

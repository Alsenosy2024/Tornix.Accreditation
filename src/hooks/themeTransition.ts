export interface ThemeTransitionOrigin {
  x: number;
  y: number;
}

interface ViewportSize {
  width: number;
  height: number;
}

interface ActivationCoordinates {
  detail: number;
  clientX: number;
  clientY: number;
}

interface ElementBounds {
  left: number;
  top: number;
  width: number;
  height: number;
}

const ACTIVE_CLASS = 'theme-transition-active';
const DURATION_MS = 550;
const EASING = 'cubic-bezier(0.22, 1, 0.36, 1)';

export function getThemeTransitionOrigin(
  activation: ActivationCoordinates,
  bounds: ElementBounds,
): ThemeTransitionOrigin {
  if (activation.detail > 0) {
    return { x: activation.clientX, y: activation.clientY };
  }

  return {
    x: bounds.left + bounds.width / 2,
    y: bounds.top + bounds.height / 2,
  };
}

export function getRevealRadius(
  origin: ThemeTransitionOrigin,
  viewport: ViewportSize,
): number {
  return Math.max(
    Math.hypot(origin.x, origin.y),
    Math.hypot(viewport.width - origin.x, origin.y),
    Math.hypot(origin.x, viewport.height - origin.y),
    Math.hypot(viewport.width - origin.x, viewport.height - origin.y),
  );
}

export function startRadialThemeTransition(
  origin: ThemeTransitionOrigin,
  updateTheme: () => void,
  prefersReducedMotion: boolean,
): Promise<void> | null {
  if (typeof document === 'undefined' || typeof window === 'undefined') {
    updateTheme();
    return null;
  }

  const root = document.documentElement;
  const startViewTransition = document.startViewTransition;

  if (
    prefersReducedMotion ||
    typeof startViewTransition !== 'function' ||
    typeof root.animate !== 'function'
  ) {
    updateTheme();
    return null;
  }

  root.classList.add(ACTIVE_CLASS);

  let transition: ViewTransition;
  try {
    transition = startViewTransition.call(document, updateTheme);
  } catch {
    root.classList.remove(ACTIVE_CLASS);
    updateTheme();
    return null;
  }

  void transition.ready
    .then(() => {
      if (!root.classList.contains(ACTIVE_CLASS)) return;

      const radius = getRevealRadius(origin, {
        width: window.innerWidth,
        height: window.innerHeight,
      });

      const animation = root.animate(
        {
          clipPath: [
            `circle(0px at ${origin.x}px ${origin.y}px)`,
            `circle(${radius}px at ${origin.x}px ${origin.y}px)`,
          ],
        },
        {
          duration: DURATION_MS,
          easing: EASING,
          fill: 'both',
          pseudoElement: '::view-transition-new(root)',
        },
      );

      void animation.finished.catch(() => undefined);
    })
    .catch(() => transition.skipTransition?.());

  return transition.finished
    .catch(() => undefined)
    .finally(() => root.classList.remove(ACTIVE_CLASS));
}

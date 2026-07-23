import { expect, test } from 'vitest';

import { getRevealRadius, getThemeTransitionOrigin } from './themeTransition';

test('getRevealRadius reaches the farthest viewport corner', () => {
  expect(getRevealRadius({ x: 0, y: 0 }, { width: 3, height: 4 })).toBe(5);
  expect(getRevealRadius({ x: 3, y: 4 }, { width: 3, height: 4 })).toBe(5);
});

test('getRevealRadius handles origins inside the viewport', () => {
  expect(getRevealRadius({ x: 1, y: 1 }, { width: 3, height: 4 })).toBe(Math.hypot(2, 3));
});

test('getThemeTransitionOrigin uses pointer coordinates for pointer activation', () => {
  expect(
    getThemeTransitionOrigin(
      { detail: 1, clientX: 24, clientY: 36 },
      { left: 10, top: 20, width: 40, height: 40 },
    ),
  ).toEqual({ x: 24, y: 36 });
});

test('getThemeTransitionOrigin uses the button center for keyboard activation', () => {
  expect(
    getThemeTransitionOrigin(
      { detail: 0, clientX: 0, clientY: 0 },
      { left: 10, top: 20, width: 40, height: 30 },
    ),
  ).toEqual({ x: 30, y: 35 });
});

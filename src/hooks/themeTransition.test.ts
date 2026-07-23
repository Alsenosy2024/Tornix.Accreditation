import assert from 'node:assert/strict';
import test from 'node:test';

import { getRevealRadius, getThemeTransitionOrigin } from './themeTransition.ts';

test('getRevealRadius reaches the farthest viewport corner', () => {
  assert.equal(getRevealRadius({ x: 0, y: 0 }, { width: 3, height: 4 }), 5);
  assert.equal(getRevealRadius({ x: 3, y: 4 }, { width: 3, height: 4 }), 5);
});

test('getRevealRadius handles origins inside the viewport', () => {
  assert.equal(getRevealRadius({ x: 1, y: 1 }, { width: 3, height: 4 }), Math.hypot(2, 3));
});

test('getThemeTransitionOrigin uses pointer coordinates for pointer activation', () => {
  assert.deepEqual(
    getThemeTransitionOrigin({ detail: 1, clientX: 24, clientY: 36 }, { left: 10, top: 20, width: 40, height: 40 }),
    { x: 24, y: 36 },
  );
});

test('getThemeTransitionOrigin uses the button center for keyboard activation', () => {
  assert.deepEqual(
    getThemeTransitionOrigin({ detail: 0, clientX: 0, clientY: 0 }, { left: 10, top: 20, width: 40, height: 30 }),
    { x: 30, y: 35 },
  );
});

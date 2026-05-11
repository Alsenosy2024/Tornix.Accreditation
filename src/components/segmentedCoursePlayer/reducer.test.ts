import { describe, it, expect } from 'vitest';
import { reducer, initialState, type State, type Action } from './reducer';

function s(overrides: Partial<State> = {}): State {
  return { ...initialState, segmentCount: 22, ...overrides };
}

describe('player reducer', () => {
  it('SEG_LOAD sets current segment and starts at intro', () => {
    const out = reducer(s(), { type: 'SEG_LOAD', segmentNum: 5 });
    expect(out.currentSegmentNum).toBe(5);
    expect(out.currentClipKind).toBe('intro');
    expect(out.playerState).toBe('loading');
    expect(out.upNext).toBeNull();
  });

  it('CLIP_PLAYING transitions to playing', () => {
    const start = s({ currentSegmentNum: 1, currentClipKind: 'intro', playerState: 'loading' });
    expect(reducer(start, { type: 'CLIP_PLAYING' }).playerState).toBe('playing');
  });

  it('intro CLIP_ENDED → content state', () => {
    const start = s({ currentSegmentNum: 1, currentClipKind: 'intro', playerState: 'playing' });
    const out = reducer(start, { type: 'CLIP_ENDED', kind: 'intro' });
    expect(out.currentClipKind).toBe('content');
    expect(out.upNext).toBeNull();
  });

  it('content CLIP_ENDED → outro state and starts upNext countdown', () => {
    const start = s({ currentSegmentNum: 1, currentClipKind: 'content', playerState: 'playing' });
    const out = reducer(start, { type: 'CLIP_ENDED', kind: 'content' });
    expect(out.currentClipKind).toBe('outro');
    expect(out.upNext).toEqual({ countdownSec: 5, cancelled: false });
  });

  it('outro CLIP_ENDED on a non-final segment → SEG_LOAD(num+1) implicitly', () => {
    const start = s({ currentSegmentNum: 1, currentClipKind: 'outro', playerState: 'playing' });
    const out = reducer(start, { type: 'CLIP_ENDED', kind: 'outro' });
    expect(out.currentSegmentNum).toBe(2);
    expect(out.currentClipKind).toBe('intro');
    expect(out.upNext).toBeNull();
  });

  it('outro CLIP_ENDED on the final segment → course_complete', () => {
    const start = s({ currentSegmentNum: 22, currentClipKind: 'outro', playerState: 'playing' });
    const out = reducer(start, { type: 'CLIP_ENDED', kind: 'outro' });
    expect(out.currentSegmentNum).toBe(22);
    expect(out.playerState).toBe('course_complete');
  });

  it('SKIP_INTRO during intro → content state, no auto-advance from outro yet', () => {
    const start = s({ currentSegmentNum: 1, currentClipKind: 'intro', playerState: 'playing' });
    const out = reducer(start, { type: 'SKIP_INTRO' });
    expect(out.currentClipKind).toBe('content');
  });

  it('UP_NEXT_TICK decrements countdown', () => {
    const start = s({
      currentSegmentNum: 1, currentClipKind: 'outro', playerState: 'playing',
      upNext: { countdownSec: 3, cancelled: false },
    });
    expect(reducer(start, { type: 'UP_NEXT_TICK' }).upNext).toEqual({ countdownSec: 2, cancelled: false });
  });

  it('UP_NEXT_CANCEL sets cancelled flag', () => {
    const start = s({
      currentSegmentNum: 1, currentClipKind: 'outro',
      upNext: { countdownSec: 4, cancelled: false },
    });
    expect(reducer(start, { type: 'UP_NEXT_CANCEL' }).upNext).toEqual({ countdownSec: 4, cancelled: true });
  });

  it('GOTO jumps to arbitrary segment/clip', () => {
    const out = reducer(s({ currentSegmentNum: 1 }), { type: 'GOTO', segmentNum: 7, clipKind: 'content' });
    expect(out.currentSegmentNum).toBe(7);
    expect(out.currentClipKind).toBe('content');
    expect(out.playerState).toBe('loading');
  });

  it('SET_COUNT updates segmentCount only', () => {
    const out = reducer(s({ segmentCount: 0 }), { type: 'SET_COUNT', segmentCount: 22 });
    expect(out.segmentCount).toBe(22);
    expect(out.currentSegmentNum).toBe(1);  // unchanged
  });
});

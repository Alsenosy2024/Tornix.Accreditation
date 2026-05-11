export type ClipKind = 'intro' | 'content' | 'outro';
export type PlayerState = 'loading' | 'playing' | 'paused' | 'course_complete';

export interface UpNext {
  countdownSec: number;
  cancelled: boolean;
}

export interface State {
  segmentCount: number;
  currentSegmentNum: number;
  currentClipKind: ClipKind;
  playerState: PlayerState;
  upNext: UpNext | null;
}

export type Action =
  | { type: 'SET_COUNT'; segmentCount: number }
  | { type: 'SEG_LOAD'; segmentNum: number }
  | { type: 'CLIP_PLAYING' }
  | { type: 'CLIP_PAUSED' }
  | { type: 'CLIP_ENDED'; kind: ClipKind }
  | { type: 'SKIP_INTRO' }
  | { type: 'UP_NEXT_TICK' }
  | { type: 'UP_NEXT_CANCEL' }
  | { type: 'GOTO'; segmentNum: number; clipKind: ClipKind };

export const initialState: State = {
  segmentCount: 0,
  currentSegmentNum: 1,
  currentClipKind: 'intro',
  playerState: 'loading',
  upNext: null,
};

const UP_NEXT_SECONDS = 5;

export function reducer(state: State, action: Action): State {
  switch (action.type) {
    case 'SET_COUNT':
      return { ...state, segmentCount: action.segmentCount };

    case 'SEG_LOAD':
      return {
        ...state,
        currentSegmentNum: action.segmentNum,
        currentClipKind: 'intro',
        playerState: 'loading',
        upNext: null,
      };

    case 'CLIP_PLAYING':
      return { ...state, playerState: 'playing' };

    case 'CLIP_PAUSED':
      return { ...state, playerState: 'paused' };

    case 'CLIP_ENDED': {
      if (action.kind === 'intro') {
        return { ...state, currentClipKind: 'content', upNext: null };
      }
      if (action.kind === 'content') {
        return { ...state, currentClipKind: 'outro', upNext: { countdownSec: UP_NEXT_SECONDS, cancelled: false } };
      }
      if (state.currentSegmentNum < state.segmentCount) {
        return {
          ...state,
          currentSegmentNum: state.currentSegmentNum + 1,
          currentClipKind: 'intro',
          playerState: 'loading',
          upNext: null,
        };
      }
      return { ...state, playerState: 'course_complete' };
    }

    case 'SKIP_INTRO':
      return { ...state, currentClipKind: 'content', upNext: null };

    case 'UP_NEXT_TICK':
      if (!state.upNext) return state;
      return { ...state, upNext: { ...state.upNext, countdownSec: Math.max(0, state.upNext.countdownSec - 1) } };

    case 'UP_NEXT_CANCEL':
      if (!state.upNext) return state;
      return { ...state, upNext: { ...state.upNext, cancelled: true } };

    case 'GOTO':
      return {
        ...state,
        currentSegmentNum: action.segmentNum,
        currentClipKind: action.clipKind,
        playerState: 'loading',
        upNext: null,
      };

    default:
      return state;
  }
}

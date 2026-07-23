import { describe, it, expect } from 'vitest';
import {
  clipDurationFor, isClipComplete, completedSegments, examUnlocked, resumePoint,
} from './helpers';
import type { CourseSegment, ProgressRow } from '@/src/api';

const seg = (over: Partial<CourseSegment>): CourseSegment => ({
  id: 1, num: 1, slug: 'tcp-01',
  titleAr: '', titleEn: '', descriptionAr: null, descriptionEn: null,
  durationSec: 300, vimeo: { introId: 'i', contentId: 'c', outroId: 'o' },
  introDurationSec: 5, outroDurationSec: 5,
  nextTitleAr: null, nextTitleEn: null, quiz: [],
  ...over,
});

describe('clipDurationFor', () => {
  it('returns intro/outro duration from the segment fields', () => {
    expect(clipDurationFor(seg({ introDurationSec: 5 }), 'intro')).toBe(5);
    expect(clipDurationFor(seg({ outroDurationSec: 7 }), 'outro')).toBe(7);
  });
  it('content duration = total - intro - outro', () => {
    expect(clipDurationFor(seg({ durationSec: 300, introDurationSec: 5, outroDurationSec: 5 }), 'content')).toBe(290);
  });
});

describe('isClipComplete', () => {
  it('true when position >= 0.95 * duration', () => {
    expect(isClipComplete(95, 100)).toBe(true);
    expect(isClipComplete(94.99, 100)).toBe(false);
  });
  it('false for zero duration (avoid div-by-zero)', () => {
    expect(isClipComplete(10, 0)).toBe(false);
  });
});

describe('completedSegments', () => {
  it('counts segments where all 3 clips are completed', () => {
    const segments = [seg({ id: 1, num: 1 }), seg({ id: 2, num: 2 }), seg({ id: 3, num: 3 })];
    const progress: ProgressRow[] = [
      { segmentId: 1, clipKind: 'intro',   positionSec: 0, completedAt: 'x', updatedAt: 'x' },
      { segmentId: 1, clipKind: 'content', positionSec: 0, completedAt: 'x', updatedAt: 'x' },
      { segmentId: 1, clipKind: 'outro',   positionSec: 0, completedAt: 'x', updatedAt: 'x' },
      { segmentId: 2, clipKind: 'intro',   positionSec: 0, completedAt: 'x', updatedAt: 'x' },
      { segmentId: 2, clipKind: 'content', positionSec: 0, completedAt: null, updatedAt: 'x' },
    ];
    expect(completedSegments(segments, progress)).toBe(1);
  });
});

describe('examUnlocked', () => {
  it('unlocked when completed/total >= threshold/100', () => {
    expect(examUnlocked(18, 22, 80)).toBe(true);   // 81.8%
    expect(examUnlocked(17, 22, 80)).toBe(false);  // 77.3%
    expect(examUnlocked(0, 22, 80)).toBe(false);
  });
});

describe('resumePoint', () => {
  it('returns the most recently updated non-completed clip', () => {
    const segments = [seg({ id: 1, num: 1 }), seg({ id: 2, num: 2 })];
    const progress: ProgressRow[] = [
      { segmentId: 1, clipKind: 'content', positionSec: 50, completedAt: null, updatedAt: '2026-05-10T10:00:00Z' },
      { segmentId: 2, clipKind: 'intro',   positionSec: 2,  completedAt: null, updatedAt: '2026-05-11T10:00:00Z' },
    ];
    expect(resumePoint(segments, progress)).toEqual({ segmentNum: 2, clipKind: 'intro', positionSec: 2 });
  });
  it('returns null when no progress at all', () => {
    expect(resumePoint([seg({})], [])).toBeNull();
  });
});

import type { ClipKind, CourseSegment, ProgressRow } from '@/src/api';

export function clipDurationFor(seg: CourseSegment, kind: ClipKind): number {
  if (kind === 'intro') return seg.introDurationSec ?? 0;
  if (kind === 'outro') return seg.outroDurationSec ?? 0;
  return Math.max(0, seg.durationSec - (seg.introDurationSec ?? 0) - (seg.outroDurationSec ?? 0));
}

export function isClipComplete(positionSec: number, durationSec: number): boolean {
  if (durationSec <= 0) return false;
  return positionSec >= 0.95 * durationSec;
}

export function completedSegments(segments: CourseSegment[], progress: ProgressRow[]): number {
  const bySeg = new Map<number, Set<ClipKind>>();
  for (const p of progress) {
    if (!p.completedAt) continue;
    if (!bySeg.has(p.segmentId)) bySeg.set(p.segmentId, new Set());
    bySeg.get(p.segmentId)!.add(p.clipKind);
  }
  let count = 0;
  for (const s of segments) {
    const set = bySeg.get(s.id);
    if (set && set.has('intro') && set.has('content') && set.has('outro')) count++;
  }
  return count;
}

export function examUnlocked(completed: number, total: number, thresholdPct: number): boolean {
  if (total <= 0) return false;
  return (completed / total) * 100 >= thresholdPct;
}

export function resumePoint(
  segments: CourseSegment[],
  progress: ProgressRow[]
): { segmentNum: number; clipKind: ClipKind; positionSec: number } | null {
  if (progress.length === 0) return null;
  const segById = new Map(segments.map(s => [s.id, s.num]));
  const incomplete = progress.filter(p => !p.completedAt);
  if (incomplete.length === 0) {
    const lastCompleted = [...progress].sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))[0];
    return { segmentNum: segById.get(lastCompleted.segmentId) ?? 1, clipKind: lastCompleted.clipKind, positionSec: 0 };
  }
  const latest = incomplete.sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))[0];
  return {
    segmentNum: segById.get(latest.segmentId) ?? 1,
    clipKind: latest.clipKind,
    positionSec: latest.positionSec,
  };
}

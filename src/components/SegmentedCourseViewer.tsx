import React, { useEffect, useReducer, useState } from 'react';
import Vimeo from '@vimeo/player';
import { X, Lock, Sparkles, FileText } from 'lucide-react';
import {
  fetchSegmentedCourse, fetchMyProgress,
  type SegmentedCourse, type CourseSegment, type ProgressRow,
} from '../api';
import { reducer, initialState } from './segmentedCoursePlayer/reducer';
import { completedSegments, examUnlocked, resumePoint } from './segmentedCoursePlayer/helpers';

interface Props {
  lang: 'ar' | 'en';
  courseSlug: string;
  onClose: () => void;
  onStartExam: () => void;
}

export const SegmentedCourseViewer: React.FC<Props> = ({ lang, courseSlug, onClose, onStartExam }) => {
  const isAr = lang === 'ar';
  const [course, setCourse] = useState<SegmentedCourse | null>(null);
  const [segments, setSegments] = useState<CourseSegment[]>([]);
  const [progress, setProgress] = useState<ProgressRow[]>([]);
  const [loadErr, setLoadErr] = useState<string | null>(null);
  const [state, dispatch] = useReducer(reducer, initialState);
  const [bottomTab, setBottomTab] = useState<'overview' | 'transcript' | 'resources'>('overview');

  const introRef = React.useRef<HTMLIFrameElement | null>(null);
  const contentRef = React.useRef<HTMLIFrameElement | null>(null);
  const outroRef = React.useRef<HTMLIFrameElement | null>(null);
  const playersRef = React.useRef<{ intro?: Vimeo; content?: Vimeo; outro?: Vimeo }>({});

  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const [det, prog] = await Promise.all([
          fetchSegmentedCourse(courseSlug),
          fetchMyProgress(courseSlug).catch(() => [] as ProgressRow[]),
        ]);
        if (!alive) return;
        setCourse(det.course);
        setSegments(det.segments);
        setProgress(prog);
        dispatch({ type: 'SET_COUNT', segmentCount: det.segments.length });
        const resume = resumePoint(det.segments, prog);
        dispatch({
          type: 'GOTO',
          segmentNum: resume?.segmentNum ?? 1,
          clipKind: resume?.clipKind ?? 'intro',
        });
      } catch (e: unknown) {
        if (alive) setLoadErr((e as Error)?.message || 'load failed');
      }
    })();
    return () => { alive = false; };
  }, [courseSlug]);

  // Effect: rebuild all three players when the *segment* changes
  const currentSegId = segments[state.currentSegmentNum - 1]?.id;
  React.useEffect(() => {
    const currentSeg = segments[state.currentSegmentNum - 1];
    if (!currentSeg) return;
    const map = { intro: introRef, content: contentRef, outro: outroRef } as const;
    const ids = {
      intro: currentSeg.vimeo.introId,
      content: currentSeg.vimeo.contentId,
      outro: currentSeg.vimeo.outroId,
    };
    const players: typeof playersRef.current = {};

    for (const kind of ['intro', 'content', 'outro'] as const) {
      const iframe = map[kind].current;
      if (!iframe || !ids[kind]) continue;
      iframe.src = `https://player.vimeo.com/video/${ids[kind]}?autoplay=0&controls=1&dnt=1`;
      const p = new Vimeo(iframe);
      p.on('play',  () => dispatch({ type: 'CLIP_PLAYING' }));
      p.on('pause', () => dispatch({ type: 'CLIP_PAUSED' }));
      p.on('ended', () => dispatch({ type: 'CLIP_ENDED', kind }));
      players[kind] = p;
    }
    playersRef.current = players;

    return () => {
      (['intro', 'content', 'outro'] as const).forEach(k => players[k]?.destroy().catch(() => {}));
      playersRef.current = {};
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentSegId]);

  // Effect: when currentClipKind changes, pause the others and play the active one
  React.useEffect(() => {
    const players = playersRef.current;
    (['intro', 'content', 'outro'] as const).forEach(k => {
      const p = players[k];
      if (!p) return;
      if (k === state.currentClipKind) {
        p.play().catch(() => {/* autoplay blocked — user must click play */});
      } else {
        p.pause().catch(() => {});
      }
    });
  }, [state.currentClipKind]);

  // Tick the up-next countdown once per second while in outro and not cancelled
  React.useEffect(() => {
    if (!state.upNext || state.upNext.cancelled) return;
    if (state.upNext.countdownSec <= 0) return;
    const t = setTimeout(() => dispatch({ type: 'UP_NEXT_TICK' }), 1000);
    return () => clearTimeout(t);
  }, [state.upNext?.countdownSec, state.upNext?.cancelled]);

  // When countdown reaches 0 and not cancelled, trigger outro CLIP_ENDED so the reducer advances
  React.useEffect(() => {
    if (state.upNext?.countdownSec === 0 && !state.upNext.cancelled) {
      dispatch({ type: 'CLIP_ENDED', kind: 'outro' });
    }
  }, [state.upNext?.countdownSec, state.upNext?.cancelled]);

  if (loadErr) {
    return (
      <div className="fixed inset-0 z-50 grid place-items-center" style={{ background: 'var(--bg)' }}>
        <div className="card p-6 text-center max-w-md">
          <strong className="text-h3 block mb-2">{isAr ? 'تعذّر تحميل الكورس' : 'Failed to load course'}</strong>
          <p className="text-body-m mb-4" style={{ color: 'var(--text-muted)' }}>{loadErr}</p>
          <button className="btn btn-primary btn-md" onClick={() => location.reload()}>
            {isAr ? 'إعادة المحاولة' : 'Retry'}
          </button>
        </div>
      </div>
    );
  }

  if (!course) {
    return (
      <div className="fixed inset-0 z-50 grid place-items-center" style={{ background: 'var(--bg)' }}>
        <span className="inline-block w-5 h-5 rounded-full border-2 animate-spin" style={{ borderColor: 'var(--border-hairline)', borderTopColor: 'var(--primary)' }} />
      </div>
    );
  }

  const currentSeg: CourseSegment | undefined = segments[state.currentSegmentNum - 1];
  const completed = completedSegments(segments, progress);
  const unlocked = examUnlocked(completed, segments.length, course.unlockThresholdPct);

  return (
    <div className="fixed inset-0 z-50 overflow-y-auto" style={{ background: 'var(--bg)', direction: isAr ? 'rtl' : 'ltr' }}>
      {/* Top bar */}
      <div className="sticky top-0 z-10 px-5 md:px-8 h-16 flex items-center justify-between"
           style={{ background: 'var(--nav-bg)', borderBottom: '1px solid var(--border-hairline)' }}>
        <div className="flex items-center gap-3">
          <img src="/logo.png" alt="" className="w-7 h-7 object-contain" />
          <strong className="text-h4">{isAr ? course.titleAr : course.titleEn}</strong>
          <span className="text-caption" style={{ color: 'var(--text-muted)' }}>
            {state.currentSegmentNum} / {segments.length}
          </span>
        </div>
        <button onClick={onClose} className="btn btn-ghost btn-sm">
          <X className="w-4 h-4" />
          {isAr ? 'إغلاق' : 'Close'}
        </button>
      </div>

      <div className="p-5 md:p-8">
        <div className="max-w-6xl mx-auto flex flex-col xl:flex-row gap-6">
          {/* Center column: player + tabs */}
          <div className="flex-1 min-w-0">
            <div className="rounded-2xl overflow-hidden mb-5 aspect-video relative"
                 style={{ background: '#0F172A', border: '1px solid var(--border-hairline)' }}>
              <div className="w-full h-full relative">
                {(['intro', 'content', 'outro'] as const).map(kind => {
                  const ref = kind === 'intro' ? introRef : kind === 'content' ? contentRef : outroRef;
                  const active = state.currentClipKind === kind;
                  const vid = currentSeg?.vimeo[kind === 'intro' ? 'introId' : kind === 'content' ? 'contentId' : 'outroId'];
                  return (
                    <iframe
                      key={`${currentSeg?.id}-${kind}`}
                      ref={ref}
                      className="absolute inset-0 w-full h-full"
                      style={{ display: active ? 'block' : 'none' }}
                      allow="autoplay; fullscreen; picture-in-picture"
                      title={`${currentSeg?.slug ?? ''}-${kind}`}
                      src={vid ? undefined : 'about:blank'}
                    />
                  );
                })}
                {!currentSeg?.vimeo.contentId && (
                  <div className="absolute inset-0 grid place-items-center text-white">
                    {isAr ? 'غير متاح بعد' : 'Not available yet'}
                  </div>
                )}

                {/* Task 18 — Skip-intro overlay */}
                {state.currentClipKind === 'intro' && currentSeg?.vimeo.introId && (
                  <button
                    onClick={() => {
                      const p = playersRef.current.intro;
                      const introDur = currentSeg.introDurationSec ?? 5;
                      p?.setCurrentTime(introDur).catch(() => {});
                      dispatch({ type: 'SKIP_INTRO' });
                    }}
                    className="absolute top-3 z-10 px-3 py-1.5 rounded-full text-white text-caption font-semibold"
                    style={{ [isAr ? 'right' : 'left']: '12px', background: 'rgba(0,0,0,0.55)' }}>
                    {isAr ? 'تخطي المقدمة ›' : 'Skip intro ›'}
                  </button>
                )}

                {/* Task 19 — Up-next countdown card */}
                {state.currentClipKind === 'outro' && currentSeg && state.upNext && (
                  <div className="absolute bottom-4 z-10 max-w-[280px] p-3 rounded-xl"
                       style={{ [isAr ? 'right' : 'left']: '12px', background: 'rgba(15,23,42,0.85)', color: 'white' }}>
                    <div className="text-caption opacity-80 mb-1">
                      {isAr ? 'التالي' : 'Up next'}
                    </div>
                    <div className="text-h4 mb-2 leading-tight">
                      {isAr ? currentSeg.nextTitleAr : currentSeg.nextTitleEn}
                    </div>
                    <div className="flex items-center gap-2">
                      {!state.upNext.cancelled ? (
                        <>
                          <span
                            className="inline-block w-7 h-7 rounded-full grid place-items-center text-caption font-bold"
                            style={{
                              background: `conic-gradient(var(--primary) ${(1 - state.upNext.countdownSec / 5) * 360}deg, rgba(255,255,255,0.2) 0)`,
                            }}
                          >
                            {state.upNext.countdownSec}
                          </span>
                          <button onClick={() => dispatch({ type: 'UP_NEXT_CANCEL' })}
                                  className="text-caption underline">
                            {isAr ? 'إلغاء' : 'Cancel'}
                          </button>
                        </>
                      ) : (
                        <button onClick={() => dispatch({ type: 'CLIP_ENDED', kind: 'outro' })}
                                className="btn btn-primary btn-sm">
                          {isAr ? 'التالي ›' : 'Next ›'}
                        </button>
                      )}
                    </div>
                  </div>
                )}

                {/* Task 20 — Course-complete overlay */}
                {state.playerState === 'course_complete' && (
                  <div className="absolute inset-0 z-20 grid place-items-center" style={{ background: 'rgba(15,23,42,0.85)' }}>
                    <div className="card p-7 text-center max-w-md mx-4">
                      <Sparkles className="w-10 h-10 mx-auto mb-3" style={{ color: 'var(--primary)' }} />
                      <h3 className="text-h2 mb-2">{isAr ? 'أنهيت جميع المقاطع' : 'You finished every segment'}</h3>
                      <p className="text-body-m mb-5" style={{ color: 'var(--text-muted)' }}>
                        {isAr ? 'جاهز للاختبار النهائي وللحصول على الاعتماد.' : 'Ready for the final exam and certificate.'}
                      </p>
                      <button className="btn btn-primary btn-md w-full" onClick={onStartExam}>
                        {isAr ? 'ابدأ الاختبار النهائي' : 'Start final exam'}
                      </button>
                    </div>
                  </div>
                )}
              </div>
            </div>

            {/* Tabs */}
            <div className="flex gap-3 mb-3">
              {(['overview', 'transcript', 'resources'] as const).map(t => (
                <button key={t}
                  onClick={() => setBottomTab(t)}
                  className={`btn btn-sm ${bottomTab === t ? 'btn-primary' : 'btn-ghost'}`}>
                  {isAr
                    ? (t === 'overview' ? 'نظرة عامة' : t === 'transcript' ? 'النص الكامل' : 'الموارد')
                    : (t === 'overview' ? 'Overview' : t === 'transcript' ? 'Transcript' : 'Resources')}
                </button>
              ))}
            </div>

            <div className="card p-5">
              {bottomTab === 'overview' && currentSeg && (
                <p className="text-body-m leading-relaxed">
                  {isAr ? currentSeg.descriptionAr : currentSeg.descriptionEn}
                </p>
              )}
              {bottomTab === 'transcript' && (
                <p className="text-body-m" style={{ color: 'var(--text-muted)' }}>
                  {isAr ? 'يتم التحميل…' : 'Loading…'}
                </p>
              )}
              {bottomTab === 'resources' && (
                <p className="text-body-m" style={{ color: 'var(--text-muted)' }}>{isAr ? 'قريبًا' : 'Coming soon'}</p>
              )}
            </div>
          </div>

          {/* Right rail (RTL: left side): curriculum */}
          <aside className="xl:w-[320px] shrink-0">
            <div className="flex items-center justify-between mb-3">
              <span className="text-label flex items-center gap-2">
                <FileText className="w-4 h-4" />
                {isAr ? `المنهج (${completed}/${segments.length})` : `Curriculum (${completed}/${segments.length})`}
              </span>
            </div>
            <div className="space-y-2 mb-5">
              {segments.map(seg => {
                const segProg = progress.filter(p => p.segmentId === seg.id);
                const completedKinds = new Set(segProg.filter(p => p.completedAt).map(p => p.clipKind));
                const isActive = seg.num === state.currentSegmentNum;
                return (
                  <button key={seg.id}
                    onClick={() => dispatch({ type: 'GOTO', segmentNum: seg.num, clipKind: 'intro' })}
                    className="w-full text-start card card-tight p-3 transition-colors"
                    style={{
                      background: isActive ? 'var(--primary-wash)' : 'var(--card)',
                      borderColor: isActive ? 'var(--primary)' : 'var(--border-hairline)',
                    }}>
                    <div className="flex justify-between items-center mb-1">
                      <span className="text-h4">{seg.num}. {isAr ? seg.titleAr : seg.titleEn}</span>
                      <span className="text-caption" style={{ color: 'var(--text-muted)' }}>
                        {(['intro', 'content', 'outro'] as const).map(k => (
                          <span key={k} className="inline-block w-2 h-2 rounded-full mx-0.5"
                                style={{ background: completedKinds.has(k) ? 'var(--completed)' : 'var(--border-hairline)' }} />
                        ))}
                      </span>
                    </div>
                  </button>
                );
              })}
            </div>

            <button
              disabled={!unlocked}
              onClick={onStartExam}
              className="btn btn-primary btn-md w-full"
              title={unlocked ? '' : (isAr ? `أكمل ${Math.ceil(course.unlockThresholdPct / 100 * segments.length)} مقطعًا على الأقل لفتح الاختبار` : 'Complete more segments to unlock the exam')}>
              {unlocked ? <Sparkles className="w-4 h-4" /> : <Lock className="w-4 h-4" />}
              {isAr ? 'ابدأ الاختبار النهائي' : 'Start final exam'}
            </button>
          </aside>
        </div>
      </div>
    </div>
  );
};

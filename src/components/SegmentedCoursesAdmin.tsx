import React, { useEffect, useState } from 'react';
import { Loader2, Upload } from 'lucide-react';
import { listSegmentedCourses, fetchSegmentedCourse, upsertSegmentedCourse, type SegmentedCourse, type CourseSegment } from '../api';

interface Props { lang: 'ar' | 'en'; }

type ListRow = { id: number; slug: string; titleAr: string; titleEn: string; createdAt: string };

export const SegmentedCoursesAdmin: React.FC<Props> = ({ lang }) => {
  const isAr = lang === 'ar';
  const [view, setView] = useState<'list' | 'detail'>('list');
  const [rows, setRows] = useState<ListRow[]>([]);
  const [activeSlug, setActiveSlug] = useState<string | null>(null);
  const [course, setCourse] = useState<SegmentedCourse | null>(null);
  const [segments, setSegments] = useState<CourseSegment[]>([]);
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState('');

  useEffect(() => { listSegmentedCourses().then(setRows).catch(() => {}); }, []);
  useEffect(() => {
    if (view !== 'detail' || !activeSlug) return;
    fetchSegmentedCourse(activeSlug).then(r => { setCourse(r.course); setSegments(r.segments); }).catch(() => {});
  }, [view, activeSlug]);

  const onImport = async (file: File) => {
    const txt = await file.text();
    const m = JSON.parse(txt);
    setCourse(c => c && {
      ...c,
      titleAr: m.course.title_ar ?? c.titleAr,
      titleEn: m.course.title_en ?? c.titleEn,
      passingScorePct: m.course.passing_score_pct ?? c.passingScorePct,
      examQuestionCount: m.course.exam_question_count ?? c.examQuestionCount,
      unlockThresholdPct: m.course.unlock_threshold_pct ?? c.unlockThresholdPct,
    });
    setSegments(m.segments.map((s: any) => ({
      id: 0, num: s.num, slug: s.slug,
      titleAr: s.title_ar, titleEn: s.title_en,
      descriptionAr: s.description_ar, descriptionEn: s.description_en,
      durationSec: s.duration_sec,
      vimeo: { introId: s.vimeo?.intro_id || null, contentId: s.vimeo?.content_id || null, outroId: s.vimeo?.outro_id || null },
      introDurationSec: s.intro_duration_sec ?? null,
      outroDurationSec: s.outro_duration_sec ?? null,
      nextTitleAr: s.next_title_ar, nextTitleEn: s.next_title_en,
      quiz: s.quiz ?? [],
    })));
  };

  const onSave = async () => {
    if (!course) return;
    setBusy(true);
    setStatus(isAr ? 'جاري الحفظ…' : 'Saving…');
    try {
      await upsertSegmentedCourse({
        slug: course.slug,
        titleAr: course.titleAr, titleEn: course.titleEn,
        descriptionAr: course.descriptionAr ?? undefined,
        descriptionEn: course.descriptionEn ?? undefined,
        language: course.language,
        passingScorePct: course.passingScorePct,
        examQuestionCount: course.examQuestionCount,
        unlockThresholdPct: course.unlockThresholdPct,
        segments: segments.map(s => ({
          num: s.num, slug: s.slug,
          titleAr: s.titleAr, titleEn: s.titleEn,
          descriptionAr: s.descriptionAr, descriptionEn: s.descriptionEn,
          durationSec: s.durationSec,
          vimeo: s.vimeo,
          introDurationSec: s.introDurationSec,
          outroDurationSec: s.outroDurationSec,
          nextTitleAr: s.nextTitleAr, nextTitleEn: s.nextTitleEn,
          quiz: s.quiz,
        })),
      });
      setStatus(isAr ? 'تم الحفظ' : 'Saved');
      setTimeout(() => setStatus(''), 3000);
    } catch (e: any) {
      setStatus((isAr ? 'خطأ: ' : 'Error: ') + e.message);
    } finally {
      setBusy(false);
    }
  };

  if (view === 'list') {
    return (
      <div>
        <span className="text-label">{isAr ? 'الكورسات المُجزّأة' : 'Segmented courses'}</span>
        <h2 className="text-h2 mt-1 mb-4">{isAr ? 'الكورسات المتاحة' : 'Available courses'}</h2>
        <div className="space-y-2">
          {rows.map(r => (
            <button key={r.id}
              className="card card-tight p-4 w-full text-start flex justify-between items-center"
              onClick={() => { setActiveSlug(r.slug); setView('detail'); }}>
              <div>
                <div className="text-h4">{isAr ? r.titleAr : r.titleEn}</div>
                <div className="text-caption" style={{ color: 'var(--text-muted)' }}>/{r.slug}</div>
              </div>
              <span className="text-caption">{isAr ? 'إدارة' : 'Manage'} ›</span>
            </button>
          ))}
          {rows.length === 0 && (
            <p className="text-body-m" style={{ color: 'var(--text-muted)' }}>{isAr ? 'لا توجد كورسات بعد' : 'No segmented courses yet'}</p>
          )}
        </div>
      </div>
    );
  }

  // detail view
  return (
    <div>
      <button onClick={() => setView('list')} className="btn btn-ghost btn-sm mb-3">‹ {isAr ? 'رجوع' : 'Back'}</button>
      {!course ? <Loader2 className="w-5 h-5 animate-spin" /> : (
        <div className="space-y-4">
          <h2 className="text-h2">{isAr ? course.titleAr : course.titleEn}</h2>

          <div className="card card-tight p-4">
            <label className="block mb-3">
              <span className="text-label block mb-1">{isAr ? 'استيراد من manifest.json' : 'Import from manifest.json'}</span>
              <input type="file" accept="application/json"
                     onChange={e => { const f = e.target.files?.[0]; if (f) onImport(f); }} />
            </label>
          </div>

          <div className="card p-4">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3 mb-4">
              <label><span className="text-label block">{isAr ? 'درجة النجاح %' : 'Passing %'}</span>
                <input className="input" type="number" value={course.passingScorePct}
                       onChange={e => setCourse({ ...course, passingScorePct: Number(e.target.value) || 0 })} />
              </label>
              <label><span className="text-label block">{isAr ? 'عدد أسئلة الاختبار' : 'Exam Qs'}</span>
                <input className="input" type="number" value={course.examQuestionCount}
                       onChange={e => setCourse({ ...course, examQuestionCount: Number(e.target.value) || 0 })} />
              </label>
            </div>
            <table className="w-full text-body-m">
              <thead className="text-label">
                <tr><th>#</th><th>{isAr ? 'العنوان' : 'Title'}</th><th>intro</th><th>content</th><th>outro</th></tr>
              </thead>
              <tbody>
                {segments.map((s, i) => (
                  <tr key={s.num}>
                    <td>{s.num}</td>
                    <td>{isAr ? s.titleAr : s.titleEn}</td>
                    {(['introId','contentId','outroId'] as const).map(k => (
                      <td key={k}>
                        <input className="input" style={{ width: 130 }}
                               value={s.vimeo[k] || ''}
                               onChange={e => {
                                 const copy = [...segments];
                                 copy[i] = { ...s, vimeo: { ...s.vimeo, [k]: e.target.value } };
                                 setSegments(copy);
                               }} />
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
            <button disabled={busy} className="btn btn-primary btn-md mt-4" onClick={onSave}>
              {busy ? <Loader2 className="w-4 h-4 animate-spin" /> : <Upload className="w-4 h-4" />}
              {isAr ? 'حفظ' : 'Save'}
            </button>
            {status && <p className="text-caption mt-2">{status}</p>}
          </div>
        </div>
      )}
    </div>
  );
};

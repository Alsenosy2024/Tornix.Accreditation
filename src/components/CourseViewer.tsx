import React, { useState, useEffect, useRef } from 'react';
import { collection, getDocs, orderBy, query } from 'firebase/firestore';
import { db } from '../firebase';
import { PlayCircle, FileText, Sparkles, Loader2, X, Cpu, Zap, BarChart3, ShieldCheck, ShoppingCart, LayoutGrid, ArrowUpRight, ArrowUpLeft } from 'lucide-react';
import { GoogleGenAI } from '@google/genai';
import { motion, AnimatePresence } from 'motion/react';

const tornixHighlights = [
  {
    id: 'platform',
    icon: LayoutGrid,
    titleAr: 'المنصة المتكاملة (15 وحدة)',
    titleEn: 'Integrated Platform (15 modules)',
    descAr: 'منصة AI-Native كاملة، 12 من أصل 15 وحدة مدعومة بالذكاء الاصطناعي.',
    descEn: 'AI-native platform — 12 of 15 modules are AI-powered.',
    detailsAr: [
      'أول منصة مصمَّمة بالكامل لتكون AI-Native.',
      'تغطية لدورة حياة المشروع: التصميم → المشتريات → التنفيذ.',
      'محرّك ذكاء اصطناعي موحَّد يربط الإدارات لحظياً.',
    ],
    detailsEn: [
      'Fully AI-native by design.',
      'Full project lifecycle coverage: design → procurement → delivery.',
      'A unified AI engine that links every department in real time.',
    ],
  },
  {
    id: 'scheduling',
    icon: Zap,
    titleAr: 'الجدولة الذكية (Gantt)',
    titleEn: 'AI scheduling (Gantt)',
    descAr: 'توفير 60٪ من زمن الجدولة، مسار حرج، ومحاكاة مونتي كارلو للتنبؤ بالتأخير.',
    descEn: '60% time saved on scheduling, plus CPM and Monte Carlo forecasts.',
    detailsAr: [
      'توليد جداول معقّدة في ثوانٍ من ملفات BOQ.',
      'تحليل المسار الحرج (CPM) لرصد العوائق.',
      'محاكاة مونتي كارلو بدقّة تصل إلى 95٪.',
    ],
    detailsEn: [
      'Generate complex schedules in seconds from BOQs.',
      'Critical Path Method (CPM) to detect bottlenecks.',
      'Monte Carlo simulation with up to 95% accuracy.',
    ],
  },
  {
    id: 'cost',
    icon: BarChart3,
    titleAr: 'إدارة التكاليف و EVM',
    titleEn: 'Cost intelligence & EVM',
    descAr: 'تنبّأ بتجاوز التكاليف قبل حدوثه عبر تتبّع EVM لحظياً.',
    descEn: 'Predict cost overruns before they happen via real-time EVM.',
    detailsAr: [
      'تحليل القيمة المكتسبة لحظياً وآلياً.',
      'توقّعات للتدفّقات النقدية والتكاليف النهائية.',
      'تنبيهات مبكرة عند انحراف الميزانية.',
    ],
    detailsEn: [
      'Automated, real-time Earned Value Management.',
      'Cash flow and final-cost forecasting.',
      'Early warnings on budget deviation.',
    ],
  },
  {
    id: 'procurement',
    icon: ShoppingCart,
    titleAr: 'المشتريات واستخراج الـ BOQ',
    titleEn: 'Procurement & BOQ extraction',
    descAr: 'استخراج جداول الكمّيات بدقّة +95٪ من PDF، ومطابقة موردين آلية.',
    descEn: 'Extract BOQs with 95%+ accuracy from PDFs, plus AI vendor matching.',
    detailsAr: [
      'رؤية حاسوبية لاستخراج بيانات المخططات والجداول.',
      'مطابقة موردين على أساس الموقع والسعر والجودة.',
      'أتمتة طلبات الأسعار والمقارنة بين العروض.',
    ],
    detailsEn: [
      'Computer vision for plan and BOQ extraction.',
      'AI vendor matching by location, price, and quality.',
      'Automated RFQs and bid comparison.',
    ],
  },
  {
    id: 'agents',
    icon: ShieldCheck,
    titleAr: '٦ وكلاء ذكاء اصطناعي',
    titleEn: '6 specialized AI agents',
    descAr: 'مقدِّر تكاليف، مسؤول سلامة، مخطّط، مفتّش جودة، وأكثر — كزملاء عمل.',
    descEn: 'Cost estimator, safety officer, scheduler, QA inspector — like teammates.',
    detailsAr: [
      'وكيل السلامة: يرصد المخاطر ويقترح التخفيف.',
      'وكيل التكاليف: يحلِّل الأسعار التاريخية للسوق.',
      'وكيل الجدولة: يضبط التبعيات بدقّة هندسية.',
    ],
    detailsEn: [
      'Safety officer: monitors risk and suggests mitigations.',
      'Cost estimator: analyzes historical market prices.',
      'Scheduler: tunes dependencies with engineering precision.',
    ],
  },
  {
    id: 'strategy',
    icon: Cpu,
    titleAr: 'مركز القيادة الاستراتيجي',
    titleEn: 'Strategy hub (C-level)',
    descAr: 'يربط الاستراتيجية بـ OKRs وKPIs، ولوحات تنفيذية للقرارات.',
    descEn: 'Bridges OKRs, KPIs, and executive decision dashboards.',
    detailsAr: [
      'لوحات لحظية لصحّة المحفظة.',
      'ربط الأهداف الاستراتيجية بمهام الفريق اليومية.',
      'توصيات ذكية لتحسين الأداء العام.',
    ],
    detailsEn: [
      'Real-time portfolio health dashboards.',
      'Strategy OKRs tied to daily tasks.',
      'AI recommendations to lift overall performance.',
    ],
  },
];

interface Course {
  id: string;
  title: string;
  videoUrl: string;
  chapters: { title: string; summary: string; startTime: number; endTime: number }[];
}

interface CourseViewerProps {
  lang: 'ar' | 'en';
  onClose: () => void;
}

export const CourseViewer: React.FC<CourseViewerProps> = ({ lang, onClose }) => {
  const [courses, setCourses] = useState<Course[]>([]);
  const [activeCourse, setActiveCourse] = useState<Course | null>(null);
  const [loading, setLoading] = useState(true);
  const [isAiLoading, setIsAiLoading] = useState(false);
  const [aiResponse, setAiResponse] = useState<string | null>(null);
  const [selectedHighlight, setSelectedHighlight] = useState<typeof tornixHighlights[0] | null>(null);
  
  const videoRef = useRef<HTMLVideoElement>(null);
  const [currentTime, setCurrentTime] = useState(0);

  const getCurrentChapter = () => {
    if (!activeCourse) return null;
    return activeCourse.chapters?.find(ch => currentTime >= ch.startTime && currentTime < (ch.endTime || 99999));
  };

  const handleDeepDive = async (chapterTitle: string, chapterSummary: string) => {
    setIsAiLoading(true);
    setAiResponse(null);
    try {
        const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });
        
        const prompt = lang === 'ar' 
            ? `أنت مساعد تعليمي ذكي في منصة Tornix. بناءً على عنوان الفصل "${chapterTitle}" وملخصه "${chapterSummary}"، قدم شرحاً مفصلاً وعميقاً للمتدرب يشرح المفاهيم الأساسية، أمثلة عملية، ونصيحة ذهبية للنجاح في هذا الجزء. اجعل الرد منسقاً وسهل القراءة.`
            : `You are a smart educational assistant at Tornix Platform. Based on the chapter title "${chapterTitle}" and summary "${chapterSummary}", provide a detailed and deep explanation for the trainee. Include core concepts, practical examples, and a pro-tip for success in this module. Format the response nicely for readability.`;

        const response = await ai.models.generateContent({
            model: "gemini-3-flash-preview",
            contents: {
                parts: [{ text: prompt }]
            }
        });
        setAiResponse(response.text);
    } catch (err) {
        console.error("AI Error", err);
        setAiResponse(lang === 'ar' ? "عذراً، حدث خطأ أثناء الاتصال بالذكاء الاصطناعي." : "Sorry, an error occurred while connecting to AI.");
    } finally {
        setIsAiLoading(false);
    }
  };

  useEffect(() => {
    const fetchCourses = async () => {
      try {
        const q = query(collection(db, 'courses'), orderBy('createdAt', 'desc'));
        const snap = await getDocs(q);
        const parsed: Course[] = [];
        snap.forEach(d => parsed.push({ id: d.id, ...d.data() } as Course));
        setCourses(parsed);
        if (parsed.length > 0) setActiveCourse(parsed[0]);
      } catch (err) {
        console.error("Error fetching courses", err);
      } finally {
        setLoading(false);
      }
    };
    fetchCourses();
  }, []);

  const handleTimeUpdate = () => {
    if (videoRef.current) {
        setCurrentTime(videoRef.current.currentTime);
    }
  };

  const playChapter = (start: number) => {
    if (videoRef.current) {
        videoRef.current.currentTime = start;
        videoRef.current.play();
    }
  };

  const isAr = lang === 'ar';

  if (loading) {
    return (
      <div className="fixed inset-0 z-50 grid place-items-center" style={{ background: 'var(--bg)' }}>
        <div className="flex items-center gap-3 text-[color:var(--text-muted)] text-body-m">
          <span className="inline-block w-5 h-5 rounded-full border-2 animate-spin" style={{ borderColor: 'var(--border-hairline)', borderTopColor: 'var(--primary)' }} />
          {isAr ? 'جاري التحميل...' : 'Loading courses...'}
        </div>
      </div>
    );
  }

  return (
    <div className="fixed inset-0 z-50 overflow-y-auto" style={{ background: 'var(--bg)', direction: isAr ? 'rtl' : 'ltr' }}>
      <div
        className="sticky top-0 z-10 px-5 md:px-8 h-16 flex items-center justify-between"
        style={{ background: 'var(--nav-bg)', borderBottom: '1px solid var(--border-hairline)' }}
      >
        <div className="flex items-center gap-3">
          <img src="/logo.png" alt="" className="w-7 h-7 object-contain" />
          <span className="logo-text">{isAr ? 'مركز المعرفة' : 'Knowledge center'}</span>
        </div>
        <button onClick={onClose} className="btn btn-ghost btn-sm">
          <X className="w-4 h-4" />
          {isAr ? 'العودة' : 'Back'}
        </button>
      </div>

      <div className="p-5 md:p-10">
        {!activeCourse ? (
          <div className="max-w-5xl w-full mx-auto pb-16">
            <div className="text-center mb-12 max-w-2xl mx-auto">
              <div className="inline-flex items-center gap-2 mb-5 px-3 py-1 rounded-full" style={{ background: 'var(--primary-tint)', color: 'var(--primary-deep)' }}>
                <Sparkles className="w-3.5 h-3.5" />
                <span className="text-[0.75rem] font-semibold">{isAr ? 'مركز التعليم والتدريب' : 'Education & training'}</span>
              </div>
              <h2 className="text-display mb-3" style={{ color: 'var(--text-heading)' }}>
                {isAr ? 'اكتشف ما يجعل تورنكس ذكية' : 'What makes Tornix intelligent'}
              </h2>
              <p className="text-body-l" style={{ color: 'var(--text-dim)' }}>
                {isAr
                  ? 'محتوى تعليمي مرتّب يشرح كل ركن من أركان المنصّة.'
                  : 'A curated set of explainers covering every part of the platform.'}
              </p>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
              {tornixHighlights.map((card, idx) => {
                const Icon = card.icon;
                return (
                  <motion.button
                    key={card.id}
                    initial={{ opacity: 0, y: 8 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: idx * 0.04, duration: 0.4, ease: [0.22, 1, 0.36, 1] }}
                    onClick={() => setSelectedHighlight(card)}
                    className="card p-6 text-start transition-colors group"
                    style={{ borderRadius: 16 }}
                    onMouseEnter={(e) => { e.currentTarget.style.borderColor = 'var(--primary-tint)'; }}
                    onMouseLeave={(e) => { e.currentTarget.style.borderColor = 'var(--border-hairline)'; }}
                  >
                    <div className="w-9 h-9 rounded-full grid place-items-center mb-4" style={{ background: 'var(--primary-tint)', color: 'var(--primary-deep)' }}>
                      <Icon className="w-4 h-4" />
                    </div>
                    <h3 className="text-h4 mb-1" style={{ color: 'var(--text-heading)' }}>
                      {isAr ? card.titleAr : card.titleEn}
                    </h3>
                    <p className="text-body-m leading-relaxed mb-4" style={{ color: 'var(--text-muted)' }}>
                      {isAr ? card.descAr : card.descEn}
                    </p>
                    <span className="inline-flex items-center gap-1.5 text-[0.75rem] font-semibold" style={{ color: 'var(--primary)' }}>
                      {isAr ? 'تفاصيل أكثر' : 'See details'}
                      {isAr ? <ArrowUpLeft className="w-3.5 h-3.5" /> : <ArrowUpRight className="w-3.5 h-3.5" />}
                    </span>
                  </motion.button>
                );
              })}

              <AnimatePresence>
                {selectedHighlight && (
                  <div className="fixed inset-0 z-[60] grid place-items-center p-4">
                    <motion.div
                      initial={{ opacity: 0 }}
                      animate={{ opacity: 1 }}
                      exit={{ opacity: 0 }}
                      onClick={() => setSelectedHighlight(null)}
                      className="absolute inset-0"
                      style={{ background: 'rgba(15,23,42,0.45)' }}
                    />
                    <motion.div
                      initial={{ opacity: 0, y: 16 }}
                      animate={{ opacity: 1, y: 0 }}
                      exit={{ opacity: 0, y: 8 }}
                      transition={{ duration: 0.3, ease: [0.22, 1, 0.36, 1] }}
                      className="relative w-full max-w-xl card overflow-hidden z-10"
                      style={{ borderRadius: 20 }}
                    >
                      <button
                        onClick={() => setSelectedHighlight(null)}
                        aria-label={isAr ? 'إغلاق' : 'Close'}
                        className={`absolute top-4 ${isAr ? 'left-4' : 'right-4'} w-9 h-9 rounded-full grid place-items-center transition-colors`}
                        style={{ color: 'var(--text-muted)' }}
                        onMouseEnter={(e) => { e.currentTarget.style.background = 'var(--border-hairline)'; }}
                        onMouseLeave={(e) => { e.currentTarget.style.background = 'transparent'; }}
                      >
                        <X className="w-4 h-4" />
                      </button>
                      <div className="px-7 md:px-8 pt-9 pb-7">
                        <div className="w-12 h-12 rounded-full grid place-items-center mb-4" style={{ background: 'var(--primary-tint)', color: 'var(--primary-deep)' }}>
                          <selectedHighlight.icon className="w-5 h-5" />
                        </div>
                        <h2 className="text-h2 mb-2" style={{ color: 'var(--text-heading)' }}>
                          {isAr ? selectedHighlight.titleAr : selectedHighlight.titleEn}
                        </h2>
                        <p className="text-body-l mb-5" style={{ color: 'var(--text-dim)' }}>
                          {isAr ? selectedHighlight.descAr : selectedHighlight.descEn}
                        </p>
                        <span className="text-label">{isAr ? 'القدرات الرئيسية' : 'Key capabilities'}</span>
                        <ul className="mt-3 space-y-2.5">
                          {(isAr ? selectedHighlight.detailsAr : selectedHighlight.detailsEn).map((d, i) => (
                            <li key={i} className="flex items-start gap-3 px-3.5 py-3 rounded-xl" style={{ background: 'var(--bg-alt)', border: '1px solid var(--border-hairline)' }}>
                              <span className="mt-1.5 w-1.5 h-1.5 rounded-full shrink-0" style={{ background: 'var(--primary)' }} />
                              <p className="text-body-m leading-relaxed" style={{ color: 'var(--text-heading)' }}>{d}</p>
                            </li>
                          ))}
                        </ul>
                        <button onClick={() => setSelectedHighlight(null)} className="btn btn-primary btn-md w-full mt-7">
                          {isAr ? 'تمام، فهمت' : 'Got it'}
                        </button>
                      </div>
                    </motion.div>
                  </div>
                )}
              </AnimatePresence>
            </div>

            {/* Empty-library card */}
            <div className="card mt-10 p-8 md:p-10 text-center" style={{ borderRadius: 20 }}>
              <div className="logo-halo mx-auto w-16 h-16 grid place-items-center mb-5">
                <PlayCircle className="w-8 h-8" style={{ color: 'var(--primary)' }} />
              </div>
              <h3 className="text-h2 mb-2" style={{ color: 'var(--text-heading)' }}>
                {isAr ? 'مكتبة الفيديو قيد التجهيز' : 'Video library coming soon'}
              </h3>
              <p className="text-body-m max-w-md mx-auto leading-relaxed" style={{ color: 'var(--text-muted)' }}>
                {isAr
                  ? 'دروس عمليّة بدقّة عالية تشرح المنصّة بعمق، تحت الإنتاج الآن.'
                  : 'High-fidelity, practical lessons covering the platform in depth — in production now.'}
              </p>
              <div className="flex flex-wrap items-center justify-center gap-2 mt-5">
                <span className="badge badge-progress">{isAr ? 'في الإنتاج' : 'In production'}</span>
                <span className="badge badge-completed">{isAr ? 'قريباً' : 'Launching soon'}</span>
              </div>
            </div>
          </div>
        ) : (
          <div className="max-w-6xl w-full mx-auto flex flex-col xl:flex-row gap-6">
            <div className="flex-1">
              <h1 className="text-h2 mb-5" style={{ color: 'var(--text-heading)' }}>{activeCourse.title}</h1>
              <div className="rounded-2xl overflow-hidden mb-5 aspect-video" style={{ background: '#0F172A', border: '1px solid var(--border-hairline)' }}>
                <video
                  ref={videoRef}
                  src={activeCourse.videoUrl}
                  className="w-full h-full object-contain"
                  controls
                  onTimeUpdate={handleTimeUpdate}
                  playsInline
                  crossOrigin="anonymous"
                />
              </div>

              <div className="ai-surface-soft p-5">
                <div className="flex items-center gap-2 mb-3">
                  <Sparkles className="w-4 h-4" style={{ color: 'var(--primary)' }} />
                  <h3 className="text-h4" style={{ color: 'var(--text-heading)' }}>
                    {isAr ? 'مساعد المتدرّب الذكي' : 'AI study assistant'}
                  </h3>
                </div>
                {aiResponse ? (
                  <div className="card card-tight p-4 mb-3 relative" style={{ background: 'var(--card)' }}>
                    <button
                      onClick={() => setAiResponse(null)}
                      aria-label={isAr ? 'إخفاء الإجابة' : 'Dismiss response'}
                      className={`absolute top-2 ${isAr ? 'left-2' : 'right-2'} w-7 h-7 rounded-full grid place-items-center`}
                      style={{ color: 'var(--text-muted)' }}
                    >
                      <X className="w-3.5 h-3.5" />
                    </button>
                    <span className="text-label">{isAr ? 'تحليل ذكي' : 'Smart analysis'}</span>
                    <div className="text-body-m leading-relaxed mt-2 whitespace-pre-wrap" style={{ color: 'var(--text-heading)' }}>
                      {aiResponse}
                    </div>
                  </div>
                ) : (
                  <p className="text-body-m mb-3" style={{ color: 'var(--primary-deep)' }}>
                    {isAr
                      ? 'اضغط الزر لتلخيص الفصل الحالي أو حدِّد فصلاً من القائمة.'
                      : 'Tap to summarize the current chapter, or pick one from the list.'}
                  </p>
                )}
                <button
                  disabled={isAiLoading || !activeCourse}
                  onClick={() => {
                    const current = getCurrentChapter();
                    if (current) handleDeepDive(current.title, current.summary);
                    else if (activeCourse) handleDeepDive(activeCourse.title, isAr ? 'نظرة عامة على الكورس' : 'Course overview');
                  }}
                  className="btn btn-primary btn-md w-full"
                >
                  {isAiLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Sparkles className="w-4 h-4" />}
                  {isAr ? 'لخّص هذا الجزء' : 'Summarize this part'}
                </button>
              </div>
            </div>

            <div className="xl:w-[320px] shrink-0 flex flex-col gap-3">
              <div className="flex items-center gap-2">
                <FileText className="w-4 h-4" style={{ color: 'var(--text-muted)' }} />
                <h2 className="text-label">{isAr ? 'محتويات الكورس' : 'Course contents'}</h2>
              </div>
              <div className="space-y-2">
                {activeCourse.chapters?.map((ch, idx) => {
                  const isActive = currentTime >= ch.startTime && currentTime < (ch.endTime || 99999);
                  return (
                    <div
                      key={idx}
                      onClick={() => playChapter(ch.startTime)}
                      className="card card-tight p-4 cursor-pointer transition-colors"
                      style={{
                        background: isActive ? 'var(--primary-wash)' : 'var(--card)',
                        borderColor: isActive ? 'var(--primary)' : 'var(--border-hairline)',
                      }}
                    >
                      <div className="flex justify-between items-start gap-3 mb-1.5">
                        <h4 className="text-h4" style={{ color: isActive ? 'var(--primary-deep)' : 'var(--text-heading)' }}>
                          {idx + 1}. {ch.title}
                        </h4>
                        <span className="inline-flex items-center gap-1 text-[0.6875rem] font-medium px-2 py-0.5 rounded-full shrink-0" style={{ background: 'var(--bg-alt)', color: 'var(--text-muted)' }}>
                          <PlayCircle className="w-3 h-3" />
                          {Math.floor(ch.startTime / 60)}:{String(ch.startTime % 60).padStart(2, '0')}
                        </span>
                      </div>
                      <p className="text-body-m leading-relaxed" style={{ color: 'var(--text-muted)' }}>{ch.summary}</p>

                      {isActive && (
                        <button
                          disabled={isAiLoading}
                          onClick={(e) => {
                            e.stopPropagation();
                            handleDeepDive(ch.title, ch.summary);
                          }}
                          className="btn btn-secondary btn-sm w-full mt-3"
                        >
                          {isAiLoading ? <Loader2 className="w-3 h-3 animate-spin" /> : <Sparkles className="w-3 h-3" />}
                          {isAr ? 'اشرح لي هذا الجزء' : 'Explain this chapter'}
                        </button>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

import React, { useState, useEffect, useRef } from 'react';
import { collection, getDocs, orderBy, query } from 'firebase/firestore';
import { db } from '../firebase';
import { PlayCircle, Clock, FileText, ChevronDown, Sparkles, Loader2, MessageCircle, X, Cpu, Zap, BarChart3, ShieldCheck, ShoppingCart, LayoutGrid, Info, ArrowUpRight } from 'lucide-react';
import { GoogleGenAI } from '@google/genai';
import { motion, AnimatePresence } from 'motion/react';

const tornixHighlights = [
  {
    id: 'platform',
    icon: LayoutGrid,
    titleAr: "المنصة المتكاملة (15 وحدة)",
    titleEn: "Integrated Platform (15 Modules)",
    descAr: "تورنكس ليست مجرد أداة؛ هي أول منصة عالمية حيث الذكاء الاصطناعي هو الأساس. 12 وحدة من أصل 15 مدعومة بالذكاء الاصطناعي.",
    descEn: "Tornix isn't just a tool; it's the first global platform where AI is the core foundation. 12 out of 15 modules are AI-powered.",
    detailsAr: [
      "أول منصة مصممة بالكامل لتكون AI-Native.",
      "تغطية كاملة لدورة حياة المشروع (من التصميم للمشتريات للتنفيذ).",
      "محرك ذكاء اصطناعي موحد يربط جميع الإدارات ببعضها اللحظية."
    ],
    detailsEn: [
      "The first platform fully designed to be AI-Native.",
      "Full project lifecycle coverage (Design to Procurement to Execution).",
      "Unified AI engine linking all departments in real-time."
    ],
    gradient: "from-blue-500/20 to-cyan-500/20",
    color: "bg-blue-500"
  },
  {
    id: 'scheduling',
    icon: Zap,
    titleAr: "الجدولة الذكية (Gantt Chart)",
    titleEn: "AI Scheduling (Gantt Chart)",
    descAr: "وفر 60% من وقت الجدولة. توليد فوري للجداول، المسار الحرج (CPM)، ومحاكاة مونتي كارلو للتنبؤ بالتأخيرات.",
    descEn: "Save 60% of scheduling time. Instant schedule generation, Critical Path (CPM), and Monte Carlo simulation.",
    detailsAr: [
      "توليد جداول زمنية معقدة في ثوانٍ بناءً على ملفات الـ BOQ.",
      "تحليل المسار الحرج (CPM) لاكتشاف العوائق المستقبلية.",
      "محاكاة مونتي كارلو بنسبة دقة تصل لـ 95% لتوقع مواعيد الانتهاء."
    ],
    detailsEn: [
      "Generate complex schedules in seconds based on BOQ files.",
      "Critical Path Method (CPM) analysis to detect future bottlenecks.",
      "Monte Carlo simulation with 95% accuracy for finish date prediction."
    ],
    gradient: "from-purple-500/20 to-pink-500/20",
    color: "bg-purple-500"
  },
  {
    id: 'cost',
    icon: BarChart3,
    titleAr: "إدارة التكاليف والقيمة المكتسبة",
    titleEn: "Cost Intelligence & EVM",
    descAr: "توقع تجاوزات التكاليف قبل حدوثها. تتبع مؤشرات EVM والتحكم في الميزانية في الوقت الفعلي.",
    descEn: "Predict cost overruns before they happen. Track EVM metrics and control budgets in real-time.",
    detailsAr: [
      "تحليل القيمة المكتسبة (EVM) بشكل آلي ولحظي.",
      "تنبؤات دقيقة بالتدفقات النقدية والتكاليف النهائية.",
      "تنبيهات مبكرة عند انحراف الميزانية عن المسار المخطط."
    ],
    detailsEn: [
      "Automated real-time Earned Value Management (EVM) analysis.",
      "Precise cash flow and final cost forecasting.",
      "Early warning alerts when budget deviates from the planned path."
    ],
    gradient: "from-emerald-500/20 to-teal-500/20",
    color: "bg-emerald-500"
  },
  {
    id: 'procurement',
    icon: ShoppingCart,
    titleAr: "المشتريات واستخراج الـ BOQ",
    titleEn: "Procurement & BOQ Extraction",
    descAr: "استخراج جداول الكميات بدقة +95% من ملفات PDF. ربط تلقائي مع الموردين وأتمتة طلبات الأسعار.",
    descEn: "Extract BOQs with 95%+ accuracy from PDFs. AI vendor matching and automated RFQs.",
    detailsAr: [
      "نظام رؤية حاسوبية لاستخراج البيانات من المخططات وجداول الكميات.",
      "مطابقة الموردين بالذكاء الاصطناعي بناءً على الموقع والسعر والجودة.",
      "أتمتة كاملة لطلبات الأسعار (RFQs) والمقارنة بين العروض."
    ],
    detailsEn: [
      "Computer vision system for data extraction from plans and BOQs.",
      "AI vendor matching based on location, price, and quality.",
      "Fully automated RFQs and automated bid comparisons."
    ],
    gradient: "from-orange-500/20 to-yellow-500/20",
    color: "bg-orange-500"
  },
  {
    id: 'agents',
    icon: ShieldCheck,
    titleAr: "6 وكلاء ذكاء اصطناعي",
    titleEn: "6 Specialized AI Agents",
    descAr: "مقدر تكاليف، مسؤول سلامة، مخطط، مفتش جودة، والمزيد... يعملون بجانبك على مدار الساعة.",
    descEn: "Cost estimator, safety officer, scheduler, quality inspector, and more... working beside you 24/7.",
    detailsAr: [
      "وكيل السلامة (Safety Officer): يراقب المخاطر ويقترح خطط التخفيف.",
      "وكيل التكاليف (Cost Estimator): يحلل الأسعار التاريخية للسوق.",
      "وكيل الجدولة (Scheduler): يضبط التبعات بين المهام بدقة هندسية."
    ],
    detailsEn: [
      "Safety Officer Agent: Monitors risks and suggests mitigation plans.",
      "Cost Estimator Agent: Analyzes historical market prices.",
      "Scheduler Agent: Adjusts task dependencies with engineering precision."
    ],
    gradient: "from-red-500/20 to-rose-500/20",
    color: "bg-red-500"
  },
  {
    id: 'strategy',
    icon: Cpu,
    titleAr: "مركز القيادة (Strategy Hub)",
    titleEn: "Strategy Hub (C-Level)",
    descAr: "ربط الاستراتيجية بمؤشرات الأداء والأهداف. رؤية شاملة للمستوى التنفيذي لاتخاذ قرارات مدعومة بالبيانات.",
    descEn: "Connecting strategy to KPIs and OKRs. Full visibility for C-level executives to make data-driven decisions.",
    detailsAr: [
      "لوحات تحكم (Dashboards) لحظية تعكس صحة المحفظة بالكامل.",
      "ربط الأهداف الاستراتيجية (OKRs) بالمهام اليومية للفريق.",
      "توصيات ذكية من الـ AI Assistant لتحسين الأداء العام."
    ],
    detailsEn: [
      "Real-time dashboards reflecting the health of the entire portfolio.",
      "Linking Strategy OKRs to daily tasks of the team.",
      "Smart recommendations from the AI Assistant to improve general performance."
    ],
    gradient: "from-indigo-500/20 to-blue-500/20",
    color: "bg-indigo-500"
  }
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

  if (loading) {
     return <div className="p-8 text-center">{lang === 'ar' ? 'جاري التحميل...' : 'Loading courses...'}</div>;
  }

  return (
      <div className="fixed inset-0 z-50 bg-bg p-4 md:p-8 overflow-y-auto flex flex-col pt-20">
         <button onClick={onClose} className="absolute top-4 right-4 bg-border/50 hover:bg-border p-2 rounded-full text-text-dim transition-all z-10">
            {lang === 'ar' ? 'العودة للاختبار' : 'Back to Quiz'}
         </button>

         {!activeCourse ? (
             <div className="max-w-6xl w-full mx-auto pb-20">
                <div className="text-center mb-16">
                    <motion.div 
                        initial={{ opacity: 0, y: 20 }}
                        animate={{ opacity: 1, y: 0 }}
                        className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-primary/10 text-primary font-bold text-sm mb-6"
                    >
                        <Sparkles className="w-4 h-4" />
                        {lang === 'ar' ? 'مركز التعليم والتدريب' : 'Education & Training Center'}
                    </motion.div>
                    <h2 className="text-4xl md:text-5xl font-display font-black text-text mb-6 tracking-tight">
                        {lang === 'ar' ? 'اكتشف مستقبل البناء مع منصة Tornix' : 'Discover the Future of Construction with Tornix'}
                    </h2>
                    <p className="text-xl text-text-dim max-w-2xl mx-auto font-medium">
                        {lang === 'ar' 
                            ? 'نحن نجهز لك محتوى تعليمي فائق الجودة يشرح كل ركن في المنصة.' 
                            : 'We are preparing high-quality educational content explaining every corner of the platform.'}
                    </p>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 mb-16 relative">
                    {tornixHighlights.map((card, idx) => (
                        <motion.button
                            key={idx}
                            initial={{ opacity: 0, y: 20 }}
                            animate={{ opacity: 1, y: 0 }}
                            whileHover={{ y: -8, scale: 1.02 }}
                            transition={{ delay: idx * 0.05 }}
                            onClick={() => setSelectedHighlight(card)}
                            className="text-start bg-card/40 backdrop-blur-md border border-white/10 p-8 rounded-[2rem] group hover:border-primary/50 shadow-xl hover:shadow-primary/20 transition-all relative overflow-hidden"
                        >
                            {/* Glass background effect */}
                            <div className="absolute inset-0 bg-gradient-to-br from-white/5 to-transparent opacity-50 pointer-events-none" />
                            <div className={`absolute top-0 right-0 w-32 h-32 bg-gradient-to-br ${card.gradient} blur-3xl -mr-16 -mt-16 group-hover:scale-150 transition-transform duration-700 opacity-60`} />
                            
                            <div className={`w-14 h-14 rounded-2xl ${card.color} flex items-center justify-center text-white mb-6 shadow-lg group-hover:scale-110 transition-transform relative z-10`}>
                                <card.icon className="w-7 h-7" />
                            </div>
                            
                            <div className="relative z-10">
                                <h3 className="text-xl font-bold text-text mb-4 leading-tight group-hover:text-primary transition-colors">
                                    {lang === 'ar' ? card.titleAr : card.titleEn}
                                </h3>
                                <p className="text-text-dim text-sm leading-relaxed mb-6 line-clamp-3">
                                    {lang === 'ar' ? card.descAr : card.descEn}
                                </p>
                                
                                <div className="flex items-center justify-between mt-auto pt-6 border-t border-white/5">
                                    <span className="text-xs font-black text-primary uppercase tracking-widest">{lang === 'ar' ? 'التفاصيل والعبقرية' : 'View Core Innovation'}</span>
                                    <div className="w-8 h-8 rounded-full bg-primary/10 flex items-center justify-center group-hover:bg-primary group-hover:text-white transition-all">
                                        <ArrowUpRight className="w-4 h-4" />
                                    </div>
                                </div>
                            </div>
                        </motion.button>
                    ))}

                    <AnimatePresence>
                        {selectedHighlight && (
                            <div className="fixed inset-0 z-[60] flex items-center justify-center p-4">
                                <motion.div 
                                    initial={{ opacity: 0 }}
                                    animate={{ opacity: 1 }}
                                    exit={{ opacity: 0 }}
                                    onClick={() => setSelectedHighlight(null)}
                                    className="absolute inset-0 bg-bg/80 backdrop-blur-xl"
                                />
                                <motion.div 
                                    layoutId={`card-${selectedHighlight.id}`}
                                    className="relative w-full max-w-2xl bg-card border border-white/10 rounded-[2.5rem] shadow-2xl overflow-hidden z-10"
                                >
                                    <div className={`h-40 relative flex items-center justify-center overflow-hidden`}>
                                        <div className={`absolute inset-0 bg-gradient-to-br ${selectedHighlight.gradient} opacity-50`} />
                                        <div className="absolute inset-0 bg-indigo-900/10 pointer-events-none" />
                                        <div className={`w-24 h-24 rounded-3xl ${selectedHighlight.color} flex items-center justify-center text-white shadow-2xl relative z-10`}>
                                            <selectedHighlight.icon className="w-12 h-12" />
                                        </div>
                                        <button 
                                            onClick={() => setSelectedHighlight(null)}
                                            className="absolute top-6 right-6 p-2 bg-black/20 hover:bg-black/40 text-white rounded-full transition-all"
                                        >
                                            <X className="w-5 h-5" />
                                        </button>
                                    </div>
                                    
                                    <div className="p-10">
                                        <h2 className="text-3xl font-display font-black text-text mb-4">
                                            {lang === 'ar' ? selectedHighlight.titleAr : selectedHighlight.titleEn}
                                        </h2>
                                        <p className="text-lg text-text-dim mb-8 leading-relaxed">
                                            {lang === 'ar' ? selectedHighlight.descAr : selectedHighlight.descEn}
                                        </p>
                                        
                                        <div className="space-y-4">
                                            <h4 className="text-sm font-black text-primary uppercase tracking-[0.2em] mb-4">
                                                {lang === 'ar' ? 'المميزات الرئيسية:' : 'Key Capabilities:'}
                                            </h4>
                                            {(lang === 'ar' ? selectedHighlight.detailsAr : selectedHighlight.detailsEn).map((detail, dIdx) => (
                                                <div key={dIdx} className="flex gap-4 items-start p-4 bg-white/5 rounded-2xl border border-white/5">
                                                    <div className={`w-2 h-2 rounded-full ${selectedHighlight.color} mt-2 shrink-0 shadow-[0_0_10px_rgba(255,255,255,0.5)]`} />
                                                    <p className="text-text font-medium leading-relaxed">{detail}</p>
                                                </div>
                                            ))}
                                        </div>

                                        <button 
                                            onClick={() => setSelectedHighlight(null)}
                                            className="w-full mt-10 py-5 bg-primary text-white font-black text-lg rounded-2xl shadow-xl shadow-primary/20 hover:scale-[1.02] active:scale-[0.98] transition-all"
                                        >
                                            {lang === 'ar' ? 'فهمت، مذهل!' : 'Got it, Incredible!'}
                                        </button>
                                    </div>
                                </motion.div>
                            </div>
                        )}
                    </AnimatePresence>
                </div>

                <div className="relative rounded-[2.5rem] bg-gradient-to-br from-primary/30 via-primary/5 to-transparent p-1">
                    <div className="bg-bg/95 backdrop-blur-xl rounded-[2.4rem] p-12 text-center relative overflow-hidden">
                        <div className="absolute top-0 right-0 p-20 bg-primary/20 rounded-full blur-[100px] -mr-40 -mt-40" />
                        <div className="absolute bottom-0 left-0 p-20 bg-primary/20 rounded-full blur-[100px] -ml-40 -mb-40" />
                        
                        <div className="relative z-10">
                            <div className="w-20 h-20 bg-primary/10 rounded-full flex items-center justify-center mx-auto mb-8 animate-pulse shadow-xl shadow-primary/10">
                                <PlayCircle className="w-10 h-10 text-primary" />
                            </div>
                            <h3 className="text-3xl font-display font-black text-text mb-4 uppercase tracking-tighter">
                                {lang === 'ar' ? 'مكتبة الفيديو قيد التجهيز' : 'Direct Tutorials Coming Soon'}
                            </h3>
                            <p className="text-text-dim max-w-xl mx-auto text-lg leading-relaxed mb-8">
                                {lang === 'ar' 
                                    ? 'بدقة 4K وبشرح عملي، نقوم الآن بتسجيل مجموعة من الفيديوهات التي تخترق أسرار المنصة لتجعل منك خبيراً في Tornix خلال دقائق.' 
                                    : 'Recording 4K practical tutorials that dive deep into platform secrets, turning you into a Tornix expert in minutes.'}
                            </p>
                            <div className="flex flex-col sm:flex-row items-center justify-center gap-4">
                                <div className="px-6 py-3 bg-white/5 border border-white/10 rounded-xl text-xs font-black text-text-dim uppercase tracking-[0.2em]">
                                    {lang === 'ar' ? 'الحالة: في مرحلة الإنتاج' : 'Status: In Production'}
                                </div>
                                <div className="px-6 py-3 bg-primary/20 border border-primary/30 rounded-xl text-xs font-black text-primary uppercase tracking-[0.2em] animate-pulse">
                                    {lang === 'ar' ? 'قريباً جداً' : 'Launching Very Soon'}
                                </div>
                            </div>
                        </div>
                    </div>
                </div>
             </div>
         ) : (
             <div className="max-w-6xl w-full mx-auto flex flex-col xl:flex-row gap-8">
                 {/* Video Player Side */}
                 <div className="flex-1">
                     <h1 className="text-3xl font-display font-medium text-text mb-6">{activeCourse.title}</h1>
                     <div className="rounded-2xl overflow-hidden bg-black shadow-lg border border-border aspect-video mb-6">
                         <video 
                            ref={videoRef}
                            src={activeCourse.videoUrl} 
                            className="w-full h-full object-contain bg-black"
                            controls
                            onTimeUpdate={handleTimeUpdate}
                            playsInline
                            crossOrigin="anonymous"
                         />
                     </div>
                     <div className="bg-bg border border-border rounded-xl p-6">
                         <div className="flex items-center gap-3 mb-4 text-primary">
                             <Sparkles className="w-5 h-5" />
                             <h3 className="font-bold text-lg">{lang === 'ar' ? 'أدوات الذكاء الاصطناعي للمتدرب' : 'AI Assistant for Trainee'}</h3>
                         </div>
                         
                         {aiResponse ? (
                             <div className="mb-6 animate-in fade-in slide-in-from-top-4 duration-500">
                                 <div className="bg-primary/5 border border-primary/20 rounded-xl p-5 relative">
                                     <button 
                                         onClick={() => setAiResponse(null)}
                                         className="absolute top-3 right-3 text-primary/60 hover:text-primary"
                                     >
                                         <X className="w-4 h-4" />
                                     </button>
                                     <div className="flex items-center gap-2 mb-3 text-primary font-bold">
                                         <Sparkles className="w-4 h-4" />
                                         {lang === 'ar' ? 'نتيجة التحليل الذكي' : 'Smart Analysis Result'}
                                     </div>
                                     <div className="text-text text-sm leading-relaxed whitespace-pre-wrap">
                                         {aiResponse}
                                     </div>
                                 </div>
                             </div>
                         ) : (
                             <p className="text-text-dim mb-4">
                                {lang === 'ar' ? 'اطلب مساعدة من الذكاء الاصطناعي لفهم أي جزء من هذا الفيديو. قم بتحديد الجزء المطلوب من القائمة ليتم تلخيصه.' : 'Ask the AI to help you understand any part of this video. Select a chapter to summarize it automatically.'}
                             </p>
                         )}

                         <button 
                            disabled={isAiLoading || !activeCourse}
                            onClick={() => {
                                const current = getCurrentChapter();
                                if (current) handleDeepDive(current.title, current.summary);
                                else if (activeCourse) handleDeepDive(activeCourse.title, "نظرة عامة على الكورس");
                            }}
                            className="btn-glass px-4 py-3 rounded-xl font-bold flex items-center justify-center gap-2 w-full transition-all disabled:opacity-50"
                         >
                             {isAiLoading ? <Loader2 className="w-5 h-5 animate-spin" /> : <Sparkles className="w-4 h-4" />} 
                             {lang === 'ar' ? 'لخص الفكرة الرئيسية للجزء الحالي' : 'Summarize the main idea of the current part'}
                         </button>
                     </div>
                 </div>

                 {/* Chapters Sidebar */}
                 <div className="xl:w-1/3 flex flex-col gap-4">
                     <h2 className="text-xl font-bold flex items-center gap-2 text-text mb-2">
                        <FileText className="w-5 h-5" />
                        {lang === 'ar' ? 'محتويات الكورس' : 'Course Contents'}
                     </h2>
                     <div className="space-y-3">
                         {activeCourse.chapters?.map((ch, idx) => {
                             const isActive = currentTime >= ch.startTime && currentTime < (ch.endTime || 99999);
                             return (
                                 <div 
                                    key={idx} 
                                    onClick={() => playChapter(ch.startTime)}
                                    className={`p-4 rounded-xl border cursor-pointer transition-all duration-300 ${isActive ? 'bg-primary/5 border-primary shadow-sm scale-[1.01]' : 'bg-bg border-border hover:border-text/30'}`}
                                 >
                                     <div className="flex justify-between items-start mb-2">
                                         <h4 className={`font-bold ${isActive ? 'text-primary' : 'text-text'}`}>{idx + 1}. {ch.title}</h4>
                                         <div className="flex items-center gap-1 text-xs text-text-dim bg-border/50 px-2 py-1 rounded">
                                            <PlayCircle className="w-3 h-3" />
                                            <span>{Math.floor(ch.startTime / 60)}:{String(ch.startTime % 60).padStart(2, '0')}</span>
                                         </div>
                                     </div>
                                     <p className="text-sm text-text-dim leading-relaxed">{ch.summary}</p>
                                     
                                     {isActive && (
                                         <div className="mt-4 pt-4 border-t border-primary/20 space-y-2">
                                             <div className="text-xs font-bold text-primary mb-2 flex items-center gap-1">
                                                 <Sparkles className="w-3 h-3" /> {lang === 'ar' ? 'فهم أعمق (AI)' : 'Deep Dive (AI)'}
                                             </div>
                                             <button 
                                                disabled={isAiLoading}
                                                onClick={(e) => {
                                                    e.stopPropagation();
                                                    handleDeepDive(ch.title, ch.summary);
                                                }}
                                                className="w-full text-left text-xs bg-bg border border-border hover:border-primary/50 p-2 rounded text-text transition-all flex items-center gap-2"
                                             >
                                                 {isAiLoading ? <Loader2 className="w-3 h-3 animate-spin" /> : <span>💡</span>}
                                                 {lang === 'ar' ? 'اشرح لي هذا الجزء بالتفصيل' : 'Explain this part in detail'}
                                             </button>
                                         </div>
                                     )}
                                 </div>
                             )
                         })}
                     </div>
                 </div>
             </div>
         )}
      </div>
  );
};

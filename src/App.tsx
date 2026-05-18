import React, { useState, useEffect, useRef, useCallback } from 'react';
import { AdminPanel } from './components/AdminPanel';
import { CourseViewer } from './components/CourseViewer';
import { SegmentedCourseViewer } from './components/SegmentedCourseViewer';
import { Onboarding } from './components/Onboarding';
import { ThemeToggle } from './components/ThemeToggle';
import {
  Play,
  CheckCircle,
  Target,
  Map,
  ChevronRight,
  AlertTriangle,
  User,
  ShieldCheck,
  Download,
  Camera,
  Clock,
  Mail,
  CheckSquare,
  Settings,
  Cpu,
  GraduationCap,
  Globe,
  ExternalLink,
  Sparkles,
  Award,
  Info,
  BookOpen,
  PlayCircle,
  RefreshCcw,
  XCircle,
  Loader2,
  ArrowRight,
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import confetti from 'canvas-confetti';
import { generateQuizQuestions, GeneratedQuestion } from './services/geminiService';
import { fetchBranding, submitAssessment, loginWithGoogle, logout, fetchCertStatus, waitForCertificate, type CertStatus } from './api';
import { useSession } from './useSession';
import { 
  Radar, 
  RadarChart, 
  PolarGrid, 
  PolarAngleAxis, 
  PolarRadiusAxis, 
  ResponsiveContainer,
  AreaChart,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Line
} from 'recharts';
import emailjs from '@emailjs/browser';

import { GoogleGenAI } from '@google/genai';

// --- Types ---
interface Question {
  id: number;
  type: 'multiple-choice' | 'scenario' | 'evm' | 'visual' | 'management';
  category: string;
  question: string;
  options: string[];
  correctAnswer: number;
  explanation: string;
  visualData?: any;
}

interface UserAnswer {
  questionId: number;
  selectedOption: number;
  isCorrect: boolean;
  timeSpent: number;
  category: string;
}

// --- Dynamic Bank (20 Deep Questions: 25% Theory, 75% Tornix Scenarios) ---
const FULL_BANK: Question[] = [
  // --- Category: PM Theory (5 Questions - 25%) ---
  {
    id: 1,
    type: 'multiple-choice',
    category: 'Global PM Standards',
    question: "إلى أي مدى تؤثر مرحلة 'التخطيط' على المسار الحرج للمشروع، وما هو الإجراء الأهم عند اكتشاف تعارض في المخطط الزمني؟",
    options: ["تجاهل التعارض والتركيز على التنفيذ", "تحليل المسار الحرج (Critical Path) وتقييم أثر الأنشطة المتداخلة", "إلغاء المشروع فوراً", "تغيير مدير المشروع"],
    correctAnswer: 1,
    explanation: "تحليل المسار الحرج هو العصب الأساسي في تخطيط الجدولة الزمنية لضمان عدم تأخر التسليم النهائي."
  },
  {
    id: 2,
    type: 'scenario',
    category: 'Global PM Standards',
    question: "عند ظهور خطر مفاجئ ذو أثر تدميري ولكن احتمالية حدوثه منخفضة، أي استراتيجية رد فعل تعتبر الأمثل في المعايير العالمية؟",
    options: [
      "تجاهل الخطر تماماً",
      "نقل الخطر (Transfer) عبر التأمين أو طرف ثالث",
      "إيقاف كافة أعمال الموقع",
      "القبول السلبي والانتظار"
    ],
    correctAnswer: 1,
    explanation: "نقل الخطر هو استراتيجية فعالة للمخاطر التي لا يمكن للمؤسسة تحمل أثرها المالي أو التشغيلي."
  },
  {
    id: 3,
    type: 'multiple-choice',
    category: 'Global PM Standards',
    question: "ما هو الهدف الجوهري من 'Daily Sync' أو الاجتماع اليومي في بيئات العمل الرشيقة؟",
    options: ["توبيخ الموظفين المتأخرين", "تحديد معوقات العمل (Roadblocks) وضمان اتساق الفريق", "تقديم تقارير مالية مفصلة", "إعادة بناء العقد بالكامل"],
    correctAnswer: 1,
    explanation: "الاجتماع اليومي يركز على التدفق والمزامنة وليس على التقارير الرسمية الطويلة."
  },
  {
    id: 4,
    type: 'scenario',
    category: 'Global PM Standards',
    question: "ظهر أن نطاق المشروع (Scope) بدأ يتوسع بطلبات جانبية صغيرة من العميل دون ميزانية إضافية. كيف تعالج هذا الموقف؟",
    options: [
      "الموافقة لإرضاء العميل",
      "تفعيل إجراءات طلب التغيير (Change Request) وتقييم الأثر",
      "رفض التحدث مع العميل",
      "العمل لساعات إضافية مجانية"
    ],
    correctAnswer: 1,
    explanation: "إدارة نطاق العمل تتطلب توثيقاً رسمياً لأي تعديل لتجنب استنزاف الموارد."
  },
  {
    id: 5,
    type: 'multiple-choice',
    category: 'Global PM Standards',
    question: "في مصفوفة RACI، ما الفرق بين الـ Responsible والـ Accountable؟",
    options: ["لا يوجد فرق بينهما", "الـ Accountable هو الذي يوقع على القرار النهائي ويتحمل المساءلة، بينما الـ Responsible هو المنفذ الفعلي", "الـ Responsible هو المدير دائماً", "الـ Accountable شخص لا علاقة له بالعمل"],
    correctAnswer: 1,
    explanation: "المساءلة (Accountability) تكون لشخص واحد فقط لضمان الحوكمة، بينما التنفيذ (Responsibility) يمكن أن يوزع."
  },

  // --- Category: Tornix Core (15 Questions - 75%) - Derived from Video Content ---
  {
    id: 6,
    type: 'scenario',
    category: 'Tornix Intelligence',
    question: "بناءً على وثائق منصة تورنكس (Tornix)، كم عدد الوكلاء الذكيين (AI Agents) المدمجين في المنصة لخدمة المهام المختلفة؟",
    options: [
      "وكيل واحد فقط",
      "6 وكلاء ذكاء اصطناعي (مثل Cost Estimator, Safety Officer)",
      "10 وكلاء",
      "المنصة لا تستخدم الوكلاء المستقلين"
    ],
    correctAnswer: 1,
    explanation: "تعتمد تورنكس على 6 وكلاء متخصصين متعددي المهام كجزء أساسي من محركها المبني على الذكاء الاصطناعي."
  },
  {
    id: 7,
    type: 'management',
    category: 'Tornix Flows',
    question: "تشير البيانات الرسمية لمنصة Tornix إلى قدرتها على استخراج الكميات (BOQ) بدقة عالية. ما هي نسبة الدقة التي تدعمها المنصة؟",
    options: [
      "دقة تتراوح بين 50% - 60%",
      "دقة استخراج تتجاوز 95% بدعم مزدوج (عربي/إنجليزي)",
      "دقة 100% بدون أي حاجة للتدقيق",
      "لا تدعم استخراج الكميات"
    ],
    correctAnswer: 1,
    explanation: "ميزة استخراج الـ BOQ تعتمد على محركات الـ AI للوصول إلى دقة تزيد عن 95% دعماً للغتين."
  },
  {
    id: 8,
    type: 'visual',
    category: 'Tornix GIS',
    question: "في شاشة الـ GIS داخل فيديو تورنكس، ما الذي يظهره 'التحليل المكاني لجريان المياه' (Spatial Flood Analysis)؟",
    options: [
      "كمية استهلاك الموظفين للمياه",
      "توقع حركة السيول والمناطق المهددة داخل نطاق المشروع عبر خريطة حرارية",
      "تحديد أماكن خزانات المياه الأرضية فقط",
      "رسم حدود الغرف داخل المشروع"
    ],
    correctAnswer: 1,
    explanation: "التكامل المكاني في تورنكس يسمح للمديرين بالتنبؤ بالمخاطر الطبيعية وتجنب الكوارث الميدانية."
  },
  {
    id: 9,
    type: 'scenario',
    category: 'Tornix Execution',
    question: "كيف يتم التحقق من الانجاز الميداني لإصدار المستخلصات المالية في تورنكس؟",
    options: [
      "بناءً على كلام المقاول فقط",
      "عن طريق ربط الوثائق المرفوعة (Nodes) بصور الموقع الموثقة جغرافياً (Geo-tagged photos)",
      "عن طريق قرعة عشوائية",
      "بالانتظار حتى نهاية العام المالي"
    ],
    correctAnswer: 1,
    explanation: "تورنكس يربط بين البيانات المالية والواقع الجغرافي لضمان دقة الصرف والشفافية."
  },
  {
    id: 10,
    type: 'multiple-choice',
    category: 'Tornix PMO',
    question: "في مركز قيادة الاستراتيجية (Strategy Hub) لـ Tornix، ما هي العناصر الأربعة الرئيسية التي تربطها لوحة التحكم؟",
    options: [
      "بطاقة الأداء المتوازن (BSC)، OKRs، مؤشرات الأداء (KPIs)، والتوصيات الذكية (AI Recommendations)",
      "المستندات، المهام، البريد، والتقويم",
      "الخرائط الجغرافية 2D فقط",
      "الاستيراد والتصدير لملفات P6"
    ],
    correctAnswer: 0,
    explanation: "مركز الاستراتيجية يعتبر نقطة الترابط بين أهداف المنظمة التشغيلية وتوصيات الذكاء الاصطناعي."
  },
  {
    id: 11,
    type: 'scenario',
    category: 'Tornix Intelligence',
    question: "ظهر في الفيديو محرك 'Sentiment Analysis' في شاشة المحادثات والاجتماعات. ما فائدته لمدير المشروع؟",
    options: [
      "معرفة ألوان ملابس المشاركين",
      "كشف نبرة التوتر أو الرضا في الفريق والموردين للتنبؤ بنزاعات محتملة",
      "تغيير خلفية الشاشة تلقائياً",
      "حساب عدد الكلمات في الاجتماع"
    ],
    correctAnswer: 1,
    explanation: "تحليل المشاعر يوفر بعداً بشرياً رقمياً يساعد في إدارة العلاقات وحل المشكلات قبل تفاقمها."
  },
  {
    id: 12,
    type: 'management',
    category: 'Tornix Hub',
    question: "ما هي الميزة التي تسمح لـ Tornix بالتعامل مع المشاريع العملاقة (مثل 20 ألف نشاط)؟",
    options: [
      "تقسيم المهام على ملفات Word",
      "الاستيراد المباشر لملفات Primavera (XER) ومعالجتها بمحرك Gantt فائق السرعة",
      "حذف نصف الأنشطة تلقائياً",
      "المنصة لا تدعم أكثر من 100 نشاط"
    ],
    correctAnswer: 1,
    explanation: "تورنكس يمتلك محركاً قوياً يتكامل مع P6 لدعم أضخم مشاريع البنية التحتية."
  },
  {
    id: 13,
    type: 'scenario',
    category: 'Tornix Flows',
    question: "ما هي المراحل الثلاث الأساسية لتدفق المشتريات (Procurement Flow) التي ظهرت في رسم الـ Workflow؟",
    options: [
      "PR -> Approvals -> PO",
      "Call -> Meeting -> Email",
      "Login -> Logout -> Delete",
      "Buy -> Sell -> Return"
    ],
    correctAnswer: 0,
    explanation: "يبدأ المسار بطلب الشراء (PR) ثم المرور بالاعتمادات (Approvals) وينتهي بأمر الشراء (PO)."
  },
  {
    id: 14,
    type: 'management',
    category: 'Tornix Intel',
    question: "قامت منصة تورنكس بتقليل تأخيرات المشاريع بنسبة تصل إلى 40%. ما هي التقنيات الأساسية التي تعتمد عليها لتحقيق ذلك؟",
    options: [
      "التخلي عن التخطيط والبدء الفوري",
      "محاكاة مونت كارلو (Monte Carlo) وجدولة الذكاء الاصطناعي لتوقع ومنع الاختناقات الزمنية",
      "إجبار الفريق على العمل نهاية الأسبوع",
      "تعديل العقد لزيادة المدة الزمنية"
    ],
    correctAnswer: 1,
    explanation: "التنبؤ المبكر بالاختناقات عبر نماذج احصائية يحد من تأخير المشاريع بشكل جوهري."
  },
  {
    id: 15,
    type: 'visual',
    category: 'Tornix Intelligence',
    question: "كيف يتم تلخيص الاجتماعات المسجلة داخل Tornix؟",
    options: [
      "يجب على المدير كتابة التلخيص يدوياً",
      "يقوم الوكيل الذكي (AI Agent) بتوليد محضر اجتماع (Meeting Minutes) آلياً يتضمن القرارات والمهام",
      "يتم إرسال الفيديو بالبريد فقط",
      "يتم حذف الاجتماع بعد تسجيله"
    ],
    correctAnswer: 1,
    explanation: "التلخيص الآلي يضمن توثيق كافة القرارات وربطها بمهام قابلة للتنفيذ فوراً."
  },
  {
    id: 16,
    type: 'scenario',
    category: 'Tornix Execution',
    question: "لدى الموظف الذي ترك المشروع 'Nodes' ومهام عالقة. كيف يعالج تورنكس موازنة الموارد؟",
    options: [
      "تضيع المهام للأبد",
      "عبر ميزة الـ 'Dynamic Handover' التي تنقل كافة المسؤوليات للموظف البديل مع الحفاظ على الأرشيف",
      "يجب إعادة إدخال المهام يدوياً",
      "تجميد المشروع بالكامل"
    ],
    correctAnswer: 1,
    explanation: "تورنكس يضمن استمرارية الأعمال (Business Continuity) عبر إدارة انتقال الصلاحيات والمهام."
  },
  {
    id: 17,
    type: 'management',
    category: 'Tornix Strategy',
    question: "ما هي الركائز الأربع التي يعتمد عليها 'مؤشر صحة المشروع' (Project Health Score) في تورنكس؟",
    options: [
      "الميزانية، الوقت، الجودة، والمخاطر",
      "الاسم، التاريخ، النوع، والموقع",
      "الصوت، الصورة، الفيديو، والنص",
      "الطقس، المسافة، السرعة، والوزن"
    ],
    correctAnswer: 0,
    explanation: "يتم احتساب درجة الصحة عبر تحليل البيانات الحقيقية للجدول والماليات وقوة الحوكمة في المخاطر."
  },
  {
    id: 18,
    type: 'visual',
    category: 'Tornix GIS',
    question: "ما معنى الربط بملفات الـ CAD داخل منصة تورنكس؟",
    options: [
      "تحويل المخططات الهندسية لصور فقط",
      "إمكانية فتح واستعراض ملفات (DXF/DWG) مباشرة داخل المنصة وربطها بالمهام المكانية",
      "تعديل الألوان في ملفات Excel",
      "لا تدعم المنصة ملفات CAD"
    ],
    correctAnswer: 1,
    explanation: "تورنكس يدمج التصميم الهندسي مع الإدارة التشغيلية لتقليل الفجوة بين المكتب والميدان."
  },
  {
    id: 19,
    type: 'scenario',
    category: 'Tornix Intelligence',
    question: "في الفيديو، ظهر وكيل 'Weekly Risk Reporter'. ما هو دوره الأبرز؟",
    options: [
      "إصدار تقرير أسبوعي بالمخاطر الحرجة التي تتجاوز مستوى تسامح المحدد",
      "إرسال رسائل تهنئة للموظفين",
      "تحديد أسعار الوجبات في الكافتيريا",
      "لا يوجد تقارير أسبوعية للمخاطر"
    ],
    correctAnswer: 0,
    explanation: "التقارير الاستباقية تساعد في اتخاذ قرارات تصحيحية قبل تحول الخطر إلى مشكلة واقعية."
  },
  {
    id: 20,
    type: 'multiple-choice',
    category: 'Tornix Hub',
    question: "أين تذهب كافة المستندات والوثائق التي يتم تداولها في المحادثات أو البريد داخل تورنكس؟",
    options: [
      "تختفي بعد أسبوع",
      "يتم أرشفتها تلقائياً في مدير المستندات المركزي (DMS) وربطها بالمشروع المعني",
      "يجب تحميلها على جهاز الشخص فقط",
      "تخزن في ملف واحد غير منظم"
    ],
    correctAnswer: 1,
    explanation: "تورنكس يضمن 'الحقيقة الواحدة' (Single Source of Truth) عبر تنظيم البيانات وترابطها."
  }
];

// --- Sub-components for Visual Questions ---

const EVMChart = () => {
  const data = [
    { name: 'Jan', PV: 200, EV: 150, AC: 250 },
    { name: 'Feb', PV: 400, EV: 300, AC: 450 },
    { name: 'Mar', PV: 600, EV: 450, AC: 700 },
    { name: 'Apr', PV: 800, EV: 600, AC: 950 },
  ];
  return (
    <div className="h-60 w-full surface-soft rounded-2xl p-5 mt-4 relative overflow-hidden">
      <div className="flex items-center justify-between mb-2">
        <span className="text-label">Earned Value Engine</span>
        <div className="flex items-center gap-3 text-[0.6875rem] text-[color:var(--text-muted)]">
          <span className="inline-flex items-center gap-1.5"><span className="w-2 h-2 rounded-full" style={{ background: '#3F73C3' }} /> Planned</span>
          <span className="inline-flex items-center gap-1.5"><span className="w-2 h-2 rounded-full" style={{ background: '#2BA86A' }} /> Earned</span>
          <span className="inline-flex items-center gap-1.5"><span className="w-2 h-2 rounded-full" style={{ background: '#E11D48' }} /> Actual</span>
        </div>
      </div>
      <ResponsiveContainer width="100%" height="85%">
        <AreaChart data={data} margin={{ top: 6, right: 6, left: -22, bottom: 0 }}>
          <defs>
            <linearGradient id="colorPV" x1="0" y1="0" x2="0" y2="1"><stop offset="5%" stopColor="#3F73C3" stopOpacity={0.18}/><stop offset="95%" stopColor="#3F73C3" stopOpacity={0}/></linearGradient>
            <linearGradient id="colorEV" x1="0" y1="0" x2="0" y2="1"><stop offset="5%" stopColor="#2BA86A" stopOpacity={0.18}/><stop offset="95%" stopColor="#2BA86A" stopOpacity={0}/></linearGradient>
          </defs>
          <CartesianGrid strokeDasharray="2 4" stroke="var(--border-hairline)" vertical={false} />
          <XAxis dataKey="name" stroke="var(--text-muted)" fontSize={11} tickLine={false} axisLine={false} />
          <YAxis stroke="var(--text-muted)" fontSize={11} tickLine={false} axisLine={false} />
          <Tooltip
            contentStyle={{ backgroundColor: 'var(--card)', border: '1px solid var(--border-hairline)', borderRadius: 12, fontSize: 12, color: 'var(--text)', boxShadow: '0 4px 16px rgba(15,23,42,0.06)' }}
            cursor={{ stroke: 'var(--border)', strokeWidth: 1, strokeDasharray: '3 3' }}
          />
          <Area type="monotone" dataKey="PV" name="Planned" stroke="#3F73C3" strokeWidth={2} fillOpacity={1} fill="url(#colorPV)" />
          <Area type="monotone" dataKey="EV" name="Earned"  stroke="#2BA86A" strokeWidth={2} fillOpacity={1} fill="url(#colorEV)" />
          <Line type="monotone" dataKey="AC" name="Actual"  stroke="#E11D48" strokeWidth={2} dot={{ r: 3, strokeWidth: 2, fill: 'var(--card)' }} activeDot={{ r: 5 }} />
        </AreaChart>
      </ResponsiveContainer>
    </div>
  );
};

const GISVisual = () => (
  <div className="w-full h-60 rounded-2xl surface-soft overflow-hidden relative mt-4">
    <div className="absolute inset-0 opacity-[0.08]" style={{ backgroundImage: 'radial-gradient(rgba(124,66,198,0.7) 1px, transparent 1px)', backgroundSize: '20px 20px' }} />
    <div className="absolute top-4 left-4 z-10 inline-flex items-center gap-2 px-3 py-1 rounded-full bg-[color:var(--card)] border border-[color:var(--border-hairline)]">
      <Map className="w-3.5 h-3.5 text-[color:var(--primary)]" />
      <span className="text-[0.6875rem] font-semibold tracking-tight text-[color:var(--text-heading)]">Spatial Flood Analysis</span>
    </div>
    <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
      <div className="relative w-full h-full max-w-sm mx-auto">
        <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-48 h-48 rounded-full" style={{ background: 'rgba(43,168,106,0.12)', filter: 'blur(40px)' }} />
        <div className="absolute top-1/3 left-1/4 w-32 h-32 rounded-full" style={{ background: 'rgba(217,119,6,0.16)', filter: 'blur(28px)' }} />
        <div className="absolute bottom-1/4 right-1/4 w-40 h-40 rounded-full" style={{ background: 'rgba(225,29,72,0.14)', filter: 'blur(28px)' }} />

        {[...Array(5)].map((_, i) => (
          <motion.div
            key={i}
            className="absolute w-2.5 h-2.5 rounded-full"
            style={{ top: `${22 + (i*15)%60}%`, left: `${18 + (i*32)%70}%`, background: 'var(--primary)', boxShadow: '0 0 0 3px rgba(255,255,255,0.85)' }}
            animate={{ y: [0, -4, 0], opacity: [0.6, 1, 0.6] }}
            transition={{ repeat: Infinity, duration: 2.4 + i*0.2, ease: 'easeInOut' }}
          />
        ))}
        <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-28 h-28 rounded-full border" style={{ borderColor: 'rgba(124,66,198,0.35)' }} />
        <Map className="w-9 h-9 absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2" style={{ color: 'var(--primary)' }} />
      </div>
    </div>
  </div>
);

const StrategyVisual = () => (
  <div className="w-full grid grid-cols-2 md:grid-cols-4 gap-3 h-auto mt-4">
    {[
      { title: 'Time',    val: 85, fill: '#3F73C3' },
      { title: 'Cost',    val: 92, fill: '#2BA86A' },
      { title: 'Quality', val: 78, fill: '#D97706' },
      { title: 'Risk',    val: 95, fill: '#7D42C6' },
    ].map((item, idx) => (
      <div key={idx} className="card card-tight px-4 py-5 flex flex-col gap-3">
        <div className="flex items-baseline justify-between">
          <span className="text-label">{item.title}</span>
          <span className="text-[1.375rem] font-bold tracking-tight" style={{ color: 'var(--text-heading)' }}>{item.val}<span className="text-[0.875rem] font-semibold text-[color:var(--text-muted)]">%</span></span>
        </div>
        <div className="w-full h-[3px] rounded-full overflow-hidden" style={{ background: 'var(--border-hairline)' }}>
          <motion.div
            initial={{ width: 0 }}
            animate={{ width: `${item.val}%` }}
            transition={{ duration: 0.9, delay: idx * 0.08, ease: [0.22, 1, 0.36, 1] }}
            className="h-full rounded-full"
            style={{ background: item.fill }}
          />
        </div>
      </div>
    ))}
  </div>
);

export const useBranding = () => {
  const [logo, setLogo] = useState(localStorage.getItem('admin_logo') || "/tornix_logo.png");
  const [badge, setBadge] = useState(localStorage.getItem('admin_badge') || "/tcp_badge.png");
  const [certBg, setCertBg] = useState<string | null>(localStorage.getItem('admin_cert_bg'));
  const [nameY, setNameY] = useState(Number(localStorage.getItem('admin_cert_name_y') || 37));
  const [serialY, setSerialY] = useState(Number(localStorage.getItem('admin_cert_serial_y') || 96));
  
  const [fontFamily, setFontFamily] = useState(localStorage.getItem('admin_cert_font') || "font-montserrat");
  const [nameColor, setNameColor] = useState(localStorage.getItem('admin_cert_name_color') || "#0f172a");
  const [serialColor, setSerialColor] = useState(localStorage.getItem('admin_cert_serial_color') || "#1e293b");
  const [serialFontSize, setSerialFontSize] = useState(Number(localStorage.getItem('admin_cert_serial_size') || 20));

  useEffect(() => {
    // Listen to local storage events (for immediate UI updates)
    const updater = () => {
      setLogo(localStorage.getItem('admin_logo') || "/tornix_logo.png");
      setBadge(localStorage.getItem('admin_badge') || "/tcp_badge.png");
      setCertBg(localStorage.getItem('admin_cert_bg'));
      setNameY(Number(localStorage.getItem('admin_cert_name_y') || 37));
      setSerialY(Number(localStorage.getItem('admin_cert_serial_y') || 96));
      setFontFamily(localStorage.getItem('admin_cert_font') || "font-montserrat");
      setNameColor(localStorage.getItem('admin_cert_name_color') || "#0f172a");
      setSerialColor(localStorage.getItem('admin_cert_serial_color') || "#1e293b");
      setSerialFontSize(Number(localStorage.getItem('admin_cert_serial_size') || 20));
    };
    window.addEventListener('branding-updated', updater);

    // Sync branding from Postgres via the /api/settings/branding endpoint.
    // Polled on mount + every 30s (replaces the old Firestore onSnapshot listener).
    let cancelled = false;
    const safeSetItem = (key: string, val: string) => {
        try {
            localStorage.setItem(key, val);
        } catch (err: any) {
            if (err.name === 'QuotaExceededError' || err.name === 'NS_ERROR_DOM_QUOTA_REACHED') {
                console.warn(`LocalStorage quota exceeded for ${key}, skipping persistence but keeping in memory.`);
            } else {
                throw err;
            }
        }
    };
    const pullBranding = async () => {
        try {
            const data: any = await fetchBranding();
            if (cancelled || !data) return;
            if (data.logo)   { safeSetItem('admin_logo',  data.logo);   setLogo(data.logo);   }
            if (data.badge)  { safeSetItem('admin_badge', data.badge);  setBadge(data.badge); }
            if (data.certBg) { safeSetItem('admin_cert_bg', data.certBg); setCertBg(data.certBg); }
            if (data.nameY !== undefined)         { safeSetItem('admin_cert_name_y', String(data.nameY)); setNameY(data.nameY); }
            if (data.serialY !== undefined)       { safeSetItem('admin_cert_serial_y', String(data.serialY)); setSerialY(data.serialY); }
            if (data.fontFamily)                  { safeSetItem('admin_cert_font', data.fontFamily); setFontFamily(data.fontFamily); }
            if (data.nameColor)                   { safeSetItem('admin_cert_name_color', data.nameColor); setNameColor(data.nameColor); }
            if (data.serialColor)                 { safeSetItem('admin_cert_serial_color', data.serialColor); setSerialColor(data.serialColor); }
            if (data.serialFontSize)              { safeSetItem('admin_cert_serial_size', String(data.serialFontSize)); setSerialFontSize(data.serialFontSize); }
            if (data.emailServiceId)              safeSetItem('admin_email_service_id', data.emailServiceId);
            if (data.emailTemplateId)             safeSetItem('admin_email_template_id', data.emailTemplateId);
            if (data.emailPublicKey)              safeSetItem('admin_email_public_key', data.emailPublicKey);
        } catch (err) {
            console.warn("Could not load branding from /api/settings/branding", err);
        }
    };
    pullBranding();
    const interval = setInterval(pullBranding, 30_000);

    return () => {
      window.removeEventListener('branding-updated', updater);
      cancelled = true;
      clearInterval(interval);
    };
  }, []);
  return { logo, badge, certBg, nameY, serialY, fontFamily, nameColor, serialColor, serialFontSize };
};

const BrandIcon = ({ className = "w-14 h-14" }: { className?: string }) => {
  const { logo } = useBranding();
  return (
  <img 
    src={logo} 
    alt="Tornix Logo" 
    className={`${className} object-contain select-none`}
    referrerPolicy="no-referrer"
  />
  );
};

const TornixLogo = ({ lang }: { lang?: 'ar' | 'en' }) => {
  const { logo } = useBranding();
  const isAr = lang === 'ar';
  return (
    <div className="flex items-center gap-3 select-none">
      <img
        src={logo}
        alt="Tornix"
        className="h-9 w-9 object-contain"
        referrerPolicy="no-referrer"
      />
      <div className="flex flex-col leading-none">
        <span className="logo-text">{isAr ? 'تورنكس' : 'Tornix'}</span>
        <span className="text-[0.6875rem] mt-0.5 font-medium" style={{ color: 'var(--text-muted)', letterSpacing: '0.02em' }}>
          {isAr ? 'مركز الاعتماد المهني' : 'Accreditation Center'}
        </span>
      </div>
    </div>
  );
};

export default function App() {
  const [showAdmin, setShowAdmin] = useState(false);
  const [showCourse, setShowCourse] = useState(false);
  const [showSegmentedCourse, setShowSegmentedCourse] = useState(false);
  const [showOnboarding, setShowOnboarding] = useState(false);

  useEffect(() => {
    const hasSeen = localStorage.getItem('tornix_onboarded');
    if (!hasSeen) setShowOnboarding(true);
  }, []);

  const { logo: currentLogo, badge: currentBadge, certBg, nameY, serialY, fontFamily, nameColor, serialColor, serialFontSize } = useBranding();
  
  // Auth state — replaces useAuthState(firebase auth) with our cookie/JWT session.
  const { user } = useSession();
  const authLoading = false; // loading state removed (JWT is synchronous)
  
  const [step, setStep] = useState<'welcome' | 'camera_check' | 'orientation' | 'quiz' | 'result' | 'terminated'>('welcome');
  const [questions, setQuestions] = useState<Question[]>([]);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [userAnswers, setUserAnswers] = useState<UserAnswer[]>([]);
  const [score, setScore] = useState(0);
  // Server-side certificate flow (Task 8 of plan 2026-05-12)
  const [assessmentId, setAssessmentId] = useState<number | null>(null);
  const [serverCert, setServerCert] = useState<CertStatus | null>(null);
  const [isCertLoading, setIsCertLoading] = useState(false);
  const [userName, setUserName] = useState('');
  const [userEmail, setUserEmail] = useState('');
  const [userPhoto, setUserPhoto] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [lang, setLang] = useState<'ar' | 'en'>('ar');

  const [isEssayMode, setIsEssayMode] = useState(false);
  const [essayAnswer, setEssayAnswer] = useState('');
  const [isValidatingEssay, setIsValidatingEssay] = useState(false);
  
  const [integrityScore, setIntegrityScore] = useState(100);
  const [questionStartTime, setQuestionStartTime] = useState(Date.now());
  const [spamWarning, setSpamWarning] = useState<string | null>(null);
  const [fastAnsweringCount, setFastAnsweringCount] = useState(0);
  const [essayQuestionsIndices, setEssayQuestionsIndices] = useState<number[]>([]);
  const [globalTimeLeft, setGlobalTimeLeft] = useState(30 * 60);
  const [agreedToRules, setAgreedToRules] = useState(false);
  const [terminationReason, setTerminationReason] = useState<string | null>(null);
  const [showReview, setShowReview] = useState(false);
  const [isEditingName, setIsEditingName] = useState(false);
  const [editedName, setEditedName] = useState('');

  useEffect(() => {
     if (user) {
         setUserName(user.name || '');
         setUserEmail(user.email || '');
         if (user.photo) setUserPhoto(user.photo);
     }
  }, [user]);

  // Admin Hotkey
  useEffect(() => {
      const handleKeyDown = (e: KeyboardEvent) => {
          if (e.ctrlKey && e.shiftKey && e.key === 'A') {
              setShowAdmin(prev => !prev);
          }
      };
      window.addEventListener('keydown', handleKeyDown);
      return () => window.removeEventListener('keydown', handleKeyDown);
  }, []);

  const generateSerial = () => {
    let hash = 0;
    for (let i = 0; i < userEmail.length; i++) {
        hash = Math.imul(31, hash) + userEmail.charCodeAt(i) | 0;
    }
    return `TCP-26-${Math.abs(hash).toString().substring(0,6).padStart(6, '0')}`;
  };

  useEffect(() => {
    document.documentElement.dir = lang === 'ar' ? 'rtl' : 'ltr';
  }, [lang]);

  useEffect(() => {
    let timer: any;
    if (step === 'quiz' && globalTimeLeft > 0) {
      timer = setInterval(() => {
        setGlobalTimeLeft(prev => prev - 1);
      }, 1000);
    }
    return () => clearInterval(timer);
  }, [step, globalTimeLeft]);

  // ANTI-CHEAT MECHANISMS
  useEffect(() => {
    if (step !== 'quiz') return;

    const handleVisibilityChange = () => {
      if (document.hidden) {
        setIntegrityScore(prev => Math.max(0, prev - 25));
        setSpamWarning(lang === 'ar' 
          ? "تحذير: لقد قمت بمغادرة شاشة الاختبار! يُسمح فقط بالرجوع لمنصة تورنكس، ولكن يتم تسجيل المغادرة كإجراء وقائي. تم خصم نقاط." 
          : "Warning: You left the testing environment! Referencing Tornix platform is allowed, but leaving this tab is logged. Integrity points deducted."
        );
      }
    };

    const handleCopy = (e: ClipboardEvent) => {
      e.preventDefault();
      setIntegrityScore(prev => Math.max(0, prev - 10));
      setSpamWarning(lang === 'ar' 
        ? "تحذير: يُمنع نسخ الأسئلة. تم خصم نقاط." 
        : "Warning: Copying is prohibited. Points deducted."
      );
    };

    const handleContextMenu = (e: MouseEvent) => {
      e.preventDefault();
    };

    document.addEventListener("visibilitychange", handleVisibilityChange);
    document.addEventListener("copy", handleCopy);
    document.addEventListener("contextmenu", handleContextMenu);

    return () => {
      document.removeEventListener("visibilitychange", handleVisibilityChange);
      document.removeEventListener("copy", handleCopy);
      document.removeEventListener("contextmenu", handleContextMenu);
    };
  }, [step, lang]);

  useEffect(() => {
    if (step === 'quiz' && globalTimeLeft === 0) {
      finishQuiz(userAnswers);
    }
  }, [globalTimeLeft, step]);

  const currentQuestion = questions[currentIndex];

  const handleRegistrationSubmit = async () => {
    if (!user) {
        // loginWithGoogle navigates away to Google's OAuth screen and returns.
        loginWithGoogle('/');
        return;
    }
    setStep('camera_check');
  };

  const saveAssessmentToCloud = async (finalScore: number, status: "completed" | "terminated") => {
    if (user) {
       try {
           const condensedAnswers = userAnswers.map(ua => ({
               questionId: ua.questionId,
               category: ua.category || '',
               timeSpent: ua.timeSpent,
               isCorrect: ua.isCorrect,
               selectedId: ua.selectedId,
           }));

           const saved = await submitAssessment({
               userName: user.name || userName || "Student",
               userPhoto: userPhoto || undefined,
               score: finalScore,
               integrityScore,
               serialNumber: generateSerial(),
               status,
               answers: condensedAnswers,
               questionsCount: questions.length,
           });
           // Capture the new row id so the cert download flow can poll for the
           // server-rendered PDF/PNG.
           if (saved?.id) setAssessmentId(saved.id);
       } catch(err) {
           console.error("Failed to save assessment", err);
       }
    }
  };

  const handleStartExam = async () => {
    if (!agreedToRules) return;
    setIsLoading(true);
    setError(null);
    
    try {
      let generated = await generateQuizQuestions(lang);
      
      // Shuffle options for allQuestions to avoid "B" bias
      generated = generated.map(q => {
        const optionsWithIndex = q.options.map((opt, i) => ({ opt, originalIndex: i }));
        const shuffledOptions = [...optionsWithIndex].sort(() => Math.random() - 0.5);
        const newCorrectAnswer = shuffledOptions.findIndex(so => so.originalIndex === q.correctAnswer);
        return {
          ...q,
          options: shuffledOptions.map(so => so.opt),
          correctAnswer: newCorrectAnswer
        };
      });

      setQuestions(generated as any);
      
      // Select 4 random questions to be mandatory essay type
      const indices = Array.from({ length: 20 }, (_, i) => i)
        .sort(() => Math.random() - 0.5)
        .slice(0, 4);
      setEssayQuestionsIndices(indices);
      
      startQuizSession();
    } catch (err) {
      console.error("Quiz generation failed, using locally cached bank:");
      let shuffled = [...FULL_BANK].sort(() => 0.5 - Math.random());
      
      // Shuffle options to ensure absolutely no bias in index
      shuffled = shuffled.map(q => {
         const optionsWithIndex = q.options.map((opt, i) => ({ opt, originalIndex: i }));
         const shuffledOpts = optionsWithIndex.sort(() => Math.random() - 0.5);
         const newCorrect = shuffledOpts.findIndex(so => so.originalIndex === q.correctAnswer);
         return {
           ...q,
           options: shuffledOpts.map(so => so.opt),
           correctAnswer: newCorrect
         };
      });

      const selected = shuffled.slice(0, 20);
      setQuestions(selected as any);
      
      const indices = Array.from({ length: 20 }, (_, i) => i)
        .sort(() => Math.random() - 0.5)
        .slice(0, 4);
      setEssayQuestionsIndices(indices);
      
      startQuizSession();
    } finally {
      setIsLoading(false);
    }
  };

  const startQuizSession = () => {
    setGlobalTimeLeft(30 * 60); // 30 minutes
    setStep('quiz');
    setQuestionStartTime(Date.now());
    setFastAnsweringCount(0); // Reset speed counter
  };

  const finishQuiz = (finalAnswers: UserAnswer[]) => {
    const finalScore = Math.round((finalAnswers.filter(a => a.isCorrect).length / (questions.length || 20)) * 100);
    setScore(finalScore);
    setStep('result');
    saveAssessmentToCloud(finalScore, 'completed');
    if (finalScore >= 60 && integrityScore > 70) {
      confetti({ particleCount: 150, spread: 70, origin: { y: 0.6 } });
      sendEmailNotification(finalScore);
    }
  };

  const forceAdminPass = () => {
     const dummyQ = questions.length > 0 ? questions : FULL_BANK.slice(0, 20);
     const dummyAnswers: UserAnswer[] = dummyQ.map((q) => ({
        questionId: q.id,
        selectedOption: q.correctAnswer,
        isCorrect: true,
        timeSpent: 10
     }));
     setQuestions(dummyQ as any);
     setUserAnswers(dummyAnswers);
     const finalScore = 100;
     setScore(finalScore);
     setStep('result');
     saveAssessmentToCloud(finalScore, 'completed');
     confetti({ particleCount: 300, spread: 100, origin: { y: 0.6 } });
     sendEmailNotification(finalScore);
  };

  const sendEmailNotification = async (s: number) => {
    const resendKey = localStorage.getItem('admin_resend_key');
    const resendFromEmail = localStorage.getItem('admin_resend_from_email') || '';
    const serviceId = localStorage.getItem('admin_email_service_id');
    const templateId = localStorage.getItem('admin_email_template_id');
    const publicKey = localStorage.getItem('admin_email_public_key');
    
    if (resendKey && userEmail) {
      try {
        const response = await fetch('/api/send-email', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            email: userEmail,
            name: userName,
            score: s,
            status: s >= 60 ? 'Passed' : 'Failed',
            date: new Date().toLocaleDateString(),
            resendKey,
            resendFromEmail
          })
        });
        const data = await response.json();
        if (data.success) {
          console.log('Email sent successfully via Resend API!');
          return;
        } else {
          console.error('Failed to send email via Resend:', data.error);
        }
      } catch (err) {
        console.error('Error sending email via Resend:', err);
      }
    }

    // Fallback to EmailJS
    if (serviceId && templateId && publicKey && userEmail) {
       emailjs.send(serviceId, templateId, {
          to_email: userEmail,
          to_name: userName,
          score: s,
          status: s >= 60 ? 'Passed' : 'Failed',
          date: new Date().toLocaleDateString()
       }, { publicKey })
       .then(
         () => console.log('Email sent successfully via EmailJS!'),
         (error) => console.error('Failed to send email via EmailJS:', error)
       );
    }
  };

  const terminateQuiz = (reason: string) => {
    setTerminationReason(reason);
    setStep('terminated');
    saveAssessmentToCloud(0, 'terminated');
  };

  const handleAnswer = (optionIndex: number, essayCorrect?: boolean) => {
    const timeTaken = Date.now() - questionStartTime;
    const isCorrect = essayCorrect !== undefined ? essayCorrect : optionIndex === currentQuestion?.correctAnswer;
    
    const newAnswer: UserAnswer = {
      questionId: currentQuestion?.id,
      selectedOption: optionIndex, // -1 for essay
      isCorrect,
      timeSpent: timeTaken / 1000,
      category: currentQuestion?.category
    };

    const updatedAnswers = [...userAnswers, newAnswer];
    setUserAnswers(updatedAnswers);

    let newIntegrity = integrityScore;
    let warning = null;
    let shouldTerminate = false;
    let termReason = '';
    
    // Repetitive answer pattern check (Moved to 10 for more leniency)
    if (!isEssayMode && !essayQuestionsIndices.includes(currentIndex) && updatedAnswers.length >= 10) {
      const lastSeven = updatedAnswers.slice(-7);
      if (lastSeven.every(a => a.selectedOption === optionIndex && optionIndex !== -1)) {
        shouldTerminate = true;
        termReason = lang === 'ar' 
          ? 'تم إنهاء الجلسة لاكتشاف نمط إجابات متكررة بطريقة آلية. يرجى تجنب التخمين العشوائي.'
          : 'Session terminated due to repetitive robotic answer patterns. Avoid random guessing.';
      }
    }

    if (shouldTerminate) {
      terminateQuiz(termReason);
      return;
    }

    if (currentIndex < questions.length - 1) {
      setCurrentIndex(currentIndex + 1);
      setQuestionStartTime(Date.now());
      
      // If the next question is a mandatory essay, ensure isEssayMode is on
      if (essayQuestionsIndices.includes(currentIndex + 1)) {
        setIsEssayMode(true);
      } else {
        // Return to selection mode for standard questions
        setIsEssayMode(false);
      }
    } else {
      finishQuiz(updatedAnswers);
    }
  };

  const handleEssaySubmit = async () => {
    if (!essayAnswer.trim() || isValidatingEssay) return;
    
    // Dynamic Word Count Validation
    const words = essayAnswer.trim().split(/\s+/).length;
    const referenceAnswer = currentQuestion.options[currentQuestion.correctAnswer];
    const refWordCount = referenceAnswer.trim().split(/\s+/).length;
    
    // The student should write at least 5 words, or 40% of the reference answer length (capped at 25)
    // If reference is very short (unlikely now with new prompt), allow short answers.
    const dynamicMin = refWordCount <= 3 ? 1 : Math.max(5, Math.min(25, Math.floor(refWordCount * 0.5)));
    
    if (words < dynamicMin) {
      setSpamWarning(lang === 'ar' 
        ? `الإجابة غير كافية! نكتفي بحد أدنى ${dynamicMin} كلمات لشرح الفكرة (أنت كتبت ${words}).` 
        : `Explanation insufficient! We require at least ${dynamicMin} words to explain the concept (you wrote ${words}).`);
      setTimeout(() => setSpamWarning(null), 4000);
      return;
    }

    setIsValidatingEssay(true);
    
    try {
      const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });
      const prompt = `
        As a Tornix Professional Assessment Validator, evaluates if the student's explanation demonstrates understanding.
        
        Question: ${currentQuestion.question}
        Reference Solution: ${referenceAnswer}
        Student's Explanation: "${essayAnswer}"
        
        CRITERIA:
        1. Accuracy: Does it match the technical meaning of the reference?
        2. Depth: Is it just a rephrasing of the question, or an actual answer?
        3. Professionalism: Is the terminology used correctly?

        Return exactly "TRUE" if the answer is conceptually correct and sufficiently descriptive. Return "FALSE" if it's too vague, incorrect, or irrelevant.
      `;
      
      const response = await ai.models.generateContent({
        model: "gemini-3-flash-preview",
        contents: { parts: [{ text: prompt }] }
      });
      
      const resultText = response.text.toUpperCase();
      const isCorrect = resultText.includes('TRUE');
      
      handleAnswer(-1, isCorrect);
      setEssayAnswer('');
    } catch (err) {
      console.error("Essay validation failed:", err);
      // Basic fallback: if AI fails, trust the word count check already done
      handleAnswer(-1, words >= dynamicMin);
      setEssayAnswer('');
    } finally {
      setIsValidatingEssay(false);
    }
  };

  const getRadarData = () => {
    const categories = [...new Set(questions.map(q => q.category))];
    return categories.map(cat => {
      const catAnsws = userAnswers.filter(a => a.category === cat);
      const correct = catAnsws.filter(a => a.isCorrect).length;
      return { 
        subject: cat, 
        A: catAnsws.length > 0 ? (correct / catAnsws.length) * 100 : 0, 
        fullMark: 100,
        wrongCount: catAnsws.length - correct
      };
    });
  };

  const resetQuiz = () => {
    setStep('welcome');
    setCurrentIndex(0);
    setUserAnswers([]);
    setScore(0);
    setIntegrityScore(100);
    setFastAnsweringCount(0);
    setEssayQuestionsIndices([]);
    setSpamWarning(null);
    setShowReview(false);
    setIsEssayMode(false);
    setEssayAnswer('');
  };

  // Server-side cert download. Resolves the stored URL via the polling endpoint.
  const triggerBrowserDownload = (url: string, filename: string) => {
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    a.target = '_blank';     // some browsers ignore `download` on cross-origin URLs
    a.rel = 'noopener';
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
  };

  const downloadCert = async (format: 'pdf' | 'png') => {
    const filename = `Tornix_Access_Pass_${userName.replace(/\s+/g, '_')}.${format}`;
    const urlOf = (s: CertStatus) => (format === 'pdf' ? s.pdfUrl : s.pngUrl);

    // Already-resolved server URL? Use it.
    if (serverCert?.status === 'ready') {
      const url = urlOf(serverCert);
      if (url) { triggerBrowserDownload(url, filename); return; }
    }

    // Otherwise fetch / poll. assessmentId is set after submission (current
    // session) or — for returning users — needs to come from the assessments
    // list lookup. If we don't have one, there's nothing we can do here.
    if (!assessmentId) {
      console.warn('Cert download: no assessmentId in scope; cannot fetch server cert.');
      return;
    }

    setIsCertLoading(true);
    try {
      let s = await fetchCertStatus(assessmentId);
      if (s.status === 'pending') s = await waitForCertificate(assessmentId, { timeoutMs: 30_000 });
      setServerCert(s);
      if (s.status === 'ready') {
        const url = urlOf(s);
        if (url) { triggerBrowserDownload(url, filename); return; }
      }
      if (s.status === 'not_required') {
        console.warn('Cert not generated — score below passing threshold');
        return;
      }
      // pending after timeout OR failed
      console.error('Cert is still pending after polling. Try again in a minute.');
    } catch (e) {
      console.error('Cert lookup failed:', e);
    } finally {
      setIsCertLoading(false);
    }
  };

  const downloadCertificatePNG = () => downloadCert('png');
  const downloadCertificatePDF = () => downloadCert('pdf');

  const shareToLinkedIn = () => {
    const certName = "Tornix Certified Professional";
    const year = new Date().getFullYear();
    const month = new Date().getMonth() + 1;
    const certUrl = encodeURIComponent(window.location.origin);
    const linkedInUrl = `https://www.linkedin.com/profile/add?startTask=CERTIFICATION_NAME&name=${encodeURIComponent(certName)}&organizationName=Tornix&issueYear=${year}&issueMonth=${month}&certUrl=${certUrl}`;
    window.open(linkedInUrl, '_blank');
  };

  const saveEditedName = () => {
    if (editedName.trim()) {
      setUserName(editedName);
      setIsEditingName(false);
    }
  };

  const getStepIndex = () => {
    switch (step) {
      case 'welcome': return 0;
      case 'camera_check': return 1;
      case 'orientation': return 2;
      case 'quiz': return 3;
      case 'result': return 4;
      default: return 0;
    }
  };

  const stepLabelsAr = ['البداية', 'التحقق', 'التعليمات', 'الاختبار', 'النتائج'];
  const stepLabelsEn = ['Start', 'Verify', 'Brief', 'Exam', 'Result'];
  const isAr = lang === 'ar';
  return (
    <div className="min-h-screen w-full flex flex-col no-print" dir={isAr ? 'rtl' : 'ltr'}>
      <nav
        className="sticky top-0 z-[100] border-b"
        style={{ background: 'var(--nav-bg)', borderColor: 'var(--border-hairline)' }}
      >
        <div className="w-full max-w-6xl mx-auto px-5 md:px-8 h-16 flex items-center justify-between gap-6">
          <button
            type="button"
            onClick={() => {
              // Close every overlay and return to the welcome step
              setShowSegmentedCourse(false);
              setShowCourse(false);
              setShowAdmin(false);
              if (step !== 'welcome') setStep('welcome');
            }}
            className="appearance-none bg-transparent border-0 p-0 cursor-pointer"
            aria-label={isAr ? 'العودة للصفحة الرئيسية' : 'Back to home'}
            title={isAr ? 'العودة للصفحة الرئيسية' : 'Back to home'}
          >
            <TornixLogo lang={lang} />
          </button>

          {/* Step rail — only when in flow, hidden below md */}
          {step !== 'result' && step !== 'terminated' && (
            <div className="hidden md:flex items-center gap-1.5">
              {stepLabelsAr.map((labelAr, idx) => {
                const active = getStepIndex() === idx;
                const done = getStepIndex() > idx;
                return (
                  <React.Fragment key={idx}>
                    <span
                      className={`step-pill ${active ? 'is-active' : done ? 'is-done' : ''}`}
                    >
                      {isAr ? labelAr : stepLabelsEn[idx]}
                    </span>
                    {idx < 4 && (
                      <span
                        className="w-3 h-px"
                        style={{ background: done ? 'var(--primary)' : 'var(--border)' }}
                      />
                    )}
                  </React.Fragment>
                );
              })}
            </div>
          )}

          <div className="flex items-center gap-2 md:gap-3">
            {step === 'quiz' && (
              <div
                className={`hidden sm:inline-flex items-center gap-1.5 px-3 h-9 rounded-full text-[0.8125rem] font-semibold tabular-nums ${globalTimeLeft < 300 ? 'badge-failed' : 'surface'}`}
                style={globalTimeLeft >= 300 ? { color: 'var(--text-heading)' } : undefined}
                aria-live="polite"
              >
                <Clock className="w-3.5 h-3.5" />
                {Math.floor(globalTimeLeft / 60).toString().padStart(2, '0')}:{(globalTimeLeft % 60).toString().padStart(2, '0')}
              </div>
            )}
            <button
              onClick={() => setShowCourse(true)}
              className="hidden sm:inline-flex btn btn-ghost btn-sm"
            >
              <Info className="w-3.5 h-3.5" />
              {isAr ? 'عن تورنكس' : 'About Tornix'}
            </button>
            <button
              onClick={() => setShowSegmentedCourse(true)}
              className="hidden sm:inline-flex btn btn-primary btn-sm"
            >
              {isAr ? 'دورة TCP' : 'TCP Course'}
            </button>
            <ThemeToggle lang={lang} />
            <div className="inline-flex items-center p-0.5 rounded-full" style={{ background: 'var(--border-hairline)' }}>
              <button
                onClick={() => setLang('ar')}
                className={`h-7 px-3 rounded-full text-[0.75rem] font-semibold transition-colors ${isAr ? 'bg-[color:var(--card)] shadow-sm' : 'text-[color:var(--text-muted)]'}`}
                style={isAr ? { color: 'var(--text-heading)' } : undefined}
              >ع</button>
              <button
                onClick={() => setLang('en')}
                className={`h-7 px-3 rounded-full text-[0.75rem] font-semibold transition-colors ${!isAr ? 'bg-[color:var(--card)] shadow-sm' : 'text-[color:var(--text-muted)]'}`}
                style={!isAr ? { color: 'var(--text-heading)' } : undefined}
              >EN</button>
            </div>
          </div>
        </div>
      </nav>

      <main className="flex-1 relative" style={{ background: 'var(--bg)' }}>
        <div className={`w-full p-5 md:p-8 max-w-6xl mx-auto min-h-[calc(100vh-64px)] ${step === 'quiz' ? 'grid grid-cols-1 lg:grid-cols-[260px_1fr] gap-6' : 'flex flex-col items-center justify-center'}`}>
          {step === 'quiz' && (
            <aside className="no-print hidden lg:block sticky top-24 self-start max-h-[calc(100vh-7rem)]">
              <div className="card overflow-hidden flex flex-col h-[calc(100vh-7rem)]">
                <div className="px-4 py-4 border-b" style={{ borderColor: 'var(--border-hairline)' }}>
                  <div className="flex items-center justify-between mb-1">
                    <span className="text-label">{isAr ? 'مسار الجلسة' : 'Session map'}</span>
                    <span className="text-[0.75rem] tabular-nums font-semibold" style={{ color: 'var(--text-muted)' }}>
                      {userAnswers.length}/{questions.length}
                    </span>
                  </div>
                  <div className="progress-track" style={{ height: 3 }}>
                    <div className="progress-fill" style={{ width: `${(userAnswers.length / Math.max(questions.length, 1)) * 100}%` }} />
                  </div>
                </div>
                <div className="flex-1 overflow-y-auto custom-scrollbar p-2">
                  <ul className="flex flex-col">
                    {questions.map((q, idx) => {
                      const ua = userAnswers[idx];
                      const isCompleted = !!ua;
                      const isActive = currentIndex === idx;
                      let dotBg = 'var(--border)';
                      let dotColor = 'var(--text-muted)';
                      let DotIcon: any = null;
                      if (isCompleted) {
                        if (ua.isCorrect) { dotBg = '#DEFFEE'; dotColor = '#0DA06F'; DotIcon = CheckCircle; }
                        else { dotBg = '#FFE4E6'; dotColor = '#E11D48'; DotIcon = XCircle; }
                      } else if (isActive) {
                        dotBg = 'var(--primary)'; dotColor = '#FFFFFF';
                      }
                      return (
                        <li key={idx}>
                          <div
                            className="flex items-center gap-3 px-3 py-2.5 rounded-xl"
                            style={isActive ? { background: 'var(--primary-tint)' } : undefined}
                          >
                            <div
                              className="w-7 h-7 rounded-full grid place-items-center shrink-0 text-[0.6875rem] font-semibold tabular-nums"
                              style={{ background: dotBg, color: dotColor }}
                            >
                              {DotIcon ? <DotIcon className="w-3.5 h-3.5" /> : (idx + 1)}
                            </div>
                            <div className="min-w-0 flex-1">
                              <div className="text-[0.75rem] font-semibold truncate" style={{ color: isActive ? 'var(--primary-deep)' : 'var(--text-heading)' }}>
                                {isAr ? `سؤال ${idx + 1}` : `Question ${idx + 1}`}
                              </div>
                              <div className="text-[0.6875rem] truncate" style={{ color: 'var(--text-muted)' }}>
                                {q.category}
                              </div>
                            </div>
                          </div>
                        </li>
                      );
                    })}
                  </ul>
                </div>
              </div>
            </aside>
          )}

          <div className="flex-1 w-full max-w-4xl mx-auto flex flex-col pb-10">
            <AnimatePresence mode="wait">
              {step === 'welcome' && (
                <motion.div
                  key="welcome"
                  initial={{ opacity: 0, y: 12 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -8 }}
                  transition={{ duration: 0.4, ease: [0.22, 1, 0.36, 1] }}
                  className="max-w-2xl w-full mx-auto py-10 md:py-14"
                >
                  <div className="text-center space-y-7 px-2">
                    <motion.div
                      initial={{ scale: 0.92, opacity: 0 }}
                      animate={{ scale: 1, opacity: 1 }}
                      transition={{ duration: 0.6, ease: [0.22, 1, 0.36, 1] }}
                      className="logo-halo mx-auto w-28 h-28 grid place-items-center"
                    >
                      <img src={currentLogo} alt="Tornix" className="w-24 h-24 object-contain" referrerPolicy="no-referrer" />
                    </motion.div>

                    <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full" style={{ background: 'var(--primary-tint)', color: 'var(--primary-deep)' }}>
                      <Sparkles className="w-3.5 h-3.5" />
                      <span className="text-[0.75rem] font-semibold">
                        {isAr ? 'الاعتماد المهني المعتمد' : 'Official Professional Credential'}
                      </span>
                    </div>

                    <div className="space-y-4">
                      <h1 className="text-display tracking-tight" style={{ color: 'var(--text-heading)' }}>
                        {isAr ? 'مركز اعتماد تورنكس' : 'Tornix Accreditation'}
                      </h1>
                      <p className="text-body-l max-w-xl mx-auto" style={{ color: 'var(--text-dim)' }}>
                        {isAr
                          ? 'نقيس كفاءتك في استخدام منصة تورنكس وتطبيق معايير إدارة المشاريع العالمية، ونمنحك شهادة محترَمة في السوق.'
                          : 'A measured assessment of Tornix proficiency and global PM standards, ending in a credential the market respects.'}
                      </p>
                    </div>
                  </div>

                  {user && (
                    <button
                      type="button"
                      onClick={() => setShowSegmentedCourse(true)}
                      className="cta-course-hero group mt-10 w-full max-w-xl mx-auto flex items-center gap-5 md:gap-6 text-start rounded-3xl px-6 md:px-7 py-5 md:py-6 relative overflow-hidden"
                      aria-label={isAr ? 'ابدأ دورة TCP' : 'Start the TCP course'}
                    >
                      <span className="cta-course-orb relative shrink-0 w-14 h-14 md:w-16 md:h-16 rounded-full grid place-items-center" aria-hidden>
                        <span className="cta-course-halo" />
                        <PlayCircle className="relative w-7 h-7 md:w-8 md:h-8" strokeWidth={1.6} />
                      </span>
                      <span className="flex-1 min-w-0">
                        <span className="block text-[0.6875rem] uppercase tracking-[0.14em] font-semibold opacity-85 mb-0.5">
                          {isAr ? 'الطريق الموصى به' : 'Recommended path'}
                        </span>
                        <span className="block text-h3 leading-tight mb-1" style={{ color: 'currentColor' }}>
                          {isAr ? 'ابدأ دورة TCP' : 'Start the TCP course'}
                        </span>
                        <span className="block text-[0.8125rem] opacity-90 leading-snug">
                          {isAr
                            ? '٢٢ مقطعًا مرشدًا — مقدمة، محتوى، وخاتمة لكل جزء، ثم الاختبار والشهادة.'
                            : '22 guided segments — intro, content, and outro each, then the exam and certificate.'}
                        </span>
                      </span>
                      <ChevronRight className={`w-5 h-5 shrink-0 opacity-90 transition-transform group-hover:translate-x-0.5 ${isAr ? 'rotate-180 group-hover:!-translate-x-0.5' : ''}`} />
                    </button>
                  )}

                  <div className={`card ${user ? 'mt-5' : 'mt-10'} p-6 md:p-8 max-w-md mx-auto`}>
                    {!user ? (
                      <>
                        <h3 className="text-h4 mb-1" style={{ color: 'var(--text-heading)' }}>
                          {isAr ? 'سجّل دخولك للبدء' : 'Sign in to begin'}
                        </h3>
                        <p className="text-body-m mb-6" style={{ color: 'var(--text-muted)' }}>
                          {isAr
                            ? 'نستخدم حساب Google لتأمين هوية الجلسة وإصدار الشهادة باسمك.'
                            : 'We use your Google account to secure the session and issue the certificate.'}
                        </p>
                        <button
                          onClick={() => loginWithGoogle('/')}
                          className="btn btn-primary btn-lg w-full"
                        >
                          <User className="w-4 h-4" />
                          {isAr ? 'متابعة عبر Google' : 'Continue with Google'}
                        </button>
                        <button
                          onClick={() => setShowCourse(true)}
                          className="btn btn-ghost btn-md w-full mt-3"
                        >
                          <BookOpen className="w-4 h-4" />
                          {isAr ? 'استكشف مركز المعرفة' : 'Browse the knowledge center'}
                        </button>
                      </>
                    ) : (
                      <>
                        <div className="flex items-center gap-3 mb-5">
                          <span className="flex-1 h-px" style={{ background: 'var(--border-hairline)' }} />
                          <span className="text-[0.7rem] font-medium uppercase tracking-[0.1em]" style={{ color: 'var(--text-muted)' }}>
                            {isAr ? 'أو، الاختبار مباشرة' : 'or, exam directly'}
                          </span>
                          <span className="flex-1 h-px" style={{ background: 'var(--border-hairline)' }} />
                        </div>

                        <div className="space-y-4">
                          <label className="block">
                            <span className="text-label block mb-2">
                              {isAr ? 'الاسم الكامل (كما في جواز السفر)' : 'Full name (as per passport)'}
                            </span>
                            <input
                              type="text"
                              placeholder={isAr ? 'الاسم الثلاثي أو الرباعي' : 'Three or four parts'}
                              value={userName}
                              onChange={(e) => setUserName(e.target.value)}
                              className="input"
                              dir="auto"
                            />
                            <p className="text-[0.75rem] mt-2" style={{ color: 'var(--text-muted)' }}>
                              {isAr
                                ? 'سيُطبَع هذا الاسم على الشهادة بالضبط، فتأكّد من صياغته.'
                                : 'This exact spelling will appear on your certificate.'}
                            </p>
                          </label>

                          <label className="block">
                            <span className="text-label block mb-2">
                              {isAr ? 'البريد الإلكتروني' : 'Email'}
                            </span>
                            <div className="relative">
                              <Mail className={`absolute ${isAr ? 'right-3' : 'left-3'} top-1/2 -translate-y-1/2 w-4 h-4`} style={{ color: 'var(--text-muted)' }} />
                              <input
                                type="email"
                                value={userEmail}
                                disabled
                                className="input"
                                style={{ paddingLeft: isAr ? 14 : 36, paddingRight: isAr ? 36 : 14 }}
                              />
                            </div>
                          </label>
                        </div>

                        <button
                          onClick={handleRegistrationSubmit}
                          disabled={!userName.trim()}
                          className="btn btn-ghost btn-md w-full mt-5"
                        >
                          {isAr ? 'المتابعة إلى التحقق' : 'Continue to verification'}
                          <ChevronRight className={`w-4 h-4 ${isAr ? 'rotate-180' : ''}`} />
                        </button>
                      </>
                    )}
                  </div>
                </motion.div>
              )}

              {step === 'camera_check' && (
                <CameraCheck 
                  lang={lang} 
                  onVerified={(photo) => {
                    setUserPhoto(photo);
                    setStep('orientation');
                  }} 
                />
              )}

              {step === 'orientation' && (
                <OrientationScreen
                  lang={lang}
                  isLoading={isLoading}
                  agreedToRules={agreedToRules}
                  setAgreedToRules={setAgreedToRules}
                  onStart={handleStartExam}
                  isAdmin={!!user?.isAdmin}
                  forceAdminPass={forceAdminPass}
                />
              )}

              {step === 'quiz' && currentQuestion && (
                <motion.div
                  key={currentQuestion.id}
                  initial={{ opacity: 0, y: 8 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -6 }}
                  transition={{ duration: 0.3, ease: [0.22, 1, 0.36, 1] }}
                  className="w-full max-w-3xl mx-auto"
                >
                  <div className="card p-6 md:p-9">
                    <div className="flex flex-wrap items-center justify-between gap-3 mb-5">
                      <div className="flex items-center gap-2">
                        <span className="badge badge-progress">
                          {isAr ? `سؤال ${currentIndex + 1} من ${questions.length}` : `Question ${currentIndex + 1} of ${questions.length}`}
                        </span>
                        <span className="text-[0.75rem]" style={{ color: 'var(--text-muted)' }}>{currentQuestion.category}</span>
                      </div>
                      {user?.isAdmin && (
                        <button onClick={forceAdminPass} className="btn btn-ghost btn-sm">
                          Admin pass
                        </button>
                      )}
                    </div>

                    <ProgressBar current={currentIndex + 1} total={questions.length} />

                    <AnimatePresence>
                      {spamWarning && (
                        <motion.div
                          initial={{ opacity: 0, y: -6 }}
                          animate={{ opacity: 1, y: 0 }}
                          exit={{ opacity: 0, y: -6 }}
                          className="flex items-start gap-3 px-4 py-3 mt-6 rounded-xl"
                          style={{ background: 'var(--warn-tint, #FEF3C7)', color: '#8A4D08' }}
                        >
                          <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" />
                          <span className="text-[0.8125rem] leading-relaxed">{spamWarning}</span>
                        </motion.div>
                      )}
                    </AnimatePresence>

                    <h2
                      className="text-h3 leading-relaxed mt-7"
                      style={{ color: 'var(--text-heading)', textAlign: isAr ? 'right' : 'left' }}
                    >
                      {currentQuestion.question}
                    </h2>

                    {(currentQuestion.type === 'evm' || currentQuestion.type === 'visual' || currentQuestion.category.includes('Intelligence') || currentQuestion.category.includes('Strategy')) && (
                      <div className="w-full mt-6">
                        {currentQuestion.type === 'evm' && <EVMChart />}
                        {currentQuestion.type === 'visual' && <GISVisual />}
                        {(currentQuestion.category.includes('Intelligence') || currentQuestion.category.includes('Strategy')) && !currentQuestion.type && <StrategyVisual />}
                      </div>
                    )}

                    {!isEssayMode ? (
                      <div className="grid grid-cols-1 gap-2.5 mt-8">
                        {currentQuestion.options.map((option, idx) => (
                          <button
                            key={idx}
                            onClick={() => handleAnswer(idx)}
                            className="group flex items-center gap-4 px-4 py-4 rounded-xl border transition-colors duration-200 text-start"
                            style={{ background: 'var(--card)', borderColor: 'var(--border-hairline)' }}
                            onMouseEnter={(e) => {
                              e.currentTarget.style.borderColor = 'var(--primary)';
                              e.currentTarget.style.background = 'var(--primary-wash)';
                            }}
                            onMouseLeave={(e) => {
                              e.currentTarget.style.borderColor = 'var(--border-hairline)';
                              e.currentTarget.style.background = 'var(--card)';
                            }}
                          >
                            <div
                              className="w-9 h-9 rounded-full grid place-items-center shrink-0 text-[0.875rem] font-semibold transition-colors"
                              style={{ background: 'var(--bg)', color: 'var(--text-dim)', border: '1px solid var(--border-hairline)' }}
                            >
                              {String.fromCharCode(65 + idx)}
                            </div>
                            <span className="flex-1 text-body-m font-medium leading-relaxed" style={{ color: 'var(--text-heading)' }}>
                              {option}
                            </span>
                            <ChevronRight
                              className={`w-4 h-4 transition-transform ${isAr ? 'rotate-180' : ''}`}
                              style={{ color: 'var(--text-muted)' }}
                            />
                          </button>
                        ))}
                      </div>
                    ) : (
                      <div className="space-y-4 mt-8">
                        <div className="ai-surface-soft p-4 flex items-start gap-3" style={{ borderRadius: 16 }}>
                          <div className="w-9 h-9 rounded-full grid place-items-center shrink-0" style={{ background: 'var(--primary)', color: '#FFF' }}>
                            <Sparkles className="w-4 h-4" />
                          </div>
                          <p className="text-[0.875rem] leading-relaxed" style={{ color: 'var(--primary-deep)' }}>
                            {isAr
                              ? 'وضع الإجابة المقالية مفعَّل بسبب رصد سلوك سريع. اشرح فكرتك بدقّة وسيقيّم الذكاء الاصطناعي إجابتك.'
                              : 'Essay mode is active because rapid-answer patterns were detected. Explain the concept precisely and our AI will evaluate it.'}
                          </p>
                        </div>
                        <textarea
                          value={essayAnswer}
                          onChange={(e) => setEssayAnswer(e.target.value)}
                          placeholder={isAr ? 'اكتب إجابتك هنا بالتفصيل...' : 'Write your detailed answer...'}
                          className="w-full min-h-[160px] px-4 py-3 rounded-xl outline-none transition-colors leading-relaxed"
                          style={{ background: 'var(--bg-alt)', border: '1px solid var(--border-strong)', color: 'var(--text)' }}
                          onFocus={(e) => { e.currentTarget.style.borderColor = 'var(--primary)'; e.currentTarget.style.background = 'var(--primary-focus)'; }}
                          onBlur={(e) => { e.currentTarget.style.borderColor = 'var(--border-strong)'; e.currentTarget.style.background = 'var(--bg-alt)'; }}
                          disabled={isValidatingEssay}
                          dir="auto"
                        />
                        <div className="flex items-center justify-between gap-3">
                          <span className="text-[0.75rem]" style={{ color: 'var(--text-muted)' }}>
                            {isAr ? 'سيُقيَّم المعنى الجوهري لا المطابقة الحرفية.' : 'Conceptual fit is graded, not literal matching.'}
                          </span>
                          <button
                            onClick={handleEssaySubmit}
                            disabled={!essayAnswer.trim() || isValidatingEssay}
                            className="btn btn-primary btn-md"
                          >
                            {isValidatingEssay ? (
                              <>
                                <Loader2 className="w-4 h-4 animate-spin" />
                                {isAr ? 'جاري التقييم...' : 'Evaluating...'}
                              </>
                            ) : (
                              <>
                                <CheckSquare className="w-4 h-4" />
                                {isAr ? 'تقديم الإجابة' : 'Submit answer'}
                              </>
                            )}
                          </button>
                        </div>
                      </div>
                    )}
                  </div>
                </motion.div>
              )}

              {step === 'terminated' && (
                <div className="fixed inset-0 z-[200] flex items-center justify-center p-6 no-print overflow-y-auto" style={{ background: 'rgba(15,23,42,0.45)' }}>
                  <motion.div
                    initial={{ opacity: 0, y: 12 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ duration: 0.3, ease: [0.22, 1, 0.36, 1] }}
                    className="card w-full max-w-lg p-8 md:p-10"
                    style={{ borderRadius: 20 }}
                  >
                    <div className="w-12 h-12 rounded-full grid place-items-center mb-5" style={{ background: '#FFE4E6', color: '#E11D48' }}>
                      <AlertTriangle className="w-5 h-5" />
                    </div>
                    <h2 className="text-h2 mb-2" style={{ color: 'var(--text-heading)' }}>
                      {isAr ? 'تم إنهاء جلسة التقييم' : 'Session terminated'}
                    </h2>
                    <p className="text-body-m mb-6 leading-relaxed" style={{ color: 'var(--text-dim)' }}>
                      {terminationReason}
                    </p>
                    <button
                      onClick={() => window.location.reload()}
                      className="btn btn-outline btn-md"
                    >
                      <RefreshCcw className="w-4 h-4" />
                      {isAr ? 'العودة إلى الصفحة الرئيسية' : 'Return home'}
                    </button>
                  </motion.div>
                </div>
              )}

              {step === 'result' && (
                <div className="fixed inset-0 z-[200] flex items-start justify-center p-4 md:p-8 no-print overflow-y-auto" style={{ background: 'rgba(15,23,42,0.45)' }}>
                  <motion.div
                    initial={{ opacity: 0, y: 16 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ duration: 0.4, ease: [0.22, 1, 0.36, 1] }}
                    className="card w-full max-w-4xl my-6"
                    style={{ borderRadius: 24 }}
                  >
                    {/* Result hero */}
                    <div className="px-7 md:px-10 pt-9 pb-7 border-b" style={{ borderColor: 'var(--border-hairline)' }}>
                      <div className="flex flex-col md:flex-row md:items-center justify-between gap-6">
                        <div className="flex items-center gap-4">
                          <div className="logo-halo w-16 h-16 grid place-items-center">
                            <img src={currentLogo} alt="" className="w-12 h-12 object-contain" />
                          </div>
                          <div>
                            <span className="text-label">{isAr ? 'نتيجة التقييم' : 'Assessment result'}</span>
                            {isEditingName ? (
                              <div className="flex items-center gap-2 mt-1">
                                <input
                                  type="text"
                                  value={editedName}
                                  onChange={(e) => setEditedName(e.target.value)}
                                  className="input"
                                  style={{ height: 36 }}
                                />
                                <button onClick={saveEditedName} className="btn btn-primary btn-sm">{isAr ? 'حفظ' : 'Save'}</button>
                              </div>
                            ) : (
                              <div className="flex items-center gap-2">
                                <h2 className="text-h2" style={{ color: 'var(--text-heading)' }}>{userName}</h2>
                                <button onClick={() => setIsEditingName(true)} className="btn btn-text btn-sm">
                                  {isAr ? 'تعديل' : 'Edit'}
                                </button>
                              </div>
                            )}
                            <p className="text-caption mt-0.5">{generateSerial()}</p>
                          </div>
                        </div>

                        <span className={`badge ${score >= 60 ? 'badge-completed' : 'badge-failed'} text-[0.8125rem]`} style={{ padding: '6px 14px' }}>
                          {score >= 60
                            ? (isAr ? '✓ مُعتَمد' : '✓ Accredited')
                            : (isAr ? 'لم يُجتز' : 'Not yet passed')}
                        </span>
                      </div>
                    </div>

                    <div className="grid grid-cols-1 lg:grid-cols-2 gap-7 px-7 md:px-10 py-8">
                      {/* LEFT — scores + radar */}
                      <div className="space-y-6">
                        <div className="grid grid-cols-2 gap-3">
                          <div className="surface-soft rounded-2xl px-5 py-5">
                            <span className="text-label">{isAr ? 'الدرجة التقنية' : 'Technical score'}</span>
                            <div className="mt-1 flex items-baseline gap-1">
                              <span className="text-[2.25rem] font-bold tabular-nums" style={{ color: score >= 60 ? 'var(--text-heading)' : '#E11D48' }}>{score}</span>
                              <span className="text-h4" style={{ color: 'var(--text-muted)' }}>%</span>
                            </div>
                            <div className="mt-3 h-1 rounded-full overflow-hidden" style={{ background: 'var(--border-hairline)' }}>
                              <motion.div
                                initial={{ width: 0 }}
                                animate={{ width: `${score}%` }}
                                transition={{ duration: 0.9, ease: [0.22, 1, 0.36, 1] }}
                                style={{ height: '100%', background: score >= 60 ? '#2BA86A' : '#E11D48' }}
                              />
                            </div>
                          </div>
                          <div className="surface-soft rounded-2xl px-5 py-5">
                            <span className="text-label">{isAr ? 'مؤشر النزاهة' : 'Integrity'}</span>
                            <div className="mt-1 flex items-baseline gap-1">
                              <span className="text-[2.25rem] font-bold tabular-nums" style={{ color: integrityScore >= 90 ? 'var(--text-heading)' : '#D97706' }}>{integrityScore}</span>
                              <span className="text-h4" style={{ color: 'var(--text-muted)' }}>%</span>
                            </div>
                            <div className="mt-3 h-1 rounded-full overflow-hidden" style={{ background: 'var(--border-hairline)' }}>
                              <motion.div
                                initial={{ width: 0 }}
                                animate={{ width: `${integrityScore}%` }}
                                transition={{ duration: 0.9, delay: 0.05, ease: [0.22, 1, 0.36, 1] }}
                                style={{ height: '100%', background: integrityScore >= 90 ? '#2BA86A' : '#D97706' }}
                              />
                            </div>
                          </div>
                        </div>

                        <div className="surface-soft rounded-2xl p-4 h-64">
                          <ResponsiveContainer width="100%" height="100%">
                            <RadarChart cx="50%" cy="50%" outerRadius="75%" data={getRadarData()}>
                              <PolarGrid stroke="var(--border-hairline)" />
                              <PolarAngleAxis dataKey="subject" tick={{ fill: 'var(--text-muted)', fontSize: 10, fontWeight: 600 }} />
                              <PolarRadiusAxis angle={30} domain={[0, 100]} tick={false} axisLine={false} />
                              <Radar name="Performance" dataKey="A" stroke="#7D42C6" strokeWidth={2} fill="#7D42C6" fillOpacity={0.18} />
                            </RadarChart>
                          </ResponsiveContainer>
                        </div>

                        {integrityScore < 90 && (
                          <div className="px-4 py-3 rounded-xl flex items-start gap-3" style={{ background: '#FEF3C7', color: '#8A4D08' }}>
                            <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" />
                            <p className="text-[0.8125rem] leading-relaxed">
                              {isAr ? 'رصدنا أنماط إجابة سريعة أو متكررة، وأثّرت على درجة النزاهة.' : 'Rapid or repetitive answer patterns were detected and affected your integrity score.'}
                            </p>
                          </div>
                        )}
                      </div>

                      {/* RIGHT — gap analysis */}
                      <div>
                        <h3 className="text-label mb-3">{isAr ? 'فجوات معرفية' : 'Knowledge gaps'}</h3>
                        <div className="space-y-2.5 max-h-[420px] overflow-y-auto custom-scrollbar pr-1">
                          {getRadarData().filter(d => d.A < 100).map((fail, i) => (
                            <div key={i} className="card card-tight p-4">
                              <div className="flex items-center justify-between gap-3">
                                <span className="text-h4" style={{ color: 'var(--text-heading)' }}>{fail.subject}</span>
                                <span className="badge badge-failed">
                                  {isAr ? `${fail.wrongCount} خطأ` : `${fail.wrongCount} miss`}
                                </span>
                              </div>
                              <p className="text-[0.8125rem] mt-1.5 leading-relaxed" style={{ color: 'var(--text-muted)' }}>
                                {isAr
                                  ? `راجع المواد المتعلقة بـ "${fail.subject}" قبل المحاولة التالية.`
                                  : `Review materials covering "${fail.subject}" before retaking.`}
                              </p>
                            </div>
                          ))}
                          {getRadarData().every(d => d.A === 100) && (
                            <div className="card card-tight p-6 text-center">
                              <CheckCircle className="w-6 h-6 mx-auto mb-2" style={{ color: '#2BA86A' }} />
                              <p className="text-body-m font-medium" style={{ color: 'var(--text-heading)' }}>
                                {isAr ? 'لا توجد فجوات ملحوظة.' : 'No significant gaps detected.'}
                              </p>
                              <p className="text-caption mt-1">
                                {isAr ? 'أداء متَّسق عبر كل الفئات.' : 'Consistent performance across all categories.'}
                              </p>
                            </div>
                          )}
                        </div>
                      </div>
                    </div>

                    {/* Actions */}
                    <div className="px-7 md:px-10 pb-8">
                      {score >= 60 ? (
                        <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                          <button onClick={downloadCertificatePNG} disabled={isCertLoading} className="btn btn-primary btn-lg">
                            {isCertLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Download className="w-4 h-4" />}
                            {isAr ? 'تنزيل صورة' : 'Download PNG'}
                          </button>
                          <button onClick={downloadCertificatePDF} disabled={isCertLoading} className="btn btn-secondary btn-lg">
                            {isCertLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Download className="w-4 h-4" />}
                            {isAr ? 'تنزيل PDF' : 'Download PDF'}
                          </button>
                          <button onClick={shareToLinkedIn} className="btn btn-outline btn-lg">
                            {isAr ? 'إضافة إلى LinkedIn' : 'Add to LinkedIn'}
                          </button>
                        </div>
                      ) : (
                        <button onClick={() => setShowReview(!showReview)} className="btn btn-primary btn-lg w-full">
                          {showReview
                            ? (isAr ? 'إخفاء مراجعة الإجابات' : 'Hide answer review')
                            : (isAr ? 'مراجعة الإجابات' : 'Review my answers')}
                        </button>
                      )}

                      {score >= 60 && (
                        <button onClick={() => setShowReview(!showReview)} className="btn btn-ghost btn-md w-full mt-3">
                          {showReview
                            ? (isAr ? 'إخفاء مراجعة الإجابات' : 'Hide answer review')
                            : (isAr ? 'مراجعة الإجابات' : 'Review answers')}
                        </button>
                      )}

                      {showReview && (
                        <div className="mt-6 pt-6 border-t space-y-3" style={{ borderColor: 'var(--border-hairline)' }}>
                          <h3 className="text-h4 mb-2" style={{ color: 'var(--text-heading)' }}>
                            {isAr ? 'مراجعة الإجابات' : 'Answer review'}
                          </h3>
                          {questions.slice(0, userAnswers.length).map((q, i) => {
                            const ua = userAnswers.find(ans => ans.questionId === q.id);
                            if (!ua) return null;
                            const isCorrect = ua.isCorrect;
                            return (
                              <div key={q.id} className="card card-tight p-5">
                                <div className="flex items-start justify-between gap-3 mb-2">
                                  <p className="text-body-m font-semibold leading-relaxed" style={{ color: 'var(--text-heading)' }}>
                                    {i + 1}. {q.question}
                                  </p>
                                  <span className={`badge ${isCorrect ? 'badge-completed' : 'badge-failed'} shrink-0`}>
                                    {isCorrect ? (isAr ? 'صحيح' : 'Correct') : (isAr ? 'خاطئ' : 'Incorrect')}
                                  </span>
                                </div>
                                <div className="space-y-1.5 text-[0.875rem] leading-relaxed">
                                  <div>
                                    <span className="text-caption">{isAr ? 'إجابتك: ' : 'Your answer: '}</span>
                                    <span style={{ color: isCorrect ? 'var(--text-heading)' : '#E11D48', textDecoration: isCorrect ? 'none' : 'line-through' }}>
                                      {q.options[ua.selectedOption]}
                                    </span>
                                  </div>
                                  {!isCorrect && (
                                    <div>
                                      <span className="text-caption">{isAr ? 'الإجابة الصحيحة: ' : 'Correct: '}</span>
                                      <span style={{ color: 'var(--text-heading)', fontWeight: 500 }}>{q.options[q.correctAnswer]}</span>
                                    </div>
                                  )}
                                </div>
                                <div className="mt-3 px-3 py-2 rounded-lg text-[0.8125rem] leading-relaxed" style={{ background: 'var(--bg)', color: 'var(--text-dim)' }}>
                                  <span className="text-label block mb-0.5">{isAr ? 'التفسير' : 'Explanation'}</span>
                                  {q.explanation}
                                </div>
                              </div>
                            );
                          })}
                        </div>
                      )}

                      <button onClick={resetQuiz} className="btn btn-text btn-sm w-full mt-6">
                        <RefreshCcw className="w-3.5 h-3.5" />
                        {isAr ? 'إعادة جلسة التقييم' : 'Restart assessment'}
                      </button>
                    </div>
                  </motion.div>
                </div>
              )}
            </AnimatePresence>
          </div>
        </div>
      </main>

      <footer className="w-full mt-auto border-t pt-14 pb-10 px-5 md:px-8 relative" style={{ borderColor: 'var(--border-hairline)' }}>
        <div className="max-w-6xl mx-auto">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
            {[
              { Icon: Cpu, titleAr: 'شركة الجنت للذكاء الاصطناعي', titleEn: 'Ailigent AI', descAr: 'تطوير حلول ذكاء اصطناعي للتعليم والأعمال والتحليلات.', descEn: 'AI solutions for education, business, and advanced analytics.', href: 'https://ailigent.ai', label: 'ailigent.ai' },
              { Icon: GraduationCap, titleAr: 'بروفشنال انجنيرز', titleEn: 'Professional Engineers', descAr: 'تأهيل مهني وتدريب هندسي وإداري متقدّم.', descEn: 'Engineering and management qualification programs.', href: 'https://professionalengineers.us', label: 'professionalengineers.us' },
              { Icon: Globe, titleAr: 'منصة تورنكس', titleEn: 'Tornix Platform', descAr: 'منصة إدارة المشاريع والتقييم المهني المدعومة بالذكاء الاصطناعي.', descEn: 'AI-driven project management and accreditation platform.', href: 'https://tornix.ai', label: 'tornix.ai' },
            ].map((entity, idx) => {
              const Icon = entity.Icon;
              return (
                <motion.a
                  key={idx}
                  href={entity.href}
                  target="_blank"
                  rel="noopener noreferrer"
                  initial={{ opacity: 0, y: 8 }}
                  whileInView={{ opacity: 1, y: 0 }}
                  transition={{ duration: 0.4, delay: idx * 0.05, ease: [0.22, 1, 0.36, 1] }}
                  viewport={{ once: true }}
                  className="card p-5 md:p-6 transition-colors"
                  style={{ borderRadius: 16 }}
                  onMouseEnter={(e) => { e.currentTarget.style.borderColor = 'var(--primary-tint)'; }}
                  onMouseLeave={(e) => { e.currentTarget.style.borderColor = 'var(--border-hairline)'; }}
                >
                  <div className="w-9 h-9 rounded-full grid place-items-center mb-4" style={{ background: 'var(--primary-tint)', color: 'var(--primary-deep)' }}>
                    <Icon className="w-4 h-4" />
                  </div>
                  <h4 className="text-h4 mb-1" style={{ color: 'var(--text-heading)' }}>
                    {isAr ? entity.titleAr : entity.titleEn}
                  </h4>
                  <p className="text-body-m leading-relaxed mb-3" style={{ color: 'var(--text-muted)' }}>
                    {isAr ? entity.descAr : entity.descEn}
                  </p>
                  <span className="inline-flex items-center gap-1.5 text-[0.75rem] font-semibold" style={{ color: 'var(--primary)' }}>
                    {entity.label} <ExternalLink className="w-3 h-3" />
                  </span>
                </motion.a>
              );
            })}
          </div>

          <div className="mt-10 pt-6 border-t flex flex-col md:flex-row items-center justify-between gap-4" style={{ borderColor: 'var(--border-hairline)' }}>
            <div className="flex items-center gap-3 text-[0.75rem]" style={{ color: 'var(--text-muted)' }}>
              <span className="inline-flex items-center gap-1.5">
                <span className="w-1.5 h-1.5 rounded-full" style={{ background: '#2BA86A' }} />
                {isAr ? 'الأنظمة نشطة' : 'Systems active'}
              </span>
              <span style={{ color: 'var(--border)' }}>·</span>
              <span className="inline-flex items-center gap-1.5">
                <ShieldCheck className="w-3 h-3" /> {isAr ? 'بيانات مشفّرة' : 'Encrypted in transit'}
              </span>
            </div>
            <p className="text-[0.75rem]" style={{ color: 'var(--text-muted)' }}>
              © {new Date().getFullYear()} Tornix Global · {isAr ? 'بواسطة الجنت وبروفشنال انجنيرز' : 'Built with Ailigent & Professional Engineers'}
            </p>
          </div>
        </div>

        {/* Admin trigger */}
        {(user?.email?.toLowerCase() === 'ahmed0ibrahim@gmail.com' ||
          user?.email?.toLowerCase() === 'ahmedzeroibrahim@gmail.com' ||
          userEmail?.toLowerCase() === 'ahmed0ibrahim@gmail.com' ||
          userEmail?.toLowerCase() === 'ahmedzeroibrahim@gmail.com') && (
          <button
            onClick={() => setShowAdmin(true)}
            className="absolute top-6 right-6 w-10 h-10 rounded-full grid place-items-center transition-colors"
            style={{ background: 'var(--card)', border: '1px solid var(--border-hairline)', color: 'var(--text-muted)' }}
            onMouseEnter={(e) => { e.currentTarget.style.color = 'var(--primary)'; e.currentTarget.style.borderColor = 'var(--primary-tint)'; }}
            onMouseLeave={(e) => { e.currentTarget.style.color = 'var(--text-muted)'; e.currentTarget.style.borderColor = 'var(--border-hairline)'; }}
            aria-label="Admin"
          >
            <Settings className="w-4 h-4" />
          </button>
        )}
      </footer>

      {showAdmin && <AdminPanel onClose={() => setShowAdmin(false)} lang={lang} />}
      {showCourse && (
        <CourseViewer
          onClose={() => setShowCourse(false)}
          lang={lang}
          onOpenSegmented={() => { setShowCourse(false); setShowSegmentedCourse(true); }}
        />
      )}
      {showSegmentedCourse && (
        <SegmentedCourseViewer
          lang={lang}
          courseSlug="tcp"
          onClose={() => setShowSegmentedCourse(false)}
          onStartExam={() => {
            setShowSegmentedCourse(false);
            handleStartExam();
          }}
        />
      )}
      {showOnboarding && (
        <Onboarding 
          lang={lang} 
          onComplete={() => {
            localStorage.setItem('tornix_onboarded', 'true');
            setShowOnboarding(false);
          }} 
        />
      )}

      {/* Certificate template removed — server-side renderer in
          netlify/functions/certificate-renderer is now the source of truth. */}
    </div>
  );
}

const CameraCheck = ({ lang, onVerified }: { lang: 'ar' | 'en', onVerified: (photoUrl: string) => void }) => {
  const videoRef = useRef<HTMLVideoElement>(null);
  const [stream, setStream] = useState<MediaStream | null>(null);
  const [photo, setPhoto] = useState<string | null>(null);
  const [error, setError] = useState('');
  const [isVerifying, setIsVerifying] = useState(false);

  useEffect(() => {
    navigator.mediaDevices.getUserMedia({ video: true })
      .then(s => {
        setStream(s);
        if (videoRef.current) videoRef.current.srcObject = s;
      })
      .catch(err => {
        console.error(err);
        setError(lang === 'ar' ? 'فشل الوصول للكاميرا، يرجى السماح بالوصول.' : 'Failed to access camera.');
      });
      
    return () => {
      if (stream) stream.getTracks().forEach(t => t.stop());
    };
  }, []); // eslint-disable-line

  const capture = async () => {
    if (!videoRef.current) return;
    const canvas = document.createElement('canvas');
    canvas.width = videoRef.current.videoWidth;
    canvas.height = videoRef.current.videoHeight;
    canvas.getContext('2d')?.drawImage(videoRef.current, 0, 0);
    const dataUrl = canvas.toDataURL('image/jpeg');
    setPhoto(dataUrl);
    
    // Stop stream immediately to save resources
    if (stream) stream.getTracks().forEach(t => t.stop());
    
    // Verify it's a real person using Gemini
    setIsVerifying(true);
    setError('');
    
    try {
      const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });
      const base64Data = dataUrl.split(',')[1];
      
      const response = await ai.models.generateContent({
        model: "gemini-3-flash-preview",
        contents: {
          parts: [
            { text: "Analyze this image. Is it a real, live human person facing the camera? Look out for photos of photos, screens, drawings, or other illusions. If it's a real person, your response MUST be exactly 'VERIFIED'. If it is not a real person facing the camera, provide a brief (1 sentence) explanation of why (e.g. 'It appears to be a picture on a screen' or 'No human face detected')." },
            { inlineData: { data: base64Data, mimeType: 'image/jpeg' } }
          ]
        }
      });
      
      const resultText = response.text?.trim() || "";
      if (resultText === "VERIFIED") {
        // all good
      } else {
        setError(lang === 'ar' 
          ? `يرجى ضبط وضعك وتوجيه وجهك للكاميرا الحية. (${resultText})` 
          : `Please adjust your position and face the live camera. (${resultText})`
        );
      }
    } catch (e: any) {
      console.error("Verification error:", e);
      // Fallback if AI fails: don't block them entirely, but warn
      console.warn("AI verification failed, allowing proceed.");
    } finally {
      setIsVerifying(false);
    }
  };

  const isAr = lang === 'ar';
  return (
    <motion.div
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.35, ease: [0.22, 1, 0.36, 1] }}
      className="card max-w-xl w-full mx-auto p-7 md:p-9"
      style={{ borderRadius: 20 }}
    >
      <div className="flex items-center gap-3 mb-5">
        <div className="w-10 h-10 rounded-full grid place-items-center" style={{ background: 'var(--primary-tint)', color: 'var(--primary-deep)' }}>
          <Camera className="w-4 h-4" />
        </div>
        <div>
          <h2 className="text-h3" style={{ color: 'var(--text-heading)' }}>
            {isAr ? 'تحقّق من الهوية' : 'Identity verification'}
          </h2>
          <p className="text-caption">
            {isAr ? 'لقطة سريعة لضمان نزاهة الجلسة.' : 'A quick snapshot to keep the session honest.'}
          </p>
        </div>
      </div>

      {error && (
        <div className="px-4 py-3 mb-4 rounded-xl text-[0.875rem] flex items-start gap-2" style={{ background: 'var(--danger-tint, #FFE4E6)', color: '#9F1239' }}>
          <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" />
          <span className="leading-relaxed">{error}</span>
        </div>
      )}

      {photo ? (
        <div className="space-y-4">
          <img src={photo} alt={isAr ? 'لقطة' : 'Snapshot'} className="w-full h-64 object-cover rounded-2xl" style={{ border: '1px solid var(--border-hairline)' }} />
          {isVerifying && (
            <div className="flex items-center gap-2 text-[0.875rem]" style={{ color: 'var(--primary-deep)' }}>
              <Loader2 className="w-4 h-4 animate-spin" />
              {isAr ? 'يجري التحقّق من الصورة...' : 'Verifying with AI...'}
            </div>
          )}
          <div className="flex gap-2">
            <button
              onClick={() => { setPhoto(null); window.location.reload(); }}
              disabled={isVerifying}
              className="btn btn-outline btn-md flex-1"
            >
              <RefreshCcw className="w-4 h-4" />
              {isAr ? 'إعادة الالتقاط' : 'Retake'}
            </button>
            <button
              onClick={() => { if (photo && !error) onVerified(photo); }}
              disabled={isVerifying || !!error}
              className="btn btn-primary btn-md flex-1"
            >
              <CheckCircle className="w-4 h-4" />
              {isAr ? 'تأكيد' : 'Confirm'}
            </button>
          </div>
        </div>
      ) : (
        <div className="space-y-4">
          <video
            ref={videoRef}
            autoPlay
            playsInline
            muted
            className="w-full h-64 object-cover rounded-2xl"
            style={{ background: '#0F172A', border: '1px solid var(--border-hairline)' }}
          />
          <button onClick={capture} className="btn btn-primary btn-lg w-full">
            <Camera className="w-4 h-4" />
            {isAr ? 'التقاط الصورة' : 'Take snapshot'}
          </button>
        </div>
      )}
    </motion.div>
  );
};

const OrientationScreen = ({ lang, isLoading, agreedToRules, setAgreedToRules, onStart, isAdmin, forceAdminPass }: { lang: 'ar'|'en', isLoading: boolean, agreedToRules: boolean, setAgreedToRules: (a:boolean)=>void, onStart: ()=>void, isAdmin: boolean, forceAdminPass: ()=>void }) => {
  const isAr = lang === 'ar';
  const rules = [
    isAr
      ? 'الإجابات السريعة جداً (أقل من 2.5 ثانية) تُحسب محاولة اختراق وتُخفِّض درجة النزاهة.'
      : 'Answers under 2.5 seconds are flagged as automated and reduce your integrity score.',
    isAr
      ? 'تكرار الخيار نفسه عدّة مرات متتالية يُنهي الجلسة فوراً.'
      : 'Repeating the same option consecutively terminates the session.',
    isAr
      ? 'لا يمكن العودة إلى سؤال بعد تأكيد إجابته.'
      : 'You cannot return to a question after answering it.',
  ];
  return (
    <motion.div
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.35, ease: [0.22, 1, 0.36, 1] }}
      className="card max-w-2xl w-full mx-auto p-7 md:p-9"
      style={{ borderRadius: 20, direction: isAr ? 'rtl' : 'ltr' }}
    >
      <span className="text-label">{isAr ? 'تعليمات الجلسة' : 'Session brief'}</span>
      <h2 className="text-h2 mt-1 mb-1" style={{ color: 'var(--text-heading)' }}>
        {isAr ? 'قبل البدء، اقرأ القواعد' : 'Before you start, read the rules'}
      </h2>
      <p className="text-body-m mb-7" style={{ color: 'var(--text-muted)' }}>
        {isAr
          ? 'جلسة بسيطة، قواعد قليلة، ونتيجة موثوقة.'
          : 'Simple session, few rules, a credible outcome.'}
      </p>

      {/* At-a-glance */}
      <div className="grid grid-cols-2 gap-3 mb-6">
        <div className="surface-soft rounded-2xl px-5 py-4 flex items-center gap-3">
          <div className="w-9 h-9 rounded-full grid place-items-center shrink-0" style={{ background: 'var(--primary-tint)', color: 'var(--primary-deep)' }}>
            <Target className="w-4 h-4" />
          </div>
          <div>
            <div className="text-h4" style={{ color: 'var(--text-heading)' }}>20</div>
            <div className="text-caption">{isAr ? 'سؤالاً' : 'questions'}</div>
          </div>
        </div>
        <div className="surface-soft rounded-2xl px-5 py-4 flex items-center gap-3">
          <div className="w-9 h-9 rounded-full grid place-items-center shrink-0" style={{ background: 'var(--primary-tint)', color: 'var(--primary-deep)' }}>
            <Clock className="w-4 h-4" />
          </div>
          <div>
            <div className="text-h4" style={{ color: 'var(--text-heading)' }}>{isAr ? '٣٠' : '30'}</div>
            <div className="text-caption">{isAr ? 'دقيقة إجمالية' : 'minutes total'}</div>
          </div>
        </div>
      </div>

      {/* Integrity rules */}
      <div className="surface-soft rounded-2xl p-5 mb-6">
        <div className="flex items-center gap-2 mb-4">
          <ShieldCheck className="w-4 h-4" style={{ color: 'var(--primary)' }} />
          <span className="text-label" style={{ color: 'var(--text-heading)' }}>
            {isAr ? 'قواعد النزاهة' : 'Integrity rules'}
          </span>
        </div>
        <ul className="space-y-3">
          {rules.map((r, i) => (
            <li key={i} className="flex items-start gap-3">
              <span className="mt-1.5 w-1.5 h-1.5 rounded-full shrink-0" style={{ background: 'var(--primary)' }} />
              <p className="text-body-m leading-relaxed" style={{ color: 'var(--text-dim)' }}>{r}</p>
            </li>
          ))}
        </ul>
      </div>

      <label className="flex items-start gap-3 p-4 rounded-xl cursor-pointer mb-6" style={{ background: 'var(--bg-alt)', border: '1px solid var(--border-hairline)' }}>
        <input
          type="checkbox"
          checked={agreedToRules}
          onChange={(e) => setAgreedToRules(e.target.checked)}
          className="w-4 h-4 mt-1"
        />
        <span className="text-body-m" style={{ color: 'var(--text-heading)' }}>
          {isAr
            ? 'أوافق على الالتزام بهذه القواعد وأفهم أن الجلسة قد تُنهَى تلقائياً.'
            : 'I accept the rules and understand the session can auto-terminate.'}
        </span>
      </label>

      <button
        onClick={onStart}
        disabled={!agreedToRules || isLoading}
        className="btn btn-primary btn-lg w-full"
      >
        {isLoading ? (
          <>
            <Loader2 className="w-4 h-4 animate-spin" />
            {isAr ? 'يجري إعداد الأسئلة...' : 'Preparing your questions...'}
          </>
        ) : (
          <>
            <Play className={`w-4 h-4 ${isAr ? 'rotate-180' : ''}`} fill="currentColor" />
            {isAr ? 'بدء الجلسة الآن' : 'Begin session'}
          </>
        )}
      </button>

      {isLoading && (
        <p className="text-[0.75rem] text-center mt-3" style={{ color: 'var(--text-muted)' }}>
          {isAr
            ? 'يولّد Gemini مجموعة فريدة من الأسئلة لجلستك.'
            : 'Gemini is composing a unique question set for this session.'}
        </p>
      )}

      {isAdmin && (
        <button onClick={forceAdminPass} className="btn btn-ghost btn-sm w-full mt-3">
          {isAr ? 'تخطّي (مسؤول)' : 'Admin skip'}
        </button>
      )}
    </motion.div>
  );
};

const ProgressBar = ({ current, total }: { current: number; total: number }) => {
  const progress = (current / total) * 100;
  return (
    <div className="progress-track" style={{ height: 3 }}>
      <motion.div
        className="progress-fill"
        initial={{ width: 0 }}
        animate={{ width: `${progress}%` }}
        transition={{ duration: 0.6, ease: [0.22, 1, 0.36, 1] }}
      />
    </div>
  );
};

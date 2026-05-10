import React, { useState, useEffect, useRef, useCallback } from 'react';
import { AdminPanel } from './components/AdminPanel';
import { CourseViewer } from './components/CourseViewer';
import { Onboarding } from './components/Onboarding';
import { 
  Play, 
  CheckCircle, 
  TrendingUp, 
  Target, 
  Map, 
  ChevronRight,
  ChevronLeft,
  AlertTriangle,
  User,
  ShieldCheck,
  Activity,
  Download,
  Sun,
  Moon,
  Camera,
  Clock,
  Mail,
  AlertCircle,
  CheckSquare,
  Settings,
  Cpu,
  GraduationCap,
  Globe,
  ExternalLink,
  Sparkles,
  Award,
  Info
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import confetti from 'canvas-confetti';
import { generateQuizQuestions, GeneratedQuestion } from './services/geminiService';
import { doc, onSnapshot, setDoc, getDoc, serverTimestamp } from 'firebase/firestore';
import { useAuthState } from 'react-firebase-hooks/auth';
import { db, auth, loginWithGoogle, logout, handleFirestoreError } from './firebase';
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

import html2canvas from 'html2canvas';
import { jsPDF } from 'jspdf';
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
    <div className="h-56 w-full bg-card rounded-2xl p-4 border border-border shadow-inner mt-4 relative overflow-hidden">
      <div className="absolute top-2 left-4 text-[10px] font-bold text-slate-400 uppercase tracking-widest z-10">Earned Value Management (EVM) Engine</div>
      <ResponsiveContainer width="100%" height="100%" className="pt-4">
        <AreaChart data={data} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
          <defs>
            <linearGradient id="colorPV" x1="0" y1="0" x2="0" y2="1"><stop offset="5%" stopColor="#6366f1" stopOpacity={0.3}/><stop offset="95%" stopColor="#6366f1" stopOpacity={0}/></linearGradient>
            <linearGradient id="colorEV" x1="0" y1="0" x2="0" y2="1"><stop offset="5%" stopColor="#10b981" stopOpacity={0.3}/><stop offset="95%" stopColor="#10b981" stopOpacity={0}/></linearGradient>
          </defs>
          <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" opacity={0.3} vertical={false} />
          <XAxis dataKey="name" stroke="var(--text-dim)" fontSize={10} tickLine={false} axisLine={false} />
          <YAxis stroke="var(--text-dim)" fontSize={10} tickLine={false} axisLine={false} />
          <Tooltip 
            contentStyle={{ backgroundColor: 'var(--card)', border: '1px solid var(--border)', borderRadius: '12px', fontSize: '12px', color: 'var(--text)', boxShadow: '0 10px 15px -3px rgb(0 0 0 / 0.1)' }} 
            itemStyle={{ fontWeight: 'bold' }}
            cursor={{ stroke: 'var(--border)', strokeWidth: 1, strokeDasharray: '4 4' }}
          />
          <Area type="monotone" dataKey="PV" name="Planned (PV)" stroke="#6366f1" strokeWidth={2} fillOpacity={1} fill="url(#colorPV)" />
          <Area type="monotone" dataKey="EV" name="Earned (EV)" stroke="#10b981" strokeWidth={2} fillOpacity={1} fill="url(#colorEV)" />
          <Line type="monotone" dataKey="AC" name="Actual (AC)" stroke="#ef4444" strokeWidth={2} dot={{ r: 4, strokeWidth: 2, fill: 'var(--card)' }} activeDot={{ r: 6 }} />
        </AreaChart>
      </ResponsiveContainer>
    </div>
  );
};

const GISVisual = () => (
  <div className="w-full h-56 rounded-2xl bg-bg border border-border overflow-hidden relative shadow-inner mt-4 group">
    <div className="absolute inset-0 opacity-10 group-hover:opacity-20 transition-opacity duration-1000" style={{ backgroundImage: 'radial-gradient(var(--text-dim) 1px, transparent 1px)', backgroundSize: '24px 24px' }} />
    <div className="absolute top-4 left-4 z-10 px-3 py-1 bg-border/50 text-text text-[10px] font-black uppercase tracking-widest rounded-lg border border-border backdrop-blur-sm">
      Tornix Spatial Core - Flood Analysis
    </div>
    <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
       <div className="relative w-full h-full max-w-sm mx-auto">
          {/* Heatmap simulation */}
          <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-48 h-48 bg-emerald-500/10 rounded-full blur-3xl " />
          <div className="absolute top-1/3 left-1/4 w-32 h-32 bg-amber-500/20 rounded-full blur-2xl" />
          <div className="absolute bottom-1/4 right-1/4 w-40 h-40 bg-rose-500/20 rounded-full blur-2xl" />
          
          {[...Array(6)].map((_, i) => (
            <motion.div 
              key={i}
              className="absolute w-3 h-3 bg-indigo-400 rounded-full shadow-[0_0_10px_rgba(99,102,241,0.8)] border-2 border-slate-900"
              style={{ top: `${20 + (i*15)%60}%`, left: `${15 + (i*35)%70}%` }}
              animate={{ y: [0, -5, 0] }}
              transition={{ repeat: Infinity, duration: 2 + i*0.2, ease: "easeInOut" }}
            />
          ))}
          <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-32 h-32 border border-indigo-500/30 rounded-full animate-ping" style={{ animationDuration: '3s' }} />
          <Map className="w-10 h-10 text-indigo-400 absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 drop-shadow-[0_0_15px_rgba(99,102,241,0.5)]" />
       </div>
    </div>
  </div>
);

const StrategyVisual = () => (
  <div className="w-full grid grid-cols-2 md:grid-cols-4 gap-4 h-auto mt-4">
    {[
      { title: 'Time', color: 'bg-indigo-500', from: 'from-indigo-600', to: 'to-indigo-400', val: 85 },
      { title: 'Cost', color: 'bg-emerald-500', from: 'from-emerald-600', to: 'to-emerald-400', val: 92 },
      { title: 'Quality', color: 'bg-amber-500', from: 'from-amber-600', to: 'to-amber-400', val: 78 },
      { title: 'Risk', color: 'bg-rose-500', from: 'from-rose-600', to: 'to-rose-400', val: 95 }
    ].map((item, idx) => (
       <div key={idx} className="bg-card border border-border rounded-2xl p-5 flex flex-col justify-center items-center gap-3 shadow-sm hover:shadow-md transition-shadow relative overflow-hidden">
          <div className="absolute -top-6 -right-6 w-16 h-16 rounded-full opacity-5 blur-xl bg-current text-indigo-500" />
          <span className="text-[10px] text-text-dim uppercase font-black tracking-widest">{item.title}</span>
          <span className="text-2xl font-display font-bold text-text">{item.val}%</span>
          <div className="w-full bg-border/50 h-1.5 rounded-full mt-1 overflow-hidden">
            <motion.div 
              initial={{ width: 0 }}
              animate={{ width: `${item.val}%` }}
              transition={{ duration: 1.5, delay: idx * 0.1, ease: 'easeOut' }}
              className={`h-full bg-gradient-to-r ${item.from} ${item.to}`}
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
  const [nameY, setNameY] = useState(Number(localStorage.getItem('admin_cert_name_y') || 33));
  const [serialY, setSerialY] = useState(Number(localStorage.getItem('admin_cert_serial_y') || 90));
  
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
      setNameY(Number(localStorage.getItem('admin_cert_name_y') || 33));
      setSerialY(Number(localStorage.getItem('admin_cert_serial_y') || 90));
      setFontFamily(localStorage.getItem('admin_cert_font') || "font-montserrat");
      setNameColor(localStorage.getItem('admin_cert_name_color') || "#0f172a");
      setSerialColor(localStorage.getItem('admin_cert_serial_color') || "#1e293b");
      setSerialFontSize(Number(localStorage.getItem('admin_cert_serial_size') || 20));
    };
    window.addEventListener('branding-updated', updater);

    // Sync from Firestore continuously
    const unsub = onSnapshot(doc(db, 'settings', 'branding'), async (docSnap) => {
       if (docSnap.exists()) {
           const data = docSnap.data();
           
           const processField = async (key: string, val: any) => {
               if (val && typeof val === 'object' && val.isChunked) {
                   let fullString = '';
                   for (let i = 0; i < val.chunks; i++) {
                       const chunkSnap = await getDoc(doc(db, 'settings', `branding_${key}_${i}`));
                       if (chunkSnap.exists()) {
                           fullString += chunkSnap.data().data;
                       }
                   }
                   return fullString;
               }
               return val;
           };

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

           if (data.logo) { 
               const fullLogo = await processField('logo', data.logo);
               safeSetItem('admin_logo', fullLogo); setLogo(fullLogo); 
           }
           if (data.badge) { 
               const fullBadge = await processField('badge', data.badge);
               safeSetItem('admin_badge', fullBadge); setBadge(fullBadge); 
           }
           if (data.certBg) { 
               const fullCert = await processField('certBg', data.certBg);
               safeSetItem('admin_cert_bg', fullCert); setCertBg(fullCert); 
           }
           
           if (data.nameY !== undefined) { safeSetItem('admin_cert_name_y', data.nameY.toString()); setNameY(data.nameY); }
           if (data.serialY !== undefined) { safeSetItem('admin_cert_serial_y', data.serialY.toString()); setSerialY(data.serialY); }
           if (data.fontFamily) { safeSetItem('admin_cert_font', data.fontFamily); setFontFamily(data.fontFamily); }
           if (data.nameColor) { safeSetItem('admin_cert_name_color', data.nameColor); setNameColor(data.nameColor); }
           if (data.serialColor) { safeSetItem('admin_cert_serial_color', data.serialColor); setSerialColor(data.serialColor); }
           if (data.serialFontSize) { safeSetItem('admin_cert_serial_size', data.serialFontSize.toString()); setSerialFontSize(data.serialFontSize); }
           
           if (data.emailServiceId) safeSetItem('admin_email_service_id', data.emailServiceId);
           if (data.emailTemplateId) safeSetItem('admin_email_template_id', data.emailTemplateId);
           if (data.emailPublicKey) safeSetItem('admin_email_public_key', data.emailPublicKey);
       }
    }, (err) => {
       console.warn("Could not load branding from Firestore realtime", err);
       handleFirestoreError(err, 'get', 'settings/branding');
    });

    return () => {
      window.removeEventListener('branding-updated', updater);
      unsub();
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

const TornixLogo = () => {
  const { logo, badge } = useBranding();
  return (
  <div className="flex items-center gap-0 cursor-pointer group">
    <div className="flex justify-end pr-3 w-[100px] md:w-[120px]">
        <img 
          src={logo} 
          alt="Tornix Logo" 
          className="h-10 w-auto object-contain group-hover:scale-105 transition-transform duration-500" 
          referrerPolicy="no-referrer"
        />
    </div>
    <div className="h-6 w-px bg-slate-400/30 shrink-0" />
    <div className="flex justify-start pl-3 w-[100px] md:w-[120px]">
        <img 
          src={badge} 
          alt="TCP Certified Practitioner Badge" 
          className="h-10 w-auto object-contain group-hover:rotate-12 transition-transform duration-500 drop-shadow-md" 
          referrerPolicy="no-referrer"
        />
    </div>
  </div>
  );
};

export default function App() {
  const [showAdmin, setShowAdmin] = useState(false);
  const [showCourse, setShowCourse] = useState(false);
  const [showOnboarding, setShowOnboarding] = useState(false);

  useEffect(() => {
    const hasSeen = localStorage.getItem('tornix_onboarded');
    if (!hasSeen) setShowOnboarding(true);
  }, []);

  const { logo: currentLogo, badge: currentBadge, certBg, nameY, serialY, fontFamily, nameColor, serialColor, serialFontSize } = useBranding();
  
  // Auth state
  const [user, authLoading] = useAuthState(auth);
  
  const [step, setStep] = useState<'welcome' | 'camera_check' | 'orientation' | 'quiz' | 'result' | 'terminated'>('welcome');
  const [questions, setQuestions] = useState<Question[]>([]);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [userAnswers, setUserAnswers] = useState<UserAnswer[]>([]);
  const [score, setScore] = useState(0);
  const [userName, setUserName] = useState('');
  const [userEmail, setUserEmail] = useState('');
  const [userPhoto, setUserPhoto] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [lang, setLang] = useState<'ar' | 'en'>('ar');
  const [theme, setTheme] = useState<'light' | 'dark'>('dark');
  
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
  const certRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
     if (user) {
         setUserName(user.displayName || '');
         setUserEmail(user.email || '');
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
    document.documentElement.setAttribute('data-theme', theme);
    document.documentElement.dir = lang === 'ar' ? 'rtl' : 'ltr';
  }, [theme, lang]);

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
        try {
            await loginWithGoogle();
        } catch(e) {
            console.error(e);
            return;
        }
    }
    setStep('camera_check');
  };

  const saveAssessmentToCloud = async (finalScore: number, status: "completed" | "terminated") => {
    if (user) {
       try {
           const assessmentId = `assess_${Date.now()}`;
           
           // Store basic answers directly in document, but limit size just in case
           const condensedAnswers = userAnswers.map(ua => ({
               questionId: ua.questionId,
               category: ua.category || '',
               timeSpent: ua.timeSpent,
               isCorrect: ua.isCorrect,
               selectedId: ua.selectedId
           }));

           await setDoc(doc(db, "users", user.uid, "assessments", assessmentId), {
              userId: user.uid,
              userEmail: user.email || userEmail,
              userName: user.displayName || userName || "Student",
              userPhoto: userPhoto || "",
              score: finalScore,
              integrityScore: integrityScore,
              serialNumber: generateSerial(),
              status: status,
              answers: condensedAnswers,
              questionsCount: questions.length,
              createdAt: serverTimestamp()
           });
       } catch(err) {
           console.error("Failed to save assessment to Cloud", err);
           handleFirestoreError(err, 'create', `users/${user.uid}/assessments`);
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

  const generateCanvas = async () => {
    if (!certRef.current) return null;
    
    // Create a deep clone
    const clone = certRef.current.cloneNode(true) as HTMLElement;
    
    // Remove fixed/relative positioning that might interfere
    clone.className = 'bg-white';
    clone.style.position = 'absolute';
    clone.style.left = '0';
    clone.style.top = '0';
    clone.style.width = '2480px';
    clone.style.height = '3508px';
    clone.style.zIndex = '-9999';
    clone.style.visibility = 'visible';
    clone.style.overflow = 'hidden';
    
    // Crucially: Fix Container Query units into absolute pixels for capture
    // html2canvas doesn't support cqw units well
    const fixCQW = (el: HTMLElement) => {
      const cqwToPx = (val: string) => {
        if (!val || !val.includes('cqw')) return val;
        const num = parseFloat(val);
        // Base width is 2480px, so 1cqw = 24.8px
        return `${num * 24.8}px`;
      };
      
      if (el.style.fontSize) el.style.fontSize = cqwToPx(el.style.fontSize);
      
      Array.from(el.children).forEach(child => fixCQW(child as HTMLElement));
    };
    fixCQW(clone);

    document.body.appendChild(clone);
    
    // Give time for images/fonts to render
    await new Promise(r => setTimeout(r, 1000));
    
    try {
      const canvas = await html2canvas(clone, { 
        scale: 1, 
        useCORS: true, 
        allowTaint: true,
        logging: false,
        width: 2480,
        height: 3508,
        windowWidth: 2480,
        windowHeight: 3508,
        x: 0,
        y: 0,
        scrollX: 0,
        scrollY: 0
      });
      return canvas;
    } catch(err) {
      console.error("Failed generating image.", err);
      return null;
    } finally {
      document.body.removeChild(clone);
    }
  };

  const downloadCertificatePNG = async () => {
    const canvas = await generateCanvas();
    if (!canvas) return;
    const link = document.createElement('a');
    link.download = `Tornix_Access_Pass_${userName.replace(/\s+/g, '_')}.png`;
    link.href = canvas.toDataURL('image/png', 1.0);
    link.click();
  };

  const downloadCertificatePDF = async () => {
    const canvas = await generateCanvas();
    if (!canvas) return;
    const imgData = canvas.toDataURL('image/png', 1.0);
    // A4 Portrait: 210x297 mm
    const pdf = new jsPDF({
      orientation: 'portrait',
      unit: 'mm',
      format: 'a4'
    });
    pdf.addImage(imgData, 'PNG', 0, 0, 210, 297);
    pdf.save(`Tornix_Access_Pass_${userName.replace(/\s+/g, '_')}.pdf`);
  };

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

  return (
    <div className="min-h-screen w-full flex flex-col no-print">
      <nav className="h-auto md:h-16 py-4 md:py-0 border-b border-border bg-bg/80 backdrop-blur-md sticky top-0 z-[100]">
        <div className="w-full max-w-6xl mx-auto px-6 md:px-8 h-full flex flex-col md:flex-row items-center justify-between relative space-y-4 md:space-y-0">
          <TornixLogo />
          
          {/* Visual Progress Path */}
          <div className="hidden lg:flex items-center absolute left-1/2 -translate-x-1/2 top-1/2 -translate-y-1/2" dir={lang === 'ar' ? 'rtl' : 'ltr'}>
          {['المرحلة الأولى', 'التحقق', 'التوجيه', 'الاختبار', 'النتائج'].map((label, idx) => (
             <div key={idx} className="flex items-center">
                <div className={`px-2 py-1 rounded-full text-[10px] font-bold ${getStepIndex() === idx ? 'bg-text text-bg' : getStepIndex() > idx ? 'text-primary' : 'text-text-dim'}`}>
                   {lang === 'ar' ? label : ['Welcome', 'Verify', 'Setup', 'Quiz', 'Result'][idx]}
                </div>
                {idx < 4 && (lang === 'ar' 
                  ? <ChevronLeft className={`w-3 h-3 mx-1 ${getStepIndex() > idx ? 'text-primary' : 'text-border'}`} /> 
                  : <ChevronRight className={`w-3 h-3 mx-1 ${getStepIndex() > idx ? 'text-primary' : 'text-border'}`} />
                )}
             </div>
          ))}
        </div>
        <div className="flex items-center gap-4">
          <button 
            onClick={() => setShowCourse(true)}
            className="hidden sm:flex items-center gap-2 px-4 py-2 bg-primary/10 text-primary rounded-xl font-bold text-xs hover:bg-primary/20 transition-all border border-primary/20"
          >
            <Info className="w-4 h-4" />
            {lang === 'ar' ? 'عن تورنكس' : 'About Tornix'}
          </button>
          <div className="flex bg-border/50 p-1 rounded-xl border border-border">
            <button 
              onClick={() => setLang('ar')}
              className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all ${lang === 'ar' ? 'bg-text text-bg shadow-sm' : 'text-text-dim hover:text-text'}`}
            >عربي</button>
            <button 
              onClick={() => setLang('en')}
              className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all ${lang === 'en' ? 'bg-text text-bg shadow-sm' : 'text-text-dim hover:text-text'}`}
            >EN</button>
          </div>
          <button 
            onClick={() => setTheme(prev => prev === 'dark' ? 'light' : 'dark')}
            className="w-10 h-10 rounded-xl bg-border/50 border border-border flex items-center justify-center text-text-dim hover:text-text shrink-0 transition-all"
          >
            {theme === 'dark' ? <Sun className="w-5 h-5" /> : <Moon className="w-5 h-5" />}
          </button>
          {step === 'quiz' && (
            <div className="hidden md:flex flex-col items-end mr-4">
              <span className="text-[10px] text-text-dim/60 uppercase font-black tracking-widest leading-none">Time Remaining</span>
              <span className={`text-sm font-bold flex items-center gap-1 font-mono ${globalTimeLeft < 300 ? 'text-rose-500 animate-pulse' : 'text-text'}`}>
                <Clock className="w-4 h-4" />
                {Math.floor(globalTimeLeft / 60).toString().padStart(2, '0')}:{(globalTimeLeft % 60).toString().padStart(2, '0')}
              </span>
            </div>
          )}
          {step === 'quiz' && (
            <div className="hidden md:flex flex-col items-end">
              <span className="text-[10px] text-text-dim/60 uppercase font-black tracking-widest leading-none">Status</span>
              <span className="text-xs text-success font-bold flex items-center gap-1"><div className="w-1.5 h-1.5 bg-success rounded-full animate-pulse"/> {lang === 'ar' ? 'جلسة نشطة' : 'LIVE'}</span>
            </div>
          )}
        </div>
        </div>
      </nav>

      <main className="flex-1 bg-bg relative">
        <div className={`w-full p-6 md:p-8 max-w-6xl mx-auto min-h-[calc(100vh-64px)] ${step === 'quiz' ? 'grid grid-cols-1 lg:grid-cols-[280px_1fr] gap-8' : 'flex flex-col items-center justify-center'}`}>
          {step === 'quiz' && (
            <aside className="sidebar-container no-print hidden lg:flex h-[calc(100vh-140px)] sticky top-24">
              <div className="w-full h-full flex flex-col bg-card border border-border shadow-sm rounded-2xl overflow-hidden">
                <div className="p-6 border-b border-border bg-gradient-to-br from-[#101010] to-[#252525] text-white">
                  <div className="flex items-center gap-3 mb-2">
                    <img src={currentLogo} className="w-8 h-8 object-contain brightness-0 invert" alt="Tornix" />
                    <div>
                      <h3 className="text-xs font-black uppercase tracking-widest leading-none">{lang === 'ar' ? 'سير التقييم' : 'Assessment Track'}</h3>
                      <p className="text-[10px] text-white/70 mt-1">{lang === 'ar' ? 'متابعة مراحل الجلسة' : 'Session node tracking'}</p>
                    </div>
                  </div>
                </div>
                <div className="flex-1 flex flex-col gap-2 p-4 overflow-y-auto custom-scrollbar bg-bg/50">
                  {questions.map((q, idx) => {
                    const isCompleted = userAnswers.length > idx;
                    const isActive = currentIndex === idx && step === 'quiz';
                    return (
                      <div 
                        key={idx} 
                        className={`p-3 rounded-xl flex items-center gap-4 transition-all duration-300 ${isActive ? 'bg-primary-dim shadow-md border border-primary/20 transform scale-[1.02] text-primary' : isCompleted ? 'opacity-80 text-text hover:bg-border/30' : 'opacity-40 grayscale text-text-dim'}`}
                      >
                        <div className={`w-8 h-8 rounded-lg flex items-center justify-center shrink-0 shadow-sm ${isActive ? 'bg-primary text-white' : isCompleted ? 'bg-success/20 text-success' : 'bg-border/50 text-text-dim'}`}>
                           {isCompleted ? <CheckCircle className="w-4 h-4" /> : <Target className="w-4 h-4" />}
                        </div>
                        <div className="flex flex-col overflow-hidden">
                          <span className={`text-[10px] uppercase font-bold tracking-wider leading-none mb-1 truncate ${isActive ? 'text-inherit' : 'text-text-dim'}`}>Q {idx + 1} • {q.category}</span>
                          <span className={`text-[11px] font-medium truncate ${isActive ? 'opacity-80' : ''}`}>{lang === 'ar' ? 'نقطة تحقق' : 'Checkpoint'}</span>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            </aside>
          )}

          <div className="flex-1 w-full max-w-4xl mx-auto flex flex-col pb-10">
            <AnimatePresence mode="wait">
              {step === 'welcome' && (
                <motion.div 
                  key="welcome"
                  initial={{ opacity: 0, y: 30 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -30 }}
                  className="max-w-2xl w-full mx-auto text-center space-y-12 py-12"
                >
                  <div className="space-y-6 px-4">
                    <motion.div 
                      initial={{ scale: 0.5, rotate: -15, opacity: 0 }}
                      animate={{ scale: 1, rotate: 0, opacity: 1 }}
                      transition={{ type: "spring", stiffness: 200, damping: 15 }}
                      className="flex items-center justify-center p-6 bg-border/20 border border-border/50 rounded-[2rem] shadow-sm mb-10 gap-0 overflow-hidden relative max-w-sm mx-auto"
                    >
                      <div className="flex-1 flex justify-end pr-5 md:pr-8">
                          <img src={currentLogo} className="h-20 md:h-24 w-auto max-w-[120px] object-contain relative z-10" referrerPolicy="no-referrer" />
                      </div>
                      <div className="h-12 md:h-16 w-px bg-border/50 relative z-10 shrink-0" />
                      <div className="flex-1 flex justify-start pl-5 md:pl-8">
                          <img 
                            src={currentBadge} 
                            alt="TCP Certified Practitioner Badge" 
                            className="h-20 md:h-24 w-auto max-w-[120px] object-contain drop-shadow-md relative z-10" 
                            referrerPolicy="no-referrer"
                          />
                      </div>
                    </motion.div>
                    <h1 className="text-5xl md:text-6xl font-bold tracking-tight text-text mb-4 leading-tight">
                      Tornix <span className="ai-gradient-text uppercase">Professional</span> <br/>
                      <span className="text-2xl md:text-3xl font-display font-medium text-text-dim mt-2 block opacity-90">{lang === 'ar' ? 'مركز التقييم المعتمد' : 'Assessment Center'}</span>
                    </h1>
                    <p className="text-text-dim text-lg md:text-xl max-w-2xl mx-auto leading-relaxed mt-4">
                      {lang === 'ar' 
                        ? 'نظام التقييم المتكامل لقياس كفاءة مديري المشاريع في استخدام بيئة Tornix الذكية وتطبيق معايير الإدارة العالمية.'
                        : 'Integrated assessment system to measure PM proficiency in the Tornix ecosystem and global management standards.'}
                    </p>
                  </div>

                  <div className="max-w-md mx-auto space-y-4 bg-card p-8 md:p-10 rounded-2xl border border-border shadow-sm">
                    {!user ? (
                        <div className="text-center">
                            <button 
                                onClick={async () => {
                                    try {
                                        await loginWithGoogle();
                                    } catch (e) {
                                        console.error(e);
                                    }
                                }}
                                className="w-full min-h-[56px] py-3 rounded-2xl flex items-center justify-center gap-3 transition-all duration-300 text-body-l font-bold mt-8 btn-glass"
                            >
                                <User className="w-6 h-6" />
                                {lang === 'ar' ? 'تسجيل الدخول عبر Google' : 'Login with Google'}
                            </button>
                        </div>
                    ) : (
                        <>
                            <div className="relative group">
                            <User className={`absolute ${lang === 'ar' ? 'right-5' : 'left-5'} top-1/2 -translate-y-1/2 w-6 h-6 text-slate-500 group-focus-within:text-indigo-400 transition-all`} />
                            <input 
                                type="text" 
                                placeholder={lang === 'ar' ? "الاسم الكامل (كما في جواز السفر)..." : "Full Name (As per passport)..."}
                                value={userName}
                                onChange={(e) => setUserName(e.target.value)}
                                className={`w-full min-h-[56px] py-3 px-14 bg-bg border border-border rounded-2xl focus:outline-none focus:ring-2 focus:ring-primary/40 transition-all text-text placeholder:text-text-dim font-bold text-center text-body-l`}
                            />
                            <p className="text-xs text-text-dim px-2 text-center mt-2 mb-4">
                                {lang === 'ar' ? 'تأكيد: سيتم إصدار الشهادة وطباعتها بهذا الاسم (يفضل أن يكون ثلاثياً أو رباعياً وبنفس صيغة جواز السفر).' : 'Important: Your certificate will be issued with this exact name (preferably 3-4 words as per passport).'}
                            </p>
                            </div>
                            
                            <div className="relative group mb-8">
                            <Mail className={`absolute ${lang === 'ar' ? 'right-5' : 'left-5'} top-1/2 -translate-y-1/2 w-6 h-6 text-slate-500 group-focus-within:text-indigo-400 transition-all`} />
                            <input 
                                type="email" 
                                placeholder={lang === 'ar' ? "البريد الإلكتروني المؤسسي..." : "Corporate Email Address..."}
                                value={userEmail}
                                onChange={(e) => setUserEmail(e.target.value)}
                                disabled
                                className={`w-full min-h-[56px] py-3 px-14 bg-bg border border-border rounded-2xl opacity-70 cursor-not-allowed text-center font-bold text-body-l text-text`}
                            />
                            </div>

                            <button 
                            onClick={handleRegistrationSubmit}
                            disabled={!userName.trim()}
                            className={`w-full min-h-[56px] py-3 rounded-2xl flex items-center justify-center gap-3 transition-all duration-300 text-body-l font-bold mt-8 ${
                                userName.trim()
                                ? 'btn-glass' 
                                : 'bg-border text-text-dim cursor-not-allowed opacity-50'
                            }`}
                            >
                            <>
                                <ChevronRight className={`w-6 h-6 ${lang === 'ar' ? 'rotate-180' : 'rotate-0'}`} fill="currentColor" />
                                {lang === 'ar' ? 'المتابعة للتحقق' : 'Proceed to Verification'}
                            </>
                            </button>

                            <div className="mt-8 pt-6 border-t border-border">
                               <button 
                                 onClick={() => setShowCourse(true)}
                                 className="w-full min-h-[56px] py-3 rounded-2xl flex items-center justify-center gap-3 transition-all duration-300 text-body-l font-bold bg-bg border-2 border-border hover:border-primary border-dashed group"
                                >
                                  <div className="w-10 h-10 rounded-full bg-primary/10 flex items-center justify-center group-hover:scale-110 transition-transform shrink-0">
                                    <Sparkles className="w-5 h-5 text-primary" />
                                  </div>
                                  <div className="flex flex-col items-start leading-tight">
                                    <span className="text-primary">{lang === 'ar' ? 'مركز المعرفة والمواد التعليمية' : 'Knowledge Center & Training'}</span>
                                    <span className="text-[10px] text-text-dim uppercase tracking-widest">{lang === 'ar' ? 'اكتشف عبقرية تورنكس' : 'Discover Tornix Brilliance'}</span>
                                  </div>
                               </button>
                            </div>
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
                  userEmail={userEmail}
                  forceAdminPass={forceAdminPass}
                />
              )}

              {step === 'quiz' && currentQuestion && (
                <motion.div 
                  key={currentQuestion.id}
                  initial={{ opacity: 0, x: 20 }}
                  animate={{ opacity: 1, x: 0 }}
                  exit={{ opacity: 0, x: -20 }}
                  className="w-full max-w-4xl mx-auto bg-card border border-border p-6 md:p-10 rounded-2xl shadow-sm flex flex-col min-h-[600px]"
                >
                  <ProgressBar current={currentIndex + 1} total={questions.length} />

                  <div className="flex justify-between items-center mb-8">
                    <div className="flex items-center gap-3">
                      <div className="px-5 py-2 bg-border/50 text-text rounded-2xl text-[9px] font-black uppercase tracking-widest border border-border shadow-sm">
                         TORNIX_SECURED_{currentQuestion.id}
                      </div>
                      {(userEmail === 'ahmed0ibrahim@gmail.com' || userEmail === 'ahmedzeroibrahim@gmail.com') && (
                         <button onClick={forceAdminPass} className="px-3 py-2 bg-text text-bg rounded-xl text-xs font-bold shadow-sm">
                           Admin Pass
                         </button>
                      )}
                    </div>
                    <div className="flex flex-col items-end">
                      <span className="text-[10px] text-text-dim uppercase font-black tracking-[0.2em] mb-1">{lang === 'ar' ? 'مرحلة التقييم' : 'Assessment Phase'}</span>
                      <span className="text-h4 text-text">{lang === 'ar' ? `السؤال رقم ${currentIndex + 1}` : `Question ${currentIndex + 1}`}</span>
                    </div>
                  </div>

                  <AnimatePresence>
                    {spamWarning && (
                      <motion.div 
                        initial={{ opacity: 0, y: -20 }}
                        animate={{ opacity: 1, y: 0 }}
                        exit={{ opacity: 0, y: -20 }}
                        className="w-full bg-rose-50 border border-border text-rose-500 p-4 rounded-2xl flex items-center justify-center gap-3 mb-6 dark:bg-rose-900/20"
                      >
                        <AlertTriangle className="w-5 h-5 shrink-0" />
                        <span className="text-sm font-bold font-mono">{spamWarning}</span>
                      </motion.div>
                    )}
                  </AnimatePresence>

                  <div className="space-y-10 flex-1 flex flex-col justify-center">
                    <h2 className={`text-h3 font-bold leading-relaxed text-text mt-4 ${lang === 'ar' ? 'text-right' : 'text-left'}`}>
                      {currentQuestion.question}
                    </h2>

                    <div className="w-full">
                      {currentQuestion.type === 'evm' && <EVMChart />}
                      {currentQuestion.type === 'visual' && <GISVisual />}
                      {(currentQuestion.category.includes('Intelligence') || currentQuestion.category.includes('Strategy')) && !currentQuestion.type && <StrategyVisual />}
                    </div>
                    
                    {!isEssayMode ? (
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mt-auto">
                        {currentQuestion.options.map((option, idx) => (
                          <button
                            key={idx}
                            onClick={() => handleAnswer(idx)}
                            className={`flex items-center gap-6 p-5 md:p-6 rounded-xl bg-card border border-border ${lang === 'ar' ? 'text-right' : 'text-left'} hover:border-primary hover:bg-primary-dim transition-all group relative overflow-hidden`}
                          >
                            <div className="w-10 h-10 rounded-xl bg-bg border border-border flex items-center justify-center font-display font-black text-text-dim group-hover:bg-primary group-hover:text-white transition-all shrink-0">
                              {String.fromCharCode(65 + idx)}
                            </div>
                            <span className="flex-1 text-body-l font-bold text-text leading-tight">{option}</span>
                            <ChevronRight className={`w-5 h-5 text-text-dim group-hover:text-text transition-all ${lang === 'ar' ? 'rotate-0' : 'rotate-180'}`} />
                          </button>
                        ))}
                      </div>
                    ) : (
                      <motion.div 
                        initial={{ opacity: 0, scale: 0.95 }}
                        animate={{ opacity: 1, scale: 1 }}
                        className="space-y-6 mt-auto"
                      >
                        <div className="p-4 bg-primary/5 border border-primary/20 rounded-2xl flex items-center gap-4">
                           <div className="w-12 h-12 bg-primary rounded-xl flex items-center justify-center text-white shrink-0 shadow-lg">
                              <Award className="w-6 h-6" />
                           </div>
                           <p className="text-sm font-bold text-primary leading-tight">
                              {lang === 'ar' 
                                ? "وضع الإجابة المقالية نشط: نظراً للتجاوزات، يجب عليك كتابة إجابة دقيقة تشرح المفهوم المطلوب. سيتم تقييم إجابتك بواسطة الذكاء الاصطناعي." 
                                : "Essay Mode Active: Due to violations, you must write a precise answer explaining the concept. Your response will be validated by AI."}
                           </p>
                        </div>
                        <textarea
                          value={essayAnswer}
                          onChange={(e) => setEssayAnswer(e.target.value)}
                          placeholder={lang === 'ar' ? "اكتب إجابتك هنا بالتفصيل..." : "Type your detailed answer here..."}
                          className="w-full min-h-[160px] p-6 bg-bg border-2 border-primary/30 rounded-2xl focus:ring-4 focus:ring-primary/10 focus:border-primary outline-none transition-all text-body-l font-medium placeholder:text-text-dim leading-relaxed"
                          disabled={isValidatingEssay}
                        />
                        <button
                          onClick={handleEssaySubmit}
                          disabled={!essayAnswer.trim() || isValidatingEssay}
                          className={`w-full py-5 rounded-2xl flex items-center justify-center gap-3 font-bold text-body-l transition-all shadow-lg ${isValidatingEssay ? 'bg-border text-text-dim cursor-wait' : 'btn-glass'}`}
                        >
                          {isValidatingEssay ? (
                             <>
                               <div className="w-5 h-5 border-2 border-text-dim border-t-text rounded-full animate-spin" />
                               {lang === 'ar' ? "جاري تقييم الإجابة..." : "Evaluating your answer..."}
                             </>
                          ) : (
                            <>
                              <CheckSquare className="w-6 h-6" />
                              {lang === 'ar' ? "تقديم الإجابة المقالية" : "Submit Essay Answer"}
                            </>
                          )}
                        </button>
                        <p className="text-[10px] text-center text-text-dim uppercase tracking-widest font-black opacity-60">
                           {lang === 'ar' ? "سيتم تحليل الكلمات المفتاحية والمعنى الجوهري للإجابة" : "AI will analyze keywords and core intent of your response"}
                        </p>
                      </motion.div>
                    )}
                  </div>
                </motion.div>
              )}

               {step === 'terminated' && (
                <div className="fixed inset-0 z-[200] bg-bg/95 backdrop-blur-3xl flex items-center justify-center p-6 no-print overflow-y-auto">
                  <motion.div 
                    initial={{ opacity: 0, scale: 0.9, y: 40 }}
                    animate={{ opacity: 1, scale: 1, y: 0 }}
                    className="bg-card w-full max-w-2xl border border-border p-10 md:p-14 shadow-sm relative rounded-2xl my-20 text-center"
                  >
                    <AlertTriangle className="w-24 h-24 text-rose-500 mx-auto mb-6" />
                    <h2 className="text-h2 font-bold text-text mb-4">
                      {lang === 'ar' ? 'تم إلغاء التقييم' : 'Assessment Terminated'}
                    </h2>
                    <p className="text-rose-500 text-body-l leading-relaxed bg-rose-50 p-6 rounded-2xl border border-rose-100 font-medium dark:bg-rose-900/20 dark:border-rose-900/30">
                      {terminationReason}
                    </p>
                    <button 
                      onClick={() => window.location.reload()}
                      className="mt-10 px-10 py-5 bg-border border border-border text-text rounded-2xl font-bold hover:bg-border/50 transition-all font-mono uppercase tracking-widest"
                    >
                      {lang === 'ar' ? 'العودة للصفحة الرئيسية' : 'Return to System Core'}
                    </button>
                  </motion.div>
                </div>
              )}

              {step === 'result' && (
                <div className="fixed inset-0 z-[200] bg-bg/95 backdrop-blur-3xl flex items-center justify-center p-6 no-print overflow-y-auto">
                  <motion.div 
                    initial={{ opacity: 0, scale: 0.9, y: 40 }}
                    animate={{ opacity: 1, scale: 1, y: 0 }}
                    className="bg-card border border-border max-w-4xl w-full p-10 md:p-14 shadow-sm rounded-2xl my-20"
                  >
                    <div className="mb-12 text-center">
                      <div className="inline-flex items-center gap-6 bg-bg p-6 rounded-2xl border border-border shadow-sm">
                        <BrandIcon className="h-16 w-auto" />
                        <div className="h-12 w-px bg-border" />
                        <img src={currentBadge} alt="TCP" className="h-16 w-auto object-contain" />
                      </div>
                    </div>

                    <div className="grid grid-cols-1 lg:grid-cols-2 gap-12 text-center">
                      <div className="space-y-10">
                        <div className="flex flex-col items-center justify-center p-6 rounded-2xl bg-bg border border-border">
                           {isEditingName ? (
                             <div className="flex items-center gap-2 w-full max-w-sm">
                               <input 
                                 type="text" 
                                 value={editedName} 
                                 onChange={(e) => setEditedName(e.target.value)}
                                 className="flex-1 bg-border/50 border border-border rounded-lg px-3 py-2 text-sm text-text focus:outline-none"
                                 placeholder="Enter your name"
                               />
                               <button onClick={saveEditedName} className="px-3 py-2 bg-primary text-bg rounded-lg text-sm font-bold">{lang === 'ar' ? 'حفظ' : 'Save'}</button>
                             </div>
                           ) : (
                             <div className="flex items-center gap-3">
                               <p className="text-xl font-bold font-display">{userName}</p>
                               <button onClick={() => setIsEditingName(true)} className="text-text-dim hover:text-primary text-sm underline">
                                 {lang === 'ar' ? 'تعديل الاسم' : 'Edit Name'}
                               </button>
                             </div>
                           )}
                        </div>

                        <div className="flex justify-center gap-6">
                          <div className={`flex flex-col items-center justify-center p-6 rounded-2xl border ${score >= 60 ? 'border-primary' : 'border-rose-500'} flex-1`}>
                            <span className={`text-h1 tracking-normal ${score >= 60 ? 'text-text' : 'text-rose-500'}`}>{score}%</span>
                            <span className="text-[9px] text-text-dim uppercase font-black tracking-widest mt-2">{lang === 'ar' ? 'الدرجة التقنية' : 'Technical'}</span>
                          </div>
                          <div className={`flex flex-col items-center justify-center p-6 rounded-2xl border ${integrityScore >= 90 ? 'border-border' : 'border-orange-500'} flex-1`}>
                            <span className={`text-h1 tracking-normal ${integrityScore >= 90 ? 'text-text' : 'text-orange-500'}`}>{integrityScore}%</span>
                            <span className="text-[9px] text-text-dim uppercase font-black tracking-widest mt-2">{lang === 'ar' ? 'النزاهة' : 'Integrity'}</span>
                          </div>
                        </div>

                        <div className="h-64 w-full bg-bg rounded-2xl border border-border p-4">
                           <ResponsiveContainer width="100%" height="100%">
                             <RadarChart cx="50%" cy="50%" outerRadius="75%" data={getRadarData()}>
                               <PolarGrid stroke="var(--border)" opacity={0.5} />
                               <PolarAngleAxis dataKey="subject" tick={{ fill: 'var(--text-dim)', fontSize: 9, fontWeight: 700 }} />
                               <PolarRadiusAxis angle={30} domain={[0, 100]} tick={false} axisLine={false} />
                               <Radar name="Performance" dataKey="A" stroke="var(--text)" strokeWidth={3} fill="var(--text)" fillOpacity={0.2} />
                             </RadarChart>
                           </ResponsiveContainer>
                        </div>

                        <div className="space-y-4">
                          <h2 className="text-h3 font-bold text-text">
                            {score >= 60 
                              ? (lang === 'ar' ? 'أداء احترافي متميز! ✨' : 'Distinguished Professional Performance! ✨')
                              : (lang === 'ar' ? 'بحاجة لمراجعة أدق لعمليات النظام' : 'Needs closer review of system ops')}
                          </h2>
                          {integrityScore < 90 && (
                            <p className="text-orange-400 text-[11px] font-bold bg-orange-500/5 p-4 rounded-2xl border border-orange-500/10">
                               {lang === 'ar' ? 'تحذير النبض: تم رصد أنماط إجابة سريعة أو متكررة أثرت على تقييم النزاهة.' : 'Pulse Warning: Rapid answer patterns detected. Integrity impact logic applied.'}
                            </p>
                          )}
                        </div>
                      </div>

                      <div className="text-right space-y-6">
                        <h3 className="text-sm font-black uppercase tracking-widest text-text border-b border-border pb-3">
                          {lang === 'ar' ? 'تحليل الإخفاقات (الفجوات المعرفية)' : 'Failure Analysis (Knowledge Gaps)'}
                        </h3>
                        <div className="space-y-4 max-h-[400px] overflow-y-auto pr-2 custom-scrollbar">
                           {getRadarData().filter(d => d.A < 100).map((fail, i) => (
                             <div key={i} className="p-4 bg-bg border border-border rounded-2xl space-y-2">
                                <div className="flex justify-between items-center">
                                  <span className="text-xs font-black text-text uppercase tracking-tight">{fail.subject}</span>
                                  <span className="text-[10px] font-bold px-2 py-1 bg-border/50 text-text rounded-lg">
                                    {lang === 'ar' ? `${fail.wrongCount} خطأ` : `${fail.wrongCount} Errors`}
                                  </span>
                                </div>
                                <p className="text-[10px] text-text-dim leading-relaxed">
                                  {lang === 'ar' 
                                    ? `لقد تم رصد ضعف في فهم هذا القسم. ننصح بمراجعة الفيديو التدريبي الخاص بـ "${fail.subject}" لتعزيز كفاءة العمل.`
                                    : `Gaps identified in this node. Recommendation: Review training materials for "${fail.subject}" to enhance proficiency.`}
                                </p>
                             </div>
                           ))}
                           {getRadarData().every(d => d.A === 100) && (
                             <div className="p-10 text-center text-text font-bold border-2 border-dashed border-border rounded-2xl">
                                {lang === 'ar' ? 'لا توجد فجوات معرفية ملحوظة. استمر في هذا المستوى العالي!' : 'No significant knowledge gaps. Keep up the high standard!'}
                             </div>
                           )}
                        </div>
                      </div>
                    </div>

                    <div className="flex flex-col md:flex-row gap-4 mt-12">
                      {score >= 60 && (
                        <div className="flex-1 grid grid-cols-2 gap-4">
                           <button onClick={downloadCertificatePNG} className="py-4 px-2 rounded-2xl btn-glass font-bold flex items-center justify-center gap-2 transition-all text-sm">
                             <Download className="w-5 h-5" /> {lang === 'ar' ? 'تحميل (صورة)' : 'Download PNG'}
                           </button>
                           <button onClick={() => downloadCertificatePDF()} className="py-4 px-2 rounded-2xl bg-bg border border-border text-text font-bold flex items-center justify-center gap-2 hover:bg-border/50 transition-all text-sm">
                             <Download className="w-5 h-5" /> {lang === 'ar' ? 'نسخة (PDF)' : 'Download PDF'}
                           </button>
                           <button onClick={shareToLinkedIn} className="col-span-2 py-4 rounded-2xl bg-[#0a66c2] text-white font-bold flex items-center justify-center gap-3 hover:bg-[#004182] transition-all text-sm">
                             {lang === 'ar' ? 'مشاركة وإضافة إلى LinkedIn' : 'Add to LinkedIn Profile'}
                           </button>
                        </div>
                      )}
                      {score < 60 && (
                        <button onClick={() => setShowReview(!showReview)} className="flex-1 min-h-[64px] py-4 rounded-2xl bg-bg text-text-dim font-bold hover:bg-border transition-all border border-border text-body-l">
                          {lang === 'ar' ? (showReview ? 'إخفاء مراجعة الإجابات' : 'مراجعة الإجابات') : (showReview ? 'Hide Answers Review' : 'Review Answers')}
                        </button>
                      )}
                    </div>
                    {score >= 60 && (
                       <div className="mt-4">
                          <button onClick={() => setShowReview(!showReview)} className="w-full py-4 rounded-2xl bg-bg text-text-dim font-bold hover:bg-border transition-all border border-border text-body-l">
                            {lang === 'ar' ? (showReview ? 'إخفاء مراجعة الإجابات' : 'مراجعة الإجابات') : (showReview ? 'Hide Answers Review' : 'Review Answers')}
                          </button>
                       </div>
                    )}

                    {showReview && (
                      <div className="mt-8 pt-8 border-t border-border space-y-6">
                        <h3 className="text-xl font-bold">{lang === 'ar' ? 'مراجعة إجاباتك' : 'Review your answers'}</h3>
                        <div className="space-y-4">
                           {questions.slice(0, userAnswers.length).map((q, i) => {
                             const ua = userAnswers.find(ans => ans.questionId === q.id);
                             if (!ua) return null;
                             const isCorrect = ua.isCorrect;
                             return (
                               <div key={q.id} className={`p-5 rounded-2xl border ${isCorrect ? 'border-primary/20 bg-primary/5' : 'border-rose-500/20 bg-rose-500/5'}`}>
                                  <div className="flex justify-between items-start mb-3">
                                    <p className="font-bold text-sm leading-relaxed">{i + 1}. {q.question}</p>
                                    <div className={`px-2 py-1 rounded text-[10px] font-bold ${isCorrect ? 'bg-primary/20 text-primary' : 'bg-rose-500/20 text-rose-500'}`}>
                                      {isCorrect ? (lang === 'ar' ? 'صحيح' : 'Correct') : (lang === 'ar' ? 'خاطئ' : 'Incorrect')}
                                    </div>
                                  </div>
                                  <div className="space-y-2 mt-4 text-sm">
                                    <div className="flex gap-2">
                                      <span className="text-text-dim">{lang === 'ar' ? 'إجابتك:' : 'Your answer:'}</span>
                                      <span className={isCorrect ? 'text-text' : 'text-rose-500 line-through opacity-70'}>{q.options[ua.selectedOption]}</span>
                                    </div>
                                    {!isCorrect && (
                                      <div className="flex gap-2">
                                        <span className="text-text-dim">{lang === 'ar' ? 'الإجابة الصحيحة:' : 'Correct answer:'}</span>
                                        <span className="text-text font-medium">{q.options[q.correctAnswer]}</span>
                                      </div>
                                    )}
                                    <div className="mt-4 p-3 bg-bg border border-border rounded-lg text-xs leading-relaxed">
                                      <span className="font-bold mb-1 block opacity-70">{lang === 'ar' ? 'التفسير والمراجعة:' : 'Explanation:'}</span>
                                      {q.explanation}
                                    </div>
                                  </div>
                               </div>
                             );
                           })}
                        </div>
                      </div>
                    )}
                    <div className="mt-4">
                      <button onClick={resetQuiz} className="w-full min-h-[50px] py-4 rounded-xl text-text-dim hover:text-text font-bold transition-all text-sm">
                        {lang === 'ar' ? 'إعادة جلسة التقييم (مسح البيانات والبدء مجدداً)' : 'Reset Assessment Node (Clear all data)'}
                      </button>
                    </div>
                  </motion.div>
                </div>
              )}
            </AnimatePresence>
          </div>
        </div>
      </main>

      {/* PREMIUM FOOTER */}
      <footer className="w-full bg-bg border-t border-border mt-auto pt-24 pb-16 px-6 md:px-12 relative overflow-hidden">
        {/* Background Decorative Elements */}
        <div className="absolute top-0 left-1/4 w-[500px] h-[500px] bg-primary/5 rounded-full blur-[120px] -translate-y-1/2 opacity-60" />
        <div className="absolute bottom-0 right-1/4 w-[400px] h-[400px] bg-accent/5 rounded-full blur-[100px] translate-y-1/2 opacity-40" />
        
        <div className="max-w-7xl mx-auto relative z-10">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-8 mb-20">
            {/* Entity Card: Ailigent */}
            <motion.div 
              initial={{ opacity: 0, y: 20 }}
              whileInView={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.5, delay: 0.1 }}
              viewport={{ once: true }}
              className="group relative"
            >
              <div className="absolute inset-0 bg-gradient-to-br from-primary/10 to-transparent rounded-[2.5rem] blur-xl opacity-0 group-hover:opacity-100 transition-opacity duration-500" />
              <div className="glass p-8 h-full flex flex-col gap-6 relative border border-white/10 dark:border-white/5 hover:border-primary/30 transition-colors duration-500">
                <div className="flex items-center justify-between">
                  <div className="w-14 h-14 rounded-2xl bg-primary/10 flex items-center justify-center text-primary group-hover:scale-110 group-hover:rotate-3 transition-transform duration-500 shadow-inner">
                    <Cpu className="w-7 h-7" />
                  </div>
                  <div className="opacity-10 group-hover:opacity-30 transition-opacity">
                    <Sparkles className="w-8 h-8" />
                  </div>
                </div>
                <div>
                  <h4 className="font-display font-bold text-text text-xl mb-3 tracking-tight">{lang === 'ar' ? 'شركة الجنت للذكاء الاصطناعي' : 'Ailigent AI Company'}</h4>
                  <p className="text-text-dim text-sm leading-relaxed opacity-80">
                    {lang === 'ar' ? 'رائدة في تطوير حلول الذكاء الاصطناعي المخصصة للتعليم والأعمال والتحليلات المتقدمة.' : 'Leaders in developing custom AI solutions for education, business, and advanced analytics.'}
                  </p>
                </div>
                <div className="mt-auto">
                  <a href="https://ailigent.ai" target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-2 text-primary font-black text-[10px] uppercase tracking-[0.2em] border-b border-primary/20 pb-1 hover:border-primary transition-all">
                    Explore ailigent.ai <ExternalLink className="w-3 h-3" />
                  </a>
                </div>
              </div>
            </motion.div>

            {/* Entity Card: Professional Engineers */}
            <motion.div 
              initial={{ opacity: 0, y: 20 }}
              whileInView={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.5, delay: 0.2 }}
              viewport={{ once: true }}
              className="group relative"
            >
              <div className="absolute inset-0 bg-gradient-to-br from-indigo-500/10 to-transparent rounded-[2.5rem] blur-xl opacity-0 group-hover:opacity-100 transition-opacity duration-500" />
              <div className="glass p-8 h-full flex flex-col gap-6 relative border border-white/10 dark:border-white/5 hover:border-indigo-500/30 transition-colors duration-500">
                <div className="flex items-center justify-between">
                  <div className="w-14 h-14 rounded-2xl bg-indigo-500/10 flex items-center justify-center text-indigo-500 group-hover:scale-110 group-hover:-rotate-3 transition-transform duration-500 shadow-inner">
                    <GraduationCap className="w-7 h-7" />
                  </div>
                  <div className="opacity-10 group-hover:opacity-30 transition-opacity">
                    <Award className="w-8 h-8" />
                  </div>
                </div>
                <div>
                  <h4 className="font-display font-bold text-text text-xl mb-3 tracking-tight">{lang === 'ar' ? 'بروفشنال انجنيرز للتعليم' : 'Professional Engineers'}</h4>
                  <p className="text-text-dim text-sm leading-relaxed opacity-80">
                    {lang === 'ar' ? 'مؤسسة متخصصة في التأهيل المهني والتدريب الهندسي والإداري والتحليل الوظيفي المتطور.' : 'Specialized institution in professional qualification, engineering training, and advanced occupational analysis.'}
                  </p>
                </div>
                <div className="mt-auto">
                  <a href="https://professionalengineers.us" target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-2 text-indigo-500 font-black text-[10px] uppercase tracking-[0.2em] border-b border-indigo-500/20 pb-1 hover:border-indigo-500 transition-all">
                    professionalengineers.us <ExternalLink className="w-3 h-3" />
                  </a>
                </div>
              </div>
            </motion.div>

            {/* Entity Card: Tornix */}
            <motion.div 
              initial={{ opacity: 0, y: 20 }}
              whileInView={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.5, delay: 0.3 }}
              viewport={{ once: true }}
              className="group relative"
            >
              <div className="absolute inset-0 bg-gradient-to-br from-accent/10 to-transparent rounded-[2.5rem] blur-xl opacity-0 group-hover:opacity-100 transition-opacity duration-500" />
              <div className="glass p-8 h-full flex flex-col gap-6 relative border border-white/10 dark:border-white/5 hover:border-accent/30 transition-colors duration-500">
                <div className="flex items-center justify-between">
                  <div className="w-14 h-14 rounded-2xl bg-accent/10 flex items-center justify-center text-accent group-hover:scale-110 group-hover:rotate-6 transition-transform duration-500 shadow-inner">
                    <Globe className="w-7 h-7" />
                  </div>
                  <div className="opacity-10 group-hover:opacity-30 transition-opacity">
                    <Play className="w-8 h-8" />
                  </div>
                </div>
                <div>
                  <h4 className="font-display font-bold text-text text-xl mb-3 tracking-tight">{lang === 'ar' ? 'منصة تورنكس العالمية' : 'Tornix Global Platform'}</h4>
                  <p className="text-text-dim text-sm leading-relaxed opacity-80">
                    {lang === 'ar' ? 'المظلة العالمية لإدارة المشاريع والتقييم المهني المعتمد باستخدام الذكاء الاصطناعي.' : 'The global umbrella for project management and AI-powered certified professional assessment.'}
                  </p>
                </div>
                <div className="mt-auto">
                  <a href="https://tornix.ai" target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-2 text-accent font-black text-[10px] uppercase tracking-[0.2em] border-b border-accent/20 pb-1 hover:border-accent transition-all">
                    tornix.ai <ExternalLink className="w-3 h-3" />
                  </a>
                </div>
              </div>
            </motion.div>
          </div>

          {/* Elegant Status Bar */}
          <div className="flex flex-col md:flex-row items-center justify-between gap-10 pt-12 border-t border-border/40">
            <div className="flex flex-wrap justify-center items-center gap-8">
              <div className="flex items-center gap-3 px-5 py-2.5 bg-border/20 rounded-full border border-border/40 text-[10px] uppercase font-black tracking-widest text-text/60">
                <div className="w-2 h-2 rounded-full bg-success animate-pulse shadow-[0_0_8px_rgba(34,197,94,0.6)]" />
                <span>{lang === 'ar' ? 'الأنظمة نشطة' : 'SYSTEMS ACTIVE'}</span>
              </div>
              <div className="flex items-center gap-3 px-5 py-2.5 bg-border/20 rounded-full border border-border/40 text-[10px] uppercase font-black tracking-widest text-text-dim/60">
                <ShieldCheck className="w-4 h-4 text-primary/60" />
                <span>{lang === 'ar' ? 'بيانات مشفرة' : 'DATA ENCRYPTED'}</span>
              </div>
            </div>

            <div className="flex flex-col items-center md:items-end gap-3">
              <div className="flex items-center gap-4 text-[10px] font-mono tracking-tighter opacity-40">
                <span>VER: 4.2.0-STABLE</span>
                <span className="w-1 h-1 rounded-full bg-text-dim" />
                <span>LHR-DC-2</span>
              </div>
              <p className="text-[11px] font-display font-medium text-text mt-1 text-center md:text-right">
                © {new Date().getFullYear()} <span className="font-black text-primary">TORNIX GLOBAL</span>. 
                <span className="mx-2 text-text-dim/40">|</span> 
                {lang === 'ar' ? 'بواسطة الجنت وبروفشنال انجنيرز' : 'POWERED BY AILIGENT & PROFESSIONAL ENGINEERS'}
              </p>
            </div>
          </div>
        </div>

        {/* Floating Admin Trigger */}
        {(user?.email?.toLowerCase() === 'ahmed0ibrahim@gmail.com' || 
          user?.email?.toLowerCase() === 'ahmedzeroibrahim@gmail.com' || 
          userEmail?.toLowerCase() === 'ahmed0ibrahim@gmail.com' || 
          userEmail?.toLowerCase() === 'ahmedzeroibrahim@gmail.com') && (
            <button 
              onClick={() => setShowAdmin(true)}
              className="absolute top-8 right-8 w-12 h-12 rounded-2xl bg-card border border-border flex items-center justify-center text-text-dim hover:text-primary hover:bg-primary-dim hover:border-primary/30 transition-all duration-300 shadow-sm hover:shadow-xl hover:-translate-y-1 active:scale-95 z-50 group"
              title="Identity & Config Manager"
            >
              <Settings className="w-5 h-5 group-hover:rotate-90 transition-transform duration-500" />
            </button>
        )}
      </footer>

      {showAdmin && <AdminPanel onClose={() => setShowAdmin(false)} lang={lang} />}
      {showCourse && <CourseViewer onClose={() => setShowCourse(false)} lang={lang} />}
      {showOnboarding && (
        <Onboarding 
          lang={lang} 
          onComplete={() => {
            localStorage.setItem('tornix_onboarded', 'true');
            setShowOnboarding(false);
          }} 
        />
      )}

      {/* --- Certificate Template --- */}
      <div className="print-only" ref={certRef} style={{ containerType: 'inline-size' }}>
        {certBg ? (
          <div className="relative w-full h-full flex items-center justify-center bg-white overflow-hidden">
            <img crossOrigin="anonymous" src={certBg} className="absolute inset-0 w-full h-full object-contain" alt="Certificate Background" />
            <div className="absolute inset-x-0 w-full text-center z-10 flex flex-col items-center px-[10%]" style={{ top: `${nameY}%`, transform: 'translateY(-50%)' }}>
               <h1 
                 className={`font-bold text-slate-900 leading-tight m-0 ${fontFamily}`} 
                 style={{ 
                   color: nameColor, 
                   fontSize: userName.length > 25 ? '4cqw' : userName.length > 15 ? '5cqw' : '6.3cqw',
                   maxWidth: '100%',
                   wordBreak: 'break-word',
                   paddingBottom: '0.2em'
                 }}
               >
                 {userName}
               </h1>
            </div>
            <div className="absolute inset-x-0 w-full text-center pointer-events-none z-10" style={{ top: `${serialY}%`, transform: 'translateY(-50%)' }}>
               <p className={`font-bold tracking-widest leading-tight m-0 p-0 ${fontFamily}`} style={{ color: serialColor, fontSize: `${(serialFontSize / 794) * 100}cqw` }}>{generateSerial()}</p>
            </div>
          </div>
        ) : (
          <div className="border-[16px] border-solid border-slate-200 h-full w-full p-20 flex flex-col items-center justify-between text-slate-900 relative">
             <div className="text-center space-y-6">
                <div className="flex items-center justify-center gap-8 mx-auto">
                   <img crossOrigin="anonymous" src={currentLogo} alt="Tornix" className="h-24 w-auto object-contain grayscale invert brightness-0" referrerPolicy="no-referrer" style={{ filter: 'brightness(0)' }} />
                   <div className="h-16 w-px bg-slate-200" />
                   <img crossOrigin="anonymous" src={currentBadge} alt="TCP Badge" className="h-24 w-auto object-contain" referrerPolicy="no-referrer" />
                </div>
                <p className="text-xl font-mono uppercase tracking-[0.6em] font-black pt-4 text-slate-400">Enterprise Accreditation</p>
             </div>
             
             <div className="text-center space-y-10 my-10 max-w-4xl">
                <p className="text-h2 font-serif text-slate-500">Hereby Certifies That</p>
                <h1 className="text-h1 font-bold border-b-2 border-slate-300 pb-6 inline-block px-12 uppercase text-slate-900">{userName}</h1>
                <p className="text-h3 font-medium leading-relaxed text-slate-600">
                  Has successfully demonstrated technical proficiency in the Tornix Integrated Project Management environment, 
                  attaining a cumulative assessment score of <span className="font-black text-slate-900">{score}%</span>.
                </p>
             </div>

             <div className="w-full flex justify-between items-end border-t border-slate-200 pt-16">
                <div className="flex items-center gap-6">
                   {userPhoto && (
                     <img crossOrigin="anonymous" src={userPhoto} alt="Verified User" className="w-24 h-24 object-cover rounded-xl border border-slate-200" />
                   )}
                   <div className="text-left space-y-1">
                     <p className="text-[10px] uppercase font-black tracking-widest text-slate-400">Accreditation Date</p>
                     <p className="text-xl font-bold text-slate-800">{new Date().toLocaleDateString()}</p>
                     <p className="text-xs text-slate-500 font-mono mt-2">{userEmail}</p>
                   </div>
                </div>
                <div className="text-right space-y-2">
                   <p className="text-[10px] uppercase font-black tracking-widest text-slate-400">Authorized System</p>
                   <p className="text-body-l font-bold text-slate-800">TORNIX_CORE_AI_VERIFIED</p>
                   <p className="text-xs text-slate-500 font-mono mt-1 pt-2 border-t border-slate-100">{generateSerial()}</p>
                </div>
             </div>
          </div>
        )}
      </div>
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

  return (
    <motion.div 
      initial={{ opacity: 0, scale: 0.9 }}
      animate={{ opacity: 1, scale: 1 }}
      className="max-w-xl w-full mx-auto bg-card border border-border p-8 md:p-10 rounded-[3rem] shadow-2xl text-center"
    >
      <div className="w-16 h-16 bg-indigo-500/10 text-indigo-400 rounded-2xl mx-auto flex items-center justify-center mb-6">
        <Camera className="w-8 h-8" />
      </div>
      <h2 className="text-h3 font-bold text-text mb-2">{lang === 'ar' ? 'التحقق من الهوية' : 'Identity Verification'}</h2>
      <p className="text-text-dim mb-8">
        {lang === 'ar' 
          ? 'المتطلبات الأمنية للامتحان تتطلب التقاط صورة حية لتأكيد هويتك.' 
          : 'Security protocol requires a live snapshot to confirm your identity.'}
      </p>

      {error ? (
        <div className="bg-rose-500/10 text-rose-400 p-4 rounded-xl border border-rose-500/20 mb-6">{error}</div>
      ) : null}
      
      {photo ? (
        <div className="space-y-6">
          <img src={photo} alt="Snapshot" className="w-full h-64 object-cover rounded-3xl border border-border" />
          
          {isVerifying && (
             <div className="text-indigo-400 text-sm animate-pulse">
               {lang === 'ar' ? 'جاري التحقق من الصورة باستخدام الذكاء الاصطناعي...' : 'Verifying image securely with AI...'}
             </div>
          )}
          
          <div className="flex gap-4">
            <button 
              onClick={() => { setPhoto(null); window.location.reload(); }} // Simple reset
              disabled={isVerifying}
              className="flex-1 py-4 bg-bg border border-border rounded-xl font-bold hover:bg-border/50 text-text-dim disabled:opacity-50"
            >
              {lang === 'ar' ? 'إعادة الالتقاط' : 'Retake'}
            </button>
            <button 
              onClick={() => {
                if (photo && !error) onVerified(photo);
              }}
              disabled={isVerifying || !!error}
              className="flex-1 py-4 btn-glass rounded-xl font-bold flex items-center justify-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              <CheckCircle className="w-5 h-5" /> {lang === 'ar' ? 'تأكيد' : 'Confirm'}
            </button>
          </div>
        </div>
      ) : (
        <div className="space-y-6">
          <video ref={videoRef} autoPlay playsInline muted className="w-full h-64 object-cover rounded-xl border border-border bg-bg" />
          <button 
            onClick={capture}
            className="w-full min-h-[60px] py-3 btn-glass rounded-xl font-bold transition-all flex items-center justify-center gap-3 text-body-l"
          >
            <Camera className="w-6 h-6" /> {lang === 'ar' ? 'التقاط الصورة' : 'Take Snapshot'}
          </button>
        </div>
      )}
    </motion.div>
  );
};

const OrientationScreen = ({ lang, isLoading, agreedToRules, setAgreedToRules, onStart, userEmail, forceAdminPass }: { lang: 'ar'|'en', isLoading: boolean, agreedToRules: boolean, setAgreedToRules: (a:boolean)=>void, onStart: ()=>void, userEmail: string | null, forceAdminPass: ()=>void }) => {
  return (
    <motion.div 
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      className="max-w-3xl w-full mx-auto bg-card border border-border px-6 py-8 md:p-12 rounded-[2rem] shadow-sm text-right"
      style={{ direction: lang === 'ar' ? 'rtl' : 'ltr', textAlign: lang === 'ar' ? 'right' : 'left' }}
    >
      <div className="flex flex-col sm:flex-row items-start sm:items-center gap-5 mb-10 pb-8 border-b border-border/50">
        <div className="p-4 bg-text text-bg rounded-2xl shadow-sm relative overflow-hidden">
          <div className="absolute inset-0 bg-white/10" />
          <AlertCircle className="w-8 h-8 relative z-10" />
        </div>
        <div>
          <h2 className="text-3xl font-bold text-text mb-2 tracking-tight">{lang === 'ar' ? 'تعليمات التقييم' : 'Assessment Orientation'}</h2>
          <p className="text-text-dim text-lg">{lang === 'ar' ? 'قواعد التقييم الصارمة لبيئة تورنكس' : 'Tornix strict assessment rules'}</p>
        </div>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-8">
         <div className="p-6 bg-border/20 border border-border/50 rounded-2xl flex items-center gap-5 hover:bg-border/30 transition-colors">
            <div className="p-4 bg-card rounded-xl shadow-sm border border-border">
              <Target className="w-6 h-6 text-text" />
            </div>
            <div>
               <p className="font-bold text-lg text-text mb-0.5">{lang === 'ar' ? 'عدد الأسئلة' : 'Questions'}</p>
               <p className="text-sm font-medium text-text-dim">{lang === 'ar' ? '20 سؤال ضمن التقييم' : '20 Items in Assessment'}</p>
            </div>
         </div>
         <div className="p-6 bg-border/20 border border-border/50 rounded-2xl flex items-center gap-5 hover:bg-border/30 transition-colors">
            <div className="p-4 bg-card rounded-xl shadow-sm border border-border">
               <Clock className="w-6 h-6 text-text" />
            </div>
            <div>
               <p className="font-bold text-lg text-text mb-0.5">{lang === 'ar' ? 'الوقت المسموح' : 'Time Limit'}</p>
               <p className="text-sm font-medium text-text-dim">{lang === 'ar' ? '30 دقيقة للزمن الإجمالي' : '30 Minutes Global Time'}</p>
            </div>
         </div>
      </div>

      <div className="mb-10 bg-rose-50/50 dark:bg-rose-950/20 border border-rose-100 dark:border-rose-900 overflow-hidden p-6 md:p-8 rounded-2xl space-y-6">
        <h3 className="text-xl font-bold text-rose-600 dark:text-rose-400 flex items-center gap-3">
          <ShieldCheck className="w-6 h-6" />
          {lang === 'ar' ? 'قواعد النزاهة والإنهاء الآلي' : 'Integrity & Auto-Termination'}
        </h3>
        
        <ul className="space-y-4 text-rose-900/80 dark:text-rose-200/80 font-medium">
          <li className="flex items-start gap-3">
            <div className="mt-2 w-1.5 h-1.5 rounded-full bg-rose-500 shrink-0" />
            <p className="leading-relaxed text-sm md:text-base">{lang === 'ar' ? 'نمط الإجابة السريع جداً (أقل من 2.5 ثانية) يُمثل محاولة اختراق ويؤثر سلبياً.' : 'Ultra-fast answers (< 2.5s) are flagged as breaches and impact integrity score.'}</p>
          </li>
          <li className="flex items-start gap-3">
            <div className="mt-2 w-1.5 h-1.5 rounded-full bg-rose-500 shrink-0" />
            <p className="leading-relaxed text-sm md:text-base">{lang === 'ar' ? 'الإجابات المكررة بنفس الخيار بشكل متعاقب تلغي الجلسة مباشرة.' : 'Repeating the exact same option consecutively will terminate the session.'}</p>
          </li>
          <li className="flex items-start gap-3">
            <div className="mt-2 w-1.5 h-1.5 rounded-full bg-rose-500 shrink-0" />
            <p className="leading-relaxed text-sm md:text-base">{lang === 'ar' ? 'لا يمكن العودة للأسئلة السابقة بعد تأكيد الإجابة وتخطيها.' : 'You cannot return to previous questions once submitted.'}</p>
          </li>
        </ul>
      </div>

      <label className="flex items-center gap-4 p-5 bg-card border border-border cursor-pointer rounded-2xl hover:bg-border/30 transition-all mb-10 shadow-sm">
        <input 
          type="checkbox" 
          checked={agreedToRules} 
          onChange={(e) => setAgreedToRules(e.target.checked)}
          className="w-6 h-6 rounded text-text focus:ring-text border-border"
        />
        <span className="font-bold text-text cursor-pointer select-none">
          {lang === 'ar' ? 'أتعهد بالالتزام بالقواعد وفهمي لآلية الإنهاء التلقائي.' : 'I acknowledge the rules and agree to the auto-termination policy.'}
        </span>
      </label>

      <button 
        onClick={onStart}
        disabled={!agreedToRules || isLoading}
        className={`w-full min-h-[64px] py-4 px-6 rounded-2xl flex items-center justify-center gap-3 transition-all duration-300 text-lg font-bold shadow-sm ${
          agreedToRules && !isLoading
          ? 'bg-text text-bg hover:bg-text/90 shadow-md' 
          : 'bg-bg text-text-dim border border-border cursor-not-allowed opacity-50'
        }`}
      >
        {isLoading ? (
          <>
            <Activity className="w-6 h-6 animate-spin" />
            {lang === 'ar' ? 'جاري بناء التقييم المشفر...' : 'Securing Assessment...'}
          </>
        ) : (
          <>
            <Play className={`w-6 h-6 ${lang === 'ar' ? 'rotate-0' : 'rotate-180'}`} fill="currentColor" />
            {lang === 'ar' ? 'بدء جلسة التقييم الآن' : 'Initiate Assessment Session'}
          </>
        )}
      </button>
      {isLoading && (
        <p className="text-[10px] text-center mt-4 uppercase font-black tracking-[0.2em] animate-pulse ai-gradient-text">
          {lang === 'ar' ? 'Gemini يقوم الآن ببناء أسئلة فريدة لمنع التطابق...' : 'Gemini AI is constructing a unique, non-colliding assessment...'}
        </p>
      )}

      {(userEmail === 'ahmed0ibrahim@gmail.com' || userEmail === 'ahmedzeroibrahim@gmail.com') && (
         <button onClick={forceAdminPass} className="mt-4 px-4 py-3 bg-rose-500/10 text-rose-500 rounded-xl w-full font-bold transition-colors hover:bg-rose-500/20">
           {lang === 'ar' ? 'تجاوز التقييم (مسؤول)' : 'Admin Skip Assessment'}
         </button>
      )}
    </motion.div>
  );
};

const ProgressBar = ({ current, total }: { current: number; total: number }) => {
  const progress = (current / total) * 100;
  return (
    <div className="w-full h-1.5 bg-border rounded-full overflow-hidden mb-8">
      <motion.div 
        className="h-full bg-text shadow-sm"
        initial={{ width: 0 }}
        animate={{ width: `${progress}%` }}
        transition={{ duration: 1, ease: "easeOut" }}
      />
    </div>
  );
};

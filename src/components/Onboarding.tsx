import React, { useState } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { ChevronRight, Play, Camera, Award, Sparkles, X } from 'lucide-react';

interface OnboardingProps {
  lang: 'ar' | 'en';
  onComplete: () => void;
}

export const Onboarding: React.FC<OnboardingProps> = ({ lang, onComplete }) => {
  const [step, setStep] = useState(0);

  const steps = [
    {
      title: lang === 'ar' ? 'مرحباً بك في Tornix' : 'Welcome to Tornix',
      description: lang === 'ar' 
        ? 'منصة تعليمية ذكية تهدف لرفع كفاءتك المهنية باستخدام أحدث تقنيات الذكاء الاصطناعي.' 
        : 'A smart educational platform aiming to boost your professional skills using latest AI technologies.',
      icon: <Sparkles className="w-12 h-12 text-primary" />,
      color: 'bg-primary/10'
    },
    {
      title: lang === 'ar' ? 'تعلم بذكاء' : 'Learn Smarter',
      description: lang === 'ar' 
        ? 'شاهد الكورسات المقسمة تلقائياً، واستخدم المساعد الذكي لتلخيص الأفكار المعقدة في ثوانٍ.' 
        : 'Watch auto-segmented courses and use the AI assistant to summarize complex ideas in seconds.',
      icon: <Play className="w-12 h-12 text-indigo-500" />,
      color: 'bg-indigo-500/10'
    },
    {
      title: lang === 'ar' ? 'نظام اختبارات آمن' : 'Secure Exam System',
      description: lang === 'ar' 
        ? 'نستخدم الذكاء الاصطناعي لمراقبة النزاهة وضمان صحة الاختبار للحصول على شهادة معتمدة دولياً.' 
        : 'We use AI to monitor integrity and ensure exam validity for internationally recognized certifications.',
      icon: <Camera className="w-12 h-12 text-rose-500" />,
      color: 'bg-rose-500/10'
    },
    {
      title: lang === 'ar' ? 'احصل على شهادتك' : 'Get Certified',
      description: lang === 'ar' 
        ? 'بمجرد النجاح، يمكنك تحميل شهادتك بدقة عالية ومشاركتها مباشرة في ملفك المهني.' 
        : 'Once successful, download your high-res certificate and share it directly to your professional profile.',
      icon: <Award className="w-12 h-12 text-amber-500" />,
      color: 'bg-amber-500/10'
    }
  ];

  const next = () => {
    if (step < steps.length - 1) {
      setStep(step + 1);
    } else {
      onComplete();
    }
  };

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-bg/80 backdrop-blur-xl">
      <motion.div 
        initial={{ opacity: 0, scale: 0.9 }}
        animate={{ opacity: 1, scale: 1 }}
        className="max-w-md w-full bg-card rounded-[2.5rem] shadow-2xl border border-border overflow-hidden relative"
      >
        <button 
          onClick={onComplete}
          className="absolute top-6 right-6 p-2 rounded-full hover:bg-border/50 text-text-dim transition-all z-10"
        >
          <X className="w-5 h-5" />
        </button>

        <div className="p-10 flex flex-col items-center text-center">
          <AnimatePresence mode="wait">
            <motion.div
              key={step}
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -20 }}
              className="flex flex-col items-center"
            >
              <div className={`p-6 rounded-3xl ${steps[step].color} mb-8`}>
                {steps[step].icon}
              </div>
              <h2 className="text-2xl font-bold mb-4 text-text">{steps[step].title}</h2>
              <p className="text-text-dim leading-relaxed mb-10 min-h-[80px]">
                {steps[step].description}
              </p>
            </motion.div>
          </AnimatePresence>

          <div className="flex gap-2 mb-10">
            {steps.map((_, i) => (
              <div 
                key={i} 
                className={`h-1.5 rounded-full transition-all duration-300 ${i === step ? 'w-8 bg-primary' : 'w-2 bg-border'}`} 
              />
            ))}
          </div>

          <button 
            onClick={next}
            className="w-full py-4 bg-primary text-white rounded-2xl font-bold flex items-center justify-center gap-2 group transition-all hover:shadow-lg hover:shadow-primary/20 active:scale-95"
          >
            {step === steps.length - 1 
              ? (lang === 'ar' ? 'ابدأ رحلتك الآن' : 'Start Your Journey')
              : (lang === 'ar' ? 'التالي' : 'Next Step')}
            <ChevronRight className={`w-5 h-5 transition-transform ${lang === 'ar' ? 'rotate-180 group-hover:-translate-x-1' : 'group-hover:translate-x-1'}`} />
          </button>
        </div>
      </motion.div>
    </div>
  );
};

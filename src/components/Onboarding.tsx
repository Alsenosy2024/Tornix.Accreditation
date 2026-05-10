import React, { useState } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { ArrowRight, X, Sparkles, BookOpen, ShieldCheck, Award } from 'lucide-react';

interface OnboardingProps {
  lang: 'ar' | 'en';
  onComplete: () => void;
}

export const Onboarding: React.FC<OnboardingProps> = ({ lang, onComplete }) => {
  const [step, setStep] = useState(0);
  const isAr = lang === 'ar';

  const steps = [
    {
      eyebrow: isAr ? 'الخطوة ١ من ٤' : 'Step 1 of 4',
      title: isAr ? 'مرحباً بك في تورنكس' : 'Welcome to Tornix',
      body: isAr
        ? 'مركز الاعتماد المهني المخصص لمديري المشاريع — تقييم منضبط، شهادة تُحترم في السوق.'
        : 'A professional accreditation center for project managers — a disciplined assessment and a credential the market respects.',
      Icon: Sparkles,
    },
    {
      eyebrow: isAr ? 'الخطوة ٢ من ٤' : 'Step 2 of 4',
      title: isAr ? 'تعلّم بدقة' : 'Learn with rigor',
      body: isAr
        ? 'محتوى تعليمي مُقسَّم تلقائياً إلى فصول، ومساعد ذكي يلخّص الأفكار المعقّدة عند الطلب.'
        : 'Auto-segmented chapters paired with an AI assistant that distills the complex parts on demand.',
      Icon: BookOpen,
    },
    {
      eyebrow: isAr ? 'الخطوة ٣ من ٤' : 'Step 3 of 4',
      title: isAr ? 'بيئة اختبار آمنة' : 'A trustworthy exam',
      body: isAr
        ? 'نراقب نزاهة الجلسة بأدوات مدعومة بالذكاء الاصطناعي حتى تكون الشهادة تستحقّ ما تحمل من اسم.'
        : 'We watch session integrity with AI tooling so the certificate is worth the name on it.',
      Icon: ShieldCheck,
    },
    {
      eyebrow: isAr ? 'الخطوة ٤ من ٤' : 'Step 4 of 4',
      title: isAr ? 'احصل على اعتمادك' : 'Earn your credential',
      body: isAr
        ? 'بعد النجاح، نُصدر شهادتك بدقة عالية وجاهزة للمشاركة على ملفك المهني مباشرة.'
        : 'On success, we issue a high-resolution certificate ready to share to your professional profile.',
      Icon: Award,
    },
  ];

  const next = () => {
    if (step < steps.length - 1) setStep(step + 1);
    else onComplete();
  };

  const current = steps[step];
  const Icon = current.Icon;

  return (
    <div
      className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-[rgba(15,23,42,0.45)]"
      dir={isAr ? 'rtl' : 'ltr'}
      onClick={onComplete}
    >
      <motion.div
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.35, ease: [0.22, 1, 0.36, 1] }}
        onClick={(e) => e.stopPropagation()}
        className="relative w-full max-w-md card overflow-hidden"
        style={{ borderRadius: 20 }}
      >
        <button
          onClick={onComplete}
          aria-label={isAr ? 'تجاوز' : 'Skip'}
          className={`absolute top-4 ${isAr ? 'left-4' : 'right-4'} w-9 h-9 rounded-full grid place-items-center text-[color:var(--text-muted)] hover:bg-[color:var(--border)] transition-colors`}
        >
          <X className="w-4 h-4" />
        </button>

        <div className="px-8 pt-12 pb-8">
          {/* Logo halo — single decorative flourish */}
          <div className="logo-halo mx-auto mb-8 w-20 h-20 grid place-items-center">
            <img src="/logo.png" alt="" className="w-16 h-16 object-contain" />
          </div>

          <AnimatePresence mode="wait">
            <motion.div
              key={step}
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -8 }}
              transition={{ duration: 0.3, ease: [0.22, 1, 0.36, 1] }}
              className="text-center"
            >
              <div className="inline-flex items-center gap-2 mb-5 px-3 py-1 rounded-full bg-[color:var(--primary-tint)] text-[color:var(--primary-deep)]">
                <Icon className="w-3.5 h-3.5" />
                <span className="text-[0.75rem] font-semibold">{current.eyebrow}</span>
              </div>
              <h2 className="text-h2 text-[color:var(--text-heading)] mb-3">{current.title}</h2>
              <p className="text-body-m text-[color:var(--text-dim)] leading-relaxed mx-auto max-w-sm">
                {current.body}
              </p>
            </motion.div>
          </AnimatePresence>

          {/* Step rail */}
          <div className="flex justify-center gap-1.5 mt-10 mb-8">
            {steps.map((_, i) => (
              <div
                key={i}
                className="h-1 rounded-full transition-all duration-500 ease-out"
                style={{
                  width: i === step ? 28 : 8,
                  background: i <= step ? 'var(--primary)' : 'var(--border)',
                }}
              />
            ))}
          </div>

          <div className="flex items-center gap-3">
            {step > 0 && (
              <button
                onClick={() => setStep(step - 1)}
                className="btn btn-ghost btn-md"
              >
                {isAr ? 'السابق' : 'Back'}
              </button>
            )}
            <button onClick={next} className="btn btn-primary btn-md flex-1">
              {step === steps.length - 1
                ? (isAr ? 'ابدأ التقييم' : 'Begin assessment')
                : (isAr ? 'التالي' : 'Continue')}
              <ArrowRight className={`w-4 h-4 ${isAr ? 'rotate-180' : ''}`} />
            </button>
          </div>
        </div>
      </motion.div>
    </div>
  );
};

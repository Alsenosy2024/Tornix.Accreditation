import React, { useState } from 'react';
import { Loader2, Link2 } from 'lucide-react';
import { createCourse } from '../api';

interface CoursesAdminProps {
  lang: 'ar' | 'en';
}

// Video files now point to an external URL (YouTube, Vimeo, self-hosted CDN, etc.)
// rather than being uploaded as binary into the database.  Storing the video
// file itself in Postgres as bytea is a non-starter for streaming, and we no
// longer rely on Firebase Storage.
export const CoursesAdmin: React.FC<CoursesAdminProps> = ({ lang }) => {
  const [videoUrl, setVideoUrl] = useState('');
  const [title, setTitle] = useState('');
  const [isProcessing, setIsProcessing] = useState(false);
  const [status, setStatus] = useState('');

  const save = async () => {
    if (!videoUrl || !title) return;

    setIsProcessing(true);
    setStatus(lang === 'ar' ? 'جاري حفظ الكورس...' : 'Saving course...');

    try {
      // Same placeholder chapter structure the old code used; real AI segmentation
      // would happen in a separate pipeline / Cloud Function.
      const chapters = [
        { title: 'مقدمة الدورة',         summary: 'مفاهيم أساسية حول إدارة المشاريع وتطبيقات الذكاء الاصطناعي.', startTime: 0,    endTime: 300  },
        { title: 'التحليل الاستراتيجي',  summary: 'كيفية استخدام الأدوات لتوقع المخاطر.',                    startTime: 300,  endTime: 600  },
        { title: 'تطبيق عملي 1',         summary: 'تطبيق عملي على المنصة لإنشاء خطة المشروع.',               startTime: 600,  endTime: 900  },
        { title: 'التقييم والمتابعة',    summary: 'كيفية تقييم أداء المشروع واستخدام أدوات المراقبة.',         startTime: 900,  endTime: 1200 },
        { title: 'الخاتمة والمراجعة',    summary: 'مراجعة شاملة للمكتسبات والتحضير للاختبار.',                startTime: 1200, endTime: 1500 },
      ];

      await createCourse({ title, videoUrl, chapters });

      setStatus(lang === 'ar' ? 'تمت الإضافة بنجاح!' : 'Course added successfully!');
      setVideoUrl('');
      setTitle('');
      setTimeout(() => setStatus(''), 3000);
    } catch (e: any) {
      console.error(e);
      setStatus(lang === 'ar' ? 'حدث خطأ: ' + e.message : 'Error: ' + e.message);
    } finally {
      setIsProcessing(false);
    }
  };

  const isAr = lang === 'ar';
  return (
    <div>
      <span className="text-label">{isAr ? 'إدارة الكورسات' : 'Courses'}</span>
      <h2 className="text-h2 mt-1 mb-6" style={{ color: 'var(--text-heading)' }}>
        {isAr ? 'إضافة كورس جديد' : 'Add a new course'}
      </h2>

      <div className="card card-tight p-5 md:p-6 space-y-5">
        <label className="block">
          <span className="text-label block mb-2">{isAr ? 'عنوان الكورس' : 'Course title'}</span>
          <input
            type="text"
            value={title}
            onChange={e => setTitle(e.target.value)}
            className="input"
            placeholder={isAr ? 'مثال: الكورس التحضيري الشامل' : 'e.g. Tornix prep course'}
            dir="auto"
          />
        </label>

        <label className="block">
          <span className="text-label block mb-2 flex items-center gap-2">
            <Link2 className="w-3.5 h-3.5" />
            {isAr ? 'رابط الفيديو' : 'Video URL'}
          </span>
          <input
            type="url"
            value={videoUrl}
            onChange={e => setVideoUrl(e.target.value)}
            className="input"
            placeholder="https://..."
            dir="ltr"
          />
          <p className="text-caption mt-1">
            {isAr
              ? 'رابط فيديو خارجي (YouTube/Vimeo/CDN). لم نعد نخزّن الفيديوهات في قاعدة البيانات.'
              : 'External video URL (YouTube/Vimeo/CDN). Videos are not stored in Postgres.'}
          </p>
        </label>

        {status && (
          <div className="flex items-center gap-2 text-body-m" style={{ color: 'var(--primary-deep)' }}>
            {isProcessing && <Loader2 className="w-4 h-4 animate-spin" />}
            <span>{status}</span>
          </div>
        )}

        <button
          disabled={isProcessing || !videoUrl || !title}
          onClick={save}
          className="btn btn-primary btn-md w-full"
        >
          {isProcessing
            ? (isAr ? 'جاري الحفظ...' : 'Saving...')
            : (isAr ? 'حفظ الكورس' : 'Save course')}
        </button>
      </div>
    </div>
  );
};

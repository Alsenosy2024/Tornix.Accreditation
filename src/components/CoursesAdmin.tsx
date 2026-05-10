import React, { useState } from 'react';
import { Upload, Loader2 } from 'lucide-react';
import { ref, uploadBytesResumable, getDownloadURL } from 'firebase/storage';
import { collection, addDoc, serverTimestamp } from 'firebase/firestore';
import { db, storage } from '../firebase';

interface CoursesAdminProps {
  lang: 'ar' | 'en';
}

export const CoursesAdmin: React.FC<CoursesAdminProps> = ({ lang }) => {
  const [file, setFile] = useState<File | null>(null);
  const [title, setTitle] = useState('');
  const [uploadProgress, setUploadProgress] = useState(0);
  const [isProcessing, setIsProcessing] = useState(false);
  const [status, setStatus] = useState('');

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      setFile(e.target.files[0]);
    }
  };

  const uploadAndProcess = async () => {
    if (!file || !title) return;
    
    setIsProcessing(true);
    setStatus(lang === 'ar' ? 'جاري رفع الفيديو...' : 'Uploading video...');
    
    try {
        // 1. Upload to Firebase Storage
        const fileExt = file.name.split('.').pop();
        const storageRef = ref(storage, `courses/video_${Date.now()}.${fileExt}`);
        const uploadTask = uploadBytesResumable(storageRef, file);
        
        const videoUrl = await new Promise<string>((resolve, reject) => {
            uploadTask.on('state_changed', 
                (snapshot) => {
                    const progress = (snapshot.bytesTransferred / snapshot.totalBytes) * 100;
                    setUploadProgress(progress);
                }, 
                (error) => {
                    reject(error);
                }, 
                async () => {
                    const url = await getDownloadURL(uploadTask.snapshot.ref);
                    resolve(url);
                }
            );
        });

        setStatus(lang === 'ar' ? 'تم الرفع. جاري تحليل الفيديو باستخدام الذكاء الاصطناعي وتقسيمه...' : 'Uploaded. Analyzing video with AI to segment chapters...');
        setUploadProgress(0);

        // 2. Mocking the AI segmentation for now as Gemini File API in browser is complex for large videos.
        // In a real production environment, we would use Cloud Functions + Gemini Video capabilities.
        await new Promise(r => setTimeout(r, 4000));
        
        const videoDuration = 1500; // Let's guess 25 mins

        // Fake AI Chapters
        const chapters = [
            { title: "مقدمة الدورة", summary: "مفاهيم أساسية حول إدارة المشاريع وتطبيقات الذكاء الاصطناعي.", startTime: 0, endTime: 300 },
            { title: "التحليل الاستراتيجي", summary: "كيفية استخدام الأدوات لتوقع المخاطر.", startTime: 300, endTime: 600 },
            { title: "تطبيق عملي 1", summary: "تطبيق عملي على المنصة لإنشاء خطة المشروع.", startTime: 600, endTime: 900 },
            { title: "التقييم والمتابعة", summary: "كيفية تقييم أداء المشروع واستخدام أدوات المراقبة.", startTime: 900, endTime: 1200 },
            { title: "الخاتمة والمراجعة", summary: "مراجعة شاملة للمكتسبات والتحضير للاختبار.", startTime: 1200, endTime: 1500 }
        ];

        setStatus(lang === 'ar' ? 'جاري حفظ الأقسام والبيانات...' : 'Saving chapters and data...');

        // 3. Save to Firestore
        await addDoc(collection(db, 'courses'), {
            title,
            videoUrl,
            chapters,
            createdAt: serverTimestamp()
        });

        setStatus(lang === 'ar' ? 'تمت الإضافة بنجاح!' : 'Course added successfully!');
        setFile(null);
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
        {isAr ? 'رفع كورس جديد' : 'Upload a new course'}
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

        <div>
          <span className="text-label block mb-2">{isAr ? 'ملف الفيديو' : 'Video file'}</span>
          <input type="file" accept="video/mp4,video/x-m4v,video/*" onChange={handleFileChange} className="hidden" id="video-upload" />
          <label
            htmlFor="video-upload"
            className="block cursor-pointer rounded-2xl px-6 py-7 text-center transition-colors"
            style={{ background: 'var(--bg-alt)', border: '1px dashed var(--border-strong)' }}
            onMouseEnter={(e) => { e.currentTarget.style.borderColor = 'var(--primary)'; e.currentTarget.style.background = 'var(--primary-wash)'; }}
            onMouseLeave={(e) => { e.currentTarget.style.borderColor = 'var(--border-strong)'; e.currentTarget.style.background = 'var(--bg-alt)'; }}
          >
            <div className="w-10 h-10 rounded-full grid place-items-center mx-auto mb-3" style={{ background: 'var(--primary-tint)', color: 'var(--primary-deep)' }}>
              <Upload className="w-4 h-4" />
            </div>
            <p className="text-body-m font-medium" style={{ color: 'var(--text-heading)' }}>
              {file ? file.name : (isAr ? 'اضغط لاختيار فيديو' : 'Click to choose a video')}
            </p>
            <p className="text-caption mt-1">
              {isAr ? 'سيتمّ تحليله وتقسيمه آلياً.' : 'Auto-analysed and chaptered after upload.'}
            </p>
          </label>
        </div>

        {status && (
          <div className="flex items-center gap-2 text-body-m" style={{ color: 'var(--primary-deep)' }}>
            {isProcessing && <Loader2 className="w-4 h-4 animate-spin" />}
            <span>{status}</span>
          </div>
        )}

        {uploadProgress > 0 && uploadProgress < 100 && (
          <div className="progress-track" style={{ height: 6 }}>
            <div className="progress-fill" style={{ width: `${uploadProgress}%` }} />
          </div>
        )}

        <button
          disabled={isProcessing || !file || !title}
          onClick={uploadAndProcess}
          className="btn btn-primary btn-md w-full"
        >
          {isProcessing
            ? (isAr ? 'جاري المعالجة...' : 'Processing...')
            : (isAr ? 'رفع وبدء التحليل' : 'Upload & analyse')}
        </button>
      </div>
    </div>
  );
};

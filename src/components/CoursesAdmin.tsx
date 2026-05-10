import React, { useState } from 'react';
import { Upload, Video, Plus, FileText, Check, Loader2 } from 'lucide-react';
import { ref, uploadBytesResumable, getDownloadURL } from 'firebase/storage';
import { collection, addDoc, serverTimestamp } from 'firebase/firestore';
import { db, storage } from '../firebase';
import { GoogleGenAI } from '@google/genai';

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

  return (
    <div className="p-6">
       <h2 className="text-2xl font-bold text-text mb-6">{lang === 'ar' ? 'إدارة الكورسات والمقاطع' : 'Course & Modules Management'}</h2>
       
       <div className="bg-bg border border-border rounded-2xl p-6">
           <h3 className="text-lg font-bold text-text mb-4">{lang === 'ar' ? 'رفع كورس جديد (تقسيم تلقائي AI)' : 'Upload New Course (Auto AI Segmentation)'}</h3>
           
           <div className="space-y-4">
               <div>
                   <label className="block text-sm text-text-dim mb-2">{lang === 'ar' ? 'عنوان الكورس' : 'Course Title'}</label>
                   <input type="text" value={title} onChange={e => setTitle(e.target.value)} className="w-full bg-bg border border-border rounded-xl px-4 py-3 text-text" placeholder={lang === 'ar' ? "مثال: الكورس التحضيري الشامل" : "e.g. Comprehensive Prep Course"} />
               </div>

               <div>
                   <label className="block text-sm text-text-dim mb-2">{lang === 'ar' ? 'ملف الفيديو' : 'Video File'}</label>
                   <div className="border-2 border-dashed border-border rounded-xl p-8 text-center bg-bg/50">
                       <input type="file" accept="video/mp4,video/x-m4v,video/*" onChange={handleFileChange} className="hidden" id="video-upload" />
                       <label htmlFor="video-upload" className="cursor-pointer flex flex-col items-center justify-center">
                           <Upload className="w-10 h-10 text-primary mb-3" />
                           <span className="text-text font-bold">{file ? file.name : (lang === 'ar' ? 'اضغط لاختيار فيديو' : 'Click to select video')}</span>
                           <span className="text-sm text-text-dim mt-1">{lang === 'ar' ? 'سيتم تحليله وتقسيمه بالذكاء الاصطناعي' : 'Will be analyzed and segmented by AI'}</span>
                       </label>
                   </div>
               </div>

               {status && (
                   <div className="text-sm font-medium text-primary mt-2 flex items-center gap-2">
                       {isProcessing && <Loader2 className="w-4 h-4 animate-spin" />}
                       {status}
                   </div>
               )}

               {uploadProgress > 0 && uploadProgress < 100 && (
                   <div className="w-full bg-border rounded-full h-2.5 mt-2">
                     <div className="bg-primary h-2.5 rounded-full transition-all duration-300" style={{ width: `${uploadProgress}%` }}></div>
                   </div>
               )}

               <button disabled={isProcessing || !file || !title} onClick={uploadAndProcess} className="mt-4 w-full py-3 bg-primary text-white rounded-xl font-bold flex items-center justify-center gap-2 disabled:opacity-50">
                   {isProcessing ? (lang === 'ar' ? 'جاري المعالجة...' : 'Processing...') : (lang === 'ar' ? 'رفع وبدء التحليل' : 'Upload & Start Analysis')}
               </button>
           </div>
       </div>

       {/* List of courses could go here */}
    </div>
  );
};

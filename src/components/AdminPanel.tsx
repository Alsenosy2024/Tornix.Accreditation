import React, { useState, useRef, useEffect } from 'react';
import { Settings, Image as ImageIcon, CheckCircle, X, Crop as CropIcon, FileText, BarChart3, Download, Mail, Check } from 'lucide-react';
import ReactCrop, { type Crop, centerCrop, makeAspectCrop } from 'react-image-crop';
import 'react-image-crop/dist/ReactCrop.css';
import * as pdfjsLib from 'pdfjs-dist';

// Use Vite's worker import mechanism to avoid CDN network issues
// @ts-ignore
import pdfWorkerUrl from 'pdfjs-dist/build/pdf.worker.mjs?url';
if (pdfjsLib && pdfjsLib.GlobalWorkerOptions) {
  pdfjsLib.GlobalWorkerOptions.workerSrc = pdfWorkerUrl;
} else if (pdfjsLib && (pdfjsLib as any).default && (pdfjsLib as any).default.GlobalWorkerOptions) {
  (pdfjsLib as any).default.GlobalWorkerOptions.workerSrc = pdfWorkerUrl;
}

interface AdminPanelProps {
  onClose: () => void;
  lang: 'ar' | 'en';
}

function centerAspectCrop(mediaWidth: number, mediaHeight: number, aspect: number | undefined) {
  if (aspect) {
      return centerCrop(
        makeAspectCrop(
          { unit: '%', width: 90 },
          aspect,
          mediaWidth,
          mediaHeight
        ),
        mediaWidth,
        mediaHeight
      );
  }
  // Free crop default
  return {
      unit: '%',
      x: 5,
      y: 5,
      width: 90,
      height: 90
  } as Crop;
}

import { doc, getDoc, setDoc, serverTimestamp, collectionGroup, getDocs } from 'firebase/firestore';
import { ref, uploadString, getDownloadURL, uploadBytes } from 'firebase/storage';
import { db, storage, handleFirestoreError } from '../firebase';

import { CoursesAdmin } from './CoursesAdmin';

export const AdminPanel: React.FC<AdminPanelProps> = ({ onClose, lang }) => {
  const [activeTab, setActiveTab] = useState<'dash' | 'logo' | 'badge' | 'cert' | 'email' | 'courses'>('dash');
  
  const [imgSrc, setImgSrc] = useState('');
  useEffect(() => {
    return () => {
      if (imgSrc.startsWith('blob:')) {
        URL.revokeObjectURL(imgSrc);
      }
    };
  }, [imgSrc]);
  const imgRef = useRef<HTMLImageElement>(null);
  const [crop, setCrop] = useState<Crop>();
  const [isSaving, setIsSaving] = useState(false);
  const [completedCrop, setCompletedCrop] = useState<any>();

  const [assessments, setAssessments] = useState<any[]>([]);
  const [loadingStats, setLoadingStats] = useState(true);

  // Email settings state
  const [emailServiceId, setEmailServiceId] = useState(localStorage.getItem('admin_email_service_id') || '');
  const [emailTemplateId, setEmailTemplateId] = useState(localStorage.getItem('admin_email_template_id') || '');
  const [emailPublicKey, setEmailPublicKey] = useState(localStorage.getItem('admin_email_public_key') || '');
  const [resendKey, setResendKey] = useState(localStorage.getItem('admin_resend_key') || 're_VMqmhpnz_Hi3J2M6AefyAyCF4N1CHcaY8');
  const [resendFromEmail, setResendFromEmail] = useState(localStorage.getItem('admin_resend_from_email') || 'onboarding@resend.dev');
  const [emailSaveSuccess, setEmailSaveSuccess] = useState(false);

  // Current active branding
  const [savedLogo, setSavedLogo] = useState<string | null>(localStorage.getItem('admin_logo'));
  const [savedBadge, setSavedBadge] = useState<string | null>(localStorage.getItem('admin_badge'));
  const [savedCert, setSavedCert] = useState<string | null>(localStorage.getItem('admin_cert_bg'));
  
  const [nameY, setNameY] = useState(Number(localStorage.getItem('admin_cert_name_y') || 33));
  const [serialY, setSerialY] = useState(Number(localStorage.getItem('admin_cert_serial_y') || 90));

  const [fontFamily, setFontFamily] = useState(localStorage.getItem('admin_cert_font') || "font-montserrat");
  const [nameColor, setNameColor] = useState(localStorage.getItem('admin_cert_name_color') || "#0f172a");
  const [serialColor, setSerialColor] = useState(localStorage.getItem('admin_cert_serial_color') || "#1e293b");
  const [serialFontSize, setSerialFontSize] = useState(Number(localStorage.getItem('admin_cert_serial_size') || 20));

  const pushToFirestore = async (updates: any) => {
    try {
        const finalUpdates = { ...updates };
        const firestoreRef = doc(db, 'settings', 'branding');
        const snap = await getDoc(firestoreRef);
        const currentData = snap.exists() ? snap.data() : {};
        
        await setDoc(firestoreRef, {
           ...currentData,
           ...finalUpdates,
           updatedAt: serverTimestamp()
        });
        
        return finalUpdates;
    } catch(err) {
        console.error("Failed to push to firebase:", err);
        handleFirestoreError(err, 'update', 'settings/branding');
        throw err;
    }
  };

  const safeSetItem = (key: string, val: string) => {
    try {
        localStorage.setItem(key, val);
    } catch (err: any) {
        if (err.name === 'QuotaExceededError' || err.name === 'NS_ERROR_DOM_QUOTA_REACHED') {
            console.warn(`LocalStorage quota exceeded for ${key}, skipping persistence but keeping in memory.`);
        } else {
            console.error("Local storage error:", err);
        }
    }
  };

  const saveEmailSettings = () => {
    safeSetItem('admin_email_service_id', emailServiceId);
    safeSetItem('admin_email_template_id', emailTemplateId);
    safeSetItem('admin_email_public_key', emailPublicKey);
    safeSetItem('admin_resend_key', resendKey);
    safeSetItem('admin_resend_from_email', resendFromEmail);
    
    pushToFirestore({
        emailServiceId,
        emailTemplateId,
        emailPublicKey,
        resendKey,
        resendFromEmail
    });
    
    setEmailSaveSuccess(true);
    setTimeout(() => setEmailSaveSuccess(false), 3000);
    window.dispatchEvent(new Event('branding-updated'));
  };

  const exportCSV = () => {
    if (!assessments || assessments.length === 0) return;
    const headers = ['Name,Email,Score,Integrity,Status,Date'];
    const rows = assessments.map(a => {
        const date = a.createdAt ? new Date(a.createdAt.toMillis()).toLocaleDateString() : 'N/A';
        return `"${a.userName}","${a.userEmail}",${a.score},${a.integrityScore},${a.status},"${date}"`;
    });
    const csvContent = "data:text/csv;charset=utf-8,\uFEFF" + headers.concat(rows).join("\n");
    const encodedUri = encodeURI(csvContent);
    const link = document.createElement("a");
    link.setAttribute("href", encodedUri);
    link.setAttribute("download", `assessments_export_${new Date().getTime()}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  async function onSelectFile(e: React.ChangeEvent<HTMLInputElement>) {
    if (e.target.files && e.target.files.length > 0) {
      setCrop(undefined); // Makes crop preview update between images.
      const file = e.target.files[0];
      
      if (file.type === 'application/pdf') {
        try {
            const arrayBuffer = await file.arrayBuffer();
            const pdfApi = (pdfjsLib as any).getDocument ? pdfjsLib : (pdfjsLib as any).default;
            const pdf = await pdfApi.getDocument({ data: arrayBuffer }).promise;
            const page = await pdf.getPage(1);
            
            // Optimized scale for good quality/size balance
            const viewport = page.getViewport({ scale: 1.5 });
            
            const canvas = document.createElement('canvas');
            const context = canvas.getContext('2d');
            
            if (context) {
              canvas.height = viewport.height;
              canvas.width = viewport.width;
              
              await page.render({ canvasContext: context, viewport } as any).promise;
              const dataUrl = canvas.toDataURL('image/jpeg', 0.82);
              
              setImgSrc(dataUrl);
            }
        } catch (err) {
            console.error("PDF Parsing Error:", err);
            alert(lang === 'ar' ? "فشل تحليل ملف الـ PDF. هل هو محمي بكلمة مرور؟" : "Failed to parse PDF. Is it password protected?");
        }
      } else {
        const url = URL.createObjectURL(file);
        setImgSrc(url);
      }
    }
  }

  function onImageLoad(e: React.SyntheticEvent<HTMLImageElement>) {
    const { width, height } = e.currentTarget;
    if (activeTab === 'cert') {
        // Certificates should not be cropped by default
        setCrop({ unit: '%', width: 100, height: 100, x: 0, y: 0 });
        setCompletedCrop({ unit: 'px', width, height, x: 0, y: 0 });
    } else {
        const aspect = 16/9; 
        const newCrop = centerAspectCrop(width, height, aspect);
        setCrop(newCrop);
        // Ensure user can save immediately with the default crop
        setCompletedCrop(newCrop as any);
    }
  }

  const handleSaveCrop = async () => {
    if (!imgRef.current) return;
    setIsSaving(true);
    
    try {
        const image = imgRef.current;
        const hasValidCrop = completedCrop && completedCrop.width > 0 && completedCrop.height > 0;

        const canvas = document.createElement('canvas');
        const ctx = canvas.getContext('2d');
        if (!ctx) throw new Error("Could not get canvas context");

        let targetWidth = image.naturalWidth;
        let targetHeight = image.naturalHeight;
        let sx = 0;
        let sy = 0;
        let sWidth = image.naturalWidth;
        let sHeight = image.naturalHeight;

        if (hasValidCrop) {
            let scaleX = image.naturalWidth / image.width;
            let scaleY = image.naturalHeight / image.height;
            
            let cropPx = completedCrop;
            if (completedCrop.unit === '%') {
                 cropPx = {
                     ...completedCrop,
                     x: (completedCrop.x / 100) * image.width,
                     y: (completedCrop.y / 100) * image.height,
                     width: (completedCrop.width / 100) * image.width,
                     height: (completedCrop.height / 100) * image.height
                 };
            }
            
            sx = Math.max(0, cropPx.x * scaleX);
            sy = Math.max(0, cropPx.y * scaleY);
            sWidth = Math.max(1, cropPx.width * scaleX);
            sHeight = Math.max(1, cropPx.height * scaleY);
            
            targetWidth = sWidth;
            targetHeight = sHeight;
        }

        // CAP RESOLUTION AT 4000px for browser stability and memory management
        const MAX_DIM = 4000;
        if (targetWidth > MAX_DIM || targetHeight > MAX_DIM) {
            const ratio = Math.min(MAX_DIM / targetWidth, MAX_DIM / targetHeight);
            targetWidth = Math.floor(targetWidth * ratio);
            targetHeight = Math.floor(targetHeight * ratio);
        }

        canvas.width = targetWidth;
        canvas.height = targetHeight;

        // Apply smoothing for downscaling
        ctx.imageSmoothingEnabled = true;
        ctx.imageSmoothingQuality = 'high';

        ctx.drawImage(
            image,
            sx, sy, sWidth, sHeight,
            0, 0, targetWidth, targetHeight
        );

        // Convert to binary Blob for efficient upload
        const blob = await new Promise<Blob | null>((resolve) => {
            canvas.toBlob(
                (b) => resolve(b),
                activeTab === 'cert' ? 'image/jpeg' : 'image/png',
                activeTab === 'cert' ? 0.92 : undefined
            );
        });

        if (!blob) throw new Error("Failed to create binary image blob");

        // Upload to Storage
        const ext = activeTab === 'cert' ? 'jpg' : 'png';
        const storageRef = ref(storage, `branding/${activeTab}_${Date.now()}.${ext}`);
        
        const uploadResult = await uploadBytes(storageRef, blob);
        const downloadURL = await getDownloadURL(uploadResult.ref);
        
        const fieldKey = activeTab === 'cert' ? 'certBg' : activeTab;
        const updates = await pushToFirestore({ [fieldKey]: downloadURL });

        if (activeTab === 'logo') setSavedLogo(downloadURL);
        if (activeTab === 'badge') setSavedBadge(downloadURL);
        if (activeTab === 'cert') setSavedCert(downloadURL);
        
        alert(lang === "ar" ? "تم الحفظ بنجاح!" : "Saved successfully!");
        setImgSrc('');
        setCrop(undefined);
        setCompletedCrop(undefined);
        window.dispatchEvent(new Event('branding-updated'));
        
    } catch (err: any) {
        console.error("Critical Upload Error:", err);
        alert(lang === "ar" ? `خطأ جذري في الرفع: ${err.message}` : `Critical upload error: ${err.message}`);
    } finally {
        setIsSaving(false);
    }
  };

  const handleReset = (type: 'logo' | 'badge' | 'cert') => {
      localStorage.removeItem(`admin_${type}`);
      if(type === 'logo') { setSavedLogo(null); pushToFirestore({ logo: null }); }
      if(type === 'badge') { setSavedBadge(null); pushToFirestore({ badge: null }); }
      if(type === 'cert') { setSavedCert(null); pushToFirestore({ certBg: null }); }
      window.dispatchEvent(new Event('branding-updated'));
  };

  const savePositions = () => {
    safeSetItem('admin_cert_name_y', nameY.toString());
    safeSetItem('admin_cert_serial_y', serialY.toString());
    safeSetItem('admin_cert_font', fontFamily);
    safeSetItem('admin_cert_name_color', nameColor);
    safeSetItem('admin_cert_serial_color', serialColor);
    safeSetItem('admin_cert_serial_size', serialFontSize.toString());
    window.dispatchEvent(new Event('branding-updated'));
  };

  // When changing font or colors, auto save (Debounced for Firestore)
  useEffect(() => {
    savePositions();
    const timeout = setTimeout(() => {
        pushToFirestore({
            nameY, serialY, fontFamily, nameColor, serialColor, serialFontSize
        });
    }, 1000);
    return () => clearTimeout(timeout);
  }, [nameY, serialY, fontFamily, nameColor, serialColor, serialFontSize]);

  useEffect(() => {
    if (activeTab === 'dash') {
      const fetchAssessments = async () => {
        setLoadingStats(true);
        try {
          const snapshot = await getDocs(collectionGroup(db, 'assessments'));
          const data = snapshot.docs.map(doc => doc.data());
          data.sort((a, b) => b.createdAt?.toMillis() - a.createdAt?.toMillis());
          setAssessments(data);
        } catch (error) {
          console.error("Error fetching admin assessments:", error);
          handleFirestoreError(error, 'list', '{path=**}/assessments');
        } finally {
          setLoadingStats(false);
        }
      };
      fetchAssessments();
    }
  }, [activeTab]);

  return (
    <div className="fixed inset-0 z-[1000] bg-bg/95 backdrop-blur-3xl flex items-center justify-center p-6 overflow-y-auto">
      <div className="bg-card w-full max-w-4xl min-h-[600px] border border-border shadow-sm rounded-2xl overflow-hidden flex flex-col md:flex-row" style={{ direction: lang === 'ar' ? 'rtl' : 'ltr' }}>
        
        {/* Sidebar */}
        <div className="w-full md:w-64 bg-bg p-6 border-b md:border-b-0 md:border-r border-border border-opacity-50">
          <div className="flex items-center justify-between mb-8">
            <h2 className="text-xl font-bold flex items-center gap-2"><Settings className="w-5 h-5 text-text"/> {lang === 'ar' ? 'لوحة التحكم' : 'Admin Panel'}</h2>
            <button onClick={onClose} className="text-text-dim hover:text-text p-2 md:hidden"><X className="w-5 h-5" /></button>
          </div>
          
          <nav className="space-y-2">
            <button 
                onClick={() => { setActiveTab('dash'); setImgSrc(''); }}
                className={`w-full flex items-center gap-3 p-3 rounded-xl font-medium transition-all ${activeTab === 'dash' ? 'bg-text text-bg shadow-sm' : 'text-text-dim hover:bg-border/50'}`}>
                <BarChart3 className="w-5 h-5" /> {lang === 'ar' ? 'الإحصائيات والنتائج' : 'Dashboard & Results'}
            </button>
            <button 
                onClick={() => { setActiveTab('logo'); setImgSrc(''); }}
                className={`w-full flex items-center gap-3 p-3 rounded-xl font-medium transition-all ${activeTab === 'logo' ? 'bg-text text-bg shadow-sm' : 'text-text-dim hover:bg-border/50'}`}>
                <ImageIcon className="w-5 h-5" /> {lang === 'ar' ? 'الشعار الرئيسي (اللوجو)' : 'Main Logo'}
            </button>
            <button 
                onClick={() => { setActiveTab('badge'); setImgSrc(''); }}
                className={`w-full flex items-center gap-3 p-3 rounded-xl font-medium transition-all ${activeTab === 'badge' ? 'bg-text text-bg shadow-sm' : 'text-text-dim hover:bg-border/50'}`}>
                <CheckCircle className="w-5 h-5" /> {lang === 'ar' ? 'شارة الاعتماد (الشهادة)' : 'Certificate Badge'}
            </button>
            <button 
                onClick={() => { setActiveTab('cert'); setImgSrc(''); }}
                className={`w-full flex items-center gap-3 p-3 rounded-xl font-medium transition-all ${activeTab === 'cert' ? 'bg-text text-bg shadow-sm' : 'text-text-dim hover:bg-border/50'}`}>
                <FileText className="w-5 h-5" /> {lang === 'ar' ? 'قالب الشهادة والصيغة' : 'Certificate Template'}
            </button>
            <button 
                onClick={() => { setActiveTab('email'); setImgSrc(''); }}
                className={`w-full flex items-center gap-3 p-3 rounded-xl font-medium transition-all ${activeTab === 'email' ? 'bg-text text-bg shadow-sm' : 'text-text-dim hover:bg-border/50'}`}>
                <Mail className="w-5 h-5" /> {lang === 'ar' ? 'إعدادات البريد (EmailJS)' : 'EmailJS Settings'}
            </button>
            <button 
                onClick={() => { setActiveTab('courses'); setImgSrc(''); }}
                className={`w-full flex items-center gap-3 p-3 rounded-xl font-medium transition-all ${activeTab === 'courses' ? 'bg-text text-bg shadow-sm' : 'text-text-dim hover:bg-border/50'}`}>
                <FileText className="w-5 h-5" /> {lang === 'ar' ? 'إدارة الكورسات' : 'Courses Management'}
            </button>
          </nav>
        </div>

        {/* Content */}
        <div className="flex-1 p-8 flex flex-col relative overflow-y-auto">
           <button onClick={onClose} className="absolute top-6 right-6 text-text-dim hover:text-text hidden md:block z-10">
              <X className="w-6 h-6" />
           </button>

           {activeTab !== 'courses' && (
             <div className="flex items-center justify-between mb-6">
               <h3 className="text-2xl font-display font-medium">
                  {activeTab === 'dash' && (lang === 'ar' ? 'سجل المتقدمين' : 'Assessments Record')}
                  {activeTab === 'logo' && (lang === 'ar' ? 'تخصيص الشعار الرئيسي' : 'Customize Main Logo')}
                  {activeTab === 'badge' && (lang === 'ar' ? 'تخصيص شارة الاعتماد' : 'Customize Certificate Badge')}
                  {activeTab === 'cert' && (lang === 'ar' ? 'إعدادات الشهادة النهائية' : 'Final Certificate Settings')}
                  {activeTab === 'email' && (lang === 'ar' ? 'إعدادات البريد الإلكتروني' : 'Email Sender Settings')}
               </h3>
               {activeTab === 'dash' && assessments.length > 0 && (
                 <button onClick={exportCSV} className="flex items-center gap-2 btn-glass px-4 py-2 rounded-lg font-bold text-sm">
                   <Download className="w-4 h-4" /> {lang === 'ar' ? 'تصدير إكسيل (CSV)' : 'Export CSV'}
                 </button>
               )}
             </div>
           )}

           {activeTab === 'courses' && (
               <CoursesAdmin lang={lang} />
           )}

           {activeTab === 'dash' && (
             <div className="flex-1 overflow-auto">
               {loadingStats ? (
                  <div className="flex items-center justify-center p-10"><span className="animate-spin w-8 h-8 rounded-full border-4 border-text border-t-transparent"></span></div>
               ) : (
                  <div className="overflow-x-auto border border-border rounded-xl">
                    <table className="w-full text-sm text-left">
                      <thead className="text-xs text-text-dim uppercase bg-bg border-b border-border">
                        <tr>
                          <th className="px-6 py-3">{lang === 'ar' ? 'الاسم' : 'Name'}</th>
                          <th className="px-6 py-3">{lang === 'ar' ? 'البريد' : 'Email'}</th>
                          <th className="px-6 py-3">{lang === 'ar' ? 'النتيجة' : 'Score'}</th>
                          <th className="px-6 py-3">{lang === 'ar' ? 'النزاهة' : 'Integrity'}</th>
                          <th className="px-6 py-3">{lang === 'ar' ? 'الحالة' : 'Status'}</th>
                        </tr>
                      </thead>
                      <tbody>
                        {assessments.length === 0 ? (
                           <tr>
                              <td colSpan={5} className="text-center py-10 text-text-dim">{lang === 'ar' ? 'لا توجد بيانات' : 'No data yet.'}</td>
                           </tr>
                        ) : assessments.map((a, i) => (
                          <tr key={i} className="bg-card border-b border-border text-text">
                            <td className="px-6 py-4 font-bold">{a.userName}</td>
                            <td className="px-6 py-4">{a.userEmail}</td>
                            <td className="px-6 py-4">
                               <span className={a.score >= 60 ? 'text-primary font-bold' : 'text-rose-500 font-bold'}>{a.score}%</span>
                            </td>
                            <td className="px-6 py-4">{a.integrityScore}%</td>
                            <td className="px-6 py-4">
                               <span className={`px-2 py-1 rounded-full text-xs font-medium border ${a.status === 'completed' ? 'border-border text-text' : 'border-rose-500/30 text-rose-500'}`}>
                                 {a.status}
                               </span>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
               )}
             </div>
           )}

           {/* Current Image Display */}
           {!imgSrc && activeTab !== 'dash' && (
               <div className="bg-bg border border-border rounded-2xl p-6 mb-8 flex flex-col md:flex-row items-center gap-6">
                  <div className={`w-full relative overflow-hidden flex items-center justify-center rounded-xl bg-border/10 border border-border ${activeTab === 'cert' ? 'aspect-[1/1.414] max-w-[280px] mx-auto shadow-md' : 'aspect-video md:w-1/2 md:h-48'}`} style={{ containerType: 'inline-size' }}>
                     {(activeTab === 'cert' && !savedCert) ? (
                         <span className="text-xs text-center text-slate-500 p-4">{lang === 'ar' ? 'لا يوجد قالب مخصص' : 'No custom template'}</span>
                     ) : (
                         <div className="relative w-full h-full flex items-center justify-center">
                            <img 
                               src={activeTab === 'logo' ? (savedLogo || '/tornix_logo.png') : activeTab === 'badge' ? (savedBadge || '/tcp_badge.png') : savedCert!} 
                               alt="Current" 
                               className="absolute inset-0 w-full h-full object-contain"
                            />
                            {/* Live WYSIWYG overlay for certificates */}
                            {activeTab === 'cert' && savedCert && (
                                <div className="absolute inset-0 pointer-events-none">
                                    <div className="absolute inset-x-0 w-full text-center z-10 flex flex-col items-center px-[10%]" style={{ top: `${nameY}%`, transform: 'translateY(-50%)' }}>
                                        <h1 
                                          className={`font-bold leading-tight m-0 p-0 ${fontFamily}`} 
                                          style={{ 
                                            color: nameColor, 
                                            fontSize: 'Student Name'.length > 25 ? '4cqw' : 'Student Name'.length > 15 ? '5cqw' : '6.3cqw',
                                            maxWidth: '100%',
                                            wordBreak: 'break-word',
                                            paddingBottom: '0.2em'
                                          }}
                                        >
                                          Student Name
                                        </h1>
                                    </div>
                                    <div className="absolute inset-x-0 w-full text-center pointer-events-none z-10" style={{ top: `${serialY}%`, transform: 'translateY(-50%)' }}>
                                        <p className={`font-bold tracking-widest leading-tight m-0 p-0 ${fontFamily}`} style={{ color: serialColor, fontSize: `${(serialFontSize / 794) * 100}cqw` }}>TCP-26-XXXXXX</p>
                                    </div>
                                </div>
                            )}
                         </div>
                     )}
                  </div>
                  <div className="flex-1">
                      <h4 className="font-bold text-lg mb-1">{lang === 'ar' ? 'الصورة الحالية' : 'Current Image'}</h4>
                      <p className="text-sm text-text-dim mb-4">
                        {lang === 'ar' ? 'ارفع صورة القالب (JPG / PNG / PDF).' : 'Upload the template picture (JPG / PNG / PDF).'}
                      </p>
                      <label className="btn-glass cursor-pointer px-5 py-2.5 rounded-lg font-bold text-sm transition-all inline-block mr-2">
                          {lang === 'ar' ? 'رفع صورة/ملف' : 'Upload File'}
                          <input type="file" accept="image/*,application/pdf" onChange={onSelectFile} className="hidden" />
                      </label>
                      <button 
                        onClick={() => handleReset(activeTab)}
                        className="text-slate-400 hover:text-rose-400 px-4 py-2 font-bold text-sm transition-all">
                          {lang === 'ar' ? 'استعادة الافتراضي' : 'Reset Default'}
                      </button>
                  </div>
               </div>
           )}

           {/* Styling & Coordinate Controls for Certificate */}
           {activeTab === 'cert' && !imgSrc && (
             <div className="bg-bg border border-border rounded-2xl p-6 mt-4 space-y-6">
                <h4 className="font-bold border-b border-border pb-2">{lang === 'ar' ? 'نمط وإحداثيات النصوص' : 'Text Styling & Coordinates'}</h4>
                
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                    {/* Font & Color selection */}
                    <div className="space-y-4 border-r border-border pr-6">
                        <div>
                            <label className="block text-sm mb-2">{lang === 'ar' ? 'نوع الخط (Font Family)' : 'Font Family'}</label>
                            <select value={fontFamily} onChange={e => setFontFamily(e.target.value)} className="w-full bg-bg border border-border rounded-lg p-2 text-sm text-text focus:outline-none focus:border-border">
                                <option value="font-sans">Sans-Serif (Modern)</option>
                                <option value="font-serif">Serif (Classic)</option>
                                <option value="font-mono">Monospace (Tech)</option>
                                <option value="font-display">Display (Bold/Heavy)</option>
                                <option value="font-montserrat">Montserrat</option>
                            </select>
                        </div>
                        
                        <div className="flex items-center justify-between">
                            <label className="text-sm">{lang === 'ar' ? 'لون الاسم' : 'Name Color'}</label>
                            <input type="color" value={nameColor} onChange={e => setNameColor(e.target.value)} className="w-10 h-10 rounded cursor-pointer bg-transparent border-0" />
                        </div>
                        
                        <div className="flex items-center justify-between border-t border-border/50 pt-4">
                            <label className="text-sm">{lang === 'ar' ? 'لون الرقم المرجعي' : 'Serial Color'}</label>
                            <input type="color" value={serialColor} onChange={e => setSerialColor(e.target.value)} className="w-10 h-10 rounded cursor-pointer bg-transparent border-0" />
                        </div>

                        <div>
                            <div className="flex justify-between text-sm mb-2">
                                <span>{lang === 'ar' ? 'حجم خط الرقم المرجعي' : 'Serial Font Size'}</span>
                                <span className="font-bold text-text-dim">{serialFontSize}px</span>
                            </div>
                            <input type="range" min="8" max="48" value={serialFontSize} onChange={e => setSerialFontSize(Number(e.target.value))} className="w-full" />
                        </div>
                    </div>

                    {/* Coordinates */}
                    <div className="space-y-6">
                        <div>
                        <div className="flex justify-between text-sm mb-2">
                            <span>{lang === 'ar' ? 'الارتفاع الرأسي للاسم' : 'Name Y Position'}</span>
                            <span className="font-bold text-text-dim">{nameY}%</span>
                        </div>
                        <input type="range" min="10" max="98" value={nameY} onChange={e => setNameY(Number(e.target.value))} className="w-full" />
                        </div>

                        <div>
                        <div className="flex justify-between text-sm mb-2">
                            <span>{lang === 'ar' ? 'الارتفاع الرأسي للرقم التسلسلي' : 'Serial Number Y Position'}</span>
                            <span className="font-bold text-text-dim">{serialY}%</span>
                        </div>
                        <input type="range" min="10" max="98" value={serialY} onChange={e => setSerialY(Number(e.target.value))} className="w-full" />
                        </div>
                    </div>
                </div>
             </div>
           )}

           {/* Cropper Workarea */}
           {imgSrc && (
               <div className="flex-1 flex flex-col items-center border border-dashed border-border bg-bg/50 rounded-2xl p-6 relative">
                  <div className="absolute top-4 left-4 flex items-center gap-2 text-text-dim bg-border/50 px-3 py-1.5 rounded-lg text-xs font-bold font-mono z-10">
                      <CropIcon className="w-4 h-4" /> {lang === 'ar' ? 'وضع القص والتعديل' : 'Cropping Mode'}
                  </div>
                  <div className="flex-1 flex items-center justify-center w-full min-h-[300px] overflow-hidden mt-8 mb-6">
                      <ReactCrop
                        crop={crop}
                        onChange={(_, percentCrop) => setCrop(percentCrop)}
                        onComplete={(c) => setCompletedCrop(c)}
                        className="rounded-lg shadow-sm outline-none max-h-[50vh]"
                      >
                        <img
                          ref={imgRef}
                          alt="Crop me"
                          src={imgSrc}
                          className="max-w-full max-h-full object-contain mx-auto"
                          onLoad={onImageLoad}
                        />
                      </ReactCrop>
                  </div>
                  
                  <div className="w-full flex gap-4 mt-auto">
                      <button 
                        onClick={() => setImgSrc('')}
                        className="flex-1 py-4 bg-bg border border-border rounded-xl font-bold text-text-dim hover:bg-border/50 transition-all"
                      >
                         {lang === 'ar' ? 'إلغاء الأمر' : 'Cancel'}
                      </button>
                      <button 
                        onClick={handleSaveCrop}
                        disabled={isSaving}
                        className="flex-1 py-4 btn-glass rounded-xl font-bold flex items-center justify-center gap-2 transition-all disabled:opacity-50"
                      >
                         <CheckCircle className={`w-5 h-5 ${isSaving ? 'animate-spin' : ''}`} /> {lang === 'ar' ? (isSaving ? 'جاري الحفظ...' : 'قص وحفظ كافتراضي') : (isSaving ? 'Saving...' : 'Crop & Save Default')}
                      </button>
                  </div>
               </div>
           )}

           {activeTab === 'email' && (
             <div className="bg-bg border border-border rounded-2xl p-6 space-y-6">
                <div className="mb-4 text-sm text-text-dim">
                  {lang === 'ar' ? 'قم بإعداد بيانات الربط لإرسال الإشعارات والشهادات عبر البريد. يمكنك استخدام EmailJS والآن أيضاً Resend.' : 'Configure integration credentials to send email notifications. You can use EmailJS or Resend.'}
                </div>
                
                <h4 className="font-bold border-b border-border pb-2 text-primary">{lang === 'ar' ? 'إعدادات Resend API' : 'Resend API Settings'}</h4>
                <div>
                   <label className="block text-sm mb-2">{lang === 'ar' ? 'مفتاح ريسند (Resend Key)' : 'Resend API Key'}</label>
                   <input type="text" value={resendKey} onChange={e => setResendKey(e.target.value)} className="w-full bg-bg border border-border rounded-lg p-3 text-sm text-text focus:outline-none focus:border-primary" placeholder="re_..." />
                </div>
                
                <div className="mt-4">
                   <label className="block text-sm mb-2">{lang === 'ar' ? 'بريد المرسل (Resend From Email)' : 'Resend From Email'}</label>
                   <input type="email" value={resendFromEmail} onChange={e => setResendFromEmail(e.target.value)} className="w-full bg-bg border border-border rounded-lg p-3 text-sm text-text focus:outline-none focus:border-primary" placeholder="onboarding@resend.dev" />
                   <p className="text-xs text-text-dim mt-1">{lang === 'ar' ? 'يجب أن يكون النطاق موثقاً في حسابك، أو استخدم onboarding@resend.dev للإرسال لبريدك الموثق فقط.' : 'Must be verified on Resend, or use onboarding@resend.dev to send to yourself only.'}</p>
                </div>

                <h4 className="font-bold border-b border-border pb-2 mt-8 text-primary">{lang === 'ar' ? 'إعدادات EmailJS' : 'EmailJS Settings'}</h4>
                <div className="space-y-4">
                  <div>
                    <label className="block text-sm mb-2">{lang === 'ar' ? 'معرف الخدمة (Service ID)' : 'Service ID'}</label>
                    <input type="text" value={emailServiceId} onChange={e => setEmailServiceId(e.target.value)} className="w-full bg-bg border border-border rounded-lg p-3 text-sm text-text focus:outline-none focus:border-border" placeholder="service_..." />
                  </div>
                  <div>
                    <label className="block text-sm mb-2">{lang === 'ar' ? 'معرف القالب (Template ID)' : 'Template ID'}</label>
                    <input type="text" value={emailTemplateId} onChange={e => setEmailTemplateId(e.target.value)} className="w-full bg-bg border border-border rounded-lg p-3 text-sm text-text focus:outline-none focus:border-border" placeholder="template_..." />
                  </div>
                  <div>
                    <label className="block text-sm mb-2">{lang === 'ar' ? 'المفتاح العام (Public Key)' : 'Public Key'}</label>
                    <input type="text" value={emailPublicKey} onChange={e => setEmailPublicKey(e.target.value)} className="w-full bg-bg border border-border rounded-lg p-3 text-sm text-text focus:outline-none focus:border-border" placeholder="..." />
                  </div>
                </div>

                <div className="pt-4 border-t border-border flex justify-end">
                  <button 
                    onClick={saveEmailSettings}
                    className={`flex items-center gap-2 px-6 py-3 rounded-lg font-bold transition-all ${emailSaveSuccess ? 'bg-primary text-bg' : 'btn-glass'}`}
                  >
                     {emailSaveSuccess ? <Check className="w-5 h-5" /> : <Settings className="w-5 h-5" />}
                     {lang === 'ar' ? (emailSaveSuccess ? 'تم الحفظ بنجاح' : 'حفظ الإعدادات') : (emailSaveSuccess ? 'Saved successfully' : 'Save Settings')}
                  </button>
                </div>
             </div>
           )}

        </div>
      </div>
    </div>
  );
};

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

  const isAr = lang === 'ar';
  const tabs: { key: typeof activeTab; ar: string; en: string; Icon: any }[] = [
    { key: 'dash',    ar: 'الإحصائيات والنتائج', en: 'Dashboard',         Icon: BarChart3 },
    { key: 'logo',    ar: 'الشعار الرئيسي',       en: 'Main logo',          Icon: ImageIcon },
    { key: 'badge',   ar: 'شارة الاعتماد',        en: 'Accreditation badge',Icon: CheckCircle },
    { key: 'cert',    ar: 'قالب الشهادة',         en: 'Certificate template',Icon: FileText },
    { key: 'email',   ar: 'إعدادات البريد',       en: 'Email settings',     Icon: Mail },
    { key: 'courses', ar: 'إدارة الكورسات',       en: 'Courses',            Icon: FileText },
  ];
  const headings: Record<string, [string, string]> = {
    dash:  ['سجل المتقدمين', 'Assessment records'],
    logo:  ['تخصيص الشعار الرئيسي', 'Customize main logo'],
    badge: ['تخصيص شارة الاعتماد', 'Customize accreditation badge'],
    cert:  ['إعدادات الشهادة النهائية', 'Certificate template settings'],
    email: ['إعدادات البريد الإلكتروني', 'Email settings'],
  };
  return (
    <div
      className="fixed inset-0 z-[1000] flex items-center justify-center p-4 md:p-6 overflow-y-auto"
      style={{ background: 'rgba(15,23,42,0.45)', direction: isAr ? 'rtl' : 'ltr' }}
    >
      <div
        className="card w-full max-w-5xl min-h-[640px] flex flex-col md:flex-row overflow-hidden"
        style={{ borderRadius: 20 }}
      >
        {/* Sidebar */}
        <aside className="w-full md:w-60 shrink-0 p-5 md:p-6 md:border-r" style={{ borderColor: 'var(--border-hairline)', background: 'var(--bg-alt)' }}>
          <div className="flex items-center justify-between mb-6">
            <div className="flex items-center gap-2">
              <div className="w-9 h-9 rounded-full grid place-items-center" style={{ background: 'var(--primary-tint)', color: 'var(--primary-deep)' }}>
                <Settings className="w-4 h-4" />
              </div>
              <div>
                <div className="text-h4 leading-tight" style={{ color: 'var(--text-heading)' }}>
                  {isAr ? 'لوحة التحكم' : 'Admin'}
                </div>
                <div className="text-caption">{isAr ? 'الإعدادات والمحتوى' : 'Settings & content'}</div>
              </div>
            </div>
            <button onClick={onClose} className="md:hidden btn btn-ghost btn-sm" aria-label={isAr ? 'إغلاق' : 'Close'}>
              <X className="w-4 h-4" />
            </button>
          </div>

          <nav className="flex flex-col gap-0.5">
            {tabs.map(t => {
              const Icon = t.Icon;
              const active = activeTab === t.key;
              return (
                <button
                  key={t.key}
                  onClick={() => { setActiveTab(t.key); setImgSrc(''); }}
                  className="w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-start transition-colors"
                  style={{
                    background: active ? 'var(--primary-tint)' : 'transparent',
                    color: active ? 'var(--primary-deep)' : 'var(--text-dim)',
                  }}
                  onMouseEnter={(e) => { if (!active) e.currentTarget.style.background = 'var(--border-hairline)'; }}
                  onMouseLeave={(e) => { if (!active) e.currentTarget.style.background = 'transparent'; }}
                >
                  <Icon className="w-4 h-4" />
                  <span className="text-body-m font-medium">{isAr ? t.ar : t.en}</span>
                </button>
              );
            })}
          </nav>
        </aside>

        {/* Content */}
        <div className="flex-1 p-6 md:p-8 flex flex-col relative overflow-y-auto custom-scrollbar">
          <button
            onClick={onClose}
            className="absolute top-5 right-5 hidden md:grid w-9 h-9 place-items-center rounded-full transition-colors z-10"
            style={{ color: 'var(--text-muted)', background: 'transparent' }}
            onMouseEnter={(e) => { e.currentTarget.style.background = 'var(--border-hairline)'; e.currentTarget.style.color = 'var(--text-heading)'; }}
            onMouseLeave={(e) => { e.currentTarget.style.background = 'transparent'; e.currentTarget.style.color = 'var(--text-muted)'; }}
            aria-label={isAr ? 'إغلاق' : 'Close'}
          >
            <X className="w-4 h-4" />
          </button>

          {activeTab !== 'courses' && (
            <div className="flex items-center justify-between mb-6">
              <div>
                <span className="text-label">{isAr ? 'لوحة الإدارة' : 'Admin'}</span>
                <h3 className="text-h2 mt-1" style={{ color: 'var(--text-heading)' }}>
                  {isAr ? headings[activeTab][0] : headings[activeTab][1]}
                </h3>
              </div>
              {activeTab === 'dash' && assessments.length > 0 && (
                <button onClick={exportCSV} className="btn btn-secondary btn-md">
                  <Download className="w-4 h-4" /> {isAr ? 'تصدير CSV' : 'Export CSV'}
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
                <div className="flex items-center justify-center p-10">
                  <span className="inline-block w-6 h-6 rounded-full border-2 animate-spin" style={{ borderColor: 'var(--border-hairline)', borderTopColor: 'var(--primary)' }} />
                </div>
              ) : (
                <div className="card card-tight overflow-hidden">
                  <div className="overflow-x-auto">
                    <table className="w-full text-[0.875rem]" style={{ textAlign: isAr ? 'right' : 'left' }}>
                      <thead style={{ background: 'var(--bg-alt)', color: 'var(--text-muted)' }}>
                        <tr>
                          <th className="px-5 py-3 font-semibold text-[0.75rem] uppercase tracking-wider">{isAr ? 'الاسم' : 'Name'}</th>
                          <th className="px-5 py-3 font-semibold text-[0.75rem] uppercase tracking-wider">{isAr ? 'البريد' : 'Email'}</th>
                          <th className="px-5 py-3 font-semibold text-[0.75rem] uppercase tracking-wider">{isAr ? 'النتيجة' : 'Score'}</th>
                          <th className="px-5 py-3 font-semibold text-[0.75rem] uppercase tracking-wider">{isAr ? 'النزاهة' : 'Integrity'}</th>
                          <th className="px-5 py-3 font-semibold text-[0.75rem] uppercase tracking-wider">{isAr ? 'الحالة' : 'Status'}</th>
                        </tr>
                      </thead>
                      <tbody>
                        {assessments.length === 0 ? (
                          <tr>
                            <td colSpan={5} className="text-center py-10" style={{ color: 'var(--text-muted)' }}>
                              {isAr ? 'لا توجد بيانات بعد.' : 'No assessments yet.'}
                            </td>
                          </tr>
                        ) : assessments.map((a, i) => (
                          <tr key={i} className="border-t" style={{ borderColor: 'var(--border-hairline)', color: 'var(--text)' }}>
                            <td className="px-5 py-3.5 font-medium" style={{ color: 'var(--text-heading)' }}>{a.userName}</td>
                            <td className="px-5 py-3.5" style={{ color: 'var(--text-muted)' }}>{a.userEmail}</td>
                            <td className="px-5 py-3.5 tabular-nums">
                              <span className="badge" style={{
                                background: a.score >= 60 ? '#DEFFEE' : '#FFE4E6',
                                color:      a.score >= 60 ? '#065E41' : '#9F1239',
                              }}>{a.score}%</span>
                            </td>
                            <td className="px-5 py-3.5 tabular-nums" style={{ color: 'var(--text-dim)' }}>{a.integrityScore}%</td>
                            <td className="px-5 py-3.5">
                              <span className={`badge ${a.status === 'completed' ? 'badge-completed' : 'badge-failed'}`}>
                                {a.status === 'completed' ? (isAr ? 'مكتمل' : 'Completed') : (isAr ? 'منتهي' : 'Terminated')}
                              </span>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}
            </div>
          )}

          {/* Current image preview + upload */}
          {!imgSrc && activeTab !== 'dash' && activeTab !== 'email' && activeTab !== 'courses' && (
            <div className="card card-tight p-5 md:p-6 mb-6 flex flex-col md:flex-row items-stretch gap-5">
              <div
                className={`relative overflow-hidden grid place-items-center rounded-2xl w-full ${activeTab === 'cert' ? 'aspect-[1/1.414] max-w-[280px] mx-auto' : 'aspect-video md:w-1/2'}`}
                style={{ background: 'var(--bg-alt)', border: '1px solid var(--border-hairline)', containerType: 'inline-size' }}
              >
                {(activeTab === 'cert' && !savedCert) ? (
                  <span className="text-caption px-4 text-center">{isAr ? 'لا يوجد قالب مخصّص' : 'No custom template'}</span>
                ) : (
                  <div className="relative w-full h-full grid place-items-center">
                    <img
                      src={activeTab === 'logo' ? (savedLogo || '/tornix_logo.png') : activeTab === 'badge' ? (savedBadge || '/tcp_badge.png') : savedCert!}
                      alt="Current"
                      className="absolute inset-0 w-full h-full object-contain"
                    />
                    {activeTab === 'cert' && savedCert && (
                      <div className="absolute inset-0 pointer-events-none">
                        <div className="absolute inset-x-0 text-center z-10 flex flex-col items-center px-[10%]" style={{ top: `${nameY}%`, transform: 'translateY(-50%)' }}>
                          <h1
                            className={`font-bold leading-tight m-0 p-0 ${fontFamily}`}
                            style={{
                              color: nameColor,
                              fontSize: 'Student Name'.length > 25 ? '4cqw' : 'Student Name'.length > 15 ? '5cqw' : '6.3cqw',
                              maxWidth: '100%',
                              wordBreak: 'break-word',
                              paddingBottom: '0.2em',
                            }}
                          >
                            Student Name
                          </h1>
                        </div>
                        <div className="absolute inset-x-0 text-center pointer-events-none z-10" style={{ top: `${serialY}%`, transform: 'translateY(-50%)' }}>
                          <p
                            className={`font-bold tracking-widest leading-tight m-0 p-0 ${fontFamily}`}
                            style={{ color: serialColor, fontSize: `${(serialFontSize / 794) * 100}cqw` }}
                          >
                            TCP-26-XXXXXX
                          </p>
                        </div>
                      </div>
                    )}
                  </div>
                )}
              </div>
              <div className="flex-1 flex flex-col justify-center">
                <span className="text-label">{isAr ? 'الصورة الحالية' : 'Current image'}</span>
                <h4 className="text-h4 mt-1 mb-1.5" style={{ color: 'var(--text-heading)' }}>
                  {activeTab === 'logo' && (isAr ? 'الشعار الرئيسي' : 'Main logo')}
                  {activeTab === 'badge' && (isAr ? 'شارة الاعتماد' : 'Accreditation badge')}
                  {activeTab === 'cert' && (isAr ? 'قالب الشهادة' : 'Certificate template')}
                </h4>
                <p className="text-body-m mb-4" style={{ color: 'var(--text-muted)' }}>
                  {isAr ? 'ادعم JPG أو PNG أو PDF.' : 'JPG, PNG, or PDF supported.'}
                </p>
                <div className="flex flex-wrap items-center gap-2">
                  <label className="btn btn-primary btn-md cursor-pointer">
                    {isAr ? 'رفع ملف' : 'Upload file'}
                    <input type="file" accept="image/*,application/pdf" onChange={onSelectFile} className="hidden" />
                  </label>
                  <button onClick={() => handleReset(activeTab as 'logo' | 'badge' | 'cert')} className="btn btn-text btn-md">
                    {isAr ? 'استعادة الافتراضي' : 'Reset default'}
                  </button>
                </div>
              </div>
            </div>
          )}

          {/* Certificate styling controls */}
          {activeTab === 'cert' && !imgSrc && (
            <div className="card card-tight p-5 md:p-6">
              <span className="text-label">{isAr ? 'نمط النصوص والإحداثيات' : 'Text styling & coordinates'}</span>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mt-4">
                <div className="space-y-5">
                  <div>
                    <label className="block text-label mb-2">{isAr ? 'نوع الخط' : 'Font family'}</label>
                    <select value={fontFamily} onChange={e => setFontFamily(e.target.value)} className="input">
                      <option value="font-sans">Plex Sans (Default)</option>
                      <option value="font-serif">Serif</option>
                      <option value="font-mono">Monospace</option>
                      <option value="font-display">Display</option>
                      <option value="font-montserrat">Montserrat</option>
                    </select>
                  </div>

                  <div className="flex items-center justify-between">
                    <label className="text-body-m" style={{ color: 'var(--text-heading)' }}>{isAr ? 'لون الاسم' : 'Name color'}</label>
                    <input type="color" value={nameColor} onChange={e => setNameColor(e.target.value)} className="w-10 h-10 rounded-full cursor-pointer bg-transparent border-0" />
                  </div>

                  <div className="flex items-center justify-between pt-4 border-t" style={{ borderColor: 'var(--border-hairline)' }}>
                    <label className="text-body-m" style={{ color: 'var(--text-heading)' }}>{isAr ? 'لون الرقم المرجعي' : 'Serial color'}</label>
                    <input type="color" value={serialColor} onChange={e => setSerialColor(e.target.value)} className="w-10 h-10 rounded-full cursor-pointer bg-transparent border-0" />
                  </div>

                  <div>
                    <div className="flex justify-between text-body-m mb-2">
                      <span style={{ color: 'var(--text-heading)' }}>{isAr ? 'حجم خط الرقم' : 'Serial font size'}</span>
                      <span className="tabular-nums" style={{ color: 'var(--text-muted)' }}>{serialFontSize}px</span>
                    </div>
                    <input type="range" min="8" max="48" value={serialFontSize} onChange={e => setSerialFontSize(Number(e.target.value))} className="w-full" />
                  </div>
                </div>

                <div className="space-y-5 md:pt-1">
                  <div>
                    <div className="flex justify-between text-body-m mb-2">
                      <span style={{ color: 'var(--text-heading)' }}>{isAr ? 'موقع الاسم رأسياً' : 'Name Y position'}</span>
                      <span className="tabular-nums" style={{ color: 'var(--text-muted)' }}>{nameY}%</span>
                    </div>
                    <input type="range" min="10" max="98" value={nameY} onChange={e => setNameY(Number(e.target.value))} className="w-full" />
                  </div>
                  <div>
                    <div className="flex justify-between text-body-m mb-2">
                      <span style={{ color: 'var(--text-heading)' }}>{isAr ? 'موقع الرقم رأسياً' : 'Serial Y position'}</span>
                      <span className="tabular-nums" style={{ color: 'var(--text-muted)' }}>{serialY}%</span>
                    </div>
                    <input type="range" min="10" max="98" value={serialY} onChange={e => setSerialY(Number(e.target.value))} className="w-full" />
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* Cropper */}
          {imgSrc && (
            <div className="card card-tight flex-1 flex flex-col p-5 md:p-6 relative">
              <div className="absolute top-4 left-4 inline-flex items-center gap-1.5 px-3 py-1 rounded-full" style={{ background: 'var(--primary-tint)', color: 'var(--primary-deep)' }}>
                <CropIcon className="w-3.5 h-3.5" />
                <span className="text-[0.75rem] font-semibold">{isAr ? 'وضع القصّ' : 'Cropping mode'}</span>
              </div>
              <div className="flex-1 grid place-items-center w-full min-h-[300px] overflow-hidden mt-10 mb-6">
                <ReactCrop
                  crop={crop}
                  onChange={(_, percentCrop) => setCrop(percentCrop)}
                  onComplete={(c) => setCompletedCrop(c)}
                  className="rounded-xl outline-none max-h-[50vh]"
                >
                  <img
                    ref={imgRef}
                    alt="Crop"
                    src={imgSrc}
                    className="max-w-full max-h-full object-contain mx-auto"
                    onLoad={onImageLoad}
                  />
                </ReactCrop>
              </div>
              <div className="w-full flex gap-2 mt-auto">
                <button onClick={() => setImgSrc('')} className="btn btn-outline btn-md flex-1">
                  {isAr ? 'إلغاء' : 'Cancel'}
                </button>
                <button onClick={handleSaveCrop} disabled={isSaving} className="btn btn-primary btn-md flex-1">
                  <CheckCircle className={`w-4 h-4 ${isSaving ? 'animate-spin' : ''}`} />
                  {isSaving ? (isAr ? 'جاري الحفظ...' : 'Saving...') : (isAr ? 'قصّ وحفظ' : 'Crop & save')}
                </button>
              </div>
            </div>
          )}

          {activeTab === 'email' && (
            <div className="space-y-6">
              <p className="text-body-m" style={{ color: 'var(--text-muted)' }}>
                {isAr
                  ? 'مزوّد بريد لإرسال الإشعارات وشهادات الاعتماد. اختر Resend (الموصى به) أو EmailJS.'
                  : 'Email provider for notifications and certificate delivery. Use Resend (recommended) or EmailJS.'}
              </p>

              <div className="card card-tight p-5 md:p-6">
                <div className="flex items-center gap-2 mb-4">
                  <div className="w-7 h-7 rounded-full grid place-items-center" style={{ background: 'var(--primary-tint)', color: 'var(--primary-deep)' }}>
                    <Mail className="w-3.5 h-3.5" />
                  </div>
                  <h4 className="text-h4" style={{ color: 'var(--text-heading)' }}>Resend</h4>
                  <span className="badge badge-progress" style={{ marginInlineStart: 4 }}>{isAr ? 'موصى به' : 'Recommended'}</span>
                </div>
                <div className="space-y-4">
                  <label className="block">
                    <span className="text-label block mb-2">{isAr ? 'مفتاح API' : 'API Key'}</span>
                    <input type="text" value={resendKey} onChange={e => setResendKey(e.target.value)} className="input" placeholder="re_..." />
                  </label>
                  <label className="block">
                    <span className="text-label block mb-2">{isAr ? 'بريد المرسل' : 'Sender email'}</span>
                    <input type="email" value={resendFromEmail} onChange={e => setResendFromEmail(e.target.value)} className="input" placeholder="onboarding@resend.dev" />
                    <p className="text-[0.75rem] mt-2" style={{ color: 'var(--text-muted)' }}>
                      {isAr
                        ? 'يجب توثيق النطاق في Resend، أو استخدم onboarding@resend.dev لإرساله إلى بريدك المُوثَّق فقط.'
                        : 'Domain must be verified on Resend, or use onboarding@resend.dev to email yourself only.'}
                    </p>
                  </label>
                </div>
              </div>

              <div className="card card-tight p-5 md:p-6">
                <h4 className="text-h4 mb-4" style={{ color: 'var(--text-heading)' }}>EmailJS</h4>
                <div className="space-y-4">
                  <label className="block">
                    <span className="text-label block mb-2">{isAr ? 'معرف الخدمة' : 'Service ID'}</span>
                    <input type="text" value={emailServiceId} onChange={e => setEmailServiceId(e.target.value)} className="input" placeholder="service_..." />
                  </label>
                  <label className="block">
                    <span className="text-label block mb-2">{isAr ? 'معرف القالب' : 'Template ID'}</span>
                    <input type="text" value={emailTemplateId} onChange={e => setEmailTemplateId(e.target.value)} className="input" placeholder="template_..." />
                  </label>
                  <label className="block">
                    <span className="text-label block mb-2">{isAr ? 'المفتاح العام' : 'Public key'}</span>
                    <input type="text" value={emailPublicKey} onChange={e => setEmailPublicKey(e.target.value)} className="input" placeholder="..." />
                  </label>
                </div>
              </div>

              <div className="flex justify-end">
                <button
                  onClick={saveEmailSettings}
                  className={`btn ${emailSaveSuccess ? 'btn-secondary' : 'btn-primary'} btn-md`}
                >
                  {emailSaveSuccess ? <Check className="w-4 h-4" /> : <Settings className="w-4 h-4" />}
                  {emailSaveSuccess
                    ? (isAr ? 'تم الحفظ' : 'Saved')
                    : (isAr ? 'حفظ الإعدادات' : 'Save settings')}
                </button>
              </div>
            </div>
          )}

        </div>
      </div>
    </div>
  );
};

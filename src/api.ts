import { supabase } from './supabase';

// Thin fetch wrapper for the Netlify Function backend.
// Auth: pulls the current Supabase access token and forwards it as Bearer.
// All functions then verify it via supabase.auth.getUser(token) and rely on RLS.

export interface SessionUser {
  uid: string;             // auth.users.id (UUID)
  email: string;
  name: string | null;
  photo: string | null;
  isAdmin: boolean;
}

async function authHeaders(): Promise<Record<string, string>> {
  const { data } = await supabase.auth.getSession();
  const tok = data.session?.access_token;
  return tok ? { Authorization: `Bearer ${tok}` } : {};
}

async function jsonFetch<T>(input: string, init?: RequestInit): Promise<T> {
  const res = await fetch(input, {
    ...init,
    headers: {
      'Content-Type': 'application/json',
      ...(await authHeaders()),
      ...(init?.headers || {}),
    },
  });
  const text = await res.text();
  let data: any = undefined;
  try { data = text ? JSON.parse(text) : undefined; } catch { /* not JSON */ }
  if (!res.ok) {
    const msg = data?.error || text || res.statusText;
    throw new Error(`API ${res.status}: ${msg}`);
  }
  return data as T;
}

// ----- Auth -------------------------------------------------------
export async function fetchMe(): Promise<SessionUser | null> {
  const res = await jsonFetch<{ user: SessionUser | null }>('/api/me');
  return res.user;
}

export function loginWithGoogle(redirect: string = window.location.origin): void {
  void supabase.auth.signInWithOAuth({
    provider: 'google',
    options: { redirectTo: redirect },
  });
}

export async function logout(): Promise<void> {
  await supabase.auth.signOut();
}

// ----- Settings (branding) ---------------------------------------
export interface Branding {
  logo?: string; badge?: string; certBg?: string;
  nameY?: number; serialY?: number;
  fontFamily?: string; nameColor?: string; serialColor?: string; serialFontSize?: number;
  emailServiceId?: string; emailTemplateId?: string; emailPublicKey?: string;
  [k: string]: any;
}

export const fetchBranding = (): Promise<Branding> => jsonFetch<Branding>('/api/settings/branding');
export const saveBranding  = (b: Partial<Branding>): Promise<{ ok: true }> =>
  jsonFetch<{ ok: true }>('/api/settings/branding', { method: 'PUT', body: JSON.stringify(b) });

// ----- Courses ----------------------------------------------------
export interface CourseChapter { title: string; summary: string; startTime: number; endTime: number; }
export interface Course {
  id: number;
  title: string;
  videoUrl: string | null;
  chapters: CourseChapter[];
  createdAt: string;
}

export const listCourses  = (): Promise<Course[]> => jsonFetch<Course[]>('/api/courses');
export const createCourse = (c: { title: string; videoUrl?: string; chapters?: CourseChapter[] }): Promise<Course> =>
  jsonFetch<Course>('/api/courses', { method: 'POST', body: JSON.stringify(c) });

// ----- Assessments -----------------------------------------------
export interface AssessmentInsert {
  score: number;
  integrityScore: number;
  serialNumber?: string;
  status: 'Started' | 'completed' | 'terminated' | 'Passed' | 'Failed';
  answers: any[];
  questionsCount?: number;
  userName?: string;
  userPhoto?: string;
}

export interface AssessmentRow {
  id: number;
  userEmail: string;
  userName: string | null;
  userPhoto: string | null;
  score: number;
  integrityScore: number;
  serialNumber: string | null;
  status: string;
  questionsCount: number | null;
  createdAt: string;
}

export const submitAssessment = (a: AssessmentInsert) =>
  jsonFetch<{ id: number; createdAt: string }>('/api/assessments', { method: 'POST', body: JSON.stringify(a) });

export const listAssessments = (): Promise<AssessmentRow[]> =>
  jsonFetch<AssessmentRow[]>('/api/assessments');

// ----- Email -----------------------------------------------------
export const sendAssessmentEmail = (payload: {
  email: string; name: string; score: number; status: 'Passed' | 'Failed'; date: string;
  resendKey?: string; resendFromEmail?: string;
}) => jsonFetch<{ success: true; data: unknown }>('/api/send-email', {
  method: 'POST',
  body: JSON.stringify(payload),
});

// ----- Segmented courses -----------------------------------------
export interface QuizQuestion {
  id?: string;
  q_ar: string; q_en: string;
  choices_ar: string[]; choices_en: string[];
  answer: number;
}
export interface SegmentedCourse {
  id: number;
  slug: string;
  titleAr: string; titleEn: string;
  descriptionAr: string | null; descriptionEn: string | null;
  language: 'ar' | 'en';
  passingScorePct: number;
  examQuestionCount: number;
  unlockThresholdPct: number;
  createdAt: string;
}
export interface CourseSegment {
  id: number;
  num: number;
  slug: string;
  titleAr: string; titleEn: string;
  descriptionAr: string | null; descriptionEn: string | null;
  durationSec: number;
  vimeo: { introId: string | null; contentId: string | null; outroId: string | null };
  introDurationSec: number | null;
  outroDurationSec: number | null;
  nextTitleAr: string | null; nextTitleEn: string | null;
  quiz: QuizQuestion[];
}

export const listSegmentedCourses = (): Promise<Array<{ id: number; slug: string; titleAr: string; titleEn: string; createdAt: string }>> =>
  jsonFetch('/api/segmented-courses');

export const fetchSegmentedCourse = (slug: string): Promise<{ course: SegmentedCourse; segments: CourseSegment[] }> =>
  jsonFetch(`/api/segmented-courses/${encodeURIComponent(slug)}`);

export const upsertSegmentedCourse = (payload: {
  slug: string; titleAr: string; titleEn: string;
  descriptionAr?: string; descriptionEn?: string;
  language?: 'ar' | 'en';
  passingScorePct?: number; examQuestionCount?: number; unlockThresholdPct?: number;
  segments?: Array<Omit<CourseSegment, 'id'>>;
}): Promise<{ id: number }> =>
  jsonFetch('/api/segmented-courses', { method: 'POST', body: JSON.stringify(payload) });

// ----- Progress -----
export type ClipKind = 'intro' | 'content' | 'outro';
export interface ProgressRow {
  segmentId: number;
  clipKind: ClipKind;
  positionSec: number;
  completedAt: string | null;
  updatedAt: string;
}
export const fetchMyProgress = (courseSlug: string): Promise<ProgressRow[]> =>
  jsonFetch(`/api/progress/${encodeURIComponent(courseSlug)}`);

export const upsertProgress = (payload: {
  segmentId: number;
  clipKind: ClipKind;
  positionSec: number;
  completedAt?: string;
}): Promise<{ ok: true }> =>
  jsonFetch('/api/progress', { method: 'POST', body: JSON.stringify(payload) });

// Beacon-friendly variant: returns true if accepted by the browser.
// Use during `beforeunload` so the final write is not lost.
export async function beaconProgress(payload: {
  segmentId: number; clipKind: ClipKind; positionSec: number; completedAt?: string;
}): Promise<boolean> {
  const tok = (await supabase.auth.getSession()).data.session?.access_token;
  if (!tok) return false;
  const blob = new Blob([JSON.stringify({ ...payload, _token: tok })], { type: 'application/json' });
  return navigator.sendBeacon('/api/progress', blob);
}

// ----- Transcript -----
export interface TranscriptSentence { start: number; end: number; text: string; }
export const fetchTranscript = (slug: string): Promise<{ sentences: TranscriptSentence[] }> =>
  jsonFetch(`/api/transcript/${encodeURIComponent(slug)}`);

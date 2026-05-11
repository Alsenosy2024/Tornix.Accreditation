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

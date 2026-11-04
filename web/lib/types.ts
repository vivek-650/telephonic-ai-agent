// Shapes returned by the API. Kept in one place so pages and components agree.

export type Stage = 'applied' | 'screening' | 'review' | 'shortlisted' | 'interview' | 'hired' | 'rejected';
export type Verdict = 'Strong' | 'Maybe' | 'Reject' | 'Pending screen';
export type Flag = { level: 'red' | 'amber' | 'good'; text: string };

export interface Job {
  id: string; title: string; company: string; location: string; description: string; status?: 'open' | 'paused' | 'closed';
  min_years: number; max_salary?: number; max_notice_days?: number; headcount?: number;
  locations?: string[]; must_skills?: string[]; custom_questions?: string[];
  negotiable?: number; stretch_pct?: number; negotiation_notes?: string; voice?: string; agent_name?: string;
  created_at?: string;
}

export interface CandidateRow {
  id: string; job_id: string; job_title: string; name: string; email: string; phone: string; city: string;
  years: number | null; notice_days: number | null; expected_salary: number | null; skills: string;
  stage: Stage; source: string; created_at: string; total: number | null; verdict: Verdict | null;
  flags: Flag[]; blocker: string | null; outliers: { good: boolean; text: string }[]; helpful: number | null; spot_check?: number;
}

export interface BreakdownItem { label: string; points: number; max: number; note: string }
export interface Screening {
  id: string; mode: 'phone' | 'web' | 'simulator'; status: 'in_progress' | 'completed' | 'incomplete'; run_id: string | null;
  transcript: { role: 'agent' | 'candidate'; text: string }[]; answers: Record<string, unknown>;
  started_at: string; ended_at: string | null; duration_sec?: number | null; failure_reason?: string | null;
}
export interface CandidateDetail extends Omit<CandidateRow, 'total' | 'verdict' | 'flags' | 'blocker' | 'outliers' | 'job_title' | 'helpful'> {
  why: string; resume_text: string | null; consent_at: string | null;
  job: Job;
  score: { total: number; verdict: Verdict; breakdown: BreakdownItem[]; flags: Flag[]; updated_at: string } | null;
  evaluation: { hire_score: number; pros: string[]; cons: string[]; outliers: { good: boolean; text: string }[]; blocker: string | null };
  highlights: { proof: string[]; impact: number; scale: number; own: number; words: number } | null;
  screenings: Screening[];
  events: { id: number; kind: string; detail: string; at: string }[];
  activities: { id: string; kind: string; text: string; rating: number | null; recruiter_name: string | null; created_at: string }[];
  feedback: { helpful: number; note: string; created_at: string }[];
  score_history: { rubric_version: string; total: number; verdict: Verdict; trigger: string; created_at: string }[];
}

export interface Interview {
  id: string; candidate_id: string; candidate_name?: string; job_title?: string; recruiter_name?: string | null;
  starts_at: string; duration_min: number; meet_link: string; status: 'scheduled' | 'completed' | 'no_show' | 'cancelled'; scorecards?: number;
}
export interface Offer { id: string; candidate_id: string; candidate_name?: string; job_title?: string; salary: number; joining_date: string; status: 'draft' | 'sent' | 'negotiating' | 'accepted' | 'declined'; letter: string; warning: string | null; created_at: string }

export interface CandidateSuite {
  phone: string; source: string; consent: boolean; spot_check: boolean; stage: Stage; has_resume: boolean;
  resume: { summary?: string; skills?: string[]; current_company?: string } | null;
  analysis: { summary: string; strengths: string[]; concerns: string[]; red_flags: string[]; next_step: 'advance' | 'hold' | 'reject'; confidence: number; provider: string; at: string } | null;
  signal: { signal: number | null; band: string; parts: { label: string; value: number; weight: number }[]; veto: boolean };
  interviews: (Omit<Interview, 'scorecards'> & { scorecards: { recommendation: string; ratings: Record<string, number>; notes: string; recruiter_name: string }[] })[];
  references: { id: string; name: string; phone: string; relation: string; company: string; status: string; answers: { rehire: boolean; rating: number; strengths: string; concerns: string } | null }[];
  offers: Offer[];
  onboarding: { id: string; title: string; kind: string; status: 'pending' | 'done'; due: string }[];
  messages: { id: string; channel: string; kind: string; body: string; status: 'draft' | 'sent' | 'skipped'; provider: string; created_at: string }[];
  dimensions: string[];
}

export interface Config {
  brand: string; agent_name: string; careers_url: string; dograh_web: boolean; dograh_phone: boolean; dograh_api_live: boolean;
  embed_token: string | null; questions: { key: string; type: string; ask: string }[]; criteria: { label: string; max: number; rule: string }[];
}

export interface Analytics {
  funnel: { label: string; n: number }[];
  per_job: { job: string; applied: number; screened: number; shortlisted: number; hired: number }[];
  sources: { label: string; n: number }[]; score_hist: { label: string; n: number }[];
  median_minutes_to_screen: number | null; median_days_to_hire: number | null; no_show_rate: number | null; offer_accept_rate: number | null;
  ai_helpful_rate: number | null; spot_checks_open: number;
}

export interface Stats { total: number; screened: number; strong: number; avg_score: number | null; helpful_yes: number; feedback_count: number; minutes_saved: number; by_stage: { stage: Stage; n: number }[] }
export interface Recruiter { id: string; name: string; role: string }
export interface CallRow { id: string; candidate_id: string; mode: string; status: string; run_id: string | null; started_at: string; ended_at: string | null; name: string; phone: string; job_title: string; total: number | null; verdict: Verdict | null; duration_sec: number | null; turns: number; failure_reason: string | null }

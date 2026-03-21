export interface TemplateWeights {
  introduction: number;
  needDiscovery: number;
  presentation: number;
  objectionHandling: number;
  stopWords: number;
  closing: number;
}

export interface Template {
  id: number;
  title: string;
  description: string | null;
  is_active: number;
  created_by_user_id: number;
  created_at: string;
  updated_at: string;
  weights: TemplateWeights;
}

export interface CallScore {
  introduction: number;
  needDiscovery: number;
  presentation: number;
  objectionHandling: number;
  stopWords: number;
  closing: number;
  average: number;
  feedback: string;
}

export interface FactBlocks {
  introduction: string;
  needDiscovery: string;
  presentation: string;
  objectionHandling: string;
  stopWords: string;
  closing: string;
  summary: string;
}

export interface TranscriptionTurn {
  speaker: string;
  text: string;
  timestamp?: string;
  speakerReliable?: boolean;
}

export interface Subscription {
  planName: string;
  status: string;
  secondsLimit: number;
  secondsUsed: number;
  periodStart: string;
  periodEnd: string;
  nextBillingAt: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface ProfileData {
  id: number;
  email: string;
  fullName: string;
  role: string;
  createdAt: string;
  subscription: Subscription | null;
}

export interface DashboardAgent {
  name: string;
  calls: number;
  score: number;
  trend: string;
  status: string;
}

export interface DashboardData {
  totalCalls: number;
  averageScore: number;
  totalDurationSeconds: number;
  activeTemplates: number;
  leaderboard: DashboardAgent[];
}

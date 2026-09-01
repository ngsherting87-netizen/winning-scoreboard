export type Role = 'admin' | 'agent';

export type Profile = {
  id: number;
  code: string;
  name: string;
  role: Role;
  email: string | null;
};

export type AgentSummary = {
  id: number;
  code: string;
  name: string;
  email: string | null;
  claimed: boolean;
  active: boolean;
  dailyScores: number[];
  weeklyScore: number;
  maximum: number;
  execution: number;
  level: 'strong' | 'improve' | 'action';
};

export type ActivityDefinition = {
  id: number;
  code: string;
  labelZh: string;
  labelEn: string;
  points: number;
  sortOrder: number;
};

export type WeeklyReview = {
  strongestAction: string;
  biggestGap: string;
  topProspects: string;
  nextImprovement: string;
  nextCaseTarget: string;
  nextTpcTarget: string;
};

export type DashboardData = {
  status: 'ready' | 'onboarding';
  viewer: { displayName: string; email: string };
  profile: Profile | null;
  unclaimedAgents: Array<Pick<Profile, 'id' | 'code' | 'name'>>;
  actions: ActivityDefinition[];
  agents: AgentSummary[];
  selectedAgent: Pick<Profile, 'id' | 'code' | 'name'> | null;
  selectedDate: string;
  weekStart: string;
  weekDates: string[];
  completedActionIds: number[];
  dailyScores: number[];
  weeklyScore: number;
  maximum: number;
  execution: number;
  level: 'strong' | 'improve' | 'action';
  review: WeeklyReview;
};

import type { User } from '@supabase/supabase-js';

import { EMPTY_REVIEW, getExecutionLevel, getWeekDates, getWeekStart, normalizeDate } from '@/lib/scoreboard-domain';
import type { ActivityDefinition, AgentSummary, DashboardData, Profile, WeeklyReview } from '@/lib/scoreboard-types';
import { supabase } from '@/src/supabase';

type AgentRow = {
  id: number;
  code: string;
  name: string;
  role: 'admin' | 'agent';
  active: boolean;
  access_configured: boolean;
};

type ActionRow = {
  id: number;
  code: string;
  label_zh: string;
  label_en: string;
  points: number;
  sort_order: number;
  active: boolean;
};

type DailyRow = {
  agent_id: number;
  activity_date: string;
  completed_action_ids: number[];
};

type ReviewRow = {
  strongest_action: string;
  biggest_gap: string;
  top_prospects: string;
  next_improvement: string;
  next_case_target: string;
  next_tpc_target: string;
};

function profileFromAgent(row: AgentRow): Profile {
  return { id: row.id, code: row.code, name: row.name, role: row.role, email: null };
}

function authorizedAgentId(user: User) {
  const value = Number(user.app_metadata?.scoreboard_agent_id);
  return Number.isInteger(value) && value > 0 ? value : null;
}

function authorizedRole(user: User) {
  const value = user.app_metadata?.scoreboard_role;
  return value === 'admin' || value === 'agent' ? value : null;
}

async function readProfile(user: User): Promise<Profile | null> {
  const agentId = authorizedAgentId(user);
  const role = authorizedRole(user);
  if (!agentId || !role) return null;
  const { data, error } = await supabase
    .from('agents')
    .select('id, code, name, role, active, access_configured')
    .eq('id', agentId)
    .eq('role', role)
    .eq('active', true)
    .maybeSingle();
  if (error) throw error;
  return data ? profileFromAgent(data as AgentRow) : null;
}

async function listActions(): Promise<ActivityDefinition[]> {
  const { data, error } = await supabase
    .from('activity_definitions')
    .select('id, code, label_zh, label_en, points, sort_order, active')
    .eq('active', true)
    .order('sort_order');
  if (error) throw error;
  return ((data ?? []) as ActionRow[]).map((row) => ({
    id: row.id,
    code: row.code,
    labelZh: row.label_zh,
    labelEn: row.label_en,
    points: row.points,
    sortOrder: row.sort_order,
  }));
}

async function listAgentRows(profile: Profile): Promise<AgentRow[]> {
  let query = supabase
    .from('agents')
    .select('id, code, name, role, active, access_configured')
    .eq('role', 'agent')
    .order('code');
  if (profile.role === 'agent') query = query.eq('id', profile.id);
  const { data, error } = await query;
  if (error) throw error;
  return (data ?? []) as AgentRow[];
}

async function readWeekActivity(agentIds: number[], weekDates: string[]) {
  const result = new Map<number, Map<string, number[]>>();
  for (const agentId of agentIds) result.set(agentId, new Map());
  if (!agentIds.length) return result;
  const { data, error } = await supabase
    .from('daily_activity')
    .select('agent_id, activity_date, completed_action_ids')
    .in('agent_id', agentIds)
    .gte('activity_date', weekDates[0])
    .lte('activity_date', weekDates[6]);
  if (error) throw error;
  for (const row of (data ?? []) as DailyRow[]) {
    result.get(row.agent_id)?.set(row.activity_date, Array.isArray(row.completed_action_ids) ? row.completed_action_ids : []);
  }
  return result;
}

function emptyDashboard(user: User, date: string): DashboardData {
  const weekStart = getWeekStart(date);
  return {
    status: 'onboarding',
    viewer: { displayName: '用户', email: user.email ?? '' },
    profile: null,
    unclaimedAgents: [],
    actions: [],
    agents: [],
    selectedAgent: null,
    selectedDate: date,
    weekStart,
    weekDates: getWeekDates(weekStart),
    completedActionIds: [],
    dailyScores: Array(7).fill(0),
    weeklyScore: 0,
    maximum: 0,
    execution: 0,
    level: 'action',
    review: { ...EMPTY_REVIEW },
  };
}

export async function loadDashboard(user: User, requestedDate?: string, requestedAgentId?: number | null): Promise<DashboardData> {
  const date = normalizeDate(requestedDate);
  const weekStart = getWeekStart(date);
  const weekDates = getWeekDates(weekStart);
  const profile = await readProfile(user);
  if (!profile) return emptyDashboard(user, date);

  const [actions, allAgentRows] = await Promise.all([listActions(), listAgentRows(profile)]);
  const activeRows = allAgentRows.filter((agent) => agent.active);
  const targetRow = profile.role === 'agent'
    ? activeRows.find((agent) => agent.id === profile.id) ?? null
    : activeRows.find((agent) => agent.id === requestedAgentId) ?? activeRows[0] ?? null;
  const weeklyActivity = await readWeekActivity(allAgentRows.map((agent) => agent.id), weekDates);
  const points = new Map(actions.map((action) => [action.id, action.points]));
  const maximum = actions.reduce((sum, action) => sum + action.points, 0) * 7;

  const agents: AgentSummary[] = allAgentRows.map((agent) => {
    const dailyScores = weekDates.map((day) => (weeklyActivity.get(agent.id)?.get(day) ?? [])
      .reduce((sum, actionId) => sum + (points.get(actionId) ?? 0), 0));
    const weeklyScore = dailyScores.reduce((sum, score) => sum + score, 0);
    const execution = maximum ? weeklyScore / maximum : 0;
    return {
      id: agent.id,
      code: agent.code,
      name: agent.name,
      email: null,
      claimed: agent.access_configured,
      active: agent.active,
      dailyScores,
      weeklyScore,
      maximum,
      execution,
      level: getExecutionLevel(execution),
    };
  });

  const targetSummary = targetRow ? agents.find((agent) => agent.id === targetRow.id) ?? null : null;
  const completedActionIds = targetRow ? weeklyActivity.get(targetRow.id)?.get(date) ?? [] : [];
  let review: WeeklyReview = { ...EMPTY_REVIEW };
  if (targetRow) {
    const { data: stored, error } = await supabase
      .from('weekly_reviews')
      .select('strongest_action, biggest_gap, top_prospects, next_improvement, next_case_target, next_tpc_target')
      .eq('agent_id', targetRow.id)
      .eq('week_start', weekStart)
      .maybeSingle();
    if (error) throw error;
    if (stored) {
      const row = stored as ReviewRow;
      review = {
        strongestAction: row.strongest_action,
        biggestGap: row.biggest_gap,
        topProspects: row.top_prospects,
        nextImprovement: row.next_improvement,
        nextCaseTarget: row.next_case_target,
        nextTpcTarget: row.next_tpc_target,
      };
    }
  }

  const dailyScores = targetSummary?.dailyScores ?? Array(7).fill(0);
  const weeklyScore = dailyScores.reduce((sum, score) => sum + score, 0);
  const execution = maximum ? weeklyScore / maximum : 0;
  return {
    status: 'ready',
    viewer: { displayName: profile.name, email: profile.code },
    profile,
    unclaimedAgents: [],
    actions,
    agents,
    selectedAgent: targetRow ? { id: targetRow.id, code: targetRow.code, name: targetRow.name } : null,
    selectedDate: date,
    weekStart,
    weekDates,
    completedActionIds,
    dailyScores,
    weeklyScore,
    maximum,
    execution,
    level: getExecutionLevel(execution),
    review,
  };
}

function authorizeTarget(profile: Profile, requestedAgentId: number | null | undefined) {
  const targetId = profile.role === 'admin' ? requestedAgentId : profile.id;
  if (!targetId) throw new Error('请选择代理员');
  if (profile.role === 'agent' && targetId !== profile.id) throw new Error('无权访问其他代理资料');
  return targetId;
}

export async function saveDailyActivity(user: User, profile: Profile, date: string, requestedAgentId: number | null, completedActionIds: number[]) {
  const targetId = authorizeTarget(profile, requestedAgentId);
  const validIds = [...new Set(completedActionIds.filter((id) => Number.isInteger(id) && id > 0))];
  const { error } = await supabase.from('daily_activity').upsert({
    agent_id: targetId,
    activity_date: normalizeDate(date),
    completed_action_ids: validIds,
    updated_by: user.id,
    updated_at: new Date().toISOString(),
  }, { onConflict: 'agent_id,activity_date' });
  if (error) throw error;
}

export async function saveWeeklyReview(user: User, profile: Profile, date: string, requestedAgentId: number | null, review: WeeklyReview) {
  const targetId = authorizeTarget(profile, requestedAgentId);
  const { error } = await supabase.from('weekly_reviews').upsert({
    agent_id: targetId,
    week_start: getWeekStart(normalizeDate(date)),
    strongest_action: review.strongestAction.slice(0, 1000),
    biggest_gap: review.biggestGap.slice(0, 1000),
    top_prospects: review.topProspects.slice(0, 1000),
    next_improvement: review.nextImprovement.slice(0, 1000),
    next_case_target: review.nextCaseTarget.slice(0, 300),
    next_tpc_target: review.nextTpcTarget.slice(0, 300),
    updated_by: user.id,
    updated_at: new Date().toISOString(),
  }, { onConflict: 'agent_id,week_start' });
  if (error) throw error;
}

async function invokeErrorMessage(error: unknown) {
  if (error && typeof error === 'object' && 'context' in error) {
    try {
      const response = (error as { context?: Response }).context;
      const body = response ? await response.clone().json() as { error?: string } : null;
      if (body?.error) return body.error;
    } catch {
      // Fall through to the SDK message.
    }
  }
  return error instanceof Error ? error.message : '无法更新代理';
}

export async function saveAgent(profile: Profile, input: { operation: 'create'; name: string } | { operation: 'update'; id: number; name: string; active: boolean; clearBinding: boolean }) {
  if (profile.role !== 'admin') throw new Error('只有 AD Serene 可以管理代理');
  const body = input.operation === 'create'
    ? { action: 'create-agent', name: input.name }
    : { action: 'update-agent', agentId: input.id, name: input.name, active: input.active, resetAccessCode: input.clearBinding };
  const { data, error } = await supabase.functions.invoke('scoreboard-access', { body });
  if (error) throw new Error(await invokeErrorMessage(error));
  return { accessCode: (data as { accessCode?: string | null } | null)?.accessCode ?? null };
}

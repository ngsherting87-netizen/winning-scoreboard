import { NextRequest, NextResponse } from 'next/server';

import { getChatGPTUser } from '@/app/chatgpt-auth';
import { EMPTY_REVIEW, getExecutionLevel, getWeekDates, getWeekStart, normalizeDate } from '@/lib/scoreboard-domain';
import { ensureDatabase, getD1, listActivities, listAgentRows, resolveProfile, toProfile } from '@/lib/scoreboard-storage';
import type { AgentSummary, DashboardData, WeeklyReview } from '@/lib/scoreboard-types';

export const dynamic = 'force-dynamic';

type ScoreRow = { agent_id: number; activity_date: string | null; score: number | null };

export async function GET(request: NextRequest) {
  try {
    const user = await getChatGPTUser();
    if (!user) return NextResponse.json({ error: '请先登录' }, { status: 401 });

    await ensureDatabase();
    const profile = await resolveProfile(user);
    const date = normalizeDate(request.nextUrl.searchParams.get('date'));
    const weekStart = getWeekStart(date);
    const weekDates = getWeekDates(weekStart);

    if (!profile) {
      const unclaimed = (await listAgentRows()).filter((agent) => !agent.user_id);
      const payload: DashboardData = {
        status: 'onboarding',
        viewer: { displayName: user.displayName, email: user.email },
        profile: null,
        unclaimedAgents: unclaimed.map((agent) => ({ id: agent.id, code: agent.code, name: agent.name })),
        actions: [],
        agents: [],
        selectedAgent: null,
        selectedDate: date,
        weekStart,
        weekDates,
        completedActionIds: [],
        dailyScores: Array(7).fill(0),
        weeklyScore: 0,
        maximum: 0,
        execution: 0,
        level: 'action',
        review: { ...EMPTY_REVIEW },
      };
      return NextResponse.json(payload);
    }

    const db = getD1();
    const actions = await listActivities();
    const allAgentRows = await listAgentRows(profile.role === 'admin');
    const activeAgentRows = allAgentRows.filter((agent) => agent.active === 1);
    const requestedAgentId = Number(request.nextUrl.searchParams.get('agentId')) || null;
    const targetRow = profile.role === 'agent'
      ? activeAgentRows.find((agent) => agent.id === profile.id)
      : activeAgentRows.find((agent) => agent.id === requestedAgentId) ?? activeAgentRows[0] ?? null;

    const maximum = actions.reduce((sum, action) => sum + action.points, 0) * 7;
    const weekEnd = weekDates[6];
    const weeklyRows = await db.prepare(`
      SELECT a.id AS agent_id, d.activity_date, COALESCE(SUM(def.points),0) AS score
      FROM agents a
      LEFT JOIN daily_activity d ON d.agent_id=a.id AND d.completed=1 AND d.activity_date BETWEEN ? AND ?
      LEFT JOIN activity_definitions def ON def.id=d.activity_id AND def.active=1
      WHERE a.role='agent'
      GROUP BY a.id,d.activity_date
      ORDER BY a.code,d.activity_date
    `).bind(weekStart, weekEnd).all<ScoreRow>();

    const scoreMap = new Map<number, number[]>();
    for (const agent of allAgentRows) scoreMap.set(agent.id, Array(7).fill(0));
    for (const row of weeklyRows.results) {
      if (!row.activity_date) continue;
      const dayIndex = weekDates.indexOf(row.activity_date);
      if (dayIndex >= 0) scoreMap.get(row.agent_id)![dayIndex] = Number(row.score ?? 0);
    }

    const agents: AgentSummary[] = allAgentRows.map((agent) => {
      const dailyScores = scoreMap.get(agent.id) ?? Array(7).fill(0);
      const weeklyScore = dailyScores.reduce((sum, score) => sum + score, 0);
      const execution = maximum ? weeklyScore / maximum : 0;
      return {
        id: agent.id,
        code: agent.code,
        name: agent.name,
        email: agent.user_email,
        claimed: Boolean(agent.user_id),
        active: agent.active === 1,
        dailyScores,
        weeklyScore,
        maximum,
        execution,
        level: getExecutionLevel(execution),
      };
    });

    let completedActionIds: number[] = [];
    let review: WeeklyReview = { ...EMPTY_REVIEW };
    let dailyScores = Array(7).fill(0) as number[];
    if (targetRow) {
      const completed = await db.prepare('SELECT activity_id FROM daily_activity WHERE agent_id=? AND activity_date=? AND completed=1').bind(targetRow.id, date).all<{ activity_id: number }>();
      completedActionIds = completed.results.map((row) => row.activity_id);
      dailyScores = scoreMap.get(targetRow.id) ?? Array(7).fill(0);
      const reviewRow = await db.prepare(`SELECT strongest_action,biggest_gap,top_prospects,next_improvement,next_case_target,next_tpc_target
        FROM weekly_reviews WHERE agent_id=? AND week_start=? LIMIT 1`).bind(targetRow.id, weekStart).first<{
        strongest_action: string; biggest_gap: string; top_prospects: string; next_improvement: string; next_case_target: string; next_tpc_target: string;
      }>();
      if (reviewRow) {
        review = {
          strongestAction: reviewRow.strongest_action,
          biggestGap: reviewRow.biggest_gap,
          topProspects: reviewRow.top_prospects,
          nextImprovement: reviewRow.next_improvement,
          nextCaseTarget: reviewRow.next_case_target,
          nextTpcTarget: reviewRow.next_tpc_target,
        };
      }
    }

    const weeklyScore = dailyScores.reduce((sum, score) => sum + score, 0);
    const execution = maximum ? weeklyScore / maximum : 0;
    const payload: DashboardData = {
      status: 'ready',
      viewer: { displayName: user.displayName, email: user.email },
      profile,
      unclaimedAgents: [],
      actions,
      agents,
      selectedAgent: targetRow ? toProfile(targetRow) : null,
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
    return NextResponse.json(payload);
  } catch (error) {
    const message = error instanceof Error ? error.message : '无法读取计分板';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

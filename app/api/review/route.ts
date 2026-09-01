import { NextRequest, NextResponse } from 'next/server';

import { getChatGPTUser } from '@/app/chatgpt-auth';
import { getWeekStart, normalizeDate } from '@/lib/scoreboard-domain';
import { authorizeAgentTarget, ensureDatabase, getD1, resolveProfile } from '@/lib/scoreboard-storage';
import type { WeeklyReview } from '@/lib/scoreboard-types';

export async function POST(request: NextRequest) {
  try {
    const user = await getChatGPTUser();
    if (!user) return NextResponse.json({ error: '请先登录' }, { status: 401 });
    await ensureDatabase();
    const profile = await resolveProfile(user);
    if (!profile) return NextResponse.json({ error: '请先选择代理身份' }, { status: 403 });
    const body = await request.json() as { date?: string; agentId?: number | null; review?: Partial<WeeklyReview> };
    const targetId = await authorizeAgentTarget(profile, Number(body.agentId) || null);
    const weekStart = getWeekStart(normalizeDate(body.date));
    const review = body.review ?? {};
    const values = [
      String(review.strongestAction ?? '').slice(0, 1000),
      String(review.biggestGap ?? '').slice(0, 1000),
      String(review.topProspects ?? '').slice(0, 1000),
      String(review.nextImprovement ?? '').slice(0, 1000),
      String(review.nextCaseTarget ?? '').slice(0, 300),
      String(review.nextTpcTarget ?? '').slice(0, 300),
    ];
    await getD1().prepare(`INSERT INTO weekly_reviews(agent_id,week_start,strongest_action,biggest_gap,top_prospects,next_improvement,next_case_target,next_tpc_target,updated_at)
      VALUES(?,?,?,?,?,?,?,?,CURRENT_TIMESTAMP)
      ON CONFLICT(agent_id,week_start) DO UPDATE SET strongest_action=excluded.strongest_action,biggest_gap=excluded.biggest_gap,
      top_prospects=excluded.top_prospects,next_improvement=excluded.next_improvement,next_case_target=excluded.next_case_target,
      next_tpc_target=excluded.next_tpc_target,updated_at=CURRENT_TIMESTAMP`).bind(targetId, weekStart, ...values).run();
    return NextResponse.json({ ok: true });
  } catch (error) {
    const message = error instanceof Error ? error.message : '无法保存复盘';
    return NextResponse.json({ error: message }, { status: 400 });
  }
}

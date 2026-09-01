import { NextRequest, NextResponse } from 'next/server';

import { getChatGPTUser } from '@/app/chatgpt-auth';
import { normalizeDate } from '@/lib/scoreboard-domain';
import { authorizeAgentTarget, ensureDatabase, getD1, resolveProfile } from '@/lib/scoreboard-storage';

export async function POST(request: NextRequest) {
  try {
    const user = await getChatGPTUser();
    if (!user) return NextResponse.json({ error: '请先登录' }, { status: 401 });
    await ensureDatabase();
    const profile = await resolveProfile(user);
    if (!profile) return NextResponse.json({ error: '请先选择代理身份' }, { status: 403 });

    const body = await request.json() as { date?: string; agentId?: number | null; completedActionIds?: number[] };
    const date = normalizeDate(body.date);
    const targetId = await authorizeAgentTarget(profile, Number(body.agentId) || null);
    const requested = [...new Set((body.completedActionIds ?? []).map(Number).filter(Number.isInteger))];
    const db = getD1();
    const active = await db.prepare('SELECT id FROM activity_definitions WHERE active=1').all<{ id: number }>();
    const allowed = new Set(active.results.map((row) => row.id));
    const validIds = requested.filter((id) => allowed.has(id));

    const statements = [db.prepare('DELETE FROM daily_activity WHERE agent_id=? AND activity_date=?').bind(targetId, date)];
    for (const activityId of validIds) {
      statements.push(db.prepare(`INSERT INTO daily_activity(agent_id,activity_id,activity_date,completed,updated_at)
        VALUES(?,?,?,1,CURRENT_TIMESTAMP)`).bind(targetId, activityId, date));
    }
    await db.batch(statements);
    return NextResponse.json({ ok: true });
  } catch (error) {
    const message = error instanceof Error ? error.message : '无法保存行动';
    return NextResponse.json({ error: message }, { status: 400 });
  }
}

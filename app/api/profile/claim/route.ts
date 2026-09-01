import { NextRequest, NextResponse } from 'next/server';

import { getChatGPTUser } from '@/app/chatgpt-auth';
import { ensureDatabase, getD1, resolveProfile } from '@/lib/scoreboard-storage';

export async function POST(request: NextRequest) {
  try {
    const user = await getChatGPTUser();
    if (!user) return NextResponse.json({ error: '请先登录' }, { status: 401 });
    await ensureDatabase();
    const existing = await resolveProfile(user);
    if (existing) return NextResponse.json({ ok: true });
    const body = await request.json() as { agentId?: number };
    const agentId = Number(body.agentId);
    if (!Number.isInteger(agentId)) return NextResponse.json({ error: '请选择代理身份' }, { status: 400 });
    const result = await getD1().prepare(`UPDATE agents SET user_id=?,user_email=?,updated_at=CURRENT_TIMESTAMP
      WHERE id=? AND role='agent' AND active=1 AND user_id IS NULL`).bind(user.userId, user.email, agentId).run();
    if (!result.meta.changes) return NextResponse.json({ error: '该代理身份已被绑定，请选择其他身份' }, { status: 409 });
    return NextResponse.json({ ok: true });
  } catch (error) {
    const message = error instanceof Error ? error.message : '无法绑定身份';
    return NextResponse.json({ error: message }, { status: 400 });
  }
}

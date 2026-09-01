import { NextRequest, NextResponse } from 'next/server';

import { getChatGPTUser } from '@/app/chatgpt-auth';
import { ensureDatabase, getD1, resolveProfile } from '@/lib/scoreboard-storage';

export async function POST(request: NextRequest) {
  try {
    const user = await getChatGPTUser();
    if (!user) return NextResponse.json({ error: '请先登录' }, { status: 401 });
    await ensureDatabase();
    const profile = await resolveProfile(user);
    if (!profile || profile.role !== 'admin') return NextResponse.json({ error: '只有 AD Serene 可以管理代理' }, { status: 403 });
    const body = await request.json() as { operation?: 'create' | 'update'; id?: number; name?: string; active?: boolean; clearBinding?: boolean };
    const name = String(body.name ?? '').trim().slice(0, 80);
    if (!name) return NextResponse.json({ error: '请输入代理姓名' }, { status: 400 });
    const db = getD1();
    if (body.operation === 'create') {
      const row = await db.prepare("SELECT COALESCE(MAX(CAST(SUBSTR(code,3) AS INTEGER)),0) AS max_no FROM agents WHERE code LIKE 'AG%'").first<{ max_no: number }>();
      const next = Number(row?.max_no ?? 0) + 1;
      const code = `AG${String(next).padStart(3, '0')}`;
      await db.prepare("INSERT INTO agents(code,name,role,active) VALUES(?,?,'agent',1)").bind(code, name).run();
    } else {
      const id = Number(body.id);
      if (!Number.isInteger(id)) return NextResponse.json({ error: '代理资料无效' }, { status: 400 });
      if (body.clearBinding) {
        await db.prepare("UPDATE agents SET name=?,active=?,user_id=NULL,user_email=NULL,updated_at=CURRENT_TIMESTAMP WHERE id=? AND role='agent'").bind(name, body.active === false ? 0 : 1, id).run();
      } else {
        await db.prepare("UPDATE agents SET name=?,active=?,updated_at=CURRENT_TIMESTAMP WHERE id=? AND role='agent'").bind(name, body.active === false ? 0 : 1, id).run();
      }
    }
    return NextResponse.json({ ok: true });
  } catch (error) {
    const message = error instanceof Error ? error.message : '无法更新代理';
    return NextResponse.json({ error: message }, { status: 400 });
  }
}

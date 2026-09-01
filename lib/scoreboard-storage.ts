import { env } from 'cloudflare:workers';

import type { ChatGPTUser } from '@/app/chatgpt-auth';
import type { ActivityDefinition, Profile } from '@/lib/scoreboard-types';

const ACTIVITY_SEEDS = [
  ['prospects', '新增 5 位潜在客户名单', 'Add 5 new prospect names', 1, 1],
  ['approaches', '完成 10 次电话 / WhatsApp 接触', '10 calls or WhatsApp approaches', 2, 2],
  ['conversations', '完成 5 次有效沟通', '5 meaningful conversations', 2, 3],
  ['appointments', '预约 2 个会面', 'Fix 2 appointments', 2, 4],
  ['conduct', '完成 1 个会面', 'Conduct 1 appointment', 2, 5],
  ['followup', '跟进重点潜在客户', 'Follow up hot prospects', 1, 6],
  ['referral', '主动要求转介绍', 'Ask for a referral', 1, 7],
  ['tomorrow', '为明天创造预约', "Create tomorrow's appointment", 1, 8],
] as const;

export function getD1(): D1Database {
  if (!env.DB) throw new Error('D1 database binding is unavailable');
  return env.DB;
}

export async function ensureDatabase(): Promise<void> {
  const db = getD1();
  await db.batch([
    db.prepare(`CREATE TABLE IF NOT EXISTS agents (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      code TEXT NOT NULL UNIQUE,
      name TEXT NOT NULL,
      role TEXT NOT NULL DEFAULT 'agent' CHECK(role IN ('admin','agent')),
      user_id TEXT UNIQUE,
      user_email TEXT,
      active INTEGER NOT NULL DEFAULT 1,
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    )`),
    db.prepare(`CREATE TABLE IF NOT EXISTS activity_definitions (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      code TEXT NOT NULL UNIQUE,
      label_zh TEXT NOT NULL,
      label_en TEXT NOT NULL,
      points INTEGER NOT NULL,
      sort_order INTEGER NOT NULL,
      active INTEGER NOT NULL DEFAULT 1
    )`),
    db.prepare(`CREATE TABLE IF NOT EXISTS daily_activity (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      agent_id INTEGER NOT NULL REFERENCES agents(id),
      activity_id INTEGER NOT NULL REFERENCES activity_definitions(id),
      activity_date TEXT NOT NULL,
      completed INTEGER NOT NULL DEFAULT 1,
      updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      UNIQUE(agent_id, activity_date, activity_id)
    )`),
    db.prepare(`CREATE TABLE IF NOT EXISTS weekly_reviews (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      agent_id INTEGER NOT NULL REFERENCES agents(id),
      week_start TEXT NOT NULL,
      strongest_action TEXT NOT NULL DEFAULT '',
      biggest_gap TEXT NOT NULL DEFAULT '',
      top_prospects TEXT NOT NULL DEFAULT '',
      next_improvement TEXT NOT NULL DEFAULT '',
      next_case_target TEXT NOT NULL DEFAULT '',
      next_tpc_target TEXT NOT NULL DEFAULT '',
      updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      UNIQUE(agent_id, week_start)
    )`),
    db.prepare('CREATE INDEX IF NOT EXISTS idx_agents_active_role ON agents(active, role)'),
    db.prepare('CREATE INDEX IF NOT EXISTS idx_daily_agent_date ON daily_activity(agent_id, activity_date)'),
  ]);

  await db.batch([
    db.prepare("INSERT OR IGNORE INTO agents(code,name,role) VALUES('AD001','AD Serene','admin')"),
    db.prepare("INSERT OR IGNORE INTO agents(code,name,role) VALUES('AG001','代理 A','agent')"),
    db.prepare("INSERT OR IGNORE INTO agents(code,name,role) VALUES('AG002','代理 B','agent')"),
    db.prepare("INSERT OR IGNORE INTO agents(code,name,role) VALUES('AG003','代理 C','agent')"),
    ...ACTIVITY_SEEDS.map((seed) => db.prepare('INSERT OR IGNORE INTO activity_definitions(code,label_zh,label_en,points,sort_order) VALUES(?,?,?,?,?)').bind(...seed)),
  ]);
  await db.prepare('PRAGMA optimize').run();
}

type AgentRow = {
  id: number;
  code: string;
  name: string;
  role: 'admin' | 'agent';
  user_id: string | null;
  user_email: string | null;
  active: number;
};

export function toProfile(row: AgentRow): Profile {
  return { id: row.id, code: row.code, name: row.name, role: row.role, email: row.user_email };
}

export async function resolveProfile(user: ChatGPTUser): Promise<Profile | null> {
  await ensureDatabase();
  const db = getD1();
  const existing = await db.prepare('SELECT id,code,name,role,user_id,user_email,active FROM agents WHERE user_id=? AND active=1 LIMIT 1').bind(user.userId).first<AgentRow>();
  if (existing) return toProfile(existing);

  const admin = await db.prepare("SELECT id,code,name,role,user_id,user_email,active FROM agents WHERE role='admin' LIMIT 1").first<AgentRow>();
  if (admin && !admin.user_id) {
    await db.prepare("UPDATE agents SET user_id=?,user_email=?,updated_at=CURRENT_TIMESTAMP WHERE id=? AND user_id IS NULL").bind(user.userId, user.email, admin.id).run();
    const claimed = await db.prepare('SELECT id,code,name,role,user_id,user_email,active FROM agents WHERE user_id=? LIMIT 1').bind(user.userId).first<AgentRow>();
    if (claimed) return toProfile(claimed);
  }
  return null;
}

export async function listActivities(): Promise<ActivityDefinition[]> {
  const result = await getD1().prepare('SELECT id,code,label_zh,label_en,points,sort_order FROM activity_definitions WHERE active=1 ORDER BY sort_order').all<{
    id: number; code: string; label_zh: string; label_en: string; points: number; sort_order: number;
  }>();
  return result.results.map((row) => ({ id: row.id, code: row.code, labelZh: row.label_zh, labelEn: row.label_en, points: row.points, sortOrder: row.sort_order }));
}

export async function listAgentRows(includeInactive = false): Promise<AgentRow[]> {
  const query = includeInactive
    ? "SELECT id,code,name,role,user_id,user_email,active FROM agents WHERE role='agent' ORDER BY code"
    : "SELECT id,code,name,role,user_id,user_email,active FROM agents WHERE role='agent' AND active=1 ORDER BY code";
  const result = await getD1().prepare(query).all<AgentRow>();
  return result.results;
}

export async function authorizeAgentTarget(profile: Profile, requestedAgentId: number | null): Promise<number> {
  const targetId = profile.role === 'admin' ? requestedAgentId : profile.id;
  if (!targetId) throw new Error('请选择代理员');
  if (profile.role === 'agent' && targetId !== profile.id) throw new Error('无权访问其他代理资料');
  const target = await getD1().prepare("SELECT id FROM agents WHERE id=? AND role='agent' AND active=1").bind(targetId).first<{ id: number }>();
  if (!target) throw new Error('代理员不存在或已停用');
  return target.id;
}

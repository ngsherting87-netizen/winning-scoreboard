import { StrictMode, useEffect, useState } from 'react';
import { createRoot } from 'react-dom/client';
import type { User } from '@supabase/supabase-js';

import { DashboardApp } from '@/app/dashboard-app';
import '@/app/globals.css';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import {
  ensureAnonymousSession,
  hasScoreboardAccess,
  isSupabaseConfigured,
  listLoginAgents,
  signInWithAccessCode,
  signOutScoreboard,
  supabase,
  type LoginAgent,
} from '@/src/supabase';

function App() {
  const [user, setUser] = useState<User | null>(null);
  const [agents, setAgents] = useState<LoginAgent[]>([]);
  const [agentId, setAgentId] = useState('');
  const [accessCode, setAccessCode] = useState('');
  const [loading, setLoading] = useState(isSupabaseConfigured);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function loadLogin() {
    const session = await ensureAnonymousSession();
    if (hasScoreboardAccess(session.user)) {
      setUser(session.user);
      return;
    }
    setUser(null);
    const nextAgents = await listLoginAgents();
    setAgents(nextAgents);
    setAgentId((current) => current || String(nextAgents[0]?.id ?? ''));
  }

  useEffect(() => {
    if (!isSupabaseConfigured) return;
    let mounted = true;
    void loadLogin()
      .catch((loadError) => mounted && setError(loadError instanceof Error ? loadError.message : '无法连接计分板'))
      .finally(() => mounted && setLoading(false));
    const { data } = supabase.auth.onAuthStateChange((_event, session) => {
      if (!mounted) return;
      if (hasScoreboardAccess(session?.user)) setUser(session?.user ?? null);
    });
    return () => {
      mounted = false;
      data.subscription.unsubscribe();
    };
  }, []);

  async function submitLogin() {
    setSubmitting(true);
    setError(null);
    try {
      const nextUser = await signInWithAccessCode(Number(agentId), accessCode);
      setUser(nextUser);
      setAccessCode('');
    } catch (loginError) {
      setError(loginError instanceof Error ? loginError.message : '登录失败，请重试');
    } finally {
      setSubmitting(false);
    }
  }

  async function logout() {
    setLoading(true);
    setError(null);
    try {
      await signOutScoreboard();
      setUser(null);
      setAccessCode('');
      await loadLogin();
    } catch (logoutError) {
      setError(logoutError instanceof Error ? logoutError.message : '无法退出');
    } finally {
      setLoading(false);
    }
  }

  if (!isSupabaseConfigured) {
    return <CenteredMessage title="Supabase 正在连接" description="数据库项目配置完成后，这个网址会自动更新。" />;
  }
  if (loading) return <CenteredMessage title="正在连接计分板…" description="正在建立安全登录状态" />;
  if (user && hasScoreboardAccess(user)) return <DashboardApp viewer={user} onSignOut={() => void logout()} />;

  return (
    <main className="grid min-h-screen place-items-center bg-[#f8f3ed] px-4 py-10">
      <section className="w-full max-w-md rounded-3xl border bg-white p-8 shadow-[0_28px_80px_rgba(89,23,39,0.12)]">
        <div className="mx-auto mb-5 grid size-14 place-items-center rounded-2xl bg-[#7a1226] text-xl text-white">✓</div>
        <div className="text-center">
          <p className="text-sm font-medium text-[#7a1226]">Winning Scoreboard</p>
          <h1 className="mt-2 text-2xl font-semibold tracking-tight">代理活动量管理计分板</h1>
          <p className="mt-3 text-sm leading-6 text-muted-foreground">选择自己的名字并输入 6 位访问码。代理只能看到自己的数据，AD Serene 可以查看全部代理。</p>
        </div>
        <div className="mt-7 grid gap-4">
          <div>
            <label className="mb-2 block text-sm font-medium" htmlFor="agent">选择名字</label>
            <select
              id="agent"
              className="h-11 w-full rounded-lg border bg-white px-3 text-sm outline-none focus:border-[#7a1226] focus:ring-2 focus:ring-[#7a1226]/15"
              value={agentId}
              onChange={(event) => setAgentId(event.target.value)}
            >
              {agents.map((agent) => <option key={agent.id} value={agent.id}>{agent.name} · {agent.code}</option>)}
            </select>
          </div>
          <div>
            <label className="mb-2 block text-sm font-medium" htmlFor="access-code">6 位访问码</label>
            <Input
              id="access-code"
              type="password"
              inputMode="numeric"
              pattern="[0-9]*"
              maxLength={6}
              autoComplete="current-password"
              value={accessCode}
              onChange={(event) => setAccessCode(event.target.value.replace(/\D/g, '').slice(0, 6))}
              onKeyDown={(event) => {
                if (event.key === 'Enter' && agentId && accessCode.length === 6) void submitLogin();
              }}
              placeholder="请输入访问码"
            />
          </div>
          {error && <p className="rounded-xl bg-rose-50 px-3 py-2 text-sm text-rose-700">{error}</p>}
          {!agents.length && <p className="rounded-xl bg-amber-50 px-3 py-2 text-sm text-amber-800">访问码正在配置，请稍后刷新。</p>}
          <Button
            className="h-11 w-full bg-[#7a1226] hover:bg-[#64101f]"
            disabled={submitting || !agentId || accessCode.length !== 6}
            onClick={() => void submitLogin()}
          >
            {submitting ? '登录中…' : '进入计分板'}
          </Button>
        </div>
      </section>
    </main>
  );
}

function CenteredMessage({ title, description }: { title: string; description: string }) {
  return <main className="grid min-h-screen place-items-center bg-[#f8f3ed] px-4"><Card className="w-full max-w-md text-center"><CardHeader><CardTitle>{title}</CardTitle><CardDescription>{description}</CardDescription></CardHeader><CardContent /></Card></main>;
}

createRoot(document.getElementById('root')!).render(<StrictMode><App /></StrictMode>);

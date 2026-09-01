import { createClient, type User } from '@supabase/supabase-js';

export const supabaseConfig = {
  url: 'https://wjwothiesionmbdumzyu.supabase.co',
  publishableKey: 'sb_publishable_ouYEe8Sk4rKDWkk0UJRvAQ_3B9-kPpV',
};

export const isSupabaseConfigured = !supabaseConfig.url.startsWith('__');

export const supabase = createClient(
  isSupabaseConfigured ? supabaseConfig.url : 'https://placeholder.supabase.co',
  isSupabaseConfigured ? supabaseConfig.publishableKey : 'sb_publishable_placeholder',
  {
    auth: {
      persistSession: true,
      autoRefreshToken: true,
      detectSessionInUrl: false,
      storageKey: 'winning-scoreboard-session',
    },
  },
);

export type LoginAgent = {
  id: number;
  code: string;
  name: string;
  role: 'admin' | 'agent';
};

export function hasScoreboardAccess(user: User | null | undefined) {
  return Boolean(user?.app_metadata?.scoreboard_agent_id && user?.app_metadata?.scoreboard_role);
}

export async function ensureAnonymousSession() {
  const { data: current, error: sessionError } = await supabase.auth.getSession();
  if (sessionError) throw sessionError;
  if (current.session) return current.session;
  const { data, error } = await supabase.auth.signInAnonymously();
  if (error || !data.session) throw error ?? new Error('无法建立安全登录状态');
  return data.session;
}

export async function listLoginAgents(): Promise<LoginAgent[]> {
  await ensureAnonymousSession();
  const { data, error } = await supabase
    .from('agents')
    .select('id, code, name, role')
    .eq('active', true)
    .eq('access_configured', true)
    .order('id');
  if (error) throw error;
  return (data ?? []) as LoginAgent[];
}

async function functionErrorMessage(error: unknown) {
  if (error && typeof error === 'object' && 'context' in error) {
    try {
      const context = (error as { context?: Response }).context;
      const body = context ? await context.clone().json() as { error?: string } : null;
      if (body?.error) return body.error;
    } catch {
      // Fall back to the SDK error message below.
    }
  }
  return error instanceof Error ? error.message : '登录失败，请重试';
}

export async function signInWithAccessCode(agentId: number, accessCode: string) {
  await ensureAnonymousSession();
  const { error } = await supabase.functions.invoke('scoreboard-access', {
    body: { action: 'login', agentId, accessCode },
  });
  if (error) throw new Error(await functionErrorMessage(error));
  const { data, error: refreshError } = await supabase.auth.refreshSession();
  if (refreshError || !data.user || !hasScoreboardAccess(data.user)) {
    throw refreshError ?? new Error('访问权限尚未生效，请重试');
  }
  return data.user;
}

export async function signOutScoreboard() {
  const { error } = await supabase.auth.signOut({ scope: 'local' });
  if (error) throw error;
  return ensureAnonymousSession();
}

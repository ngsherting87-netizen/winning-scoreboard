import 'jsr:@supabase/functions-js@2.112.4/edge-runtime.d.ts';
import { createClient, type User } from 'npm:@supabase/supabase-js@2.112.4';

const productionOrigin = 'https://ngsherting87-netizen.github.io';

function corsHeaders(request: Request) {
  const origin = request.headers.get('origin') ?? productionOrigin;
  const allowed = origin === productionOrigin || origin.startsWith('http://localhost:') || origin.startsWith('http://127.0.0.1:');
  return {
    'Access-Control-Allow-Origin': allowed ? origin : productionOrigin,
    'Access-Control-Allow-Headers': 'authorization, apikey, content-type, x-client-info',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Content-Type': 'application/json',
    'Vary': 'Origin',
  };
}

function json(request: Request, body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: corsHeaders(request) });
}

function randomAccessCode() {
  const values = new Uint32Array(1);
  crypto.getRandomValues(values);
  return String(10_000_000 + (values[0] % 90_000_000));
}

function randomSalt() {
  const values = new Uint8Array(18);
  crypto.getRandomValues(values);
  return btoa(String.fromCharCode(...values)).replaceAll('+', '-').replaceAll('/', '_').replaceAll('=', '');
}

async function hashAccessCode(salt: string, accessCode: string, iterations = 120_000) {
  const encoder = new TextEncoder();
  const key = await crypto.subtle.importKey('raw', encoder.encode(accessCode), 'PBKDF2', false, ['deriveBits']);
  const digest = new Uint8Array(await crypto.subtle.deriveBits({
    name: 'PBKDF2',
    hash: 'SHA-256',
    salt: encoder.encode(salt),
    iterations,
  }, key, 256));
  return [...digest].map((value) => value.toString(16).padStart(2, '0')).join('');
}

function constantTimeEqual(left: string, right: string) {
  if (left.length !== right.length) return false;
  let difference = 0;
  for (let index = 0; index < left.length; index += 1) {
    difference |= left.charCodeAt(index) ^ right.charCodeAt(index);
  }
  return difference === 0;
}

function textValue(value: unknown) {
  return typeof value === 'string' ? value : '';
}

function numberValue(value: unknown) {
  return typeof value === 'number' || typeof value === 'string' ? Number(value) : Number.NaN;
}

function logError(stage: string, error: unknown) {
  if (error instanceof Error) {
    console.error(JSON.stringify({ stage, name: error.name, message: error.message, stack: error.stack }));
    return;
  }
  console.error(JSON.stringify({ stage, error }));
}

async function requester(admin: ReturnType<typeof createClient>, request: Request) {
  const authorization = request.headers.get('authorization');
  if (!authorization?.startsWith('Bearer ')) throw new Error('请重新打开登录页面');
  const { data, error } = await admin.auth.getUser(authorization.slice(7));
  if (error || !data.user) throw new Error('登录状态已失效，请重试');
  return data.user;
}

async function requireAdmin(admin: ReturnType<typeof createClient>, user: User) {
  const agentId = numberValue(user.app_metadata?.scoreboard_agent_id);
  if (user.app_metadata?.scoreboard_role !== 'admin' || !Number.isInteger(agentId)) {
    throw new Error('只有 AD Serene 可以管理代理');
  }
  const { data, error } = await admin
    .from('agents')
    .select('id')
    .eq('id', agentId)
    .eq('role', 'admin')
    .eq('active', true)
    .maybeSingle();
  if (error || !data) throw new Error('只有 AD Serene 可以管理代理');
}

async function loginIsRateLimited(admin: ReturnType<typeof createClient>, userId: string, agentId: number) {
  const since = new Date(Date.now() - 15 * 60 * 1000).toISOString();
  const { count, error } = await admin
    .from('scoreboard_login_attempts')
    .select('id', { count: 'exact', head: true })
    .eq('user_id', userId)
    .eq('agent_id', agentId)
    .gte('attempted_at', since);
  if (error) throw error;
  return (count ?? 0) >= 8;
}

async function recordFailedLogin(admin: ReturnType<typeof createClient>, userId: string, agentId: number) {
  const { error } = await admin
    .from('scoreboard_login_attempts')
    .insert({ user_id: userId, agent_id: agentId });
  if (error) throw error;
}

async function clearFailedLogins(admin: ReturnType<typeof createClient>, userId: string, agentId: number) {
  const { error } = await admin
    .from('scoreboard_login_attempts')
    .delete()
    .eq('user_id', userId)
    .eq('agent_id', agentId);
  if (error) throw error;
}

async function setCredential(admin: ReturnType<typeof createClient>, agentId: number) {
  const accessCode = randomAccessCode();
  const salt = randomSalt();
  const iterations = 120_000;
  const codeHash = await hashAccessCode(salt, accessCode, iterations);
  const { error: credentialError } = await admin
    .from('agent_credentials')
    .upsert({
      agent_id: agentId,
      salt,
      code_hash: codeHash,
      algorithm: 'pbkdf2-sha256',
      iterations,
      updated_at: new Date().toISOString(),
    });
  if (credentialError) throw credentialError;
  const { error: agentError } = await admin
    .from('agents')
    .update({ access_configured: true, updated_at: new Date().toISOString() })
    .eq('id', agentId);
  if (agentError) throw agentError;
  return accessCode;
}

Deno.serve(async (request) => {
  if (request.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders(request) });
  if (request.method !== 'POST') return json(request, { error: 'Method not allowed' }, 405);

  let stage = 'request';
  try {
    stage = 'configuration';
    const supabaseUrl = Deno.env.get('SUPABASE_URL');
    const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
    if (!supabaseUrl || !serviceRoleKey) throw new Error('Supabase 服务尚未配置');
    const admin = createClient(supabaseUrl, serviceRoleKey, {
      auth: { autoRefreshToken: false, persistSession: false },
    });
    stage = 'requester';
    const user = await requester(admin, request);
    stage = 'request-body';
    const body = await request.json() as Record<string, unknown>;
    const action = textValue(body.action);

    if (action === 'login') {
      const agentId = numberValue(body.agentId);
      const accessCode = textValue(body.accessCode).trim();
      if (!Number.isInteger(agentId) || !/^\d{8}$/.test(accessCode)) {
        return json(request, { error: '姓名或访问码不正确' }, 400);
      }
      stage = 'rate-limit';
      if (await loginIsRateLimited(admin, user.id, agentId)) {
        return json(request, { error: '尝试次数过多，请 15 分钟后再试' }, 429);
      }
      stage = 'credential-lookup';
      const [{ data: agent, error: agentError }, { data: credential, error: credentialError }] = await Promise.all([
        admin.from('agents').select('id, code, name, role, active, access_configured').eq('id', agentId).maybeSingle(),
        admin.from('agent_credentials').select('salt, code_hash, algorithm, iterations').eq('agent_id', agentId).maybeSingle(),
      ]);
      if (agentError || credentialError || !agent?.active || !agent.access_configured || !credential) {
        await recordFailedLogin(admin, user.id, agentId);
        return json(request, { error: '姓名或访问码不正确' }, 401);
      }
      if (credential.algorithm !== 'pbkdf2-sha256') throw new Error('访问码格式不受支持');
      stage = 'credential-hash';
      const candidate = await hashAccessCode(credential.salt, accessCode, credential.iterations);
      if (!constantTimeEqual(candidate, credential.code_hash)) {
        await recordFailedLogin(admin, user.id, agentId);
        return json(request, { error: '姓名或访问码不正确' }, 401);
      }
      stage = 'auth-metadata';
      const { error: updateError } = await admin.auth.admin.updateUserById(user.id, {
        app_metadata: {
          ...user.app_metadata,
          scoreboard_agent_id: agent.id,
          scoreboard_role: agent.role,
        },
      });
      if (updateError) throw updateError;
      stage = 'clear-rate-limit';
      await clearFailedLogins(admin, user.id, agentId);
      return json(request, { ok: true, profile: { id: agent.id, code: agent.code, name: agent.name, role: agent.role } });
    }

    await requireAdmin(admin, user);

    if (action === 'create-agent') {
      const name = textValue(body.name).trim().slice(0, 80);
      if (!name) return json(request, { error: '请输入代理姓名' }, 400);
      const { data: latest, error: latestError } = await admin.from('agents').select('id').order('id', { ascending: false }).limit(1).maybeSingle();
      if (latestError) throw latestError;
      const id = Number(latest?.id ?? 1) + 1;
      const code = `AG${String(id - 1).padStart(3, '0')}`;
      const { error: insertError } = await admin.from('agents').insert({ id, code, name, role: 'agent', active: true });
      if (insertError) throw insertError;
      const accessCode = await setCredential(admin, id);
      return json(request, { ok: true, accessCode, agent: { id, code, name } });
    }

    if (action === 'update-agent') {
      const agentId = numberValue(body.agentId);
      const name = textValue(body.name).trim().slice(0, 80);
      const active = Boolean(body.active);
      if (!Number.isInteger(agentId) || agentId <= 1 || !name) {
        return json(request, { error: '代理资料不正确' }, 400);
      }
      const { error: updateError } = await admin
        .from('agents')
        .update({ name, active, updated_at: new Date().toISOString() })
        .eq('id', agentId)
        .eq('role', 'agent');
      if (updateError) throw updateError;
      const accessCode = body.resetAccessCode ? await setCredential(admin, agentId) : null;
      return json(request, { ok: true, accessCode });
    }

    return json(request, { error: '不支持的操作' }, 400);
  } catch (error) {
    logError(stage, error);
    return json(request, { error: error instanceof Error ? error.message : '服务暂时无法使用' }, 500);
  }
});

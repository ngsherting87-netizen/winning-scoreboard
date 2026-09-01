'use client';

import { useEffect, useState } from 'react';
import type { User } from '@supabase/supabase-js';
import {
  BarChart3,
  CalendarDays,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  CircleAlert,
  LayoutDashboard,
  LogOut,
  Pencil,
  Plus,
  Save,
  Sparkles,
  Target,
  TrendingUp,
  Users,
} from 'lucide-react';
import { Bar, BarChart, CartesianGrid, XAxis, YAxis } from 'recharts';

import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { ChartContainer, ChartTooltip, ChartTooltipContent, type ChartConfig } from '@/components/ui/chart';
import { Checkbox } from '@/components/ui/checkbox';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Progress } from '@/components/ui/progress';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Textarea } from '@/components/ui/textarea';
import { addDays } from '@/lib/scoreboard-domain';
import type { AgentSummary, DashboardData, WeeklyReview } from '@/lib/scoreboard-types';
import {
  loadDashboard as loadSupabaseDashboard,
  saveAgent as saveSupabaseAgent,
  saveDailyActivity,
  saveWeeklyReview,
} from '@/src/supabase-scoreboard';

type View = 'daily' | 'weekly' | 'admin' | 'agents';

const weekLabels = ['一', '二', '三', '四', '五', '六', '日'];
const chartConfig = { score: { label: '周分数', color: '#8b1730' } } satisfies ChartConfig;

function localDateString() {
  const date = new Date();
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function formatDate(date: string, options: Intl.DateTimeFormatOptions = { month: 'short', day: 'numeric' }) {
  return new Intl.DateTimeFormat('zh-CN', { ...options, timeZone: 'UTC' }).format(new Date(`${date}T00:00:00Z`));
}

function levelMeta(level: 'strong' | 'improve' | 'action') {
  if (level === 'strong') return { label: '强执行', emoji: '🟢', className: 'bg-emerald-50 text-emerald-700 ring-emerald-100' };
  if (level === 'improve') return { label: '需要改善', emoji: '🟡', className: 'bg-amber-50 text-amber-800 ring-amber-100' };
  return { label: '需要行动', emoji: '🔴', className: 'bg-rose-50 text-rose-700 ring-rose-100' };
}

export function DashboardApp({ viewer, onSignOut }: { viewer: User; onSignOut: () => void }) {
  const [data, setData] = useState<DashboardData | null>(null);
  const [view, setView] = useState<View | null>(null);
  const [completed, setCompleted] = useState<Set<number>>(new Set());
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  async function loadDashboard(date = data?.selectedDate ?? localDateString(), agentId = data?.selectedAgent?.id ?? null) {
    setLoading(true);
    setError(null);
    try {
      const next = await loadSupabaseDashboard(viewer, date, agentId);
      setData(next);
      setCompleted(new Set(next.completedActionIds));
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : '无法读取计分板');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void loadDashboard(localDateString(), null);
    // Initial data load only.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const activeView: View = view ?? (data?.profile?.role === 'admin' ? 'admin' : 'daily');

  async function saveDaily() {
    if (!data?.selectedAgent) return;
    setSaving(true);
    setError(null);
    try {
      if (!data.profile) throw new Error('请先选择代理身份');
      await saveDailyActivity(viewer, data.profile, data.selectedDate, data.selectedAgent.id, [...completed]);
      setNotice('今日行动已保存');
      await loadDashboard(data.selectedDate, data.selectedAgent.id);
      window.setTimeout(() => setNotice(null), 2200);
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : '无法保存行动');
    } finally {
      setSaving(false);
    }
  }

  if (loading && !data) return <LoadingScreen />;
  if (!data) return <ErrorScreen message={error ?? '无法读取计分板'} onRetry={() => void loadDashboard()} />;
  if (data.status === 'onboarding') return <ErrorScreen message="访问权限尚未生效，请退出后重新输入访问码。" onRetry={onSignOut} />;

  return (
    <main className="min-h-screen bg-background text-foreground">
      <AppHeader data={data} view={activeView} onView={setView} onSignOut={onSignOut} />
      <div className="mx-auto max-w-[1440px] px-4 py-6 sm:px-7 lg:px-10 lg:py-8">
        {(error || notice) && (
          <div className={`mb-5 flex items-center gap-2 rounded-xl px-4 py-3 text-sm ring-1 ${error ? 'bg-rose-50 text-rose-700 ring-rose-100' : 'bg-emerald-50 text-emerald-700 ring-emerald-100'}`}>
            {error ? <CircleAlert className="size-4" /> : <CheckCircle2 className="size-4" />}{error ?? notice}
          </div>
        )}
        {activeView === 'daily' && (
          <DailyView
            data={data}
            completed={completed}
            saving={saving}
            onToggle={(id) => setCompleted((current) => {
              const next = new Set(current);
              if (next.has(id)) next.delete(id); else next.add(id);
              return next;
            })}
            onSave={saveDaily}
            onDate={(date) => void loadDashboard(date, data.selectedAgent?.id ?? null)}
            onAgent={(id) => void loadDashboard(data.selectedDate, id)}
          />
        )}
        {activeView === 'weekly' && (
          <WeeklyView
            viewer={viewer}
            data={data}
            saving={saving}
            onDate={(date) => void loadDashboard(date, data.selectedAgent?.id ?? null)}
            onAgent={(id) => void loadDashboard(data.selectedDate, id)}
            onSaved={async () => {
              setNotice('每周复盘已保存');
              await loadDashboard(data.selectedDate, data.selectedAgent?.id ?? null);
              window.setTimeout(() => setNotice(null), 2200);
            }}
            onError={setError}
            setSaving={setSaving}
          />
        )}
        {activeView === 'admin' && data.profile?.role === 'admin' && (
          <AdminView
            data={data}
            onWeek={(date) => void loadDashboard(date, data.selectedAgent?.id ?? null)}
            onOpenAgent={(agent) => {
              void loadDashboard(data.selectedDate, agent.id);
              setView('daily');
            }}
          />
        )}
        {activeView === 'agents' && data.profile?.role === 'admin' && (
          <AgentsView
            viewer={viewer}
            data={data}
            onReload={() => void loadDashboard(data.selectedDate, data.selectedAgent?.id ?? null)}
            onError={setError}
            onNotice={setNotice}
          />
        )}
      </div>
    </main>
  );
}

function AppHeader({ data, view, onView, onSignOut }: { data: DashboardData; view: View; onView: (view: View) => void; onSignOut: () => void }) {
  const isAdmin = data.profile?.role === 'admin';
  const nav = isAdmin
    ? [{ id: 'admin' as const, label: '管理员总览', icon: LayoutDashboard }, { id: 'daily' as const, label: '代理行动', icon: CheckCircle2 }, { id: 'weekly' as const, label: '每周成绩', icon: BarChart3 }, { id: 'agents' as const, label: '代理设置', icon: Users }]
    : [{ id: 'daily' as const, label: '今日行动', icon: CheckCircle2 }, { id: 'weekly' as const, label: '每周成绩', icon: BarChart3 }];
  return (
    <header className="border-b border-white/10 bg-[#7a1226] text-white">
      <div className="mx-auto flex min-h-16 max-w-[1440px] items-center justify-between gap-4 px-4 py-3 sm:px-7 lg:px-10">
        <div className="flex min-w-0 items-center gap-3">
          <div className="grid size-10 shrink-0 place-items-center rounded-xl bg-white/12 ring-1 ring-white/15"><Sparkles className="size-5" /></div>
          <div className="min-w-0"><p className="truncate text-sm font-semibold tracking-wide">Winning Scoreboard</p><p className="truncate text-xs text-white/65">每天的行动，创造每周的成果</p></div>
        </div>
        <nav className="hidden items-center gap-1 rounded-xl bg-white/8 p-1 lg:flex" aria-label="主要页面">
          {nav.map(({ id, label, icon: Icon }) => (
            <Button key={id} variant="ghost" onClick={() => onView(id)} className={view === id ? 'bg-white text-[#7a1226] hover:bg-white/90' : 'text-white hover:bg-white/10 hover:text-white'}><Icon />{label}</Button>
          ))}
        </nav>
        <div className="flex items-center gap-3">
          <div className="hidden text-right sm:block"><p className="text-sm font-medium">{data.profile?.name}</p><p className="max-w-40 truncate text-xs text-white/60">{data.viewer.email}</p></div>
          <div className="grid size-9 place-items-center rounded-full bg-[#f1dca6] font-semibold text-[#7a1226]">{data.profile?.name.slice(-1)}</div>
          <button type="button" onClick={onSignOut} className="grid size-8 place-items-center rounded-lg text-white/70 transition hover:bg-white/10 hover:text-white" aria-label="退出"><LogOut className="size-4" /></button>
        </div>
      </div>
      <nav className="mx-auto flex max-w-[1440px] gap-1 overflow-x-auto px-4 pb-3 lg:hidden" aria-label="移动页面">
        {nav.map(({ id, label, icon: Icon }) => (
          <Button key={id} size="sm" variant="ghost" onClick={() => onView(id)} className={view === id ? 'bg-white text-[#7a1226]' : 'text-white hover:bg-white/10 hover:text-white'}><Icon />{label}</Button>
        ))}
      </nav>
    </header>
  );
}

function AgentAndDateControls({ data, onDate, onAgent, weekMode = false, showAgent = true }: { data: DashboardData; onDate: (date: string) => void; onAgent: (id: number) => void; weekMode?: boolean; showAgent?: boolean }) {
  const activeAgents = data.agents.filter((agent) => agent.active);
  return (
    <div className="flex flex-wrap items-center gap-2">
      {showAgent && data.profile?.role === 'admin' && data.selectedAgent && (
        <Select value={String(data.selectedAgent.id)} onValueChange={(value) => onAgent(Number(value))}>
          <SelectTrigger className="min-w-36 bg-card"><SelectValue>{data.selectedAgent.name}</SelectValue></SelectTrigger>
          <SelectContent>{activeAgents.map((agent) => <SelectItem key={agent.id} value={String(agent.id)}>{agent.name}</SelectItem>)}</SelectContent>
        </Select>
      )}
      <div className="flex items-center gap-1 rounded-xl border bg-card p-1 shadow-sm">
        <Button size="icon" variant="ghost" onClick={() => onDate(addDays(weekMode ? data.weekStart : data.selectedDate, weekMode ? -7 : -1))} aria-label={weekMode ? '上一周' : '上一天'}><ChevronLeft /></Button>
        <div className="min-w-28 px-2 text-center"><p className="text-xs text-muted-foreground">{weekMode ? '本周开始' : '当前日期'}</p><p className="text-sm font-semibold">{formatDate(weekMode ? data.weekStart : data.selectedDate, { month: 'short', day: 'numeric' })}</p></div>
        <Button size="icon" variant="ghost" onClick={() => onDate(addDays(weekMode ? data.weekStart : data.selectedDate, weekMode ? 7 : 1))} aria-label={weekMode ? '下一周' : '下一天'}><ChevronRight /></Button>
      </div>
    </div>
  );
}

function DailyView({ data, completed, saving, onToggle, onSave, onDate, onAgent }: { data: DashboardData; completed: Set<number>; saving: boolean; onToggle: (id: number) => void; onSave: () => void; onDate: (date: string) => void; onAgent: (id: number) => void }) {
  const score = data.actions.reduce((sum, action) => sum + (completed.has(action.id) ? action.points : 0), 0);
  const dayIndex = Math.max(0, data.weekDates.indexOf(data.selectedDate));
  const projectedWeekly = data.weeklyScore - (data.dailyScores[dayIndex] ?? 0) + score;
  const percentage = data.maximum ? Math.round((projectedWeekly / data.maximum) * 100) : 0;
  const meta = levelMeta(percentage >= 80 ? 'strong' : percentage >= 60 ? 'improve' : 'action');
  return (
    <>
      <section className="mb-6 flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div><div className="mb-2 flex items-center gap-2 text-sm text-muted-foreground"><CalendarDays className="size-4 text-primary" /><span>{formatDate(data.selectedDate, { year: 'numeric', month: 'long', day: 'numeric', weekday: 'long' })}</span><Badge variant="outline" className="border-primary/20 bg-primary/5 text-primary">本周第 {dayIndex + 1} 天</Badge></div><h1 className="text-2xl font-semibold tracking-tight sm:text-3xl">{data.selectedAgent?.name} · 今日行动</h1><p className="mt-1 text-sm text-muted-foreground">完成后勾选，保存后会进入每周成绩。</p></div>
        <AgentAndDateControls data={data} onDate={onDate} onAgent={onAgent} />
      </section>
      <div className="grid items-start gap-6 xl:grid-cols-[minmax(0,1fr)_360px]">
        <section className="overflow-hidden rounded-2xl border bg-card shadow-[0_18px_50px_rgba(89,23,39,0.06)]">
          <div className="flex items-center justify-between border-b bg-[#fbf4f5] px-5 py-4 sm:px-6"><div><h2 className="font-semibold">每日行动清单</h2><p className="text-xs text-muted-foreground">Daily action checklist</p></div><Badge className="bg-[#7a1226] text-white">{completed.size} / {data.actions.length} 完成</Badge></div>
          <div className="divide-y">{data.actions.map((action) => {
            const checked = completed.has(action.id);
            return <label key={action.id} className="flex cursor-pointer items-center gap-4 px-5 py-4 transition-colors hover:bg-[#fffaf0] sm:px-6"><Checkbox checked={checked} onCheckedChange={() => onToggle(action.id)} className="size-5 rounded-md border-primary/30 data-checked:bg-[#7a1226]" /><span className="min-w-0 flex-1"><span className={`block text-sm font-medium sm:text-[15px] ${checked ? 'text-muted-foreground line-through' : ''}`}>{action.labelZh}</span><span className="mt-0.5 block text-xs text-muted-foreground">{action.labelEn}</span></span><span className={`grid size-10 shrink-0 place-items-center rounded-xl text-sm font-semibold ${checked ? 'bg-emerald-50 text-emerald-700 ring-1 ring-emerald-100' : 'bg-muted text-muted-foreground'}`}>+{action.points}</span></label>;
          })}</div>
          <div className="flex flex-col gap-3 border-t bg-muted/30 px-5 py-4 sm:flex-row sm:items-center sm:justify-between sm:px-6"><p className="text-xs text-muted-foreground">保存后，同一天再次修改会覆盖旧记录。</p><Button disabled={saving} onClick={onSave} className="bg-[#7a1226] hover:bg-[#64101f]"><Save />{saving ? '保存中…' : '保存今日行动'}</Button></div>
        </section>
        <aside className="grid gap-4 sm:grid-cols-2 xl:grid-cols-1">
          <section className="rounded-2xl bg-[#211d24] p-6 text-white shadow-[0_22px_60px_rgba(33,29,36,0.16)]"><div className="flex items-center justify-between"><div><p className="text-sm font-medium text-white/70">今日分数</p><p className="mt-1 text-xs text-white/45">Daily score</p></div><Target className="size-5 text-[#f1dca6]" /></div><div className="mt-8 flex items-end gap-2"><span className="text-6xl font-semibold tracking-[-0.06em]">{score}</span><span className="mb-2 text-sm text-white/50">/ 12 分</span></div><Progress value={Math.round((score / 12) * 100)} className="mt-6 [&_[data-slot=progress-track]]:h-2 [&_[data-slot=progress-track]]:bg-white/10 [&_[data-slot=progress-indicator]]:bg-[#f1dca6]" /><div className="mt-3 flex items-center justify-between text-xs text-white/55"><span>完成率 {Math.round((score / 12) * 100)}%</span><span>{completed.size} 项完成</span></div></section>
          <section className="rounded-2xl border bg-card p-5 shadow-sm"><div className="flex items-center gap-3"><div className="grid size-10 place-items-center rounded-xl bg-[#f7ead0] text-[#9b6414]"><TrendingUp className="size-5" /></div><div><p className="text-sm font-semibold">本周进度</p><p className="text-xs text-muted-foreground">Weekly progress</p></div></div><div className="mt-5 grid grid-cols-2 gap-3"><div className="rounded-xl bg-muted/55 p-3"><p className="text-xs text-muted-foreground">预计周分</p><p className="mt-1 text-xl font-semibold">{projectedWeekly}</p></div><div className="rounded-xl bg-muted/55 p-3"><p className="text-xs text-muted-foreground">最高分</p><p className="mt-1 text-xl font-semibold">{data.maximum}</p></div></div><div className={`mt-4 flex items-center justify-between rounded-xl px-3 py-2.5 ring-1 ${meta.className}`}><span className="text-xs font-medium">{meta.emoji} {meta.label}</span><span className="text-xs tabular-nums">{percentage}%</span></div></section>
        </aside>
      </div>
    </>
  );
}

function WeeklyView({ viewer, data, saving, onDate, onAgent, onSaved, onError, setSaving }: { viewer: User; data: DashboardData; saving: boolean; onDate: (date: string) => void; onAgent: (id: number) => void; onSaved: () => Promise<void>; onError: (message: string | null) => void; setSaving: (value: boolean) => void }) {
  const [review, setReview] = useState<WeeklyReview>(data.review);
  useEffect(() => setReview(data.review), [data.review]);
  const meta = levelMeta(data.level);
  async function saveReview() {
    if (!data.selectedAgent) return;
    setSaving(true); onError(null);
    try {
      if (!data.profile) throw new Error('请先选择代理身份');
      await saveWeeklyReview(viewer, data.profile, data.selectedDate, data.selectedAgent.id, review);
      await onSaved();
    } catch (saveError) { onError(saveError instanceof Error ? saveError.message : '无法保存复盘'); }
    finally { setSaving(false); }
  }
  return (
    <>
      <section className="mb-6 flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between"><div><p className="mb-2 text-sm text-muted-foreground">{formatDate(data.weekStart)} — {formatDate(data.weekDates[6])}</p><h1 className="text-2xl font-semibold tracking-tight sm:text-3xl">{data.selectedAgent?.name} · 每周成绩</h1><p className="mt-1 text-sm text-muted-foreground">每日行动汇总、执行率与每周复盘。</p></div><AgentAndDateControls data={data} onDate={onDate} onAgent={onAgent} weekMode /></section>
      <div className="grid gap-4 md:grid-cols-3"><Kpi label="本周总分" value={`${data.weeklyScore}`} helper={`最高 ${data.maximum} 分`} /><Kpi label="执行率" value={`${Math.round(data.execution * 100)}%`} helper={`${meta.emoji} ${meta.label}`} /><Kpi label="本周完成天数" value={`${data.dailyScores.filter((score) => score > 0).length} / 7`} helper="有记录的行动日" /></div>
      <Card className="mt-6"><CardHeader><CardTitle>每日得分</CardTitle><CardDescription>Daily score by day</CardDescription></CardHeader><CardContent><div className="grid grid-cols-7 gap-2">{data.weekDates.map((date, index) => <div key={date} className="rounded-xl bg-muted/55 px-2 py-4 text-center"><p className="text-xs text-muted-foreground">周{weekLabels[index]}</p><p className="mt-1 text-[11px] text-muted-foreground">{formatDate(date)}</p><p className="mt-3 text-xl font-semibold">{data.dailyScores[index]}</p><p className="text-[11px] text-muted-foreground">/ 12</p></div>)}</div></CardContent></Card>
      <Card className="mt-6"><CardHeader><CardTitle>每周复盘</CardTitle><CardDescription>完成后保存，下周开始前回顾一次。</CardDescription></CardHeader><CardContent className="grid gap-4 md:grid-cols-2"><ReviewField label="本周做得最好的行动" value={review.strongestAction} onChange={(value) => setReview({ ...review, strongestAction: value })} /><ReviewField label="本周最大的缺口" value={review.biggestGap} onChange={(value) => setReview({ ...review, biggestGap: value })} /><ReviewField label="3 位重点潜在客户" value={review.topProspects} onChange={(value) => setReview({ ...review, topProspects: value })} /><ReviewField label="下周一定改善的一件事" value={review.nextImprovement} onChange={(value) => setReview({ ...review, nextImprovement: value })} /><div><label className="mb-2 block text-sm font-medium">下周交单目标</label><Input value={review.nextCaseTarget} onChange={(event) => setReview({ ...review, nextCaseTarget: event.target.value })} /></div><div><label className="mb-2 block text-sm font-medium">下周 TPC 目标</label><Input value={review.nextTpcTarget} onChange={(event) => setReview({ ...review, nextTpcTarget: event.target.value })} /></div></CardContent><div className="flex justify-end border-t bg-muted/30 px-4 py-4"><Button disabled={saving} onClick={saveReview} className="bg-[#7a1226] hover:bg-[#64101f]"><Save />{saving ? '保存中…' : '保存每周复盘'}</Button></div></Card>
    </>
  );
}

function ReviewField({ label, value, onChange }: { label: string; value: string; onChange: (value: string) => void }) {
  return <div><label className="mb-2 block text-sm font-medium">{label}</label><Textarea value={value} onChange={(event) => onChange(event.target.value)} className="min-h-24" /></div>;
}

function AdminView({ data, onWeek, onOpenAgent }: { data: DashboardData; onWeek: (date: string) => void; onOpenAgent: (agent: AgentSummary) => void }) {
  const activeAgents = data.agents.filter((agent) => agent.active);
  const ranked = [...activeAgents].sort((a, b) => b.weeklyScore - a.weeklyScore || a.code.localeCompare(b.code));
  const teamScore = activeAgents.reduce((sum, agent) => sum + agent.weeklyScore, 0);
  const average = activeAgents.length ? activeAgents.reduce((sum, agent) => sum + agent.execution, 0) / activeAgents.length : 0;
  const top = ranked[0]?.weeklyScore ? ranked[0].name : '—';
  const chartData = ranked.map((agent) => ({ name: agent.name, score: agent.weeklyScore }));
  return (
    <>
      <section className="mb-6 flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between"><div><p className="mb-2 text-sm text-muted-foreground">AD Serene 专属页面</p><h1 className="text-2xl font-semibold tracking-tight sm:text-3xl">全部代理活动总览</h1><p className="mt-1 text-sm text-muted-foreground">查看每位代理的每日得分、周总分、执行率与排名。</p></div><AgentAndDateControls data={data} onDate={onWeek} onAgent={() => undefined} weekMode showAgent={false} /></section>
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4"><Kpi label="团队周总分" value={`${teamScore}`} helper={`最高 ${activeAgents.length * data.maximum} 分`} /><Kpi label="启用代理" value={`${activeAgents.length}`} helper="Active agents" /><Kpi label="平均执行率" value={`${Math.round(average * 100)}%`} helper="Team execution" /><Kpi label="本周第一名" value={top} helper={ranked[0]?.weeklyScore ? `${ranked[0].weeklyScore} 分` : '尚无记录'} /></div>
      <div className="mt-6 grid items-start gap-6 xl:grid-cols-[minmax(0,1fr)_420px]">
        <Card><CardHeader><CardTitle>代理每周排名</CardTitle><CardDescription>点击代理姓名可打开该代理的每日行动。</CardDescription></CardHeader><CardContent className="px-0"><Table><TableHeader><TableRow><TableHead className="pl-4">排名</TableHead><TableHead>代理</TableHead>{weekLabels.map((day) => <TableHead key={day} className="text-center">{day}</TableHead>)}<TableHead className="text-right">周分数</TableHead><TableHead className="text-right pr-4">执行率</TableHead></TableRow></TableHeader><TableBody>{ranked.map((agent, index) => { const meta = levelMeta(agent.level); return <TableRow key={agent.id}><TableCell className="pl-4 font-semibold">{agent.weeklyScore ? index + 1 : '—'}</TableCell><TableCell><button className="font-medium text-primary hover:underline" onClick={() => onOpenAgent(agent)}>{agent.name}</button></TableCell>{agent.dailyScores.map((score, day) => <TableCell key={day} className="text-center tabular-nums">{score}</TableCell>)}<TableCell className="text-right font-semibold">{agent.weeklyScore}</TableCell><TableCell className="pr-4 text-right"><Badge variant="outline" className={meta.className}>{Math.round(agent.execution * 100)}%</Badge></TableCell></TableRow>; })}</TableBody></Table></CardContent></Card>
        <Card><CardHeader><CardTitle>代理周分数</CardTitle><CardDescription>Weekly score by agent</CardDescription></CardHeader><CardContent><ChartContainer config={chartConfig} className="h-[320px] w-full"><BarChart accessibilityLayer data={chartData} layout="vertical" margin={{ left: 8, right: 16 }}><CartesianGrid horizontal={false} /><YAxis dataKey="name" type="category" tickLine={false} axisLine={false} width={72} /><XAxis type="number" hide /><ChartTooltip cursor={false} content={<ChartTooltipContent indicator="line" />} /><Bar dataKey="score" fill="var(--color-score)" radius={[0, 7, 7, 0]} /></BarChart></ChartContainer></CardContent></Card>
      </div>
    </>
  );
}

function AgentsView({ viewer: _viewer, data, onReload, onError, onNotice }: { viewer: User; data: DashboardData; onReload: () => void; onError: (message: string | null) => void; onNotice: (message: string | null) => void }) {
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState<AgentSummary | null>(null);
  const [name, setName] = useState('');
  const [active, setActive] = useState(true);
  const [clearBinding, setClearBinding] = useState(false);
  const [saving, setSaving] = useState(false);

  function openNew() { setEditing(null); setName(''); setActive(true); setClearBinding(false); setDialogOpen(true); }
  function openEdit(agent: AgentSummary) { setEditing(agent); setName(agent.name); setActive(agent.active); setClearBinding(false); setDialogOpen(true); }
  async function submit() {
    setSaving(true); onError(null);
    try {
      if (!data.profile) throw new Error('请先登录管理员账号');
      const result = await saveSupabaseAgent(data.profile, editing
        ? { operation: 'update', id: editing.id, name, active, clearBinding }
        : { operation: 'create', name });
      setDialogOpen(false);
      const baseNotice = editing ? '代理资料已更新' : '新代理已添加';
      onNotice(result.accessCode ? `${baseNotice}，新访问码：${result.accessCode}（请立即记录）` : baseNotice);
      onReload();
      if (!result.accessCode) window.setTimeout(() => onNotice(null), 2200);
    } catch (saveError) { onError(saveError instanceof Error ? saveError.message : '无法更新代理'); }
    finally { setSaving(false); }
  }
  return (
    <>
      <section className="mb-6 flex items-end justify-between gap-4"><div><p className="mb-2 text-sm text-muted-foreground">AD Serene 专属设置</p><h1 className="text-2xl font-semibold tracking-tight sm:text-3xl">代理账号管理</h1><p className="mt-1 text-sm text-muted-foreground">添加、改名、停用或解除账号绑定。</p></div><Button onClick={openNew} className="bg-[#7a1226] hover:bg-[#64101f]"><Plus />添加代理</Button></section>
      <Card><CardHeader><CardTitle>代理名单</CardTitle><CardDescription>所有代理使用 6 位访问码登录；新增代理会自动生效并默认使用 123456。</CardDescription></CardHeader><CardContent className="px-0"><Table><TableHeader><TableRow><TableHead className="pl-4">编号</TableHead><TableHead>代理姓名</TableHead><TableHead>账号状态</TableHead><TableHead>访问方式</TableHead><TableHead className="pr-4 text-right">操作</TableHead></TableRow></TableHeader><TableBody>{data.agents.map((agent) => <TableRow key={agent.id} className={!agent.active ? 'opacity-55' : ''}><TableCell className="pl-4 font-mono text-xs">{agent.code}</TableCell><TableCell className="font-medium">{agent.name}</TableCell><TableCell><Badge variant="outline" className={agent.claimed ? 'bg-emerald-50 text-emerald-700' : 'bg-amber-50 text-amber-800'}>{agent.claimed ? '访问码已设置' : '尚未设置'}</Badge>{!agent.active && <Badge variant="outline" className="ml-2">已停用</Badge>}</TableCell><TableCell className="text-muted-foreground">默认访问码</TableCell><TableCell className="pr-4 text-right"><Button variant="ghost" size="sm" onClick={() => openEdit(agent)}><Pencil />编辑</Button></TableCell></TableRow>)}</TableBody></Table></CardContent></Card>
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}><DialogContent><DialogHeader><DialogTitle>{editing ? '编辑代理' : '添加代理'}</DialogTitle><DialogDescription>{editing ? '改名不会删除历史分数；重设后访问码恢复为 123456。' : '新增代理会立即生效，默认访问码为 123456。'}</DialogDescription></DialogHeader><div><label className="mb-2 block text-sm font-medium">代理姓名</label><Input value={name} onChange={(event) => setName(event.target.value)} placeholder="例如：代理 D" /></div>{editing && <><label className="flex items-center gap-3 rounded-xl border p-3"><Checkbox checked={active} onCheckedChange={(checked) => setActive(Boolean(checked))} /><span><span className="block text-sm font-medium">启用代理</span><span className="text-xs text-muted-foreground">停用后不再出现在填写与排名中</span></span></label>{editing.claimed && <label className="flex items-center gap-3 rounded-xl border border-amber-200 bg-amber-50 p-3"><Checkbox checked={clearBinding} onCheckedChange={(checked) => setClearBinding(Boolean(checked))} /><span><span className="block text-sm font-medium text-amber-900">重设访问码</span><span className="text-xs text-amber-700">旧访问码会立即失效，并恢复为 123456</span></span></label>}</>}<DialogFooter><Button variant="outline" onClick={() => setDialogOpen(false)}>取消</Button><Button disabled={saving || !name.trim()} onClick={submit} className="bg-[#7a1226] hover:bg-[#64101f]">{saving ? '保存中…' : '保存'}</Button></DialogFooter></DialogContent></Dialog>
    </>
  );
}

function Kpi({ label, value, helper }: { label: string; value: string; helper: string }) {
  return <Card><CardHeader><CardDescription>{label}</CardDescription><CardTitle className="text-3xl font-semibold tracking-tight text-[#7a1226]">{value}</CardTitle></CardHeader><CardContent><p className="text-xs text-muted-foreground">{helper}</p></CardContent></Card>;
}

function LoadingScreen() {
  return <main className="grid min-h-screen place-items-center bg-background"><div className="text-center"><div className="mx-auto mb-4 grid size-12 animate-pulse place-items-center rounded-2xl bg-[#7a1226] text-white"><Sparkles /></div><p className="font-medium">正在读取计分板…</p><p className="mt-1 text-sm text-muted-foreground">Loading your activity data</p></div></main>;
}

function ErrorScreen({ message, onRetry }: { message: string; onRetry: () => void }) {
  return <main className="grid min-h-screen place-items-center bg-background px-4"><Card className="max-w-md"><CardHeader><CircleAlert className="mb-2 size-8 text-rose-600" /><CardTitle>暂时无法打开计分板</CardTitle><CardDescription>{message}</CardDescription></CardHeader><CardContent><Button onClick={onRetry}>重新尝试</Button></CardContent></Card></main>;
}

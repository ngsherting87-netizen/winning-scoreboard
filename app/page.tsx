import { chatGPTSignInPath, chatGPTSignOutPath, getChatGPTUser } from './chatgpt-auth';
import { DashboardApp } from './dashboard-app';

export const dynamic = 'force-dynamic';

export default async function Home() {
  const user = await getChatGPTUser();
  if (!user) {
    return (
      <main className="grid min-h-screen place-items-center bg-[#f8f3ed] px-4">
        <section className="w-full max-w-md rounded-3xl border bg-white p-8 text-center shadow-[0_28px_80px_rgba(89,23,39,0.12)]">
          <div className="mx-auto mb-5 grid size-14 place-items-center rounded-2xl bg-[#7a1226] text-xl text-white">✓</div>
          <p className="text-sm font-medium text-[#7a1226]">Winning Scoreboard</p>
          <h1 className="mt-2 text-2xl font-semibold tracking-tight">代理活动量管理计分板</h1>
          <p className="mt-3 text-sm leading-6 text-muted-foreground">登录后，代理只会看到自己的每日行动和分数；AD Serene 可以查看全部代理资料。</p>
          <a href={chatGPTSignInPath('/')} target="_top" className="mt-7 inline-flex h-10 w-full items-center justify-center rounded-xl bg-[#7a1226] px-4 text-sm font-medium text-white transition hover:bg-[#64101f]">使用 ChatGPT 账号登录</a>
        </section>
      </main>
    );
  }
  return <DashboardApp signOutPath={chatGPTSignOutPath('/')} />;
}

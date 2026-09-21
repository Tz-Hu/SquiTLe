import Link from "next/link";
import { redirect } from "next/navigation";
import { chatGPTSignInPath, getChatGPTUser } from "@/app/chatgpt-auth";

export const dynamic = "force-dynamic";

export default async function SyncSignInPage() {
  const user = await getChatGPTUser();
  if (user) redirect("/?sync=connected");

  return (
    <main className="grid min-h-screen place-items-center bg-[var(--background)] p-6 text-[var(--foreground)]">
      <section className="w-full max-w-md rounded-xl border border-[var(--border)] bg-[var(--card)] p-6 shadow-lg">
        <h1 className="text-xl font-semibold">开启 Squitle 云同步</h1>
        <p className="mt-3 text-sm leading-6 text-[var(--muted-foreground)]">
          登录后，项目、事项和设置仍会保存在本机；你可以选择 Squitle 云端或自己的 WebDAV 空间，在个人设备间同步。
        </p>
        <div className="mt-6 flex flex-wrap justify-end gap-2">
          <Link className="inline-flex h-9 items-center justify-center rounded-md border border-[var(--border)] px-4 text-sm" href="/">
            返回
          </Link>
          <a className="inline-flex h-9 items-center justify-center rounded-md bg-[var(--primary)] px-4 text-sm text-white" href={chatGPTSignInPath("/sync")} target="_top">
            使用 ChatGPT 登录
          </a>
        </div>
      </section>
    </main>
  );
}

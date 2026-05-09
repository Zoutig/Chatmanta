import { LoginForm } from './login-form';

export const dynamic = 'force-dynamic';

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ next?: string }>;
}) {
  const { next } = await searchParams;
  return (
    <main className="flex min-h-svh items-center justify-center bg-zinc-50 px-4 dark:bg-zinc-950">
      <div className="w-full max-w-sm rounded-xl border border-zinc-200 bg-white p-6 shadow-sm dark:border-zinc-800 dark:bg-zinc-900">
        <h1 className="text-xl font-semibold text-zinc-900 dark:text-zinc-50">
          ChatManta V0
        </h1>
        <p className="mt-1 text-sm text-zinc-600 dark:text-zinc-400">
          Demo-toegang vereist een wachtwoord.
        </p>
        <div className="mt-6">
          <LoginForm next={next ?? '/'} />
        </div>
      </div>
    </main>
  );
}

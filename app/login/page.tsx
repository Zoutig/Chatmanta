import Image from 'next/image';
import { LoginForm } from './login-form';

export const dynamic = 'force-dynamic';

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ next?: string }>;
}) {
  const { next } = await searchParams;
  return (
    <main className="login-shell">
      <div className="login-card">
        <div className="login-brand" aria-hidden="true">
          <Image
            src="/logo/wordmark.png"
            alt="ChatManta"
            width={325}
            height={90}
            priority
          />
        </div>
        <p className="login-subtitle">V0 demo · toegang met wachtwoord</p>
        <div className="login-form-wrap">
          <LoginForm next={next ?? '/'} />
        </div>
      </div>
    </main>
  );
}

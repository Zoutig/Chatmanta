import type { Metadata } from 'next';
import Image from 'next/image';
import { HubBackground } from '../components/home/hub-background';
import { HubCard } from '../components/home/hub-card';
import { AnimatedThemeToggler } from '../components/ui/animated-theme-toggler';

export const metadata: Metadata = {
  title: 'ChatManta · Home',
  description: 'Kies waar je naartoe wilt binnen je ChatManta omgeving.',
};

export const dynamic = 'force-dynamic';

export default function HomePage() {
  return (
    <main
      className="relative min-h-screen w-full overflow-hidden flex flex-col"
      style={{ background: '#02060c', color: '#eaf6fb' }}
    >
      <HubBackground />

      {/* Top-bar */}
      <header className="relative z-10 flex items-center justify-between px-5 md:px-10 pt-6 md:pt-8">
        <div className="flex items-center gap-2.5">
          <Image
            src="/logo/wordmark.png"
            alt="ChatManta"
            width={140}
            height={36}
            priority
            className="h-7 md:h-8 w-auto opacity-90"
          />
        </div>
        <div className="flex items-center gap-2">
          <AnimatedThemeToggler />
        </div>
      </header>

      {/* Hero + grid */}
      <section className="relative z-10 flex-1 flex flex-col items-center justify-center px-5 md:px-10 py-12 md:py-16">
        <div className="w-full max-w-5xl mx-auto">
          {/* Hero */}
          <div className="text-center mb-10 md:mb-14">
            <span
              className="inline-flex items-center gap-2 text-[11px] font-medium uppercase tracking-[0.14em] px-3 py-1 mb-5"
              style={{
                borderRadius: '999px',
                color: '#a7ffe6',
                background: 'rgba(0,204,155,0.08)',
                border: '1px solid rgba(0,204,155,0.22)',
              }}
            >
              <span
                className="inline-block h-1.5 w-1.5 rounded-full"
                style={{
                  background: '#00CC9B',
                  boxShadow: '0 0 8px rgba(0,204,155,0.7)',
                }}
              />
              ChatManta hub
            </span>
            <h1
              className="text-3xl md:text-5xl font-bold tracking-tight leading-[1.05] mb-4"
              style={{
                fontFamily: 'var(--font-jakarta), var(--font-inter), sans-serif',
                background:
                  'linear-gradient(180deg, #f3fbff 0%, #b8dfe9 100%)',
                WebkitBackgroundClip: 'text',
                WebkitTextFillColor: 'transparent',
                backgroundClip: 'text',
                letterSpacing: '-0.02em',
              }}
            >
              Welkom bij ChatManta
            </h1>
            <p
              className="text-base md:text-lg max-w-xl mx-auto"
              style={{ color: 'rgba(207,232,240,0.72)' }}
            >
              Kies waar je naartoe wilt binnen je ChatManta omgeving.
            </p>
          </div>

          {/* 2×2 grid (1-col mobile) */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-5 md:gap-6">
            <HubCard
              variant="primary"
              iconName="sliders"
              title="Admintool"
              description="Beheer en test je ChatManta chatomgeving."
              href="/"
              cta="Open admintool"
            />
            <HubCard
              iconName="monitor"
              title="Klantendashboard v0"
              description="Bekijk klantdata, instellingen en prestaties."
              badge="Binnenkort"
            />
            <HubCard
              iconName="globe"
              title="Marketing site"
              description="Werk aan de publieke website en landingspagina."
              badge="Binnenkort"
            />
            <HubCard
              iconName="panel-right"
              title="Klant-experience · Widget"
              description="Bekijk en test de klantzijde van de chatwidget."
              badge="Binnenkort"
            />
          </div>

          {/* Footer hint */}
          <p
            className="mt-10 md:mt-14 text-center text-xs"
            style={{ color: 'rgba(155,213,224,0.45)' }}
          >
            ChatManta · Jorion Solutions
          </p>
        </div>
      </section>
    </main>
  );
}

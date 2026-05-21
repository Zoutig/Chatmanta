import type { Metadata } from 'next';
import { HubBackground } from '../components/home/hub-background';
import { HubCard } from '../components/home/hub-card';
import { AnimatedThemeToggler } from '../components/ui/animated-theme-toggler';
import { HomeAccentPicker } from './components/home-accent-picker';

export const metadata: Metadata = {
  title: 'ChatManta · Home',
  description: 'Kies waar je naartoe wilt binnen je ChatManta omgeving.',
};

export const dynamic = 'force-dynamic';

export default function HomePage() {
  return (
    <main
      className="relative min-h-screen w-full overflow-hidden flex flex-col"
      style={{ background: 'var(--bg)', color: 'var(--fg)' }}
    >
      <HubBackground />
      <HomeAccentPicker />

      {/* Top-bar */}
      <header className="relative z-10 flex items-center justify-between px-5 md:px-10 pt-6 md:pt-8">
        <div className="flex items-center gap-2.5">
          {/* Manta-mark volgt --manta-accent zodat een accent-wissel in
              de admin-settings ook hier doorklinkt. Inline mask zodat de
              .brand-mark::before-regel uit manta.css niet vereist is. */}
          <div
            role="img"
            aria-label="ChatManta logo"
            style={{
              width: 36,
              height: 22,
              backgroundColor: 'var(--manta-accent)',
              WebkitMaskImage: "url('/logo/mono-mark.png')",
              maskImage: "url('/logo/mono-mark.png')",
              WebkitMaskSize: 'contain',
              maskSize: 'contain',
              WebkitMaskRepeat: 'no-repeat',
              maskRepeat: 'no-repeat',
              WebkitMaskPosition: 'center',
              maskPosition: 'center',
            }}
          />
          <span
            className="text-base md:text-lg leading-none"
            style={{
              fontFamily: 'var(--font-jakarta), var(--font-inter), sans-serif',
              fontWeight: 700,
              letterSpacing: '-0.01em',
              color: 'var(--fg)',
            }}
          >
            Chat<span style={{ color: 'var(--manta-accent)' }}>Manta</span>
          </span>
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
                color: 'color-mix(in oklab, var(--manta-accent) 60%, var(--fg))',
                background:
                  'color-mix(in oklab, var(--manta-accent) 10%, transparent)',
                border:
                  '1px solid color-mix(in oklab, var(--manta-accent) 28%, transparent)',
              }}
            >
              <span
                className="inline-block h-1.5 w-1.5 rounded-full"
                style={{
                  background: 'var(--manta-accent)',
                  boxShadow:
                    '0 0 8px color-mix(in oklab, var(--manta-accent) 70%, transparent)',
                }}
              />
              ChatManta hub
            </span>
            <h1
              className="text-3xl md:text-5xl font-bold tracking-tight leading-[1.05] mb-4"
              style={{
                fontFamily: 'var(--font-jakarta), var(--font-inter), sans-serif',
                background:
                  'linear-gradient(180deg, var(--fg) 0%, color-mix(in oklab, var(--fg) 65%, var(--manta-accent)) 100%)',
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
              style={{ color: 'var(--fg-muted)' }}
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
              href="/admintool"
              cta="Open admintool"
            />
            <HubCard
              variant="primary"
              iconName="command"
              title="Command Center"
              description="Founder cockpit voor taken, roadmap en testklanten."
              href="/commandcenter"
              cta="Open command center"
            />
            <HubCard
              variant="primary"
              iconName="monitor"
              title="Klantendashboard v0"
              description="Beheer je chatbot, bronnen, widget en gesprekken."
              href="/klantendashboard"
              cta="Open dashboard"
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
              href="/widget"
              cta="Open demo"
            />
          </div>

          {/* Footer hint */}
          <p
            className="mt-10 md:mt-14 text-center text-xs"
            style={{ color: 'var(--fg-dim)' }}
          >
            ChatManta · Jorion Solutions
          </p>
        </div>
      </section>
    </main>
  );
}

'use client';

import { useState, type FormEvent } from 'react';
import Link from 'next/link';
import { motion, AnimatePresence } from 'motion/react';
import { Mail, ArrowRight, CheckCircle2 } from 'lucide-react';
import { createClient } from '@/lib/supabase/v1/client';
import { cn } from '@/lib/utils';
// ponytail: visuele kopie van de set-password-kaart (eenvoudige variant), geen 3D-tilt
import { LoginBackground } from '../../../components/ui/login-background';

/**
 * V1 "wachtwoord vergeten"-aanvraag. Vraagt een e-mailadres en stuurt via
 * Supabase Auth een recovery-mail (`resetPasswordForEmail`). De recovery-mail
 * linkt — net als de invite-mail — naar /v1/auth/confirm?type=recovery, dat de
 * sessie zet via verifyOtp en doorstuurt naar /v1/auth/set-password.
 *
 * Geen `redirectTo`: de Supabase "Reset Password"-template bepaalt de link via
 * {{ .TokenHash }}, dus we hoeven geen URL op de allowlist te zetten.
 *
 * Anti-enumeratie: we tonen ALTIJD dezelfde neutrale succesmelding (ook als het
 * adres onbekend is), zodat de UI niet verraadt of een account bestaat. Supabase
 * geeft zelf ook geen "bestaat niet"-fout terug bij deze call.
 */
export function ForgotPasswordForm() {
  const [email, setEmail] = useState('');
  const [focused, setFocused] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [sent, setSent] = useState(false);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setBusy(true);
    const supabase = createClient();
    const { error: resetError } = await supabase.auth.resetPasswordForEmail(email);
    setBusy(false);
    if (resetError) {
      // Alleen echte fouten (bv. rate-limit) tonen — die verraden niets over bestaan.
      setError(resetError.message);
      return;
    }
    setSent(true);
  }

  return (
    <div
      className="min-h-screen w-screen relative overflow-hidden flex items-center justify-center"
      style={{
        background: '#02060c',
        paddingTop: 'var(--safe-top, 0px)',
        paddingBottom: 'var(--safe-bottom, 0px)',
        paddingLeft: 'var(--safe-left, 0px)',
        paddingRight: 'var(--safe-right, 0px)',
      }}
    >
      <div className="absolute inset-0 pointer-events-none">
        <LoginBackground />
      </div>

      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.8 }}
        className="w-full max-w-md relative z-10 px-4"
      >
        <div className="relative group">
          {/* Glass card */}
          <div
            className="relative rounded-2xl p-6 border shadow-2xl overflow-hidden"
            style={{
              background: 'rgba(0, 0, 0, 0.45)',
              backdropFilter: 'blur(16px) saturate(140%)',
              WebkitBackdropFilter: 'blur(16px) saturate(140%)',
              borderColor: 'rgba(255, 255, 255, 0.06)',
            }}
          >
            <div
              className="absolute inset-0 opacity-[0.03] pointer-events-none"
              style={{
                backgroundImage:
                  'linear-gradient(135deg, white 0.5px, transparent 0.5px), linear-gradient(45deg, white 0.5px, transparent 0.5px)',
                backgroundSize: '30px 30px',
              }}
            />

            {/* Brand + heading */}
            <div className="text-center space-y-2 mb-5">
              <div
                className="mx-auto w-12 h-8 relative"
                role="img"
                aria-label="ChatManta"
                style={{
                  backgroundColor: 'var(--manta-accent)',
                  WebkitMaskImage: "url('/logo/mono-mark.png')",
                  maskImage: "url('/logo/mono-mark.png')",
                  WebkitMaskSize: 'contain',
                  maskSize: 'contain',
                  WebkitMaskRepeat: 'no-repeat',
                  maskRepeat: 'no-repeat',
                  WebkitMaskPosition: 'center',
                  maskPosition: 'center',
                  filter:
                    'drop-shadow(0 0 12px color-mix(in oklab, var(--manta-accent) 50%, transparent))',
                }}
              />
              <h1
                className="text-xl font-bold"
                style={{
                  background: 'linear-gradient(to bottom, #fff, rgba(255,255,255,0.8))',
                  WebkitBackgroundClip: 'text',
                  WebkitTextFillColor: 'transparent',
                  backgroundClip: 'text',
                }}
              >
                Wachtwoord vergeten
              </h1>
              <p className="text-xs" style={{ color: 'rgba(255,255,255,0.6)' }}>
                {sent
                  ? 'Check je inbox'
                  : 'Vul je e-mail in en we sturen je een link om een nieuw wachtwoord in te stellen'}
              </p>
            </div>

            {sent ? (
              <div className="space-y-4 text-center">
                <CheckCircle2 className="mx-auto w-10 h-10" style={{ color: 'var(--manta-accent)' }} />
                <p className="text-sm" style={{ color: 'rgba(255,255,255,0.75)' }}>
                  Als er een account bij dit e-mailadres hoort, ontvang je binnen enkele minuten
                  een e-mail met een link om je wachtwoord opnieuw in te stellen.
                </p>
                <Link
                  href="/v1/login"
                  className="inline-block text-xs underline transition-colors duration-300"
                  style={{ color: 'rgba(255,255,255,0.6)' }}
                >
                  Terug naar inloggen
                </Link>
              </div>
            ) : (
              <form onSubmit={onSubmit} className="space-y-4">
                {/* E-mail */}
                <div className={`relative ${focused ? 'z-10' : ''}`}>
                  <div className="relative flex items-center overflow-hidden rounded-lg">
                    <Mail
                      className={cn(
                        'absolute left-3 w-4 h-4 transition-all duration-300',
                        focused ? 'text-white' : 'text-white/40',
                      )}
                    />
                    <input
                      type="email"
                      name="email"
                      required
                      autoFocus
                      autoComplete="email"
                      placeholder="E-mail"
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      onFocus={() => setFocused(true)}
                      onBlur={() => setFocused(false)}
                      className="w-full border-transparent text-white placeholder:text-white/30 h-10 transition-all duration-300 pl-10 pr-3 text-sm rounded-lg outline-none"
                      style={{ background: 'rgba(255, 255, 255, 0.05)' }}
                    />
                  </div>
                </div>

                {error ? (
                  <p role="alert" className="text-xs" style={{ color: '#ff6b6b' }}>
                    {error}
                  </p>
                ) : null}

                <motion.button
                  whileHover={{ scale: 1.02 }}
                  whileTap={{ scale: 0.98 }}
                  type="submit"
                  disabled={busy}
                  className="w-full relative group/button mt-2"
                >
                  <div
                    className="absolute inset-0 rounded-lg blur-lg opacity-0 group-hover/button:opacity-70 transition-opacity duration-300"
                    style={{ background: 'color-mix(in oklab, var(--manta-accent) 50%, white)' }}
                  />
                  <div
                    className="relative overflow-hidden font-medium h-10 rounded-lg transition-all duration-300 flex items-center justify-center"
                    style={{
                      background:
                        'linear-gradient(135deg, color-mix(in oklab, var(--manta-accent) 90%, white), var(--manta-accent))',
                      color: '#fff',
                    }}
                  >
                    <AnimatePresence mode="wait">
                      {busy ? (
                        <motion.div
                          key="loading"
                          initial={{ opacity: 0 }}
                          animate={{ opacity: 1 }}
                          exit={{ opacity: 0 }}
                          className="flex items-center justify-center"
                        >
                          <div className="w-4 h-4 border-2 border-white/70 border-t-transparent rounded-full animate-spin" />
                        </motion.div>
                      ) : (
                        <motion.span
                          key="text"
                          initial={{ opacity: 0 }}
                          animate={{ opacity: 1 }}
                          exit={{ opacity: 0 }}
                          className="flex items-center justify-center gap-1 text-sm font-medium"
                        >
                          Stuur resetlink
                          <ArrowRight className="w-3 h-3 group-hover/button:translate-x-1 transition-transform duration-300" />
                        </motion.span>
                      )}
                    </AnimatePresence>
                  </div>
                </motion.button>

                <div className="text-center">
                  <Link
                    href="/v1/login"
                    className="text-xs transition-colors duration-300 hover:text-white"
                    style={{ color: 'rgba(255,255,255,0.5)' }}
                  >
                    Terug naar inloggen
                  </Link>
                </div>
              </form>
            )}
          </div>
        </div>
      </motion.div>
    </div>
  );
}

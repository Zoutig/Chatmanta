'use client';

import { useState, type FormEvent } from 'react';
import { useRouter } from 'next/navigation';
import { motion, AnimatePresence } from 'motion/react';
import { Lock, Eye, EyeOff, ArrowRight } from 'lucide-react';
import { createClient } from '@/lib/supabase/v1/client';
import { cn } from '@/lib/utils';
// ponytail: visuele kopie van V0 sign-in-card (eenvoudiger variant), V0-bestand blijft onaangeraakt
import { LoginBackground } from '../../../components/ui/login-background';

export function SetPasswordForm() {
  const router = useRouter();
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [focusedPassword, setFocusedPassword] = useState(false);
  const [focusedConfirm, setFocusedConfirm] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  // --- V1 set-password-flow (ongewijzigd) ---
  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    if (password.length < 8) {
      setError('Wachtwoord moet minstens 8 tekens zijn.');
      return;
    }
    if (password !== confirm) {
      setError('De wachtwoorden komen niet overeen.');
      return;
    }
    setBusy(true);
    const supabase = createClient();
    const { error: updateError } = await supabase.auth.updateUser({ password });
    setBusy(false);
    if (updateError) {
      // Geen sessie (link verlopen / direct bezocht) → updateUser faalt → terug naar login.
      setError(updateError.message);
      return;
    }
    router.push('/v1/app');
    router.refresh();
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
                Stel je wachtwoord in
              </h1>
              <p className="text-xs" style={{ color: 'rgba(255,255,255,0.6)' }}>
                Kies een nieuw wachtwoord voor je account
              </p>
            </div>

            {/* Form */}
            <form onSubmit={onSubmit} className="space-y-4">
              {/* Nieuw wachtwoord */}
              <div className={`relative ${focusedPassword ? 'z-10' : ''}`}>
                <div className="relative flex items-center overflow-hidden rounded-lg">
                  <Lock
                    className={cn(
                      'absolute left-3 w-4 h-4 transition-all duration-300',
                      focusedPassword ? 'text-white' : 'text-white/40',
                    )}
                  />
                  <input
                    type={showPassword ? 'text' : 'password'}
                    name="password"
                    required
                    autoFocus
                    autoComplete="new-password"
                    placeholder="Nieuw wachtwoord"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    onFocus={() => setFocusedPassword(true)}
                    onBlur={() => setFocusedPassword(false)}
                    className="w-full border-transparent text-white placeholder:text-white/30 h-10 transition-all duration-300 pl-10 pr-10 text-sm rounded-lg outline-none"
                    style={{ background: 'rgba(255, 255, 255, 0.05)' }}
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword((s) => !s)}
                    className="absolute right-3 cursor-pointer text-white/40 hover:text-white transition-colors duration-300"
                    tabIndex={-1}
                    aria-label={showPassword ? 'Wachtwoord verbergen' : 'Wachtwoord tonen'}
                  >
                    {showPassword ? <Eye className="w-4 h-4" /> : <EyeOff className="w-4 h-4" />}
                  </button>
                </div>
              </div>

              {/* Herhaal wachtwoord */}
              <div className={`relative ${focusedConfirm ? 'z-10' : ''}`}>
                <div className="relative flex items-center overflow-hidden rounded-lg">
                  <Lock
                    className={cn(
                      'absolute left-3 w-4 h-4 transition-all duration-300',
                      focusedConfirm ? 'text-white' : 'text-white/40',
                    )}
                  />
                  <input
                    type={showPassword ? 'text' : 'password'}
                    name="confirm"
                    required
                    autoComplete="new-password"
                    placeholder="Herhaal wachtwoord"
                    value={confirm}
                    onChange={(e) => setConfirm(e.target.value)}
                    onFocus={() => setFocusedConfirm(true)}
                    onBlur={() => setFocusedConfirm(false)}
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
                        Wachtwoord opslaan
                        <ArrowRight className="w-3 h-3 group-hover/button:translate-x-1 transition-transform duration-300" />
                      </motion.span>
                    )}
                  </AnimatePresence>
                </div>
              </motion.button>
            </form>
          </div>
        </div>
      </motion.div>
    </div>
  );
}

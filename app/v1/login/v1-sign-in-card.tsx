'use client';

import { useRef, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { motion, useMotionValue, useTransform, AnimatePresence } from 'motion/react';
import { Mail, Lock, Eye, EyeOff, ArrowRight } from 'lucide-react';
import { createClient } from '@/lib/supabase/v1/client';
import { cn } from '@/lib/utils';
// ponytail: visuele kopie van V0 sign-in-card, V0-bestand blijft onaangeraakt
import { LoginBackground } from '../../components/ui/login-background';

/**
 * V1-login-card. Visuele chrome is een kopie van V0's `SignInCard`
 * (LoginBackground, 3D-tilt, halo, traveling beams, glass-card, logo-mask,
 * oog-toggle, submit-motion). Verschil met V0: V1 vraagt e-mail + wachtwoord
 * en logt client-side in via Supabase Auth (`signInWithPassword`) i.p.v. de
 * V0 server-action. De auth-flow is ongewijzigd t.o.v. de oude V1LoginForm.
 */
export function V1SignInCard({ initialError }: { initialError?: string }) {
  const router = useRouter();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [focusedEmail, setFocusedEmail] = useState(false);
  const [focusedPassword, setFocusedPassword] = useState(false);
  const [error, setError] = useState<string | null>(initialError ?? null);
  const [busy, setBusy] = useState(false);

  // --- V1 auth-flow (ongewijzigd) ---
  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setBusy(true);
    const supabase = createClient();
    const { error: signInError } = await supabase.auth.signInWithPassword({ email, password });
    setBusy(false);
    if (signInError) {
      setError(signInError.message);
      return;
    }
    router.push('/v1/app');
    router.refresh();
  }

  // 3D card-tilt
  const mouseX = useMotionValue(0);
  const mouseY = useMotionValue(0);
  const rotateX = useTransform(mouseY, [-300, 300], [10, -10]);
  const rotateY = useTransform(mouseX, [-300, 300], [-10, 10]);
  const cardRef = useRef<HTMLDivElement>(null);

  const handleMouseMove = (e: React.MouseEvent) => {
    const rect = e.currentTarget.getBoundingClientRect();
    mouseX.set(e.clientX - rect.left - rect.width / 2);
    mouseY.set(e.clientY - rect.top - rect.height / 2);
  };

  const handleMouseLeave = () => {
    mouseX.set(0);
    mouseY.set(0);
  };

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

      {/* Card */}
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.8 }}
        className="w-full max-w-md relative z-10 px-4"
        style={{ perspective: 1500 }}
      >
        <motion.div
          ref={cardRef}
          className="relative"
          style={{ rotateX, rotateY }}
          onMouseMove={handleMouseMove}
          onMouseLeave={handleMouseLeave}
        >
          <div className="relative group">
            {/* Halo */}
            <motion.div
              className="absolute -inset-[1px] rounded-2xl opacity-0 group-hover:opacity-70 transition-opacity duration-700"
              animate={{
                boxShadow: [
                  '0 0 10px 2px rgba(255,255,255,0.03)',
                  '0 0 15px 5px rgba(255,255,255,0.05)',
                  '0 0 10px 2px rgba(255,255,255,0.03)',
                ],
                opacity: [0.2, 0.4, 0.2],
              }}
              transition={{ duration: 4, repeat: Infinity, ease: 'easeInOut', repeatType: 'mirror' }}
            />

            {/* Traveling light beams */}
            <div className="absolute -inset-[1px] rounded-2xl overflow-hidden pointer-events-none">
              {(['top', 'right', 'bottom', 'left'] as const).map((side, idx) => {
                const isHorizontal = side === 'top' || side === 'bottom';
                const positionStyle: Record<string, string | number> = {};
                if (side === 'top') positionStyle.top = 0;
                if (side === 'right') positionStyle.right = 0;
                if (side === 'bottom') positionStyle.bottom = 0;
                if (side === 'left') positionStyle.left = 0;
                if (isHorizontal) {
                  positionStyle.left = 0;
                  positionStyle.height = '3px';
                  positionStyle.width = '50%';
                } else {
                  positionStyle.top = 0;
                  positionStyle.width = '3px';
                  positionStyle.height = '50%';
                }
                return (
                  <motion.div
                    key={side}
                    className="absolute opacity-70"
                    style={{
                      ...positionStyle,
                      background: isHorizontal
                        ? 'linear-gradient(to right, transparent, white, transparent)'
                        : 'linear-gradient(to bottom, transparent, white, transparent)',
                    }}
                    initial={{ filter: 'blur(2px)' }}
                    animate={
                      isHorizontal
                        ? {
                            left: ['-50%', '100%'],
                            opacity: [0.3, 0.7, 0.3],
                            filter: ['blur(1px)', 'blur(2.5px)', 'blur(1px)'],
                          }
                        : {
                            top: ['-50%', '100%'],
                            opacity: [0.3, 0.7, 0.3],
                            filter: ['blur(1px)', 'blur(2.5px)', 'blur(1px)'],
                          }
                    }
                    transition={{
                      duration: 2.5,
                      ease: 'easeInOut',
                      repeat: Infinity,
                      repeatDelay: 1,
                      delay: idx * 0.6,
                    }}
                  />
                );
              })}
            </div>

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
                <motion.div
                  initial={{ scale: 0.5, opacity: 0 }}
                  animate={{ scale: 1, opacity: 1 }}
                  transition={{ type: 'spring', duration: 0.8 }}
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
                <motion.h1
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: 0.2 }}
                  className="text-xl font-bold"
                  style={{
                    background: 'linear-gradient(to bottom, #fff, rgba(255,255,255,0.8))',
                    WebkitBackgroundClip: 'text',
                    WebkitTextFillColor: 'transparent',
                    backgroundClip: 'text',
                  }}
                >
                  Welkom terug
                </motion.h1>
                <motion.p
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  transition={{ delay: 0.3 }}
                  className="text-xs"
                  style={{ color: 'rgba(255,255,255,0.6)' }}
                >
                  ChatManta · log in op je werkomgeving
                </motion.p>
              </div>

              {/* Form */}
              <form onSubmit={onSubmit} className="space-y-4">
                {/* E-mail */}
                <motion.div
                  className={`relative ${focusedEmail ? 'z-10' : ''}`}
                  transition={{ type: 'spring', stiffness: 400, damping: 25 }}
                >
                  <div
                    className="absolute -inset-[0.5px] rounded-lg opacity-0 group-hover:opacity-100 transition-all duration-300"
                    style={{ background: 'linear-gradient(to right, rgba(255,255,255,0.1), rgba(255,255,255,0.05), rgba(255,255,255,0.1))' }}
                  />
                  <div className="relative flex items-center overflow-hidden rounded-lg">
                    <Mail
                      className={cn(
                        'absolute left-3 w-4 h-4 transition-all duration-300',
                        focusedEmail ? 'text-white' : 'text-white/40',
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
                      onFocus={() => setFocusedEmail(true)}
                      onBlur={() => setFocusedEmail(false)}
                      className="w-full border-transparent text-white placeholder:text-white/30 h-10 transition-all duration-300 pl-10 pr-3 text-sm rounded-lg outline-none"
                      style={{ background: 'rgba(255, 255, 255, 0.05)' }}
                    />
                  </div>
                </motion.div>

                {/* Wachtwoord */}
                <motion.div
                  className={`relative ${focusedPassword ? 'z-10' : ''}`}
                  transition={{ type: 'spring', stiffness: 400, damping: 25 }}
                >
                  <div
                    className="absolute -inset-[0.5px] rounded-lg opacity-0 group-hover:opacity-100 transition-all duration-300"
                    style={{ background: 'linear-gradient(to right, rgba(255,255,255,0.1), rgba(255,255,255,0.05), rgba(255,255,255,0.1))' }}
                  />
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
                      autoComplete="current-password"
                      placeholder="Wachtwoord"
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
                </motion.div>

                <div className="flex justify-end -mt-1">
                  <Link
                    href="/v1/auth/forgot-password"
                    className="text-xs transition-colors duration-300 hover:text-white"
                    style={{ color: 'rgba(255,255,255,0.5)' }}
                  >
                    Wachtwoord vergeten?
                  </Link>
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
                          Inloggen
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
      </motion.div>
    </div>
  );
}

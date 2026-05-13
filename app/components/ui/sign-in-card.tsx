'use client';

import { useActionState, useRef, useState } from 'react';
import { motion, useMotionValue, useTransform, AnimatePresence } from 'motion/react';
import { Lock, Eye, EyeOff, ArrowRight } from 'lucide-react';
import { login, type LoginState } from '../../login/actions';
import { cn } from '@/lib/utils';
import { EtheralShadow } from './etheral-shadow';

/**
 * Manta-themed sign-in card. Bron 21st.dev `sign-in-card-2`, aangepast:
 * - Email + Google + signup + remember-me + forgot weggehaald (V0 = één
 *   wachtwoord).
 * - Purple gradient → Caribbean Green (#00CC9B) hardcoded — login moet
 *   branding-consistent zijn, los van de user-accent in localStorage.
 * - Submit gaat via `useActionState` naar de bestaande `login` server
 *   action — geen auth-flow change.
 * - Behouden: 3D card-tilt op mouse, traveling light beams,
 *   password-eye-toggle, loading-spinner.
 */

const initial: LoginState = {};

export function SignInCard({ next }: { next: string }) {
  const [showPassword, setShowPassword] = useState(false);
  const [focusedPassword, setFocusedPassword] = useState(false);
  const [state, action, pending] = useActionState(login, initial);

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
    <div className="min-h-screen w-screen relative overflow-hidden flex items-center justify-center" style={{ background: '#02060c' }}>
      {/* Etheral-shadow animated SVG-filter background, Manta-teal getint.
          Wrapper-div is absolute fullbleed; de EtheralShadow zelf gebruikt
          z'n eigen position:relative om de SVG-filter correct te plaatsen. */}
      <div className="absolute inset-0 pointer-events-none">
        <EtheralShadow
          color="color-mix(in oklab, #00CC9B 70%, #02151a)"
          animation={{ scale: 100, speed: 90 }}
          noise={{ opacity: 0.7, scale: 1.2 }}
          sizing="fill"
        />
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
                    backgroundColor: '#00CC9B',
                    WebkitMaskImage: "url('/logo/mono-mark.png')",
                    maskImage: "url('/logo/mono-mark.png')",
                    WebkitMaskSize: 'contain',
                    maskSize: 'contain',
                    WebkitMaskRepeat: 'no-repeat',
                    maskRepeat: 'no-repeat',
                    WebkitMaskPosition: 'center',
                    maskPosition: 'center',
                    filter: 'drop-shadow(0 0 12px color-mix(in oklab, #00CC9B 50%, transparent))',
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
                  ChatManta · toegang met wachtwoord
                </motion.p>
              </div>

              {/* Form */}
              <form action={action} className="space-y-4">
                <input type="hidden" name="next" value={next} />

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
                      autoFocus
                      autoComplete="current-password"
                      placeholder="Wachtwoord"
                      onFocus={() => setFocusedPassword(true)}
                      onBlur={() => setFocusedPassword(false)}
                      className="w-full border-transparent text-white placeholder:text-white/30 h-10 transition-all duration-300 pl-10 pr-10 text-sm rounded-lg outline-none"
                      style={{
                        background: 'rgba(255, 255, 255, 0.05)',
                      }}
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

                {state.error ? (
                  <p className="text-xs" style={{ color: '#ff6b6b' }}>
                    {state.error}
                  </p>
                ) : null}

                <motion.button
                  whileHover={{ scale: 1.02 }}
                  whileTap={{ scale: 0.98 }}
                  type="submit"
                  disabled={pending}
                  className="w-full relative group/button mt-2"
                >
                  <div className="absolute inset-0 rounded-lg blur-lg opacity-0 group-hover/button:opacity-70 transition-opacity duration-300" style={{ background: 'color-mix(in oklab, #00CC9B 50%, white)' }} />
                  <div
                    className="relative overflow-hidden font-medium h-10 rounded-lg transition-all duration-300 flex items-center justify-center"
                    style={{
                      background: 'linear-gradient(135deg, color-mix(in oklab, #00CC9B 90%, white), #00CC9B)',
                      color: '#fff',
                    }}
                  >
                    <AnimatePresence mode="wait">
                      {pending ? (
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

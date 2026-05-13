'use client';

import Link from 'next/link';
import { motion } from 'motion/react';
import { Icon } from '../svg-icons';
import { cn } from '@/lib/utils';

type IconName = Parameters<typeof Icon>[0]['name'];

export type HubCardProps = {
  title: string;
  description: string;
  iconName: IconName;
  href?: string;
  variant?: 'primary' | 'placeholder';
  badge?: string;
  cta?: string;
};

export function HubCard({
  title,
  description,
  iconName,
  href,
  variant = 'placeholder',
  badge,
  cta,
}: HubCardProps) {
  const isPrimary = variant === 'primary';
  const disabled = !href;

  const body = (
    <motion.div
      whileHover={disabled ? undefined : { y: -3 }}
      transition={{ type: 'spring', stiffness: 320, damping: 28 }}
      className={cn(
        'group relative h-full p-6 md:p-8 flex flex-col gap-5',
        'transition-colors duration-300',
        disabled && 'opacity-70',
      )}
      style={{
        borderRadius: 'var(--r-xl, 20px)',
        background: isPrimary
          ? 'linear-gradient(160deg, rgba(0,204,155,0.10) 0%, rgba(255,255,255,0.04) 55%, rgba(0,204,155,0.05) 100%)'
          : 'rgba(255,255,255,0.035)',
        backdropFilter: 'blur(20px) saturate(140%)',
        WebkitBackdropFilter: 'blur(20px) saturate(140%)',
        border: isPrimary
          ? '1px solid rgba(0,204,155,0.32)'
          : '1px solid rgba(120,200,230,0.12)',
        boxShadow: isPrimary
          ? '0 14px 40px -18px rgba(0,204,155,0.45), inset 0 1px 0 rgba(255,255,255,0.05)'
          : '0 8px 30px -16px rgba(0,0,0,0.55), inset 0 1px 0 rgba(255,255,255,0.03)',
      }}
    >
      {/* Halo on hover (only primary + interactive) */}
      {!disabled && (
        <div
          className={cn(
            'pointer-events-none absolute -inset-px opacity-0 transition-opacity duration-500',
            isPrimary ? 'group-hover:opacity-100' : 'group-hover:opacity-60',
          )}
          style={{
            borderRadius: 'inherit',
            boxShadow: isPrimary
              ? '0 0 0 1px rgba(0,204,155,0.55), 0 0 36px rgba(0,204,155,0.32)'
              : '0 0 0 1px rgba(120,200,230,0.28)',
          }}
        />
      )}

      {/* Top row: icon-tile + optional badge */}
      <div className="flex items-start justify-between gap-3">
        <div
          className="flex h-12 w-12 items-center justify-center"
          style={{
            borderRadius: '14px',
            background: isPrimary
              ? 'linear-gradient(135deg, rgba(0,204,155,0.22), rgba(0,146,146,0.12))'
              : 'rgba(255,255,255,0.05)',
            border: isPrimary
              ? '1px solid rgba(0,204,155,0.35)'
              : '1px solid rgba(120,200,230,0.10)',
            color: isPrimary ? '#a7ffe6' : '#cfe8f0',
          }}
        >
          <Icon name={iconName} size={22} />
        </div>

        {badge ? (
          <span
            className="text-[11px] font-medium tracking-wide uppercase px-2.5 py-1"
            style={{
              borderRadius: '999px',
              color: '#9bd5e0',
              background: 'rgba(120,200,230,0.08)',
              border: '1px solid rgba(120,200,230,0.18)',
              letterSpacing: '0.08em',
            }}
          >
            {badge}
          </span>
        ) : isPrimary ? (
          <span
            className="flex items-center gap-1.5 text-[11px] font-medium tracking-wide uppercase px-2.5 py-1"
            style={{
              borderRadius: '999px',
              color: '#03171a',
              background: '#00CC9B',
              letterSpacing: '0.08em',
            }}
          >
            <span
              className="inline-block h-1.5 w-1.5 rounded-full"
              style={{ background: '#03171a' }}
            />
            Live
          </span>
        ) : null}
      </div>

      {/* Title + description */}
      <div className="flex flex-col gap-2">
        <h2
          className="text-xl md:text-2xl font-semibold leading-tight"
          style={{
            color: '#eaf6fb',
            fontFamily: 'var(--font-jakarta), var(--font-inter), sans-serif',
            letterSpacing: '-0.01em',
          }}
        >
          {title}
        </h2>
        <p
          className="text-sm md:text-[15px] leading-relaxed"
          style={{ color: 'rgba(207,232,240,0.72)' }}
        >
          {description}
        </p>
      </div>

      {/* Spacer pushes CTA to bottom on tall cards */}
      <div className="mt-auto" />

      {/* CTA row */}
      {cta ? (
        <div className="flex items-center justify-between pt-2">
          <span
            className={cn(
              'inline-flex items-center gap-2 text-sm font-medium',
              'transition-transform duration-300',
              !disabled && 'group-hover:translate-x-0.5',
            )}
            style={{
              color: isPrimary ? '#00CC9B' : 'rgba(155,213,224,0.85)',
            }}
          >
            {cta}
            <Icon name="send" size={14} />
          </span>
        </div>
      ) : null}
    </motion.div>
  );

  if (disabled) {
    return (
      <div
        role="link"
        aria-disabled="true"
        tabIndex={-1}
        title="Binnenkort beschikbaar"
        className="block h-full cursor-not-allowed select-none"
      >
        {body}
      </div>
    );
  }

  return (
    <Link
      href={href}
      className="block h-full focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#00CC9B]/50 rounded-[20px]"
    >
      {body}
    </Link>
  );
}

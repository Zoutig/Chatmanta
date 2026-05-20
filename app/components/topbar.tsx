'use client';

import Image from 'next/image';
import { Icon } from './svg-icons';
import { AnimatedThemeToggler } from './ui/animated-theme-toggler';
import { BotDropdown, type BotMeta } from './bot-dropdown';

export function Topbar({
  title,
  turnCount,
  botVersion,
  bots,
  rightOpen,
  onToggleRight,
  onOpenLeftDrawer,
  onOpenRightDrawer,
}: {
  title: string;
  turnCount: number;
  botVersion: string;
  bots: BotMeta[];
  rightOpen: boolean;
  onToggleRight: () => void;
  /** Mobile-only: opent linker sidebar als off-canvas drawer (<= 880px). */
  onOpenLeftDrawer?: () => void;
  /** Mobile-only: opent rechter panel als off-canvas drawer (<= 880px). */
  onOpenRightDrawer?: () => void;
}) {
  return (
    <div className="topbar">
      <div className="topbar-left">
        {onOpenLeftDrawer ? (
          <button
            type="button"
            aria-label="Menu openen"
            title="Menu"
            className="topbar-hamburger"
            onClick={onOpenLeftDrawer}
          >
            <Icon name="menu" size={18} />
          </button>
        ) : null}
        <div className="topbar-mark" aria-hidden="true">
          <Image src="/logo/mark.png" alt="" width={510} height={270} />
        </div>
        <div className="topbar-divider" aria-hidden="true" />
        <div className="topbar-title">{title}</div>
        {turnCount > 0 ? (
          <span className="topbar-meta">
            {turnCount} {turnCount === 1 ? 'turn' : 'turns'}
          </span>
        ) : null}
      </div>
      <div className="topbar-right">
        <BotDropdown current={botVersion} bots={bots} />
        <div style={{ width: 6 }} />
        <AnimatedThemeToggler />
        <button
          type="button"
          aria-pressed={rightOpen}
          aria-label={rightOpen ? 'Paneel inklappen' : 'Paneel uitklappen'}
          title={rightOpen ? 'Paneel inklappen' : 'Paneel uitklappen'}
          className={`icon-btn${rightOpen ? ' active' : ''}`}
          onClick={() => {
            // Op mobiel: open als drawer i.p.v. de classic-shell collapse-toggle.
            if (onOpenRightDrawer && typeof window !== 'undefined' &&
                window.matchMedia('(max-width: 880px)').matches) {
              onOpenRightDrawer();
            } else {
              onToggleRight();
            }
          }}
        >
          <Icon name="panel-right" size={16} />
        </button>
      </div>
    </div>
  );
}

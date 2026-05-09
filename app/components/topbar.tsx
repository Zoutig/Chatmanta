'use client';

import Image from 'next/image';
import { Icon } from './svg-icons';
import { ThemeSwitch } from './theme-switch';
import { BotDropdown, type BotMeta } from './bot-dropdown';

export function Topbar({
  title,
  turnCount,
  botVersion,
  bots,
  rightOpen,
  onToggleRight,
}: {
  title: string;
  turnCount: number;
  botVersion: string;
  bots: BotMeta[];
  rightOpen: boolean;
  onToggleRight: () => void;
}) {
  return (
    <div className="topbar">
      <div className="topbar-left">
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
        <ThemeSwitch />
        <button
          type="button"
          aria-pressed={rightOpen}
          aria-label={rightOpen ? 'Paneel inklappen' : 'Paneel uitklappen'}
          title={rightOpen ? 'Paneel inklappen' : 'Paneel uitklappen'}
          className={`icon-btn${rightOpen ? ' active' : ''}`}
          onClick={onToggleRight}
        >
          <Icon name="panel-right" size={16} />
        </button>
      </div>
    </div>
  );
}

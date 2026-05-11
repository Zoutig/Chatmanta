'use client';

import { Icon } from '../svg-icons';
import { ThemeSwitch } from '../theme-switch';
import { BotDropdown, type BotMeta } from '../bot-dropdown';

export function MantaTopbar({
  title,
  turnCount,
  botVersion,
  bots,
  rightOpen,
  onToggleRight,
  leftCollapsed,
  onToggleLeft,
}: {
  title: string;
  turnCount: number;
  botVersion: string;
  bots: BotMeta[];
  rightOpen: boolean;
  onToggleRight: () => void;
  leftCollapsed: boolean;
  onToggleLeft: () => void;
}) {
  return (
    <header className="manta-topbar">
      <div className="manta-topbar-left">
        {leftCollapsed ? (
          <button
            type="button"
            className="manta-topbar-icon-btn"
            onClick={onToggleLeft}
            title="Sidebar uitklappen"
            aria-label="Sidebar uitklappen"
          >
            <Icon name="panel-right" size={16} className="manta-icon-flip" />
          </button>
        ) : null}
        <span className="manta-topbar-title">{title}</span>
        {turnCount > 0 ? (
          <span className="manta-topbar-meta">
            · {turnCount} {turnCount === 1 ? 'turn' : 'turns'}
          </span>
        ) : null}
      </div>

      <div className="manta-topbar-right">
        <div className="manta-bot-pill">
          <BotDropdown current={botVersion} bots={bots} />
        </div>
        <ThemeSwitch />
        <button
          type="button"
          aria-pressed={rightOpen}
          aria-label={rightOpen ? 'Paneel inklappen' : 'Paneel uitklappen'}
          title={rightOpen ? 'Paneel inklappen' : 'Paneel uitklappen'}
          className={`manta-topbar-icon-btn${rightOpen ? ' active' : ''}`}
          onClick={onToggleRight}
        >
          <Icon name="panel-right" size={16} />
        </button>
      </div>
    </header>
  );
}

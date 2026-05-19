'use client';

// shadcn-style wrapper rond @radix-ui/react-select.
// Themed via onze bestaande CSS-vars (--bg-elev, --fg, --border-strong, --accent)
// zodat dropdowns automatisch meewisselen met de Dark/Light toggle.
// Gebruikt inline-style i.p.v. Tailwind classes — past bij de inline-style
// conventie in app/commandcenter (zie task-modal.tsx commentaar over Tailwind v4
// PostCSS-quirks).

import * as React from 'react';
import * as SelectPrimitive from '@radix-ui/react-select';
import { Icon } from '@/app/components/svg-icons';

export const Select = SelectPrimitive.Root;
export const SelectGroup = SelectPrimitive.Group;
export const SelectValue = SelectPrimitive.Value;

export const SelectTrigger = React.forwardRef<
  React.ElementRef<typeof SelectPrimitive.Trigger>,
  React.ComponentPropsWithoutRef<typeof SelectPrimitive.Trigger>
>(({ children, style, ...props }, ref) => (
  <SelectPrimitive.Trigger
    ref={ref}
    style={{
      width: '100%',
      display: 'inline-flex',
      alignItems: 'center',
      justifyContent: 'space-between',
      gap: 8,
      background: 'var(--surface-2)',
      border: '1px solid var(--border-strong)',
      borderRadius: 10,
      padding: '8px 12px',
      color: 'var(--fg)',
      fontSize: 14,
      outline: 'none',
      cursor: 'pointer',
      textAlign: 'left',
      ...style,
    }}
    {...props}
  >
    {children}
    <SelectPrimitive.Icon asChild>
      <span
        style={{
          display: 'inline-flex',
          color: 'var(--fg-muted)',
          transform: 'rotate(90deg)',
        }}
      >
        <Icon name="caret" size={12} />
      </span>
    </SelectPrimitive.Icon>
  </SelectPrimitive.Trigger>
));
SelectTrigger.displayName = 'SelectTrigger';

export const SelectContent = React.forwardRef<
  React.ElementRef<typeof SelectPrimitive.Content>,
  React.ComponentPropsWithoutRef<typeof SelectPrimitive.Content>
>(({ children, position = 'popper', style, ...props }, ref) => (
  <SelectPrimitive.Portal>
    <SelectPrimitive.Content
      ref={ref}
      position={position}
      sideOffset={4}
      style={{
        zIndex: 60,
        minWidth: 'var(--radix-select-trigger-width)',
        maxHeight: 'var(--radix-select-content-available-height)',
        background: 'var(--bg-elev)',
        border: '1px solid var(--border-strong)',
        borderRadius: 10,
        boxShadow: '0 16px 48px -16px rgba(0,0,0,0.45)',
        color: 'var(--fg)',
        overflow: 'hidden',
        ...style,
      }}
      {...props}
    >
      <SelectPrimitive.Viewport style={{ padding: 4 }}>
        {children}
      </SelectPrimitive.Viewport>
    </SelectPrimitive.Content>
  </SelectPrimitive.Portal>
));
SelectContent.displayName = 'SelectContent';

export const SelectItem = React.forwardRef<
  React.ElementRef<typeof SelectPrimitive.Item>,
  React.ComponentPropsWithoutRef<typeof SelectPrimitive.Item>
>(({ children, style, ...props }, ref) => (
  <SelectPrimitive.Item
    ref={ref}
    style={{
      position: 'relative',
      display: 'flex',
      alignItems: 'center',
      gap: 8,
      padding: '7px 10px 7px 10px',
      fontSize: 14,
      color: 'var(--fg)',
      borderRadius: 6,
      cursor: 'pointer',
      outline: 'none',
      userSelect: 'none',
      ...style,
    }}
    className="cc-select-item"
    {...props}
  >
    <SelectPrimitive.ItemText>{children}</SelectPrimitive.ItemText>
    <SelectPrimitive.ItemIndicator asChild>
      <span
        style={{
          marginLeft: 'auto',
          display: 'inline-flex',
          color: 'var(--accent)',
        }}
      >
        <Icon name="check" size={12} />
      </span>
    </SelectPrimitive.ItemIndicator>
  </SelectPrimitive.Item>
));
SelectItem.displayName = 'SelectItem';

/**
 * Globale styles voor focus/hover op SelectItem. Inline kan dat niet wegens
 * Radix' [data-highlighted] attribute — daarom een dunne CSS-injectie op
 * module-load.
 */
const STYLE_ID = 'cc-select-styles';
if (typeof document !== 'undefined' && !document.getElementById(STYLE_ID)) {
  const el = document.createElement('style');
  el.id = STYLE_ID;
  el.textContent = `
    .cc-select-item[data-highlighted] {
      background: var(--surface-3);
      outline: none;
    }
    .cc-select-item[data-state="checked"] {
      color: var(--accent);
    }
  `;
  document.head.appendChild(el);
}

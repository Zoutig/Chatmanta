// Shared logo-previews voor /klantendashboard.
//
// Drie varianten passend bij `WidgetSettings.logoStyle`:
//   - 'brand-mark'   → ChatManta-mark als gekleurde mask (mono-mark.png)
//   - 'chat-bubble'  → universeel chat-icoon
//   - 'custom-logo'  → klant-geüploade afbeelding (caller passes <img>)
//
// `WidgetLogo` is de high-level helper die het juiste component kiest op
// basis van de hele WidgetSettings — gebruik die als je de logica niet zelf
// wilt herhalen.

import type { CSSProperties } from 'react';

import type { WidgetSettings } from '@/lib/v0/klantendashboard/types';

export function MarkPreview({ color, size = 22 }: { color: string; size?: number }) {
  const width = Math.round(size * (36 / 22));
  return (
    <span
      style={{
        display: 'inline-block',
        width,
        height: size,
        backgroundColor: color,
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
  );
}

export function BubblePreview({ color, size = 26 }: { color: string; size?: number }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      aria-hidden="true"
    >
      <path
        d="M4 5.5C4 4.67 4.67 4 5.5 4h13c.83 0 1.5.67 1.5 1.5v9c0 .83-.67 1.5-1.5 1.5H9.5l-4 4v-4H5.5c-.83 0-1.5-.67-1.5-1.5v-9z"
        fill={color}
      />
    </svg>
  );
}

/**
 * Render de juiste logo-variant gebaseerd op `widget.logoStyle`. `size` slaat
 * op de pixel-hoogte; widgets met ronde "container" zijn typisch 24-32px.
 */
export function WidgetLogo({
  widget,
  size = 22,
  imgStyle,
}: {
  widget: WidgetSettings;
  size?: number;
  imgStyle?: CSSProperties;
}) {
  const color = widget.logoColor || widget.primaryColor;
  if (widget.logoStyle === 'custom-logo' && widget.customLogoDataUrl) {
    return (
      // eslint-disable-next-line @next/next/no-img-element
      <img
        src={widget.customLogoDataUrl}
        alt=""
        style={{
          width: size + 8,
          height: size + 8,
          objectFit: 'contain',
          borderRadius: 4,
          ...imgStyle,
        }}
      />
    );
  }
  if (widget.logoStyle === 'chat-bubble') {
    return <BubblePreview color={color} size={size + 4} />;
  }
  return <MarkPreview color={color} size={size} />;
}

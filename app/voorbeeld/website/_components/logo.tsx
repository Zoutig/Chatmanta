// Merkteken van het fictieve park: duin + golf in een cirkel.
export function DuinhoeveMark({ size = 40 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 48 48" aria-hidden="true" focusable="false">
      <circle cx="24" cy="24" r="23" fill="#1F3D36" />
      <circle cx="31" cy="17" r="5" fill="#E8C27E" />
      <path d="M4 30 C 12 22 20 26 26 24 S 38 18 44 24 L 44 30 Z" fill="#E3D2B0" />
      <path d="M5 34 q 5 -4 10 0 t 10 0 t 10 0 t 9 0" fill="none" stroke="#7FB8B5" strokeWidth="2.4" strokeLinecap="round" />
    </svg>
  );
}

export function DuinhoeveLogo() {
  return (
    <span className="dh-logo">
      <DuinhoeveMark />
      <span className="dh-logo-text">
        <span className="dh-logo-kicker">Vakantiepark</span>
        <span className="dh-logo-name">De Duinhoeve</span>
      </span>
    </span>
  );
}

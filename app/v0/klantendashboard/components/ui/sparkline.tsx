// Sparkline — kleine inline-SVG-trend uit een number[]. Server-component.
// Bij minder dan 2 punten of een vlakke reeks rendert hij een vlakke lijn
// onderaan (nette lege-staat zonder NaN's).

export function Sparkline({
  data,
  width = 160,
  height = 28,
  color = 'currentColor',
  fill = 'none',
  strokeWidth = 1.5,
}: {
  data: number[];
  width?: number;
  height?: number;
  color?: string;
  fill?: string;
  strokeWidth?: number;
}) {
  const series = data && data.length >= 2 ? data : [0, 0];
  const max = Math.max(...series);
  const min = Math.min(...series);
  const range = max - min || 1;
  const step = width / (series.length - 1);
  const pts = series.map(
    (v, i) => `${i * step},${height - ((v - min) / range) * (height - 4) - 2}`,
  );
  const d = `M${pts.join(' L')}`;
  const fillD = fill !== 'none' ? `${d} L${width},${height} L0,${height} Z` : null;

  return (
    <svg
      viewBox={`0 0 ${width} ${height}`}
      width={width}
      height={height}
      style={{ display: 'block', overflow: 'visible', maxWidth: '100%' }}
      aria-hidden="true"
    >
      {fillD && <path d={fillD} fill={fill} stroke="none" />}
      <path
        d={d}
        fill="none"
        stroke={color}
        strokeWidth={strokeWidth}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

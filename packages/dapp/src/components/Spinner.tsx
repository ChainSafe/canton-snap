interface SpinnerProps {
  size?: number;
  color?: string;
}

export function Spinner({ size = 64, color = '#00d4a4' }: SpinnerProps) {
  const r = size * 0.4375; // ~28 for size=64
  const cx = size / 2;

  return (
    <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} fill="none">
      <circle cx={cx} cy={cx} r={r} stroke="#252840" strokeWidth={size * 0.0625} />
      <path
        d={`M ${cx + r} ${cx} A ${r} ${r} 0 0 0 ${cx} ${cx - r}`}
        stroke={color}
        strokeWidth={size * 0.0625}
        strokeLinecap="round"
        className="spinner-ring"
      />
      <circle cx={cx} cy={cx} r={size * 0.0625} fill={color} />
    </svg>
  );
}

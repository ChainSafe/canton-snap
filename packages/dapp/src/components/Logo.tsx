export function Logo() {
  return (
    <svg width="32" height="32" viewBox="0 0 32 32" fill="none">
      <rect width="32" height="32" rx="8" fill="url(#logoGrad)"/>
      <path
        d="M10 16 L14 20 L22 12"
        stroke="#0a0b14"
        strokeWidth="2.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <defs>
        <linearGradient id="logoGrad" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%" stopColor="#00f0b8"/>
          <stop offset="100%" stopColor="#00d4a4"/>
        </linearGradient>
      </defs>
    </svg>
  );
}

export const TOKEN_COLORS: Record<string, { bg: string; text: string }> = {
  DEMO: { bg: "#00d4a4", text: "#0a0b14" },
  PROMPT: { bg: "#8b7cff", text: "#0a0b14" },
  USDCX: { bg: "#2775ca", text: "#ffffff" },
};

export const colors = {
  bg: "#0a0b14",
  bgCard: "#1a1d2e",
  bgCardEnd: "#12141f",
  bgCardActive: "#1e2238",
  bgCardActiveEnd: "#141729",
  bgSurface: "#12141f",
  bgInput: "#0a0b14",
  border: "#252840",
  borderMuted: "#353a5a",
  teal: "#00d4a4",
  tealBright: "#00f0b8",
  purple: "#8b7cff",
  amber: "#ffb84d",
  green: "#34d399",
  red: "#ff6b6b",
  textPrimary: "#f1f3f9",
  textSecondary: "#a1a6c4",
  textMuted: "#656a8a",
  textOnTeal: "#0a0b14",
} as const;

export const fonts = {
  sans: "'Inter', system-ui, sans-serif",
  mono: "'JetBrains Mono', monospace",
} as const;

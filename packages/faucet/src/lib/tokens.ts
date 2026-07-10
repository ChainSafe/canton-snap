// SPDX-License-Identifier: Apache-2.0

export const TOKEN_COLORS: Record<string, { bg: string; text: string }> = {
  DEMO: { bg: "#00d4a4", text: "#0a0b14" },
  PROMPT: { bg: "#8b7cff", text: "#0a0b14" },
  USDCX: { bg: "#2775ca", text: "#ffffff" },
};

export const FALLBACK_TOKEN_COLORS = { bg: "#656a8a", text: "#ffffff" } as const;

// SPDX-License-Identifier: Apache-2.0

import { TOKEN_COLORS, FALLBACK_TOKEN_COLORS } from "../lib/tokens";

interface TokenIconProps {
  symbol: string;
  size?: number;
}

export function TokenIcon({ symbol, size = 32 }: TokenIconProps) {
  const colors = TOKEN_COLORS[symbol.toUpperCase()] ?? FALLBACK_TOKEN_COLORS;
  return (
    <div
      aria-hidden="true"
      style={{
        width: size,
        height: size,
        borderRadius: "50%",
        background: colors.bg,
        color: colors.text,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        fontSize: Math.round(size * 0.41),
        fontWeight: 700,
        flexShrink: 0,
      }}
    >
      {symbol.charAt(0).toUpperCase()}
    </div>
  );
}

// SPDX-License-Identifier: Apache-2.0

import { useEffect, useState } from "react";

/**
 * Subscribe to a CSS media query and re-render when it starts/stops matching.
 * Mirrors the breakpoints used in the stylesheets so JS-driven UI (e.g. value
 * truncation) stays in sync with the CSS layout.
 */
export function useMediaQuery(query: string): boolean {
  const [matches, setMatches] = useState(() =>
    typeof window !== "undefined" ? window.matchMedia(query).matches : false,
  );

  useEffect(() => {
    const mql = window.matchMedia(query);
    const onChange = () => setMatches(mql.matches);
    onChange();
    mql.addEventListener("change", onChange);
    return () => mql.removeEventListener("change", onChange);
  }, [query]);

  return matches;
}

/**
 * Persistent snap state.
 *
 * Today the only thing we persist is the per-origin allowlist for silent
 * fingerprint reads. The first time an origin calls `canton_getFingerprint`
 * the user is prompted; once approved, future calls from that origin
 * return without a dialog.
 */

interface SnapState {
  fingerprintAllowedOrigins: string[];
}

const MAX_ALLOWED_ORIGINS = 200;

async function loadState(): Promise<SnapState> {
  const stored = (await snap.request({
    method: "snap_manageState",
    params: { operation: "get" },
  })) as Partial<SnapState> | null;
  return {
    fingerprintAllowedOrigins: stored?.fingerprintAllowedOrigins ?? [],
  };
}

async function saveState(state: SnapState): Promise<void> {
  await snap.request({
    method: "snap_manageState",
    params: {
      operation: "update",
      newState: state as unknown as Record<string, unknown>,
    },
  });
}

export async function isFingerprintOriginAllowed(origin: string): Promise<boolean> {
  const state = await loadState();
  return state.fingerprintAllowedOrigins.includes(origin);
}

export async function allowFingerprintOrigin(origin: string): Promise<void> {
  const state = await loadState();
  if (state.fingerprintAllowedOrigins.includes(origin)) return;
  // Bounded FIFO so a long-lived install can't grow the allowlist unbounded.
  if (state.fingerprintAllowedOrigins.length >= MAX_ALLOWED_ORIGINS) {
    state.fingerprintAllowedOrigins.shift();
  }
  state.fingerprintAllowedOrigins.push(origin);
  await saveState(state);
}


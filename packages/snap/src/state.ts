/**
 * Persistent snap state.
 *
 * Stores the per-(origin, keyIndex) allowlist for silent fingerprint
 * reads. The first time an origin asks for `canton_getFingerprint` at
 * a given keyIndex the user is prompted; once approved, that exact
 * (origin, keyIndex) pair returns silently. A second keyIndex from the
 * same origin requires a fresh consent dialog — origin-wide approval
 * would let a malicious caller enumerate every Canton identity the
 * user has derived under this snap.
 */

interface SnapState {
  // origin -> sorted list of approved keyIndexes.
  fingerprintAllowedOrigins: Record<string, number[]>;
}

const MAX_ALLOWED_ORIGINS = 200;
const MAX_KEYS_PER_ORIGIN = 32;

async function loadState(): Promise<SnapState> {
  const stored = (await snap.request({
    method: "snap_manageState",
    params: { operation: "get" },
  })) as Partial<SnapState> | null;
  const raw = stored?.fingerprintAllowedOrigins;
  // Defensive: an older schema where this was a `string[]` survives as
  // "no approvals" rather than crashing on access.
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) {
    return { fingerprintAllowedOrigins: {} };
  }
  return { fingerprintAllowedOrigins: raw };
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

export async function isFingerprintAllowed(origin: string, keyIndex: number): Promise<boolean> {
  const state = await loadState();
  const approved = state.fingerprintAllowedOrigins[origin];
  return Array.isArray(approved) && approved.includes(keyIndex);
}

export async function allowFingerprint(origin: string, keyIndex: number): Promise<void> {
  const state = await loadState();
  const origins = state.fingerprintAllowedOrigins;
  const existing = origins[origin] ?? [];
  if (existing.includes(keyIndex)) return;

  // Per-origin keyIndex cap.
  let next = existing;
  if (existing.length >= MAX_KEYS_PER_ORIGIN) {
    next = existing.slice(1);
  }
  next = [...next, keyIndex];

  // Global origin cap with FIFO eviction.
  if (!(origin in origins) && Object.keys(origins).length >= MAX_ALLOWED_ORIGINS) {
    const oldestOrigin = Object.keys(origins)[0];
    delete origins[oldestOrigin];
  }
  origins[origin] = next;
  await saveState(state);
}

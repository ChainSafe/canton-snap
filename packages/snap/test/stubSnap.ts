// SPDX-License-Identifier: Apache-2.0

/**
 * A stub for the Snap platform, so the RPC handler can be driven in vitest
 * without the MetaMask sandbox.
 *
 * Everything the Snap touches goes through `globalThis.snap.request`. Stubbing
 * that one function gives control of the entropy, captures the dialog tree
 * before it is approved, and provides persistent state. That makes it possible
 * to assert what the user is actually shown, and to pin the derivation against
 * a fixed entropy value rather than whatever the sandbox happens to seed.
 *
 * The jest suite covers the same ground through the real sandbox. These two
 * views are complementary: the stub proves the logic, the sandbox proves the
 * logic survives real serialisation.
 */

import { bytesToHex, utf8ToBytes } from "@noble/hashes/utils";
import { sha256 } from "@noble/hashes/sha2";

export { texts, copyables, types } from "./jsxWalk.js";

/** Entropy fixed across a test run, so derivation outputs are reproducible. */
export const FIXED_ENTROPY = "0x" + "11".repeat(32);

export interface DialogCapture {
  /** The JSX tree passed to snap_dialog, as the user would see it. */
  content: unknown;
  /** The dialog type, always "confirmation" for this Snap. */
  type: string;
}

export interface StubOptions {
  /**
   * What snap_getEntropy returns.
   *
   * A string returns that entropy for every salt, which is what the golden
   * derivation constants are pinned against: one known entropy in, one known
   * identity out. Real entropy is salt-scoped, so pass `saltedEntropy` (or any
   * function of the salt) when a test needs two key indices to differ.
   */
  entropy?: string | ((salt: string) => string);
  /** What the user does at each dialog. Defaults to approving everything. */
  approve?: boolean;
  /** Initial persistent state, for testing state-dependence. */
  state?: Record<string, unknown> | null;
}

export interface Stub {
  /** Every dialog shown, in order. */
  dialogs: DialogCapture[];
  /** Every snap_getEntropy params object, in order. */
  entropyRequests: unknown[];
  /** Current persistent state. */
  state: Record<string, unknown> | null;
  /** The most recent dialog, or undefined when none has been shown. */
  lastDialog(): DialogCapture | undefined;
  /** Restore whatever was on globalThis before install(). */
  restore(): void;
}

/**
 * Install the stub on globalThis and return a handle to what it captured.
 *
 * Call restore() in afterEach, or a later test inherits this one's state.
 *
 * @param options Behaviour overrides.
 * @returns The capture handle.
 */
export function installStub(options: StubOptions = {}): Stub {
  const entropySource = options.entropy ?? FIXED_ENTROPY;
  const entropyFor = (salt: string) =>
    typeof entropySource === "function" ? entropySource(salt) : entropySource;
  const approve = options.approve ?? true;

  const stub: Stub = {
    dialogs: [],
    entropyRequests: [],
    state: options.state ?? null,
    lastDialog() {
      return this.dialogs[this.dialogs.length - 1];
    },
    restore() {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      delete (globalThis as any).snap;
    },
  };

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  (globalThis as any).snap = {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    request: async ({ method, params }: any) => {
      switch (method) {
        case "snap_getEntropy":
          stub.entropyRequests.push(params);
          return entropyFor(String(params?.salt ?? ""));

        case "snap_dialog":
          stub.dialogs.push({ content: params.content, type: params.type });
          return approve;

        case "snap_manageState":
          if (params.operation === "get") return stub.state;
          if (params.operation === "update") {
            stub.state = params.newState;
            return null;
          }
          if (params.operation === "clear") {
            stub.state = null;
            return null;
          }
          throw new Error(`stub: unhandled snap_manageState operation ${params.operation}`);

        default:
          throw new Error(`stub: unhandled snap method ${method}`);
      }
    },
  };

  return stub;
}

/**
 * Salt-scoped entropy, mimicking the real snap_getEntropy.
 *
 * The platform derives entropy per (snap id, salt), so two key indices get
 * different entropy. The fixed-string default does not model that, which is
 * deliberate for pinning, but any test about key indices differing needs this.
 *
 * @param seed Hex seed mixed with the salt.
 * @returns A function from salt to hex entropy.
 */
export function saltedEntropy(seed: string = FIXED_ENTROPY): (salt: string) => string {
  return (salt: string) =>
    "0x" + bytesToHex(sha256(utf8ToBytes(seed + "|" + salt)));
}

/**
 * Hex-encode bytes, matching how the Snap returns key material.
 *
 * @param b Bytes to encode.
 * @returns Lowercase hex, no prefix.
 */
export function hex(b: Uint8Array): string {
  return bytesToHex(b);
}

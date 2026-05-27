// SPDX-License-Identifier: Apache-2.0

import { useCallback, useEffect, useState } from "react";
import { watchAsset } from "../lib/ethereum";
import { ensureChainAdded } from "../lib/network";
import type { NetworkConfig } from "../lib/config";
import type { TokenConfig } from "../lib/middleware";

export type ImportStatus = "idle" | "pending" | "success" | "error";

export interface TokenImportState {
  status: ImportStatus;
  error?: string;
}

interface State {
  tokens: Record<string, TokenImportState>;
}

// MetaMask has no API to query previously watched assets, so we mirror the
// successful imports in localStorage to remember the ✓ state across refreshes.
// Keyed by (account, network) so different MM accounts don't share success
// state — the watched-asset list itself is also per-account in MetaMask.
const STORAGE_KEY = "canton-mm-imports:v1";

type PersistedShape = Record<string, Record<string, string[]>>; // address → networkId → tokenAddresses

function persistedKey(address: string) {
  return address.toLowerCase();
}

function loadPersisted(address: string, networkId: string): Set<string> {
  if (!address) return new Set();
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return new Set();
    // `JSON.parse("null")` is valid and returns null — fall back to {} so the
    // downstream property access doesn't throw.
    const parsed = (JSON.parse(raw) || {}) as PersistedShape;
    return new Set(parsed[persistedKey(address)]?.[networkId] ?? []);
  } catch {
    return new Set();
  }
}

function savePersisted(address: string, networkId: string, set: Set<string>): void {
  if (!address) return;
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    const parsed: PersistedShape = (raw ? JSON.parse(raw) : null) || {};
    const key = persistedKey(address);
    parsed[key] = { ...(parsed[key] ?? {}), [networkId]: Array.from(set) };
    localStorage.setItem(STORAGE_KEY, JSON.stringify(parsed));
  } catch {
    // quota exhausted / storage disabled — fail silently
  }
}

function hydrate(address: string, networkId: string): State {
  const tokens: Record<string, TokenImportState> = {};
  for (const addr of loadPersisted(address, networkId)) {
    tokens[addr] = { status: "success" };
  }
  return { tokens };
}

function isUserRejection(err: unknown): boolean {
  const e = err as { code?: number; message?: string };
  return e?.code === 4001 || /reject/i.test(e?.message ?? "");
}

function formatError(err: unknown): string {
  if (isUserRejection(err)) return "Rejected in MetaMask";
  return (err as Error)?.message ?? String(err);
}

export function useMetaMaskImport(network: NetworkConfig, address: string) {
  const [state, setState] = useState<State>(() => hydrate(address, network.id));

  // Re-hydrate when the account or network changes.
  useEffect(() => {
    setState(hydrate(address, network.id));
  }, [address, network.id]);

  const importToken = useCallback(
    async (token: TokenConfig): Promise<boolean> => {
      const persisted = loadPersisted(address, network.id);
      const wasAlreadyImported = persisted.has(token.address);

      setState((s) => ({
        tokens: { ...s.tokens, [token.address]: { status: "pending" } },
      }));

      try {
        await ensureChainAdded(network);
        const added = await watchAsset({
          address: token.address,
          symbol: token.symbol,
          decimals: token.decimals,
        });

        if (added) {
          persisted.add(token.address);
          savePersisted(address, network.id, persisted);
          setState((s) => ({
            tokens: { ...s.tokens, [token.address]: { status: "success" } },
          }));
          return true;
        }

        // MetaMask returned false (dismissed without adding). If the token was
        // previously imported, keep the ✓ state — don't surface a false error.
        if (wasAlreadyImported) {
          setState((s) => ({
            tokens: { ...s.tokens, [token.address]: { status: "success" } },
          }));
          return false;
        }
        setState((s) => ({
          tokens: {
            ...s.tokens,
            [token.address]: { status: "error", error: "Not added" },
          },
        }));
        return false;
      } catch (err) {
        // On rejection or RPC failure, don't downgrade a previously-successful import.
        if (wasAlreadyImported) {
          setState((s) => ({
            tokens: { ...s.tokens, [token.address]: { status: "success" } },
          }));
          return false;
        }
        setState((s) => ({
          tokens: {
            ...s.tokens,
            [token.address]: { status: "error", error: formatError(err) },
          },
        }));
        return false;
      }
    },
    [address, network],
  );

  return {
    tokenStates: state.tokens,
    importToken,
  };
}

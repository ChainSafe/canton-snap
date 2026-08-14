// SPDX-License-Identifier: Apache-2.0

import { useCallback, useEffect, useState } from "react";
import { isUserRejection, watchAsset } from "../lib/ethereum";
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

function formatError(err: unknown): string {
  if (isUserRejection(err)) return "Rejected in MetaMask";
  return (err as Error)?.message ?? String(err);
}

export function useMetaMaskImport(network: NetworkConfig, address: string) {
  const [state, setState] = useState<State>(() => hydrate(address, network.id));
  const [importingAll, setImportingAll] = useState(false);

  // Re-hydrate when the account or network changes.
  useEffect(() => {
    setState(hydrate(address, network.id));
  }, [address, network.id]);

  const importToken = useCallback(
    // `skipEnsureChain` lets importAll switch the chain once up front and then
    // fire the per-token suggestions concurrently — without each call racing to
    // re-check/switch the chain, which would stagger the watchAsset requests and
    // defeat MetaMask's batching (see importAll).
    async (token: TokenConfig, opts?: { skipEnsureChain?: boolean }): Promise<boolean> => {
      const persisted = loadPersisted(address, network.id);
      const wasAlreadyImported = persisted.has(token.address);

      setState((s) => ({
        tokens: { ...s.tokens, [token.address]: { status: "pending" } },
      }));

      try {
        if (!opts?.skipEnsureChain) await ensureChainAdded(network);
        const added = await watchAsset({
          address: token.address,
          symbol: token.symbol,
          decimals: token.decimals,
        });

        if (added) {
          // Re-read the latest set at write time, then union. importAll fires
          // several imports concurrently (one batched MetaMask prompt); each
          // success handler must merge onto the others' writes rather than
          // overwrite from the snapshot taken before the prompt — otherwise the
          // last writer wins and only one token ends up persisted.
          const latest = loadPersisted(address, network.id);
          latest.add(token.address);
          savePersisted(address, network.id, latest);
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

  // Import every token in one click — and in ONE MetaMask prompt. MetaMask
  // aggregates wallet_watchAsset requests that are pending simultaneously into a
  // single "add suggested tokens" screen listing every token. So we switch the
  // chain once up front (its own prompt), then fire all the suggestions
  // concurrently (skipEnsureChain so they aren't staggered by per-token chain
  // checks). Awaiting them sequentially — as a naive loop would — keeps only one
  // pending at a time and produces one popup per token instead.
  const importAll = useCallback(
    async (tokens: TokenConfig[]): Promise<void> => {
      if (!address || tokens.length === 0) return;
      setImportingAll(true);
      try {
        // Switch the chain once up front. If this fails (e.g. the user rejects
        // the switch), abort — we can't add tokens to the wrong chain, and
        // continuing would fire a concurrent chain-switch prompt per token.
        // Succeeding here lets us pass skipEnsureChain to every importToken so
        // the watchAsset requests fire together and MetaMask batches them.
        try {
          await ensureChainAdded(network);
        } catch {
          return;
        }

        const persisted = loadPersisted(address, network.id);
        const pending = tokens.filter((t) => !persisted.has(t.address));
        const already = tokens.filter((t) => persisted.has(t.address));

        // Reflect already-imported tokens as ✓ without re-prompting for them.
        if (already.length > 0) {
          setState((s) => ({
            tokens: {
              ...s.tokens,
              ...Object.fromEntries(
                already.map((t) => [t.address, { status: "success" as const }]),
              ),
            },
          }));
        }

        await Promise.all(pending.map((t) => importToken(t, { skipEnsureChain: true })));
      } finally {
        setImportingAll(false);
      }
    },
    [address, network, importToken],
  );

  return {
    tokenStates: state.tokens,
    importToken,
    importAll,
    importingAll,
  };
}

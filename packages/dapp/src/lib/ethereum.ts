// SPDX-License-Identifier: Apache-2.0

import { getAddress } from "ethers";

const PUBLISHED_SNAP_ID = "npm:@chainsafe/canton-snap";
const PUBLISHED_SNAP_VERSION = "^0.2.0";

export const SNAP_ID = import.meta.env.VITE_SNAP_ID ?? PUBLISHED_SNAP_ID;
const SNAP_VERSION = SNAP_ID.startsWith("npm:") ? PUBLISHED_SNAP_VERSION : undefined;

declare global {
  interface Window {
    ethereum?: {
      request: (args: { method: string; params?: unknown }) => Promise<unknown>;
    };
  }
}

export function getEthereum() {
  if (!window.ethereum) throw new Error("MetaMask not found. Install MetaMask.");
  return window.ethereum;
}

export function toHex(str: string) {
  return (
    "0x" +
    Array.from(new TextEncoder().encode(str))
      .map((b) => b.toString(16).padStart(2, "0"))
      .join("")
  );
}

export async function requestAccounts(): Promise<string[]> {
  return getEthereum().request({ method: "eth_requestAccounts" }) as Promise<string[]>;
}

export async function getAccounts(): Promise<string[]> {
  return getEthereum().request({ method: "eth_accounts" }) as Promise<string[]>;
}

export async function personalSign(message: string, address: string): Promise<string> {
  return getEthereum().request({
    method: "personal_sign",
    params: [toHex(message), address],
  }) as Promise<string>;
}

export async function installSnap(): Promise<void> {
  await getEthereum().request({
    method: "wallet_requestSnaps",
    params: { [SNAP_ID]: SNAP_VERSION ? { version: SNAP_VERSION } : {} },
  });
}

export async function getInstalledSnap(): Promise<{ version: string } | null> {
  try {
    const snaps = (await getEthereum().request({ method: "wallet_getSnaps" })) as Record<
      string,
      { version: string }
    >;
    return snaps[SNAP_ID] ?? null;
  } catch {
    return null;
  }
}

export async function invokeSnap<T>(method: string, params: unknown): Promise<T> {
  return getEthereum().request({
    method: "wallet_invokeSnap",
    params: { snapId: SNAP_ID, request: { method, params } },
  }) as Promise<T>;
}

export async function addEthChain(params: {
  chainId: string;
  chainName: string;
  rpcUrls: string[];
  nativeCurrency: { name: string; symbol: string; decimals: number };
}): Promise<void> {
  await getEthereum().request({ method: "wallet_addEthereumChain", params: [params] });
}

export async function switchEthChain(chainId: string): Promise<void> {
  await getEthereum().request({
    method: "wallet_switchEthereumChain",
    params: [{ chainId }],
  });
}

export async function watchAsset(params: {
  address: string;
  symbol: string;
  decimals: number;
  image?: string;
}): Promise<boolean> {
  const result = (await getEthereum().request({
    method: "wallet_watchAsset",
    params: { type: "ERC20", options: params },
  })) as boolean;
  return result;
}

export async function sendEthTransaction(params: {
  from: string;
  to: string;
  data: string;
}): Promise<string> {
  return getEthereum().request({
    method: "eth_sendTransaction",
    params: [{ ...params, value: "0x0" }],
  }) as Promise<string>;
}

// EIP-1193 userRejectedRequest — the user dismissed a MetaMask prompt.
export function isUserRejection(err: unknown): boolean {
  return typeof err === "object" && err !== null && (err as { code?: unknown }).code === 4001;
}

export function shortenAddress(address: string, chars = 4): string {
  return `${address.slice(0, chars + 2)}…${address.slice(-chars)}`;
}

export function toChecksumAddress(address: string): string {
  try {
    return getAddress(address);
  } catch {
    return address;
  }
}

export const SNAP_ID = `local:http://localhost:${import.meta.env.VITE_SNAP_PORT ?? 8080}`;

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
    params: { [SNAP_ID]: {} },
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

export function shortenAddress(address: string, chars = 4): string {
  return `${address.slice(0, chars + 2)}…${address.slice(-chars)}`;
}

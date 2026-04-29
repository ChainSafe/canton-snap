import { useState, useCallback, useEffect } from "react";
import { requestAccounts, getAccounts } from "../lib/ethereum";

export interface MetaMaskState {
  detected: boolean;
  address: string | null;
  connecting: boolean;
  autoConnecting: boolean;
  error: string | null;
  connect: () => Promise<string | null>;
  disconnect: () => void;
}

export function useMetaMask(): MetaMaskState {
  const [detected] = useState(() => !!window.ethereum);
  const [address, setAddress] = useState<string | null>(null);
  const [connecting, setConnecting] = useState(false);
  // Start as true only when MetaMask is present; no need for a synchronous setState later.
  const [autoConnecting, setAutoConnecting] = useState(() => !!window.ethereum);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!window.ethereum) return; // already false from lazy initializer
    getAccounts()
      .then((accounts) => {
        if (accounts[0]) setAddress(accounts[0]);
      })
      .catch(() => {})
      .finally(() => setAutoConnecting(false));
  }, []);

  const connect = useCallback(async (): Promise<string | null> => {
    setConnecting(true);
    setError(null);
    try {
      const accounts = await requestAccounts();
      const addr = accounts[0] ?? null;
      setAddress(addr);
      return addr;
    } catch (e) {
      setError((e as Error).message);
      return null;
    } finally {
      setConnecting(false);
    }
  }, []);

  const disconnect = useCallback(() => {
    setAddress(null);
  }, []);

  return { detected, address, autoConnecting, connecting, error, connect, disconnect };
}

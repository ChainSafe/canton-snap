import { useState, useCallback } from "react";
import { requestAccounts } from "../lib/ethereum";

export interface MetaMaskState {
  detected: boolean;
  address: string | null;
  connecting: boolean;
  error: string | null;
  connect: () => Promise<void>;
  disconnect: () => void;
}

export function useMetaMask(): MetaMaskState {
  const [detected] = useState(() => !!window.ethereum);
  const [address, setAddress] = useState<string | null>(null);
  const [connecting, setConnecting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const connect = useCallback(async () => {
    setConnecting(true);
    setError(null);
    try {
      const accounts = await requestAccounts();
      setAddress(accounts[0] ?? null);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setConnecting(false);
    }
  }, []);

  const disconnect = useCallback(() => {
    setAddress(null);
  }, []);

  return { detected, address, connecting, error, connect, disconnect };
}

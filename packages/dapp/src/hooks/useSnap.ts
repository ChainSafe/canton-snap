import { useState, useEffect, useCallback } from 'react';
import { installSnap, isSnapInstalled, invokeSnap } from '../lib/ethereum';

export interface SnapPublicKey {
  compressedPubKey: string;
  fingerprint: string;
  spkiDer: string;
}

export interface SnapState {
  installed: boolean;
  alreadyInstalled: boolean;
  installing: boolean;
  error: string | null;
  install: () => Promise<boolean>;
  getPublicKey: (keyIndex?: number) => Promise<SnapPublicKey>;
  signTopology: (hash: string) => Promise<string>;
}

export function useSnap(): SnapState {
  const [installed, setInstalled] = useState(false);
  const [alreadyInstalled, setAlreadyInstalled] = useState(false);
  const [installing, setInstalling] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Check if snap was installed from a previous session
  useEffect(() => {
    isSnapInstalled().then((found) => {
      if (found) {
        setInstalled(true);
        setAlreadyInstalled(true);
      }
    });
  }, []);

  const install = useCallback(async (): Promise<boolean> => {
    setInstalling(true);
    setError(null);
    try {
      await installSnap();
      setInstalled(true);
      return true;
    } catch (e) {
      setError((e as Error).message);
      return false;
    } finally {
      setInstalling(false);
    }
  }, []);

  const getPublicKey = useCallback(async (keyIndex = 0): Promise<SnapPublicKey> => {
    return invokeSnap<SnapPublicKey>('canton_getPublicKey', { keyIndex });
  }, []);

  const signTopology = useCallback(async (hash: string): Promise<string> => {
    const result = await invokeSnap<{ derSignature: string }>('canton_signTopology', { hash });
    return result.derSignature;
  }, []);

  return { installed, alreadyInstalled, installing, error, install, getPublicKey, signTopology };
}

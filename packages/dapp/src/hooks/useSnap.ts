import { useState, useEffect, useCallback } from "react";
import { sha256, getBytes } from "ethers";
import { installSnap, getInstalledSnap, invokeSnap } from "../lib/ethereum";

export interface SnapPublicKey {
  compressedPubKey: string;
  fingerprint: string;
  spkiDer: string;
}

export interface SignHashMetadata {
  operation: string;
  tokenSymbol: string;
  amount: string;
  recipient?: string;
  sender?: string;
}

export interface SignHashResult {
  derSignature: string;
  fingerprint: string;
}

export interface SnapState {
  installed: boolean;
  alreadyInstalled: boolean;
  installing: boolean;
  version: string | null;
  error: string | null;
  install: () => Promise<boolean>;
  getPublicKey: (keyIndex?: number) => Promise<SnapPublicKey>;
  signTopology: (hash: string) => Promise<string>;
  signHash: (hash: string, metadata?: SignHashMetadata) => Promise<SignHashResult>;
}

export function useSnap(): SnapState {
  const [installed, setInstalled] = useState(false);
  const [alreadyInstalled, setAlreadyInstalled] = useState(false);
  const [installing, setInstalling] = useState(false);
  const [version, setVersion] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  // Check if snap was installed from a previous session
  useEffect(() => {
    getInstalledSnap().then((snap) => {
      if (snap) {
        setInstalled(true);
        setAlreadyInstalled(true);
        setVersion(snap.version);
      }
    });
  }, []);

  const install = useCallback(async (): Promise<boolean> => {
    setInstalling(true);
    setError(null);
    try {
      await installSnap();
      setInstalled(true);
      getInstalledSnap().then((snap) => {
        if (snap) setVersion(snap.version);
      });
      return true;
    } catch (e) {
      setError((e as Error).message);
      return false;
    } finally {
      setInstalling(false);
    }
  }, []);

  const getPublicKey = useCallback(async (keyIndex = 0): Promise<SnapPublicKey> => {
    return invokeSnap<SnapPublicKey>("canton_getPublicKey", { keyIndex });
  }, []);

  const signTopology = useCallback(async (hash: string): Promise<string> => {
    const result = await invokeSnap<{ derSignature: string }>("canton_signTopology", { hash });
    return result.derSignature;
  }, []);

  const signHash = useCallback(
    async (hash: string, metadata?: SignHashMetadata): Promise<SignHashResult> => {
      // Canton returns a multihash from PrepareSubmission. Match Go's keys.SignDER:
      // sha256 the raw multihash bytes so the snap signs the correct 32-byte digest.
      const digest = sha256(getBytes(hash));
      return invokeSnap<SignHashResult>("canton_signHash", { hash: digest, metadata });
    },
    [],
  );

  return {
    installed,
    alreadyInstalled,
    installing,
    version,
    error,
    install,
    getPublicKey,
    signTopology,
    signHash,
  };
}

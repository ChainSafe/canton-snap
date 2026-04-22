import { useState, useCallback } from 'react';
import { personalSign } from '../lib/ethereum';
import {
  AlreadyRegisteredError,
  registerCustodial as apiRegisterCustodial,
  prepareTopology,
  registerNonCustodial,
} from '../lib/middleware';
import { useSnap } from './useSnap';

export interface RegistrationResult {
  cantonPartyId: string;
  fingerprint: string;
}

export interface UseRegistrationReturn {
  snap: ReturnType<typeof useSnap>;
  pending: boolean;
  error: string | null;
  wasAlreadyRegistered: boolean;
  alreadyRegistered: RegistrationResult | null;
  result: RegistrationResult | null;
  registerCustodial: (address: string) => Promise<boolean>;
  sign: (address: string) => Promise<boolean>;
  clearError: () => void;
}

export function useRegistration(middlewareUrl: string): UseRegistrationReturn {
  const snap = useSnap();
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [wasAlreadyRegistered, setWasAlreadyRegistered] = useState(false);
  const [alreadyRegistered, setAlreadyRegistered] = useState<RegistrationResult | null>(null);
  const [result, setResult] = useState<RegistrationResult | null>(null);

  const registerCustodial = useCallback(async (address: string): Promise<boolean> => {
    setPending(true);
    setError(null);
    try {
      const message = `register:${Math.floor(Date.now() / 1000)}`;
      const signature = await personalSign(message, address);
      const data = await apiRegisterCustodial(middlewareUrl, signature, message);
      setResult({ cantonPartyId: data.canton_party_id, fingerprint: data.fingerprint });
      return true;
    } catch (e) {
      if (e instanceof AlreadyRegisteredError) {
        setWasAlreadyRegistered(true);
        setAlreadyRegistered(parseRegistered(e.details));
        return true;
      }
      setError((e as Error).message);
      return false;
    } finally {
      setPending(false);
    }
  }, [middlewareUrl]);

  const sign = useCallback(async (address: string): Promise<boolean> => {
    setPending(true);
    setError(null);
    try {
      const { compressedPubKey } = await snap.getPublicKey(0);
      const message = `register:${Math.floor(Date.now() / 1000)}`;
      const signature = await personalSign(message, address);
      const { topology_hash, registration_token } = await prepareTopology(
        middlewareUrl,
        signature,
        message,
        compressedPubKey,
      );
      const topologySignature = await snap.signTopology(topology_hash);
      const data = await registerNonCustodial(middlewareUrl, {
        signature,
        message,
        canton_public_key: compressedPubKey,
        registration_token,
        topology_signature: topologySignature,
      });
      setResult({ cantonPartyId: data.canton_party_id, fingerprint: data.fingerprint });
      return true;
    } catch (e) {
      if (e instanceof AlreadyRegisteredError) {
        setWasAlreadyRegistered(true);
        setAlreadyRegistered(parseRegistered(e.details));
        return true;
      }
      setError((e as Error).message);
      return false;
    } finally {
      setPending(false);
    }
  }, [middlewareUrl, snap]);

  const clearError = useCallback(() => setError(null), []);

  return { snap, pending, error, wasAlreadyRegistered, alreadyRegistered, result, registerCustodial, sign, clearError };
}

function parseRegistered(details: string): RegistrationResult | null {
  try {
    const p = JSON.parse(details);
    if (p.canton_party_id) {
      return { cantonPartyId: p.canton_party_id, fingerprint: p.fingerprint ?? '' };
    }
  } catch {
    // not JSON
  }
  return null;
}

export interface GetPublicKeyParams {
  keyIndex?: number;
}

export interface SignHashParams {
  hash: string;
  keyIndex?: number;
  metadata?: SignHashMetadata;
}

export interface SignHashMetadata {
  operation: string;
  tokenSymbol: string;
  amount: string;
  recipient?: string;
  sender?: string;
}

export interface SignTopologyParams {
  hash: string;
  keyIndex?: number;
}

export interface GetFingerprintParams {
  keyIndex?: number;
}

export interface GetPublicKeyResponse {
  compressedPubKey: string;
  spkiDer: string;
  fingerprint: string;
}

export interface SignResponse {
  derSignature: string;
  fingerprint: string;
}

export interface GetFingerprintResponse {
  fingerprint: string;
}

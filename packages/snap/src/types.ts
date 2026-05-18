export interface GetPublicKeyParams {
  keyIndex?: number;
}

export interface SignHashParams {
  keyIndex?: number;
  preparedTransaction: PreparedTransaction;
}

export interface SignHashMetadata {
  operation: string;
  tokenSymbol: string;
  amount: string;
  recipient?: string;
  sender?: string;
}

export interface PreparedTransaction extends SignHashMetadata {
  schema: "canton-snap.prepared-transaction.v1";
  transactionHash: string;
  details?: Record<string, string>;
  network?: string;
  transferId?: string;
  expiresAt?: string;
  partyId?: string;
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

import { personalSign } from "./ethereum";
import { friendlyError } from "./middleware";

export interface PrepareResult {
  transferId: string;
  transactionHash: string;
  partyId: string;
  expiresAt: string;
  preparedTransaction: PreparedTransaction;
}

export interface PreparedTransaction {
  schema: "canton-snap.prepared-transaction.v1";
  transactionHash: string;
  operation: string;
  tokenSymbol: string;
  amount: string;
  details?: Record<string, string>;
  recipient?: string;
  sender?: string;
  network?: string;
  transferId?: string;
  expiresAt?: string;
  partyId?: string;
}

// Server-truncated party identifiers (e.g. `user_2dA…4680b7ec`). The endpoint
// is unauthenticated, so the middleware redacts the fingerprint portion of the
// party id; the truncated form is sufficient for the dapp to disambiguate
// offers in the UI and to display "From <short>" without leaking enough to
// enumerate counterparties.
export interface IncomingTransfer {
  contractId: string;
  senderPartyId: string;
  receiverPartyId: string;
  amount: string;
  instrumentAdmin: string;
  instrumentId: string;
  symbol?: string;
  decimals?: number;
  name?: string;
  contractAddress?: string;
}

async function makeAuthHeaders(
  address: string,
  prefix: "transfer" | "prepare-accept" | "execute-accept" = "transfer",
): Promise<Record<string, string>> {
  const message = `${prefix}:${Math.floor(Date.now() / 1000)}`;
  const signature = await personalSign(message, address);
  return { "X-Signature": signature, "X-Message": message };
}

export async function prepareTransfer(
  baseUrl: string,
  address: string,
  to: string,
  token: string,
  amount: string,
): Promise<PrepareResult> {
  const authHeaders = await makeAuthHeaders(address);
  const res = await fetch(`${baseUrl}/api/v2/transfer/prepare`, {
    method: "POST",
    headers: { "Content-Type": "application/json", ...authHeaders },
    body: JSON.stringify({ to, amount, token }),
  });
  if (!res.ok) throw new Error(friendlyError(res.status, await res.text()));
  const data = await res.json();
  const preparedTransaction = requirePreparedTransaction(data.prepared_transaction);
  return {
    transferId: data.transfer_id as string,
    transactionHash: preparedTransaction.transactionHash,
    partyId: data.party_id as string,
    expiresAt: data.expires_at as string,
    preparedTransaction,
  };
}

export async function executeTransfer(
  baseUrl: string,
  address: string,
  transferId: string,
  signature: string,
  signedBy: string,
): Promise<void> {
  const authHeaders = await makeAuthHeaders(address);
  const res = await fetch(`${baseUrl}/api/v2/transfer/execute`, {
    method: "POST",
    headers: { "Content-Type": "application/json", ...authHeaders },
    body: JSON.stringify({ transfer_id: transferId, signature, signed_by: signedBy }),
  });
  if (!res.ok) throw new Error(friendlyError(res.status, await res.text()));
}

// GET /api/v2/transfer/incoming?address=<addr>. Unauthenticated.
export async function listIncomingTransfers(
  baseUrl: string,
  address: string,
): Promise<IncomingTransfer[]> {
  const url = new URL(`${baseUrl}/api/v2/transfer/incoming`);
  url.searchParams.set("address", address);
  const res = await fetch(url.toString());
  if (!res.ok) throw new Error(friendlyError(res.status, await res.text()));
  const data = (await res.json()) as {
    items: Array<{
      contract_id: string;
      sender_party_id: string;
      receiver_party_id: string;
      amount: string;
      instrument_admin: string;
      instrument_id: string;
      symbol?: string;
      decimals?: number;
      name?: string;
      contract_address?: string;
    }>;
  };
  return (data.items ?? []).map((o) => ({
    contractId: o.contract_id,
    senderPartyId: o.sender_party_id,
    receiverPartyId: o.receiver_party_id,
    amount: o.amount,
    instrumentAdmin: o.instrument_admin,
    instrumentId: o.instrument_id,
    symbol: o.symbol,
    decimals: o.decimals,
    name: o.name,
    contractAddress: o.contract_address,
  }));
}

export async function prepareAcceptTransfer(
  baseUrl: string,
  address: string,
  contractId: string,
  instrumentAdmin: string,
): Promise<PrepareResult> {
  const authHeaders = await makeAuthHeaders(address, "prepare-accept");
  const res = await fetch(
    `${baseUrl}/api/v2/transfer/incoming/${encodeURIComponent(contractId)}/prepare`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json", ...authHeaders },
      body: JSON.stringify({ instrument_admin: instrumentAdmin }),
    },
  );
  if (!res.ok) throw new Error(friendlyError(res.status, await res.text()));
  const data = await res.json();
  const preparedTransaction = requirePreparedTransaction(data.prepared_transaction);
  return {
    transferId: data.transfer_id as string,
    transactionHash: preparedTransaction.transactionHash,
    partyId: data.party_id as string,
    expiresAt: data.expires_at as string,
    preparedTransaction,
  };
}

export async function executeAcceptTransfer(
  baseUrl: string,
  address: string,
  contractId: string,
  transferId: string,
  signature: string,
  signedBy: string,
): Promise<void> {
  const authHeaders = await makeAuthHeaders(address, "execute-accept");
  const res = await fetch(
    `${baseUrl}/api/v2/transfer/incoming/${encodeURIComponent(contractId)}/execute`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json", ...authHeaders },
      body: JSON.stringify({ transfer_id: transferId, signature, signed_by: signedBy }),
    },
  );
  if (!res.ok) throw new Error(friendlyError(res.status, await res.text()));
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function requireString(record: Record<string, unknown>, field: string): string {
  const value = record[field];
  if (typeof value !== "string" || value.length === 0) {
    throw new Error(`Middleware returned invalid prepared_transaction.${field}`);
  }
  return value;
}

function optionalString(record: Record<string, unknown>, field: string): string | undefined {
  const value = record[field];
  if (value === undefined) return undefined;
  if (typeof value !== "string") {
    throw new Error(`Middleware returned invalid prepared_transaction.${field}`);
  }
  return value;
}

function requirePreparedTransaction(value: unknown): PreparedTransaction {
  if (!isRecord(value)) {
    throw new Error(
      "Middleware did not return a secure prepared_transaction envelope; update canton-middleware before using snap signing.",
    );
  }
  if (value.schema !== "canton-snap.prepared-transaction.v1") {
    throw new Error("Middleware returned an unsupported prepared_transaction schema");
  }
  return {
    schema: "canton-snap.prepared-transaction.v1",
    transactionHash: requireString(value, "transactionHash"),
    operation: requireString(value, "operation"),
    tokenSymbol: requireString(value, "tokenSymbol"),
    amount: requireString(value, "amount"),
    details: optionalStringRecord(value, "details"),
    recipient: optionalString(value, "recipient"),
    sender: optionalString(value, "sender"),
    network: optionalString(value, "network"),
    transferId: optionalString(value, "transferId"),
    expiresAt: optionalString(value, "expiresAt"),
    partyId: optionalString(value, "partyId"),
  };
}

function optionalStringRecord(
  record: Record<string, unknown>,
  field: string,
): Record<string, string> | undefined {
  const value = record[field];
  if (value === undefined) return undefined;
  if (!isRecord(value)) {
    throw new Error(`Middleware returned invalid prepared_transaction.${field}`);
  }
  const result: Record<string, string> = {};
  for (const [key, detail] of Object.entries(value)) {
    if (typeof detail !== "string") {
      throw new Error(`Middleware returned invalid prepared_transaction.${field}.${key}`);
    }
    result[key] = detail;
  }
  return result;
}

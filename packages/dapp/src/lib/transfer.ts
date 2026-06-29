// SPDX-License-Identifier: Apache-2.0

import { personalSign } from "./ethereum";
import { friendlyError } from "./middleware";

export interface PrepareResult {
  transferId: string;
  transactionHash: string;
  partyId: string;
  expiresAt: string;
}

// How the recipient field is interpreted. `address` → a registered user's EVM
// address (`to`); `party` → an arbitrary Canton party id (`to_party_id`), which
// may live on an external participant. The middleware requires exactly one of
// the two, so the dapp sends whichever matches the chosen type.
export type RecipientType = "address" | "party";

// Offer validity presets surfaced in the Transfer UI. The chosen value is sent
// as `validity_seconds`: how long the recipient has to accept before the offer
// expires on-ledger and the funds become reclaimable by the sender.
export interface ValidityPreset {
  label: string;
  seconds: number;
}

export const VALIDITY_PRESETS: readonly ValidityPreset[] = [
  { label: "1 hour", seconds: 3600 },
  { label: "6 hours", seconds: 21600 },
  { label: "1 day", seconds: 86400 },
  { label: "1 week", seconds: 604800 },
];

// Default offer validity (1 day) — used when the caller doesn't specify one.
export const DEFAULT_VALIDITY_SECONDS = 86400;

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
  recipient: string,
  token: string,
  amount: string,
  recipientType: RecipientType = "address",
  validitySeconds: number = DEFAULT_VALIDITY_SECONDS,
): Promise<PrepareResult> {
  const authHeaders = await makeAuthHeaders(address);
  // The middleware accepts exactly one of `to` (EVM address) or `to_party_id`
  // (Canton party id); `validity_seconds` is mandatory (canton-middleware#334).
  const recipientField = recipientType === "party" ? { to_party_id: recipient } : { to: recipient };
  const res = await fetch(`${baseUrl}/api/v2/transfer/prepare`, {
    method: "POST",
    headers: { "Content-Type": "application/json", ...authHeaders },
    body: JSON.stringify({ ...recipientField, amount, token, validity_seconds: validitySeconds }),
  });
  if (!res.ok) throw new Error(friendlyError(res.status, await res.text()));
  const data = await res.json();
  return {
    transferId: data.transfer_id as string,
    transactionHash: data.transaction_hash as string,
    partyId: data.party_id as string,
    expiresAt: data.expires_at as string,
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

// Custodial single-call transfer to a Canton party id. The middleware holds the
// custodial user's Canton key and signs server-side, so prepare + execute happen
// in one request — there's no hash for the dapp to sign and no snap involved.
// Settles directly (the recipient still accepts if they're external). Custodial
// transfers to a plain EVM address keep using the existing ERC-20 path.
export async function sendCustodialTransfer(
  baseUrl: string,
  address: string,
  toPartyId: string,
  token: string,
  amount: string,
  validitySeconds: number = DEFAULT_VALIDITY_SECONDS,
): Promise<void> {
  const authHeaders = await makeAuthHeaders(address);
  const res = await fetch(`${baseUrl}/api/v2/transfer/custodial`, {
    method: "POST",
    headers: { "Content-Type": "application/json", ...authHeaders },
    body: JSON.stringify({
      to_party_id: toPartyId,
      amount,
      token,
      validity_seconds: validitySeconds,
    }),
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
  return {
    transferId: data.transfer_id as string,
    transactionHash: data.transaction_hash as string,
    partyId: data.party_id as string,
    expiresAt: data.expires_at as string,
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

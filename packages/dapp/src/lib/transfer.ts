// SPDX-License-Identifier: Apache-2.0

import { personalSign } from "./ethereum";
import { friendlyError } from "./middleware";

export interface PrepareResult {
  transferId: string;
  transactionHash: string;
  partyId: string;
  expiresAt: string;
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

// An outgoing transfer the queried party has offered. Mirrors IncomingTransfer
// but adds the lifecycle fields the Offers tab splits on: `status` and
// `expiresAt`. Party ids are truncated server-side (the endpoint is
// unauthenticated), same as incoming offers.
export type OutgoingStatus = "pending" | "expired" | "completed";

export interface OutgoingTransfer {
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
  /** Server-reported lifecycle status. */
  status?: OutgoingStatus;
  /** RFC3339 timestamp after which the offer can no longer be accepted. */
  expiresAt?: string;
}

const OUTGOING_PAGE_LIMIT = 50;
const OUTGOING_MAX_PAGES = 100;

interface OutgoingItemResponse {
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
  status?: OutgoingStatus;
  expires_at?: string;
}

function mapOutgoing(o: OutgoingItemResponse): OutgoingTransfer {
  return {
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
    status: o.status,
    expiresAt: o.expires_at,
  };
}

// GET /api/v2/transfer/outgoing?address=<addr>&status=<status>. Unauthenticated,
// page/limit paginated; walks all pages so the caller gets the full list. Pass
// a status to filter server-side, or omit for all.
export async function listOutgoingTransfers(
  baseUrl: string,
  address: string,
  status?: OutgoingStatus | "all",
): Promise<OutgoingTransfer[]> {
  const all: OutgoingTransfer[] = [];

  for (let page = 1; page <= OUTGOING_MAX_PAGES; page++) {
    const url = new URL(`${baseUrl}/api/v2/transfer/outgoing`);
    url.searchParams.set("address", address);
    url.searchParams.set("page", String(page));
    url.searchParams.set("limit", String(OUTGOING_PAGE_LIMIT));
    if (status && status !== "all") url.searchParams.set("status", status);

    const res = await fetch(url.toString());
    if (!res.ok) throw new Error(friendlyError(res.status, await res.text()));
    const data = (await res.json()) as { items?: OutgoingItemResponse[]; has_more?: boolean };

    all.push(...(data.items ?? []).map(mapOutgoing));
    if (!data.has_more) break;
  }

  return all;
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

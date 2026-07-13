// SPDX-License-Identifier: Apache-2.0

import { authorizedFetch } from "./auth";
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

// Server-truncated party identifiers (e.g. `user_2dA…4680b7ec`). The middleware
// redacts the fingerprint portion of the party id; the truncated form is
// sufficient for the dapp to disambiguate offers in the UI and to display
// "From <short>" without leaking enough to enumerate counterparties.
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
  prefix:
    | "transfer"
    | "prepare-accept"
    | "execute-accept"
    | "prepare-withdraw"
    | "execute-withdraw"
    | "withdraw-custodial" = "transfer",
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
  // Called once the MetaMask auth signature is collected and the (slower)
  // middleware call begins — lets the UI advance past "waiting for MetaMask".
  onAuthenticated?: () => void,
): Promise<void> {
  const authHeaders = await makeAuthHeaders(address);
  onAuthenticated?.();
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
  // Called once the MetaMask auth signature is collected and the (slower)
  // middleware call begins — lets the UI advance past "waiting for MetaMask".
  onAuthenticated?: () => void,
): Promise<void> {
  const authHeaders = await makeAuthHeaders(address);
  onAuthenticated?.();
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

// One page of a paginated transfer listing. `total` is the server-side count
// of ALL matching items (not just this page), so callers can render accurate
// counts without fetching every page.
export interface TransfersPage<T> {
  items: T[];
  total: number;
  page: number;
  limit: number;
  hasMore: boolean;
}

// Page size shared by the offer listings (incoming/outgoing) — matches the
// middleware's default limit.
export const OFFERS_PAGE_LIMIT = 50;

interface IncomingItemResponse {
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
}

interface PagedResponse<T> {
  items?: T[];
  total?: number;
  page?: number;
  limit?: number;
  has_more?: boolean;
}

function toPage<T, R>(
  data: PagedResponse<R> | null | undefined,
  requestedPage: number,
  requestedLimit: number,
  map: (r: R) => T,
): TransfersPage<T> {
  const items = (data?.items ?? []).map(map);
  return {
    items,
    total: data?.total ?? items.length,
    page: data?.page ?? requestedPage,
    limit: data?.limit ?? requestedLimit,
    hasMore: data?.has_more ?? false,
  };
}

// GET /api/v2/transfer/incoming?page=&limit= as `address` (SIWE-issued bearer
// token; legacy ?address= when the middleware runs without read auth). Returns
// one page of pending inbound offers plus the server-side total.
export async function listIncomingTransfers(
  baseUrl: string,
  address: string,
  page = 1,
  limit: number = OFFERS_PAGE_LIMIT,
): Promise<TransfersPage<IncomingTransfer>> {
  const url = new URL(`${baseUrl}/api/v2/transfer/incoming`);
  url.searchParams.set("page", String(page));
  url.searchParams.set("limit", String(limit));
  const res = await authorizedFetch(baseUrl, address, url);
  if (!res.ok) throw new Error(friendlyError(res.status, await res.text()));
  const data = (await res.json()) as PagedResponse<IncomingItemResponse>;
  return toPage(data, page, limit, (o) => ({
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
// `expiresAt`. Party ids are truncated server-side, same as incoming offers.
//
// "canceled" = the sender withdrew (claimed back) the offer; "rejected" = the
// receiver declined it. Both are terminal, funds returned to the sender; they
// render on the Activity tab, never the Offers tab.
export type OutgoingStatus = "pending" | "expired" | "completed" | "canceled" | "rejected";

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
  /** RFC3339 ledger time when the offer was created. */
  createdAt?: string;
  /** RFC3339 timestamp after which the offer can no longer be accepted. */
  expiresAt?: string;
}

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
  created_at?: string;
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
    createdAt: o.created_at,
    expiresAt: o.expires_at,
  };
}

// GET /api/v2/transfer/outgoing?status=<status>&page=&limit= as `address`
// (bearer-authenticated, same as incoming). Returns one page plus the
// server-side total for the given status filter (or all statuses when omitted).
export async function listOutgoingTransfers(
  baseUrl: string,
  address: string,
  status?: OutgoingStatus | "all",
  page = 1,
  limit: number = OFFERS_PAGE_LIMIT,
): Promise<TransfersPage<OutgoingTransfer>> {
  const url = new URL(`${baseUrl}/api/v2/transfer/outgoing`);
  url.searchParams.set("page", String(page));
  url.searchParams.set("limit", String(limit));
  if (status && status !== "all") url.searchParams.set("status", status);

  const res = await authorizedFetch(baseUrl, address, url);
  if (!res.ok) throw new Error(friendlyError(res.status, await res.text()));
  const data = (await res.json()) as PagedResponse<OutgoingItemResponse>;
  return toPage(data, page, limit, mapOutgoing);
}

// ── Completed transfers (Activity history) ──────────────────────────────────
//
// A settled transfer in the unified history, across all tokens and both
// transfer shapes (direct CIP-56 and accepted offers). Party ids are truncated
// server-side. `txId` is a Canton ledger update id — not an EVM tx hash, so it
// isn't block-explorer linkable.
export interface CompletedTransfer {
  contractId: string;
  kind: string; // "direct" | "offer"
  status: string; // "completed"
  fromPartyId: string;
  toPartyId: string;
  amount: string;
  instrumentAdmin: string;
  instrumentId: string;
  timestamp: string; // RFC3339
  txId?: string;
  symbol?: string;
  decimals?: number;
  name?: string;
  contractAddress?: string;
}

export interface CompletedTransfersPage {
  items: CompletedTransfer[];
  total: number;
  page: number;
  limit: number;
  hasMore: boolean;
}

export const COMPLETED_PAGE_LIMIT = 50;

interface CompletedItemResponse {
  contract_id: string;
  kind: string;
  status: string;
  from_party_id: string;
  to_party_id: string;
  amount: string;
  instrument_admin: string;
  instrument_id: string;
  timestamp: string;
  tx_id?: string;
  symbol?: string;
  decimals?: number;
  name?: string;
  contract_address?: string;
}

// GET /api/v2/transfer/completed?page=&limit= as `address` (bearer-
// authenticated, same as incoming). Returns one page of settled transfers
// (sender + receiver) for the caller. Page-based so the Activity tab can
// "Load more" rather than buffer the whole history.
export async function listCompletedTransfers(
  baseUrl: string,
  address: string,
  page = 1,
  limit: number = COMPLETED_PAGE_LIMIT,
): Promise<CompletedTransfersPage> {
  const url = new URL(`${baseUrl}/api/v2/transfer/completed`);
  url.searchParams.set("page", String(page));
  url.searchParams.set("limit", String(limit));

  const res = await authorizedFetch(baseUrl, address, url);
  if (!res.ok) throw new Error(friendlyError(res.status, await res.text()));
  const data = (await res.json()) as {
    items?: CompletedItemResponse[];
    total?: number;
    page?: number;
    limit?: number;
    has_more?: boolean;
  };

  return {
    items: (data.items ?? []).map((t) => ({
      contractId: t.contract_id,
      kind: t.kind,
      status: t.status,
      fromPartyId: t.from_party_id,
      toPartyId: t.to_party_id,
      amount: t.amount,
      instrumentAdmin: t.instrument_admin,
      instrumentId: t.instrument_id,
      timestamp: t.timestamp,
      txId: t.tx_id,
      symbol: t.symbol,
      decimals: t.decimals,
      name: t.name,
      contractAddress: t.contract_address,
    })),
    total: data.total ?? 0,
    page: data.page ?? page,
    limit: data.limit ?? limit,
    hasMore: data.has_more ?? false,
  };
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

// ── Claim back / withdraw an outgoing offer ─────────────────────────────────
//
// Reclaims the holding locked by an offer-based transfer the caller sent. Works
// on a pending offer (cancel before acceptance) or an expired one (reclaim after
// it lapsed). Mirrors the accept flow: two-step prepare + snap-signed execute
// for non-custodial users, single server-signed call for custodial. The server
// looks up the offer's instrument admin via the indexer, so no request body is
// needed beyond the contract id in the path (canton-middleware#339).

// Maps the withdraw endpoints' documented failure codes to user-facing copy:
// 404 — the offer is gone or not the caller's; 409 — it was already accepted or
// settled on-ledger. Anything else falls back to the generic formatter.
async function withdrawErrorMessage(res: Response): Promise<string> {
  const body = await res.text();
  if (res.status === 404)
    return "This offer is no longer available — it may have been accepted or already claimed back.";
  if (res.status === 409)
    return "This offer can no longer be claimed back — it was already accepted or settled.";
  return friendlyError(res.status, body);
}

export async function prepareWithdrawTransfer(
  baseUrl: string,
  address: string,
  contractId: string,
): Promise<PrepareResult> {
  const authHeaders = await makeAuthHeaders(address, "prepare-withdraw");
  const res = await fetch(
    `${baseUrl}/api/v2/transfer/outgoing/${encodeURIComponent(contractId)}/withdraw/prepare`,
    { method: "POST", headers: authHeaders },
  );
  if (!res.ok) throw new Error(await withdrawErrorMessage(res));
  const data = await res.json();
  return {
    transferId: data.transfer_id as string,
    transactionHash: data.transaction_hash as string,
    partyId: data.party_id as string,
    expiresAt: data.expires_at as string,
  };
}

export async function executeWithdrawTransfer(
  baseUrl: string,
  address: string,
  contractId: string,
  transferId: string,
  signature: string,
  signedBy: string,
): Promise<void> {
  const authHeaders = await makeAuthHeaders(address, "execute-withdraw");
  const res = await fetch(
    `${baseUrl}/api/v2/transfer/outgoing/${encodeURIComponent(contractId)}/withdraw/execute`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json", ...authHeaders },
      body: JSON.stringify({ transfer_id: transferId, signature, signed_by: signedBy }),
    },
  );
  if (!res.ok) throw new Error(await withdrawErrorMessage(res));
}

// Custodial claim-back: the middleware holds the user's Canton key and signs
// server-side, so prepare + execute happen in one call (no snap, no body).
export async function withdrawCustodialTransfer(
  baseUrl: string,
  address: string,
  contractId: string,
): Promise<void> {
  const authHeaders = await makeAuthHeaders(address, "withdraw-custodial");
  const res = await fetch(
    `${baseUrl}/api/v2/transfer/outgoing/${encodeURIComponent(contractId)}/withdraw/custodial`,
    { method: "POST", headers: authHeaders },
  );
  if (!res.ok) throw new Error(await withdrawErrorMessage(res));
}

// SPDX-License-Identifier: Apache-2.0

/**
 * snaps-jest response handling.
 *
 * A snaps-jest response is {id, response: {result} | {error}, notifications,
 * tracked} (see @metamask/snaps-simulation types). Reading `.result` off the
 * top level silently yields undefined, which makes assertions pass without
 * testing anything, so every unwrap goes through here.
 *
 * Where a value is not needed downstream, prefer the toRespondWith and
 * toRespondWithError matchers, as test/index.test.js does.
 */

/**
 * Unwrap a successful snaps-jest response, throwing on a JSON-RPC error.
 *
 * @param {object} res awaited snaps-jest response
 * @returns {object} the result payload
 */
export function resultOf(res) {
  const plain = JSON.parse(JSON.stringify(res));
  if (!plain.response) {
    throw new Error(`Unexpected snaps-jest response shape: ${JSON.stringify(plain).slice(0, 200)}`);
  }
  if ("error" in plain.response) {
    throw new Error(`Snap returned an error: ${JSON.stringify(plain.response.error)}`);
  }
  return plain.response.result;
}

/** Approve the pending dialog and unwrap the result. */
export async function approve(req) {
  const ui = await req.getInterface();
  await ui.ok();
  return resultOf(await req);
}

/**
 * Approve the pending dialog after asserting its rendered content, then unwrap.
 * The dialog is part of the security contract: a user must see what they are
 * approving before a signature exists.
 *
 * @param {object} req the snaps-jest request
 * @param {string[]} mustContain rendered strings that must be present
 */
export async function approveWithContent(req, mustContain) {
  const ui = await req.getInterface();
  const rendered = JSON.stringify(ui);
  for (const needle of mustContain) {
    if (!rendered.includes(needle)) {
      throw new Error(`Approval dialog did not render ${JSON.stringify(needle)}`);
    }
  }
  await ui.ok();
  return resultOf(await req);
}

/** Canton multihash fingerprint, as index.test.js asserts it. */
export const FINGERPRINT = /^1220[0-9a-f]{64}$/;
/** Compressed secp256k1 public key. */
export const COMPRESSED_PUBKEY = /^[0-9a-f]{66}$/;
/** DER signature, hex, with or without an 0x prefix. */
export const DER_SIGNATURE = /^(0x)?30[0-9a-f]{8,}$/;

// SPDX-License-Identifier: Apache-2.0

/**
 * Confirmation dialog builders for Canton Snap.
 *
 * Every dialog surfaces the calling origin, the keyIndex being used,
 * and the corresponding Canton fingerprint so the user can verify the
 * full context of what they are approving.
 */

import { Box, Heading, Text, Divider, Copyable } from "@metamask/snaps-sdk/jsx";
import type { JSXElement } from "@metamask/snaps-sdk/jsx";
import type { SignHashMetadata } from "./types";

function contextLines(origin: string, keyIndex: number, fingerprint: string): JSXElement[] {
  return [
    Text({ children: `Requested by: ${origin}` }),
    Text({ children: `Key index: ${keyIndex}` }),
    Text({ children: "Canton fingerprint:" }),
    Copyable({ value: fingerprint }),
  ];
}

export function exportPublicKeyDialog(origin: string, keyIndex: number, fingerprint: string) {
  return Box({
    children: [
      Heading({ children: "Export Canton Public Key" }),
      ...contextLines(origin, keyIndex, fingerprint),
      Divider({}),
      Text({ children: "This does not expose your private key." }),
    ],
  });
}

export function signTransactionDialog(
  origin: string,
  keyIndex: number,
  fingerprint: string,
  transactionHash: string,
  metadata?: SignHashMetadata,
) {
  const children: JSXElement[] = [
    Heading({ children: "Sign Canton Transaction" }),
    ...contextLines(origin, keyIndex, fingerprint),
    Divider({}),
  ];

  if (metadata) {
    children.push(
      Text({
        children:
          "Transaction details (reported by the dApp; the snap cannot yet verify these against the hash):",
      }),
      Text({ children: `Operation: ${metadata.operation}` }),
      Text({ children: `Token: ${metadata.tokenSymbol}` }),
      Text({ children: `Amount: ${metadata.amount}` }),
    );
    if (metadata.recipient) children.push(Text({ children: `To: ${metadata.recipient}` }));
    if (metadata.sender) children.push(Text({ children: `From: ${metadata.sender}` }));
  } else {
    children.push(
      Text({
        children:
          "⚠ RAW HASH SIGNING — the dApp did not provide any transaction context. Approve only if you trust this dApp.",
      }),
    );
  }

  children.push(Divider({}));
  children.push(Text({ children: "Hash to sign:" }));
  children.push(Copyable({ value: transactionHash }));

  return Box({ children });
}

export function signTopologyDialog(
  origin: string,
  keyIndex: number,
  fingerprint: string,
  hash: string,
) {
  return Box({
    children: [
      Heading({ children: "Sign Canton Topology Transaction" }),
      ...contextLines(origin, keyIndex, fingerprint),
      Divider({}),
      Text({
        children:
          "⚠ Topology transactions can register a new identity, rotate keys, or change party membership. Verify the operation in the dApp before approving.",
      }),
      Text({ children: "Topology hash:" }),
      Copyable({ value: hash }),
    ],
  });
}

export function getFingerprintDialog(origin: string, keyIndex: number, fingerprint: string) {
  return Box({
    children: [
      Heading({ children: "Share Canton Fingerprint" }),
      ...contextLines(origin, keyIndex, fingerprint),
      Divider({}),
      Text({
        children:
          "This dApp wants to read this Canton identity. Approving will let this dApp read it silently from now on for this same key index. Other key indices will still require a fresh prompt.",
      }),
    ],
  });
}

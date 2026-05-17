/**
 * Confirmation dialog builders for Canton Snap.
 *
 * Every dialog surfaces the calling origin so the user knows which dApp
 * is asking. Caller-supplied content (metadata, hashes) is shown but
 * labelled as un-attested by the snap.
 */

import { Box, Heading, Text, Divider, Copyable } from "@metamask/snaps-sdk/jsx";
import type { JSXElement } from "@metamask/snaps-sdk/jsx";
import type { SignHashMetadata } from "./types";

function originLine(origin: string): JSXElement {
  return Text({ children: `Requested by: ${origin}` });
}

export function exportPublicKeyDialog(origin: string, fingerprint: string) {
  return Box({
    children: [
      Heading({ children: "Export Canton Public Key" }),
      originLine(origin),
      Divider({}),
      Text({
        children: "This dApp is requesting your Canton Network public key.",
      }),
      Text({ children: "Fingerprint:" }),
      Copyable({ value: fingerprint }),
      Text({ children: "This does not expose your private key." }),
    ],
  });
}

export function signTransactionDialog(
  origin: string,
  hash: string,
  metadata?: SignHashMetadata,
) {
  const children: JSXElement[] = [
    Heading({ children: "Sign Canton Transaction" }),
    originLine(origin),
    Divider({}),
    Text({ children: "Hash to sign:" }),
    Copyable({ value: hash }),
  ];

  if (metadata) {
    children.push(Divider({}));
    children.push(
      Text({
        children:
          "⚠ The details below are supplied by the dApp and are NOT verified by the snap. Confirm them in the dApp UI before approving.",
      }),
    );
    children.push(Text({ children: `Operation: ${metadata.operation}` }));
    children.push(Text({ children: `Token: ${metadata.tokenSymbol}` }));
    children.push(Text({ children: `Amount: ${metadata.amount}` }));
    if (metadata.recipient) {
      children.push(Text({ children: `To: ${metadata.recipient}` }));
    }
    if (metadata.sender) {
      children.push(Text({ children: `From: ${metadata.sender}` }));
    }
  }

  children.push(Divider({}));
  children.push(
    Text({ children: "Approving will share your Canton fingerprint with this dApp." }),
  );

  return Box({ children });
}

export function signTopologyDialog(origin: string, hash: string) {
  return Box({
    children: [
      Heading({ children: "Sign Canton Topology Transaction" }),
      originLine(origin),
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

export function getFingerprintDialog(origin: string, fingerprint: string) {
  return Box({
    children: [
      Heading({ children: "Share Canton Fingerprint" }),
      originLine(origin),
      Divider({}),
      Text({
        children:
          "This dApp wants to read your Canton fingerprint, a public identifier of your party. Approving will let this dApp read it silently from now on.",
      }),
      Text({ children: "Fingerprint:" }),
      Copyable({ value: fingerprint }),
    ],
  });
}

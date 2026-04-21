/**
 * Confirmation dialog builders for Canton Snap.
 *
 * Each sensitive operation (key export, signing) shows a dialog
 * the user must approve before the snap proceeds.
 *
 * Uses @metamask/snaps-sdk/jsx component factories (snaps-sdk v10+).
 */

import { Box, Heading, Text, Divider, Copyable } from "@metamask/snaps-sdk/jsx";
import type { JSXElement } from "@metamask/snaps-sdk/jsx";
import type { SignHashMetadata } from "./types";

/**
 * Dialog for exporting the Canton public key during registration.
 */
export function exportPublicKeyDialog(fingerprint: string) {
  return Box({
    children: [
      Heading({ children: "Export Canton Public Key" }),
      Text({ children: "A dApp is requesting your Canton Network public key for party registration." }),
      Divider({}),
      Text({ children: "Fingerprint:" }),
      Copyable({ value: fingerprint }),
      Divider({}),
      Text({ children: "This does not expose your private key." }),
    ],
  });
}

/**
 * Dialog for signing a Canton transaction (transfer, mint, etc.).
 */
export function signTransactionDialog(hash: string, metadata?: SignHashMetadata) {
  const children: JSXElement[] = [Heading({ children: "Sign Canton Transaction" }), Divider({})];

  if (metadata) {
    children.push(Text({ children: `Operation: ${metadata.operation}` }));
    children.push(Text({ children: `Token: ${metadata.tokenSymbol}` }));
    children.push(Text({ children: `Amount: ${metadata.amount}` }));
    if (metadata.recipient) {
      children.push(Text({ children: `To: ${metadata.recipient}` }));
    }
    if (metadata.sender) {
      children.push(Text({ children: `From: ${metadata.sender}` }));
    }
    children.push(Divider({}));
  }

  children.push(Text({ children: "Hash to sign:" }));
  children.push(Copyable({ value: hash }));
  children.push(Text({ children: "Verify the details match your intent before approving." }));

  return Box({ children });
}

/**
 * Dialog for signing topology during Canton party registration.
 */
export function signTopologyDialog(hash: string) {
  return Box({
    children: [
      Heading({ children: "Approve Canton Registration" }),
      Text({ children: "Sign the topology transaction to register your Canton Network identity." }),
      Text({ children: "This links your MetaMask wallet to a Canton party." }),
      Divider({}),
      Text({ children: "Topology hash:" }),
      Copyable({ value: hash }),
    ],
  });
}

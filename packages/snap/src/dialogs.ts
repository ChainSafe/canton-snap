/**
 * Confirmation dialog builders for Canton Snap.
 *
 * Each sensitive operation (key export, signing) shows a dialog
 * the user must approve before the snap proceeds.
 */

import { panel, heading, text, divider, copyable, type Component } from "@metamask/snaps-sdk";
import type { SignHashMetadata } from "./types";

/**
 * Dialog for exporting the Canton public key during registration.
 */
export function exportPublicKeyDialog(fingerprint: string): Component {
  return panel([
    heading("Export Canton Public Key"),
    text("A dApp is requesting your Canton Network public key for party registration."),
    divider(),
    text("**Fingerprint:**"),
    copyable(fingerprint),
    divider(),
    text("This does **not** expose your private key."),
  ]);
}

/**
 * Dialog for signing a Canton transaction (transfer, mint, etc.).
 */
export function signTransactionDialog(hash: string, metadata?: SignHashMetadata): Component {
  const children: Component[] = [heading("Sign Canton Transaction"), divider()];

  if (metadata) {
    children.push(text(`**Operation:** ${metadata.operation}`));
    children.push(text(`**Token:** ${metadata.tokenSymbol}`));
    children.push(text(`**Amount:** ${metadata.amount}`));
    if (metadata.recipient) {
      children.push(text(`**To:** ${metadata.recipient}`));
    }
    if (metadata.sender) {
      children.push(text(`**From:** ${metadata.sender}`));
    }
    children.push(divider());
  }

  children.push(text("**Hash to sign:**"));
  children.push(copyable(hash));
  children.push(text("Verify the details match your intent before approving."));

  return panel(children);
}

/**
 * Dialog for signing topology during Canton party registration.
 */
export function signTopologyDialog(hash: string): Component {
  return panel([
    heading("Approve Canton Registration"),
    text("Sign the topology transaction to register your Canton Network identity."),
    text("This links your MetaMask wallet to a Canton party."),
    divider(),
    text("**Topology hash:**"),
    copyable(hash),
  ]);
}

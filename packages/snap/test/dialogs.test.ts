// SPDX-License-Identifier: Apache-2.0

/**
 * What the approval dialog actually renders, and what the Snap actually signs.
 *
 * The Snap's security claim rests on informed consent: the user sees what they
 * are approving. Nothing tested the rendered content before, so a change that
 * dropped the amount, or the raw-hash warning, or the fingerprint, would have
 * shipped silently while every existing test stayed green.
 *
 * These assertions are on rendered labels, not bare values. Asserting that the
 * dialog contains "1" proves nothing: every dialog renders a Canton
 * fingerprint, and fingerprints begin "1220".
 */

import { describe, it, expect, afterEach } from "vitest";
import { installStub, texts, copyables, types } from "./stubSnap.js";
import { onRpcRequest } from "../src/index.js";
import { secp256k1 } from "@noble/curves/secp256k1";
import { sha256 } from "@noble/hashes/sha2";
import { hexToBytes } from "@noble/hashes/utils";

const ORIGIN = "https://app.example";
const HASH = "ab".repeat(32);
const TOPOLOGY_HASH = "1220" + "cd".repeat(32);
const FINGERPRINT = "122057817630337f218ebe1dc8968e9bb60cebae91fafab510a1e399b404dd746040";

const METADATA = {
  operation: "Transfer",
  tokenSymbol: "DEMO",
  amount: "100",
  recipient: "alice::1220abcd",
  sender: "bob::12201234",
};

/**
 * Drive one RPC method through the handler.
 *
 * @param method RPC method name.
 * @param params Method parameters.
 * @returns The handler's response.
 */
async function call(method: string, params: Record<string, unknown>) {
  return (await onRpcRequest({
    origin: ORIGIN,
    request: { method, params, jsonrpc: "2.0", id: 1 },
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
  } as any)) as any;
}

let stub: ReturnType<typeof installStub> | undefined;
afterEach(() => stub?.restore());

describe("transfer dialog", () => {
  it("renders the operation, token and amount the dApp reported", async () => {
    stub = installStub();

    await call("canton_signHash", { hash: HASH, keyIndex: 0, metadata: METADATA });

    const lines = texts(stub.lastDialog()!.content);
    expect(lines).toContain(`Operation: ${METADATA.operation}`);
    expect(lines).toContain(`Token: ${METADATA.tokenSymbol}`);
    expect(lines).toContain(`Amount: ${METADATA.amount}`);
    expect(lines).toContain(`To: ${METADATA.recipient}`);
    expect(lines).toContain(`From: ${METADATA.sender}`);
  });

  it("states that it cannot verify the reported details against the hash", async () => {
    stub = installStub();

    await call("canton_signHash", { hash: HASH, keyIndex: 0, metadata: METADATA });

    // This caveat is the Snap's most important disclosure: it signs an opaque
    // hash and cannot check the rendered details against it. If it is ever
    // removed the dialog becomes misleading, so it is pinned verbatim.
    expect(texts(stub.lastDialog()!.content)).toContain(
      "Transaction details (reported by the dApp; the snap cannot yet verify these against the hash):",
    );
  });

  it("warns loudly when the dApp supplies no context at all", async () => {
    stub = installStub();

    await call("canton_signHash", { hash: HASH, keyIndex: 0 });

    const lines = texts(stub.lastDialog()!.content);
    expect(lines).toContain(
      "⚠ RAW HASH SIGNING — the dApp did not provide any transaction context. Approve only if you trust this dApp.",
    );
    // And it must not claim to show details it does not have.
    expect(lines.some((l) => l.startsWith("Amount:"))).toBe(false);
  });

  it("shows the calling origin, key index and fingerprint", async () => {
    stub = installStub();

    await call("canton_signHash", { hash: HASH, keyIndex: 3, metadata: METADATA });

    const dialog = stub.lastDialog()!;
    const lines = texts(dialog.content);
    expect(lines).toContain(`Requested by: ${ORIGIN}`);
    expect(lines).toContain("Key index: 3");
    expect(copyables(dialog.content)).toContain(FINGERPRINT);
  });

  it("shows the exact hash being signed, as copyable text", async () => {
    stub = installStub();

    await call("canton_signHash", { hash: HASH, keyIndex: 0, metadata: METADATA });

    // Copyable rather than Text: a user verifying against the dApp needs to be
    // able to copy it, and truncated display text cannot be compared.
    expect(copyables(stub.lastDialog()!.content)).toContain(HASH);
  });

  it("is a confirmation the user must accept", async () => {
    stub = installStub({ approve: false });

    await expect(
      call("canton_signHash", { hash: HASH, keyIndex: 0, metadata: METADATA }),
    ).rejects.toThrow(/rejected/i);

    expect(stub.lastDialog()!.type).toBe("confirmation");
  });
});

describe("topology dialog", () => {
  it("warns that topology transactions can change identity and keys", async () => {
    stub = installStub();

    await call("canton_signTopology", { hash: TOPOLOGY_HASH, keyIndex: 0 });

    expect(texts(stub.lastDialog()!.content)).toContain(
      "⚠ Topology transactions can register a new identity, rotate keys, or change party membership. Verify the operation in the dApp before approving.",
    );
  });

  it("shows the topology hash as copyable text", async () => {
    stub = installStub();

    await call("canton_signTopology", { hash: TOPOLOGY_HASH, keyIndex: 0 });

    expect(copyables(stub.lastDialog()!.content)).toContain(TOPOLOGY_HASH);
  });
});

describe("fingerprint disclosure dialog", () => {
  it("explains that approval makes future reads silent for this key index", async () => {
    stub = installStub();

    await call("canton_getFingerprint", { keyIndex: 0 });

    expect(texts(stub.lastDialog()!.content)).toContain(
      "This dApp wants to read this Canton identity. Approving will let this dApp read it silently from now on for this same key index. Other key indices will still require a fresh prompt.",
    );
  });

  it("does not prompt again for the same origin and key index", async () => {
    stub = installStub();

    await call("canton_getFingerprint", { keyIndex: 0 });
    const afterFirst = stub.dialogs.length;
    await call("canton_getFingerprint", { keyIndex: 0 });

    expect(stub.dialogs.length).toBe(afterFirst);
  });

  it("prompts again for a different key index", async () => {
    stub = installStub();

    await call("canton_getFingerprint", { keyIndex: 0 });
    const afterFirst = stub.dialogs.length;
    await call("canton_getFingerprint", { keyIndex: 1 });

    expect(stub.dialogs.length).toBe(afterFirst + 1);
  });
});

describe("public key dialog", () => {
  it("states that the private key is not exposed", async () => {
    stub = installStub();

    await call("canton_getPublicKey", { keyIndex: 0 });

    expect(texts(stub.lastDialog()!.content)).toContain(
      "This does not expose your private key.",
    );
  });

  it("names the operation in its heading", async () => {
    stub = installStub();

    await call("canton_getPublicKey", { keyIndex: 0 });

    // The heading is the first thing a user reads and is what distinguishes an
    // export prompt from a signing prompt.
    expect(texts(stub.lastDialog()!.content)).toContain("Export Canton Public Key");
  });

  it("separates context from the rest with a divider", async () => {
    stub = installStub();

    await call("canton_getPublicKey", { keyIndex: 0 });

    expect(types(stub.lastDialog()!.content)).toContain("Divider");
  });
});

describe("what is actually signed", () => {
  it("signs sha256 of the supplied hash, not the hash bytes", async () => {
    stub = installStub();

    const res = await call("canton_signHash", { hash: HASH, keyIndex: 0, metadata: METADATA });
    const pub = await call("canton_getPublicKey", { keyIndex: 0 });

    const der = hexToBytes(res.derSignature.replace(/^0x/, ""));
    const pubKey = hexToBytes(pub.compressedPubKey);
    const hashBytes = hexToBytes(HASH);

    // Canton's EC_DSA_SHA_256 hashes before signing, matching the Go SDK's
    // SignDER. The comment in sign.ts used to claim the opposite. Verifying
    // against both candidate digests settles which one actually holds.
    expect(secp256k1.verify(der, sha256(hashBytes), pubKey)).toBe(true);
    expect(secp256k1.verify(der, hashBytes, pubKey)).toBe(false);
  });

  it("signs sha256 of the topology multihash", async () => {
    stub = installStub();

    const res = await call("canton_signTopology", { hash: TOPOLOGY_HASH, keyIndex: 0 });
    const pub = await call("canton_getPublicKey", { keyIndex: 0 });

    const der = hexToBytes(res.derSignature.replace(/^0x/, ""));
    const pubKey = hexToBytes(pub.compressedPubKey);
    const hashBytes = hexToBytes(TOPOLOGY_HASH);

    expect(secp256k1.verify(der, sha256(hashBytes), pubKey)).toBe(true);
    expect(secp256k1.verify(der, hashBytes, pubKey)).toBe(false);
  });

  it("returns a low-S DER signature carrying the signing fingerprint", async () => {
    stub = installStub();

    const res = await call("canton_signHash", { hash: HASH, keyIndex: 0, metadata: METADATA });

    expect(res.derSignature).toMatch(/^0x30[0-9a-f]{8,}$/);
    expect(res.fingerprint).toBe(FINGERPRINT);

    // One signature proves nothing about normalisation: roughly half of all
    // signatures are naturally low-S, so a single fixture passes whether or not
    // lowS is applied. Canton rejects a high-S signature, so this sweeps enough
    // distinct hashes that an unnormalised implementation fails with
    // probability about 1 - 2^-40.
    for (let i = 0; i < 40; i++) {
      const sweep = await call("canton_signHash", {
        hash: i.toString(16).padStart(2, "0").repeat(32),
        keyIndex: 0,
      });
      const sig = secp256k1.Signature.fromDER(sweep.derSignature.replace(/^0x/, ""));
      expect(sig.hasHighS()).toBe(false);
    }
  });

  it("returns only the signature and fingerprint, never key material", async () => {
    stub = installStub();

    const signed = await call("canton_signHash", { hash: HASH, keyIndex: 0, metadata: METADATA });
    const topology = await call("canton_signTopology", { hash: TOPOLOGY_HASH, keyIndex: 0 });
    const fingerprint = await call("canton_getFingerprint", { keyIndex: 0 });

    // Exact key sets, not objectContaining. The jest suite asserts these
    // responses with objectContaining, which permits extra fields, so a
    // handler that added the private key to its response would pass every
    // other test in both suites. This is the only assertion that stops it.
    expect(Object.keys(signed).sort()).toEqual(["derSignature", "fingerprint"]);
    expect(Object.keys(topology).sort()).toEqual(["derSignature", "fingerprint"]);
    expect(Object.keys(fingerprint).sort()).toEqual(["fingerprint"]);
  });

  it("does not sign when the user declines", async () => {
    stub = installStub({ approve: false });

    await expect(call("canton_signHash", { hash: HASH, keyIndex: 0 })).rejects.toThrow(
      /rejected/i,
    );
  });
});

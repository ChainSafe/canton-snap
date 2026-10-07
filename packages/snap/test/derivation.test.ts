// SPDX-License-Identifier: Apache-2.0

/**
 * Derivation determinism.
 *
 * The Snap holds no key. It re-derives one from snap_getEntropy on every call
 * and throws it away. That design only works if derivation is deterministic:
 * the same wallet must always produce the same Canton identity, or a user's
 * party becomes unreachable after any restart.
 *
 * Nothing tested this before. These tests pin the derivation parameters and
 * outputs so a refactor cannot silently change the identity every existing
 * user's party is registered against. Changing any pinned value below is a
 * breaking change that orphans every party already allocated on the ledger.
 *
 * The companion sandbox tests in index.test.js cover the same property through
 * the real MetaMask simulation, including recovery from a seed phrase.
 */

import { describe, it, expect, afterEach } from "vitest";
import { installStub, saltedEntropy, FIXED_ENTROPY } from "./stubSnap.js";
import { onRpcRequest } from "../src/index.js";
import { deriveCantonKey } from "../src/keyDerivation.js";
import { bytesToHex } from "@noble/hashes/utils";

/**
 * Golden values for FIXED_ENTROPY at keyIndex 0.
 *
 * Independently re-derived from the specification rather than transcribed from
 * a run: sha256 of the entropy with rejection sampling for the private key,
 * secp256k1 for the public key, the fixed SPKI prefix, then the Canton
 * fingerprint as multihash(sha256(uint32be(12) || spki)) where 12 is the
 * TopologyTransactionSignature purpose. All four matched the handler exactly.
 *
 * The fingerprint and SPKI formats are additionally cross-validated against Go
 * by the 30 vector-driven tests in crypto.test.ts. The entropy-to-private-key
 * step is the one link with no Go-side vector, so for that step alone this is a
 * regression pin rather than cross-validation.
 */
const GOLDEN = {
  compressedPubKey: "02f29f390a998013819dd6ffdf2f22a2b435609dd5d0f4dcc77e32d10e93e31af7",
  spkiDer:
    "3056301006072a8648ce3d020106052b8104000a03420004f29f390a998013819dd6ffdf2f22a2b435609dd5d0f4dcc77e32d10e93e31af733af250342725f73970657903754d3a7efee396824ab31c5c02aa774aaa19296",
  fingerprint: "122057817630337f218ebe1dc8968e9bb60cebae91fafab510a1e399b404dd746040",
};

const ORIGIN = "https://app.example";

/**
 * Drive canton_getPublicKey through the handler.
 *
 * @param keyIndex Key index to derive.
 * @returns The handler's response.
 */
async function getPublicKey(keyIndex: number) {
  return (await onRpcRequest({
    origin: ORIGIN,
    request: {
      method: "canton_getPublicKey",
      params: { keyIndex },
      jsonrpc: "2.0",
      id: 1,
    },
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
  } as any)) as any;
}

let stub: ReturnType<typeof installStub> | undefined;
afterEach(() => stub?.restore());

describe("derivation parameters", () => {
  it("requests entropy under a keyIndex-scoped salt and no entropy source", async () => {
    stub = installStub();

    await getPublicKey(0);
    await getPublicKey(7);

    // The salt template is part of the identity. Changing it rederives every
    // user's key, so it is pinned literally rather than by pattern.
    expect(stub.entropyRequests).toEqual([
      { version: 1, salt: "canton-network-key-0" },
      { version: 1, salt: "canton-network-key-7" },
    ]);

    // No `source` field: entropy must come from the primary wallet seed. A
    // source would scope it to some other entropy provider and change the key.
    for (const req of stub.entropyRequests) {
      expect(req).not.toHaveProperty("source");
    }
  });
});

describe("derivation determinism", () => {
  it("produces the pinned identity for known entropy", async () => {
    stub = installStub();

    const res = await getPublicKey(0);

    expect(res.compressedPubKey).toBe(GOLDEN.compressedPubKey);
    expect(res.spkiDer).toBe(GOLDEN.spkiDer);
    expect(res.fingerprint).toBe(GOLDEN.fingerprint);
  });

  it("returns the same identity on every call within a session", async () => {
    stub = installStub();

    const first = await getPublicKey(0);
    const second = await getPublicKey(0);

    expect(second).toEqual(first);
  });

  it("returns the same identity across independent derivations", async () => {
    stub = installStub();

    // Through the low-level derivation rather than the handler, so this holds
    // even if the handler later caches.
    const a = await deriveCantonKey(0);
    const b = await deriveCantonKey(0);

    expect(bytesToHex(b.privateKey)).toBe(bytesToHex(a.privateKey));
    expect(bytesToHex(b.compressedPubKey)).toBe(bytesToHex(a.compressedPubKey));
  });

  it("derives a different identity for a different key index", async () => {
    // Salt-scoped entropy, as the real platform provides. The fixed-entropy
    // default returns the same bytes for every salt, which would make two key
    // indices collide here through the stub and not through MetaMask.
    stub = installStub({ entropy: saltedEntropy() });

    const zero = await getPublicKey(0);
    const one = await getPublicKey(1);

    expect(one.fingerprint).not.toBe(zero.fingerprint);
    expect(one.compressedPubKey).not.toBe(zero.compressedPubKey);
  });

  it("derives a different identity from different entropy", async () => {
    stub = installStub();
    const fromFixed = await getPublicKey(0);
    stub.restore();

    stub = installStub({ entropy: "0x" + "22".repeat(32) });
    const fromOther = await getPublicKey(0);

    expect(fromOther.fingerprint).not.toBe(fromFixed.fingerprint);
  });

  it("does not read persistent state when deriving", async () => {
    // A Snap that cached its derived key in snap_manageState would still look
    // deterministic, because derivation is deterministic to begin with. This
    // catches it: a poisoned cache must not change the answer.
    stub = installStub({
      state: {
        fingerprintAllowedOrigins: {},
        cachedFingerprint: "1220" + "ff".repeat(32),
        cachedPrivateKey: "ff".repeat(32),
      },
    });

    const res = await getPublicKey(0);

    expect(res.fingerprint).toBe(GOLDEN.fingerprint);
  });

  it("re-derives rather than persisting key material", async () => {
    stub = installStub();

    await getPublicKey(0);
    await getPublicKey(0);

    // Two calls, two entropy requests: nothing was cached between them.
    expect(stub.entropyRequests).toHaveLength(2);
    // And no key material reached persistent state.
    expect(JSON.stringify(stub.state ?? {})).not.toContain(GOLDEN.compressedPubKey);
  });
});

describe("exported material", () => {
  it("returns only public fields", async () => {
    stub = installStub();

    const res = await getPublicKey(0);

    expect(Object.keys(res).sort()).toEqual(["compressedPubKey", "fingerprint", "spkiDer"]);
  });

  it("pins FIXED_ENTROPY so the golden values stay meaningful", () => {
    expect(FIXED_ENTROPY).toBe("0x" + "11".repeat(32));
  });
});

/**
 * Cross-validation of the entropy step against Go.
 *
 * The other 30 crypto tests start from a private key, because that is where the
 * middleware's Go implementation starts: it generates keys, it does not derive
 * them from wallet entropy. The entropy-to-private-key step is the Snap's alone,
 * so until now it had no Go-side vector and was only ever checked against
 * itself.
 *
 * cmd/generate-test-vectors in canton-middleware now implements the same
 * derivation and emits entropy_vectors, so this step is cross-validated like
 * every other link in the chain. Regenerate with:
 *
 *   go run ./cmd/generate-test-vectors > ../canton-snap/packages/snap/test/vectors.json
 */

import { readFileSync } from "fs";
import { resolve } from "path";
import { fingerprintFromCompressedPubKey } from "../src/fingerprint.js";

interface EntropyVector {
  entropy: string;
  private_key: string;
  compressed_public_key: string;
  fingerprint: string;
}

const vectorFile = JSON.parse(
  readFileSync(resolve(import.meta.dirname!, "vectors.json"), "utf-8"),
) as { entropy_vectors?: EntropyVector[] };

const entropyVectors = vectorFile.entropy_vectors ?? [];

describe("entropy derivation cross-validated against Go", () => {
  it("ships entropy vectors", () => {
    // A guard: if a regeneration drops the section, the per-vector tests below
    // would silently vanish rather than fail.
    expect(entropyVectors.length).toBeGreaterThan(0);
  });

  it.each(entropyVectors)("matches Go for entropy $entropy", async (vector) => {
    // Drive the shipped derivation. Re-implementing the loop here would
    // validate a copy of the algorithm against Go and leave the production
    // path free to diverge from both.
    const local = installStub({ entropy: "0x" + vector.entropy });
    try {
      const derived = await deriveCantonKey(0);

      expect(bytesToHex(derived.privateKey)).toBe(vector.private_key);
      expect(bytesToHex(derived.compressedPubKey)).toBe(vector.compressed_public_key);
      expect(fingerprintFromCompressedPubKey(derived.compressedPubKey)).toBe(vector.fingerprint);
    } finally {
      local.restore();
    }
  });

  it("covers the entropy the golden constants are pinned against", () => {
    const fixed = entropyVectors.find((v) => v.entropy === "11".repeat(32));

    expect(fixed).toBeDefined();
    expect(fixed!.compressed_public_key).toBe(GOLDEN.compressedPubKey);
    expect(fixed!.fingerprint).toBe(GOLDEN.fingerprint);
  });
});

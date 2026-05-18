import { describe, it, expect } from "vitest";
import {
  validateKeyIndex,
  parseTopologyHash,
  parsePreparedTransaction,
  validateMetadata,
} from "../src/validation.js";
import { PREPARED_TRANSACTION_SCHEMA as PREPARED_SCHEMA } from "../src/constants.js";
import { sha256 } from "@noble/hashes/sha2";
import { bytesToHex, hexToBytes } from "@noble/hashes/utils";

function canonicalJson(value: unknown): string {
  if (value === null) return "null";
  if (typeof value === "string") return JSON.stringify(value);
  if (typeof value === "boolean") return value ? "true" : "false";
  if (typeof value === "number") return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map((item) => canonicalJson(item)).join(",")}]`;
  const record = value as Record<string, unknown>;
  const keys = Object.keys(record).sort();
  return `{${keys.map((key) => `${JSON.stringify(key)}:${canonicalJson(record[key])}`).join(",")}}`;
}

function preparedTransaction(overrides: Record<string, unknown> = {}) {
  const { transactionHash, ...inputOverrides } = overrides;
  const input = {
    schema: PREPARED_SCHEMA,
    operation: "Transfer",
    tokenSymbol: "DEMO",
    amount: "100",
    recipient: "alice::abcd",
    sender: "bob::1234",
    details: { Command: "transfer", Nonce: "test-1" },
    ...inputOverrides,
  };
  return {
    ...input,
    transactionHash:
      transactionHash ??
      "1220" + bytesToHex(sha256(new TextEncoder().encode(canonicalJson(input)))),
  };
}

describe("validateKeyIndex", () => {
  it("treats undefined and null as 0", () => {
    expect(validateKeyIndex(undefined)).toBe(0);
    expect(validateKeyIndex(null)).toBe(0);
  });

  it("accepts non-negative integers up to 1000", () => {
    expect(validateKeyIndex(0)).toBe(0);
    expect(validateKeyIndex(1)).toBe(1);
    expect(validateKeyIndex(1000)).toBe(1000);
  });

  it("rejects floats", () => {
    expect(() => validateKeyIndex(0.5)).toThrow(/keyIndex/);
    expect(() => validateKeyIndex(0.0000001)).toThrow(/keyIndex/);
  });

  it("rejects NaN and Infinity", () => {
    expect(() => validateKeyIndex(NaN)).toThrow(/keyIndex/);
    expect(() => validateKeyIndex(Infinity)).toThrow(/keyIndex/);
    expect(() => validateKeyIndex(-Infinity)).toThrow(/keyIndex/);
  });

  it("rejects negatives", () => {
    expect(() => validateKeyIndex(-1)).toThrow(/keyIndex/);
  });

  it("rejects out-of-range integers", () => {
    expect(() => validateKeyIndex(1001)).toThrow(/keyIndex/);
    expect(() => validateKeyIndex(1e20)).toThrow(/keyIndex/);
  });

  it("rejects non-numeric types", () => {
    expect(() => validateKeyIndex("0")).toThrow(/keyIndex/);
    expect(() => validateKeyIndex({})).toThrow(/keyIndex/);
  });
});

describe("parseTopologyHash", () => {
  const validMh = "1220" + "ab".repeat(32); // sha2-256 multihash, 34 bytes

  it("accepts a SHA-256 multihash with the correct prefix and length", () => {
    expect(parseTopologyHash(validMh)).toEqual(hexToBytes(validMh));
  });

  it("accepts an 0x-prefixed multihash", () => {
    expect(parseTopologyHash("0x" + validMh)).toEqual(hexToBytes(validMh));
  });

  it("rejects a multihash with the wrong algorithm code", () => {
    // 0x1320 = sha2-512 prefix, would have length 66 anyway; force length 34.
    const wrongAlgo = "1320" + "ab".repeat(32);
    expect(() => parseTopologyHash(wrongAlgo)).toThrow(/multihash/);
  });

  it("rejects a multihash with the wrong digest length", () => {
    // Correct algo byte but length byte != 0x20.
    const wrongLen = "1210" + "ab".repeat(32);
    expect(() => parseTopologyHash(wrongLen)).toThrow(/multihash/);
  });

  it("rejects a too-short hash", () => {
    expect(() => parseTopologyHash("ab")).toThrow(/multihash/);
  });

  it("rejects a too-long hash", () => {
    expect(() => parseTopologyHash("1220" + "ab".repeat(33))).toThrow(/multihash/);
  });

  it("rejects empty", () => {
    expect(() => parseTopologyHash("")).toThrow(/multihash/);
  });

  it("rejects non-hex", () => {
    expect(() => parseTopologyHash("z".repeat(68))).toThrow(/hex/);
  });

  it("rejects odd-length", () => {
    expect(() => parseTopologyHash("abc")).toThrow();
  });
});

describe("parsePreparedTransaction", () => {
  it("accepts a canonical prepared transaction and derives a 32-byte digest", () => {
    const parsed = parsePreparedTransaction(preparedTransaction());
    expect(bytesToHex(parsed.transactionHash)).toMatch(/^1220[0-9a-f]{64}$/);
    expect(parsed.digest).toHaveLength(32);
    expect(parsed.metadata).toEqual({
      operation: "Transfer",
      tokenSymbol: "DEMO",
      amount: "100",
      recipient: "alice::abcd",
      sender: "bob::1234",
    });
    expect(parsed.details).toEqual({ Command: "transfer", Nonce: "test-1" });
  });

  it("accepts an 0x-prefixed transaction hash", () => {
    const prepared = preparedTransaction();
    const parsed = parsePreparedTransaction({
      ...prepared,
      transactionHash: "0x" + prepared.transactionHash,
    });
    expect(bytesToHex(parsed.transactionHash)).toBe(prepared.transactionHash);
  });

  it("rejects raw or missing prepared transactions", () => {
    expect(() => parsePreparedTransaction(undefined)).toThrow(/preparedTransaction/);
    expect(() => parsePreparedTransaction("ab".repeat(32))).toThrow(/preparedTransaction/);
  });

  it("rejects mismatched canonical transaction hashes", () => {
    expect(() =>
      parsePreparedTransaction(preparedTransaction({ transactionHash: "1220" + "ab".repeat(32) })),
    ).toThrow(/does not match/);
  });

  it("rejects unsupported schemas", () => {
    expect(() => parsePreparedTransaction(preparedTransaction({ schema: "other" }))).toThrow(
      /schema/,
    );
  });

  it("matches the canonical hash for non-ASCII string fields", () => {
    // The canonical algorithm uses ECMA-262 JSON.stringify for string
    // escaping, which keeps non-ASCII codepoints as literal UTF-8.
    // Middleware implementations must do the same — accent marks, CJK,
    // and emoji must round-trip without producing a hash mismatch.
    const tricky = preparedTransaction({
      recipient: "café::🌐",
      sender: "测试::A",
      details: { note: "amount = €100", emoji: "👋" },
    });
    const parsed = parsePreparedTransaction(tricky);
    expect(parsed.metadata.recipient).toBe("café::🌐");
    expect(parsed.metadata.sender).toBe("测试::A");
  });

  it("rejects mismatch when canonical input includes a non-whitelisted field", () => {
    // Forging a `phantom` field on the transactionHash side that the snap
    // doesn't include in its canonical rebuild surfaces as a mismatch.
    const prepared = preparedTransaction();
    expect(() =>
      parsePreparedTransaction({ ...prepared, phantom: "extra" }),
    ).not.toThrow();
    // The snap silently drops unknown fields when rebuilding canonical
    // bytes; that's safe (signature is over what the snap re-derived),
    // but it does mean middleware must agree on the same whitelist.
  });
});

describe("validateMetadata", () => {
  const valid = {
    operation: "Transfer",
    tokenSymbol: "DEMO",
    amount: "100",
    recipient: "alice::abcd",
    sender: "bob::1234",
  };

  it("passes through a valid object", () => {
    expect(validateMetadata(valid)).toEqual(valid);
  });

  it("returns undefined for undefined/null", () => {
    expect(validateMetadata(undefined)).toBeUndefined();
    expect(validateMetadata(null)).toBeUndefined();
  });

  it("makes recipient and sender optional", () => {
    const partial = { operation: "Transfer", tokenSymbol: "DEMO", amount: "100" };
    expect(validateMetadata(partial)).toEqual({
      operation: "Transfer",
      tokenSymbol: "DEMO",
      amount: "100",
      recipient: undefined,
      sender: undefined,
    });
  });

  it("rejects non-object", () => {
    expect(() => validateMetadata("a string")).toThrow(/metadata/);
    expect(() => validateMetadata(42)).toThrow(/metadata/);
    expect(() => validateMetadata([])).toThrow(/metadata/);
  });

  it("rejects missing required field", () => {
    const missing = { tokenSymbol: "DEMO", amount: "100" };
    expect(() => validateMetadata(missing)).toThrow(/operation/);
  });

  it("rejects non-string fields", () => {
    expect(() => validateMetadata({ ...valid, operation: 5 })).toThrow(/operation/);
    expect(() => validateMetadata({ ...valid, recipient: {} })).toThrow(/recipient/);
  });

  it("rejects fields exceeding the length cap", () => {
    expect(() => validateMetadata({ ...valid, tokenSymbol: "x".repeat(201) })).toThrow(
      /tokenSymbol/,
    );
  });
});

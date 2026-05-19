import { describe, it, expect } from "vitest";
import {
  validateKeyIndex,
  parseSignHash,
  parseTopologyHash,
  validateMetadata,
} from "../src/validation.js";
import { hexToBytes } from "@noble/hashes/utils";

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

describe("parseSignHash", () => {
  const validHash = "ab".repeat(32);

  it("accepts a 32-byte hex hash", () => {
    expect(parseSignHash(validHash)).toEqual(hexToBytes(validHash));
  });

  it("accepts an 0x-prefixed hash", () => {
    expect(parseSignHash("0x" + validHash)).toEqual(hexToBytes(validHash));
  });

  it("rejects a too-short hash", () => {
    expect(() => parseSignHash("ab".repeat(31))).toThrow(/hash/);
  });

  it("rejects a too-long hash", () => {
    expect(() => parseSignHash("ab".repeat(33))).toThrow(/hash/);
  });

  it("rejects non-string", () => {
    expect(() => parseSignHash(undefined)).toThrow(/hash/);
    expect(() => parseSignHash(42)).toThrow(/hash/);
  });

  it("rejects non-hex", () => {
    expect(() => parseSignHash("z".repeat(64))).toThrow(/hex/);
  });

  it("rejects odd-length", () => {
    expect(() => parseSignHash("abc")).toThrow();
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

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
  const valid = "e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855";

  it("accepts 32-byte hex with and without 0x prefix", () => {
    expect(parseSignHash(valid)).toEqual(hexToBytes(valid));
    expect(parseSignHash("0x" + valid)).toEqual(hexToBytes(valid));
  });

  it("rejects non-hex characters", () => {
    expect(() => parseSignHash("z".repeat(64))).toThrow(/hex/);
    expect(() => parseSignHash("zz" + "aa".repeat(31))).toThrow(/hex/);
  });

  it("rejects odd-length hex", () => {
    expect(() => parseSignHash("abc")).toThrow();
  });

  it("rejects wrong-length hash", () => {
    expect(() => parseSignHash("ab".repeat(16))).toThrow(/32 bytes/);
    expect(() => parseSignHash("ab".repeat(33))).toThrow(/32 bytes/);
    expect(() => parseSignHash("")).toThrow(/32 bytes/);
  });

  it("rejects non-string input", () => {
    expect(() => parseSignHash(undefined)).toThrow();
    expect(() => parseSignHash(null)).toThrow();
    expect(() => parseSignHash(123)).toThrow();
  });
});

describe("parseTopologyHash", () => {
  it("accepts a multihash", () => {
    const mh = "1220" + "ab".repeat(32);
    expect(parseTopologyHash(mh)).toEqual(hexToBytes(mh));
  });

  it("accepts the minimum byte length", () => {
    expect(parseTopologyHash("ab")).toEqual(hexToBytes("ab"));
  });

  it("accepts the maximum byte length", () => {
    const max = "ab".repeat(128);
    expect(parseTopologyHash(max)).toEqual(hexToBytes(max));
  });

  it("rejects one byte over the maximum", () => {
    expect(() => parseTopologyHash("ab".repeat(129))).toThrow(/topology hash/);
  });

  it("rejects empty", () => {
    expect(() => parseTopologyHash("")).toThrow();
  });

  it("rejects oversize", () => {
    expect(() => parseTopologyHash("ab".repeat(200))).toThrow(/topology hash/);
  });

  it("rejects non-hex", () => {
    expect(() => parseTopologyHash("zzzz")).toThrow(/hex/);
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

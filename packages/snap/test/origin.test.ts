import { describe, it, expect } from "vitest";
import { assertSigningOrigin } from "../src/origin.js";

describe("assertSigningOrigin", () => {
  it("accepts any HTTPS origin", () => {
    expect(() => assertSigningOrigin("https://app.canton.example")).not.toThrow();
    expect(() => assertSigningOrigin("https://example.com:8443/anything")).not.toThrow();
  });

  it("accepts HTTP loopback origins", () => {
    expect(() => assertSigningOrigin("http://localhost:3000")).not.toThrow();
    expect(() => assertSigningOrigin("http://127.0.0.1:3000")).not.toThrow();
    expect(() => assertSigningOrigin("http://[::1]:3000")).not.toThrow();
  });

  it("rejects plain HTTP origins that are not loopback", () => {
    expect(() => assertSigningOrigin("http://app.canton.example")).toThrow(/HTTPS/);
    expect(() => assertSigningOrigin("http://example.com")).toThrow(/HTTPS/);
  });

  it("rejects non-http(s) schemes", () => {
    expect(() => assertSigningOrigin("file:///tmp/app.html")).toThrow(/HTTPS/);
    expect(() => assertSigningOrigin("ftp://example.com")).toThrow(/HTTPS/);
    expect(() => assertSigningOrigin("chrome-extension://abc")).toThrow(/HTTPS/);
  });

  it("rejects malformed origins", () => {
    expect(() => assertSigningOrigin("not a url")).toThrow(/Unsupported signing origin/);
    expect(() => assertSigningOrigin("")).toThrow(/Unsupported signing origin/);
  });
});

import { PublicCode } from "./public-code";

describe("PublicCode", () => {
  it("generates a code of correct length", () => {
    const code = PublicCode.generate();
    expect(code.value.length).toBe(12);
  });

  it("generates unique codes", () => {
    const codes = new Set(
      Array.from({ length: 1000 }, () => PublicCode.generate().value),
    );
    expect(codes.size).toBe(1000);
  });

  it("generates codes with valid characters only", () => {
    const alphabet = "0123456789ABCDEFGHJKMNPQRSTVWXYZ";
    for (let i = 0; i < 100; i++) {
      const code = PublicCode.generate();
      expect([...code.value].every((c) => alphabet.includes(c))).toBe(true);
    }
  });

  it("accepts valid code from string", () => {
    const code = PublicCode.generate();
    const restored = PublicCode.fromString(code.value);
    expect(restored.value).toBe(code.value);
  });

  it("rejects too-short code", () => {
    expect(() => PublicCode.fromString("ABC123")).toThrow();
  });

  it("rejects code with invalid characters (I, L, O, U)", () => {
    // Crockford base32 excludes I, L, O, U
    expect(() => PublicCode.fromString("IIIIIIIIIIII")).toThrow();
  });
});

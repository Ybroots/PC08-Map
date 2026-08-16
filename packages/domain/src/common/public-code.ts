import { randomBytes } from "crypto";

/**
 * PublicCode - Random, non-enumerable tracking code for public case lookup
 *
 * From ADR-010: public_code must be random, high-entropy, non-sequential
 * and non-guessable. Citizens use this code to check case status without
 * exposing internal IDs or investigation details.
 *
 * Format: 12-char base32 (Crockford), uppercase
 * Example: "A3KX9M2P7Q4R"
 *
 * No framework/ORM dependencies.
 */
export class PublicCode {
  private static readonly ALPHABET = "0123456789ABCDEFGHJKMNPQRSTVWXYZ";
  private static readonly CODE_LENGTH = 12;

  readonly value: string;

  private constructor(value: string) {
    this.value = value;
  }

  static generate(): PublicCode {
    const bytes = randomBytes(PublicCode.CODE_LENGTH);
    let code = "";
    for (let i = 0; i < PublicCode.CODE_LENGTH; i++) {
      code += PublicCode.ALPHABET[bytes[i]! % PublicCode.ALPHABET.length];
    }
    return new PublicCode(code);
  }

  static fromString(value: string): PublicCode {
    if (!PublicCode.isValid(value)) {
      throw new Error(`Invalid PublicCode format: ${value}`);
    }
    return new PublicCode(value.toUpperCase());
  }

  static isValid(value: string): boolean {
    if (!value || value.length !== PublicCode.CODE_LENGTH) return false;
    const upper = value.toUpperCase();
    return [...upper].every((c) => PublicCode.ALPHABET.includes(c));
  }

  toString(): string {
    return this.value;
  }
}

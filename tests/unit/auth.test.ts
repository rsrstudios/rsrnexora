import { describe, it, expect } from "../framework";
import {
  hashPassword,
  verifyPassword,
  generateSecureToken,
  generateSecureId,
  validatePasswordComplexity,
  validateEmailFormat,
} from "../../server/security/crypto";

export async function runAuthUnitTests() {
  await describe("Unit: Authentication & Cryptography", () => {
    it("should generate a 16-byte random salt and hash password with scrypt", async () => {
      const password = "ProductionSecurePassword123!";
      const { hash, salt } = await hashPassword(password);

      expect(typeof hash).toBe("string");
      expect(typeof salt).toBe("string");
      expect(salt.length).toBe(32); // 16 bytes = 32 hex chars
      expect(hash.length).toBe(128); // 64 bytes = 128 hex chars
    });

    it("should verify correct password using timing-safe comparison", async () => {
      const password = "UserAlphaSecretPass#2026";
      const { hash, salt } = await hashPassword(password);

      const isValid = await verifyPassword(password, hash, salt);
      expect(isValid).toBe(true);
    });

    it("should reject incorrect password safely without timing attack leakage", async () => {
      const password = "CorrectPassword123";
      const { hash, salt } = await hashPassword(password);

      const isInvalid = await verifyPassword("WrongPasswordAttempt", hash, salt);
      expect(isInvalid).toBe(false);
    });

    it("should generate cryptographically strong tokens with high entropy", () => {
      const token1 = generateSecureToken(32);
      const token2 = generateSecureToken(32);

      expect(typeof token1).toBe("string");
      expect(token1.length).toBe(64); // 32 bytes = 64 hex characters
      expect(token1 !== token2).toBe(true);
    });

    it("should generate prefixed secure IDs with timestamp and entropy", () => {
      const userId = generateSecureId("usr");
      const convId = generateSecureId("conv");
      const wsId = generateSecureId("ws");

      expect(userId.startsWith("usr_")).toBe(true);
      expect(convId.startsWith("conv_")).toBe(true);
      expect(wsId.startsWith("ws_")).toBe(true);
      expect(userId !== convId).toBe(true);
    });

    it("should enforce strong password complexity requirements", () => {
      const weakShort = validatePasswordComplexity("abc");
      expect(weakShort.valid).toBe(false);

      const validComplex = validatePasswordComplexity("SafePass123!");
      expect(validComplex.valid).toBe(true);
    });

    it("should strictly validate email addresses against malformed inputs", () => {
      expect(validateEmailFormat("user@example.com")).toBe(true);
      expect(validateEmailFormat("admin.pro@rsr-ai.internal")).toBe(true);
      expect(validateEmailFormat("invalid-email-no-at")).toBe(false);
      expect(validateEmailFormat("@missing-user.com")).toBe(false);
      expect(validateEmailFormat("user@missing-tld")).toBe(false);
    });
  });
}

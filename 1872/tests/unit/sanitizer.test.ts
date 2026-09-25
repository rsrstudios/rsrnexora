import { describe, it, expect } from "../framework";
import {
  sanitizeFilename,
  sanitizeUntrustedText,
  neutralizeDangerousMarkup,
  generateStorageFilename,
  isSafeRedirectPath,
} from "../../server/security/sanitizer";

export async function runSanitizerUnitTests() {
  await describe("Unit: Sanitization & Path Traversal Prevention", () => {
    it("should strip directory traversal sequences from filenames", () => {
      expect(sanitizeFilename("../../etc/passwd")).toBe("passwd");
      expect(sanitizeFilename("..\\..\\windows\\system32\\cmd.exe")).toBe("cmd.exe");
      expect(sanitizeFilename("folder/subfolder/document.pdf")).toBe("document.pdf");
    });

    it("should strip dangerous shell characters and control bytes from filenames", () => {
      expect(sanitizeFilename("test;rm -rf;.txt")).toBe("testrm -rf.txt");
      expect(sanitizeFilename("file*with?wildcards<.txt")).toBe("filewithwildcards.txt");
      expect(sanitizeFilename("   spaced_file.pdf   ")).toBe("spaced_file.pdf");
    });

    it("should provide safe fallback for empty or completely stripped filenames", () => {
      expect(sanitizeFilename("")).toBe("unnamed_attachment.bin");
      expect(sanitizeFilename("///")).toBe("unnamed_attachment.bin");
      expect(sanitizeFilename("...")).toBe("unnamed_attachment.bin");
    });

    it("should generate collision-resistant storage filenames", () => {
      const storageName1 = generateStorageFilename("report.pdf");
      const storageName2 = generateStorageFilename("report.pdf");

      expect(storageName1.endsWith(".pdf")).toBe(true);
      expect(storageName2.endsWith(".pdf")).toBe(true);
      expect(storageName1 !== storageName2).toBe(true); // Random UUID component
    });

    it("should enforce maximum length bounds and strip control codes on untrusted text", () => {
      const longInput = "a".repeat(15000);
      const sanitized = sanitizeUntrustedText(longInput, 1000);
      expect(sanitized.length).toBe(1000);

      const withNullBytes = "Hello\u0000World\u001F!";
      const cleaned = sanitizeUntrustedText(withNullBytes, 50);
      expect(cleaned).toBe("HelloWorld!");
    });

    it("should neutralize dangerous script and iframe HTML tags", () => {
      const xssAttempt = "<script>alert('XSS')</script>";
      const neutralized = neutralizeDangerousMarkup(xssAttempt);
      expect(neutralized.includes("<script>")).toBe(false);
      expect(neutralized.includes("&lt;script&gt;")).toBe(true);

      const iframeAttempt = "<iframe src='evil.com'></iframe>";
      const iframeNeutralized = neutralizeDangerousMarkup(iframeAttempt);
      expect(iframeNeutralized.includes("<iframe")).toBe(false);
      expect(iframeNeutralized.includes("&lt;iframe")).toBe(true);
    });

    it("should prevent open redirect vulnerabilities", () => {
      expect(isSafeRedirectPath("/app")).toBe(true);
      expect(isSafeRedirectPath("/workspace/123")).toBe(true);
      expect(isSafeRedirectPath("https://attacker.com")).toBe(false);
      expect(isSafeRedirectPath("//evil.com")).toBe(false);
      expect(isSafeRedirectPath("javascript:alert(1)")).toBe(false);
    });
  });
}

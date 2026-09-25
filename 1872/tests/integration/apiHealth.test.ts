import { describe, it, expect } from "../framework";
import { getTestBaseUrl } from "../testServer";

export async function runApiHealthTests() {
  await describe("Integration: Health Check & Security Posture Headers", () => {
    const baseUrl = getTestBaseUrl();

    it("GET /api/health - should return valid status, v5.0 version, and capabilities", async () => {
      const res = await fetch(`${baseUrl}/api/health`);
      expect(res.status).toBe(200);

      const data = await res.json();
      expect(data.status).toBe("ok");
      expect(data.app).toBe("RSR Nexora");
      expect(data.packageId).toBe("com.rsr.nexora");
      expect(data.version).toBe("5.0.0-production-qa");
      expect(data.security.headersEnabled).toBe(true);
      expect(data.security.authEngine).toBe("scrypt-salt-sessions");
      expect(data.security.promptDefense).toBe("4-tier-trust-hierarchy");
      expect(Array.isArray(data.capabilities)).toBe(true);
      expect(data.capabilities).toContain("smart-chat-modes");
      expect(data.capabilities).toContain("web-search-grounding");
      expect(data.capabilities).toContain("ai-image-generation");
      expect(data.capabilities).toContain("workspaces");
    });

    it("Security Headers - should include hardened HTTP protection headers on all responses", async () => {
      const res = await fetch(`${baseUrl}/api/health`);

      // X-Content-Type-Options
      expect(res.headers.get("x-content-type-options")).toBe("nosniff");

      // X-Frame-Options
      expect(res.headers.get("x-frame-options")).toBe("SAMEORIGIN");

      // Referrer-Policy
      expect(res.headers.get("referrer-policy")).toBe("strict-origin-when-cross-origin");

      // Content-Security-Policy
      const csp = res.headers.get("content-security-policy");
      expect(csp !== null).toBe(true);
      expect(csp!).toContain("default-src");

      // X-Powered-By should be stripped
      expect(res.headers.get("x-powered-by")).toBeNull();
    });
  });
}

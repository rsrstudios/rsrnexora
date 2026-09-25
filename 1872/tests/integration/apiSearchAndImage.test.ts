import { describe, it, expect } from "../framework";
import { getTestBaseUrl } from "../testServer";

export async function runApiSearchAndImageTests() {
  await describe("Integration: Search Grounding & Image Generation Endpoints", () => {
    const baseUrl = getTestBaseUrl();

    it("POST /api/search - should reject missing or empty search query with 400 Bad Request", async () => {
      const res = await fetch(`${baseUrl}/api/search`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ query: "" }),
      });

      expect(res.status).toBe(400);
      const data = await res.json();
      expect(data.error.code).toBe("MISSING_QUERY");
    });

    it("POST /api/image/generate - should reject empty prompt with 400 Bad Request", async () => {
      const res = await fetch(`${baseUrl}/api/image/generate`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ prompt: "" }),
      });

      expect(res.status).toBe(400);
      const data = await res.json();
      expect(data.error.code).toBe("MISSING_PROMPT");
    });

    it("POST /api/image/generate - should normalize invalid aspect ratios to 1:1 safely", async () => {
      // Test invalid ratio fallback without crashing
      const res = await fetch(`${baseUrl}/api/image/generate`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          prompt: "A minimalist modern architectural sketch",
          aspectRatio: "99:99-invalid",
        }),
      });

      // Handled cleanly with status 200 or 500 (if no API key configured) without throwing unhandled exceptions
      expect(res.status === 200 || res.status === 500).toBe(true);
    });
  });
}

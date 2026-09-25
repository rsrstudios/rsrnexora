import { describe, it, expect } from "../framework";
import { getTestBaseUrl } from "../testServer";

export async function runApiChatTests() {
  await describe("Integration: AI Chat & Streaming Endpoints", () => {
    const baseUrl = getTestBaseUrl();

    it("POST /api/chat - should reject empty or missing messages array with 400 Bad Request", async () => {
      const res = await fetch(`${baseUrl}/api/chat`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ messages: [] }),
      });

      expect(res.status).toBe(400);
      const data = await res.json();
      expect(data.error.code).toBe("INVALID_MESSAGES");
    });

    it("POST /api/chat - should reject messages exceeding character safety limits", async () => {
      const hugeMessage = "A".repeat(100005);
      const res = await fetch(`${baseUrl}/api/chat`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          messages: [{ role: "user", content: hugeMessage }],
        }),
      });

      // Handled either by rateLimiter or 400 / 413
      expect(res.status >= 400).toBe(true);
    });

    it("POST /api/chat/stream - should return SSE headers for valid streaming request", async () => {
      const res = await fetch(`${baseUrl}/api/chat/stream`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          messages: [{ role: "user", content: "Hello RSR AI" }],
          mode: "chat",
        }),
      });

      expect(res.status).toBe(200);
      const contentType = res.headers.get("content-type") || "";
      expect(contentType).toContain("text/event-stream");
      const cacheControl = res.headers.get("cache-control") || "";
      expect(cacheControl).toContain("no-cache");

      // Read at least the initial SSE chunk and cancel cleanly
      const reader = res.body?.getReader();
      if (reader) {
        const { value } = await reader.read();
        const text = new TextDecoder().decode(value);
        expect(text.includes("data:")).toBe(true);
        await reader.cancel();
      }
    });
  });
}

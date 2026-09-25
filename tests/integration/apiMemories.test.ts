import { describe, it, expect } from "../framework";
import { getTestBaseUrl } from "../testServer";

export async function runApiMemoriesTests() {
  await describe("Integration: Memory Management & Authorization Isolation", () => {
    const baseUrl = getTestBaseUrl();
    let user1Cookie = "";
    let user2Cookie = "";
    let createdMemoryId = "";

    it("setup user sessions for memory testing", async () => {
      const email1 = `qa_mem1_${Date.now()}@rsr-ai.test`;
      const res1 = await fetch(`${baseUrl}/api/auth/register`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: email1, password: "Password123!", name: "Mem User 1" }),
      });
      user1Cookie = res1.headers.get("set-cookie")!.split(";")[0];

      const email2 = `qa_mem2_${Date.now()}@rsr-ai.test`;
      const res2 = await fetch(`${baseUrl}/api/auth/register`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: email2, password: "Password123!", name: "Mem User 2" }),
      });
      user2Cookie = res2.headers.get("set-cookie")!.split(";")[0];
    });

    it("POST /api/memories - should create explicit memory item", async () => {
      const res = await fetch(`${baseUrl}/api/memories`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Cookie: user1Cookie,
        },
        body: JSON.stringify({
          content: "User prefers concise answers with TypeScript examples",
          category: "preference",
        }),
      });

      expect(res.status).toBe(201);
      const data = await res.json();
      expect(data.success).toBe(true);
      expect(data.memory.content).toContain("User prefers concise answers");
      createdMemoryId = data.memory.id;
    });

    it("GET /api/memories - should list only the authenticated user's memories", async () => {
      const res = await fetch(`${baseUrl}/api/memories`, {
        headers: { Cookie: user1Cookie },
      });

      expect(res.status).toBe(200);
      const data = await res.json();
      expect(Array.isArray(data.memories)).toBe(true);
      expect(data.memories.some((m: any) => m.id === createdMemoryId)).toBe(true);

      // User 2 sees an empty list (complete isolation)
      const resUser2 = await fetch(`${baseUrl}/api/memories`, {
        headers: { Cookie: user2Cookie },
      });
      const dataUser2 = await resUser2.json();
      expect(dataUser2.memories.some((m: any) => m.id === createdMemoryId)).toBe(false);
    });

    it("AUTHORIZATION: User 2 cannot delete User 1 memory", async () => {
      const deleteAttempt = await fetch(`${baseUrl}/api/memories/${createdMemoryId}`, {
        method: "DELETE",
        headers: { Cookie: user2Cookie },
      });

      expect(deleteAttempt.status).toBe(404); // Safe denial: not found for User 2
    });

    it("DELETE /api/memories/:id - should delete memory item for authorized owner", async () => {
      const res = await fetch(`${baseUrl}/api/memories/${createdMemoryId}`, {
        method: "DELETE",
        headers: { Cookie: user1Cookie },
      });

      expect(res.status).toBe(200);
      const data = await res.json();
      expect(data.success).toBe(true);
    });
  });
}

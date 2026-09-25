import { describe, it, expect } from "../framework";
import { getTestBaseUrl } from "../testServer";

export async function runApiWorkspacesTests() {
  await describe("Integration: Workspaces & Authorization Isolation", () => {
    const baseUrl = getTestBaseUrl();
    let user1Cookie = "";
    let user2Cookie = "";
    let createdWsId = "";
    let defaultWsId = "";

    // Register User 1
    it("setup User 1 session", async () => {
      const email1 = `qa_ws1_${Date.now()}@rsr-ai.test`;
      const res = await fetch(`${baseUrl}/api/auth/register`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: email1, password: "Password123!", name: "WS User 1" }),
      });
      expect(res.status).toBe(201);
      user1Cookie = res.headers.get("set-cookie")!.split(";")[0];
    });

    // Register User 2
    it("setup User 2 session", async () => {
      const email2 = `qa_ws2_${Date.now()}@rsr-ai.test`;
      const res = await fetch(`${baseUrl}/api/auth/register`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: email2, password: "Password123!", name: "WS User 2" }),
      });
      expect(res.status).toBe(201);
      user2Cookie = res.headers.get("set-cookie")!.split(";")[0];
    });

    it("GET /api/workspaces - should list default workspace for authenticated user", async () => {
      const res = await fetch(`${baseUrl}/api/workspaces`, {
        headers: { Cookie: user1Cookie },
      });

      expect(res.status).toBe(200);
      const data = await res.json();
      expect(Array.isArray(data.workspaces)).toBe(true);
      expect(data.workspaces.length).toBe(1);
      expect(data.workspaces[0].isDefault).toBe(true);
      defaultWsId = data.workspaces[0].id;
    });

    it("POST /api/workspaces - should create custom workspace", async () => {
      const res = await fetch(`${baseUrl}/api/workspaces`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Cookie: user1Cookie,
        },
        body: JSON.stringify({
          name: "Security Engineering",
          description: "Workspace for code reviews and QA audits",
          customInstructions: "Prioritize memory safety and strict validation.",
        }),
      });

      expect(res.status).toBe(201);
      const data = await res.json();
      expect(data.success).toBe(true);
      expect(data.workspace.name).toBe("Security Engineering");
      createdWsId = data.workspace.id;
    });

    it("PATCH /api/workspaces/:id - should update workspace metadata", async () => {
      const res = await fetch(`${baseUrl}/api/workspaces/${createdWsId}`, {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
          Cookie: user1Cookie,
        },
        body: JSON.stringify({
          name: "Security Engineering v5",
          description: "Updated workspace description",
        }),
      });

      expect(res.status).toBe(200);
      const data = await res.json();
      expect(data.workspace.name).toBe("Security Engineering v5");
    });

    it("AUTHORIZATION: User 2 cannot access or modify User 1 workspace", async () => {
      // User 2 attempts to patch User 1 workspace
      const patchAttempt = await fetch(`${baseUrl}/api/workspaces/${createdWsId}`, {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
          Cookie: user2Cookie,
        },
        body: JSON.stringify({ name: "Hijacked Workspace Name" }),
      });

      expect(patchAttempt.status).toBe(404); // Safe denial: resource not found for User 2

      // User 2 attempts to delete User 1 workspace
      const deleteAttempt = await fetch(`${baseUrl}/api/workspaces/${createdWsId}`, {
        method: "DELETE",
        headers: { Cookie: user2Cookie },
      });

      expect(deleteAttempt.status).toBe(404);
    });

    it("DELETE /api/workspaces/:id - should reject deletion of default workspace", async () => {
      const res = await fetch(`${baseUrl}/api/workspaces/${defaultWsId}`, {
        method: "DELETE",
        headers: { Cookie: user1Cookie },
      });

      expect(res.status >= 400).toBe(true);
    });

    it("DELETE /api/workspaces/:id - should delete custom workspace", async () => {
      const res = await fetch(`${baseUrl}/api/workspaces/${createdWsId}`, {
        method: "DELETE",
        headers: { Cookie: user1Cookie },
      });

      expect(res.status).toBe(200);
      const data = await res.json();
      expect(data.success).toBe(true);
    });
  });
}

import { describe, it, expect } from "../framework";
import { getTestBaseUrl } from "../testServer";

export async function runApiBackupTests() {
  await describe("Integration: Backup Export, Import & Isolation", () => {
    const baseUrl = getTestBaseUrl();
    let authCookie = "";
    let exportedArchive: any = null;

    it("setup user session for backup testing", async () => {
      const email = `qa_backup_${Date.now()}@rsr-ai.test`;
      const res = await fetch(`${baseUrl}/api/auth/register`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, password: "Password123!", name: "Backup User" }),
      });
      authCookie = res.headers.get("set-cookie")!.split(";")[0];
    });

    it("GET /api/backup/export - should generate complete and valid JSON backup", async () => {
      const res = await fetch(`${baseUrl}/api/backup/export`, {
        headers: { Cookie: authCookie },
      });

      expect(res.status).toBe(200);
      const contentType = res.headers.get("content-type") || "";
      expect(contentType).toContain("application/json");

      exportedArchive = await res.json();
      expect(exportedArchive.version).toBeDefined();
      expect(exportedArchive.user).toBeDefined();
      expect(Array.isArray(exportedArchive.workspaces)).toBe(true);
      expect(Array.isArray(exportedArchive.conversations)).toBe(true);
      expect(Array.isArray(exportedArchive.memories)).toBe(true);
    });

    it("POST /api/backup/import - should restore valid backup archive", async () => {
      const testBackup = {
        conversations: [
          {
            title: "Restored Project Roadmap",
            messages: [{ role: "user", content: "Milestones for Q3" }],
            workspaceId: "default",
          },
        ],
        memories: [
          {
            content: "Restored preference: Always format code with 2 spaces",
            category: "preference",
          },
        ],
        workspaces: [
          {
            name: "Restored DevOps Space",
            description: "Restored from archive",
          },
        ],
      };

      const res = await fetch(`${baseUrl}/api/backup/import`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Cookie: authCookie,
        },
        body: JSON.stringify(testBackup),
      });

      expect(res.status).toBe(200);
      const data = await res.json();
      expect(data.success).toBe(true);
      expect(data.restored.conversations).toBe(1);
      expect(data.restored.memories).toBe(1);
      expect(data.restored.workspaces).toBe(1);
    });

    it("POST /api/backup/import - should safely reject malformed or corrupted archive with 400 Bad Request", async () => {
      const res = await fetch(`${baseUrl}/api/backup/import`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Cookie: authCookie,
        },
        body: JSON.stringify({ invalidField: "Not a backup" }),
      });

      expect(res.status).toBe(400);
      const data = await res.json();
      expect(data.error.code).toBe("MALFORMED_BACKUP");
    });
  });
}

import { describe, it, expect } from "../framework";
import { db } from "../../server/db/database";

export async function runDatabaseUnitTests() {
  await describe("Unit: Database Layer & Data Isolation", () => {
    let user1Id: string;
    let user2Id: string;
    let user1WsId: string;
    let user1ConvId: string;
    let user1MemId: string;

    it("should register a user and automatically provision their default workspace", async () => {
      const email = `unit_user1_${Date.now()}@example.com`;
      const user = await db.createUser({
        email,
        name: "Unit User One",
        passwordHash: "hash123",
        passwordSalt: "salt123",
      });

      user1Id = user.id;
      expect(user.id.startsWith("usr_") || /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(user.id)).toBe(true);
      expect(user.email).toBe(email);

      const workspaces = await db.listWorkspaces(user1Id);
      expect(workspaces.length).toBe(1);
      expect(workspaces[0].isDefault).toBe(true);
      expect(workspaces[0].name).toBe("Default Workspace");
      user1WsId = workspaces[0].id;
    });

    it("should prevent duplicate user registration with same email", async () => {
      const user = await db.findUserById(user1Id);
      expect(user).toBeDefined();

      let failed = false;
      try {
        await db.createUser({
          email: user!.email,
          name: "Duplicate User",
          passwordHash: "hash",
          passwordSalt: "salt",
        });
      } catch (err: any) {
        failed = true;
        expect(err.message).toContain("already exists");
      }
      expect(failed).toBe(true);
    });

    it("should create a second user with distinct credentials and workspace", async () => {
      const email2 = `unit_user2_${Date.now()}@example.com`;
      const user2 = await db.createUser({
        email: email2,
        name: "Unit User Two",
        passwordHash: "hash456",
        passwordSalt: "salt456",
      });

      user2Id = user2.id;
      expect(user2.id !== user1Id).toBe(true);

      const workspaces2 = await db.listWorkspaces(user2Id);
      expect(workspaces2.length).toBe(1);
      expect(workspaces2[0].userId).toBe(user2Id);
      expect(workspaces2[0].id !== user1WsId).toBe(true);
    });

    it("should enforce strict workspace isolation (User 2 cannot access User 1 workspace)", async () => {
      const ws = await db.getWorkspace(user2Id, user1WsId);
      expect(ws).toBeNull(); // Authorization denies access

      const deleted = await db.deleteWorkspace(user2Id, user1WsId);
      expect(deleted).toBe(false); // Authorization denies deletion
    });

    it("should protect default workspace from deletion", async () => {
      let threw = false;
      try {
        await db.deleteWorkspace(user1Id, user1WsId);
      } catch (err: any) {
        threw = true;
        expect(err.message).toContain("Cannot delete default workspace");
      }
      expect(threw).toBe(true);
    });

    it("should create and isolate conversations between users", async () => {
      const conv = await db.saveConversation(user1Id, {
        title: "Confidential Project Strategy",
        messages: [{ role: "user", content: "User 1 private message" }],
        workspaceId: user1WsId,
      });

      user1ConvId = conv.id;
      expect(conv.userId).toBe(user1Id);

      // User 2 cannot access User 1 conversation
      const crossFetch = await db.getConversation(user2Id, user1ConvId);
      expect(crossFetch).toBeNull();

      // User 2 cannot delete User 1 conversation
      const crossDelete = await db.deleteConversation(user2Id, user1ConvId);
      expect(crossDelete).toBe(false);

      // User 2 cannot overwrite User 1 conversation
      let modifyFailed = false;
      try {
        await db.saveConversation(user2Id, {
          id: user1ConvId,
          title: "Hijacked Title",
        });
      } catch (err: any) {
        modifyFailed = true;
        expect(err.message).toContain("Unauthorized to modify");
      }
      expect(modifyFailed).toBe(true);
    });

    it("should create and isolate user memories", async () => {
      const mem = await db.createMemory(user1Id, {
        content: "User 1 prefers dark theme and Python",
        category: "preference",
      });

      user1MemId = mem.id;
      expect(mem.userId).toBe(user1Id);

      // User 2 listing does not include User 1 memory
      const user2Memories = await db.listMemories(user2Id);
      expect(user2Memories.find((m) => m.id === user1MemId)).toBeUndefined();

      // User 2 cannot delete User 1 memory
      const crossDelete = await db.deleteMemory(user2Id, user1MemId);
      expect(crossDelete).toBe(false);
    });

    it("should export only the authenticated user's own data in backup archive", async () => {
      const backup = await db.exportUserData(user1Id);

      expect(backup.user.id).toBe(user1Id);
      expect(backup.conversations.length).toBeGreaterThan(0);
      expect(backup.conversations.every((c: any) => c.userId === user1Id)).toBe(true);
      expect(backup.workspaces.every((w: any) => w.userId === user1Id)).toBe(true);
      expect(backup.memories.every((m: any) => m.userId === user1Id)).toBe(true);
    });
  });
}

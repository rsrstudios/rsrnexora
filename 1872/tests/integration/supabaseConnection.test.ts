/**
 * RSR NEXORA — SUPABASE CONNECTION & ISOLATION TEST SUITE
 * Product: RSR Nexora | Studio: RSR Studios | Package ID: com.rsr.nexora
 */

import { describe, it, expect } from "../framework";
import { supabaseService } from "../../server/db/supabaseClient";
import { supabaseRepo } from "../../server/db/supabaseRepository";
import { getTestBaseUrl } from "../testServer";

export async function runSupabaseConnectionTests() {
  await describe("Integration: Supabase Connection & User Isolation", () => {
    const baseUrl = getTestBaseUrl();

    it("Supabase Client - status summary should accurately report configuration without leaking secrets", async () => {
      const summary = supabaseService.getStatusSummary();
      expect(typeof summary.configured).toBe("boolean");
      expect(Array.isArray(summary.missing)).toBe(true);
      expect(typeof summary.urlConfigured).toBe("boolean");
      expect(typeof summary.anonKeyConfigured).toBe("boolean");
      expect(typeof summary.serviceRoleKeyConfigured).toBe("boolean");

      // Verify no secrets are present in the summary object
      const jsonString = JSON.stringify(summary);
      expect(jsonString.includes("secret")).toBe(false);
      expect(jsonString.includes("service_role")).toBe(false);
    });

    it("GET /api/health - should report database and Supabase configuration posture securely", async () => {
      const res = await fetch(`${baseUrl}/api/health`);
      expect(res.status).toBe(200);
      const data = await res.json();
      expect(data.database).toBeDefined();
      expect(data.database.supabase).toBeDefined();
      expect(typeof data.database.supabase.configured).toBe("boolean");
      expect(Array.isArray(data.database.supabase.missing)).toBe(true);

      // Verify no API keys or secret values are returned in the response
      const responseText = JSON.stringify(data);
      expect(responseText.includes("eyJh")).toBe(false); // standard JWT header prefix
    });

    it("GET /api/health/database - should provide connectivity diagnostics", async () => {
      const res = await fetch(`${baseUrl}/api/health/database`);
      expect(res.status === 200 || res.status === 503).toBe(true);
      const data = await res.json();
      expect(data.status).toBeDefined();
      expect(typeof data.configured).toBe("boolean");

      if (!data.configured) {
        expect(res.status).toBe(503);
        expect(data.status).toBe("unconfigured");
      } else if (data.status === "permission_grant_required") {
        expect(res.status).toBe(503);
        expect(data.reachable).toBe(true);
        expect(Array.isArray(data.tablesDetected)).toBe(true);
        expect(data.tablesDetected.length).toBeGreaterThan(0);
      } else if (data.status === "connected") {
        expect(res.status).toBe(200);
        expect(data.reachable).toBe(true);
      }
    });

    // Real Supabase Connection Test
    if (supabaseService.isConfigured()) {
      it("Supabase Real Test - should verify reachability, schema tables, and isolation posture", async () => {
        const testResult = await supabaseService.testConnection();
        expect(testResult).toBeDefined();
        expect(typeof testResult.message).toBe("string");
        expect(Array.isArray(testResult.tablesDetected)).toBe(true);
        expect(testResult.tablesDetected!.length).toBeGreaterThan(0);

        if (testResult.success) {
          const client = supabaseService.getAdminClient();
          expect(client !== null).toBe(true);

          // 1. Create a test user
          const testEmail = `qa_test_${Date.now()}@rsr-nexora.test`;
          const testUser = await supabaseRepo.createUser({
            email: testEmail,
            name: "QA Supabase Verification User",
            isGuest: false,
          });
          expect(testUser.id).toBeDefined();
          expect(testUser.email).toBe(testEmail);

          try {
            // 2. Create and retrieve test conversation
            const conv = await supabaseRepo.saveConversation(testUser.id, {
              title: "Supabase QA Live Verification",
              messages: [{ id: "m1", role: "user", content: "Testing live persistence" }],
            });
            expect(conv.id).toBeDefined();

            const retrievedConv = await supabaseRepo.getConversation(testUser.id, conv.id);
            expect(retrievedConv !== null).toBe(true);
            expect(retrievedConv!.title).toBe("Supabase QA Live Verification");

            // 3. Verify user isolation (User B cannot access User A's conversation)
            const otherUserId = "usr_unauthorized_attacker_9999";
            const unauthorizedAccess = await supabaseRepo.getConversation(otherUserId, conv.id);
            expect(unauthorizedAccess).toBeNull();

            // 4. Create and retrieve test memory
            const mem = await supabaseRepo.createMemory(testUser.id, {
              content: "Supabase persistence active",
              category: "fact",
            });
            expect(mem.id).toBeDefined();

            const memories = await supabaseRepo.listMemories(testUser.id);
            expect(memories.some((m) => m.id === mem.id)).toBe(true);

            // User B cannot access User A's memories
            const unauthorizedMemories = await supabaseRepo.listMemories(otherUserId);
            expect(unauthorizedMemories.some((m) => m.id === mem.id)).toBe(false);

            // 5. Clean up test records
            await supabaseRepo.deleteConversation(testUser.id, conv.id);
            await supabaseRepo.deleteMemory(testUser.id, mem.id);

            // Verify cleanup
            const deletedConv = await supabaseRepo.getConversation(testUser.id, conv.id);
            expect(deletedConv).toBeNull();
          } finally {
            // Delete test user
            if (client) {
              await client.from("users").delete().eq("id", testUser.id);
            }
          }
        } else {
          // Verify that when permission grant is required, it correctly identified code 42501
          expect(testResult.code === "42501" || testResult.error?.includes("permission denied")).toBe(true);
          expect(testResult.tablesDetected!.includes("users")).toBe(true);
          expect(testResult.tablesDetected!.includes("conversations")).toBe(true);
        }
      });
    } else {
      it("Supabase Credentials Guard - should report missing configuration safely without crashing", async () => {
        const testResult = await supabaseService.testConnection();
        expect(testResult.success).toBe(false);
        expect(testResult.missing.length).toBeGreaterThan(0);
        expect(testResult.error).toBe("MISSING_CREDENTIALS");
      });
    }
  });
}

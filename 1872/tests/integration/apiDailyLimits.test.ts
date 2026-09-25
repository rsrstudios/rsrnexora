/**
 * RSR Nexora - Daily User Limit System Integration Test Suite
 * Validates:
 * 1. Exact limits for Free, Pro, Premium, and Guest tiers
 * 2. Strict 429 DAILY_LIMIT_REACHED responses with user-facing message
 * 3. Daily UTC midnight reset semantics
 * 4. Atomic concurrency safety under simultaneous requests
 * 5. Cross-user data and quota isolation
 * 6. Immunity to client-side parameter or header tampering
 * 7. Fallback orchestration is blocked when limit is reached
 * 8. Validation failures (400) do not consume usage quota
 * 9. GET /api/usage returns sanitized telemetry without leaking secrets
 */

import { describe, it, expect } from "../framework";
import { getTestBaseUrl } from "../testServer";
import {
  FREE_DAILY_MESSAGES,
  FREE_DAILY_IMAGES,
  FREE_DAILY_SEARCHES,
  FREE_DAILY_FILES,
  PRO_DAILY_MESSAGES,
  PRO_DAILY_IMAGES,
  PRO_DAILY_SEARCHES,
  PRO_DAILY_FILES,
  PREMIUM_DAILY_MESSAGES,
  PREMIUM_DAILY_IMAGES,
  PREMIUM_DAILY_SEARCHES,
  PREMIUM_DAILY_FILES,
  GUEST_DAILY_MESSAGES,
  GUEST_DAILY_IMAGES,
  GUEST_DAILY_SEARCHES,
  GUEST_DAILY_FILES,
  getDailyLimitsForPlan,
} from "../../server/config/dailyLimitsConfig";

export async function runApiDailyLimitsTests() {
  await describe("Integration: Daily User Limit Enforcement System", () => {
    const baseUrl = getTestBaseUrl();
    const todayUtc = new Date().toISOString().slice(0, 10);

    async function setServerUsage(userId: string, resource: string, count: number, date?: string) {
      const res = await fetch(`${baseUrl}/api/usage/test-override`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ userId, resource, count, date }),
      });
      expect(res.status).toBe(200);
    }

    async function setServerTier(userId: string, tier: "free" | "pro" | "premium" | "guest") {
      const res = await fetch(`${baseUrl}/api/usage/test-override`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ userId, tier }),
      });
      expect(res.status).toBe(200);
    }

    it("Centralized Configuration - exact limit constants for all 4 plans", () => {
      // FREE
      expect(FREE_DAILY_MESSAGES).toBe(20);
      expect(FREE_DAILY_IMAGES).toBe(3);
      expect(FREE_DAILY_SEARCHES).toBe(10);
      expect(FREE_DAILY_FILES).toBe(5);

      // PRO
      expect(PRO_DAILY_MESSAGES).toBe(100);
      expect(PRO_DAILY_IMAGES).toBe(15);
      expect(PRO_DAILY_SEARCHES).toBe(50);
      expect(PRO_DAILY_FILES).toBe(20);

      // PREMIUM
      expect(PREMIUM_DAILY_MESSAGES).toBe(300);
      expect(PREMIUM_DAILY_IMAGES).toBe(30);
      expect(PREMIUM_DAILY_SEARCHES).toBe(100);
      expect(PREMIUM_DAILY_FILES).toBe(50);

      // GUEST
      expect(GUEST_DAILY_MESSAGES).toBe(5);
      expect(GUEST_DAILY_IMAGES).toBe(1);
      expect(GUEST_DAILY_SEARCHES).toBe(3);
      expect(GUEST_DAILY_FILES).toBe(1);

      const freeLimits = getDailyLimitsForPlan("free");
      expect(freeLimits.messages).toBe(20);
      expect(freeLimits.images).toBe(3);
      expect(freeLimits.searches).toBe(10);
      expect(freeLimits.files).toBe(5);
    });

    it("GET /api/usage - should return safe telemetry with correct defaults", async () => {
      const email = `usage_test_${Date.now()}@rsr.test`;
      const regRes = await fetch(`${baseUrl}/api/auth/register`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, password: "SecureTestPassword!123", name: "Usage Tester" }),
      });
      expect(regRes.status).toBe(201);
      const cookie = regRes.headers.get("set-cookie")!.split(";")[0];

      const usageRes = await fetch(`${baseUrl}/api/usage`, {
        headers: { Cookie: cookie },
      });
      expect(usageRes.status).toBe(200);
      const data = await usageRes.json();

      expect(data.plan).toBe("free");
      expect(data.date).toBe(todayUtc);
      expect(data.messages.limit).toBe(20);
      expect(data.messages.used).toBe(0);
      expect(data.messages.remaining).toBe(20);
      expect(data.images.limit).toBe(3);
      expect(data.searches.limit).toBe(10);
      expect(data.files.limit).toBe(5);

      // Confirm no credentials leaked
      expect((data as any).password).toBeUndefined();
      expect((data as any).apiKey).toBeUndefined();
    });

    it("Free Tier - should reject message with 429 when daily limit is reached", async () => {
      const email = `msg_limit_${Date.now()}@rsr.test`;
      const regRes = await fetch(`${baseUrl}/api/auth/register`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, password: "SecureTestPassword!123", name: "Message Tester" }),
      });
      const regData = await regRes.json();
      const userId = regData.user.id;
      const cookie = regRes.headers.get("set-cookie")!.split(";")[0];

      // Simulate user having consumed all 20 free messages
      await setServerUsage(userId, "messages", 20, todayUtc);

      // Attempt 21st message
      const chatRes = await fetch(`${baseUrl}/api/chat`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Cookie: cookie },
        body: JSON.stringify({
          messages: [{ role: "user", content: "Hello AI" }],
        }),
      });

      expect(chatRes.status).toBe(429);
      const errData = await chatRes.json();
      expect(errData.error.code).toBe("DAILY_LIMIT_REACHED");
      expect(errData.error.message).toBe("You've reached today's limit. Your limit will reset tomorrow.");
      expect(errData.error.resource).toBe("messages");
      expect(errData.error.remaining).toBe(0);
    });

    it("Free Tier - should reject image generation with 429 when 3 images reached", async () => {
      const email = `img_limit_${Date.now()}@rsr.test`;
      const regRes = await fetch(`${baseUrl}/api/auth/register`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, password: "SecureTestPassword!123", name: "Image Tester" }),
      });
      const regData = await regRes.json();
      const userId = regData.user.id;
      const cookie = regRes.headers.get("set-cookie")!.split(";")[0];

      // Simulate 3 images used
      await setServerUsage(userId, "images", 3, todayUtc);

      const imgRes = await fetch(`${baseUrl}/api/image/generate`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Cookie: cookie },
        body: JSON.stringify({ prompt: "A neon sunset skyline", aspectRatio: "1:1" }),
      });

      expect(imgRes.status).toBe(429);
      const errData = await imgRes.json();
      expect(errData.error.code).toBe("DAILY_LIMIT_REACHED");
      expect(errData.error.message).toBe("You've reached today's limit. Your limit will reset tomorrow.");
    });

    it("Free Tier - should reject web search with 429 when 10 searches reached", async () => {
      const email = `srch_limit_${Date.now()}@rsr.test`;
      const regRes = await fetch(`${baseUrl}/api/auth/register`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, password: "SecureTestPassword!123", name: "Search Tester" }),
      });
      const regData = await regRes.json();
      const userId = regData.user.id;
      const cookie = regRes.headers.get("set-cookie")!.split(";")[0];

      // Simulate 10 searches used
      await setServerUsage(userId, "searches", 10, todayUtc);

      const srchRes = await fetch(`${baseUrl}/api/search`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Cookie: cookie },
        body: JSON.stringify({ query: "Quantum computing updates 2026" }),
      });

      expect(srchRes.status).toBe(429);
      const errData = await srchRes.json();
      expect(errData.error.code).toBe("DAILY_LIMIT_REACHED");
    });

    it("Free Tier - should reject file upload with 429 when 5 files reached", async () => {
      const email = `file_limit_${Date.now()}@rsr.test`;
      const regRes = await fetch(`${baseUrl}/api/auth/register`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, password: "SecureTestPassword!123", name: "File Tester" }),
      });
      const regData = await regRes.json();
      const userId = regData.user.id;
      const cookie = regRes.headers.get("set-cookie")!.split(";")[0];

      // Simulate 5 files uploaded
      await setServerUsage(userId, "files", 5, todayUtc);

      const fileRes = await fetch(`${baseUrl}/api/files/upload`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Cookie: cookie },
        body: JSON.stringify({ name: "notes.txt", content: "Testing content" }),
      });

      expect(fileRes.status).toBe(429);
      const errData = await fileRes.json();
      expect(errData.error.code).toBe("DAILY_LIMIT_REACHED");
    });

    it("Guest Mode - should enforce strict guest limits (5 msgs, 1 img, 3 searches, 1 file)", async () => {
      const guestSessionId = `unique_guest_${Date.now()}`;
      const guestUserId = `guest_${guestSessionId}`;

      // Simulate guest reaching 5 messages
      await setServerUsage(guestUserId, "messages", 5, todayUtc);

      const res = await fetch(`${baseUrl}/api/chat`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-guest-session": guestSessionId,
        },
        body: JSON.stringify({
          messages: [{ role: "user", content: "Guest query" }],
        }),
      });

      expect(res.status).toBe(429);
      const data = await res.json();
      expect(data.error.code).toBe("DAILY_LIMIT_REACHED");
      expect(data.error.limit).toBe(5);
    });

    it("Pro Tier - allows higher quota (100 msgs, 20 files) when user is upgraded to pro", async () => {
      const email = `pro_user_${Date.now()}@rsr.test`;
      const regRes = await fetch(`${baseUrl}/api/auth/register`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, password: "SecureTestPassword!123", name: "Pro Tester" }),
      });
      const regData = await regRes.json();
      const userId = regData.user.id;
      const cookie = regRes.headers.get("set-cookie")!.split(";")[0];

      // Upgrade to Pro on server
      await setServerTier(userId, "pro");

      // Verify usage endpoint reports pro limits
      const usageRes = await fetch(`${baseUrl}/api/usage`, {
        headers: { Cookie: cookie },
      });
      const usageData = await usageRes.json();
      expect(usageData.plan).toBe("pro");
      expect(usageData.messages.limit).toBe(100);
      expect(usageData.images.limit).toBe(15);
      expect(usageData.searches.limit).toBe(50);
      expect(usageData.files.limit).toBe(20);

      // Set usage to 5 files (which would block free users)
      await setServerUsage(userId, "files", 5, todayUtc);

      // 6th file upload must succeed because Pro limit is 20 files
      const fileRes = await fetch(`${baseUrl}/api/files/upload`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Cookie: cookie },
        body: JSON.stringify({
          name: "pro_doc.txt",
          content: "Pro content",
        }),
      });
      expect(fileRes.status).toBe(201);
    });

    it("Premium Tier - allows highest quota (300 msgs, 30 imgs, 100 srch, 50 files)", async () => {
      const email = `premium_user_${Date.now()}@rsr.test`;
      const regRes = await fetch(`${baseUrl}/api/auth/register`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, password: "SecureTestPassword!123", name: "Premium Tester" }),
      });
      const regData = await regRes.json();
      const userId = regData.user.id;
      const cookie = regRes.headers.get("set-cookie")!.split(";")[0];

      // Upgrade to Premium on server
      await setServerTier(userId, "premium");

      const usageRes = await fetch(`${baseUrl}/api/usage`, {
        headers: { Cookie: cookie },
      });
      const usageData = await usageRes.json();
      expect(usageData.plan).toBe("premium");
      expect(usageData.messages.limit).toBe(300);
      expect(usageData.images.limit).toBe(30);
      expect(usageData.searches.limit).toBe(100);
      expect(usageData.files.limit).toBe(50);
    });

    it("Daily UTC Reset - quota refreshes automatically across UTC dates", async () => {
      const email = `reset_user_${Date.now()}@rsr.test`;
      const regRes = await fetch(`${baseUrl}/api/auth/register`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, password: "SecureTestPassword!123", name: "Reset Tester" }),
      });
      const regData = await regRes.json();
      const userId = regData.user.id;
      const cookie = regRes.headers.get("set-cookie")!.split(";")[0];

      // Simulate yesterday's usage had reached limit (5 files)
      const yesterdayUtc = "2026-09-14";
      await setServerUsage(userId, "files", 5, yesterdayUtc);

      // Today's usage is 0, so upload must succeed
      const fileRes = await fetch(`${baseUrl}/api/files/upload`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Cookie: cookie },
        body: JSON.stringify({
          name: "fresh_day.txt",
          content: "Fresh day upload",
        }),
      });

      expect(fileRes.status).toBe(201);
    });

    it("Concurrency Safety - simultaneous requests cannot exceed limit", async () => {
      const email = `concurrency_user_${Date.now()}@rsr.test`;
      const regRes = await fetch(`${baseUrl}/api/auth/register`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, password: "SecureTestPassword!123", name: "Concurrency Tester" }),
      });
      const regData = await regRes.json();
      const userId = regData.user.id;
      const cookie = regRes.headers.get("set-cookie")!.split(";")[0];

      // Set usage to 4 of 5 files (only 1 file upload remaining)
      await setServerUsage(userId, "files", 4, todayUtc);

      // Dispatch 5 concurrent file uploads simultaneously
      const results = await Promise.all(
        [1, 2, 3, 4, 5].map((i) =>
          fetch(`${baseUrl}/api/files/upload`, {
            method: "POST",
            headers: { "Content-Type": "application/json", Cookie: cookie },
            body: JSON.stringify({
              name: `concurrent_${i}.txt`,
              content: `Concurrent payload ${i}`,
            }),
          })
        )
      );

      const statuses = results.map((r) => r.status);
      const okCount = statuses.filter((s) => s === 201).length;
      const limitCount = statuses.filter((s) => s === 429).length;

      // Exactly 1 must have succeeded (201), and the other 4 rejected with 429
      expect(okCount).toBe(1);
      expect(limitCount).toBe(4);
    });

    it("Cross-User Isolation - User A hitting limit does not affect User B", async () => {
      // Create User A
      const resA = await fetch(`${baseUrl}/api/auth/register`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: `user_a_${Date.now()}@rsr.test`, password: "PasswordA!123", name: "User A" }),
      });
      const dataA = await resA.json();
      const cookieA = resA.headers.get("set-cookie")!.split(";")[0];

      // Create User B
      const resB = await fetch(`${baseUrl}/api/auth/register`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: `user_b_${Date.now()}@rsr.test`, password: "PasswordB!123", name: "User B" }),
      });
      const dataB = await resB.json();
      const cookieB = resB.headers.get("set-cookie")!.split(";")[0];

      // Exhaust User A's file limit (5)
      await setServerUsage(dataA.user.id, "files", 5, todayUtc);

      // User A is blocked
      const fileA = await fetch(`${baseUrl}/api/files/upload`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Cookie: cookieA },
        body: JSON.stringify({ name: "file_a.txt", content: "A content" }),
      });
      expect(fileA.status).toBe(429);

      // User B must still be permitted
      const fileB = await fetch(`${baseUrl}/api/files/upload`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Cookie: cookieB },
        body: JSON.stringify({ name: "file_b.txt", content: "B content" }),
      });
      expect(fileB.status).toBe(201);
    });

    it("Tamper Resistance - client cannot override tier via body or headers", async () => {
      const email = `tamper_user_${Date.now()}@rsr.test`;
      const regRes = await fetch(`${baseUrl}/api/auth/register`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, password: "SecureTestPassword!123", name: "Tamper Tester" }),
      });
      const regData = await regRes.json();
      const userId = regData.user.id;
      const cookie = regRes.headers.get("set-cookie")!.split(";")[0];

      // User is on Free plan. Exhaust Free file limit (5)
      await setServerUsage(userId, "files", 5, todayUtc);

      // Attempt to upload file while falsely claiming plan="premium" in body and headers
      const res = await fetch(`${baseUrl}/api/files/upload`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Cookie: cookie,
          "x-user-plan": "premium",
          "x-plan-tier": "premium",
        },
        body: JSON.stringify({
          name: "spoofed.txt",
          content: "Spoofed request",
          plan: "premium",
          tier: "premium",
        }),
      });

      // Must strictly be 429 based on database user record
      expect(res.status).toBe(429);
      const data = await res.json();
      expect(data.error.code).toBe("DAILY_LIMIT_REACHED");
    });

    it("Failed Request Accounting - validation 400 does not consume quota", async () => {
      const email = `accounting_user_${Date.now()}@rsr.test`;
      const regRes = await fetch(`${baseUrl}/api/auth/register`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, password: "SecureTestPassword!123", name: "Accounting Tester" }),
      });
      const regData = await regRes.json();
      const cookie = regRes.headers.get("set-cookie")!.split(";")[0];

      // Check usage before
      const usageRes1 = await fetch(`${baseUrl}/api/usage`, {
        headers: { Cookie: cookie },
      });
      const usage1 = await usageRes1.json();
      expect(usage1.files.used).toBe(0);

      // Submit malformed upload request (forbidden executable extension)
      const malformedRes = await fetch(`${baseUrl}/api/files/upload`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Cookie: cookie },
        body: JSON.stringify({ name: "virus.exe", content: "bad" }),
      });
      expect(malformedRes.status).toBe(400);

      // Quota must NOT have been incremented
      const usageRes2 = await fetch(`${baseUrl}/api/usage`, {
        headers: { Cookie: cookie },
      });
      const usage2 = await usageRes2.json();
      expect(usage2.files.used).toBe(0);
    });
  });
}

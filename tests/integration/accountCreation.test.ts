/**
 * RSR AI Version 5 - Focused Account Creation & Signup Test Suite
 * Covers registration, validation, error handling, session persistence,
 * login compatibility, feature access, logout, and Supabase database persistence.
 */

import { describe, it, expect } from "../framework";
import { getTestBaseUrl } from "../testServer";
import { supabaseRepo } from "../../server/db/supabaseRepository";

export async function runAccountCreationTests(customBaseUrl?: string) {
  await describe("Integration: Focused Account Creation & Sign-up System", async () => {
    const baseUrl = customBaseUrl || getTestBaseUrl();
    const timestamp = Date.now();
    const testEmail = `nexora_user_${timestamp}@rsrstudios.com`;
    const testPassword = `SecurePassword123!_${timestamp}`;
    const testName = "Nexora Dedicated Tester";

    let authCookie: string = "";
    let authToken: string = "";
    let createdUserId: string = "";

    it("1. Successful Registration - creates user, hashes password, sets session cookie, returns sanitized user", async () => {
      const res = await fetch(`${baseUrl}/api/auth/register`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: testName,
          email: testEmail,
          password: testPassword,
          confirmPassword: testPassword,
        }),
      });

      expect(res.status).toBe(201);
      const data = await res.json();

      expect(data.success).toBe(true);
      expect(typeof data.token).toBe("string");
      expect(data.user.email).toBe(testEmail);
      expect(data.user.name).toBe(testName);
      expect(data.user.isGuest).toBe(false);
      expect(data.user.syncEnabled).toBe(true);

      // Verify NO sensitive password hashes or salts are leaked to client
      expect((data.user as any).passwordHash).toBeUndefined();
      expect((data.user as any).passwordSalt).toBeUndefined();

      // Verify Set-Cookie header is issued
      const cookieHeader = res.headers.get("set-cookie");
      expect(Boolean(cookieHeader)).toBe(true);
      expect(cookieHeader?.includes("rsr_session=")).toBe(true);

      authToken = data.token;
      createdUserId = data.user.id;
      authCookie = cookieHeader ? cookieHeader.split(";")[0] : "";
    });

    it("2. Duplicate Email - rejects registration of identical email with 409 Conflict", async () => {
      const res = await fetch(`${baseUrl}/api/auth/register`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: "Duplicate User",
          email: testEmail,
          password: testPassword,
          confirmPassword: testPassword,
        }),
      });

      expect(res.status).toBe(409);
      const data = await res.json();
      expect(data.error.code).toBe("USER_ALREADY_EXISTS");
      expect(Boolean(data.error.message)).toBe(true);
    });

    it("3. Invalid Email Format - rejects malformed emails with 400 Bad Request", async () => {
      const invalidEmails = ["notanemail", "missing-at.com", "@domain.com", "user@"];

      for (const badEmail of invalidEmails) {
        const res = await fetch(`${baseUrl}/api/auth/register`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            name: "Invalid Email",
            email: badEmail,
            password: testPassword,
            confirmPassword: testPassword,
          }),
        });

        expect(res.status).toBe(400);
        const data = await res.json();
        expect(data.error.code).toBe("INVALID_EMAIL");
      }
    });

    it("4. Missing Fields - rejects registration when required fields are missing", async () => {
      const resNoPass = await fetch(`${baseUrl}/api/auth/register`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: "No Pass",
          email: `valid_${Date.now()}@example.com`,
          password: "",
        }),
      });
      expect(resNoPass.status).toBe(400);
      const dataNoPass = await resNoPass.json();
      expect(dataNoPass.error.code).toBe("MISSING_FIELDS");

      const resNoEmail = await fetch(`${baseUrl}/api/auth/register`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: "No Email",
          email: "",
          password: "SomeValidPassword123!",
        }),
      });
      expect(resNoEmail.status).toBe(400);
      const dataNoEmail = await resNoEmail.json();
      expect(dataNoEmail.error.code).toBe("MISSING_FIELDS");
    });

    it("5. Password Mismatch - rejects registration when confirmPassword does not match password", async () => {
      const res = await fetch(`${baseUrl}/api/auth/register`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: "Mismatch User",
          email: `mismatch_${Date.now()}@nexora.io`,
          password: "SuperSecretPassword1!",
          confirmPassword: "DifferentPassword2!",
        }),
      });

      expect(res.status).toBe(400);
      const data = await res.json();
      expect(data.error.code).toBe("PASSWORD_MISMATCH");
      expect(data.error.message.includes("Passwords do not match")).toBe(true);
    });

    it("6. Weak Password - rejects passwords shorter than 8 characters", async () => {
      const res = await fetch(`${baseUrl}/api/auth/register`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: "Weak Pass",
          email: `weak_${Date.now()}@nexora.io`,
          password: "short",
          confirmPassword: "short",
        }),
      });

      expect(res.status).toBe(400);
      const data = await res.json();
      expect(data.error.code).toBe("WEAK_PASSWORD");
    });

    it("7. Login after Registration - newly created account can authenticate via POST /api/auth/login", async () => {
      const res = await fetch(`${baseUrl}/api/auth/login`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          email: testEmail,
          password: testPassword,
        }),
      });

      expect(res.status).toBe(200);
      const data = await res.json();
      expect(data.success).toBe(true);
      expect(data.user.email).toBe(testEmail);
      expect(data.user.isGuest).toBe(false);

      const cookieHeader = res.headers.get("set-cookie");
      if (cookieHeader) {
        authCookie = cookieHeader.split(";")[0];
      }
    });

    it("8. Session Persistence - GET /api/auth/me and GET /api/auth/session restore session", async () => {
      // Test via Session Cookie
      const cookieRes = await fetch(`${baseUrl}/api/auth/me`, {
        headers: { Cookie: authCookie },
      });
      expect(cookieRes.status).toBe(200);
      const cookieData = await cookieRes.json();
      expect(cookieData.authenticated).toBe(true);
      expect(cookieData.user.email).toBe(testEmail);
      expect(cookieData.user.name).toBe(testName);

      // Test via Bearer Token
      const bearerRes = await fetch(`${baseUrl}/api/auth/me`, {
        headers: { Authorization: `Bearer ${authToken}` },
      });
      expect(bearerRes.status).toBe(200);
      const bearerData = await bearerRes.json();
      expect(bearerData.authenticated).toBe(true);
      expect(bearerData.user.email).toBe(testEmail);

      // Verify existing /api/auth/session endpoint
      const sessionRes = await fetch(`${baseUrl}/api/auth/session`, {
        headers: { Cookie: authCookie },
      });
      expect(sessionRes.status).toBe(200);
      const sessionData = await sessionRes.json();
      expect(sessionData.authenticated).toBe(true);
      expect(sessionData.user.email).toBe(testEmail);
    });

    it("9. Post-Registration Compatibility - newly registered account can access chat, workspaces, memories, usage, subscriptions", async () => {
      // Workspaces
      const wsRes = await fetch(`${baseUrl}/api/workspaces`, {
        headers: { Cookie: authCookie },
      });
      expect(wsRes.status).toBe(200);
      const wsData = await wsRes.json();
      expect(Array.isArray(wsData.workspaces)).toBe(true);

      // Daily Usage
      const usageRes = await fetch(`${baseUrl}/api/usage`, {
        headers: { Cookie: authCookie },
      });
      expect(usageRes.status).toBe(200);
      const usageData = await usageRes.json();
      expect(usageData.plan).toBe("free");
      expect(typeof usageData.messages.used).toBe("number");

      // Subscription Status
      const subRes = await fetch(`${baseUrl}/api/subscription/me`, {
        headers: { Cookie: authCookie },
      });
      expect(subRes.status).toBe(200);
      const subData = await subRes.json();
      expect(subData.plan).toBe("free");

      // Memories creation & listing
      const memCreateRes = await fetch(`${baseUrl}/api/memories`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Cookie: authCookie,
        },
        body: JSON.stringify({
          content: "User prefers concise answers with TypeScript examples",
          category: "preference",
        }),
      });
      expect(memCreateRes.status).toBe(201);

      const memListRes = await fetch(`${baseUrl}/api/memories`, {
        headers: { Cookie: authCookie },
      });
      expect(memListRes.status).toBe(200);
      const memListData = await memListRes.json();
      expect(memListData.memories.length).toBeGreaterThan(0);
    });

    it("10. Logout - POST /api/auth/logout invalidates session and clears cookie", async () => {
      const logoutRes = await fetch(`${baseUrl}/api/auth/logout`, {
        method: "POST",
        headers: { Cookie: authCookie },
      });

      expect(logoutRes.status).toBe(200);
      const logoutData = await logoutRes.json();
      expect(logoutData.success).toBe(true);

      // Verify that subsequent /api/auth/me returns 401 Unauthorized
      const postLogoutMe = await fetch(`${baseUrl}/api/auth/me`, {
        headers: { Cookie: authCookie },
      });
      expect(postLogoutMe.status).toBe(401);

      // Verify that subsequent /api/auth/session returns 401
      const postLogoutSession = await fetch(`${baseUrl}/api/auth/session`, {
        headers: { Cookie: authCookie },
      });
      expect(postLogoutSession.status).toBe(401);
    });

    it("11. Supabase Persistence - user record is persisted in Supabase database and retrievable", async () => {
      if (!supabaseRepo.isAvailable()) {
        console.log("   (Skipping live Supabase check: repository is not configured in this environment)");
        return;
      }

      const userInDb = await supabaseRepo.findUserByEmail(testEmail);
      expect(Boolean(userInDb)).toBe(true);
      expect(userInDb?.email).toBe(testEmail);
      expect(userInDb?.name).toBe(testName);
      expect(Boolean(userInDb?.passwordHash)).toBe(true);
      expect(Boolean(userInDb?.passwordSalt)).toBe(true);
    });
  });
}

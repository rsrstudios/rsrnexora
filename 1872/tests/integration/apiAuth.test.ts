import { describe, it, expect } from "../framework";
import { getTestBaseUrl } from "../testServer";

export async function runApiAuthTests() {
  await describe("Integration: Authentication & Session Endpoints", () => {
    const baseUrl = getTestBaseUrl();
    const testEmail = `qa_auth_${Date.now()}@rsr-ai.test`;
    const testPassword = "ProductionSecurePassword!99";
    let authCookie = "";

    it("POST /api/auth/register - should create user and set secure session cookie", async () => {
      const res = await fetch(`${baseUrl}/api/auth/register`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          email: testEmail,
          password: testPassword,
          name: "QA Test User",
        }),
      });

      expect(res.status).toBe(201);
      const data = await res.json();
      expect(data.success).toBe(true);
      expect(data.user).toBeDefined();
      expect(data.user.email).toBe(testEmail);
      expect(data.user.passwordHash).toBeUndefined(); // Never expose password hash
      expect(data.user.passwordSalt).toBeUndefined(); // Never expose salt

      const setCookie = res.headers.get("set-cookie");
      expect(setCookie !== null).toBe(true);
      authCookie = setCookie!.split(";")[0];
    });

    it("POST /api/auth/register - should reject duplicate email with 409 Conflict", async () => {
      const res = await fetch(`${baseUrl}/api/auth/register`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          email: testEmail,
          password: testPassword,
          name: "Duplicate User",
        }),
      });

      expect(res.status).toBe(409);
      const data = await res.json();
      expect(data.error.code).toBe("USER_ALREADY_EXISTS");
    });

    it("POST /api/auth/register - should reject invalid email format with 400 Bad Request", async () => {
      const res = await fetch(`${baseUrl}/api/auth/register`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          email: "not-an-email",
          password: testPassword,
          name: "Invalid Email User",
        }),
      });

      expect(res.status).toBe(400);
      const data = await res.json();
      expect(data.error.code).toBe("INVALID_EMAIL");
    });

    it("POST /api/auth/register - should reject weak password with 400 Bad Request", async () => {
      const res = await fetch(`${baseUrl}/api/auth/register`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          email: `qa_weak_${Date.now()}@rsr-ai.test`,
          password: "short",
          name: "Weak Password User",
        }),
      });

      expect(res.status).toBe(400);
      const data = await res.json();
      expect(data.error.code).toBe("WEAK_PASSWORD");
    });

    it("POST /api/auth/login - should authenticate with valid credentials", async () => {
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

      const setCookie = res.headers.get("set-cookie");
      if (setCookie) {
        authCookie = setCookie.split(";")[0];
      }
    });

    it("POST /api/auth/login - should reject invalid credentials with 401 Unauthorized", async () => {
      const res = await fetch(`${baseUrl}/api/auth/login`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          email: testEmail,
          password: "WrongPassword999!",
        }),
      });

      expect(res.status).toBe(401);
      const data = await res.json();
      expect(data.error.code).toBe("INVALID_CREDENTIALS");
    });

    it("GET /api/auth/session - should return session data when authenticated", async () => {
      const res = await fetch(`${baseUrl}/api/auth/session`, {
        headers: { Cookie: authCookie },
      });

      expect(res.status).toBe(200);
      const data = await res.json();
      expect(data.authenticated).toBe(true);
      expect(data.user.email).toBe(testEmail);
    });

    it("GET /api/auth/session - should return 401 when no session cookie present", async () => {
      const res = await fetch(`${baseUrl}/api/auth/session`);
      expect(res.status).toBe(401);
      const data = await res.json();
      expect(data.authenticated).toBe(false);
    });

    it("POST /api/auth/logout - should invalidate session and clear cookie", async () => {
      const res = await fetch(`${baseUrl}/api/auth/logout`, {
        method: "POST",
        headers: { Cookie: authCookie },
      });

      expect(res.status).toBe(200);
      const data = await res.json();
      expect(data.success).toBe(true);

      // Session should no longer be valid
      const sessionCheck = await fetch(`${baseUrl}/api/auth/session`, {
        headers: { Cookie: authCookie },
      });
      expect(sessionCheck.status).toBe(401);
    });
  });
}

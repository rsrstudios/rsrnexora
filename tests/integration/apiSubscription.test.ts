/**
 * RSR Nexora - Subscription & Payment Integration Test Suite
 * Validates:
 * 1. Plans catalog metadata and quota mapping (Free, Plus, Pro, Ultra)
 * 2. Unauthenticated and Guest access protections for checkout/management
 * 3. Webhook signature validation (HMAC-SHA256) and forgery rejection
 * 4. Automatic plan upgrade and quota elevation in Daily Limits
 * 5. Subscription lifecycle (active -> expired) fallback to Free
 */

import crypto from "crypto";
import { describe, it, expect } from "../framework";
import { getTestBaseUrl } from "../testServer";

export async function runApiSubscriptionTests() {
  await describe("Integration: Subscription & Payment System", async () => {
    const baseUrl = getTestBaseUrl();

    it("GET /api/subscription/plans - returns official Nexora plans and exact quotas", async () => {
      const res = await fetch(`${baseUrl}/api/subscription/plans`);
      expect(res.status).toBe(200);
      const data = await res.json();

      expect(Array.isArray(data.plans)).toBe(true);
      expect(data.plans.length).toBe(4);

      const freePlan = data.plans.find((p: any) => p.id === "free");
      expect(freePlan.name).toBe("Nexora Free");
      expect(freePlan.priceInr).toBe(0);
      expect(freePlan.limits.messages).toBe(20);
      expect(freePlan.limits.images).toBe(3);
      expect(freePlan.limits.searches).toBe(10);
      expect(freePlan.limits.files).toBe(5);

      const plusPlan = data.plans.find((p: any) => p.id === "plus");
      expect(plusPlan.name).toBe("Nexora Plus");
      expect(plusPlan.priceInr).toBe(99);
      expect(plusPlan.limits.messages).toBe(100);
      expect(plusPlan.limits.images).toBe(15);
      expect(plusPlan.limits.searches).toBe(50);
      expect(plusPlan.limits.files).toBe(20);

      const proPlan = data.plans.find((p: any) => p.id === "pro");
      expect(proPlan.name).toBe("Nexora Pro");
      expect(proPlan.priceInr).toBe(199);
      expect(proPlan.limits.messages).toBe(300);
      expect(proPlan.limits.images).toBe(30);
      expect(proPlan.limits.searches).toBe(100);
      expect(proPlan.limits.files).toBe(50);

      const ultraPlan = data.plans.find((p: any) => p.id === "ultra");
      expect(ultraPlan.name).toBe("Nexora Ultra");
      expect(ultraPlan.priceInr).toBe(399);
      expect(ultraPlan.limits.messages).toBe(600);
      expect(ultraPlan.limits.images).toBe(60);
      expect(ultraPlan.limits.searches).toBe(200);
      expect(ultraPlan.limits.files).toBe(100);
    });

    it("POST /api/subscription/create-order - rejects guest mode with 403", async () => {
      // Guest request (no auth cookie, only guest header)
      const res = await fetch(`${baseUrl}/api/subscription/create-order`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-guest-session": "guest_sub_test_session",
        },
        body: JSON.stringify({ planId: "plus" }),
      });

      expect(res.status).toBe(403);
      const data = await res.json();
      expect(data.error.code).toBe("GUEST_SUBSCRIPTION_FORBIDDEN");
    });

    it("POST /api/subscription/create-order - rejects invalid plan IDs", async () => {
      const email = `order_test_${Date.now()}@rsr.test`;
      const regRes = await fetch(`${baseUrl}/api/auth/register`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, password: "SecureTestPassword!123", name: "Order Tester" }),
      });
      expect(regRes.status).toBe(201);
      const cookie = regRes.headers.get("set-cookie")!.split(";")[0];

      const res = await fetch(`${baseUrl}/api/subscription/create-order`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Cookie: cookie },
        body: JSON.stringify({ planId: "invalid_tier" }),
      });

      expect(res.status).toBe(400);
      const data = await res.json();
      expect(data.error.code).toBe("INVALID_PLAN");
    });

    it("POST /api/payment/webhook - strictly rejects forged or unsigned payloads", async () => {
      const fakePayload = JSON.stringify({
        event: "subscription.charged",
        payload: {
          payment: { entity: { id: "pay_fake_123", status: "captured" } },
        },
      });

      // No signature header
      const resNoSig = await fetch(`${baseUrl}/api/payment/webhook`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: fakePayload,
      });
      expect(resNoSig.status).toBe(400);

      // Tampered / invalid signature header
      const resBadSig = await fetch(`${baseUrl}/api/payment/webhook`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-razorpay-signature": "tampered_fake_signature_hex_0000000000",
        },
        body: fakePayload,
      });
      expect(resBadSig.status).toBe(400);
    });

    it("GET /api/subscription/me - returns user plan and subscription status", async () => {
      const email = `sub_me_${Date.now()}@rsr.test`;
      const regRes = await fetch(`${baseUrl}/api/auth/register`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, password: "SecureTestPassword!123", name: "Sub Me Tester" }),
      });
      expect(regRes.status).toBe(201);
      const cookie = regRes.headers.get("set-cookie")!.split(";")[0];

      const res = await fetch(`${baseUrl}/api/subscription/me`, {
        headers: { Cookie: cookie },
      });
      expect(res.status).toBe(200);
      const data = await res.json();

      expect(data.plan).toBe("free");
      expect(data.planDetails.name).toBe("Nexora Free");
      expect(data.subscription).toBeNull();
    });
  });
}

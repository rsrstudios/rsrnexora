/**
 * RSR Nexora - Razorpay Production Configuration Verification Test Suite
 * 
 * Verifies:
 * 1. Environment variable detection (RAZORPAY_KEY_ID, RAZORPAY_KEY_SECRET, RAZORPAY_WEBHOOK_SECRET)
 * 2. Razorpay server authentication (read-only verification, no charges)
 * 3. 3 Nexora monthly plans (Plus ₹99, Pro ₹199, Ultra ₹399) and exact paise conversion
 * 4. POST /api/subscription/checkout
 * 5. GET /api/subscription and GET /api/subscription/status
 * 6. Webhook HMAC-SHA256 signature verification with configured secret
 * 7. Duplicate/replayed webhook protection and idempotency
 * 8. Supabase subscription synchronization
 * 9. Plan upgrade on payment success
 * 10. Failed/pending/cancelled/expired subscription states
 * 11. Server-authoritative daily limit integration
 * 12. Security: zero secrets leaked
 */

import crypto from "crypto";
import { describe, it, expect } from "../framework";
import { getTestBaseUrl } from "../testServer";
import { SUBSCRIPTION_PLANS, getDailyLimitsForPlan } from "../../server/config/dailyLimitsConfig";
import { supabaseRepo } from "../../server/db/supabaseRepository";
import { db } from "../../server/db/database";

export async function runRazorpayVerificationTests() {
  await describe("Razorpay: Production Configuration Verification", () => {
    const baseUrl = getTestBaseUrl();
    const keyId = (process.env.RAZORPAY_KEY_ID || process.env.PAYMENT_PUBLIC_KEY || "").trim();
    const keySecret = (process.env.RAZORPAY_KEY_SECRET || process.env.PAYMENT_SECRET_KEY || "").trim();
    const webhookSecret = (process.env.RAZORPAY_WEBHOOK_SECRET || process.env.PAYMENT_WEBHOOK_SECRET || "").trim();

    // 1. RAZORPAY ENVIRONMENT VARIABLES DETECTION
    it("1. Razorpay Environment Variables - all 3 required secrets detected without exposure", () => {
      expect(Boolean(keyId)).toBe(true);
      expect(keyId.length).toBeGreaterThan(10);
      expect(keyId.startsWith("rzp_")).toBe(true);

      expect(Boolean(keySecret)).toBe(true);
      expect(keySecret.length).toBeGreaterThan(10);

      expect(Boolean(webhookSecret)).toBe(true);
      expect(webhookSecret.length).toBeGreaterThan(6);

      // Verify no placeholder strings
      expect(keyId.includes("PASTE")).toBe(false);
      expect(keySecret.includes("PASTE")).toBe(false);
      expect(webhookSecret.includes("PASTE")).toBe(false);
    });

    // 2. RAZORPAY SERVER AUTHENTICATION (READ-ONLY)
    it("2. Razorpay Server Authentication - successfully authenticates against Razorpay API without charging", async () => {
      const basicAuth = Buffer.from(`${keyId}:${keySecret}`).toString("base64");
      const res = await fetch("https://api.razorpay.com/v1/items", {
        headers: {
          Authorization: `Basic ${basicAuth}`,
        },
      });

      expect(res.status).toBe(200);
      const data = await res.json();
      expect(data).toBeDefined();
      expect(data.entity).toBe("collection");
    });

    // 3. THREE RSR NEXORA MONTHLY PLANS & PAISE VALIDATION
    it("3. Plans & Pricing - Plus ₹99, Pro ₹199, Ultra ₹399 validated with exact paise amounts", () => {
      // Plus: ₹99 = 9900 paise
      expect(SUBSCRIPTION_PLANS.plus.priceInr).toBe(99);
      expect(SUBSCRIPTION_PLANS.plus.priceInr * 100).toBe(9900);
      expect(SUBSCRIPTION_PLANS.plus.billingPeriod).toBe("/month");

      // Pro: ₹199 = 19900 paise
      expect(SUBSCRIPTION_PLANS.pro.priceInr).toBe(199);
      expect(SUBSCRIPTION_PLANS.pro.priceInr * 100).toBe(19900);
      expect(SUBSCRIPTION_PLANS.pro.billingPeriod).toBe("/month");

      // Ultra: ₹399 = 39900 paise
      expect(SUBSCRIPTION_PLANS.ultra.priceInr).toBe(399);
      expect(SUBSCRIPTION_PLANS.ultra.priceInr * 100).toBe(39900);
      expect(SUBSCRIPTION_PLANS.ultra.billingPeriod).toBe("/month");
    });

    // 4. CHECKOUT ENDPOINT: POST /api/subscription/checkout CREATES RECURRING SUBSCRIPTION
    let testUserCookie = "";
    let testUserId = "";
    let activeSubscriptionId = "";

    it("4. Checkout Endpoint - POST /api/subscription/checkout creates Razorpay recurring subscription", async () => {
      // Create dedicated test user
      const userEmail = `razorpay_user_${Date.now()}@rsr.test`;
      const regRes = await fetch(`${baseUrl}/api/auth/register`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          email: userEmail,
          password: "SecurePassword123!",
          confirmPassword: "SecurePassword123!",
          name: "Razorpay Test User",
        }),
      });

      expect(regRes.status).toBe(201);
      const regData = await regRes.json();
      testUserId = regData.user.id;
      testUserCookie = regRes.headers.get("set-cookie")!.split(";")[0];

      // Rejects guest mode
      const guestRes = await fetch(`${baseUrl}/api/subscription/checkout`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-guest-session": `guest_${Date.now()}`,
        },
        body: JSON.stringify({ plan: "plus" }),
      });
      expect(guestRes.status).toBe(403);

      // Rejects invalid plan
      const badPlanRes = await fetch(`${baseUrl}/api/subscription/checkout`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Cookie: testUserCookie },
        body: JSON.stringify({ plan: "invalid_tier" }),
      });
      expect(badPlanRes.status).toBe(400);

      // Checkout Plus (9900 paise) -> produces recurring subscription starting with sub_
      const plusCheckout = await fetch(`${baseUrl}/api/subscription/checkout`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Cookie: testUserCookie },
        body: JSON.stringify({ plan: "plus" }),
      });
      expect(plusCheckout.status).toBe(200);
      const plusData = await plusCheckout.json();
      expect(plusData.success).toBe(true);
      expect(plusData.checkout.amount).toBe(9900);
      expect(plusData.checkout.currency).toBe("INR");
      expect(plusData.checkout.plan).toBe("plus");
      expect(plusData.checkout.keyId).toBe(keyId);
      expect(typeof plusData.checkout.subscriptionId).toBe("string");
      expect(plusData.checkout.subscriptionId.startsWith("sub_")).toBe(true);
      activeSubscriptionId = plusData.checkout.subscriptionId;

      // Checkout Pro (19900 paise) -> produces recurring subscription starting with sub_
      const proCheckout = await fetch(`${baseUrl}/api/subscription/checkout`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Cookie: testUserCookie },
        body: JSON.stringify({ plan: "pro" }),
      });
      expect(proCheckout.status).toBe(200);
      const proData = await proCheckout.json();
      expect(proData.checkout.amount).toBe(19900);
      expect(proData.checkout.plan).toBe("pro");
      expect(proData.checkout.subscriptionId.startsWith("sub_")).toBe(true);

      // Checkout Ultra (39900 paise) -> produces recurring subscription starting with sub_
      const ultraCheckout = await fetch(`${baseUrl}/api/subscription/checkout`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Cookie: testUserCookie },
        body: JSON.stringify({ plan: "ultra" }),
      });
      expect(ultraCheckout.status).toBe(200);
      const ultraData = await ultraCheckout.json();
      expect(ultraData.checkout.amount).toBe(39900);
      expect(ultraData.checkout.plan).toBe("ultra");
      expect(ultraData.checkout.subscriptionId.startsWith("sub_")).toBe(true);
    });

    // 5. SUBSCRIPTION STATUS ENDPOINTS: GET /api/subscription & /api/subscription/status
    it("5. Subscription Status - GET /api/subscription and /api/subscription/status return consistent state", async () => {
      const subRes = await fetch(`${baseUrl}/api/subscription`, {
        headers: { Cookie: testUserCookie },
      });
      expect(subRes.status).toBe(200);
      const subData = await subRes.json();
      expect(subData.isGuest).toBe(false);
      expect(subData.paymentConfig.provider).toBe("razorpay");
      expect(subData.paymentConfig.isConfigured).toBe(true);
      expect(subData.paymentConfig.currency).toBe("INR");

      const statusRes = await fetch(`${baseUrl}/api/subscription/status`, {
        headers: { Cookie: testUserCookie },
      });
      expect(statusRes.status).toBe(200);
      const statusData = await statusRes.json();
      expect(statusData.isConfigured).toBe(true);
      expect(typeof statusData.isPaid).toBe("boolean");
    });

    // 6. WEBHOOK HMAC-SHA256 SIGNATURE VALIDATION
    it("6. Webhook Signature Validation - strictly validates HMAC-SHA256 with configured secret", async () => {
      const webhookPayload = JSON.stringify({
        id: `evt_test_${Date.now()}`,
        event: "subscription.activated",
        notes: { userId: testUserId, plan: "pro" },
      });

      // Missing signature header -> 400
      const noSigRes = await fetch(`${baseUrl}/api/payment/webhook`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: webhookPayload,
      });
      expect(noSigRes.status).toBe(400);

      // Forged signature header -> 400
      const forgedSigRes = await fetch(`${baseUrl}/api/payment/webhook`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-razorpay-signature": "forged_invalid_hex_signature_1234567890abcdef",
        },
        body: webhookPayload,
      });
      expect(forgedSigRes.status).toBe(400);

      // Valid cryptographic HMAC-SHA256 signature
      const validSignature = crypto
        .createHmac("sha256", webhookSecret)
        .update(webhookPayload)
        .digest("hex");

      const validSigRes = await fetch(`${baseUrl}/api/payment/webhook`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-razorpay-signature": validSignature,
        },
        body: webhookPayload,
      });

      expect(validSigRes.status).toBe(200);
      const validData = await validSigRes.json();
      expect(validData.received).toBe(true);
    });

    // 7. WEBHOOK IDEMPOTENCY & REPLAY ATTACK PROTECTION
    it("7. Webhook Idempotency - duplicate events are recognized and ignored safely", async () => {
      const replayEventId = `evt_replay_${Date.now()}`;
      const replayPayload = JSON.stringify({
        id: replayEventId,
        event: "payment.captured",
        notes: { userId: testUserId, plan: "plus" },
      });

      const signature = crypto
        .createHmac("sha256", webhookSecret)
        .update(replayPayload)
        .digest("hex");

      // First delivery: processes successfully
      const firstRes = await fetch(`${baseUrl}/api/payment/webhook`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-razorpay-signature": signature,
        },
        body: replayPayload,
      });
      expect(firstRes.status).toBe(200);

      // Second delivery (replay): returns 200 idempotent acknowledgement without duplicate state mutation
      const secondRes = await fetch(`${baseUrl}/api/payment/webhook`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-razorpay-signature": signature,
        },
        body: replayPayload,
      });
      expect(secondRes.status).toBe(200);
      const secondData = await secondRes.json();
      expect(secondData.message.includes("idempotent")).toBe(true);
    });

    // 8. PAYMENT SUCCESS UPGRADES PLAN & DAILY LIMITS
    it("8. Plan Upgrade on Payment Success - upgrades user to Pro tier with 300 msgs quota", async () => {
      const subActivatedId = `evt_act_${Date.now()}`;
      const upgradePayload = JSON.stringify({
        id: subActivatedId,
        event: "subscription.activated",
        payload: {
          subscription: {
            entity: {
              id: `sub_rzp_${Date.now()}`,
              customer_id: `cust_rzp_${Date.now()}`,
              current_start: Math.floor(Date.now() / 1000),
              current_end: Math.floor((Date.now() + 30 * 86400000) / 1000),
              notes: {
                userId: testUserId,
                plan: "pro",
              },
            },
          },
        },
      });

      const signature = crypto
        .createHmac("sha256", webhookSecret)
        .update(upgradePayload)
        .digest("hex");

      const res = await fetch(`${baseUrl}/api/payment/webhook`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-razorpay-signature": signature,
        },
        body: upgradePayload,
      });
      expect(res.status).toBe(200);

      // Verify user subscription status endpoint
      const statusRes = await fetch(`${baseUrl}/api/subscription/status`, {
        headers: { Cookie: testUserCookie },
      });
      expect(statusRes.status).toBe(200);
      const statusData = await statusRes.json();
      expect(statusData.status).toBe("active");
      expect(statusData.isPaid).toBe(true);

      // Verify daily limits integration reflects Pro tier quota (300 msgs, 30 imgs, 100 srch, 50 files)
      const usageRes = await fetch(`${baseUrl}/api/usage`, {
        headers: { Cookie: testUserCookie },
      });
      expect(usageRes.status).toBe(200);
      const usageData = await usageRes.json();
      expect(usageData.messages.limit).toBe(300);
      expect(usageData.images.limit).toBe(30);
      expect(usageData.searches.limit).toBe(100);
      expect(usageData.files.limit).toBe(50);
    });

    // 9. RECURRING RENEWAL EVENT: subscription.charged EXTENDS BILLING PERIOD
    it("9. Recurring Renewal Events - subscription.charged extends billing period and preserves active tier", async () => {
      const renewalStart = Math.floor(Date.now() / 1000);
      const renewalEnd = renewalStart + 30 * 86400;

      const chargedPayload = JSON.stringify({
        id: `evt_charge_${Date.now()}`,
        event: "subscription.charged",
        payload: {
          subscription: {
            entity: {
              id: activeSubscriptionId,
              customer_id: `cust_rzp_${Date.now()}`,
              status: "active",
              current_start: renewalStart,
              current_end: renewalEnd,
              notes: {
                userId: testUserId,
                plan: "pro",
              },
            },
          },
          payment: {
            entity: {
              id: `pay_${Date.now()}`,
              amount: 19900,
              currency: "INR",
              status: "captured",
            },
          },
        },
      });

      const chargedSig = crypto
        .createHmac("sha256", webhookSecret)
        .update(chargedPayload)
        .digest("hex");

      const chargeRes = await fetch(`${baseUrl}/api/payment/webhook`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-razorpay-signature": chargedSig,
        },
        body: chargedPayload,
      });
      expect(chargeRes.status).toBe(200);

      // Verify subscription is active and periodEnd is updated
      const subRecord = await db.getSubscriptionByUserId(testUserId);
      expect(subRecord?.status).toBe("active");
      expect(subRecord?.currentPeriodEnd).toBe(renewalEnd * 1000);
    });

    // 10. COMPLETE SUBSCRIPTION LIFECYCLE EVENTS
    it("10. Subscription Lifecycle Events - pending, halted, cancelled, and completed", async () => {
      // 10a. subscription.pending
      const pendingPayload = JSON.stringify({
        id: `evt_pend_${Date.now()}`,
        event: "subscription.pending",
        payload: {
          subscription: {
            entity: {
              id: activeSubscriptionId,
              notes: { userId: testUserId, plan: "pro" },
            },
          },
        },
      });
      const pendingSig = crypto.createHmac("sha256", webhookSecret).update(pendingPayload).digest("hex");
      const pendRes = await fetch(`${baseUrl}/api/payment/webhook`, {
        method: "POST",
        headers: { "Content-Type": "application/json", "x-razorpay-signature": pendingSig },
        body: pendingPayload,
      });
      expect(pendRes.status).toBe(200);
      let sub = await db.getSubscriptionByUserId(testUserId);
      expect(sub?.status).toBe("pending");

      // 10b. subscription.halted -> expired
      const haltedPayload = JSON.stringify({
        id: `evt_halt_${Date.now()}`,
        event: "subscription.halted",
        payload: {
          subscription: {
            entity: {
              id: activeSubscriptionId,
              notes: { userId: testUserId, plan: "pro" },
            },
          },
        },
      });
      const haltSig = crypto.createHmac("sha256", webhookSecret).update(haltedPayload).digest("hex");
      const haltRes = await fetch(`${baseUrl}/api/payment/webhook`, {
        method: "POST",
        headers: { "Content-Type": "application/json", "x-razorpay-signature": haltSig },
        body: haltedPayload,
      });
      expect(haltRes.status).toBe(200);
      sub = await db.getSubscriptionByUserId(testUserId);
      expect(sub?.status).toBe("expired");

      // 10c. subscription.cancelled -> cancelled
      const cancelPayload = JSON.stringify({
        id: `evt_canc_${Date.now()}`,
        event: "subscription.cancelled",
        payload: {
          subscription: {
            entity: {
              id: activeSubscriptionId,
              notes: { userId: testUserId, plan: "pro" },
            },
          },
        },
      });
      const cancelSig = crypto.createHmac("sha256", webhookSecret).update(cancelPayload).digest("hex");
      const cancelRes = await fetch(`${baseUrl}/api/payment/webhook`, {
        method: "POST",
        headers: { "Content-Type": "application/json", "x-razorpay-signature": cancelSig },
        body: cancelPayload,
      });
      expect(cancelRes.status).toBe(200);
      sub = await db.getSubscriptionByUserId(testUserId);
      expect(sub?.status).toBe("cancelled");

      // 10d. subscription.completed -> expired
      const completedPayload = JSON.stringify({
        id: `evt_comp_${Date.now()}`,
        event: "subscription.completed",
        payload: {
          subscription: {
            entity: {
              id: activeSubscriptionId,
              notes: { userId: testUserId, plan: "pro" },
            },
          },
        },
      });
      const compSig = crypto.createHmac("sha256", webhookSecret).update(completedPayload).digest("hex");
      const compRes = await fetch(`${baseUrl}/api/payment/webhook`, {
        method: "POST",
        headers: { "Content-Type": "application/json", "x-razorpay-signature": compSig },
        body: completedPayload,
      });
      expect(compRes.status).toBe(200);
      sub = await db.getSubscriptionByUserId(testUserId);
      expect(sub?.status).toBe("expired");
    });

    // 11. FAILED / EXPIRED / CANCELLED STATES REVERT TO FREE LIMITS
    it("11. Non-Active Subscription States - past_due and expired states do not grant paid limits", async () => {
      // Send payment.failed event
      const failPayload = JSON.stringify({
        id: `evt_fail_${Date.now()}`,
        event: "payment.failed",
        notes: { userId: testUserId, plan: "pro" },
      });
      const failSig = crypto
        .createHmac("sha256", webhookSecret)
        .update(failPayload)
        .digest("hex");

      const failRes = await fetch(`${baseUrl}/api/payment/webhook`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-razorpay-signature": failSig,
        },
        body: failPayload,
      });
      expect(failRes.status).toBe(200);

      // Verify limits revert to Free tier (20 messages)
      const usageRes = await fetch(`${baseUrl}/api/usage`, {
        headers: { Cookie: testUserCookie },
      });
      expect(usageRes.status).toBe(200);
      const usageData = await usageRes.json();
      expect(usageData.messages.limit).toBe(20);
      expect(usageData.images.limit).toBe(3);
    });

    // 12. SERVER-AUTHORITATIVE DAILY LIMITS FOR ALL 4 TIERS
    it("12. Daily Limits Server-Authoritative - exact constants match user specifications", () => {
      // FREE: 20 messages / 3 images / 10 searches / 5 files
      const free = getDailyLimitsForPlan("free");
      expect(free.messages).toBe(20);
      expect(free.images).toBe(3);
      expect(free.searches).toBe(10);
      expect(free.files).toBe(5);

      // PLUS: 100 / 15 / 50 / 20
      const plus = getDailyLimitsForPlan("plus");
      expect(plus.messages).toBe(100);
      expect(plus.images).toBe(15);
      expect(plus.searches).toBe(50);
      expect(plus.files).toBe(20);

      // PRO: 300 / 30 / 100 / 50 (represented by premium quota in limit configuration)
      const pro = getDailyLimitsForPlan("premium");
      expect(pro.messages).toBe(300);
      expect(pro.images).toBe(30);
      expect(pro.searches).toBe(100);
      expect(pro.files).toBe(50);

      // ULTRA: 600 / 60 / 200 / 100
      const ultra = getDailyLimitsForPlan("ultra");
      expect(ultra.messages).toBe(600);
      expect(ultra.images).toBe(60);
      expect(ultra.searches).toBe(200);
      expect(ultra.files).toBe(100);
    });

    // 13. SUPABASE SYNCHRONIZATION WITH RECURRING SUBSCRIPTION ID
    it("13. Supabase Synchronization - subscription ID is saved and retrievable via Supabase", async () => {
      const subRecord = await db.getSubscriptionByUserId(testUserId);
      expect(Boolean(subRecord)).toBe(true);
      expect(subRecord?.userId).toBe(testUserId);
      expect(subRecord?.provider).toBe("razorpay");
      expect(typeof subRecord?.providerSubscriptionId).toBe("string");
      expect(subRecord?.providerSubscriptionId.startsWith("sub_")).toBe(true);

      if (supabaseRepo.isAvailable()) {
        const remoteSub = await supabaseRepo.getSubscriptionByUserId(testUserId);
        expect(Boolean(remoteSub)).toBe(true);
        expect(remoteSub?.userId).toBe(testUserId);
        expect(remoteSub?.provider).toBe("razorpay");
        expect(remoteSub?.providerSubscriptionId.startsWith("sub_")).toBe(true);
      }
    });

    // 14. SECURITY: ZERO SECRETS LEAKED
    it("14. Security - keys and secrets are never returned in client payloads or public endpoints", async () => {
      const plansRes = await fetch(`${baseUrl}/api/subscription/plans`);
      const plansText = await plansRes.text();

      expect(plansText.includes(keySecret)).toBe(false);
      expect(plansText.includes(webhookSecret)).toBe(false);

      const statusRes = await fetch(`${baseUrl}/api/subscription/status`, {
        headers: { Cookie: testUserCookie },
      });
      const statusText = await statusRes.text();
      expect(statusText.includes(keySecret)).toBe(false);
      expect(statusText.includes(webhookSecret)).toBe(false);
    });
  });
}

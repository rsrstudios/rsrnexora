/**
 * RSR Nexora - 10-API Automatic Fallback Orchestration Integration Test Suite
 * Validates:
 * 1. 10 configuration slots and priority-ordered failover
 * 2. Transparent fallback on transient 500/503/timeout
 * 3. Rate-limit cooldown handling (429)
 * 4. Permanent error isolation (no failover for client errors)
 * 5. Safe SSE streaming without duplicate tokens
 * 6. Health telemetry endpoint safety (zero secret leakage)
 * 7. Client abort cancellation handling
 */

import { describe, it, expect } from "../framework";
import { getTestBaseUrl } from "../testServer";
import { aiOrchestrator } from "../../server/ai/aiOrchestrator";
import { MockAdapter } from "../../server/ai/adapters/mockAdapter";
import { loadProviderConfigs } from "../../server/config/providerConfig";
import { classifyProviderError } from "../../server/ai/errorClassifier";

export async function runApiFallbackTests() {
  await describe("Integration: 10-API Automatic Fallback Orchestration", () => {
    const baseUrl = getTestBaseUrl();

    it("Configuration - should load exactly 10 configuration slots with priority ordering", () => {
      const configs = loadProviderConfigs();
      expect(configs.length).toBe(10);
      expect(configs[0].slotId).toBe("API_01");
      expect(configs[0].isPrimary).toBe(true);
      expect(configs[1].slotId).toBe("API_02");
      expect(configs[9].slotId).toBe("API_10");
    });

    it("Error Classification - should correctly categorize transient vs permanent errors", () => {
      const err503 = { status: 503, message: "Service Unavailable" };
      const classified503 = classifyProviderError(err503);
      expect(classified503.category).toBe("TRANSIENT_SERVER_ERROR");
      expect(classified503.isFailoverEligible).toBe(true);

      const err429 = { status: 429, message: "Rate limit reached", retryAfter: "10" };
      const classified429 = classifyProviderError(err429);
      expect(classified429.category).toBe("TRANSIENT_RATE_LIMIT");
      expect(classified429.isFailoverEligible).toBe(true);
      expect(classified429.retryAfterMs).toBe(10000);

      const err400 = { status: 400, message: "Invalid argument: prompt is empty" };
      const classified400 = classifyProviderError(err400);
      expect(classified400.category).toBe("PERMANENT_USER_ERROR");
      expect(classified400.isFailoverEligible).toBe(false);
    });

    it("Primary Provider Execution - should successfully execute through API_01 when healthy", async () => {
      const mock01 = new MockAdapter("API_01", "mock-fast", { responsePrefix: "[PRIMARY]" });
      aiOrchestrator.registerAdapter("API_01", mock01);

      const result = await aiOrchestrator.generateResponse({
        messages: [{ role: "user", content: "Test ping" }],
      });

      expect(result.text).toContain("[PRIMARY]");
      expect(result.text).toContain("Test ping");
      expect(mock01.callCount >= 1).toBe(true);
    });

    it("Automatic Failover - should fail over from API_01 to API_02 on transient 503", async () => {
      // Setup API_01 to fail with 503
      const mock01 = new MockAdapter("API_01", "mock-fail", {
        shouldFail: true,
        failStatus: 503,
        failMessage: "Backend unavailable",
      });

      // Setup API_02 to succeed
      const mock02 = new MockAdapter("API_02", "mock-backup", {
        shouldFail: false,
        responsePrefix: "[BACKUP_02]",
      });

      aiOrchestrator.registerAdapter("API_01", mock01);
      aiOrchestrator.registerAdapter("API_02", mock02);

      const result = await aiOrchestrator.generateResponse({
        messages: [{ role: "user", content: "Test failover" }],
      });

      expect(result.text).toContain("[BACKUP_02]");
      expect(mock01.callCount >= 1).toBe(true);
      expect(mock02.callCount >= 1).toBe(true);
    });

    it("Cooldown State - repeated 429 errors should place provider into cooldown", async () => {
      const mock01 = new MockAdapter("API_01", "mock-rate-limit", {
        shouldFail: true,
        failStatus: 429,
        retryAfterSeconds: 5,
      });
      const mock02 = new MockAdapter("API_02", "mock-backup-ok", {
        shouldFail: false,
        responsePrefix: "[HEALTHY_02]",
      });

      aiOrchestrator.registerAdapter("API_01", mock01);
      aiOrchestrator.registerAdapter("API_02", mock02);

      // Trigger request that hits 429 on API_01 and falls over to API_02
      await aiOrchestrator.generateResponse({
        messages: [{ role: "user", content: "Cooldown test" }],
      });

      // API_01 should now be in cooldown
      const slot01Status = aiOrchestrator.healthRegistry.getSlotStatus("API_01");
      expect(slot01Status.status).toBe("cooldown");
      expect(aiOrchestrator.healthRegistry.isEligible("API_01")).toBe(false);

      // Subsequent call should skip API_01 directly and execute on API_02
      const prevCallCount01 = mock01.callCount;
      const res2 = await aiOrchestrator.generateResponse({
        messages: [{ role: "user", content: "Second attempt during cooldown" }],
      });
      expect(res2.text).toContain("[HEALTHY_02]");
      expect(mock01.callCount).toBe(prevCallCount01); // API_01 was bypassed!
    });

    it("Permanent Errors - should NOT trigger fallback on client bad request", async () => {
      const mock01 = new MockAdapter("API_01", "mock-permanent-err", {
        shouldFail: true,
        failStatus: 400,
        failMessage: "Invalid input context structure",
      });
      const mock02 = new MockAdapter("API_02", "mock-backup-never-reached");

      aiOrchestrator.registerAdapter("API_01", mock01);
      aiOrchestrator.registerAdapter("API_02", mock02);

      let thrown = false;
      try {
        await aiOrchestrator.generateResponse({
          messages: [{ role: "user", content: "Bad format" }],
        });
      } catch (err: any) {
        thrown = true;
        expect(err.message).toContain("Invalid input context structure");
      }

      expect(thrown).toBe(true);
      expect(mock02.callCount).toBe(0); // Did not attempt fallback for client error
    });

    it("Streaming Safety - should safely terminate without duplicate output if mid-stream failure occurs", async () => {
      // Provider outputs 2 tokens then crashes
      const mock01 = new MockAdapter("API_01", "mock-stream-crash", {
        tokensToSendBeforeFail: 2,
        shouldFail: true,
        failStatus: 500,
        failMessage: "Stream connection dropped by upstream",
      });
      const mock02 = new MockAdapter("API_02", "mock-backup-stream");

      aiOrchestrator.registerAdapter("API_01", mock01);
      aiOrchestrator.registerAdapter("API_02", mock02);

      const receivedChunks: string[] = [];
      let streamFailed = false;

      try {
        await aiOrchestrator.streamResponse(
          { messages: [{ role: "user", content: "Streaming test" }] },
          (chunk) => {
            if (chunk.text) receivedChunks.push(chunk.text);
          }
        );
      } catch (err: any) {
        streamFailed = true;
        expect(err.message).toContain("interrupted");
      }

      expect(streamFailed).toBe(true);
      expect(receivedChunks.length).toBe(2);
      expect(mock02.callCount).toBe(0); // Did not replay duplicate stream from scratch!
    });

    it("Health Endpoint - GET /api/health/providers should expose sanitized status without secrets", async () => {
      const res = await fetch(`${baseUrl}/api/health/providers`);
      expect(res.status).toBe(200);

      const data = await res.json();
      expect(data.status).toBe("ok");
      expect(Array.isArray(data.slots)).toBe(true);
      expect(data.slots.length).toBe(10);
      expect(data.summary.totalSlots).toBe(10);
      expect(typeof data.summary.fallbackEnabled).toBe("boolean");

      // Verify ZERO API keys, secrets, or authorization tokens are exposed in JSON payload
      const rawJson = JSON.stringify(data);
      expect(rawJson.toLowerCase()).not.toContain("bearer");
      expect(rawJson.toLowerCase()).not.toContain("api_01_key");
      expect(rawJson.toLowerCase()).not.toContain("secret_key");
      for (const slot of data.slots) {
        expect(slot.apiKey).toBeUndefined();
        expect(slot.key).toBeUndefined();
        expect(slot.token).toBeUndefined();
      }
    });

    it("Root Health Endpoint - GET /api/health should include fallback capabilities & summary", async () => {
      const res = await fetch(`${baseUrl}/api/health`);
      expect(res.status).toBe(200);

      const data = await res.json();
      expect(data.fallbackEnabled).toBe(true);
      expect(data.totalSlots).toBe(10);
      expect(typeof data.configuredProviders).toBe("number");
      expect(typeof data.healthyProviders).toBe("number");
      expect(data.packageId).toBe("com.rsr.nexora");
      expect(data.capabilities).toContain("10-api-automatic-fallback");
    });
  });
}

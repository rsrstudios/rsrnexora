/**
 * RSR Nexora - AI Model Circuit Breaker & Resilient Candidate Router
 * Tracks temporary model demand spikes (e.g. 503 Service Unavailable) and quotas,
 * preventing cascading delays by dynamically re-routing to healthy alternatives.
 */

interface ModelHealthState {
  cooldownUntil: number;
  failureCount: number;
  lastStatus?: number;
  lastError?: string;
}

const modelHealthStore = new Map<string, ModelHealthState>();

/**
 * Extracts a clean, readable error message from complex or nested SDK errors.
 * Recursively unwraps double-stringified JSON error envelopes.
 */
export function extractCleanErrorMessage(err: any): string {
  if (!err) return "Unknown error";
  let val = err?.message || (typeof err === "string" ? err : "");

  // Unpack up to 3 levels of nested JSON strings
  for (let i = 0; i < 3; i++) {
    if (typeof val !== "string" || !val.trim().startsWith("{")) break;
    try {
      const parsed = JSON.parse(val);
      if (parsed?.error?.message) {
        val = parsed.error.message;
      } else if (parsed?.message) {
        val = parsed.message;
      } else {
        break;
      }
    } catch {
      break;
    }
  }

  if (typeof val === "string") {
    // If still contains raw JSON message field, extract inner text
    const match = val.match(/"message":\s*"([^"]+)"/);
    if (match && match[1]) {
      val = match[1];
    }
    return val.replace(/\s+/g, " ").trim();
  }

  return String(val || err);
}

/**
 * Checks if a specific model identifier is currently in temporary demand cooldown.
 */
export function isModelInCooldown(model: string): boolean {
  const state = modelHealthStore.get(model);
  if (!state) return false;
  if (Date.now() > state.cooldownUntil) {
    modelHealthStore.delete(model);
    return false;
  }
  return true;
}

/**
 * Registers a transient failure (e.g. 503 high demand spike, 429 rate limit / quota exhaustion) on a model.
 */
export function markModelFailure(model: string, status?: number, error?: any): void {
  const current = modelHealthStore.get(model) || { cooldownUntil: 0, failureCount: 0 };
  const failureCount = current.failureCount + 1;
  const cleanMsg = extractCleanErrorMessage(error);
  const lowerMsg = cleanMsg.toLowerCase();

  // Distinguish quota exhaustion (daily free tier limits) from transient rate limits or 503 high demand
  const isQuotaExhausted =
    lowerMsg.includes("quota") ||
    lowerMsg.includes("resource_exhausted") ||
    lowerMsg.includes("daily") ||
    lowerMsg.includes("freetier") ||
    lowerMsg.includes("free_tier");

  let cooldownDurationMs = 30000;
  if (status === 503) {
    cooldownDurationMs = 45000; // 503 high demand spike cooldown
  } else if (status === 429) {
    cooldownDurationMs = isQuotaExhausted ? 600000 : 45000; // 10 minutes for quota exhaustion, 45s for transient rate limit
  }

  const recordCooldown = (targetModel: string) => {
    modelHealthStore.set(targetModel, {
      cooldownUntil: Date.now() + cooldownDurationMs,
      failureCount,
      lastStatus: status,
      lastError: cleanMsg,
    });
  };

  recordCooldown(model);

  // If gemini-3.8-flash and gemini-flash-latest share the same model & quota, keep them in sync
  if (model === "gemini-3.8-flash" || model === "gemini-flash-latest") {
    recordCooldown("gemini-3.8-flash");
    recordCooldown("gemini-flash-latest");
  }
}

/**
 * Clears cooldown for a model upon confirmed successful generation.
 */
export function markModelSuccess(model: string): void {
  modelHealthStore.delete(model);
}

/**
 * Returns prioritized candidate models, placing actively healthy models before cooling ones.
 */
export function getOrderedCandidateModels(preferredModel: string): string[] {
  // Ordered pool: preferred model first, followed by resilient ultra-fast tier
  const pool = [
    preferredModel,
    "gemini-3.1-flash-lite",
    "gemini-flash-latest",
    "gemini-3.8-flash",
  ];

  const unique = Array.from(new Set(pool.filter(Boolean)));
  const healthy = unique.filter((m) => !isModelInCooldown(m));
  const cooling = unique.filter((m) => isModelInCooldown(m));

  return [...healthy, ...cooling];
}

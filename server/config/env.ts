import dotenv from "dotenv";

dotenv.config();

export interface ServerConfig {
  nodeEnv: "development" | "production" | "test";
  port: number;
  geminiApiKey: string | undefined;
  sessionSecret: string;
  allowedOrigins: string[];
  sessionMaxAgeMs: number;
  rateLimitWindowMs: number;
}

const parseAllowedOrigins = (originsStr?: string): string[] => {
  if (!originsStr || originsStr.trim() === "*") {
    return ["*"];
  }

  return originsStr
    .split(",")
    .map((o) => o.trim())
    .filter(Boolean);
};

export const config: ServerConfig = {
  nodeEnv: (process.env.NODE_ENV as ServerConfig["nodeEnv"]) || "development",

  port: Number(process.env.PORT) || 3000,

  // Gemini API key is read securely from the server environment.
  geminiApiKey: process.env.GEMINI_API_KEY,

  // Set SESSION_SECRET in Render Environment Variables.
  sessionSecret:
    process.env.SESSION_SECRET ||
    "rsr-ai-v4-production-default-secret-salt",

  allowedOrigins: parseAllowedOrigins(process.env.ALLOWED_ORIGINS),

  sessionMaxAgeMs: 7 * 24 * 60 * 60 * 1000, // 7 days

  rateLimitWindowMs: 60 * 1000, // 1 minute
};

import { z } from "zod";

const EnvSchema = z.object({
  GOOGLE_API_KEY: z.string().min(1, "GOOGLE_API_KEY is required"),
  GEMINI_MODEL: z.string().default("gemini-3.5-flash"),
  GEMINI_REASONING_EFFORT: z.enum(["minimal", "low", "medium", "high"]).default("low"),
  CHAT_TIMEOUT_MS: z.coerce.number().int().min(10_000).max(600_000).default(180_000),
  CHAT_LOG_PROGRESS_MS: z.coerce.number().int().min(1_000).max(60_000).default(5_000),
  CHAT_LOG_FORMAT: z.enum(["pretty", "json"]).default("pretty"),
  CHAT_MAX_CONCURRENT_REQUESTS: z.coerce.number().int().min(1).max(100).default(4),
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
});

function parseEnv() {
  const result = EnvSchema.safeParse(process.env);
  if (!result.success) {
    const missing = result.error.issues.map((i) => i.path.join(".")).join(", ");
    throw new Error(`Missing or invalid env variables: ${missing}`);
  }
  return result.data;
}

export const env = parseEnv();

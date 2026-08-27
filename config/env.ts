import { z } from "zod";

const EnvSchema = z.object({
  OPENROUTER_API_KEY: z.string().min(1, "OPENROUTER_API_KEY is required"),
  OPENROUTER_MODEL: z.string().default("google/gemini-3.5-flash"),
  OPENROUTER_FALLBACK_MODELS: z
    .string()
    .default("google/gemini-3.5-flash-lite")
    .transform((value) =>
      value
        .split(",")
        .map((model) => model.trim())
        .filter(Boolean)
    ),
  OPENROUTER_REASONING_EFFORT: z
    .enum(["none", "minimal", "low", "medium", "high"])
    .default("minimal"),
  OPENROUTER_REASONING_MAX_TOKENS: z.coerce
    .number()
    .int()
    .min(0)
    .max(32_768)
    .default(1_200),
  OPENROUTER_MAX_OUTPUT_TOKENS: z.coerce
    .number()
    .int()
    .min(1_024)
    .max(65_536)
    .default(8_192),
  OPENROUTER_DATA_COLLECTION: z.enum(["allow", "deny"]).default("deny"),
  CHAT_TIMEOUT_MS: z.coerce.number().int().min(10_000).max(600_000).default(180_000),
  CHAT_LOG_PROGRESS_MS: z.coerce.number().int().min(1_000).max(60_000).default(5_000),
  CHAT_LOG_FORMAT: z.enum(["pretty", "json"]).default("pretty"),
  CHAT_MAX_CONCURRENT_REQUESTS: z.coerce.number().int().min(1).max(100).default(4),
  RESEARCH_AGENT_RECURSION_LIMIT: z.coerce
    .number()
    .int()
    .min(8)
    .max(50)
    .default(50),
  DATABASE_URL: z.string().url("DATABASE_URL is required"),
  POSTGRES_SSL_MODE: z.enum(["disable", "prefer", "require"]).default("prefer"),
  QUERY_TIMEOUT_MS: z.coerce.number().int().min(1_000).max(120_000).default(20_000),
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

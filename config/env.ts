import { z } from "zod";

const EnvSchema = z.object({
  GOOGLE_API_KEY: z.string().min(1, "GOOGLE_API_KEY is required"),
  GEMINI_MODEL:   z.string().default("gemini-2.0-flash"),
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

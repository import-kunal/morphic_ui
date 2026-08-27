export {};

process.env.OPENROUTER_API_KEY ??= "not-used-by-postgres-gate";
process.env.OPENROUTER_MODEL ??= "google/gemini-3.5-flash";
if (!process.env.DATABASE_URL) {
  throw new Error("DATABASE_URL is required for the PostgreSQL gate.");
}
process.env.POSTGRES_SSL_MODE ??= "disable";

const { queryIqraData } = await import("../lib/research/service");

const result = await queryIqraData({
  dataset: "funds",
  fields: ["fund_id", "fund_name", "nature", "aum_cr", "aum_date"],
  orderBy: [{ field: "fund_id", direction: "asc" }],
  limit: 1,
});

if (result.source !== "postgres") throw new Error("Expected PostgreSQL source.");
if (result.rows.length !== 1) throw new Error("Expected at least one fund row.");
console.log("PASS PostgreSQL connection and allow-listed fund query");
console.log(`PostgreSQL gate: ${result.rows.length} bounded row read`);

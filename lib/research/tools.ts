import { tool } from "langchain";
import { z } from "zod";
import { IQRA_DATASET_NAMES, IQRA_FIELD_NAMES } from "@/lib/research/catalog";
import {
  analyzeIqraData,
  queryIqraData,
  searchIqraEntities,
} from "@/lib/research/service";

const searchEntitiesTool = tool(
  async (input, config) =>
    runTool(() => searchIqraEntities(input, config.signal), config.signal),
  {
    name: "search_iqra_entities",
    description:
      "Resolve names to canonical IQRA IDs before querying facts. Searches funds, schemes, managers, AMCs, securities, and benchmarks. Use it whenever the user gives names rather than IDs.",
    schema: z.object({
      query: z.string().min(2).max(200),
      entityTypes: z
        .array(
          z.enum(["fund", "scheme", "manager", "amc", "security", "benchmark"])
        )
        .min(1)
        .max(6),
      limit: z.number().int().min(1).max(20).default(10),
    }),
  }
);

const queryDataTool = tool(
  async (input, config) =>
    runTool(
      () =>
        queryIqraData(
          {
            ...input,
            filters: input.filters?.map((filter) => ({
              field: filter.field,
              operator: filter.operator,
              value: filter.operator === "in" ? filter.values : filter.value,
            })),
          },
          config.signal
        ),
      config.signal
    ),
  {
    name: "query_iqra_data",
    description:
      "Read factual mutual-fund records from PostgreSQL with safe filters, selected fields, ordering, and a bounded limit. Available datasets: funds, schemes, nav_history, dividend_history, amcs, managers, manager_tenures, holdings, risk_ratios, valuation_metrics, debt_metrics, indices, index_history, amfi_indices, amfi_index_history, benchmark_map. Never invent a field that is not in the selected dataset. Holdings rows are individual records, not an aggregated allocation; use analyze_iqra_data for market-cap or sector allocation.",
    schema: z.object({
      dataset: z.enum(IQRA_DATASET_NAMES),
      fields: z.array(z.enum(IQRA_FIELD_NAMES)).max(18).optional(),
      filters: z
        .array(
          z.object({
            field: z.enum(IQRA_FIELD_NAMES),
            operator: z.enum([
              "eq",
              "neq",
              "contains",
              "in",
              "gte",
              "lte",
              "gt",
              "lt",
            ]),
            value: z
              .string()
              .default("")
              .describe("Single comparison value. Use an empty string for the in operator."),
            values: z
              .array(z.string())
              .max(50)
              .default([])
              .describe("Values for the in operator. Use an empty array otherwise."),
          })
        )
        .max(10)
        .optional(),
      orderBy: z
        .array(
          z.object({
            field: z.enum(IQRA_FIELD_NAMES),
            direction: z.enum(["asc", "desc"]),
          })
        )
        .max(3)
        .optional(),
      limit: z.number().int().min(1).max(100).default(25),
    }),
  }
);

const analyzeDataTool = tool(
  async (input, config) =>
    runTool(() => analyzeIqraData(input, config.signal), config.signal),
  {
    name: "analyze_iqra_data",
    description:
      "Run deterministic calculations over each fund's latest available portfolio. Supports portfolio overlap, common holdings, sector allocation, market-cap allocation, and concentration. Use canonical fund_id values from search_iqra_entities. This is the required tool for portfolio-allocation questions: use market_cap_allocation for a general allocation request and sector_allocation for a sector request; do not substitute a sample of holdings.",
    schema: z.object({
      analysis: z.enum([
        "portfolio_overlap",
        "common_holdings",
        "sector_allocation",
        "market_cap_allocation",
        "portfolio_concentration",
      ]),
      fundIds: z.array(z.number().int().min(1)).min(1).max(5),
      topN: z.number().int().min(1).max(50).default(10),
    }),
  }
);

export const researchTools = [
  searchEntitiesTool,
  queryDataTool,
  analyzeDataTool,
];

async function runTool(
  operation: () => Promise<unknown>,
  signal?: AbortSignal
) {
  try {
    return JSON.stringify({ ok: true, data: await operation() });
  } catch (error) {
    if (signal?.aborted) {
      throw signal.reason ?? new DOMException("IQRA tool aborted", "AbortError");
    }
    return JSON.stringify({
      ok: false,
      error: error instanceof Error ? error.message : String(error),
    });
  }
}

import type { IqraDataset } from "@/lib/research/catalog";
import {
  MAX_HOLDINGS_ROWS_PER_FUND,
  MAX_QUERY_ROWS,
} from "@/lib/research/constants";
import { getIqraDataSource } from "@/lib/research/data-source";
import type {
  IqraFilter,
  IqraOrderBy,
  IqraQueryResult,
  IqraRow,
} from "@/lib/research/types";

export type IqraEntityType =
  | "fund"
  | "scheme"
  | "manager"
  | "amc"
  | "security"
  | "benchmark";

export interface SearchEntitiesInput {
  query: string;
  entityTypes: IqraEntityType[];
  limit: number;
}

export interface QueryIqraDataInput {
  dataset: IqraDataset;
  fields?: string[];
  filters?: IqraFilter[];
  orderBy?: IqraOrderBy[];
  limit?: number;
}

export type IqraAnalysis =
  | "portfolio_overlap"
  | "common_holdings"
  | "sector_allocation"
  | "market_cap_allocation"
  | "portfolio_concentration";

export interface AnalyzeIqraDataInput {
  analysis: IqraAnalysis;
  fundIds: number[];
  topN: number;
}

export async function searchIqraEntities(
  input: SearchEntitiesInput,
  signal?: AbortSignal
) {
  const source = await getIqraDataSource();
  const searches = input.entityTypes.map((entityType) =>
    searchEntityType(entityType, input.query, input.limit, signal)
  );
  const settled = await Promise.allSettled(searches);
  if (signal?.aborted) {
    throw signal.reason ?? new DOMException("IQRA search aborted", "AbortError");
  }
  const matches = settled.flatMap((result) =>
    result.status === "fulfilled" ? result.value : []
  );
  const warnings = settled.flatMap((result) =>
    result.status === "rejected"
      ? [result.reason instanceof Error ? result.reason.message : String(result.reason)]
      : []
  );
  return {
    source: source.kind,
    query: input.query,
    matches: matches.slice(0, input.limit * input.entityTypes.length),
    matchCount: matches.length,
    warnings,
  };
}

export async function queryIqraData(
  input: QueryIqraDataInput,
  signal?: AbortSignal
): Promise<IqraQueryResult> {
  const source = await getIqraDataSource();
  return source.query(
    {
      ...input,
      limit: Math.min(input.limit ?? 25, MAX_QUERY_ROWS),
    },
    signal
  );
}

export async function analyzeIqraData(
  input: AnalyzeIqraDataInput,
  signal?: AbortSignal
) {
  const source = await getIqraDataSource();
  const holdings = await source.latestHoldings(
    input.fundIds,
    MAX_HOLDINGS_ROWS_PER_FUND,
    signal
  );
  const fundRows = groupByFund(holdings.rows);
  const missingFundIds = input.fundIds.filter(
    (fundId) => !fundRows.has(String(fundId))
  );
  if (missingFundIds.length) {
    throw new Error(
      `No portfolio holdings were found for fund_id: ${missingFundIds.join(", ")}.`
    );
  }

  const common = {
    source: source.kind,
    analysis: input.analysis,
    fundIds: input.fundIds,
    asOfByFund: holdings.asOfByFund,
    holdingsTruncated: holdings.truncated,
  };

  switch (input.analysis) {
    case "portfolio_overlap":
      assertMultipleFunds(input);
      return { ...common, pairs: calculateOverlapPairs(input.fundIds, fundRows) };
    case "common_holdings":
      assertMultipleFunds(input);
      return {
        ...common,
        rows: calculateCommonHoldings(input.fundIds, fundRows).slice(0, input.topN),
      };
    case "sector_allocation":
      return {
        ...common,
        rows: allocationRows(input.fundIds, fundRows, "sector_name", input.topN),
      };
    case "market_cap_allocation":
      return {
        ...common,
        rows: allocationRows(
          input.fundIds,
          fundRows,
          "market_cap_caption",
          input.topN
        ),
      };
    case "portfolio_concentration":
      return {
        ...common,
        funds: input.fundIds.map((fundId) =>
          concentrationForFund(fundId, fundRows.get(String(fundId)) ?? [], input.topN)
        ),
      };
  }
}

async function searchEntityType(
  entityType: IqraEntityType,
  query: string,
  limit: number,
  signal?: AbortSignal
) {
  switch (entityType) {
    case "fund":
      return entityMatches(
        entityType,
        await queryIqraData({
          dataset: "funds",
          fields: ["fund_id", "fund_name", "nature", "sub_nature", "mf_id"],
          filters: [{ field: "fund_name", operator: "contains", value: query }],
          limit,
        }, signal)
      );
    case "scheme":
      return entityMatches(
        entityType,
        await queryIqraData({
          dataset: "schemes",
          fields: ["scheme_id", "fund_id", "scheme_name", "plan", "option", "isin"],
          filters: [{ field: "scheme_name", operator: "contains", value: query }],
          limit,
        }, signal)
      );
    case "manager":
      return entityMatches(
        entityType,
        await queryIqraData({
          dataset: "managers",
          fields: ["fund_manager_id", "name", "active"],
          filters: [{ field: "name", operator: "contains", value: query }],
          limit,
        }, signal)
      );
    case "amc":
      return entityMatches(
        entityType,
        await queryIqraData({
          dataset: "amcs",
          fields: ["mf_id", "name", "amfi_amc_code"],
          filters: [{ field: "name", operator: "contains", value: query }],
          limit,
        }, signal)
      );
    case "security": {
      const result = await queryIqraData({
        dataset: "holdings",
        fields: ["company_name", "company_isin", "sector_name", "instrument_name"],
        filters: [{ field: "company_name", operator: "contains", value: query }],
        limit: Math.min(limit * 5, MAX_QUERY_ROWS),
      }, signal);
      return dedupeRows(result.rows, (row) =>
        String(row.company_isin ?? row.company_name ?? "")
      )
        .slice(0, limit)
        .map((row) => ({ entityType, ...row }));
    }
    case "benchmark": {
      const [mfi, amfi] = await Promise.all([
        queryIqraData({
          dataset: "indices",
          fields: ["index_id", "index_name", "is_restricted"],
          filters: [{ field: "index_name", operator: "contains", value: query }],
          limit,
        }, signal),
        queryIqraData({
          dataset: "amfi_indices",
          fields: ["index_id", "index_name"],
          filters: [{ field: "index_name", operator: "contains", value: query }],
          limit,
        }, signal),
      ]);
      return dedupeRows([...mfi.rows, ...amfi.rows], (row) =>
        String(row.index_name ?? row.index_id ?? "")
      )
        .slice(0, limit)
        .map((row) => ({ entityType, ...row }));
    }
  }
}

function entityMatches(entityType: IqraEntityType, result: IqraQueryResult) {
  return result.rows.map((row) => ({ entityType, ...row }));
}

function groupByFund(rows: IqraRow[]) {
  const grouped = new Map<string, IqraRow[]>();
  for (const row of rows) {
    const fundId = String(row.fund_id ?? "");
    const fund = grouped.get(fundId) ?? [];
    fund.push(row);
    grouped.set(fundId, fund);
  }
  return grouped;
}

function calculateOverlapPairs(
  fundIds: number[],
  fundRows: Map<string, IqraRow[]>
) {
  const pairs: Array<Record<string, unknown>> = [];
  for (let leftIndex = 0; leftIndex < fundIds.length; leftIndex++) {
    for (let rightIndex = leftIndex + 1; rightIndex < fundIds.length; rightIndex++) {
      const leftId = fundIds[leftIndex];
      const rightId = fundIds[rightIndex];
      const left = holdingWeights(fundRows.get(String(leftId)) ?? []);
      const right = holdingWeights(fundRows.get(String(rightId)) ?? []);
      const commonKeys = [...left.keys()].filter((key) => right.has(key));
      const overlap = commonKeys.reduce(
        (sum, key) => sum + Math.min(left.get(key) ?? 0, right.get(key) ?? 0),
        0
      );
      pairs.push({
        leftFundId: leftId,
        rightFundId: rightId,
        overlapPercentage: round(overlap),
        commonHoldingCount: commonKeys.length,
      });
    }
  }
  return pairs;
}

function calculateCommonHoldings(
  fundIds: number[],
  fundRows: Map<string, IqraRow[]>
) {
  const maps = fundIds.map((fundId) => {
    const result = new Map<string, IqraRow>();
    for (const row of fundRows.get(String(fundId)) ?? []) {
      result.set(holdingKey(row), row);
    }
    return result;
  });
  const keys = [...(maps[0]?.keys() ?? [])].filter((key) =>
    maps.every((map) => map.has(key))
  );
  return keys
    .map((key) => {
      const first = maps[0].get(key) ?? {};
      const weights = Object.fromEntries(
        fundIds.map((fundId, index) => [
          String(fundId),
          round(numberValue(maps[index].get(key)?.percentage_in_net_asset)),
        ])
      );
      return {
        companyName: first.company_name,
        companyIsin: first.company_isin,
        sectorName: first.sector_name,
        weightsByFund: weights,
        minimumWeight: Math.min(...Object.values(weights)),
      };
    })
    .sort((left, right) => right.minimumWeight - left.minimumWeight);
}

function allocationRows(
  fundIds: number[],
  fundRows: Map<string, IqraRow[]>,
  field: "sector_name" | "market_cap_caption",
  topN: number
) {
  return fundIds.flatMap((fundId) => {
    const totals = new Map<string, number>();
    for (const row of fundRows.get(String(fundId)) ?? []) {
      const label = String(row[field] ?? "Unclassified").trim() || "Unclassified";
      totals.set(
        label,
        (totals.get(label) ?? 0) + numberValue(row.percentage_in_net_asset)
      );
    }
    return [...totals]
      .map(([label, percentage]) => ({ fundId, label, percentage: round(percentage) }))
      .sort((left, right) => right.percentage - left.percentage)
      .slice(0, topN);
  });
}

function concentrationForFund(fundId: number, rows: IqraRow[], topN: number) {
  const holdings = [...rows]
    .map((row) => ({
      companyName: row.company_name,
      companyIsin: row.company_isin,
      sectorName: row.sector_name,
      weight: round(numberValue(row.percentage_in_net_asset)),
    }))
    .sort((left, right) => right.weight - left.weight);
  const sumTop = (count: number) =>
    round(holdings.slice(0, count).reduce((sum, row) => sum + row.weight, 0));
  return {
    fundId,
    holdingCount: holdings.length,
    top1Percentage: sumTop(1),
    top5Percentage: sumTop(5),
    top10Percentage: sumTop(10),
    topHoldings: holdings.slice(0, topN),
  };
}

function holdingWeights(rows: IqraRow[]) {
  return new Map(
    rows.map((row) => [
      holdingKey(row),
      numberValue(row.percentage_in_net_asset),
    ])
  );
}

function holdingKey(row: IqraRow) {
  return String(row.company_isin ?? row.company_name ?? "")
    .trim()
    .toLocaleLowerCase();
}

function assertMultipleFunds(input: AnalyzeIqraDataInput) {
  if (input.fundIds.length < 2) {
    throw new Error(`${input.analysis} requires at least two fund IDs.`);
  }
}

function dedupeRows(rows: IqraRow[], key: (row: IqraRow) => string) {
  return [...new Map(rows.map((row) => [key(row), row])).values()];
}

function numberValue(value: unknown) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

function round(value: number) {
  return Math.round(value * 100) / 100;
}

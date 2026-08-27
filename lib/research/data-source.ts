import postgres, { type Sql } from "postgres";
import { env } from "@/config/env";
import { getDataset, isDatasetField } from "@/lib/research/catalog";
import {
  MAX_QUERY_ROWS,
  POSTGRES_MAX_CONNECTIONS,
} from "@/lib/research/constants";
import type {
  IqraDataSource,
  IqraFilter,
  IqraQuery,
  IqraQueryResult,
  IqraRow,
  LatestHoldingsResult,
} from "@/lib/research/types";

let source: IqraDataSource | null = null;

export function getIqraDataSource(): Promise<IqraDataSource> {
  source ??= new PostgresIqraDataSource(env.DATABASE_URL);
  return Promise.resolve(source);
}

class PostgresIqraDataSource implements IqraDataSource {
  readonly kind = "postgres" as const;
  private readonly sql: Sql;

  constructor(databaseUrl: string) {
    this.sql = postgres(databaseUrl, {
      max: POSTGRES_MAX_CONNECTIONS,
      connect_timeout: Math.ceil(env.QUERY_TIMEOUT_MS / 1_000),
      idle_timeout: 20,
      ssl:
        env.POSTGRES_SSL_MODE === "disable" ? false : env.POSTGRES_SSL_MODE,
      connection: { statement_timeout: env.QUERY_TIMEOUT_MS },
      onnotice: () => undefined,
    });
  }

  async query(input: IqraQuery, signal?: AbortSignal): Promise<IqraQueryResult> {
    validateQuery(input);
    const definition = getDataset(input.dataset);
    const fields = input.fields?.length
      ? input.fields
      : [...definition.defaultFields];
    const parameters: unknown[] = [];
    const where = (input.filters ?? []).map((filter) =>
      compilePostgresFilter(filter, parameters)
    );
    const orderBy = (input.orderBy ?? [])
      .map(
        (order) =>
          `${quoteIdentifier(order.field)} ${order.direction.toUpperCase()}`
      )
      .join(", ");
    parameters.push(input.limit + 1);

    const statement = [
      `SELECT ${fields.map(quoteIdentifier).join(", ")}`,
      `FROM ${quoteIdentifier(definition.table)}`,
      where.length ? `WHERE ${where.join(" AND ")}` : "",
      orderBy ? `ORDER BY ${orderBy}` : "",
      `LIMIT $${parameters.length}`,
    ]
      .filter(Boolean)
      .join(" ");

    const result = await executePendingQuery(
      this.sql.unsafe<IqraRow[]>(
        statement,
        parameters as Parameters<typeof this.sql.unsafe>[1]
      ),
      signal
    );
    const truncated = result.length > input.limit;
    const rows = Array.from(result.slice(0, input.limit));
    return {
      source: this.kind,
      dataset: input.dataset,
      rows,
      rowCount: rows.length,
      limit: input.limit,
      truncated,
    };
  }

  async latestHoldings(
    fundIds: number[],
    maximumRowsPerFund: number,
    signal?: AbortSignal
  ): Promise<LatestHoldingsResult> {
    const rows = await executePendingQuery(
      this.sql.unsafe<IqraRow[]>(
        `WITH latest_dates AS (
           SELECT fund_id, MAX(portfolio_date) AS portfolio_date
           FROM mfi360_fund_portfolio_holdings
           WHERE fund_id = ANY($1::int[])
           GROUP BY fund_id
         ), ranked AS (
           SELECT h.fund_id, h.scheme_id, h.portfolio_date, h.company_name,
                  h.company_isin, h.sector_name, h.instrument_name,
                  h.market_cap_caption, h.market_value,
                  h.percentage_in_net_asset,
                  ROW_NUMBER() OVER (
                    PARTITION BY h.fund_id
                    ORDER BY h.percentage_in_net_asset DESC NULLS LAST,
                             h.company_name ASC
                  ) AS row_number,
                  COUNT(*) OVER (PARTITION BY h.fund_id) AS total_count
           FROM mfi360_fund_portfolio_holdings h
           JOIN latest_dates d
             ON d.fund_id = h.fund_id AND d.portfolio_date = h.portfolio_date
         )
         SELECT fund_id, scheme_id, portfolio_date, company_name, company_isin,
                sector_name, instrument_name, market_cap_caption, market_value,
                percentage_in_net_asset, total_count
         FROM ranked
         WHERE row_number <= $2
         ORDER BY fund_id, percentage_in_net_asset DESC NULLS LAST`,
        [fundIds, maximumRowsPerFund]
      ),
      signal
    );
    const truncated = rows.some(
      (row) => numberValue(row.total_count) > maximumRowsPerFund
    );
    const cleanRows = Array.from(rows, (row) => {
      const clean = { ...row };
      delete clean.total_count;
      return clean;
    });
    return latestHoldingsResult(cleanRows, truncated);
  }
}

function validateQuery(input: IqraQuery) {
  const fields = [
    ...(input.fields ?? []),
    ...(input.filters ?? []).map((filter) => filter.field),
    ...(input.orderBy ?? []).map((order) => order.field),
  ];
  const invalid = fields.find((field) => !isDatasetField(input.dataset, field));
  if (invalid) {
    throw new Error(`Field ${invalid} is not available in ${input.dataset}.`);
  }
  if (input.limit < 1 || input.limit > MAX_QUERY_ROWS) {
    throw new Error(`Query limit must be between 1 and ${MAX_QUERY_ROWS}.`);
  }
}

function compilePostgresFilter(filter: IqraFilter, parameters: unknown[]) {
  const field = quoteIdentifier(filter.field);
  if (filter.operator === "in") {
    if (!Array.isArray(filter.value) || filter.value.length === 0) return "FALSE";
    const placeholders = filter.value.map((value) => {
      parameters.push(value);
      return `$${parameters.length}`;
    });
    return `${field} IN (${placeholders.join(", ")})`;
  }
  parameters.push(filter.value);
  const placeholder = `$${parameters.length}`;
  const operators = {
    eq: "=",
    neq: "<>",
    contains: "ILIKE",
    gte: ">=",
    lte: "<=",
    gt: ">",
    lt: "<",
  } as const;
  return `${field} ${operators[filter.operator]} ${
    filter.operator === "contains"
      ? `'%' || ${placeholder}::text || '%'`
      : placeholder
  }`;
}

function quoteIdentifier(value: string) {
  return `"${value.replaceAll('"', '""')}"`;
}

function latestHoldingsResult(
  rows: IqraRow[],
  truncated: boolean
): LatestHoldingsResult {
  const asOfByFund: Record<string, string> = {};
  for (const row of rows) {
    const fundId = String(row.fund_id ?? "");
    const date = toIsoDate(row.portfolio_date);
    if (fundId && date) asOfByFund[fundId] = date;
  }
  return { source: "postgres", asOfByFund, rows, truncated };
}

function toIsoDate(value: unknown) {
  if (value instanceof Date) return value.toISOString().slice(0, 10);
  if (typeof value === "string") return value.slice(0, 10);
  return "";
}

function numberValue(value: unknown) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

async function executePendingQuery<T>(
  query: PromiseLike<T> & { cancel(): void },
  signal?: AbortSignal
) {
  throwIfAborted(signal);
  const abort = () => query.cancel();
  signal?.addEventListener("abort", abort, { once: true });
  try {
    return await query;
  } catch (error) {
    if (signal?.aborted) {
      throw signal.reason ?? new DOMException("Database query aborted", "AbortError");
    }
    throw error;
  } finally {
    signal?.removeEventListener("abort", abort);
  }
}

function throwIfAborted(signal?: AbortSignal) {
  if (signal?.aborted) {
    throw signal.reason ?? new DOMException("Database query aborted", "AbortError");
  }
}

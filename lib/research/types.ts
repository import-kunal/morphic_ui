import type { IqraDataset } from "@/lib/research/catalog";

export type IqraScalar = string | number | boolean | null;
export type IqraRow = Record<string, unknown>;
export type IqraSourceKind = "postgres";

export type QueryOperator =
  | "eq"
  | "neq"
  | "contains"
  | "in"
  | "gte"
  | "lte"
  | "gt"
  | "lt";

export interface IqraFilter {
  field: string;
  operator: QueryOperator;
  value: IqraScalar | IqraScalar[];
}

export interface IqraOrderBy {
  field: string;
  direction: "asc" | "desc";
}

export interface IqraQuery {
  dataset: IqraDataset;
  fields?: string[];
  filters?: IqraFilter[];
  orderBy?: IqraOrderBy[];
  limit: number;
}

export interface IqraQueryResult {
  source: IqraSourceKind;
  dataset: IqraDataset;
  rows: IqraRow[];
  rowCount: number;
  limit: number;
  truncated: boolean;
}

export interface LatestHoldingsResult {
  source: IqraSourceKind;
  asOfByFund: Record<string, string>;
  rows: IqraRow[];
  truncated: boolean;
}

export interface IqraDataSource {
  readonly kind: IqraSourceKind;
  query(input: IqraQuery, signal?: AbortSignal): Promise<IqraQueryResult>;
  latestHoldings(
    fundIds: number[],
    maximumRowsPerFund: number,
    signal?: AbortSignal
  ): Promise<LatestHoldingsResult>;
}

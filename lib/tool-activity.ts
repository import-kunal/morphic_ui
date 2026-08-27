export interface ToolEntityReference {
  entityType: string;
  id: string;
  name: string;
}

export interface ToolActivityResult {
  rowCount?: number;
  matchCount?: number;
  analysis?: string;
  error?: string;
  entities?: ToolEntityReference[];
}

export interface ToolActivityAttempt {
  input: unknown;
  signature: string;
  isRetry: boolean;
  title: string;
}

type ToolActivityStatus = "running" | "finished" | "error";

const DATASET_LABELS: Record<string, string> = {
  funds: "fund details",
  schemes: "fund plans",
  nav_history: "NAV history",
  dividend_history: "dividend history",
  amcs: "fund-house details",
  managers: "fund-manager details",
  manager_tenures: "manager tenures",
  holdings: "portfolio holdings",
  risk_ratios: "risk metrics",
  valuation_metrics: "valuation metrics",
  debt_metrics: "debt metrics",
  indices: "benchmark details",
  index_history: "benchmark history",
  amfi_indices: "AMFI benchmark details",
  amfi_index_history: "AMFI benchmark history",
  benchmark_map: "benchmark mapping",
};

const ANALYSIS_LABELS: Record<string, string> = {
  portfolio_overlap: "portfolio overlap",
  common_holdings: "common holdings",
  sector_allocation: "sector allocation",
  market_cap_allocation: "market-cap allocation",
  portfolio_concentration: "portfolio concentration",
};

/**
 * Produces concise UI labels from the tool's real, validated input. It keeps
 * request-local entity names and failed operations so later calls can mention
 * the selected funds and identify genuine retries without another model call.
 */
export class ToolActivityDescriber {
  private readonly entityNames = new Map<string, string>();
  private readonly failedSignatures = new Set<string>();

  start(tool: string, input: unknown): ToolActivityAttempt {
    const signature = toolSignature(tool, input);
    const isRetry = this.failedSignatures.has(signature);
    return {
      input,
      signature,
      isRetry,
      title: describeToolActivity(
        tool,
        input,
        "running",
        undefined,
        isRetry,
        this.entityNames
      ),
    };
  }

  complete(
    tool: string,
    attempt: ToolActivityAttempt,
    status: "finished" | "error",
    result?: ToolActivityResult
  ) {
    if (status === "error" || result?.error) {
      this.failedSignatures.add(attempt.signature);
    } else {
      this.failedSignatures.delete(attempt.signature);
      for (const entity of result?.entities ?? []) {
        this.entityNames.set(entityKey(entity.entityType, entity.id), entity.name);
      }
    }

    return describeToolActivity(
      tool,
      attempt.input,
      status === "error" || result?.error ? "error" : "finished",
      result,
      attempt.isRetry,
      this.entityNames
    );
  }
}

export function describeToolActivity(
  tool: string,
  input: unknown,
  status: ToolActivityStatus,
  result?: ToolActivityResult,
  isRetry = false,
  entityNames = new Map<string, string>()
) {
  const args = asRecord(input);

  if (tool === "search_iqra_entities") {
    const query = safeLabel(args?.query, "selected entity");
    if (status === "running") return `${isRetry ? "Retrying match for" : "Matching"} ${query}`;
    if (status === "error") return `Could not match ${query}`;
    return (result?.matchCount ?? 0) > 0
      ? `Matched ${canonicalMatchName(result) ?? query}`
      : `No match found for ${query}`;
  }

  if (tool === "query_iqra_data") {
    const dataset = stringValue(args?.dataset);
    const object = DATASET_LABELS[dataset] ?? "fund data";
    const subject = subjectForQuery(args, dataset, entityNames);
    if (status === "running") {
      return `${isRetry ? "Retrying" : "Reading"} ${object}${subject}`;
    }
    if (status === "error") return `${sentenceCase(object)} request failed${subject}`;
    return `Read ${object}${subject}${isRetry ? " after retry" : ""}`;
  }

  if (tool === "analyze_iqra_data") {
    const analysis = stringValue(args?.analysis);
    const object = ANALYSIS_LABELS[analysis] ?? "portfolio metrics";
    const subject = subjectForFundIds(args?.fundIds, entityNames);
    if (status === "running") {
      return `${isRetry ? "Retrying" : "Calculating"} ${object}${subject}`;
    }
    if (status === "error") return `${sentenceCase(object)} calculation failed${subject}`;
    return `Calculated ${object}${subject}${isRetry ? " after retry" : ""}`;
  }

  const fallback = sentenceCase(tool.replaceAll("_", " "));
  if (status === "running") return isRetry ? `Retrying ${fallback}` : fallback;
  if (status === "error") return `${fallback} failed`;
  return isRetry ? `${fallback} completed after retry` : `${fallback} completed`;
}

function subjectForQuery(
  args: Record<string, unknown> | undefined,
  dataset: string,
  entityNames: Map<string, string>
) {
  const filters = Array.isArray(args?.filters) ? args.filters : [];
  const preferredType = entityTypeForDataset(dataset);
  const idField = preferredType === "scheme"
    ? "scheme_id"
    : preferredType === "manager"
      ? "fund_manager_id"
      : preferredType === "amc"
        ? "mf_id"
        : "fund_id";
  const ids = filters.flatMap((filter) => {
    const value = asRecord(filter);
    if (value?.field !== idField) return [];
    if (value.operator === "in" && Array.isArray(value.values)) {
      return value.values.map(String);
    }
    return value.value === undefined || value.value === ""
      ? []
      : [String(value.value)];
  });
  return subjectForIds(ids, preferredType, entityNames);
}

function subjectForFundIds(
  value: unknown,
  entityNames: Map<string, string>
) {
  return subjectForIds(Array.isArray(value) ? value.map(String) : [], "fund", entityNames);
}

function subjectForIds(
  ids: string[],
  entityType: string,
  entityNames: Map<string, string>
) {
  const uniqueIds = [...new Set(ids)];
  if (uniqueIds.length === 0) return "";
  if (uniqueIds.length === 2 && entityType === "fund") return " for both funds";
  if (uniqueIds.length === 2 && entityType === "scheme") return " for both plans";
  if (uniqueIds.length > 1) {
    const noun = entityType === "fund"
      ? "funds"
      : entityType === "scheme"
        ? "plans"
        : "records";
    return ` for ${uniqueIds.length} ${noun}`;
  }
  const name = entityNames.get(entityKey(entityType, uniqueIds[0]));
  if (name) return ` for ${safeLabel(name, "selected fund")}`;
  const noun = entityType === "fund" ? "fund" : "record";
  return ` for the selected ${noun}`;
}

function canonicalMatchName(result?: ToolActivityResult) {
  if (result?.matchCount !== 1) return undefined;
  return result.entities?.[0]?.name;
}

function toolSignature(tool: string, input: unknown) {
  const args = asRecord(input);
  if (tool === "search_iqra_entities") {
    return `${tool}:${stringValue(args?.query).toLocaleLowerCase()}`;
  }
  if (tool === "query_iqra_data") {
    return `${tool}:${stringValue(args?.dataset)}:${identifierCount(args?.filters)}`;
  }
  if (tool === "analyze_iqra_data") {
    const fundIds = Array.isArray(args?.fundIds) ? args.fundIds.map(String).sort() : [];
    return `${tool}:${stringValue(args?.analysis)}:${fundIds.join(",")}`;
  }
  return tool;
}

function identifierCount(value: unknown) {
  if (!Array.isArray(value)) return 0;
  return value
    .map(asRecord)
    .filter((filter) => filter && /(?:^|_)id$/.test(stringValue(filter.field)))
    .reduce((count, filter) => {
      if (filter?.operator === "in" && Array.isArray(filter.values)) {
        return count + filter.values.length;
      }
      return filter?.value === undefined || filter.value === "" ? count : count + 1;
    }, 0);
}

function entityTypeForDataset(dataset: string) {
  if (["schemes", "nav_history", "dividend_history", "risk_ratios"].includes(dataset)) {
    return "scheme";
  }
  if (["indices", "index_history", "amfi_indices", "amfi_index_history"].includes(dataset)) {
    return "benchmark";
  }
  if (dataset === "managers") return "manager";
  if (dataset === "amcs") return "amc";
  return "fund";
}

function entityKey(entityType: string, id: string) {
  return `${entityType}:${id}`;
}

function safeLabel(value: unknown, fallback: string) {
  const cleaned = String(value ?? "")
    .replace(/[\r\n\t]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  if (!cleaned) return fallback;
  return cleaned.length > 88 ? `${cleaned.slice(0, 85)}…` : cleaned;
}

function sentenceCase(value: string) {
  return value.charAt(0).toUpperCase() + value.slice(1);
}

function stringValue(value: unknown) {
  return typeof value === "string" ? value : "";
}

function asRecord(value: unknown): Record<string, unknown> | undefined {
  return typeof value === "object" && value !== null
    ? (value as Record<string, unknown>)
    : undefined;
}

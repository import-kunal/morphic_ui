// Allow-listed database schema exposed to the research tools.
export const IQRA_DATASETS = {
  funds: {
    table: "mfi360_funds",
    fields: [
      "fund_id",
      "mf_id",
      "fund_name",
      "nature",
      "sub_nature",
      "riskometer",
      "fund_manager",
      "aum_cr",
      "aum_date",
      "portfolio_turnover_ratio",
      "fetched_at",
    ],
    defaultFields: [
      "fund_id",
      "mf_id",
      "fund_name",
      "nature",
      "sub_nature",
      "riskometer",
      "fund_manager",
      "aum_cr",
      "aum_date",
    ],
  },
  schemes: {
    table: "mfi360_fund_plans",
    fields: [
      "scheme_id",
      "fund_id",
      "scheme_name",
      "plan",
      "option",
      "amfi_code",
      "amfi_amc_code",
      "isin",
      "launch_date",
      "expense_ratio",
      "min_invest",
      "exit_load",
      "fetched_at",
    ],
    defaultFields: [
      "scheme_id",
      "fund_id",
      "scheme_name",
      "plan",
      "option",
      "isin",
      "launch_date",
      "expense_ratio",
      "min_invest",
    ],
  },
  nav_history: {
    table: "mfi360_fund_plans_norm_nav_history",
    fields: [
      "scheme_id",
      "nav_date",
      "normalized_nav",
      "source_system",
      "fetched_at",
    ],
    defaultFields: [
      "scheme_id",
      "nav_date",
      "normalized_nav",
      "source_system",
    ],
  },
  dividend_history: {
    table: "mfi360_fund_plan_dividend_history",
    fields: ["scheme_id", "dividend_date", "dividend_pct", "fetched_at"],
    defaultFields: ["scheme_id", "dividend_date", "dividend_pct"],
  },
  amcs: {
    table: "mfi360_amcs",
    fields: ["mf_id", "name", "amfi_amc_code", "fetched_at"],
    defaultFields: ["mf_id", "name", "amfi_amc_code"],
  },
  managers: {
    table: "mfi360_fund_managers",
    fields: [
      "fund_manager_id",
      "name",
      "active",
      "educational_qualification",
      "duplicate_of_fund_manager_id",
      "fetched_at",
    ],
    defaultFields: [
      "fund_manager_id",
      "name",
      "active",
      "educational_qualification",
    ],
  },
  manager_tenures: {
    table: "mfi360_fund_manager_tenures",
    fields: [
      "fund_manager_id",
      "amc_id",
      "fund_id",
      "fund_name",
      "from_date",
      "to_date",
      "fetched_at",
    ],
    defaultFields: [
      "fund_manager_id",
      "amc_id",
      "fund_id",
      "fund_name",
      "from_date",
      "to_date",
    ],
  },
  holdings: {
    table: "mfi360_fund_portfolio_holdings",
    fields: [
      "fund_id",
      "scheme_id",
      "portfolio_date",
      "company_name",
      "issuer_name",
      "company_isin",
      "sector_name",
      "instrument_name",
      "market_cap_caption",
      "quantity",
      "market_value",
      "percentage_in_net_asset",
      "coupon_rate",
      "maturity_date",
      "rating",
      "rating_agency",
      "is_new_in",
      "fetched_at",
    ],
    defaultFields: [
      "fund_id",
      "scheme_id",
      "portfolio_date",
      "company_name",
      "company_isin",
      "sector_name",
      "instrument_name",
      "market_cap_caption",
      "market_value",
      "percentage_in_net_asset",
    ],
  },
  risk_ratios: {
    table: "mfi360_scheme_risk_ratios",
    fields: [
      "scheme_id",
      "standard_deviation",
      "beta",
      "sharpe_ratio",
      "fetched_at",
    ],
    defaultFields: [
      "scheme_id",
      "standard_deviation",
      "beta",
      "sharpe_ratio",
    ],
  },
  valuation_metrics: {
    table: "mfi360_scheme_valuation_metrics",
    fields: [
      "fund_id",
      "portfolio_date",
      "price_to_earnings",
      "price_to_book",
      "dividend_yield",
      "market_cap",
      "portfolio_turnover_ratio",
      "fetched_at",
    ],
    defaultFields: [
      "fund_id",
      "portfolio_date",
      "price_to_earnings",
      "price_to_book",
      "dividend_yield",
      "market_cap",
      "portfolio_turnover_ratio",
    ],
  },
  debt_metrics: {
    table: "mfi360_fund_debt_metrics",
    fields: [
      "fund_id",
      "portfolio_date",
      "average_maturity",
      "average_maturity_unit",
      "yield_to_maturity",
      "modified_duration",
      "modified_duration_unit",
      "fetched_at",
    ],
    defaultFields: [
      "fund_id",
      "portfolio_date",
      "average_maturity",
      "average_maturity_unit",
      "yield_to_maturity",
      "modified_duration",
      "modified_duration_unit",
    ],
  },
  indices: {
    table: "mfi360_indices",
    fields: ["index_id", "index_name", "is_restricted", "fetched_at"],
    defaultFields: ["index_id", "index_name", "is_restricted"],
  },
  index_history: {
    table: "mfi360_indices_history",
    fields: [
      "index_id",
      "index_date",
      "value",
      "anchor_scheme_id",
      "fetched_at",
    ],
    defaultFields: ["index_id", "index_date", "value", "anchor_scheme_id"],
  },
  amfi_indices: {
    table: "amfi_portal_indices",
    fields: ["index_id", "index_name", "fetched_at"],
    defaultFields: ["index_id", "index_name"],
  },
  amfi_index_history: {
    table: "amfi_portal_indices_history",
    fields: ["index_id", "index_date", "value", "fetched_at"],
    defaultFields: ["index_id", "index_date", "value"],
  },
  benchmark_map: {
    table: "benchmark_reference_map",
    fields: [
      "benchmark",
      "source_system",
      "mfi360_index_id",
      "amfi_portal_index_id",
      "mcx_icomdex_instrument_id",
      "mcx_spot_commodity_id",
      "composite_key",
      "components",
      "resolved_at",
    ],
    defaultFields: [
      "benchmark",
      "source_system",
      "mfi360_index_id",
      "amfi_portal_index_id",
      "composite_key",
      "components",
    ],
  },
} as const;

export type IqraDataset = keyof typeof IQRA_DATASETS;

export const IQRA_DATASET_NAMES = Object.keys(IQRA_DATASETS) as [
  IqraDataset,
  ...IqraDataset[],
];

export const IQRA_FIELD_NAMES = [
  ...new Set(
    Object.values(IQRA_DATASETS).flatMap((dataset) => [
      ...dataset.fields,
    ])
  ),
] as [string, ...string[]];

export function getDataset(dataset: IqraDataset) {
  return IQRA_DATASETS[dataset];
}

export function isDatasetField(dataset: IqraDataset, field: string) {
  return (IQRA_DATASETS[dataset].fields as readonly string[]).includes(field);
}

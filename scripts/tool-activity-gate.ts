import { strict as assert } from "node:assert";
import { ToolActivityDescriber } from "../lib/tool-activity";

const describer = new ToolActivityDescriber();

const paragSearch = describer.start("search_iqra_entities", {
  query: "Parag Parikh Flexi Cap Fund",
  entityTypes: ["fund"],
});
assert.equal(paragSearch.title, "Matching Parag Parikh Flexi Cap Fund");
assert.equal(
  describer.complete("search_iqra_entities", paragSearch, "finished", {
    matchCount: 1,
    entities: [
      {
        entityType: "fund",
        id: "5888",
        name: "Parag Parikh Flexi Cap Fund",
      },
    ],
  }),
  "Matched Parag Parikh Flexi Cap Fund"
);

const hdfcSearch = describer.start("search_iqra_entities", {
  query: "HDFC Flexi Cap Fund",
  entityTypes: ["fund"],
});
describer.complete("search_iqra_entities", hdfcSearch, "finished", {
  matchCount: 1,
  entities: [
    { entityType: "fund", id: "425", name: "HDFC Flexi Cap Fund" },
  ],
});

const fundQueryInput = {
  dataset: "funds",
  filters: [
    {
      field: "fund_id",
      operator: "in",
      value: "",
      values: ["5888", "425"],
    },
  ],
};
const fundQuery = describer.start("query_iqra_data", fundQueryInput);
assert.equal(fundQuery.title, "Reading fund details for both funds");
assert.equal(
  describer.complete("query_iqra_data", fundQuery, "finished", {
    rowCount: 2,
  }),
  "Read fund details for both funds"
);

const riskQueryInput = { ...fundQueryInput, dataset: "risk_ratios" };
const failedRiskQuery = describer.start("query_iqra_data", riskQueryInput);
assert.equal(
  describer.complete("query_iqra_data", failedRiskQuery, "finished", {
    error: "A requested field is unavailable.",
  }),
  "Risk metrics request failed"
);

const retriedRiskQuery = describer.start("query_iqra_data", {
  dataset: "risk_ratios",
  filters: [
    {
      field: "scheme_id",
      operator: "in",
      value: "",
      values: ["20004", "16722"],
    },
  ],
});
assert.equal(retriedRiskQuery.title, "Retrying risk metrics for both plans");
assert.equal(
  describer.complete("query_iqra_data", retriedRiskQuery, "finished", {
    rowCount: 2,
  }),
  "Read risk metrics for both plans after retry"
);

const allocation = describer.start("analyze_iqra_data", {
  analysis: "market_cap_allocation",
  fundIds: [5888],
});
assert.equal(
  allocation.title,
  "Calculating market-cap allocation for Parag Parikh Flexi Cap Fund"
);

console.log("PASS tool activity titles are specific, sanitized, and retry-aware");

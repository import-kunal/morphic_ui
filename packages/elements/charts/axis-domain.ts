export type NumericDomain = [number, number];

export function focusedNumericDomain(
  series: Array<{ data: number[] }>,
  includeZero = false
): NumericDomain {
  const values = series.flatMap(({ data }) =>
    Array.isArray(data) ? data.filter(Number.isFinite) : []
  );

  if (values.length === 0) return [0, 1];

  const minimum = Math.min(...values);
  const maximum = Math.max(...values);
  const span = maximum - minimum;
  const reference = Math.max(Math.abs(minimum), Math.abs(maximum), 1);
  const padding = span > 0 ? span * 0.08 : reference * 0.05;

  let lower = minimum - padding;
  let upper = maximum + padding;

  if (includeZero) {
    lower = Math.min(0, lower);
    upper = Math.max(0, upper);
  } else if (minimum >= 0) {
    lower = Math.max(0, lower);
  } else if (maximum <= 0) {
    upper = Math.min(0, upper);
  }

  return [roundAxisValue(lower), roundAxisValue(upper)];
}

export function formatAxisValue(value: number) {
  return new Intl.NumberFormat("en-IN", {
    maximumFractionDigits: Math.abs(value) < 10 ? 2 : 1,
    notation: Math.abs(value) >= 100_000 ? "compact" : "standard",
  }).format(value);
}

function roundAxisValue(value: number) {
  const precision = Math.abs(value) < 10 ? 100 : 10;
  return Math.round(value * precision) / precision;
}

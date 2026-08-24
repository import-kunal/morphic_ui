import { z } from "zod";
import { defineComponent } from "@/packages/engine";
import type { ComponentRendererProps } from "@/packages/engine/types";
import type { CSSProperties, ReactNode } from "react";

function parseNum(cell: unknown): number | null {
  if (typeof cell === "number") return cell;
  if (typeof cell === "string") {
    const n = parseFloat(cell.replace("%", ""));
    return isNaN(n) ? null : n;
  }
  return null;
}

function cellStyle(value: unknown, min: number, max: number): CSSProperties {
  const n = parseNum(value);
  if (n === null) return {};
  const abs = Math.max(Math.abs(min), Math.abs(max));
  if (abs === 0) return {};
  const intensity = Math.min(Math.abs(n) / abs, 1) * 0.45;
  return {
    backgroundColor: n > 0
      ? `rgba(34,197,94,${intensity})`
      : n < 0
      ? `rgba(239,68,68,${intensity})`
      : "transparent",
    textAlign: "center",
  };
}

export const Heatmap = defineComponent({
  name: "Heatmap",
  description: "Color-coded heatmap table. columns[] are headers (first is the row label column). rows[] are arrays where index 0 is the label and the rest are numbers or percent strings — cells are colored green (positive) to red (negative) relative to the range.",
  props: z.object({
    columns: z.array(z.string()),
    rows:    z.array(z.array(z.unknown())),
  }),
  component: ({ props }: ComponentRendererProps): ReactNode => {
    const columns = props["columns"] as string[] | null;
    const rows    = props["rows"]    as unknown[][] | null;

    if (!Array.isArray(columns) || !Array.isArray(rows)) return null;

    // Collect all numeric values to establish the color scale range
    const nums: number[] = [];
    for (const row of rows) {
      if (!Array.isArray(row)) continue;
      for (const cell of row.slice(1)) {
        const n = parseNum(cell);
        if (n !== null) nums.push(n);
      }
    }
    const min = nums.length ? Math.min(...nums) : 0;
    const max = nums.length ? Math.max(...nums) : 0;

    return (
      <div className="w-full overflow-auto rounded-md border border-zinc-800">
        <table className="w-full text-sm border-collapse">
          <thead>
            <tr className="border-b border-zinc-800">
              {columns.map((col, i) => (
                <th
                  key={i}
                  className={`px-4 py-2.5 font-medium text-zinc-400 ${i === 0 ? "text-left" : "text-center"}`}
                >
                  {col}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((row, ri) => {
              if (!Array.isArray(row)) return null;
              return (
                <tr key={ri} className="border-b border-zinc-800/50 last:border-0">
                  {row.map((cell, ci) => (
                    <td
                      key={ci}
                      className="px-4 py-3 transition-colors"
                      style={ci === 0 ? {} : cellStyle(cell, min, max)}
                    >
                      {ci === 0
                        ? <span className="font-medium text-zinc-200">{String(cell ?? "")}</span>
                        : <span className="font-mono font-semibold">{String(cell ?? "")}</span>
                      }
                    </td>
                  ))}
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    );
  },
});

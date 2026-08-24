
import { z } from "zod";
import { defineComponent } from "@/packages/engine";
import {
  Table as ShadTable,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import type { ComponentRendererProps } from "@/packages/engine/types";
import type { ReactNode } from "react";

export const Table = defineComponent({
  name: "Table",
  description: "A data table. columns is a string array, rows is an array of value arrays.",
  props: z.object({
    columns: z.array(z.string()),
    rows:    z.array(z.array(z.unknown())),
    caption: z.string().optional(),
  }),
  component: ({ props, renderNode }: ComponentRendererProps): ReactNode => {
    const columns = props["columns"] as string[] | null;
    const rows    = props["rows"]    as unknown[][] | null;

    if (!Array.isArray(columns) || !Array.isArray(rows)) return null;

    function renderCell(cell: unknown): ReactNode {
      if (cell === null || cell === undefined) return null;
      if (typeof cell === "boolean") {
        return (
          <Badge variant={cell ? "default" : "secondary"}>
            {cell ? "Yes" : "No"}
          </Badge>
        );
      }
      // Element node — let the engine render it (e.g. Tag, Button)
      if (typeof cell === "object" && (cell as { type?: string }).type === "element") {
        return renderNode(cell) as ReactNode;
      }
      return String(cell);
    }

    return (
      <div className="w-full overflow-auto">
        <ShadTable>
          {props["caption"] ? (
            <caption className="mt-4 text-sm text-muted-foreground">
              {props["caption"] as string}
            </caption>
          ) : null}
          <TableHeader>
            <TableRow>
              {columns.map((col) => (
                <TableHead key={col}>{col}</TableHead>
              ))}
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.map((row, ri) => {
              if (!Array.isArray(row)) return null;
              return (
                <TableRow key={ri}>
                  {row.map((cell, ci) => (
                    <TableCell key={ci}>{renderCell(cell)}</TableCell>
                  ))}
                </TableRow>
              );
            })}
          </TableBody>
        </ShadTable>
      </div>
    );
  },
});

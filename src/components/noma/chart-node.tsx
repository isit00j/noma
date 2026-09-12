import { Node, mergeAttributes } from "@tiptap/core";
import { ReactNodeViewRenderer, type NodeViewProps } from "@tiptap/react";
import React, { useState } from "react";
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Legend,
  Line,
  LineChart,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { Edit3, Trash2, Plus, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { cn } from "@/lib/utils";

export type ChartType = "bar" | "line" | "pie";

export interface ChartDataItem {
  name: string;
  value: number;
  [key: string]: string | number;
}

export interface ChartNodeAttributes {
  version: number;
  type: ChartType;
  title: string;
  data: ChartDataItem[];
}

const PIE_COLORS = [
  "oklch(0.578 0.192 260)",
  "oklch(0.51 0.24 293)",
  "oklch(0.66 0.14 255)",
  "oklch(0.72 0.1 280)",
  "oklch(0.62 0.14 320)",
  "oklch(0.6 0.18 150)",
  "oklch(0.65 0.2 40)",
];

export function ChartRenderer({
  type,
  title,
  data,
  className,
}: {
  type: ChartType;
  title?: string;
  data: ChartDataItem[];
  className?: string;
}) {
  if (!data || data.length === 0) {
    return (
      <div className="flex h-48 items-center justify-center text-sm text-muted-foreground">
        No chart data available
      </div>
    );
  }

  return (
    <div className={cn("w-full py-2", className)}>
      {title && (
        <h4 className="mb-3 text-center font-sans text-sm font-semibold text-foreground">
          {title}
        </h4>
      )}
      <div className="h-64 w-full">
        <ResponsiveContainer width="100%" height="100%">
          {type === "bar" ? (
            <BarChart data={data} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" opacity={0.3} />
              <XAxis dataKey="name" tick={{ fontSize: 12 }} />
              <YAxis tick={{ fontSize: 12 }} />
              <Tooltip
                contentStyle={{
                  backgroundColor: "var(--color-popover)",
                  borderColor: "var(--color-border)",
                  borderRadius: "8px",
                  color: "var(--color-popover-foreground)",
                  fontSize: "12px",
                }}
              />
              <Bar dataKey="value" fill="var(--color-primary)" radius={[4, 4, 0, 0]} />
            </BarChart>
          ) : type === "line" ? (
            <LineChart data={data} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" opacity={0.3} />
              <XAxis dataKey="name" tick={{ fontSize: 12 }} />
              <YAxis tick={{ fontSize: 12 }} />
              <Tooltip
                contentStyle={{
                  backgroundColor: "var(--color-popover)",
                  borderColor: "var(--color-border)",
                  borderRadius: "8px",
                  color: "var(--color-popover-foreground)",
                  fontSize: "12px",
                }}
              />
              <Line
                type="monotone"
                dataKey="value"
                stroke="var(--color-primary)"
                strokeWidth={2}
                dot={{ r: 4 }}
              />
            </LineChart>
          ) : (
            <PieChart margin={{ top: 10, right: 10, left: 10, bottom: 10 }}>
              <Tooltip
                contentStyle={{
                  backgroundColor: "var(--color-popover)",
                  borderColor: "var(--color-border)",
                  borderRadius: "8px",
                  color: "var(--color-popover-foreground)",
                  fontSize: "12px",
                }}
              />
              <Legend wrapperStyle={{ fontSize: "12px" }} />
              <Pie
                data={data}
                dataKey="value"
                nameKey="name"
                cx="50%"
                cy="50%"
                outerRadius={80}
                label
              >
                {data.map((_, index) => (
                  <Cell key={`cell-${index}`} fill={PIE_COLORS[index % PIE_COLORS.length]} />
                ))}
              </Pie>
            </PieChart>
          )}
        </ResponsiveContainer>
      </div>
    </div>
  );
}

export function ChartEditorDialog({
  open,
  onOpenChange,
  initialData,
  onSave,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  initialData?: ChartNodeAttributes;
  onSave: (data: ChartNodeAttributes) => void;
}) {
  const [type, setType] = useState<ChartType>(initialData?.type ?? "bar");
  const [title, setTitle] = useState(initialData?.title ?? "Monthly Sales");
  const [items, setItems] = useState<ChartDataItem[]>(
    initialData?.data ?? [
      { name: "Jan", value: 100 },
      { name: "Feb", value: 150 },
      { name: "Mar", value: 200 },
    ],
  );

  const handleAddItem = () => {
    setItems((prev) => [...prev, { name: `Item ${prev.length + 1}`, value: 0 }]);
  };

  const handleRemoveItem = (index: number) => {
    setItems((prev) => prev.filter((_, i) => i !== index));
  };

  const handleItemChange = (index: number, key: "name" | "value", val: string) => {
    setItems((prev) =>
      prev.map((item, i) => {
        if (i !== index) return item;
        if (key === "value") {
          const num = parseFloat(val);
          return { ...item, value: isNaN(num) ? 0 : num };
        }
        return { ...item, name: val };
      }),
    );
  };

  const handleSave = () => {
    onSave({
      version: 1,
      type,
      title,
      data: items,
    });
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md p-5 sm:max-w-lg">
        <DialogHeader>
          <DialogTitle className="text-lg font-semibold">
            {initialData ? "Edit Chart" : "Insert Chart"}
          </DialogTitle>
        </DialogHeader>

        <div className="grid gap-4 py-2">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label className="text-xs">Chart Title</Label>
              <Input
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder="e.g. Quarterly Growth"
                className="mt-1 h-9"
              />
            </div>
            <div>
              <Label className="text-xs">Chart Type</Label>
              <Select value={type} onValueChange={(val) => setType(val as ChartType)}>
                <SelectTrigger className="mt-1 h-9">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="bar">Bar Chart</SelectItem>
                  <SelectItem value="line">Line Chart</SelectItem>
                  <SelectItem value="pie">Pie Chart</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="rounded-lg border border-border p-3 bg-card/40">
            <ChartRenderer type={type} title={title} data={items} className="h-44" />
          </div>

          <div>
            <div className="flex items-center justify-between mb-2">
              <Label className="text-xs font-semibold">Data Points</Label>
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={handleAddItem}
                className="h-7 text-xs gap-1"
              >
                <Plus className="size-3.5" /> Add Row
              </Button>
            </div>

            <div className="max-h-48 overflow-y-auto space-y-2 pr-1 noma-scroll">
              {items.map((item, idx) => (
                <div key={idx} className="flex items-center gap-2">
                  <Input
                    value={item.name}
                    onChange={(e) => handleItemChange(idx, "name", e.target.value)}
                    placeholder="Label"
                    className="h-8 text-xs flex-1"
                  />
                  <Input
                    type="number"
                    value={item.value}
                    onChange={(e) => handleItemChange(idx, "value", e.target.value)}
                    placeholder="Value"
                    className="h-8 text-xs w-24"
                  />
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    onClick={() => handleRemoveItem(idx)}
                    disabled={items.length <= 1}
                    className="h-8 w-8 text-muted-foreground hover:text-destructive"
                  >
                    <X className="size-4" />
                  </Button>
                </div>
              ))}
            </div>
          </div>
        </div>

        <DialogFooter className="gap-2 sm:gap-0">
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button onClick={handleSave} className="noma-cta">
            Save Chart
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function NomaChartNodeComponent({ node, updateAttributes, deleteNode, selected }: NodeViewProps) {
  const [editorOpen, setEditorOpen] = useState(false);
  const attrs = node.attrs as unknown as ChartNodeAttributes;
  const { type, title, data } = attrs;

  return (
    <div
      className={cn(
        "group relative my-4 rounded-xl border border-border bg-card p-4 transition-all hover:border-ring/50",
        selected && "ring-2 ring-ring border-transparent",
      )}
      contentEditable={false}
    >
      <div className="absolute right-3 top-3 z-10 flex items-center gap-1 opacity-90 transition-opacity group-hover:opacity-100">
        <Button
          type="button"
          variant="secondary"
          size="sm"
          onClick={() => setEditorOpen(true)}
          className="h-7 px-2 text-xs gap-1 shadow-sm"
        >
          <Edit3 className="size-3.5" /> Edit Data
        </Button>
        <Button
          type="button"
          variant="ghost"
          size="icon"
          onClick={deleteNode}
          className="h-7 w-7 text-muted-foreground hover:text-destructive"
        >
          <Trash2 className="size-3.5" />
        </Button>
      </div>

      <ChartRenderer type={type} title={title} data={data} />

      {editorOpen && (
        <ChartEditorDialog
          open={editorOpen}
          onOpenChange={setEditorOpen}
          initialData={attrs}
          onSave={(updated) => updateAttributes(updated)}
        />
      )}
    </div>
  );
}

export const NomaChartNode = Node.create({
  name: "nomaChart",
  group: "block",
  atom: true,
  draggable: true,

  addAttributes() {
    return {
      version: { default: 1 },
      type: { default: "bar" },
      title: { default: "Chart Title" },
      data: {
        default: [
          { name: "Category A", value: 30 },
          { name: "Category B", value: 70 },
          { name: "Category C", value: 45 },
        ],
        parseHTML: (element) => {
          const raw = element.getAttribute("data-chart");
          if (!raw) return [];
          try {
            return JSON.parse(raw);
          } catch {
            return [];
          }
        },
        renderHTML: (attributes) => {
          const chartData = attributes["data"] as ChartDataItem[] | undefined;
          return {
            "data-chart": JSON.stringify(chartData ?? []),
          };
        },
      },
    };
  },

  parseHTML() {
    return [
      {
        tag: 'div[data-type="noma-chart"]',
        getAttrs: (element) => {
          if (typeof element === "string") return false;
          const el = element as HTMLElement;
          const version = parseInt(el.getAttribute("data-version") || "1", 10);
          const type = (el.getAttribute("data-chart-type") || "bar") as ChartType;
          const title = el.getAttribute("data-title") || "";
          const dataRaw = el.getAttribute("data-chart");
          let data: ChartDataItem[] = [];
          if (dataRaw) {
            try {
              data = JSON.parse(dataRaw);
            } catch {
              /* ignore */
            }
          }
          return { version, type, title, data };
        },
      },
    ];
  },

  renderHTML({ HTMLAttributes, node }) {
    const version = node.attrs["version"] as number;
    const type = node.attrs["type"] as string;
    const title = node.attrs["title"] as string;
    const data = node.attrs["data"] as ChartDataItem[];

    return [
      "div",
      mergeAttributes(HTMLAttributes, {
        "data-type": "noma-chart",
        "data-version": version,
        "data-chart-type": type,
        "data-title": title,
        "data-chart": JSON.stringify(data),
      }),
    ];
  },

  addNodeView() {
    return ReactNodeViewRenderer(NomaChartNodeComponent);
  },
});

import { Node, mergeAttributes } from "@tiptap/core";
import { ReactNodeViewRenderer, type NodeViewProps } from "@tiptap/react";
import React, { useState } from "react";
import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  ComposedChart,
  Legend,
  Line,
  LineChart,
  Pie,
  PieChart,
  PolarAngleAxis,
  PolarGrid,
  PolarRadiusAxis,
  Radar,
  RadarChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import {
  BarChart2,
  Edit3,
  Trash2,
  Plus,
  X,
  Settings2,
  Table as TableIcon,
  Clipboard,
  Layers,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
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
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { cn } from "@/lib/utils";
import { toast } from "sonner";

export type AdvancedChartType = "bar" | "line" | "area" | "pie" | "donut" | "radar" | "composed";

export interface ChartSeries {
  id: string;
  name: string;
  type?: "bar" | "line" | "area" | undefined;
  color?: string | undefined;
  values: (number | null)[];
}

export interface AdvancedChartOptions {
  stacked?: boolean;
  showGrid?: boolean;
  showLegend?: boolean;
  legendPosition?: "top" | "bottom";
  smoothLine?: boolean;
  showMarkers?: boolean;
  innerRadius?: number;
  xAxisLabel?: string;
  yAxisLabel?: string;
}

export interface AdvancedChartData {
  version: 2;
  type: AdvancedChartType;
  title: string;
  subtitle?: string;
  categories: string[];
  series: ChartSeries[];
  options?: AdvancedChartOptions;
}

const DEFAULT_SERIES_COLORS = [
  "oklch(0.578 0.192 260)",
  "oklch(0.51 0.24 293)",
  "oklch(0.66 0.14 255)",
  "oklch(0.72 0.1 280)",
  "oklch(0.62 0.14 320)",
  "oklch(0.6 0.18 150)",
  "oklch(0.65 0.2 40)",
];

const VALID_TYPES = new Set<AdvancedChartType>([
  "bar",
  "line",
  "area",
  "pie",
  "donut",
  "radar",
  "composed",
]);

/**
 * Validates and normalizes arbitrary chart inputs with strict bounds, character caps,
 * finite number coercions, and fallback defaults to ensure malformed HTML/JSON cannot crash the editor.
 */
export function validateAndNormalizeChartData(input: unknown): AdvancedChartData {
  const fallback: AdvancedChartData = {
    version: 2,
    type: "bar",
    title: "Chart",
    subtitle: "",
    categories: ["Jan", "Feb", "Mar"],
    series: [
      {
        id: "series-1",
        name: "Series 1",
        values: [100, 150, 200],
        color: DEFAULT_SERIES_COLORS[0]!,
      },
    ],
    options: {
      showGrid: true,
      showLegend: true,
      legendPosition: "bottom",
      smoothLine: true,
      showMarkers: true,
      innerRadius: 60,
      xAxisLabel: "",
      yAxisLabel: "",
    },
  };

  if (!input || typeof input !== "object") return fallback;
  const data = input as Record<string, unknown>;

  // Check version 1 legacy migration first
  if (data["version"] !== 2 || !Array.isArray(data["categories"])) {
    return migrateV1ToV2(input);
  }

  const type: AdvancedChartType = VALID_TYPES.has(data["type"] as AdvancedChartType)
    ? (data["type"] as AdvancedChartType)
    : "bar";

  const rawTitle = typeof data["title"] === "string" ? data["title"].trim() : "";
  const title = rawTitle.slice(0, 100) || "Chart";

  const rawSubtitle = typeof data["subtitle"] === "string" ? data["subtitle"].trim() : "";
  const subtitle = rawSubtitle.slice(0, 100);

  const rawCategories = Array.isArray(data["categories"]) ? data["categories"] : [];
  const categories = rawCategories
    .slice(0, 50)
    .map((c, i) => (typeof c === "string" && c.trim() ? c.trim().slice(0, 50) : `Item ${i + 1}`));

  if (categories.length === 0) categories.push("Item 1");

  const rawSeries = Array.isArray(data["series"]) ? data["series"] : [];
  const series: ChartSeries[] = rawSeries.slice(0, 20).map((s, sIdx) => {
    const sObj = (s && typeof s === "object" ? s : {}) as Record<string, unknown>;
    const id =
      typeof sObj["id"] === "string" && sObj["id"].trim()
        ? sObj["id"].trim().slice(0, 50)
        : `series-${Date.now()}-${sIdx}`;
    const name =
      typeof sObj["name"] === "string" && sObj["name"].trim()
        ? sObj["name"].trim().slice(0, 50)
        : `Series ${sIdx + 1}`;

    const seriesType = ["bar", "line", "area"].includes(sObj["type"] as string)
      ? (sObj["type"] as "bar" | "line" | "area")
      : undefined;

    const color =
      typeof sObj["color"] === "string" && /^oklch\(|^#[0-9a-f]{3,8}/i.test(sObj["color"].trim())
        ? sObj["color"].trim()
        : DEFAULT_SERIES_COLORS[sIdx % DEFAULT_SERIES_COLORS.length]!;

    const rawVals = Array.isArray(sObj["values"]) ? sObj["values"] : [];
    const values = categories.map((_, cIdx) => {
      const v = rawVals[cIdx];
      if (v === null) return null;
      const num = typeof v === "number" ? v : parseFloat(String(v));
      return Number.isFinite(num) ? num : 0;
    });

    return { id, name, type: seriesType, color, values };
  });

  if (series.length === 0) {
    series.push({
      id: "series-1",
      name: "Series 1",
      values: categories.map(() => 0),
      color: DEFAULT_SERIES_COLORS[0]!,
    });
  }

  const rawOpts = (
    data["options"] && typeof data["options"] === "object" ? data["options"] : {}
  ) as Record<string, unknown>;

  const options: AdvancedChartOptions = {
    stacked: Boolean(rawOpts["stacked"]),
    showGrid: rawOpts["showGrid"] !== false,
    showLegend: rawOpts["showLegend"] !== false,
    legendPosition: rawOpts["legendPosition"] === "top" ? "top" : "bottom",
    smoothLine: rawOpts["smoothLine"] !== false,
    showMarkers: rawOpts["showMarkers"] !== false,
    innerRadius:
      typeof rawOpts["innerRadius"] === "number" && Number.isFinite(rawOpts["innerRadius"])
        ? Math.max(10, Math.min(120, rawOpts["innerRadius"]))
        : 60,
    xAxisLabel:
      typeof rawOpts["xAxisLabel"] === "string" ? rawOpts["xAxisLabel"].trim().slice(0, 50) : "",
    yAxisLabel:
      typeof rawOpts["yAxisLabel"] === "string" ? rawOpts["yAxisLabel"].trim().slice(0, 50) : "",
  };

  return {
    version: 2,
    type,
    title,
    subtitle,
    categories,
    series,
    options,
  };
}

export function migrateV1ToV2(v1Data: unknown): AdvancedChartData {
  const data = v1Data as Record<string, unknown> | undefined;
  if (data && data["version"] === 2 && Array.isArray(data["categories"])) {
    return validateAndNormalizeChartData(data);
  }

  const legacyData = Array.isArray(data?.["data"])
    ? (data["data"] as Record<string, unknown>[])
    : [];
  const categories = legacyData.map((d) => String(d["name"] || "Item"));
  const values = legacyData.map((d) => (typeof d["value"] === "number" ? d["value"] : 0));

  const firstColor = DEFAULT_SERIES_COLORS[0]!;

  return {
    version: 2,
    type: VALID_TYPES.has(data?.["type"] as AdvancedChartType)
      ? (data?.["type"] as AdvancedChartType)
      : "bar",
    title: (data?.["title"] as string) || "Chart",
    subtitle: "",
    categories: categories.length ? categories : ["Jan", "Feb", "Mar"],
    series: [
      {
        id: "series-1",
        name: (data?.["title"] as string) || "Series 1",
        values: values.length ? values : [100, 150, 200],
        color: firstColor,
      },
    ],
    options: {
      showGrid: true,
      showLegend: true,
      legendPosition: "bottom",
      smoothLine: true,
      showMarkers: true,
      innerRadius: 60,
      xAxisLabel: "",
      yAxisLabel: "",
    },
  };
}

export function ChartRenderer({
  chartData,
  className,
}: {
  chartData: AdvancedChartData;
  className?: string;
}) {
  const { type, title, subtitle, categories, series, options } = chartData;
  const showGrid = options?.showGrid ?? true;
  const showLegend = options?.showLegend ?? true;
  const legendPos = options?.legendPosition ?? "bottom";
  const xAxisLabel = options?.xAxisLabel;
  const yAxisLabel = options?.yAxisLabel;
  const stacked = options?.stacked ?? false;
  const smooth = options?.smoothLine ?? true;
  const markers = options?.showMarkers ?? true;
  const innerRadius = options?.innerRadius ?? 60;

  if (!categories || categories.length === 0 || !series || series.length === 0) {
    return (
      <div className="flex h-48 items-center justify-center text-sm text-muted-foreground">
        No chart data available
      </div>
    );
  }

  // Transform matrix to Recharts row objects
  const rechartsData = categories.map((cat, catIdx) => {
    const row: Record<string, string | number | null> = { category: cat };
    series.forEach((s) => {
      row[s.name] = s.values[catIdx] ?? 0;
    });
    return row;
  });

  const pieData = categories.map((cat, catIdx) => ({
    name: cat,
    value: series[0]?.values[catIdx] ?? 0,
  }));

  const renderTooltip = () => (
    <Tooltip
      contentStyle={{
        backgroundColor: "var(--color-popover)",
        borderColor: "var(--color-border)",
        borderRadius: "8px",
        color: "var(--color-popover-foreground)",
        fontSize: "12px",
      }}
    />
  );

  return (
    <div className={cn("w-full py-2", className)}>
      {title && (
        <h4 className="text-center font-sans text-base font-semibold text-foreground">{title}</h4>
      )}
      {subtitle && (
        <p className="mb-2 text-center font-sans text-xs text-muted-foreground">{subtitle}</p>
      )}

      <div className="h-64 w-full">
        <ResponsiveContainer width="100%" height="100%">
          {type === "bar" ? (
            <BarChart data={rechartsData} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
              {showGrid && <CartesianGrid strokeDasharray="3 3" opacity={0.3} />}
              <XAxis
                dataKey="category"
                tick={{ fontSize: 12 }}
                {...(xAxisLabel
                  ? {
                      label: {
                        value: xAxisLabel,
                        position: "insideBottom",
                        offset: -5,
                        fontSize: 10,
                      },
                    }
                  : {})}
              />
              <YAxis
                tick={{ fontSize: 12 }}
                {...(yAxisLabel
                  ? {
                      label: {
                        value: yAxisLabel,
                        angle: -90,
                        position: "insideLeft",
                        fontSize: 10,
                      },
                    }
                  : {})}
              />
              {renderTooltip()}
              {showLegend && (
                <Legend
                  verticalAlign={legendPos === "top" ? "top" : "bottom"}
                  wrapperStyle={{ fontSize: "12px" }}
                />
              )}
              {series.map((s, idx) => (
                <Bar
                  key={s.id}
                  dataKey={s.name}
                  {...(stacked ? { stackId: "a" } : {})}
                  fill={s.color ?? DEFAULT_SERIES_COLORS[idx % DEFAULT_SERIES_COLORS.length]!}
                  radius={stacked ? [0, 0, 0, 0] : [4, 4, 0, 0]}
                />
              ))}
            </BarChart>
          ) : type === "line" ? (
            <LineChart data={rechartsData} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
              {showGrid && <CartesianGrid strokeDasharray="3 3" opacity={0.3} />}
              <XAxis dataKey="category" tick={{ fontSize: 12 }} />
              <YAxis tick={{ fontSize: 12 }} />
              {renderTooltip()}
              {showLegend && (
                <Legend
                  verticalAlign={legendPos === "top" ? "top" : "bottom"}
                  wrapperStyle={{ fontSize: "12px" }}
                />
              )}
              {series.map((s, idx) => (
                <Line
                  key={s.id}
                  type={smooth ? "monotone" : "linear"}
                  dataKey={s.name}
                  stroke={s.color ?? DEFAULT_SERIES_COLORS[idx % DEFAULT_SERIES_COLORS.length]!}
                  strokeWidth={2.5}
                  dot={markers ? { r: 4 } : false}
                />
              ))}
            </LineChart>
          ) : type === "area" ? (
            <AreaChart data={rechartsData} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
              {showGrid && <CartesianGrid strokeDasharray="3 3" opacity={0.3} />}
              <XAxis dataKey="category" tick={{ fontSize: 12 }} />
              <YAxis tick={{ fontSize: 12 }} />
              {renderTooltip()}
              {showLegend && (
                <Legend
                  verticalAlign={legendPos === "top" ? "top" : "bottom"}
                  wrapperStyle={{ fontSize: "12px" }}
                />
              )}
              {series.map((s, idx) => {
                const color = s.color ?? DEFAULT_SERIES_COLORS[idx % DEFAULT_SERIES_COLORS.length]!;
                return (
                  <Area
                    key={s.id}
                    type={smooth ? "monotone" : "linear"}
                    dataKey={s.name}
                    {...(stacked ? { stackId: "a" } : {})}
                    stroke={color}
                    fill={color}
                    fillOpacity={0.4}
                  />
                );
              })}
            </AreaChart>
          ) : type === "pie" || type === "donut" ? (
            <PieChart margin={{ top: 10, right: 10, left: 10, bottom: 10 }}>
              {renderTooltip()}
              {showLegend && (
                <Legend
                  verticalAlign={legendPos === "top" ? "top" : "bottom"}
                  wrapperStyle={{ fontSize: "12px" }}
                />
              )}
              <Pie
                data={pieData}
                dataKey="value"
                nameKey="name"
                cx="50%"
                cy="50%"
                innerRadius={type === "donut" ? innerRadius : 0}
                outerRadius={80}
                label
              >
                {pieData.map((_, index) => (
                  <Cell
                    key={`cell-${index}`}
                    fill={DEFAULT_SERIES_COLORS[index % DEFAULT_SERIES_COLORS.length]!}
                  />
                ))}
              </Pie>
            </PieChart>
          ) : type === "radar" ? (
            <RadarChart data={rechartsData} cx="50%" cy="50%" outerRadius={80}>
              <PolarGrid opacity={0.3} />
              <PolarAngleAxis dataKey="category" tick={{ fontSize: 12 }} />
              <PolarRadiusAxis angle={30} domain={[0, "auto"]} tick={{ fontSize: 10 }} />
              {renderTooltip()}
              {showLegend && (
                <Legend
                  verticalAlign={legendPos === "top" ? "top" : "bottom"}
                  wrapperStyle={{ fontSize: "12px" }}
                />
              )}
              {series.map((s, idx) => {
                const color = s.color ?? DEFAULT_SERIES_COLORS[idx % DEFAULT_SERIES_COLORS.length]!;
                return (
                  <Radar
                    key={s.id}
                    name={s.name}
                    dataKey={s.name}
                    stroke={color}
                    fill={color}
                    fillOpacity={0.5}
                  />
                );
              })}
            </RadarChart>
          ) : (
            <ComposedChart
              data={rechartsData}
              margin={{ top: 10, right: 10, left: -20, bottom: 0 }}
            >
              {showGrid && <CartesianGrid strokeDasharray="3 3" opacity={0.3} />}
              <XAxis dataKey="category" tick={{ fontSize: 12 }} />
              <YAxis tick={{ fontSize: 12 }} />
              {renderTooltip()}
              {showLegend && (
                <Legend
                  verticalAlign={legendPos === "top" ? "top" : "bottom"}
                  wrapperStyle={{ fontSize: "12px" }}
                />
              )}
              {series.map((s, idx) => {
                const color = s.color ?? DEFAULT_SERIES_COLORS[idx % DEFAULT_SERIES_COLORS.length]!;
                const compType = s.type ?? (idx % 2 === 1 ? "line" : "bar");
                if (compType === "line") {
                  return (
                    <Line
                      key={s.id}
                      type={smooth ? "monotone" : "linear"}
                      dataKey={s.name}
                      stroke={color}
                      strokeWidth={2.5}
                      dot={markers ? { r: 4 } : false}
                    />
                  );
                }
                if (compType === "area") {
                  return (
                    <Area
                      key={s.id}
                      type={smooth ? "monotone" : "linear"}
                      dataKey={s.name}
                      stroke={color}
                      fill={color}
                      fillOpacity={0.4}
                    />
                  );
                }
                return <Bar key={s.id} dataKey={s.name} fill={color} radius={[4, 4, 0, 0]} />;
              })}
            </ComposedChart>
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
  initialData?: unknown;
  onSave: (data: AdvancedChartData) => void;
}) {
  const [chartState, setChartState] = useState<AdvancedChartData>(() =>
    validateAndNormalizeChartData(initialData),
  );

  const [activeTab, setActiveTab] = useState("data");

  const updateState = (patch: Partial<AdvancedChartData>) => {
    setChartState((prev) => ({ ...prev, ...patch }));
  };

  const updateOptions = (patch: Partial<AdvancedChartOptions>) => {
    setChartState((prev) => ({
      ...prev,
      options: { ...prev.options, ...patch },
    }));
  };

  // Matrix Editing Handlers
  const handleCategoryChange = (idx: number, name: string) => {
    setChartState((prev) => {
      const nextCat = [...prev.categories];
      nextCat[idx] = name;
      return { ...prev, categories: nextCat };
    });
  };

  const handleAddCategory = () => {
    setChartState((prev) => ({
      ...prev,
      categories: [...prev.categories, `Item ${prev.categories.length + 1}`],
      series: prev.series.map((s) => ({ ...s, values: [...s.values, 0] })),
    }));
  };

  const handleRemoveCategory = (idx: number) => {
    if (chartState.categories.length <= 1) return;
    setChartState((prev) => ({
      ...prev,
      categories: prev.categories.filter((_, i) => i !== idx),
      series: prev.series.map((s) => ({
        ...s,
        values: s.values.filter((_, i) => i !== idx),
      })),
    }));
  };

  const handleSeriesNameChange = (sIdx: number, name: string) => {
    setChartState((prev) => ({
      ...prev,
      series: prev.series.map((s, i) => (i === sIdx ? { ...s, name } : s)),
    }));
  };

  const handleSeriesTypeChange = (sIdx: number, type: "bar" | "line" | "area") => {
    setChartState((prev) => ({
      ...prev,
      series: prev.series.map((s, i) => (i === sIdx ? { ...s, type } : s)),
    }));
  };

  const handleValueChange = (sIdx: number, cIdx: number, valStr: string) => {
    const num = parseFloat(valStr);
    const val = isNaN(num) ? 0 : num;
    setChartState((prev) => ({
      ...prev,
      series: prev.series.map((s, i) => {
        if (i !== sIdx) return s;
        const nextVals = [...s.values];
        nextVals[cIdx] = val;
        return { ...s, values: nextVals };
      }),
    }));
  };

  const handleAddSeries = () => {
    setChartState((prev) => {
      const newIdx = prev.series.length + 1;
      const color =
        DEFAULT_SERIES_COLORS[prev.series.length % DEFAULT_SERIES_COLORS.length] ??
        DEFAULT_SERIES_COLORS[0]!;
      const newSeries: ChartSeries = {
        id: `series-${Date.now()}`,
        name: `Series ${newIdx}`,
        type: "bar",
        values: new Array(prev.categories.length).fill(0),
        color,
      };
      return {
        ...prev,
        series: [...prev.series, newSeries],
      };
    });
  };

  const handleRemoveSeries = (sIdx: number) => {
    if (chartState.series.length <= 1) return;
    setChartState((prev) => ({
      ...prev,
      series: prev.series.filter((_, i) => i !== sIdx),
    }));
  };

  // TSV / CSV Paste Import
  const handlePasteData = async () => {
    try {
      const clipboardText = await navigator.clipboard.readText();
      if (!clipboardText || !clipboardText.trim()) {
        toast.error("Clipboard is empty");
        return;
      }

      const lines = clipboardText
        .trim()
        .split("\n")
        .map((l) => l.split(/[\t,]/).map((c) => c.trim()));

      if (lines.length === 0) return;

      // Detect matrix structure: Header row has Series names, Column 0 has Categories
      const hasHeader = lines.length > 1;
      const seriesNames = hasHeader ? (lines[0]?.slice(1) ?? ["Series 1"]) : ["Series 1"];
      const categories: string[] = [];
      const seriesValues: number[][] = seriesNames.map(() => []);

      const startRow = hasHeader ? 1 : 0;
      for (let r = startRow; r < lines.length; r++) {
        const row = lines[r];
        if (!row || row.length === 0) continue;
        categories.push(row[0] || `Item ${r}`);
        for (let s = 0; s < seriesNames.length; s++) {
          const valNum = parseFloat(row[s + 1] || "0");
          seriesValues[s]?.push(isNaN(valNum) ? 0 : valNum);
        }
      }

      const newSeriesList: ChartSeries[] = seriesNames.map((name, sIdx) => ({
        id: `series-${Date.now()}-${sIdx}`,
        name: name || `Series ${sIdx + 1}`,
        type: sIdx % 2 === 1 ? "line" : "bar",
        values: seriesValues[sIdx] || [],
        color:
          DEFAULT_SERIES_COLORS[sIdx % DEFAULT_SERIES_COLORS.length] ?? DEFAULT_SERIES_COLORS[0]!,
      }));

      setChartState((prev) => ({
        ...prev,
        categories: categories.length ? categories : prev.categories,
        series: newSeriesList,
      }));

      toast.success("Pasted tabular data into chart grid!");
    } catch (err) {
      console.error("Paste failed", err);
      toast.error("Could not read clipboard data");
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-xl p-5 sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle className="text-lg font-semibold flex items-center gap-2">
            <BarChart2 className="size-5 text-primary" />
            {initialData ? "Edit Chart" : "Insert Chart"}
          </DialogTitle>
        </DialogHeader>

        <div className="grid gap-4 py-1">
          {/* Live Preview Panel */}
          <div className="rounded-xl border border-border bg-card/60 p-3 shadow-2xs">
            <ChartRenderer chartData={chartState} className="h-48" />
          </div>

          <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
            <TabsList className="grid w-full grid-cols-3">
              <TabsTrigger value="data" className="gap-1.5 text-xs">
                <TableIcon className="size-3.5" /> Data Grid
              </TabsTrigger>
              <TabsTrigger value="type" className="gap-1.5 text-xs">
                <Layers className="size-3.5" /> Type & Style
              </TabsTrigger>
              <TabsTrigger value="options" className="gap-1.5 text-xs">
                <Settings2 className="size-3.5" /> Customization
              </TabsTrigger>
            </TabsList>

            {/* Data Tab — Tabular Matrix Editor */}
            <TabsContent value="data" className="space-y-3 pt-3">
              <div className="flex items-center justify-between">
                <p className="text-xs text-muted-foreground">
                  Edit categories and series values like a compact spreadsheet.
                </p>
                <div className="flex items-center gap-2">
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={handlePasteData}
                    className="h-7 text-xs gap-1"
                  >
                    <Clipboard className="size-3" /> Paste Table
                  </Button>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={handleAddCategory}
                    className="h-7 text-xs gap-1"
                  >
                    <Plus className="size-3" /> Add Category
                  </Button>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={handleAddSeries}
                    className="h-7 text-xs gap-1"
                  >
                    <Plus className="size-3" /> Add Series
                  </Button>
                </div>
              </div>

              {/* Matrix Grid */}
              <div className="max-h-56 overflow-auto rounded-lg border border-border p-2 bg-background noma-scroll">
                <table className="w-full text-xs border-collapse">
                  <thead>
                    <tr className="border-b border-border bg-muted/40">
                      <th className="p-1.5 text-left font-semibold text-muted-foreground w-32">
                        Category
                      </th>
                      {chartState.series.map((s, sIdx) => (
                        <th key={s.id} className="p-1.5 text-left min-w-32">
                          <div className="flex flex-col gap-1">
                            <div className="flex items-center gap-1">
                              <Input
                                value={s.name}
                                onChange={(e) => handleSeriesNameChange(sIdx, e.target.value)}
                                className="h-7 text-xs font-semibold px-1.5"
                              />
                              {chartState.series.length > 1 && (
                                <Button
                                  type="button"
                                  variant="ghost"
                                  size="icon"
                                  onClick={() => handleRemoveSeries(sIdx)}
                                  className="h-6 w-6 text-muted-foreground hover:text-destructive shrink-0"
                                >
                                  <X className="size-3" />
                                </Button>
                              )}
                            </div>

                            {/* Per-series type selector for composed charts */}
                            {chartState.type === "composed" && (
                              <Select
                                value={s.type ?? "bar"}
                                onValueChange={(val) =>
                                  handleSeriesTypeChange(sIdx, val as "bar" | "line" | "area")
                                }
                              >
                                <SelectTrigger className="h-6 text-[10px] px-1 py-0 border-border/60">
                                  <SelectValue />
                                </SelectTrigger>
                                <SelectContent>
                                  <SelectItem value="bar" className="text-xs">
                                    Bar
                                  </SelectItem>
                                  <SelectItem value="line" className="text-xs">
                                    Line
                                  </SelectItem>
                                  <SelectItem value="area" className="text-xs">
                                    Area
                                  </SelectItem>
                                </SelectContent>
                              </Select>
                            )}
                          </div>
                        </th>
                      ))}
                      <th className="w-8"></th>
                    </tr>
                  </thead>
                  <tbody>
                    {chartState.categories.map((cat, cIdx) => (
                      <tr key={cIdx} className="border-b border-border/50 hover:bg-accent/20">
                        <td className="p-1.5">
                          <Input
                            value={cat}
                            onChange={(e) => handleCategoryChange(cIdx, e.target.value)}
                            className="h-7 text-xs"
                          />
                        </td>
                        {chartState.series.map((s, sIdx) => (
                          <td key={s.id} className="p-1.5">
                            <Input
                              type="number"
                              value={s.values[cIdx] ?? 0}
                              onChange={(e) => handleValueChange(sIdx, cIdx, e.target.value)}
                              className="h-7 text-xs"
                            />
                          </td>
                        ))}
                        <td className="p-1 text-center">
                          {chartState.categories.length > 1 && (
                            <Button
                              type="button"
                              variant="ghost"
                              size="icon"
                              onClick={() => handleRemoveCategory(cIdx)}
                              className="h-6 w-6 text-muted-foreground hover:text-destructive"
                            >
                              <X className="size-3" />
                            </Button>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </TabsContent>

            {/* Type Tab */}
            <TabsContent value="type" className="space-y-4 pt-3">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <Label className="text-xs">Chart Type</Label>
                  <Select
                    value={chartState.type}
                    onValueChange={(val) => updateState({ type: val as AdvancedChartType })}
                  >
                    <SelectTrigger className="mt-1 h-9 text-xs">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="bar">Bar Chart</SelectItem>
                      <SelectItem value="line">Line Chart</SelectItem>
                      <SelectItem value="area">Area Chart</SelectItem>
                      <SelectItem value="pie">Pie Chart</SelectItem>
                      <SelectItem value="donut">Donut Chart</SelectItem>
                      <SelectItem value="radar">Radar Chart</SelectItem>
                      <SelectItem value="composed">Composed (Bar + Line + Area)</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                <div>
                  <Label className="text-xs">Chart Title</Label>
                  <Input
                    value={chartState.title}
                    onChange={(e) => updateState({ title: e.target.value })}
                    placeholder="e.g. Quarterly Performance"
                    className="mt-1 h-9 text-xs"
                  />
                </div>
              </div>

              <div>
                <Label className="text-xs">Subtitle</Label>
                <Input
                  value={chartState.subtitle ?? ""}
                  onChange={(e) => updateState({ subtitle: e.target.value })}
                  placeholder="e.g. In USD Millions"
                  className="mt-1 h-9 text-xs"
                />
              </div>
            </TabsContent>

            {/* Options Tab */}
            <TabsContent value="options" className="space-y-3 pt-3">
              <div className="grid grid-cols-2 gap-4">
                <div className="flex items-center space-x-2">
                  <Checkbox
                    id="showGrid"
                    checked={chartState.options?.showGrid ?? true}
                    onCheckedChange={(c) => updateOptions({ showGrid: Boolean(c) })}
                  />
                  <Label htmlFor="showGrid" className="text-xs cursor-pointer">
                    Show Gridlines
                  </Label>
                </div>

                <div className="flex items-center space-x-2">
                  <Checkbox
                    id="showLegend"
                    checked={chartState.options?.showLegend ?? true}
                    onCheckedChange={(c) => updateOptions({ showLegend: Boolean(c) })}
                  />
                  <Label htmlFor="showLegend" className="text-xs cursor-pointer">
                    Show Legend
                  </Label>
                </div>

                {chartState.options?.showLegend && (
                  <div>
                    <Label className="text-xs">Legend Position</Label>
                    <Select
                      value={chartState.options?.legendPosition ?? "bottom"}
                      onValueChange={(val) =>
                        updateOptions({ legendPosition: val as "top" | "bottom" })
                      }
                    >
                      <SelectTrigger className="mt-1 h-8 text-xs">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="bottom">Bottom</SelectItem>
                        <SelectItem value="top">Top</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                )}

                {["bar", "area"].includes(chartState.type) && (
                  <div className="flex items-center space-x-2 pt-2">
                    <Checkbox
                      id="stacked"
                      checked={chartState.options?.stacked ?? false}
                      onCheckedChange={(c) => updateOptions({ stacked: Boolean(c) })}
                    />
                    <Label htmlFor="stacked" className="text-xs cursor-pointer">
                      Stacked Mode
                    </Label>
                  </div>
                )}

                {["line", "area", "composed"].includes(chartState.type) && (
                  <div className="flex items-center space-x-2 pt-2">
                    <Checkbox
                      id="smoothLine"
                      checked={chartState.options?.smoothLine ?? true}
                      onCheckedChange={(c) => updateOptions({ smoothLine: Boolean(c) })}
                    />
                    <Label htmlFor="smoothLine" className="text-xs cursor-pointer">
                      Smooth Curves
                    </Label>
                  </div>
                )}
              </div>

              <div className="grid grid-cols-2 gap-3 pt-2">
                <div>
                  <Label className="text-xs">X-Axis Label</Label>
                  <Input
                    value={chartState.options?.xAxisLabel ?? ""}
                    onChange={(e) => updateOptions({ xAxisLabel: e.target.value })}
                    placeholder="e.g. Month"
                    className="mt-1 h-8 text-xs"
                  />
                </div>
                <div>
                  <Label className="text-xs">Y-Axis Label</Label>
                  <Input
                    value={chartState.options?.yAxisLabel ?? ""}
                    onChange={(e) => updateOptions({ yAxisLabel: e.target.value })}
                    placeholder="e.g. Amount ($)"
                    className="mt-1 h-8 text-xs"
                  />
                </div>
              </div>
            </TabsContent>
          </Tabs>
        </div>

        <DialogFooter className="gap-2 sm:gap-0">
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button
            onClick={() => {
              onSave(chartState);
              onOpenChange(false);
            }}
            className="noma-cta"
          >
            Save Chart
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function NomaChartNodeComponent({ node, updateAttributes, deleteNode, selected }: NodeViewProps) {
  const [editorOpen, setEditorOpen] = useState(false);
  const rawAttrs = node.attrs;
  const chartData = validateAndNormalizeChartData(rawAttrs);

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
          className="h-7 px-2 text-xs gap-1 shadow-xs"
        >
          <Edit3 className="size-3.5" /> Edit Data & Style
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

      <ChartRenderer chartData={chartData} />

      {editorOpen && (
        <ChartEditorDialog
          open={editorOpen}
          onOpenChange={setEditorOpen}
          initialData={chartData}
          onSave={(updated) => updateAttributes(updated as unknown as Record<string, unknown>)}
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
      version: { default: 2 },
      type: { default: "bar" },
      title: { default: "Chart Title" },
      subtitle: { default: "" },
      categories: {
        default: ["Jan", "Feb", "Mar"],
        parseHTML: (el) => {
          const raw = el.getAttribute("data-categories");
          if (!raw) return ["Jan", "Feb", "Mar"];
          try {
            return JSON.parse(raw);
          } catch {
            return ["Jan", "Feb", "Mar"];
          }
        },
      },
      series: {
        default: [
          {
            id: "series-1",
            name: "Series 1",
            values: [100, 150, 200],
            color: DEFAULT_SERIES_COLORS[0],
          },
        ],
        parseHTML: (el) => {
          const raw = el.getAttribute("data-series");
          if (!raw) return [];
          try {
            return JSON.parse(raw);
          } catch {
            return [];
          }
        },
      },
      options: {
        default: {
          showGrid: true,
          showLegend: true,
        },
        parseHTML: (el) => {
          const raw = el.getAttribute("data-options");
          if (!raw) return {};
          try {
            return JSON.parse(raw);
          } catch {
            return {};
          }
        },
      },
      // Backward compatibility attribute parse for v1 simple schema
      data: {
        default: null,
        parseHTML: (el) => {
          const raw = el.getAttribute("data-chart");
          if (!raw) return null;
          try {
            return JSON.parse(raw);
          } catch {
            return null;
          }
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
          const type = (el.getAttribute("data-chart-type") || "bar") as AdvancedChartType;
          const title = el.getAttribute("data-title") || "";
          const subtitle = el.getAttribute("data-subtitle") || "";

          const catRaw = el.getAttribute("data-categories");
          const serRaw = el.getAttribute("data-series");
          const optRaw = el.getAttribute("data-options");
          const legacyRaw = el.getAttribute("data-chart");

          try {
            if (version === 2 && catRaw && serRaw) {
              return validateAndNormalizeChartData({
                version: 2,
                type,
                title,
                subtitle,
                categories: JSON.parse(catRaw),
                series: JSON.parse(serRaw),
                options: optRaw ? JSON.parse(optRaw) : {},
              });
            }

            // Legacy V1 fallback
            const legacyData = legacyRaw ? JSON.parse(legacyRaw) : [];
            return validateAndNormalizeChartData({ version: 1, type, title, data: legacyData });
          } catch {
            return validateAndNormalizeChartData({});
          }
        },
      },
    ];
  },

  renderHTML({ HTMLAttributes, node }) {
    const v2Data = validateAndNormalizeChartData(node.attrs);

    return [
      "div",
      mergeAttributes(HTMLAttributes, {
        "data-type": "noma-chart",
        "data-version": 2,
        "data-chart-type": v2Data.type,
        "data-title": v2Data.title,
        "data-subtitle": v2Data.subtitle || "",
        "data-categories": JSON.stringify(v2Data.categories),
        "data-series": JSON.stringify(v2Data.series),
        "data-options": JSON.stringify(v2Data.options || {}),
      }),
    ];
  },

  addNodeView() {
    return ReactNodeViewRenderer(NomaChartNodeComponent);
  },
});

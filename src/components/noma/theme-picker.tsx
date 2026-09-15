import { Check } from "lucide-react";
import type { ThemeSetting } from "@/lib/noma/types";

export interface ThemeOption {
  id: ThemeSetting;
  name: string;
  icon: string;
  description: string;
}

export const THEME_OPTIONS: ThemeOption[] = [
  {
    id: "light",
    name: "Light",
    icon: "☀️",
    description: "Clean and bright",
  },
  {
    id: "dark",
    name: "Noma's Default",
    icon: "🌑",
    description: "The original Noma experience",
  },
  {
    id: "nature",
    name: "Nature",
    icon: "🌿",
    description: "Calm, warm, and natural",
  },
  {
    id: "amoled",
    name: "AMOLED Black",
    icon: "🖤",
    description: "Pure black. Maximum focus.",
  },
  {
    id: "system",
    name: "System",
    icon: "⚙️",
    description: "Follow your device settings",
  },
];

interface ThemePickerProps {
  value: ThemeSetting;
  onChange: (theme: ThemeSetting) => void;
}

function ThemePreviewMiniCard({ id }: { id: ThemeSetting }) {
  if (id === "light") {
    return (
      <div className="relative h-20 w-full overflow-hidden rounded-lg border border-[#e2e8f0] bg-[#f8f9fb] p-2 flex flex-col justify-between shadow-xs">
        <div className="flex items-center gap-1.5">
          <div className="h-1.5 w-8 rounded-full bg-[#3b82f6]" />
          <div className="h-1.5 w-4 rounded-full bg-[#94a3b8]/40" />
        </div>
        <div className="space-y-1.5 rounded-md bg-white p-2 border border-[#f1f5f9] shadow-2xs">
          <div className="h-2 w-3/4 rounded bg-[#cbd5e1]" />
          <div className="h-1.5 w-1/2 rounded bg-[#e2e8f0]" />
        </div>
      </div>
    );
  }

  if (id === "dark") {
    return (
      <div className="relative h-20 w-full overflow-hidden rounded-lg border border-[#2a3449] bg-[#131927] p-2 flex flex-col justify-between shadow-xs">
        <div className="flex items-center gap-1.5">
          <div className="h-1.5 w-8 rounded-full bg-[#6366f1]" />
          <div className="h-1.5 w-4 rounded-full bg-[#64748b]/40" />
        </div>
        <div className="space-y-1.5 rounded-md bg-[#1e2638] p-2 border border-[#2d384e]">
          <div className="h-2 w-3/4 rounded bg-[#475569]" />
          <div className="h-1.5 w-1/2 rounded bg-[#334155]" />
        </div>
      </div>
    );
  }

  if (id === "nature") {
    return (
      <div className="relative h-20 w-full overflow-hidden rounded-lg border border-[#e3dfd4] bg-[#f7f5ee] p-2 flex flex-col justify-between shadow-xs">
        <div className="flex items-center gap-1.5">
          <div className="h-1.5 w-8 rounded-full bg-[#4e7a5d]" />
          <div className="h-1.5 w-4 rounded-full bg-[#a39e8c]/40" />
        </div>
        <div className="space-y-1.5 rounded-md bg-[#fcfbfa] p-2 border border-[#eae6da]">
          <div className="h-2 w-3/4 rounded bg-[#b5af9e]" />
          <div className="h-1.5 w-1/2 rounded bg-[#dcd6c8]" />
        </div>
      </div>
    );
  }

  if (id === "amoled") {
    return (
      <div className="relative h-20 w-full overflow-hidden rounded-lg border border-[#222222] bg-[#000000] p-2 flex flex-col justify-between shadow-xs">
        <div className="flex items-center gap-1.5">
          <div className="h-1.5 w-8 rounded-full bg-[#6366f1]" />
          <div className="h-1.5 w-4 rounded-full bg-[#444444]" />
        </div>
        <div className="space-y-1.5 rounded-md bg-[#121212] p-2 border border-[#262626]">
          <div className="h-2 w-3/4 rounded bg-[#525252]" />
          <div className="h-1.5 w-1/2 rounded bg-[#333333]" />
        </div>
      </div>
    );
  }

  // System theme split preview
  return (
    <div className="relative h-20 w-full overflow-hidden rounded-lg border border-border p-0 flex shadow-xs">
      {/* Light side */}
      <div className="w-1/2 bg-[#f8f9fb] p-2 flex flex-col justify-between border-r border-[#e2e8f0]">
        <div className="h-1.5 w-6 rounded-full bg-[#3b82f6]" />
        <div className="space-y-1 rounded bg-white p-1 border border-[#f1f5f9]">
          <div className="h-1.5 w-full rounded bg-[#cbd5e1]" />
          <div className="h-1 w-2/3 rounded bg-[#e2e8f0]" />
        </div>
      </div>
      {/* Dark side */}
      <div className="w-1/2 bg-[#131927] p-2 flex flex-col justify-between">
        <div className="h-1.5 w-6 rounded-full bg-[#6366f1]" />
        <div className="space-y-1 rounded bg-[#1e2638] p-1 border border-[#2d384e]">
          <div className="h-1.5 w-full rounded bg-[#475569]" />
          <div className="h-1 w-2/3 rounded bg-[#334155]" />
        </div>
      </div>
    </div>
  );
}

export function ThemePicker({ value, onChange }: ThemePickerProps) {
  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
      {THEME_OPTIONS.map((theme) => {
        const isSelected = value === theme.id;
        return (
          <button
            key={theme.id}
            type="button"
            aria-pressed={isSelected}
            onClick={() => onChange(theme.id)}
            className={`group relative flex flex-col justify-between rounded-xl border p-3 text-left transition-all duration-150 outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 ${
              isSelected
                ? "border-primary bg-primary/5 ring-1 ring-primary/40 shadow-xs"
                : "border-border bg-card hover:bg-muted/40 hover:border-border/80"
            }`}
          >
            <div className="space-y-2.5">
              <ThemePreviewMiniCard id={theme.id} />

              <div className="flex items-start justify-between gap-2">
                <div className="space-y-0.5">
                  <div className="flex items-center gap-1.5 font-medium text-sm text-foreground">
                    <span className="text-base leading-none" role="img" aria-hidden="true">
                      {theme.icon}
                    </span>
                    <span>{theme.name}</span>
                  </div>
                  <p className="text-xs text-muted-foreground leading-normal">
                    {theme.description}
                  </p>
                </div>

                <div
                  className={`flex size-5 shrink-0 items-center justify-center rounded-full border transition-all ${
                    isSelected
                      ? "border-primary bg-primary text-primary-foreground"
                      : "border-muted-foreground/30 group-hover:border-muted-foreground/60"
                  }`}
                >
                  {isSelected && <Check className="size-3 stroke-[2.5]" />}
                </div>
              </div>
            </div>
          </button>
        );
      })}
    </div>
  );
}

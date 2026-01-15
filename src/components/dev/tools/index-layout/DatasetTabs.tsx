import type { LucideIcon } from "lucide-react";

import { Button } from "@/components/ui/button";

interface DatasetDefinition {
  key: string;
  label: string;
  icon: LucideIcon;
}

interface DatasetTabsProps {
  datasets: DatasetDefinition[];
  activeKey: string;
  onChange: (key: string) => void;
}

export function DatasetTabs({ datasets, activeKey, onChange }: DatasetTabsProps) {
  return (
    <div className="flex flex-wrap items-center justify-center gap-3">
      {datasets.map((dataset) => {
        const isActive = dataset.key === activeKey;
        const Icon = dataset.icon;
        return (
          <Button
            key={dataset.key}
            variant={isActive ? "toggleActive" : "toggleInactive"}
            size="pill"
            onClick={() => onChange(dataset.key)}
            className="gap-2 px-5 py-2.5"
            aria-pressed={isActive}
          >
            <Icon
              className={isActive ? "h-5 w-5 text-fuchsia-100 drop-shadow" : "h-5 w-5 text-fuchsia-200/70"}
              aria-hidden="true"
              focusable="false"
            />
            <span className={isActive ? "tracking-wide text-white" : "tracking-wide text-white/80"}>
              {dataset.label}
            </span>
          </Button>
        );
      })}
    </div>
  );
}

import type { IconName } from "@/components/common/Icon";

import { PublicSegmentedTabs } from "@/components/layout/PublicSegmentedTabs";

interface DatasetDefinition {
  key: string;
  label: string;
  icon: IconName;
}

interface DatasetTabsProps {
  datasets: DatasetDefinition[];
  activeKey: string;
  onChange: (key: string) => void;
}

export function DatasetTabs({ datasets, activeKey, onChange }: DatasetTabsProps) {
  return (
    <PublicSegmentedTabs
      ariaLabel="Index layout dataset"
      value={activeKey}
      onValueChange={onChange}
      items={datasets.map((dataset) => ({
        id: dataset.key,
        label: dataset.label,
        icon: dataset.icon,
      }))}
    />
  );
}

import type { IconName } from "@/components/common/Icon";

import { EditorSegmentedControl } from "@/features/dev/components";

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
    <EditorSegmentedControl
      label="Index layout dataset"
      value={activeKey}
      onChange={onChange}
      className="justify-center"
      options={datasets.map((dataset) => ({
        value: dataset.key,
        label: dataset.label,
        icon: dataset.icon,
      }))}
    />
  );
}

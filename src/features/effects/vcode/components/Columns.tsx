import { PropsWithChildren } from "react";

import {
  INDEX_PANEL_MASONRY_ITEM_CLASS_NAME,
  IndexPanelMasonry,
} from "@/components/common/IndexPanelLayout";

export function Columns({ children }: PropsWithChildren) {
  return (
    <div className="mt-7 mb-2">
      <IndexPanelMasonry padded={false}>{children}</IndexPanelMasonry>
    </div>
  );
}

export function Column({ children }: PropsWithChildren) {
  return <div className={INDEX_PANEL_MASONRY_ITEM_CLASS_NAME}>{children}</div>;
}

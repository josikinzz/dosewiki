import type { ReactNode } from "react";

export interface HistorySubsectionViewModel {
  content: ReactNode;
  heading: string;
  id: string;
}

export interface HistorySectionViewModel {
  collapsedContent: ReactNode;
  fullContent: ReactNode;
  hasContent: boolean;
  heading: string;
  icon: string;
  id: string;
  isCollapsedTruncated: boolean;
  isNotableIndividuals: boolean;
  subsections: HistorySubsectionViewModel[];
}

export interface HistoryCultureViewModel {
  freeform?: {
    collapsedContent: ReactNode;
    fullContent: ReactNode;
    isTruncated: boolean;
  };
  overview?: ReactNode;
  sections: HistorySectionViewModel[];
  sectionsNeedTruncation: boolean;
}

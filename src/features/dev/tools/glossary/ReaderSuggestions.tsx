"use client";

/**
 * Suggestions, a view of the Glossary workbench: what readers sent from the
 * public glossary about this language's wording, in one place with its own
 * count on the view tab. Waiting lists the same suggestions first; this view
 * keeps every suggestion and its decisions. Each one links to its term in
 * Terms, where using the reader's wording is an ordinary edit.
 */

import { useMemo, useState } from "react";

import { FeedbackReviewQueue, type FeedbackQueueFilter } from "../feedback/FeedbackReviewQueue";
import { glossaryFeedbackAdapter } from "../feedback/glossaryFeedbackAdapter";

const HEADING = {
  icon: "lucide:message-square-quote",
  title: "Suggestions from readers",
  description: "What readers of the public glossary suggested for this language. Marking one resolved changes no wording; to use a suggestion, open its term and edit it there.",
};

export function ReaderSuggestions({ locale }: { locale: string }) {
  const adapter = useMemo(() => glossaryFeedbackAdapter(locale), [locale]);
  const [statusFilter, setStatusFilter] = useState<FeedbackQueueFilter | null>(null);
  return <FeedbackReviewQueue adapter={adapter} heading={HEADING} statusFilter={statusFilter} onStatusFilterChange={setStatusFilter} />;
}

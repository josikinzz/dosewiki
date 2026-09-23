"use client";

import type { ReactNode } from "react";
import messages from "@content/i18n/messages/ru.json";
import catalogDigests from "./catalogDigests.generated.json";
import { UiMessagesProvider } from "./client";

/** SSR and hydration share this catalog; English never mounts its dynamic chunk. */
export default function RussianMessagesProvider({ children }: { children: ReactNode }) {
  return <UiMessagesProvider messages={messages}><meta name="dosewiki-translation-catalog" content={(catalogDigests as Record<string, string>).ru} />{children}</UiMessagesProvider>;
}

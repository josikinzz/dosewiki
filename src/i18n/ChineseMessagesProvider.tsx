"use client";

import type { ReactNode } from "react";
import messages from "@content/i18n/messages/zh-Hans.json";
import catalogDigests from "./catalogDigests.generated.json";
import { UiMessagesProvider } from "./client";

export default function ChineseMessagesProvider({ children }: { children: ReactNode }) {
  return <UiMessagesProvider messages={messages}>
    <meta name="dosewiki-translation-catalog" content={catalogDigests["zh-Hans"]} />
    {children}
  </UiMessagesProvider>;
}

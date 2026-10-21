"use client";

import type { ComponentProps } from "react";
import { useUiLocale } from "@/i18n/client";
import { htmlLanguage } from "@/i18n/messages";

export function LocaleHtml(props: Omit<ComponentProps<"html">, "lang">) {
  return <html {...props} lang={htmlLanguage(useUiLocale())} />;
}

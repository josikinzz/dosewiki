import { notFound, permanentRedirect } from "next/navigation";
import { glossaryLanguage } from "@/features/language-glossary/languageGlossary";
import { glossaryHref } from "@/features/language-glossary/glossaryRoutes";

export default async function Page({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  if (locale !== "en" && !glossaryLanguage(locale)) notFound();
  permanentRedirect(glossaryHref(locale));
}

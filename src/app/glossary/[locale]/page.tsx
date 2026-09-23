import { notFound } from "next/navigation";
import { readPublicLanguageGlossary } from "@server/translation/publicGlossary";
import { LanguageGlossaryPage } from "@/features/language-glossary/LanguageGlossaryPage";

export const revalidate = 60;
export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const page = await readPublicLanguageGlossary((await params).locale);
  return {
    title: page ? `${page.language.name} glossary` : "Glossary",
    robots: { index: false, follow: true },
  };
}
export default async function Page({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const page = await readPublicLanguageGlossary((await params).locale);
  if (!page) notFound();
  return <LanguageGlossaryPage {...page} />;
}

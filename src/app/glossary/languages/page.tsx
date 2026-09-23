import { readPublicLanguageDirectory } from "@server/translation/publicGlossary";
import { PublicContentShell } from "@/components/layout/PublicPagePrimitives";
import { PageHeader } from "@/components/layout/PageHeader";
export const revalidate = 60;
export const metadata = { title: "Language glossaries" };
export default async function Page() {
  const languages = await readPublicLanguageDirectory();
  return (
    <PublicContentShell focusTarget width="standard">
      <PageHeader
        title="Language glossaries"
        description="Explore vocabulary and help reviewers improve translations."
      />
      <ul className="divide-y divide-dose-border">
        <li className="py-4">
          <a
            className="theme-text-primary hover:underline"
            href="https://dose.wiki/glossary"
          >
            English reference glossary
          </a>
        </li>
        {languages.map((language) => (
          <li key={language.code} className="py-4">
            <a
              href={`/glossary/${language.code}`}
              className="theme-text-primary hover:underline"
            >
              <bdi lang={language.code} dir={language.direction}>
                {language.nativeName}
              </bdi>{" "}
              · {language.name}
            </a>
            <span className="theme-text-muted ml-3 text-sm">
              {language.readiness}
            </span>
          </li>
        ))}
      </ul>
      {!languages.length ? (
        <p className="theme-text-muted mt-6">
          No language glossaries are available yet.
        </p>
      ) : null}
    </PublicContentShell>
  );
}

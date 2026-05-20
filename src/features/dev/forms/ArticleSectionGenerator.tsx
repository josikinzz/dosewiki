import { SectionGenerator, type SectionGeneratorProps } from "../tools/substance-editor/SectionGenerator";
import { useOptionalSubstanceEditorContext } from "../tools/substance-editor/SubstanceEditorContext";

type ArticleSectionGeneratorProps = Omit<
  SectionGeneratorProps,
  "apiKey" | "genericSources" | "isKeyValid" | "model" | "substanceSlug"
>;

export function ArticleSectionGenerator(props: ArticleSectionGeneratorProps) {
  const articlesContext = useOptionalSubstanceEditorContext();

  if (!articlesContext) {
    return null;
  }

  return (
    <SectionGenerator
      {...props}
      genericSources={articlesContext.getAllSources()}
      apiKey={articlesContext.apiKey}
      model={articlesContext.model}
      isKeyValid={articlesContext.isKeyValid}
      substanceSlug={articlesContext.selectedSubstanceSlug}
    />
  );
}

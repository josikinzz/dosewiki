import { normalizeFounderKeys } from "@/data/content/about";
import { useEditorDocument } from "./editorDocumentSession";

type AboutConfigSource = {
  aboutMarkdown?: string | null;
  aboutSubtitle?: string | null;
  founderProfileKeys?: string[] | null;
} | undefined;

type AboutDocument = {
  markdown: string;
  subtitle: string;
  founderKeys: string[];
};

function toAboutDocument(aboutConfig: AboutConfigSource): AboutDocument {
  return {
    markdown: aboutConfig?.aboutMarkdown ?? "",
    subtitle: aboutConfig?.aboutSubtitle ?? "",
    founderKeys: aboutConfig?.founderProfileKeys ?? [],
  };
}

export function useDevAboutState(aboutConfig: AboutConfigSource) {
  const document = useEditorDocument(toAboutDocument(aboutConfig));

  return {
    aboutFounderKeys: document.draft.founderKeys,
    aboutMarkdown: document.draft.markdown,
    aboutSubtitle: document.draft.subtitle,
    getOriginalAboutFounderKeys: () => [...document.getOriginal().founderKeys],
    getOriginalAboutMarkdown: () => document.getOriginal().markdown,
    getOriginalAboutSubtitle: () => document.getOriginal().subtitle,
    markAboutContentSaved: document.markSaved,
    replaceAboutFounderKeys: (nextKeys: string[]) => {
      document.applyDraftTransform((previous) => ({
        ...previous,
        founderKeys: normalizeFounderKeys(nextKeys),
      }));
    },
    replaceAboutMarkdown: (nextMarkdown: string) => {
      document.applyDraftTransform((previous) => ({
        ...previous,
        markdown: nextMarkdown,
      }));
    },
    replaceAboutSubtitle: (nextSubtitle: string) => {
      document.applyDraftTransform((previous) => ({
        ...previous,
        subtitle: nextSubtitle,
      }));
    },
    resetAboutContent: document.reset,
    resetAboutFounderKeys: () => {
      const original = document.getOriginal();
      document.applyDraftTransform((previous) => ({
        ...previous,
        founderKeys: [...original.founderKeys],
      }));
    },
    resetAboutMarkdown: () => {
      const original = document.getOriginal();
      document.applyDraftTransform((previous) => ({
        ...previous,
        markdown: original.markdown,
      }));
    },
    resetAboutSubtitle: () => {
      const original = document.getOriginal();
      document.applyDraftTransform((previous) => ({
        ...previous,
        subtitle: original.subtitle,
      }));
    },
  };
}

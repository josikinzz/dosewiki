import { Icon } from "@/components/common/Icon";
import { buildSiteUrl, getPublicRoutePath } from "@server/next/publicSite";

/**
 * The standing notice on every localized article: the text is machine
 * translated, the English is canonical, and the English page is one click away
 * on the main host. Bare like the beta disclaimer so it reads as site status,
 * not as another safety banner.
 */
export function MachineTranslationNotice({ slug }: { slug: string }) {
  const englishUrl = buildSiteUrl(getPublicRoutePath({ family: "substance", params: { slug } }));
  return (
    <p className="theme-text-secondary mx-auto flex w-fit items-center gap-2 text-center text-sm text-balance">
      <Icon icon="lucide:languages" size="1rem" aria-hidden="true" className="shrink-0" />
      <span>
        本页由机器翻译，以
        <a href={englishUrl} lang="en" className="underline decoration-dotted underline-offset-2 hover:decoration-solid">
          英文原文
        </a>
        为准。尚未翻译的段落保留英文。
      </span>
    </p>
  );
}

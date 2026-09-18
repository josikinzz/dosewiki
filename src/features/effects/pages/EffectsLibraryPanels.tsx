"use client";

import { proseLinkClassName } from "@/components/common/ProseLink";
import { SmartLink } from "@/components/common/SmartLink";
import { PublicContentSection } from "@/components/layout/PublicContentPrimitives";
import { useT } from "@/i18n/client";
import { LIBRARY_PANELS, type LibraryPanel } from "./libraryConfig";

/**
 * One Library panel as an open section of hairline rows, the same material the
 * articles index uses, so the tab reads as a table of contents for the archive
 * rather than another grid of category cards. Heading, blurb, rows, and the
 * "See also" run share one left edge; the row's hover fill overhangs it by the
 * same 12px the divider is inset, so the aligned content stays put while the
 * tint bleeds outward. Descriptions take their own line under the title instead
 * of fighting it for width, so nothing is ever clipped to an ellipsis. Every
 * label is a `msg()` key from `libraryConfig`, translated here so the mirror
 * reads the archive in its own language.
 */
function LibraryPanelSection({ panel }: { panel: LibraryPanel }) {
  const t = useT();
  return (
    <PublicContentSection heading={t(panel.title)} icon={panel.icon}>
      <p className="theme-text-muted mt-3 text-sm leading-6">{t(panel.blurb)}</p>
      <div className="mt-5 space-y-6">
        {panel.groups.map((group, index) => (
          <div key={group.label ?? index}>
            {group.label ? (
              <h3 className="theme-text-secondary text-sm font-semibold">{t(group.label)}</h3>
            ) : null}
            {group.note ? (
              <p className="theme-text-muted mt-0.5 text-xs leading-5">{t(group.note)}</p>
            ) : null}
            <ul className={group.label ? "mt-2" : undefined}>
              {group.items.map((item) => (
                <li key={item.href} className="theme-index-row">
                  <SmartLink
                    href={item.href}
                    className="theme-index-row-link group -mx-3 flex flex-col gap-y-0.5 rounded-xl px-3 py-2.5"
                  >
                    <span className="theme-accent-heading text-[0.9375rem] font-medium leading-6 transition group-hover:opacity-90">
                      {t(item.title)}
                    </span>
                    {item.description ? (
                      <span className="theme-text-muted line-clamp-2 text-xs leading-5">
                        {t(item.description)}
                      </span>
                    ) : null}
                  </SmartLink>
                </li>
              ))}
            </ul>
          </div>
        ))}
      </div>
      {panel.footerLinks?.length ? (
        <p className="theme-text-muted mt-5 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs leading-5">
          <span>{t("See also")}</span>
          {panel.footerLinks.map((link) => (
            <SmartLink key={link.href} href={link.href} className={proseLinkClassName}>
              {t(link.label)}
            </SmartLink>
          ))}
        </p>
      ) : null}
    </PublicContentSection>
  );
}

export function EffectsLibraryPanels() {
  return (
    <div className="mx-auto w-full max-w-[70ch] space-y-12 px-4">
      {LIBRARY_PANELS.map((panel) => (
        <LibraryPanelSection key={panel.id} panel={panel} />
      ))}
    </div>
  );
}

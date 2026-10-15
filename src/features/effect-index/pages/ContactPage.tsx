import type { ReactNode } from "react";
import { PageHeader } from "@/components/layout/PageHeader";
import { PublicMetadataList } from "@/components/layout/PublicContentPrimitives";
import {
  PublicContentShell,
  PublicSectionHeading,
} from "@/components/layout/PublicPagePrimitives";
import { PublicMarkdownBody } from "@/components/pages/PublicMarkdownBody";
import { icons } from "@/utils/iconNames";

const PROJECT_EMAIL = "contact@dose.wiki";
const FOUNDER_EMAIL = "contact@dose.wiki";

const INTRO_MARKDOWN = `To collectively contact the staff members of this site, please email us at [${PROJECT_EMAIL}.](mailto:${PROJECT_EMAIL}) However, if you would like to contact the site founder directly, please refer to the contact information below:`;

function MailtoValue({ address }: { address: string }): ReactNode {
  return (
    <a
      href={`mailto:${address}`}
      className="theme-link-muted break-all font-medium transition hover:underline hover:underline-offset-2"
    >
      {address}
    </a>
  );
}

export function ContactPage({ intro }: { intro?: string } = {}) {
  return (
    <PublicContentShell width="standard" focusTarget>
      <PageHeader title="Contact Us" icon={icons.mail} />

      <PublicMarkdownBody content={intro || INTRO_MARKDOWN} />

      <section className="mt-10 space-y-6">
        <PublicSectionHeading icon={icons.userRound} title="Site founder" />

        <PublicMetadataList
          items={[
            {
              key: "discord",
              icon: icons.discord,
              label: "Discord",
              value: "josikinz#1066",
            },
            {
              key: "reddit",
              icon: icons.globe,
              label: "Reddit",
              value: "/u/josikins",
            },
            {
              key: "email",
              icon: icons.mail,
              label: "Email",
              value: <MailtoValue address={FOUNDER_EMAIL} />,
            },
          ]}
        />
      </section>
    </PublicContentShell>
  );
}

import type { IconName } from "@/components/common/Icon";
import { PageHeader } from "@/components/layout/PageHeader";
import {
  PublicContentShell,
  PublicSectionHeading,
} from "@/components/layout/PublicPagePrimitives";
import { ContentCard } from "@/components/ui/surface";
import { icons } from "@/utils/iconNames";

/**
 * Effect Index's documentation house style, transcribed from the old site's
 * `pages/documentation-style-guide.vue`. The homepage's intro copy links here as the
 * "consistent writing style" the Subjective Effect Index is written in.
 *
 * The old page was one flat run of `h3` + `ul`, and the transcription is verbatim —
 * including two things a reader may take for mistakes, because they are the original's:
 *
 *  - the last two bullets of "Rules of Thumb" are repeated word for word as the last two
 *    bullets of "Write about facts, note speculation"; and
 *  - "XYZ can creating the feeling that" is the original's own wording.
 *
 * Both are the site's own house style document describing its own rules, so silently
 * rewriting either would change what Effect Index says its rules are. They are left for the
 * site owner to edit as content.
 */

type StyleGuideListItem =
  | string
  | { text: string; children: readonly string[] };

type StyleGuideBody =
  | { kind: "list"; items: readonly StyleGuideListItem[] }
  /** A sentence template the original presented in quotation marks. */
  | { kind: "template"; text: string }
  | {
      kind: "preferences";
      items: readonly { context: string; term: string }[];
    };

interface StyleGuideSection {
  id: string;
  title: string;
  icon: IconName;
  body: StyleGuideBody;
}

const SECTIONS: readonly StyleGuideSection[] = [
  {
    id: "rules-of-thumb",
    title: "Rules of Thumb",
    icon: icons.lightbulb,
    body: {
      kind: "list",
      items: [
        "Use simplistic and easily understandable language over complex and obscure language wherever possible. This is to ensure that the SEI is as accessible to the general public as possible.",
        'Do not make absolute or black/white assertions. For example "XYZ can creating the feeling that" over "XYZ will create the feeling that"',
        "Do not talk about the conclusions reached during these states as if they are inherently true, instead make it clear that you are simply describing the experience of them.",
      ],
    },
  },
  {
    id: "facts-and-speculation",
    title: "Write about facts, note speculation:",
    icon: icons.scale,
    body: {
      kind: "list",
      items: [
        "Find a balance between (a) acknowledging when content is subjective or speculative, and (b) using a direct and confident writing style.",
        'Do not make absolute or black/white assertions. For example "XYZ can creating the feeling that" over "XYZ will create the feeling that"',
        "Do not talk about the conclusions reached during these states as if they are inherently true, instead make it clear that you are simply describing the experience of them.",
      ],
    },
  },
  {
    id: "levels-of-intensity",
    title: "Levels of intensity intro",
    icon: icons.chartColumnIncreasing,
    body: {
      kind: "template",
      text: "This effect is capable of manifesting itself across the x different levels of intensity described below:",
    },
  },
  {
    id: "tiers",
    title: "Tiers",
    icon: icons.listOrdered,
    body: {
      kind: "list",
      items: [
        "At the lowest level, …",
        "At this level, …",
        "At the highest level, …",
      ],
    },
  },
  {
    id: "referring-to-the-experiencer",
    title: "Referring to the experiencer",
    icon: icons.brain,
    body: {
      kind: "list",
      items: [
        {
          text: "“A person” is preferred",
          children: ['"At this level a person experiences morphing"'],
        },
        "“One’s” is secondary and provides variety",
        "“At this level one’s vision is completely encompassed by geometry”",
      ],
    },
  },
  {
    id: "outro-paragraph",
    title: "Outro paragraph sentence:",
    icon: icons.fileText,
    body: {
      kind: "template",
      text: "Effect is most commonly induced under the influence of low/moderate/heavy dosages of hallucinogenic compounds, such as type list. However, it can also occur under the influence of type list, particularly during phase [or as a result of x]",
    },
  },
  {
    id: "word-preferences",
    title: "Word preferences:",
    icon: icons.bookOpen,
    body: {
      kind: "preferences",
      items: [
        {
          context: "To describe a given environment in its entirety:",
          term: "Scene",
        },
        {
          context:
            "To describe the surface of a given object (like the surface of a wall in a video game):",
          term: "Texture",
        },
        { context: "To describe a given object:", term: "Object" },
        {
          context: "To describe the experience of an effect of an illusion:",
          term: "Perception",
        },
        {
          context: "To describe increasing intensity across multiple tiers:",
          term: "Progressive",
        },
        {
          context:
            "To describe common sober experiences (to contrast with intoxicated effects):",
          term: "Everyday (life)",
        },
        {
          context:
            "To describe an illusion the subject recognizes to be false:",
          term: "Hallucination / hallucinatory",
        },
        {
          context:
            "To describe an illusion the subject cannot recognize as such:",
          term: "Delusion",
        },
        {
          context: "To describe the lower bound of an effect range:",
          term: "Subtle",
        },
        {
          context: "To describe the upper bound of an effect range:",
          term: "Extreme",
        },
      ],
    },
  },
  {
    id: "grammar-preferences",
    title: "Grammatical/syntax preferences:",
    icon: icons.pencil,
    body: {
      kind: "list",
      items: [
        'To refer to all possible trips: use "a trip" or "a [substance] trip" is preferred when referring to a trip. This makes the language general and inclusive, so it is clear that a specific trip or kind of trip is not being denoted. Example: "The first stage of a DMT trip is the onset"',
        'To refer to specific trips: use "the trip": use "the trip" or "the [substance] trip" when referring to a specific trip in narrative, or when a kind of experience given specific parameters is being discussed. Example: "After describing the LSD trip Hofmann had experienced, the lecture hall giggled."',
        'Use of and/or: Do not use "and/or", it can always be replaced with more specific language that is more readable.',
      ],
    },
  },
];

const LIST_CLASS =
  "theme-text-secondary list-disc space-y-3 pl-6 text-[1.0625rem] leading-7 marker:text-dose-text-ghost";

function StyleGuideBodyContent({ body }: { body: StyleGuideBody }) {
  if (body.kind === "template") {
    return (
      <p className="theme-text-secondary text-[1.0625rem] italic leading-7">
        &ldquo;{body.text}&rdquo;
      </p>
    );
  }

  if (body.kind === "preferences") {
    return (
      <dl className="theme-text-secondary space-y-3 text-[1.0625rem] leading-7">
        {body.items.map((item) => (
          <div key={item.term} className="sm:flex sm:flex-wrap sm:gap-x-2">
            <dt>{item.context}</dt>
            <dd className="theme-text-primary italic">{item.term}</dd>
          </div>
        ))}
      </dl>
    );
  }

  return (
    <ul className={LIST_CLASS}>
      {body.items.map((item) =>
        typeof item === "string" ? (
          <li key={item}>{item}</li>
        ) : (
          <li key={item.text}>
            {item.text}
            <ul className={`${LIST_CLASS} mt-3`}>
              {item.children.map((child) => (
                <li key={child}>{child}</li>
              ))}
            </ul>
          </li>
        ),
      )}
    </ul>
  );
}

export function DocumentationStyleGuidePage() {
  return (
    <PublicContentShell width="standard" focusTarget>
      <PageHeader
        title="Documentation Style Guide"
        icon={icons.bookOpen}
        description="The house style the Subjective Effect Index is written in: how effects are described, how intensity is levelled, and which words are preferred."
      />

      <div className="space-y-10">
        {SECTIONS.map((section) => (
          <section key={section.id} className="space-y-5">
            <PublicSectionHeading icon={section.icon} title={section.title} />

            <ContentCard variant="public" padding="lg" radius="xl">
              <StyleGuideBodyContent body={section.body} />
            </ContentCard>
          </section>
        ))}
      </div>
    </PublicContentShell>
  );
}

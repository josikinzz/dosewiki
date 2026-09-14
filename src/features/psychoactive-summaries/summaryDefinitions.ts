import type { IconName } from "@/components/common/Icon";
import { msg } from "@/i18n/messages";

export type PsychoactiveSummaryRouteKey =
  | "psychedelic-visual"
  | "psychedelic-cognitive"
  | "psychedelic-miscellaneous"
  | "dissociative"
  | "deliriant";

export type PsychoactiveSummarySelection =
  | {
      type: "tags";
      tags: readonly string[];
      excludeTags?: readonly string[];
    }
  | {
      type: "names";
      names: readonly string[];
    };

export interface PsychoactiveSummarySectionDefinition {
  title: string;
  icon?: IconName;
  definitionHtml: string;
  selection: PsychoactiveSummarySelection;
}

interface PsychoactiveSummaryIntroParagraph {
  html: string;
  italic?: boolean;
}

interface PsychoactiveSummaryImage {
  src: string;
  title: string;
  artist: string;
  width: string;
  align: "left" | "right" | "center";
}

interface PsychoactiveSummarySeeAlso {
  href: string;
  label: string;
}

export interface PsychoactiveSummaryDefinition {
  key: PsychoactiveSummaryRouteKey;
  path: string;
  summaryPath: readonly string[];
  title: string;
  metadataTitle: string;
  metadataDescription: string;
  icon: IconName;
  intro: readonly PsychoactiveSummaryIntroParagraph[];
  image?: PsychoactiveSummaryImage;
  sections: readonly PsychoactiveSummarySectionDefinition[];
  seeAlso: readonly PsychoactiveSummarySeeAlso[];
}

// Reader-visible prose below is a `msg()` key: `PsychoactiveSummaryPage`
// renders it through `t()`, so the mirror sees it in its own language while
// the English stays the only source. The HTML inside a key is part of the key.
const PSYCHEDELIC_SUBSTANCES = msg(
  "LSD, Psilocybin mushrooms, DMT, Ayahuasca, Mescaline, 5-MeO-MiPT, 2C-B, LSA, AL-LAD, ALD-52, 1P-LSD, 2C-B-Fly, 2C-C, 2C-D, 2C-E, 2C-P, 4-AcO-DMT, 4-HO-MET, 4-HO-MiPT, 5-MeO-DMT, DPT, and DOC.",
);

const PSYCHEDELIC_COMMON_INTRO = [
  {
    html: msg(
      "These descriptions are not specific to any particular substance but are applicable to the effects which commonly occur in various forms under the influence of almost any psychedelic compound. This includes, but is not limited to, both classical and research chemical psychedelics, such as:",
    ),
  },
  {
    html: PSYCHEDELIC_SUBSTANCES,
    italic: true,
  },
  {
    html: msg(
      "The article begins with a description of the simpler effects and works its way up towards more complex experiences as it progresses. Individual effects are also summarized with a link to their full article.",
    ),
  },
] as const;

export const PSYCHOACTIVE_SUMMARY_DEFINITIONS = [
  {
    key: "psychedelic-visual",
    path: "/psychoactive/psychedelic/visual",
    summaryPath: ["psychedelic", "visual"],
    title: msg("Visual Effects of Psychedelics"),
    metadataTitle: msg("Visual Psychedelic Effects"),
    metadataDescription: msg(
      "A curated guide to the visual effects of psychedelics, from visual amplifications and distortions to geometry and hallucinatory states.",
    ),
    icon: "lucide:eye",
    image: {
      src: "https://dosewiki-media.gremblinzuwu.workers.dev/media/sha256/a9/a92e629cd61f8d288027a768f69644b7cc488ce4b68f764184bebc26d3a519c2.jpg",
      title: "In the Tree",
      artist: "Eddie Calz",
      width: "300",
      align: "right",
    },
    intro: [
      {
        html: msg(
          "This article breaks down the subjective visual effects of the psychedelic experience into simple and easy to understand descriptions with accompanying image replications. This is done without resorting to metaphors, analogies, or personal trip reports.",
        ),
      },
      ...PSYCHEDELIC_COMMON_INTRO,
    ],
    sections: [
      {
        title: msg("Visual Amplifications"),
        definitionHtml: msg(
          "<strong>Visual amplifications</strong> are defined as any subjective effect that increases, enhances, or intensifies a facet of a person's sense of sight.",
        ),
        selection: {
          type: "tags",
          tags: ["psychedelic", "visual", "enhancement"],
        },
      },
      {
        title: msg("Visual Distortions"),
        definitionHtml: msg(
          "<strong>Visual distortions</strong> are any subjective effect which alters and changes the perception or appearance of pre-existing visual data without adding any entirely new content.",
        ),
        selection: {
          type: "tags",
          tags: ["psychedelic", "visual", "distortion"],
        },
      },
      {
        title: msg("Geometric Patterns"),
        definitionHtml: msg(
          "<strong>Geometric patterns</strong> are defined as any subjective effect that introduces complex arrays of shapes, colours, symbols, patterns, geometry, form constants, and fractals to one's field of vision.",
        ),
        selection: {
          type: "tags",
          tags: ["psychedelic", "visual", "geometric"],
        },
      },
      {
        title: msg("Hallucinatory States"),
        definitionHtml: msg(
          "<strong>Hallucinatory states</strong> are any subjective effect which changes the perception or appearance of pre-existing visual data by adding entirely new content in a manner which is similar to that of dreams.",
        ),
        selection: {
          type: "tags",
          tags: ["psychedelic", "visual", "hallucinatory state"],
        },
      },
    ],
    seeAlso: [
      {
        href: "/psychoactive/psychedelic/cognitive",
        label: msg("Cognitive Psychedelic Effects"),
      },
      {
        href: "/psychoactive/psychedelic/miscellaneous",
        label: msg("Miscellaneous Psychedelic Effects"),
      },
    ],
  },
  {
    key: "psychedelic-cognitive",
    path: "/psychoactive/psychedelic/cognitive",
    summaryPath: ["psychedelic", "cognitive"],
    title: msg("Cognitive Effects of Psychedelics"),
    metadataTitle: msg("Cognitive Psychedelic Effects"),
    metadataDescription: msg(
      "A curated guide to the cognitive effects of psychedelics, including amplifications, suppressions, novel, psychological, and transpersonal states.",
    ),
    icon: "lucide:user",
    intro: [
      {
        html: msg(
          "This article breaks down the subjective cognitive effects of the psychedelic experience into simple and easy to understand descriptions with accompanying image replications. This is done without resorting to metaphor, analogy, or personal trip reports.",
        ),
      },
      ...PSYCHEDELIC_COMMON_INTRO,
    ],
    sections: [
      {
        title: msg("Cognitive Amplifications"),
        definitionHtml: msg(
          "<strong>Cognitive amplifications</strong> are defined as any subjective effect that increases, enhances, or intensifies a facet of a person's sense of cognition.",
        ),
        selection: {
          type: "tags",
          tags: ["psychedelic", "cognitive", "enhancement"],
        },
      },
      {
        title: msg("Cognitive Suppressions"),
        definitionHtml: msg(
          "<strong>Cognitive suppressions</strong> are any subjective effect which decreases or lowers the intensity of an aspect of a person's cognition.",
        ),
        selection: {
          type: "tags",
          tags: ["psychedelic", "cognitive", "suppression"],
        },
      },
      {
        title: msg("Novel States"),
        definitionHtml: msg(
          "A <strong>novel cognitive state</strong> is any cognitive effect which does not merely amplify or suppress familiar states of mind, but rather induces an experience that is qualitatively different from that of ordinary consciousness.<br /><br />Although many transpersonal and psychological effects also technically fit into this definition, they are excluded from this category of effects as they have their own defining qualities which standard novel states do not.",
        ),
        selection: {
          type: "tags",
          tags: ["psychedelic", "cognitive", "novel"],
        },
      },
      {
        title: msg("Psychological States"),
        definitionHtml: msg(
          "<strong>Psychological effects</strong> are any cognitive effect that is either established within the psychological literature or arises as a result of the complex interplay between other more simplistic components such as cognitive enhancements and suppressions.",
        ),
        selection: {
          type: "tags",
          tags: ["psychedelic", "cognitive", "psychological state"],
        },
      },
      {
        title: msg("Transpersonal States"),
        definitionHtml: msg(
          "<strong>Transpersonal states</strong> are any subjective effect which feels as if it alters a person's cognition in a manner which relates to or contains information regarding their place in the universe, the inner workings of reality or consciousness, and the context of their existence. The fullest manifestation of these effects fall under what are sometimes called \"peak\", \"transcendent\" or \"transformative\" experiences.",
        ),
        selection: {
          type: "tags",
          tags: ["psychedelic", "cognitive", "transpersonal state"],
        },
      },
    ],
    seeAlso: [
      {
        href: "/psychoactive/psychedelic/visual",
        label: msg("Visual Psychedelic Effects"),
      },
      {
        href: "/psychoactive/psychedelic/miscellaneous",
        label: msg("Miscellaneous Psychedelic Effects"),
      },
    ],
  },
  {
    key: "psychedelic-miscellaneous",
    path: "/psychoactive/psychedelic/miscellaneous",
    summaryPath: ["psychedelic", "miscellaneous"],
    title: msg("Miscellaneous Effects of Psychedelics"),
    metadataTitle: msg("Miscellaneous Psychedelic Effects"),
    metadataDescription: msg(
      "A curated guide to the auditory, tactile, multisensory, physical, and uncomfortable effects of psychedelics.",
    ),
    icon: "lucide:cog",
    intro: [
      {
        html: msg(
          "This article breaks down the subjective miscellaneous effects of the psychedelic experience into simple and easy to understand descriptions with accompanying image replications. This is done without resorting to metaphor, analogy, or personal trip reports.",
        ),
      },
      ...PSYCHEDELIC_COMMON_INTRO,
    ],
    sections: [
      {
        title: msg("Auditory Effects"),
        definitionHtml: msg(
          "<strong>Auditory effects</strong> are any subjective effect which directly alters a person's sense of hearing.",
        ),
        selection: {
          type: "tags",
          tags: ["psychedelic", "miscellaneous", "auditory"],
        },
      },
      {
        title: msg("Tactile Effects"),
        definitionHtml: msg(
          "<strong>Tactile effects</strong> are any subjective effect which directly alters a person's sense of touch.",
        ),
        selection: {
          type: "tags",
          tags: ["psychedelic", "miscellaneous", "tactile"],
        },
      },
      {
        title: msg("Multisensory Effects"),
        definitionHtml: msg(
          "<strong>Multisensory effects</strong> are any subjective effect which directly alters two or more senses simultaneously.<br /><br />Although some hallucinatory effects may affect multiple senses at one time they are usually not categorized as 'multisensory effects' unless they do so consistently. For example, while experiences with autonomous entities may sometimes have a tactile component to them, more often than not they are primarily a visual experience and are therefore classified as such.",
        ),
        selection: {
          type: "tags",
          tags: ["psychedelic", "miscellaneous", "multisensory"],
        },
      },
      {
        title: msg("Physical Effects"),
        definitionHtml: msg(
          "<strong>Physical effects</strong> are any subjective effect which directly affects an aspect of a person's physical body.<br /><br />Although many uncomfortable physical effects also technically fit into this definition, they are excluded from this category of effects as they have their own defining qualities which standard physical effects do not.",
        ),
        selection: {
          type: "tags",
          tags: ["psychedelic", "miscellaneous", "physical"],
          excludeTags: ["uncomfortable"],
        },
      },
      {
        title: msg("Uncomfortable Effects"),
        icon: "lucide:frown",
        definitionHtml: msg(
          "An <strong>uncomfortable physical effect</strong> is any substance-induced alteration of a person's physical state which is unpleasant, undesirable, painful, or otherwise a source of distress. In most cases they indicate a temporary part of a substance's interaction with the body. However, in certain contexts, they can also indicate the need for attention or even medical treatment if they become dangerously severe.",
        ),
        selection: {
          type: "tags",
          tags: ["psychedelic", "miscellaneous", "uncomfortable"],
        },
      },
    ],
    seeAlso: [
      {
        href: "/psychoactive/psychedelic/cognitive",
        label: msg("Cognitive Psychedelic Effects"),
      },
      {
        href: "/psychoactive/psychedelic/visual",
        label: msg("Visual Psychedelic Effects"),
      },
    ],
  },
  {
    key: "dissociative",
    path: "/psychoactive/dissociative",
    summaryPath: ["dissociative"],
    title: msg("Subjective Effects of Dissociatives"),
    metadataTitle: msg("Dissociative Effects"),
    metadataDescription: msg(
      "A curated guide to the disconnective, sensory, cognitive, and physical effects of dissociatives.",
    ),
    icon: "lucide:unlink",
    intro: [
      {
        html: msg(
          "<strong>Dissociatives</strong> are a class of hallucinogen which distort perceptions of sight and sound to produce feelings of disconnection, detachment, and dissociation from the environment and self. These effects occur due to the way in which these compounds function as NMDA receptor antagonists. This means they bind to receptors in the brain but do not activate them, thus blocking other neurotransmitters from doing so. The result is a dose-dependent decrease in the passing of electrical signals across the brain and an overall disconnection of neurons, which leads to states of disconnection between conscious parts of the brain and its sensory organs.",
        ),
      },
      {
        html: msg(
          "This article breaks down the subjective effects of the dissociative experience into simple and easy to understand descriptions with accompanying image replications. This is done without resorting to metaphor, analogy, or personal trip reports.",
        ),
      },
      {
        html: msg(
          "These descriptions are not specific to any particular substance but are applicable to the effects which commonly occur in various forms under the influence of almost any dissociative compound. This includes, but is not limited to, both classical and research chemical dissociatives, such as:",
        ),
      },
      {
        html: msg(
          "Ketamine, MXE, PCP, DXM, DCK, 3-MeO-PCP, O-PCE, 3-HO-PCE, 3-HO-PCP, 3-MeO-PCE, 4-MeO-PCP, PCE, Diphenidine, Ephenidine, Methoxphenidine",
        ),
        italic: true,
      },
      {
        html: msg("Individual effects are also summarized with a prominent link to their full article."),
      },
    ],
    sections: [
      {
        title: msg("Disconnective Effects"),
        definitionHtml: msg(
          "<strong>Disconnective effects</strong> are any subjective effect which feels as if it detaches or disconnects one from the external environment, their senses, and their consciousness.<br /><br />These effects are typically associated with dissociative hallucinogens and likely occur due to the way in which these compounds function as NMDA receptor antagonists. This means they bind to the receptor, but do not activate it and block other neurotransmitters from doing so. The result is a dose-dependent decrease in the passing of electrical signals across the brain and an overall disconnection of neurons, which leads to states of disconnection between conscious parts of the brain and its sensory organs.",
        ),
        selection: {
          type: "names",
          names: [
            "physical disconnection",
            "cognitive disconnection",
            "visual disconnection",
            "detachment plateaus",
          ],
        },
      },
      {
        title: msg("Miscellaneous Sensory Effects"),
        icon: "lucide:cog",
        definitionHtml: msg(
          "In this context, <strong>miscellaneous sensory effects</strong> are any subjective experience which alters a person's visual, tactile, or gustatory senses.",
        ),
        selection: {
          type: "tags",
          tags: ["dissociative", "sensory"],
          excludeTags: ["disconnective"],
        },
      },
      {
        title: msg("Cognitive Effects"),
        definitionHtml: msg(
          "<strong>Cognitive effects</strong> are any subjective experience which directly alter or introduce new content to an element of a person's cognition.",
        ),
        selection: {
          type: "tags",
          tags: ["dissociative", "cognitive"],
          excludeTags: ["disconnective"],
        },
      },
      {
        title: msg("Physical Effects"),
        definitionHtml: msg(
          "<strong>Physical effects</strong> are any subjective experience which directly affects an aspect of a person's physical body.",
        ),
        selection: {
          type: "tags",
          tags: ["dissociative", "physical"],
          excludeTags: ["uncomfortable"],
        },
      },
    ],
    seeAlso: [
      {
        href: "/psychoactive/psychedelic/visual",
        label: msg("Visual Psychedelic Effects"),
      },
      {
        href: "/psychoactive/deliriant",
        label: msg("Deliriant Subjective Effects"),
      },
    ],
  },
  {
    key: "deliriant",
    path: "/psychoactive/deliriant",
    summaryPath: ["deliriant"],
    title: msg("Subjective Effects of Deliriants"),
    metadataTitle: msg("Deliriant Effects"),
    metadataDescription: msg(
      "A curated guide to the visual, auditory, tactile, multisensory, cognitive, physical, and uncomfortable effects of deliriants.",
    ),
    icon: "tabler:spider",
    image: {
      // The artist's own published work on this site, not the 2016 copy the
      // Effect Index page carried: same composition, a later rendition, and
      // 1536x2048 instead of 750x1127. Row `700mg-of-dph-stas-constantine`.
      src: "https://dosewiki-media.gremblinzuwu.workers.dev/media/sha256/cc/cc7abaacd147c43cb10107de4718c18155d4058511d9d0376be613d4fe92a5f4.png",
      title: "700mg of DPH",
      artist: "Stas Constantine",
      width: "300",
      align: "right",
    },
    intro: [
      {
        html: msg(
          "<strong>Deliriants</strong> are a class of hallucinogen that are unique in that they offer solid hallucinations which display themselves seamlessly into waking consciousness, similar to fully formed dreams. These hallucinations are also characterised by delusions and psychosis as they are most often immediately accepted as reality by the person experiencing them. In contrast, classical psychedelics and dissociatives have progressive levels of multiple all-encompassing sensory effects before reaching the level of concrete hallucination. They also rarely induce psychosis, with most people maintaining an understanding that they are simply under the influence of a substance throughout any hallucinations which they undergo.",
        ),
      },
      {
        html: msg(
          "Outside of these delirious external hallucinations, deliriant trips are primarily characterised by incredibly uncomfortable and often dangerous physical side effects alongside deep feelings of fear, anxiety, and confusion. It is because of this that deliriant substances hold no therapeutic or recreational potential and are instead merely curiosities that should not be experimented with by any but the most experienced of psychonauts.",
        ),
      },
      {
        html: msg(
          "This article breaks down the subjective effects of the deliriant experience into simple and easy to understand descriptions with accompanying image replications. This is done without resorting to metaphor, analogy, or personal trip reports.",
        ),
      },
      {
        html: msg(
          "These descriptions are not specific to any particular substance but are applicable to the effects which commonly occur in various forms under the influence of almost any deliriant compound. This includes, but is not limited to, both synthetic and plant based deliriants, such as:",
        ),
      },
      {
        html: msg(
          "diphenhydramine (DPH), datura, atropine, hyoscyamine, scopolamine, dimenhydrinate, doxylamine, benzydamine, elemicin, brugmansia, atropa belladonna, hyoscyamus niger, mandragora officinarum",
        ),
        italic: true,
      },
      {
        html: msg("Individual effects are also summarized with a prominent link to their full article."),
      },
    ],
    sections: [
      {
        title: msg("Visual Effects"),
        definitionHtml: msg(
          "<strong>Visual effects</strong> are any subjective experience which directly alters a person's sense of sight.",
        ),
        selection: {
          type: "tags",
          tags: ["deliriant", "visual"],
        },
      },
      {
        title: msg("Auditory Effects"),
        definitionHtml: msg(
          "<strong>Auditory effects</strong> are any subjective effect which directly alters a person's sense of hearing.",
        ),
        selection: {
          type: "tags",
          tags: ["deliriant", "auditory"],
        },
      },
      {
        title: msg("Tactile Effects"),
        definitionHtml: msg(
          "<strong>Tactile effects</strong> are any subjective effect which directly alters a person's sense of touch.",
        ),
        selection: {
          type: "tags",
          tags: ["deliriant", "tactile"],
        },
      },
      {
        title: msg("Multisensory Effects"),
        definitionHtml: msg(
          "<strong>Multisensory effects</strong> are any subjective effect which directly alters two or more senses simultaneously.<br /><br />Although some hallucinatory effects may affect multiple senses at one time they are usually not categorized as 'multisensory effects' unless they do so consistently. For example, while experiences with autonomous entities may sometimes have a tactile component to them, more often than not they are primarily a visual experience and are therefore classified as such.",
        ),
        selection: {
          type: "tags",
          tags: ["deliriant", "multisensory"],
        },
      },
      {
        title: msg("Cognitive Effects"),
        definitionHtml: msg(
          "<strong>Cognitive effects</strong> are any subjective experience which directly alter or introduce new content to an element of a person's cognition.",
        ),
        selection: {
          type: "tags",
          tags: ["deliriant", "cognitive"],
        },
      },
      {
        title: msg("Physical Effects"),
        definitionHtml: msg(
          "<strong>Physical effects</strong> are any subjective experience which directly affects an aspect of a person's physical body.",
        ),
        selection: {
          type: "tags",
          tags: ["deliriant", "physical"],
          excludeTags: ["uncomfortable"],
        },
      },
      {
        title: msg("Uncomfortable Physical Effects"),
        definitionHtml: msg(
          "An <strong>uncomfortable physical effect</strong> is any substance-induced alteration of a person's physical state which is unpleasant, undesirable, painful, or otherwise a source of distress. In most cases they indicate a temporary part of a substance's interaction with the body. However, in certain contexts, they can also indicate the need for attention or even medical treatment if they become dangerously severe.",
        ),
        selection: {
          type: "tags",
          tags: ["deliriant", "uncomfortable"],
        },
      },
    ],
    seeAlso: [
      {
        href: "/psychoactive/psychedelic/visual",
        label: msg("Visual Psychedelic Effects"),
      },
      {
        href: "/psychoactive/dissociative",
        label: msg("Dissociative Subjective Effects"),
      },
    ],
  },
] as const satisfies readonly PsychoactiveSummaryDefinition[];

export function getPsychoactiveSummaryDefinition(
  summaryPath: readonly string[],
): PsychoactiveSummaryDefinition | null {
  const normalizedPath = summaryPath.join("/");

  return (
    PSYCHOACTIVE_SUMMARY_DEFINITIONS.find(
      (definition) => definition.summaryPath.join("/") === normalizedPath,
    ) ?? null
  );
}

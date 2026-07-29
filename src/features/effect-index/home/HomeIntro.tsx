"use client";

import { useId, useState } from "react";
import Link from "next/link";

import { Button } from "@/components/ui/button";
import { homePanelLinkClassName } from "./HomePanel";

/**
 * The Effect Index homepage's intro block, ported from the old site's
 * `components/home/Description.vue`.
 *
 * Copy is verbatim from the original with one deliberate cut: the lead sentence read
 * "Effect Index, which is currently under construction, is a resource dedicated to…" and the
 * construction clause is dropped at the site owner's request. Everything else is word for
 * word, including the effect count being read live rather than hardcoded.
 *
 * The two collapsed paragraphs stay in the document and are toggled with the `hidden`
 * attribute rather than being conditionally mounted: they carry the page's only description
 * of the documentation method, and a crawler that never clicks "read more" should still see
 * it.
 */

const BUTTON_CLASS = "uppercase tracking-[0.1em]";

interface HomeIntroProps {
  /** Live count of effect articles, quoted mid-sentence. */
  effectCount: number;
}

export function HomeIntro({ effectCount }: HomeIntroProps) {
  const [isExpanded, setIsExpanded] = useState(false);
  const expandedId = useId();

  return (
    <section className="theme-text-secondary text-[1.0625rem] leading-7">
      <p>
        <strong className="theme-text-primary font-semibold">Effect Index,</strong> is a
        resource dedicated to establishing the field of formalised subjective effect
        documentation. It is the home of the{" "}
        <Link href="/effects" className={homePanelLinkClassName}>
          Subjective Effect Index
        </Link>{" "}
        (SEI), which contains {effectCount} effect descriptions that exist to serve as a
        comprehensive map of all potential experiences that can occur under the influence of
        any class of psychoactive compound, particularly hallucinogens.
      </p>

      <div id={expandedId} hidden={!isExpanded} className="mt-4 space-y-4">
        <p>
          The effects identified here are accompanied by detailed descriptions of how it feels
          to experience them. These are written in an objective and{" "}
          <Link href="/documentation-style-guide" className={homePanelLinkClassName}>
            consistent writing style
          </Link>{" "}
          based upon phenomenological observation and avoids the use of metaphor or analogy.
          The descriptions also strive to use language that is as simple and understandable as
          possible. This has been done with the hope that they will serve as a universal
          terminology that allows people to describe and discuss that which was previously
          considered ineffable.
        </p>
        <p>
          These effects are organised into categories based on the sense affected and their
          behaviour. Many of these are further broken down into levels, subcomponents, and
          variations in style, which can occur across different substances. Detailed{" "}
          <Link href="/replications" className={homePanelLinkClassName}>
            replications
          </Link>{" "}
          are included whenever possible to supplement the text descriptions in the form of
          images, audio clips, and animations.
        </p>
      </div>

      <div className="mt-5 flex flex-wrap items-center gap-3">
        <Button
          type="button"
          variant="secondary"
          size="sm"
          className={BUTTON_CLASS}
          aria-expanded={isExpanded}
          aria-controls={expandedId}
          onClick={() => setIsExpanded((expanded) => !expanded)}
        >
          read {isExpanded ? "less" : "more"}
        </Button>

        <Button asChild variant="secondary" size="sm" className={BUTTON_CLASS}>
          <Link href="/about">About Us</Link>
        </Button>
      </div>
    </section>
  );
}

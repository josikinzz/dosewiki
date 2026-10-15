"use client";

import {
  useEffect,
  useLayoutEffect,
  useState,
  type RefObject,
} from "react";
import {
  READER_LEADING_PROPERTY,
  READER_TRACKING_PROPERTY,
  TEXT_SIZE_PROPERTY,
} from "@/theme/appearanceTypography";

const TITLE_MOLECULE_GAP_PX = 16;
const useIsomorphicLayoutEffect =
  typeof window === "undefined" ? useEffect : useLayoutEffect;

interface HeroTitleFitOptions {
  heroRef: RefObject<HTMLDivElement | null>;
  titleRef: RefObject<HTMLHeadingElement | null>;
  moleculeUrl: string | null;
  title: string;
}

export function useHeroTitleFit({
  heroRef,
  titleRef,
  moleculeUrl,
  title,
}: HeroTitleFitOptions) {
  const [moleculeBelowTitle, setMoleculeBelowTitle] = useState(false);
  const [moleculeTopOffset, setMoleculeTopOffset] = useState(0);
  const [titleFitPx, setTitleFitPx] = useState<number | null>(null);

  useIsomorphicLayoutEffect(() => {
    const heroElement = heroRef.current;
    const titleElement = titleRef.current;

    if (!heroElement || !titleElement) {
      return;
    }

    let frameId: number | null = null;
    const measurePlacement = () => {
      frameId = null;
      const heroRect = heroElement.getBoundingClientRect();
      if (heroRect.width === 0) return;

      const heroStyle = getComputedStyle(heroElement);
      const borderRightWidth =
        Number.parseFloat(heroStyle.borderRightWidth) || 0;
      const paddingRight = Number.parseFloat(heroStyle.paddingRight) || 0;
      const contentRight = heroRect.right - borderRightWidth - paddingRight;
      const moleculeLeft = contentRight - 256;

      const previousWhiteSpace = titleElement.style.whiteSpace;
      const previousFontSize = titleElement.style.fontSize;
      titleElement.style.whiteSpace = "nowrap";
      titleElement.style.fontSize = "";
      const naturalFontSize =
        Number.parseFloat(getComputedStyle(titleElement).fontSize) || 0;
      const titleRange = document.createRange();
      titleRange.selectNodeContents(titleElement);
      const titleRect = titleRange.getBoundingClientRect();
      titleElement.style.fontSize = "var(--type-size-section)";
      const minFontSize =
        Number.parseFloat(getComputedStyle(titleElement).fontSize) || 0;
      titleElement.style.whiteSpace = previousWhiteSpace;
      titleElement.style.fontSize = previousFontSize;

      if (moleculeUrl) {
        const nextBelowTitle =
          titleRect.right > moleculeLeft - TITLE_MOLECULE_GAP_PX;
        setMoleculeBelowTitle((current) =>
          current === nextBelowTitle ? current : nextBelowTitle,
        );
        if (nextBelowTitle) {
          const nextOffset = titleElement.getBoundingClientRect().height + 16;
          setMoleculeTopOffset((current) =>
            current === nextOffset ? current : nextOffset,
          );
        }
      }

      const isDesktop =
        typeof window.matchMedia !== "function" ||
        window.matchMedia("(min-width: 768px)").matches;
      const availableWidth = contentRight - titleRect.left;
      const overflows = titleRect.width > availableWidth;
      let nextTitleFitPx: number | null = null;
      if (
        !isDesktop &&
        overflows &&
        titleRect.width > 0 &&
        naturalFontSize > 0
      ) {
        const fitted = naturalFontSize * (availableWidth / titleRect.width);
        const fittedFloor = Math.floor(fitted * 4) / 4;
        nextTitleFitPx = Math.max(minFontSize, fittedFloor);
      }
      setTitleFitPx((current) =>
        current === nextTitleFitPx ? current : nextTitleFitPx,
      );
    };
    const scheduleMeasurement = () => {
      if (frameId === null) {
        frameId = window.requestAnimationFrame(measurePlacement);
      }
    };

    measurePlacement();

    let lastWidth = heroElement.getBoundingClientRect().width;
    const resizeObserver =
      typeof ResizeObserver === "undefined"
        ? null
        : new ResizeObserver((entries) => {
            const width = entries[0]?.contentRect.width;
            if (width === undefined || width === lastWidth) return;
            lastWidth = width;
            scheduleMeasurement();
          });
    resizeObserver?.observe(heroElement);

    const rootStyle = document.documentElement.style;
    let textScale = rootStyle.getPropertyValue(TEXT_SIZE_PROPERTY);
    let tracking = rootStyle.getPropertyValue(READER_TRACKING_PROPERTY);
    let leading = rootStyle.getPropertyValue(READER_LEADING_PROPERTY);
    const appearanceObserver =
      typeof MutationObserver === "undefined"
        ? null
        : new MutationObserver((records) => {
            const nextTextScale =
              rootStyle.getPropertyValue(TEXT_SIZE_PROPERTY);
            const nextTracking = rootStyle.getPropertyValue(
              READER_TRACKING_PROPERTY,
            );
            const nextLeading = rootStyle.getPropertyValue(
              READER_LEADING_PROPERTY,
            );
            const typographyChanged =
              nextTextScale !== textScale ||
              nextTracking !== tracking ||
              nextLeading !== leading;
            textScale = nextTextScale;
            tracking = nextTracking;
            leading = nextLeading;
            if (
              typographyChanged ||
              records.some((record) => record.attributeName !== "style")
            ) {
              scheduleMeasurement();
            }
          });
    appearanceObserver?.observe(document.documentElement, {
      attributes: true,
      attributeFilter: [
        "style",
        "data-font",
        "data-reader-leading",
        "data-theme",
        "data-visual-style",
      ],
    });

    window.addEventListener("resize", scheduleMeasurement);
    document.fonts?.addEventListener("loadingdone", scheduleMeasurement);

    let active = true;
    void document.fonts?.ready.then(() => {
      if (active) scheduleMeasurement();
    });

    return () => {
      active = false;
      resizeObserver?.disconnect();
      appearanceObserver?.disconnect();
      window.removeEventListener("resize", scheduleMeasurement);
      document.fonts?.removeEventListener("loadingdone", scheduleMeasurement);
      if (frameId !== null) window.cancelAnimationFrame(frameId);
    };
  }, [heroRef, titleRef, moleculeUrl, moleculeBelowTitle, title]);

  return { moleculeBelowTitle, moleculeTopOffset, titleFitPx };
}

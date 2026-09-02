// Trailing section adornments (source-credit pills, expand toggles) tuck into
// the next section's top padding via `-mb-8`. That overhang lies outside the
// section's border box, and deferred sections (`.theme-offscreen-defer`,
// utilities-theme.css) carry paint containment that clips it. The deferral
// rule encloses the overhang with a matching `padding-bottom: 2rem` and
// cancels it with `margin-bottom: -2rem`; articleSectionLayout.test.ts holds
// the two values together. Change the overhang here and there, or the
// adornments vanish in Chromium.
export const articleSectionAdornmentClassName = "theme-article-section-adornment mt-4 -mb-8";

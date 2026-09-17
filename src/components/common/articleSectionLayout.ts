// Trailing section adornments (source-credit pills, expand toggles) tuck into
// the next section's top padding via `-mb-8`. That overhang lies outside the
// section's border box, and deferred sections (`.theme-offscreen-defer`,
// utilities-theme.css) carry paint containment that clips it. The deferral
// rule encloses the overhang with a matching `padding-bottom: 2rem` and
// cancels it with `margin-bottom: -2rem`. Change the overhang here and there
// together, and verify source-credit pills and expand toggles in Chromium
// with deferred sections; jsdom cannot exercise this clipping behavior.
export const articleSectionAdornmentClassName = "theme-article-section-adornment mt-4 -mb-8";

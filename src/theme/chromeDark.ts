/**
 * Class marking a subtree that keeps the dark palette while the page is in
 * light mode — the dark header banner over a light page. Worn by the two
 * `.app-header` elements; the base token block in `site-colors.css` carries the
 * matching island selector.
 *
 * Its own module because three unrelated layers have to agree on the value: the
 * generated accent stylesheet, the Theme Lab's injected user layer, and the
 * authored island block. A shared constant is what keeps the island selectors
 * they each emit pointing at the same subtree.
 */
export const CHROME_DARK_CLASS = "theme-chrome-dark";

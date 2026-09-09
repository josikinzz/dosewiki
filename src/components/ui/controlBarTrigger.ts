/**
 * Shape of every control in a public index's sticky control bar.
 *
 * From `md` up each control is a menu button that says what it is and what it
 * currently holds: glyph, label, chevron. Below `md` the label and chevron fold
 * away and the glyph is the whole button, because a 344px track holds labelled
 * triggers or a typeable search field, not both, and the search field is the
 * one control whose affordance cannot survive being shrunk to an icon. The
 * names are not lost there: every trigger opens a menu whose rows carry them,
 * which is one safe tap rather than a hover a touch device cannot perform.
 *
 * Site furniture, not a per-feature component: the replications gallery and
 * the experience report index both borrow it, so their bars are the same
 * object at the same height rather than two lookalikes that drifted. Keeping
 * one height is also what keeps a bar to one row, which is what keeps the
 * pinned stack off the reader's first fold.
 */
export const CONTROL_TRIGGER_CLASS =
  "h-10 w-10 shrink-0 justify-center gap-1.5 p-0 [@media(pointer:coarse)]:h-11 [@media(pointer:coarse)]:w-11 md:h-9 md:w-auto md:gap-1 md:px-2.5 lg:gap-1.5 lg:px-3 md:[@media(pointer:coarse)]:h-11 md:[@media(pointer:coarse)]:w-auto";

/** The trigger's own name, carried as text from `md` up. */
export const CONTROL_TRIGGER_LABEL_CLASS =
  "hidden whitespace-nowrap text-sm font-medium md:inline";

/** Standing "this opens" mark, only where the label is there to anchor it. */
export const CONTROL_TRIGGER_CHEVRON_CLASS =
  "theme-text-faint hidden h-3.5 w-3.5 shrink-0 md:block";

/** Menu rows are finger targets at every width; the menus are the touch path. */
export const CONTROL_MENU_ITEM_CLASS = "min-h-11 gap-2 md:min-h-9";

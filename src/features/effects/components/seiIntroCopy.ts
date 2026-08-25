/**
 * Editable prose for the Subjective Effect Index intro.
 *
 * Kept apart from `SEIIntroSection` because the /effects route — a server
 * component — reads these fallbacks to build the props, and the section module
 * itself pulls in `useState`. Importing the component from the server would
 * drag a client-only module across the boundary.
 */
export interface SEIIntroCopy {
  /** Lead paragraph. Carries `{{effectCount}}` and one `**accented**` phrase. */
  lead: string;
  /** Second paragraph of the More Info tab's thesis. */
  method: string;
  /** Third paragraph of the More Info tab's thesis. */
  organisation: string;
}

export const SEI_INTRO_COPY_FALLBACK: SEIIntroCopy = {
  lead: "The **Subjective Effect Index** is a comprehensive catalogue of {{effectCount}} subjective effects that may occur under the influence of psychoactive substances.",
  method:
    "The effects are accompanied by detailed descriptions written in a consistent style that avoids flowery metaphors, using simple and accessible language to serve as a universal terminology for communicating experiences that are difficult to convey.",
  organisation:
    "Effects are organised into categories based on the senses they affect and their behavior, with many broken down into leveling systems, subcomponents, and style variations. Image, video, and audio replications supplement text-based descriptions.",
};

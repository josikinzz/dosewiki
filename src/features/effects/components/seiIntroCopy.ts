export interface SEIIntroCopy {
  lead: string;
  method: string;
  organisation: string;
}

export const SEI_INTRO_COPY_FALLBACK: SEIIntroCopy = {
  lead: "The **Subjective Effect Index** is a comprehensive catalogue of {{effectCount}} subjective effects that may occur under the influence of psychoactive substances.",
  method:
    "The effects are accompanied by detailed descriptions written in a consistent style that avoids flowery metaphors, using simple and accessible language to serve as a universal terminology for communicating experiences that are difficult to convey.",
  organisation:
    "Effects are organised into categories based on the senses they affect and their behavior, with many broken down into leveling systems, subcomponents, and style variations. Image, video, and audio replications supplement text-based descriptions.",
};

/** Baseline corrections supplied in the translation-workbench request.
 * These are build seeds, not records of human review in the workbench. */
export const UI_MESSAGE_SEEDS: Readonly<Record<string, Readonly<Record<string, string>>>> = {
  "zh-Hans": {
    "appearance.light": "浅色",
    "appearance.dark": "深色",
    "gallery.replications": "体验再现",
    "gallery.replication": "体验再现",
    "article.machineTranslationNotice": "本页由机器翻译，以[英文原文]({{englishUrl}})为准。尚未翻译的段落保留英文。",
  },
  ru: {
    "article.machineTranslationNotice": "Эта страница переведена автоматически, приоритет имеет [английский оригинал]({{englishUrl}}). Ещё не переведённые абзацы остаются на английском.",
  },
};

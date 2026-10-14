import dynamic from "next/dynamic";

/** Workbench panels load on first visit and retain their state once mounted. */
export const ReviewInbox = dynamic(() => import("./ReviewInbox").then((module) => module.ReviewInbox));
export const ArticlesView = dynamic(() => import("./ArticlesView").then((module) => module.ArticlesView));
export const ReaderSuggestions = dynamic(() => import("./ReaderSuggestions").then((module) => module.ReaderSuggestions));
export const StyleGuidePanel = dynamic(() => import("./StyleGuidePanel").then((module) => module.StyleGuidePanel));
export const UiTranslationWorkbench = dynamic(() => import("./UiTranslationWorkbench").then((module) => module.UiTranslationWorkbench));

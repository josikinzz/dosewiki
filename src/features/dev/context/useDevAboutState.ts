import { useCallback, useEffect, useRef, useState } from "react";
import { normalizeFounderKeys } from "@/data/content/about";

type AboutConfigSource = {
  aboutMarkdown?: string | null;
  aboutSubtitle?: string | null;
  founderProfileKeys?: string[] | null;
} | undefined;

export function useDevAboutState(aboutConfig: AboutConfigSource) {
  const originalAboutMarkdownRef = useRef("");
  const originalAboutSubtitleRef = useRef("");
  const originalAboutFounderKeysRef = useRef<string[]>([]);
  const [aboutMarkdown, setAboutMarkdown] = useState("");
  const [aboutSubtitle, setAboutSubtitle] = useState("");
  const [aboutFounderKeys, setAboutFounderKeys] = useState<string[]>([]);

  useEffect(() => {
    if (!aboutConfig) {
      return;
    }

    const markdown = aboutConfig.aboutMarkdown ?? "";
    const subtitle = aboutConfig.aboutSubtitle ?? "";
    const founderKeys = aboutConfig.founderProfileKeys ?? [];

    originalAboutMarkdownRef.current = markdown;
    originalAboutSubtitleRef.current = subtitle;
    originalAboutFounderKeysRef.current = [...founderKeys];

    setAboutMarkdown(markdown);
    setAboutSubtitle(subtitle);
    setAboutFounderKeys([...founderKeys]);
  }, [aboutConfig]);

  const replaceAboutMarkdown = useCallback((nextMarkdown: string) => {
    setAboutMarkdown(nextMarkdown);
  }, []);

  const resetAboutMarkdown = useCallback(() => {
    setAboutMarkdown(originalAboutMarkdownRef.current);
  }, []);

  const getOriginalAboutMarkdown = useCallback(() => originalAboutMarkdownRef.current, []);

  const replaceAboutSubtitle = useCallback((nextSubtitle: string) => {
    setAboutSubtitle(nextSubtitle);
  }, []);

  const resetAboutSubtitle = useCallback(() => {
    setAboutSubtitle(originalAboutSubtitleRef.current);
  }, []);

  const getOriginalAboutSubtitle = useCallback(() => originalAboutSubtitleRef.current, []);

  const replaceAboutFounderKeys = useCallback((nextKeys: string[]) => {
    setAboutFounderKeys(normalizeFounderKeys(nextKeys));
  }, []);

  const resetAboutFounderKeys = useCallback(() => {
    setAboutFounderKeys([...originalAboutFounderKeysRef.current]);
  }, []);

  const getOriginalAboutFounderKeys = useCallback(() => [...originalAboutFounderKeysRef.current], []);

  const resetAboutContent = useCallback(() => {
    setAboutMarkdown(originalAboutMarkdownRef.current);
    setAboutSubtitle(originalAboutSubtitleRef.current);
    setAboutFounderKeys([...originalAboutFounderKeysRef.current]);
  }, []);

  return {
    aboutFounderKeys,
    aboutMarkdown,
    aboutSubtitle,
    getOriginalAboutFounderKeys,
    getOriginalAboutMarkdown,
    getOriginalAboutSubtitle,
    replaceAboutFounderKeys,
    replaceAboutMarkdown,
    replaceAboutSubtitle,
    resetAboutContent,
    resetAboutFounderKeys,
    resetAboutMarkdown,
    resetAboutSubtitle,
  };
}

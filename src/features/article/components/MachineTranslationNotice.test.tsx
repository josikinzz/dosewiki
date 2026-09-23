import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { MachineTranslationNotice } from "./MachineTranslationNotice";

const ENGLISH_URL = "https://dose.wiki/lsd";
const HAN = /\p{Script=Han}/u;

describe("MachineTranslationNotice", () => {
  it("keeps the Simplified Chinese notice exactly as it rendered before", () => {
    const { container } = render(<MachineTranslationNotice locale="zh-Hans" englishUrl={ENGLISH_URL} />);
    expect(container.innerHTML).toBe(
      '<p class="theme-text-secondary mx-auto flex w-fit items-center gap-2 text-center text-sm text-balance"><span>本页由机器翻译，以<a href="https://dose.wiki/lsd" lang="en" class="underline decoration-dotted underline-offset-2 hover:decoration-solid">英文原文</a>为准。尚未翻译的段落保留英文。</span></p>',
    );
  });

  it("speaks Russian on the Russian mirror, with no Chinese characters", () => {
    const { container } = render(<MachineTranslationNotice locale="ru" englishUrl={ENGLISH_URL} />);
    const text = container.textContent ?? "";
    expect(text).not.toMatch(HAN);
    expect(text).toMatch(/\p{Script=Cyrillic}/u);
    expect(screen.getByRole("link")).toHaveAttribute("href", ENGLISH_URL);
  });

  it("falls back to English for a locale without its own copy", () => {
    const { container } = render(<MachineTranslationNotice locale="fr" englishUrl={ENGLISH_URL} />);
    const text = container.textContent ?? "";
    expect(text).not.toMatch(HAN);
    expect(text).not.toMatch(/\p{Script=Cyrillic}/u);
    expect(text).toMatch(/machine translated/i);
    expect(screen.getByRole("link", { name: "English original" })).toHaveAttribute("href", ENGLISH_URL);
  });
});

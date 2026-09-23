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

  it("renders the quiet reviewed line with the latest approval date when every paragraph is approved", () => {
    const review = { reviewed: 12, total: 12, latestApprovedAt: Date.UTC(2026, 8, 21, 23, 30) };
    const { container } = render(<MachineTranslationNotice locale="zh-Hans" englishUrl={ENGLISH_URL} review={review} />);
    const text = container.textContent ?? "";
    expect(text).toContain("人工审校");
    expect(text).toContain("2026年9月21日");
    expect(text).not.toContain("机器翻译");
    expect(text).not.toMatch(/12/);
    expect(screen.getByRole("link", { name: "英文原文" })).toHaveAttribute("href", ENGLISH_URL);
  });

  it("keeps the notice and adds the count when one paragraph is still machine translated", () => {
    const review = { reviewed: 11, total: 12, latestApprovedAt: Date.UTC(2026, 8, 21) };
    const { container } = render(<MachineTranslationNotice locale="zh-Hans" englishUrl={ENGLISH_URL} review={review} />);
    const text = container.textContent ?? "";
    expect(text).toContain("本页由机器翻译");
    expect(text).toMatch(/12\D+11/);
    expect(text).not.toContain("2026");
    expect(screen.getByRole("link", { name: "英文原文" })).toHaveAttribute("href", ENGLISH_URL);
  });

  it("renders the plain notice when no paragraph is reviewed", () => {
    const plain = render(<MachineTranslationNotice locale="zh-Hans" englishUrl={ENGLISH_URL} />).container.innerHTML;
    const { container } = render(
      <MachineTranslationNotice locale="zh-Hans" englishUrl={ENGLISH_URL} review={{ reviewed: 0, total: 12, latestApprovedAt: null }} />,
    );
    expect(container.innerHTML).toBe(plain);
  });

  it("speaks Russian in both review states", () => {
    const reviewed = render(
      <MachineTranslationNotice locale="ru" englishUrl={ENGLISH_URL} review={{ reviewed: 3, total: 3, latestApprovedAt: Date.UTC(2026, 8, 21) }} />,
    ).container.textContent ?? "";
    const partial = render(
      <MachineTranslationNotice locale="ru" englishUrl={ENGLISH_URL} review={{ reviewed: 2, total: 3, latestApprovedAt: Date.UTC(2026, 8, 21) }} />,
    ).container.textContent ?? "";
    for (const text of [reviewed, partial]) {
      expect(text).not.toMatch(HAN);
      expect(text).toMatch(/\p{Script=Cyrillic}/u);
    }
    expect(reviewed).toContain("2026");
    expect(partial).toMatch(/2\D+3/);
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

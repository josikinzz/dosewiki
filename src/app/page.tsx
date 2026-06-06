import type { Metadata } from "next";
import Link from "next/link";
import logoAssetImport from "../assets/dosewiki-logo.svg?inline";
import { Icon, type IconName } from "@/components/common/Icon";
import { HomeSearch } from "./_components/HomeSearch";

export const metadata: Metadata = {
  title: "dose.wiki",
  description:
    "A truly open encyclopedic database for the study of psychoactive substances and altered states of consciousness.",
};

const quickLinks: Array<{
  href: string;
  label: string;
  icon: IconName;
}> = [
  {
    href: "/substances",
    label: "Substances",
    icon: "lucide:flask-conical",
  },
  {
    href: "/effects",
    label: "Effects",
    icon: "lucide:brain",
  },
  {
    href: "/reports",
    label: "Reports",
    icon: "lucide:file-text",
  },
  {
    href: "/about",
    label: "About",
    icon: "lucide:info",
  },
];

const logoAsset = logoAssetImport as string | { src: string };
const logoSource =
  typeof logoAsset === "string"
    ? logoAsset.trim().startsWith("<svg")
      ? `data:image/svg+xml;utf8,${encodeURIComponent(logoAsset)}`
      : logoAsset
    : logoAsset.src;

export default function HomePage() {
  return (
    <main
      id="main-content"
      tabIndex={-1}
      className="theme-page-shell relative isolate flex min-h-screen items-center justify-center overflow-hidden px-4 py-16 text-center focus:outline-none supports-[height:100svh]:min-h-[100svh] supports-[height:100dvh]:min-h-[100dvh] sm:px-6 lg:px-8"
    >
      <div
        aria-hidden="true"
        className="theme-home-ambient absolute inset-0 -z-20"
      />
      <div
        aria-hidden="true"
        className="theme-home-starfield absolute inset-0 -z-10 opacity-[0.18]"
      />

      <section className="flex w-full max-w-5xl flex-col items-center">
        <div className="flex flex-col items-center justify-center gap-5 sm:flex-row sm:gap-7">
          <img
            src={logoSource}
            alt="dose.wiki molecule logo"
            width={204}
            height={195}
            className="theme-home-logo h-36 w-36 sm:h-44 sm:w-44 md:h-52 md:w-52"
            draggable={false}
          />
          <h1 className="theme-text-primary font-display text-[clamp(3.4rem,8vw,6.75rem)] font-semibold leading-none tracking-normal">
            dose<span className="theme-accent-heading">.wiki</span>
          </h1>
        </div>

        <p className="theme-text-secondary mt-5 max-w-2xl text-balance text-base leading-snug sm:text-lg md:text-xl">
          A truly open encyclopedic database for the study of psychoactive substances and altered states of consciousness.
        </p>

        <div className="mt-10 w-full max-w-4xl">
          <HomeSearch />
        </div>

        <nav
          aria-label="Primary site sections"
          className="mt-12 grid grid-cols-2 gap-x-8 gap-y-7 sm:flex sm:flex-wrap sm:justify-center sm:gap-12"
        >
          {quickLinks.map((item) => (
            <Link
              key={item.href}
              href={item.href}
              className="theme-home-nav-link group flex w-28 flex-col items-center gap-3 transition-colors duration-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-4 sm:w-32"
            >
              <span className="theme-home-nav-icon relative flex h-20 w-20 items-center justify-center rounded-full border transition-[border-color,background-color,box-shadow,transform] duration-200 group-hover:-translate-y-1 sm:h-24 sm:w-24">
                <Icon icon={item.icon} size={38} className="transition-transform duration-200 group-hover:scale-105" />
              </span>
              <span className="font-display text-xl font-semibold leading-none tracking-normal">
                {item.label}
              </span>
            </Link>
          ))}
        </nav>
      </section>
    </main>
  );
}

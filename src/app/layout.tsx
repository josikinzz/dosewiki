import type { Metadata } from "next";
import { AppProviders } from "./providers";
import { NextHeader } from "./_components/NextHeader";
import { NextFooter } from "./_components/NextFooter";
import "../styles.css";

const themeBootstrap = `(() => {
  const STORAGE_KEY = "dosewiki-theme";
  const THEMES = { dark: "#0f0a1f", light: "#f6efff" };

  try {
    const storedTheme = window.localStorage.getItem(STORAGE_KEY);
    const theme = storedTheme === "light" ? "light" : "dark";
    document.documentElement.dataset.theme = theme;
    document.documentElement.style.colorScheme = theme;

    const meta = document.getElementById("theme-color-meta");
    if (meta) {
      meta.setAttribute("content", THEMES[theme]);
    }
  } catch {
    document.documentElement.dataset.theme = "dark";
    document.documentElement.style.colorScheme = "dark";
  }
})();`;

export const metadata: Metadata = {
  title: "dose.wiki - Substance Information Database",
  description:
    "dose.wiki is a harm reduction database providing dosage, duration, effects, and safety information for psychoactive substances.",
  keywords: [
    "harm reduction",
    "drug information",
    "dosage",
    "psychoactive substances",
    "drug safety",
    "effects",
    "interactions",
  ],
  authors: [{ name: "dose.wiki Contributors" }],
  metadataBase: new URL("https://dose.wiki"),
  alternates: {
    canonical: "/",
  },
  openGraph: {
    type: "website",
    siteName: "dose.wiki",
    title: "dose.wiki - Substance Information Database",
    description:
      "Harm reduction database providing dosage, duration, effects, and safety information for psychoactive substances.",
    url: "https://dose.wiki",
    images: [
      {
        url: "/icon-512.png",
        width: 512,
        height: 512,
        alt: "dose.wiki logo",
      },
    ],
  },
  twitter: {
    card: "summary",
    title: "dose.wiki - Substance Information Database",
    description: "Harm reduction database for psychoactive substances.",
    images: ["/icon-512.png"],
  },
  icons: {
    icon: "/favicon.svg",
    apple: "/apple-touch-icon.png",
  },
  manifest: "/manifest.webmanifest",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        <meta id="theme-color-meta" name="theme-color" content="#0f0a1f" />
        <script dangerouslySetInnerHTML={{ __html: themeBootstrap }} />
      </head>
      <body className="app-container theme-page-shell relative selection:bg-fuchsia-500/30">
        <AppProviders>
          <a
            href="#main-content"
            className="theme-skip-link sr-only focus:not-sr-only focus:fixed focus:left-4 focus:top-4 focus:z-50 focus:rounded-lg focus:px-4 focus:py-2 focus:outline-none focus:ring-2 focus:ring-fuchsia-400 focus:ring-offset-2"
          >
            Skip to main content
          </a>
          <div className="pointer-events-none absolute inset-0 -z-10 overflow-hidden">
            <div className="absolute -left-20 -top-20 h-72 w-72 rounded-full bg-fuchsia-600/10 blur-2xl" />
            <div className="absolute top-40 -right-20 h-80 w-80 rounded-full bg-violet-600/10 blur-2xl" />
          </div>
          <NextHeader />
          <div className="app-content relative">
            {children}
            <NextFooter />
          </div>
        </AppProviders>
      </body>
    </html>
  );
}

import localFont from "next/font/local";

export const siteFont = localFont({
  variable: "--font-display",
  display: "swap",
  src: [
    {
      path: "../../../public/fonts/titillium-web/titillium-web-400-normal-latin.woff2",
      weight: "400",
      style: "normal",
    },
    {
      path: "../../../public/fonts/titillium-web/titillium-web-400-italic-latin.woff2",
      weight: "400",
      style: "italic",
    },
    {
      path: "../../../public/fonts/titillium-web/titillium-web-600-normal-latin.woff2",
      weight: "600",
      style: "normal",
    },
    {
      path: "../../../public/fonts/titillium-web/titillium-web-700-normal-latin.woff2",
      weight: "700",
      style: "normal",
    },
  ],
});

export const proFont = siteFont;

export const bodyFont = null;
export const bodyItalicFace = null;

export const dyslexicFont = null;

import localFont from "next/font/local";

export const siteFont = localFont({
  variable: "--font-display",
  display: "swap",
  src: [
    {
      path: "../../../public/fonts/Blinker-Regular.woff2",
      weight: "400",
      style: "normal",
    },
    {
      path: "../../../public/fonts/Blinker-SemiBold.woff2",
      weight: "600",
      style: "normal",
    },
  ],
});

export const bodyFont = localFont({
  variable: "--font-body",
  display: "swap",
  src: [
    {
      path: "../../../public/fonts/inter/inter-variable-normal-latin.woff2",
      weight: "100 900",
      style: "normal",
    },
  ],
});

export const bodyItalicFace = `@font-face{font-family:${bodyFont.style.fontFamily.split(",")[0]};src:url("/fonts/inter/inter-variable-italic-latin.woff2") format("woff2");font-style:italic;font-weight:100 900;font-display:swap;}`;

export const proFont = localFont({
  variable: "--font-pro",
  display: "swap",
  preload: false,
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

export const dyslexicFont = localFont({
  variable: "--font-dyslexic",
  display: "swap",
  preload: false,
  src: [
    {
      path: "../../../public/fonts/lexend/lexend-variable-normal-latin.woff2",
      weight: "100 900",
      style: "normal",
    },
  ],
});

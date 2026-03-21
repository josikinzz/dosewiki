import localFont from "next/font/local";

export const blinker = localFont({
  variable: "--font-display",
  display: "swap",
  src: [
    {
      path: "../../public/fonts/Blinker-Regular.ttf",
      weight: "400",
      style: "normal",
    },
    {
      path: "../../public/fonts/Blinker-SemiBold.ttf",
      weight: "600",
      style: "normal",
    },
  ],
});

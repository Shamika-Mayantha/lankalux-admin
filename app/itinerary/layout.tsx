import type { Metadata } from "next";
import localFont from "next/font/local";
import { BRAND } from "@/config/brand";

// The lankalux.com faces, so a shared itinerary reads like the website.
const gambetta = localFont({
  src: [
    { path: "./fonts/Gambetta-Variable.woff2", style: "normal", weight: "300 700" },
    { path: "./fonts/Gambetta-VariableItalic.woff2", style: "italic", weight: "300 700" },
  ],
  variable: "--font-gambetta",
  display: "swap",
  fallback: ["Times New Roman", "serif"],
});

const switzer = localFont({
  src: [{ path: "./fonts/Switzer-Variable.woff2", style: "normal", weight: "100 900" }],
  variable: "--font-switzer",
  display: "swap",
  fallback: ["system-ui", "Arial", "sans-serif"],
});

export const metadata: Metadata = {
  title: "LankaLux Journey",
  description: "Your personalized Sri Lanka itinerary",
  icons: {
    icon: [
      { url: BRAND.shareImageSrc, type: 'image/png' },
      { url: '/favicon.ico', sizes: 'any' },
    ],
    apple: BRAND.shareImageSrc,
  },
  appleWebApp: {
    capable: true,
    statusBarStyle: 'default',
    title: 'LankaLux Journey',
  },
};

export default function ItineraryLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return <div className={`${gambetta.variable} ${switzer.variable}`}>{children}</div>;
}

import type { Metadata } from "next";
import { BRAND } from "@/config/brand";

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
  return <>{children}</>;
}

import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "LankaLux Journey",
  description: "Your personalized Sri Lanka itinerary",
  icons: {
    icon: [
      { url: '/favicon.ico', sizes: 'any' },
      { url: '/favicon.png', type: 'image/png' },
    ],
    apple: '/favicon.png',
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

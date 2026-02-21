import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "LankaLux Journey",
  description: "Your personalized Sri Lanka itinerary",
};

export default function ItineraryLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return <>{children}</>;
}

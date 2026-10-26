import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  serverExternalPackages: ['@react-pdf/renderer'],
  images: {
    // Day photos on shared itineraries are resized for the screen instead of sent at full size.
    // Story photos ask for 90 so big hero frames stay crisp; 75 is the default elsewhere.
    qualities: [75, 90],
    remotePatterns: [{ protocol: 'https', hostname: 'evmsntnprujqfejkmipq.supabase.co', pathname: '/storage/v1/object/public/**' }],
  },
};

export default nextConfig;

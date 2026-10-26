import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  serverExternalPackages: ['@react-pdf/renderer'],
  images: {
    // Day photos on shared itineraries are resized for the screen instead of sent at full size.
    remotePatterns: [{ protocol: 'https', hostname: 'evmsntnprujqfejkmipq.supabase.co', pathname: '/storage/v1/object/public/**' }],
  },
};

export default nextConfig;

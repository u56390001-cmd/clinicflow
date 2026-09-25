import path from "node:path";
import type { NextConfig } from "next";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;

const nextConfig: NextConfig = {
  // Anchor file tracing to this workspace. Without this, Next.js may infer the
  // workspace root from a stray lockfile in a parent directory (e.g. the user
  // home folder) and mis-trace build output.
  outputFileTracingRoot: path.join(__dirname),
  // Next 15 treats prefetched data for dynamic (server-rendered) routes as
  // instantly stale (default 0s), so clicking a sidebar tab re-fetches
  // everything and the user waits out the full query chain. 30s of freshness
  // means a link that was prefetched on hover opens its content immediately,
  // then revalidates in the background.
  experimental: {
    staleTimes: {
      dynamic: 30,
    },
  },
  images: supabaseUrl
    ? {
        remotePatterns: [
          {
            protocol: "https",
            hostname: new URL(supabaseUrl).hostname,
            pathname: "/storage/v1/object/public/**",
          },
        ],
      }
    : undefined,
};

export default nextConfig;

import path from "node:path";
import type { NextConfig } from "next";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;

const nextConfig: NextConfig = {
  // Anchor file tracing to this workspace. Without this, Next.js may infer the
  // workspace root from a stray lockfile in a parent directory (e.g. the user
  // home folder) and mis-trace build output.
  outputFileTracingRoot: path.join(__dirname),
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

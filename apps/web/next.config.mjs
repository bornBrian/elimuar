/** The browser only ever talks to this Next.js server. */
const API_ORIGIN = process.env.API_ORIGIN ?? "http://localhost:4000";

/** @type {import("next").NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  /* Where the compiled output goes. */
  distDir: process.env.NEXT_DIST_DIR ?? ".next",
  // @elimuar/shared ships TypeScript sources, so Next must compile it itself.
  transpilePackages: ["@elimuar/shared"],
  webpack: (config) => {
    // The shared package uses Node ESM-style "./x.js" specifiers that point at
    // TypeScript sources; teach webpack to try the .ts files first.
    config.resolve.extensionAlias = {
      ...(config.resolve.extensionAlias ?? {}),
      ".js": [".ts", ".tsx", ".js"],
      ".jsx": [".tsx", ".jsx"],
    };
    return config;
  },
  async rewrites() {
    return [
      { source: "/api/:path*", destination: `${API_ORIGIN}/api/:path*` },
      // Uploaded AR bundles and the platform logo are served by the API.
      { source: "/storage/:path*", destination: `${API_ORIGIN}/storage/:path*` },
    ];
  },
  async headers() {
    return [
      {
        source: "/(.*)",
        headers: [
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
          { key: "X-Frame-Options", value: "DENY" },
        ],
      },
    ];
  },
};

export default nextConfig;

/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  experimental: {
    // keep native sqlite module out of the server bundle
    serverComponentsExternalPackages: ["better-sqlite3"],
  },
  images: { unoptimized: true },
};

export default nextConfig;

import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  serverExternalPackages: ["pdfkit"],
  allowedDevOrigins: ["careerpilot"],
};

export default nextConfig;

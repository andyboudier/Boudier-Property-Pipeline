/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  images: { remotePatterns: [{ protocol: "https", hostname: "boudierproperty.co.uk" }] },
  // Keep the PDF parser (pdf.js) and the PDF renderer (headless Chromium) out
  // of the bundle; load them at runtime.
  experimental: { serverComponentsExternalPackages: ["unpdf", "@anthropic-ai/sdk", "@sparticuz/chromium", "puppeteer-core"] },
};
export default nextConfig;

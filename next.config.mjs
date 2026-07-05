/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  images: { remotePatterns: [{ protocol: "https", hostname: "boudierproperty.co.uk" }] },
  // Keep the PDF parser (pdf.js) and the PDF renderer (headless Chromium) out
  // of the bundle; load them at runtime.
  experimental: {
    serverComponentsExternalPackages: ["unpdf", "@anthropic-ai/sdk", "@sparticuz/chromium", "puppeteer-core"],
    // Vercel's file tracing misses Chromium's brotli-packed binaries (they're
    // loaded at runtime, not imported) — ship them with the PDF function.
    outputFileTracingIncludes: {
      "/api/pdf": ["./node_modules/@sparticuz/chromium/bin/**"],
    },
  },
};
export default nextConfig;

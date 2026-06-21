/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  images: { remotePatterns: [{ protocol: "https", hostname: "boudierproperty.co.uk" }] },
  // Keep the PDF parser (pdf.js) out of the bundle; load it at runtime.
  experimental: { serverComponentsExternalPackages: ["unpdf"] },
};
export default nextConfig;

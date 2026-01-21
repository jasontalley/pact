/** @type {import('next').NextConfig} */
const nextConfig = {
  // Enable React strict mode for better development experience
  reactStrictMode: true,

  // Output standalone for Docker optimization
  output: 'standalone',

  // Enable React Compiler for automatic memoization (stable in Next.js 16)
  reactCompiler: true,

  // Configure allowed image domains if needed
  images: {
    remotePatterns: [],
  },

  // Experimental features
  experimental: {
    // Enable the new Partial Prerendering (PPR) if desired
    // ppr: true,
  },
};

module.exports = nextConfig;

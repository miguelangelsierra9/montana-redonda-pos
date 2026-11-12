const isStaticExport = process.env.STATIC_EXPORT === 'true';

/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  transpilePackages: ['@mrp/shared'],
  ...(isStaticExport
    ? {
        output: 'export',
        basePath: process.env.BASE_PATH || '/montana',
        assetPrefix: process.env.BASE_PATH || '/montana',
        trailingSlash: true,
      }
    : {
        async rewrites() {
          const backendOrigin = process.env.BACKEND_INTERNAL_URL || 'http://localhost:4000';
          return [
            {
              source: '/api/:path*',
              destination: `${backendOrigin}/api/:path*`,
            },
          ];
        },
      }),
  images: {
    unoptimized: true,
  },
};

module.exports = nextConfig;

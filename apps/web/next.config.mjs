/** @type {import('next').NextConfig} */
const nextConfig = {
  transpilePackages: ['@nexus/shared', '@nexus/db'],
  serverExternalPackages: ['@prisma/client', 'bullmq', 'ioredis', 'pino'],
  poweredByHeader: false,
  async headers() {
    return [
      {
        source: '/(.*)',
        headers: [
          { key: 'X-Frame-Options', value: 'DENY' },
          { key: 'X-Content-Type-Options', value: 'nosniff' },
          { key: 'Referrer-Policy', value: 'same-origin' },
        ],
      },
    ];
  },
};
export default nextConfig;

import type { NextConfig } from 'next';

const config: NextConfig = {
  serverExternalPackages: ['@electric-sql/pglite', 'pg'],
  poweredByHeader: false,
  // Kvitteringer fra mobilen er ofte over 1 MB. Vercel tar imot opptil 4,5 MB per forespørsel.
  experimental: { serverActions: { bodySizeLimit: '4mb' } },
};

export default config;

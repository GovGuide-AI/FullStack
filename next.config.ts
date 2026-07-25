import createNextIntlPlugin from 'next-intl/plugin';
import type { NextConfig } from 'next';

const withNextIntl = createNextIntlPlugin('./i18n/request.ts');

const nextConfig: NextConfig = {
  // Fail the production build on a type error rather than shipping one.
  // Next 16 dropped the `eslint` build hook along with `next lint`; linting runs
  // as its own step via `npm run lint`.
  typescript: { ignoreBuildErrors: false },
};

export default withNextIntl(nextConfig);

/** @type {import('next').NextConfig} */
const nextConfig = {
  experimental: {
    serverComponentsExternalPackages: ['pdf-parse'],
  },
  webpack: (config, { isServer }) => {
    // pdf-parse ships an internal debug branch that tries to read a test file;
    // ignoring it lets the bundler produce a clean server build.
    if (isServer) {
      config.resolve.alias = {
        ...(config.resolve.alias || {}),
      };
    }
    return config;
  },
};

module.exports = nextConfig;

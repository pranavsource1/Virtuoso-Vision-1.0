/** @type {import('next').NextConfig} */

const nextConfig = {
  reactStrictMode: false,
  swcMinify: true,
  images: {
    unoptimized: true,
  },
  webpack: (config, { isServer }) => {
    config.experiments = {
      ...config.experiments,
      asyncWebAssembly: true,
      layers: true,
    };

    config.module.rules.push({
      test: /\.wasm$/,
      type: 'webassembly/async',
    });

    config.output.webassemblyModuleFilename = '../static/wasm/[modulehash].wasm';

    // Exclude rapier from server builds
    if (isServer) {
      config.externals.push({
        'rapier': 'rapier',
        '@react-three/rapier': '@react-three/rapier',
      });
    }

    return config;
  },
  async rewrites() {
    return [
      {
        source: '/media/:path*',
        destination: `${process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000'}/media/:path*`,
      },
    ];
  },
};

module.exports = nextConfig;

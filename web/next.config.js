/** @type {import('next').NextConfig} */
const nextConfig = {
  async rewrites() {
    const managerUrl = process.env.MANAGER_API_URL ?? 'http://localhost:3001'
    return [
      {
        source: '/api/:path*',
        destination: `${managerUrl}/api/:path*`,
      },
    ]
  },
}

module.exports = nextConfig

/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  poweredByHeader: false,
  // The API, the Dograh proxy and webhooks are served by ../server.js, which hosts this app.
  // Old static page links keep working.
  async redirects() {
    return [
      { source: '/book.html', destination: '/book', permanent: true },
      { source: '/apply.html', destination: '/', permanent: true },
      { source: '/dashboard.html', destination: '/dashboard', permanent: true },
      { source: '/engine.html', destination: '/dashboard/engine', permanent: true },
    ];
  },
};
export default nextConfig;

/** @type {import('next').NextConfig} */
const nextConfig = {
  // Mapbox + react-map-gl need transpilation so webpack resolves real constructors (avoids
  // "Object is not a constructor" when dynamic import('mapbox-gl') returns a bad shape).
  transpilePackages: ["mapbox-gl", "react-map-gl", "@vis.gl/react-mapbox"],
  images: {
    remotePatterns: [
      { protocol: "https", hostname: "api.mapbox.com", pathname: "/**" },
      { protocol: "https", hostname: "*.supabase.co", pathname: "/**" },
    ],
  },
};

export default nextConfig;

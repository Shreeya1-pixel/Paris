/** @type {import('next').NextConfig} */
const nextConfig = {
  // Mapbox + react-map-gl need transpilation so webpack resolves real constructors (avoids
  // "Object is not a constructor" when dynamic import('mapbox-gl') returns a bad shape).
  transpilePackages: ["mapbox-gl", "react-map-gl", "@vis.gl/react-mapbox"],
  images: {
    remotePatterns: [
      { protocol: "https", hostname: "api.mapbox.com", pathname: "/**" },
      { protocol: "https", hostname: "*.supabase.co", pathname: "/**" },
      { protocol: "https", hostname: "images.unsplash.com", pathname: "/**" },
      { protocol: "https", hostname: "fastly.picsum.photos", pathname: "/**" },
      { protocol: "https", hostname: "picsum.photos", pathname: "/**" },
    ],
  },
};

export default nextConfig;

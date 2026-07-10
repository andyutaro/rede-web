import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  async redirects() {
    // Article棚はNotesへ改名(2026-07-10)。旧URLを永続リダイレクトで受ける
    return [
      { source: "/article", destination: "/notes", permanent: true },
      { source: "/article/:id", destination: "/notes/:id", permanent: true },
    ];
  },
};

export default nextConfig;

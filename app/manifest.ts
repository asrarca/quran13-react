import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Quran13",
    short_name: "Quran13",
    description: "13-line Quran reader PWA",
    start_url: "/",
    display: "standalone",
    background_color: "#ffffff",
    theme_color: "#ffffff",
    orientation: "portrait",
    icons: [
      {
        src: "/quran13-logo.jpg",
        sizes: "any",
        type: "image/jpeg",
      },
    ],
  };
}

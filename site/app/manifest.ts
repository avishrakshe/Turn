import type { MetadataRoute } from "next";
import { DESCRIPTION } from "@/lib/site";

// Makes Turn installable: "Add to Home Screen" opens straight into the app, full screen.
export default function manifest(): MetadataRoute.Manifest {
  return {
    id: "/app",
    name: "Turn: savings circles",
    short_name: "Turn",
    description: DESCRIPTION,
    start_url: "/app?source=pwa",
    scope: "/",
    display: "standalone",
    orientation: "portrait",
    background_color: "#fbf6ee",
    theme_color: "#fbf6ee",
    categories: ["finance", "lifestyle"],
    icons: [
      { src: "/icons/icon-192.png", sizes: "192x192", type: "image/png", purpose: "any" },
      { src: "/icons/icon-512.png", sizes: "512x512", type: "image/png", purpose: "any" },
      { src: "/icons/maskable-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
    ],
    shortcuts: [
      { name: "Start a circle", url: "/app/create?source=pwa", icons: [{ src: "/icons/icon-192.png", sizes: "192x192" }] },
      { name: "Turn Score", url: "/app/score?source=pwa", icons: [{ src: "/icons/icon-192.png", sizes: "192x192" }] },
    ],
  };
}

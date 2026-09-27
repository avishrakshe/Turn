import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Turn — Save together. Take turns.",
    short_name: "Turn",
    description: "Your family savings committee, without the notebook.",
    start_url: "/home",
    display: "standalone",
    background_color: "#fbf7f1",
    theme_color: "#17594a",
    icons: [{ src: "/icon.svg", sizes: "any", type: "image/svg+xml", purpose: "any" }],
  };
}

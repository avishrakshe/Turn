import createMDX from "@next/mdx";
import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  reactStrictMode: true,
  poweredByHeader: false,
};

// Plugins are passed by name so Turbopack can run them; options must be plain JSON.
const withMDX = createMDX({
  options: {
    remarkPlugins: ["remark-gfm"],
    rehypePlugins: [
      "rehype-slug",
      ["rehype-pretty-code", { theme: { light: "github-light", dark: "github-dark-dimmed" }, keepBackground: false, defaultLang: "plaintext" }],
    ],
  },
});

export default withMDX(nextConfig);

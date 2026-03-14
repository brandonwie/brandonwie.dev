import { sveltekit } from "@sveltejs/kit/vite";
import { defineConfig } from "vite";
import tailwindcss from "@tailwindcss/vite";
import { paraglideVitePlugin } from "@inlang/paraglide-js";

export default defineConfig({
  plugins: [
    tailwindcss(),
    sveltekit(),
    paraglideVitePlugin({
      project: "./project.inlang",
      outdir: "./src/lib/paraglide",
      strategy: ["url", "cookie", "baseLocale"],
      urlPatterns: [
        // English routes (default, no prefix)
        {
          pattern: "/",
          localized: [
            ["en", "/"],
            ["ko", "/ko"],
          ],
        },
        {
          pattern: "/posts",
          localized: [
            ["en", "/posts"],
            ["ko", "/ko/posts"],
          ],
        },
        {
          pattern: "/posts/:slug",
          localized: [
            ["en", "/posts/:slug"],
            ["ko", "/ko/posts/:slug"],
          ],
        },
        // Catch-all for other routes
        {
          pattern: "/:path(.*)?",
          localized: [
            ["en", "/:path(.*)?"],
            ["ko", "/ko/:path(.*)?"],
          ],
        },
      ],
    }),
  ],
  server: {
    port: 5173,
    strictPort: false,
  },
  preview: {
    port: 4173,
  },
});

import path from "node:path";

import { defineConfig } from "vite";

export default defineConfig({
  build: {
    sourcemap: false,
    lib: {
      entry: {
        index: path.resolve(__dirname, "src/index.ts"),
        vercel: path.resolve(__dirname, "src/vercel.ts"),
        langchain: path.resolve(__dirname, "src/langchain.ts"),
      },
    },
    rollupOptions: {
      output: [
        {
          format: "es",
          dir: "dist",
          entryFileNames: "[name].js",
          chunkFileNames: "[name].js",
        },
        {
          format: "commonjs",
          dir: "dist",
          entryFileNames: "[name].cjs",
          chunkFileNames: "[name].cjs",
        },
      ],
      external: [
        /^viem/,
        /^@langchain/,
        "ai",
        "zod",
        "zod-to-json-schema",
      ],
    },
  },
});

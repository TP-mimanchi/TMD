import { defineConfig } from "vite";

export default defineConfig({
  base: "./",
  clearScreen: false,
  envPrefix: ["VITE_", "TAURI_ENV_"],
  server: {
    host: "127.0.0.1",
    port: 1420,
    strictPort: true,
  },
  build: {
    target: "es2022",
    assetsInlineLimit: 0,
    chunkSizeWarningLimit: 2200,
    rollupOptions: {
      output: {
        manualChunks(id) {
          if (id.includes("monaco-editor")) return "monaco";
          const normalizedId = id.replaceAll("\\", "/");
          // Prism grammars must stay as dynamic chunks so dependency order is preserved.
          if (normalizedId.includes("/node_modules/prismjs/components/prism-")) return;
          // Preserve automatic shared chunks and dynamic renderer boundaries.
          // A single vendor chunk eagerly pulls diagram engines into startup.
        },
      },
    },
  },
});

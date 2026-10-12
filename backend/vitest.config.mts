import { fileURLToPath } from "url";
import { defineConfig } from "vitest/config";

export default defineConfig({
  resolve: {
    // Mirror tsconfig's baseUrl so imports like "src/interfaces/..." resolve.
    alias: { src: fileURLToPath(new URL("./src", import.meta.url)) },
  },
  test: {
    include: ["test/**/*.test.ts"],
  },
});

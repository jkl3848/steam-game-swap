import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "node",
    // Firestore emulator is shared process-wide; parallel files race on clear/write.
    fileParallelism: false,
  },
});

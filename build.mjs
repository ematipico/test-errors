import { build } from "vite";

try {
  await build();
  console.log("Build succeeded");
} catch (e) {
  console.table(e);
  console.error("Build failed:", e.message);
  process.exit(1);
}

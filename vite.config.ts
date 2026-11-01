import { defineConfig } from "vite";
import viteReact from "@vitejs/plugin-react";
import viteTsConfigPaths from "vite-tsconfig-paths";
import tailwindcss from "@tailwindcss/vite";
import { nitro } from "nitro/vite";
import { tanstackStart } from "@tanstack/react-start/plugin/vite";
import { workflow } from "workflow/vite";
import { waitForPreviewSchema } from "./scripts/wait-preview-schema";

const vercelBuild =
  Boolean(process.env.VERCEL) || process.env.NITRO_PRESET === "vercel";

export default defineConfig(async ({ command }) => {
  if (command === "build") await waitForPreviewSchema(process.env);
  return {
    plugins: [
      workflow(),
      nitro(
        vercelBuild
          ? { preset: "vercel", vercel: { entryFormat: "node" } }
          : {},
      ),
      viteTsConfigPaths({ projects: ["./tsconfig.json"] }),
      tailwindcss(),
      tanstackStart(),
      viteReact(),
    ],
  };
});

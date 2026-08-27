import { defineConfig } from "vite";
import { tanstackStart } from "@tanstack/react-start/plugin/vite";
import viteReact from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import tsConfigPaths from "vite-tsconfig-paths";
import { nitro } from "nitro/vite";

export default defineConfig(({ command }) => ({
  plugins: [
    tsConfigPaths(),
    tailwindcss(),
    tanstackStart(),
    // Nitro শুধু বিল্ডের সময় — এটাই সার্ভার কোডকে হোস্ট-উপযোগী করে বানায়।
    // Vercel-এ বিল্ড হলে নিজে থেকেই vercel preset বাছে (.vercel/output/);
    // নিজের মেশিনে node-server ধরে .output/ বানায়।
    ...(command === "build" ? nitro({ defaultPreset: "node-server" }) : []),
    viteReact(),
  ],
}));

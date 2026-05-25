import path from "node:path";
import { defineConfig } from "vite";
import monkey from "vite-plugin-monkey";
import { vitePluginVersionMark } from "vite-plugin-version-mark";

export default defineConfig(({ mode }) => {
  const isDev = mode === "dev";
  const version = process.env.BUILD_VERSION || "1.17.0";

  return {
    plugins: [
      vitePluginVersionMark({
        version: version,
        ifGlobal: true,
        ifLog: true,
        outputFile: true,
      }),
      monkey({
        entry: "src/index.ts",
        build: {
          fileName: "torn_war_stuff_enhanced.user.js",
          cssSideEffects: (css) => {
            const style = document.createElement("style");
            style.textContent = css;
            (document.head || document.documentElement).appendChild(style);
          },
        },
        userscript: {
          name: "Torn War Stuff Enhanced",
          namespace: "namespace",
          version: version,
          description:
            "Show travel status and hospital time and sort by hospital time on war page.",
          author: "xentac",
          license: "MIT",
          match: ["https://www.torn.com/factions.php*"],
          grant: ["GM_addStyle", "GM_registerMenuCommand"],
          connect: ["api.torn.com"],
          "run-at": "document-end",
        },
      }),
    ],
    resolve: {
      alias: {
        "@utils": path.resolve(__dirname, "src/utils"),
        "@features": path.resolve(__dirname, "src/features"),
        "@ui": path.resolve(__dirname, "src/ui"),
      },
    },
    build: {
      minify: false,
      sourcemap: isDev ? "inline" : false,
    },
  };
});

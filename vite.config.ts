import { execSync } from "node:child_process";
import path from "node:path";
import { defineConfig } from "vite";
import monkey from "vite-plugin-monkey";
import { vitePluginVersionMark } from "vite-plugin-version-mark";

const EDITIONS = {
  standard: {
    name: "Torn War Stuff Enhanced",
    fileName: "torn_war_stuff_enhanced.user.js",
    namespace: "namespace",
  },
  beta: {
    name: "Torn War Stuff Enhanced Beta",
    fileName: "torn_war_stuff_enhanced.beta.user.js",
    namespace: "namespace-beta",
  },
} as const;

function getFallbackVersion(): string {
  try {
    const describe = execSync("git describe --tags --always").toString().trim();
    return describe.startsWith("v") ? describe.slice(1) : describe;
  } catch (_e) {
    return "1.17.0";
  }
}

export default defineConfig(({ mode }) => {
  const isDev =
    mode === "dev" ||
    // biome-ignore lint/complexity/useLiteralKeys: tsc requires index signature lookup
    process.env["DEV_BUILD"] === "true" ||
    (() => {
      const modeIdx = process.argv.indexOf("--mode");
      return (
        (modeIdx !== -1 && process.argv[modeIdx + 1] === "dev") ||
        process.argv.includes("--mode=dev")
      );
    })();
  // biome-ignore lint/complexity/useLiteralKeys: tsc requires index signature lookup
  const editionKey = (process.env["BUILD_EDITION"] ||
    "standard") as keyof typeof EDITIONS;
  const edition = EDITIONS[editionKey] || EDITIONS.standard;
  // biome-ignore lint/complexity/useLiteralKeys: tsc requires index signature lookup
  const version = process.env["BUILD_VERSION"] || getFallbackVersion();
  const userscriptName = isDev ? `${edition.name} (dev)` : edition.name;

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
          fileName: isDev
            ? `${edition.fileName.replace(".user.js", "")}.dev.user.js`
            : edition.fileName,
          cssSideEffects: (css) => {
            const style = document.createElement("style");
            style.textContent = css;
            (document.head || document.documentElement).appendChild(style);
          },
        },
        userscript: {
          name: userscriptName,
          namespace: edition.namespace,
          version: version,
          description:
            "Show travel status and hospital time and sort by hospital time on war page.",
          author: "xentac",
          license: "MIT",
          match: ["https://www.torn.com/factions.php*"],
          grant: ["GM_addStyle", "GM_registerMenuCommand", "GM_xmlhttpRequest"],
          connect: ["api.torn.com", "twse.dev"],
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

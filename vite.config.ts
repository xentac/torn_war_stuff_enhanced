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
          // Fallback React copy for when unsafeWindow doesn't bridge to
          // Torn's own React/ReactDOM (see docs/adr/0008 and
          // src/shims/react-loader.ts). This is Torn's own react-dom build,
          // so it stays in lockstep with whatever React version the page
          // itself runs. It has no version number in the URL we control --
          // the hash is Torn's own build artifact name and changes on their
          // deploys, so this needs manual bumping (check a Torn page's
          // <script src> tags matching /builds/react-umd/react-dom.*.production.js)
          // when the fallback path stops working.
          //
          // TODO before shipping: this URL was confirmed on Torn profile
          // pages (via FFScouter); it has NOT yet been confirmed to also be
          // present on factions.php, which is the only page TWSE runs on.
          require: [
            "https://www.torn.com/builds/react-umd/react-dom.19.2.0.93c06d8e.production.js",
          ],
        },
      }),
    ],
    resolve: {
      alias: [
        { find: "@utils", replacement: path.resolve(__dirname, "src/utils") },
        { find: "@features", replacement: path.resolve(__dirname, "src/features") },
        { find: "@ui", replacement: path.resolve(__dirname, "src/ui") },
        {
          find: /^react$/,
          replacement: path.resolve(__dirname, "src/shims/react.ts"),
        },
        {
          find: /^react-dom\/client$/,
          replacement: path.resolve(__dirname, "src/shims/react-dom.ts"),
        },
        {
          find: /^react\/jsx-runtime$/,
          replacement: path.resolve(__dirname, "src/shims/jsx-runtime.ts"),
        },
        {
          find: /^react\/jsx-dev-runtime$/,
          replacement: path.resolve(__dirname, "src/shims/jsx-runtime.ts"),
        },
        {
          find: "@real-react",
          replacement: path.resolve(__dirname, "node_modules/react/index.js"),
        },
        {
          find: "@real-react-dom",
          replacement: path.resolve(__dirname, "node_modules/react-dom/index.js"),
        },
        {
          find: "@real-react-dom-client",
          replacement: path.resolve(
            __dirname,
            "node_modules/react-dom/client.js",
          ),
        },
      ],
    },
    build: {
      minify: false,
      sourcemap: isDev ? "inline" : false,
    },
    test: {
      environment: "node",
      setupFiles: ["src/tests/setup.ts"],
    },
  };
});

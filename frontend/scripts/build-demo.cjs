const { spawnSync } = require("node:child_process");
const path = require("node:path");

async function build() {
  const flag = process.argv.indexOf("--site-url");
  const siteUrl = flag >= 0 ? process.argv[flag + 1] : process.env.DEMO_SITE_URL || process.env.REACT_APP_SITE_URL;
  if (flag >= 0 && !siteUrl) throw new Error("--site-url requires the published demo origin.");
  const result = spawnSync(process.execPath, [require.resolve("@craco/craco/dist/bin/craco.js"), "build"], {
    stdio: "inherit", env: { ...process.env, REACT_APP_DEMO_MODE: "true", REACT_APP_BACKEND_URL: "", GENERATE_SOURCEMAP: "false", CI: "true" },
  });
  if (result.error) throw result.error;
  if (result.status !== 0) { process.exitCode = result.status ?? 1; return; }
  const { writeDemoMetadata } = await import("./demo-metadata.mjs");
  const { seedDemo } = await import("../src/demo/seed.mjs");
  const pages = await writeDemoMetadata({ buildDirectory: path.resolve(__dirname, "../build"), siteUrl, products: seedDemo().products });
  console.log(pages.length ? `Wrote product sharing metadata for ${pages.length} portfolio/Shop routes.` : "Demo remains noindex. Set --site-url or DEMO_SITE_URL when publishing product sharing previews.");
}

build().catch(error => { console.error(error.message); process.exitCode = 1; });

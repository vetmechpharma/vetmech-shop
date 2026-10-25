const { spawnSync } = require("node:child_process");
const args = process.argv.slice(2);
const flag = (name, fallback) => { const index=args.indexOf(name); return index>=0 ? args[index+1] : fallback; };
const result = spawnSync(process.execPath, [require.resolve("@craco/craco/dist/bin/craco.js"), "start"], {
  stdio: "inherit", env: { ...process.env, REACT_APP_DEMO_MODE: "true", REACT_APP_BACKEND_URL: "", BROWSER: "none", PORT: flag("--port",process.env.PORT || "3000"), HOST: flag("--host",process.env.HOST || "0.0.0.0"), CI: "true" },
});
process.exit(result.status ?? 1);

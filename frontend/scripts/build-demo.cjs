const { spawnSync } = require("node:child_process");
const result = spawnSync(process.execPath, [require.resolve("@craco/craco/dist/bin/craco.js"), "build"], {
  stdio: "inherit", env: { ...process.env, REACT_APP_DEMO_MODE: "true", REACT_APP_BACKEND_URL: "", GENERATE_SOURCEMAP: "false", CI: "true" },
});
process.exit(result.status ?? 1);

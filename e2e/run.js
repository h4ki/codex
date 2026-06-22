import { spawnSync } from "node:child_process";

const mockPort = "9876";
const frontendPort = "5173";
const backendPort = "8787";

const e2eEnv = {
  ...process.env,
  VITE_GITHUB_CLIENT_ID: "mock-client-id",
  VITE_GITHUB_AUTHORIZATION_ENDPOINT: `http://127.0.0.1:${mockPort}/login/oauth/authorize`,
  VITE_GITHUB_REDIRECT_URI: `http://127.0.0.1:${frontendPort}/callback`,
  VITE_GITHUB_SCOPE: "read:user user:email",
  VITE_BACKEND_BASE_URL: `http://127.0.0.1:${backendPort}`
};

const run = (command, args, options = {}) => {
  const result = spawnSync(command, args, {
    stdio: "inherit",
    env: options.env ?? process.env
  });

  if (result.status !== 0) {
    process.exit(result.status ?? 1);
  }
};

run("npm", ["run", "wasm:build"]);
run("npm", ["run", "build", "--prefix", "frontend"], { env: e2eEnv });
run("npx", [
  "cucumber-js",
  "e2e/features",
  "--import",
  "e2e/support/world.js",
  "--import",
  "e2e/steps/*.js",
  "--force-exit"
]);

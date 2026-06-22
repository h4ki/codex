import { spawnSync } from "node:child_process";

const args = [
  "build",
  "wasm-auth-middleware",
  "--target",
  "web",
  "--out-dir",
  "../frontend/src/wasm"
];

let lastStatus = 1;

for (let attempt = 1; attempt <= 2; attempt += 1) {
  const result = spawnSync("wasm-pack", args, {
    stdio: "inherit",
    env: {
      ...process.env,
      CARGO_HTTP_MULTIPLEXING: "false"
    }
  });

  lastStatus = result.status ?? 1;
  if (lastStatus === 0) {
    process.exit(0);
  }

  console.error(`wasm-pack failed on attempt ${attempt}.`);
}

process.exit(lastStatus);

import { execFileSync } from "node:child_process";
import { mkdirSync, rmSync } from "node:fs";
import { resolve } from "node:path";

const root = resolve(new URL("..", import.meta.url).pathname);
const dist = resolve(root, "extension/dist");

rmSync(dist, { force: true, recursive: true });
mkdirSync(dist, { recursive: true });

execFileSync(
  "npx",
  [
    "esbuild",
    "extension/src/js/main.js",
    "--bundle",
    "--format=iife",
    "--target=chrome114",
    "--outfile=extension/dist/content-script.js",
    "--log-level=warning"
  ],
  { cwd: root, stdio: "inherit" }
);

execFileSync(
  "npx",
  [
    "esbuild",
    "extension/src/js/background.js",
    "--bundle",
    "--format=iife",
    "--target=chrome114",
    "--outfile=extension/dist/background.js",
    "--log-level=warning"
  ],
  { cwd: root, stdio: "inherit" }
);

execFileSync(
  "npx",
  [
    "@tailwindcss/cli",
    "-i",
    "extension/src/styles/tailwind.css",
    "-o",
    "extension/dist/styles.css",
    "--minify"
  ],
  { cwd: root, stdio: "inherit" }
);

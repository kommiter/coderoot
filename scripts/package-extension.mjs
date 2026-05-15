import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, rmSync } from "node:fs";
import { resolve } from "node:path";

const root = resolve(new URL("..", import.meta.url).pathname);
const extensionDir = resolve(root, "extension");
const releaseDir = resolve(root, "release");
const packageJson = JSON.parse(readFileSync(resolve(root, "package.json"), "utf8"));
const output = resolve(releaseDir, `coderoot-v${packageJson.version}.zip`);

const requiredFiles = [
  "manifest.json",
  "dist/background.js",
  "dist/content-script.js",
  "dist/styles.css",
  "coderoot-16.png",
  "coderoot-48.png",
  "coderoot-128.png",
  "coderoot-favicon.ico",
  "codetree-favicon.ico"
];

const missing = requiredFiles.filter((file) => !existsSync(resolve(extensionDir, file)));
if (missing.length) {
  throw new Error(`Build output is missing: ${missing.join(", ")}`);
}

mkdirSync(releaseDir, { recursive: true });
rmSync(output, { force: true });

execFileSync("zip", ["-r", "-X", output, ...requiredFiles], {
  cwd: extensionDir,
  stdio: "inherit"
});

console.log(`Packaged ${output}`);

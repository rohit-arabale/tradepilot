import { randomBytes } from "node:crypto";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { spawn, spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import path from "node:path";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const setupOnly = process.argv.includes("--setup-only");
const backendEnvPath = path.join(root, "backend", ".env");
const frontendEnvPath = path.join(root, "frontend", ".env");
const isWindows = process.platform === "win32";
const npm = isWindows ? "npm.cmd" : "npm";

function ensureEnv(target, template, additions) {
  if (existsSync(target)) return false;
  const contents = readFileSync(path.join(root, template), "utf8");
  const configured = contents.replace(
    /^JWT_SECRET=.*$/m,
    `JWT_SECRET=${randomBytes(48).toString("hex")}`,
  );
  writeFileSync(target, configured, "utf8");
  if (additions) writeFileSync(target, `${readFileSync(target, "utf8").trimEnd()}\n${additions}\n`, "utf8");
  console.log(`Created ${path.relative(root, target)} with local development defaults.`);
  return true;
}

ensureEnv(backendEnvPath, "backend/.env.example");
ensureEnv(frontendEnvPath, "frontend/.env.example");

if (setupOnly) {
  console.log("Environment files are ready. Set MONGODB_URI in backend/.env if you use MongoDB Atlas.");
  process.exit(0);
}

if (!existsSync(path.join(root, "node_modules", "concurrently"))) {
  console.log("Installing project dependencies (Puppeteer browser download is disabled)...");
  const install = spawnSync(npm, ["install", "--ignore-scripts"], {
    cwd: root,
    stdio: "inherit",
    env: { ...process.env, PUPPETEER_SKIP_DOWNLOAD: "1" },
  });
  if (install.status !== 0) process.exit(install.status ?? 1);
}

const mongoCheck = spawnSync("docker", ["info"], { stdio: "ignore", shell: isWindows });
if (mongoCheck.status === 0) {
  const container = spawnSync("docker", ["ps", "-a", "--filter", "name=^tradepilot-mongo$", "--format", "{{.Names}}"], {
    encoding: "utf8",
    shell: isWindows,
  });
  const exists = container.stdout?.trim() === "tradepilot-mongo";
  const db = exists
    ? spawnSync("docker", ["start", "tradepilot-mongo"], { stdio: "inherit", shell: isWindows })
    : spawnSync("docker", ["run", "-d", "--name", "tradepilot-mongo", "-p", "27017:27017", "mongo:7"], { stdio: "inherit", shell: isWindows });
  if (db.status !== 0) process.exit(db.status ?? 1);
  console.log("Started local MongoDB in Docker.");
} else {
  console.log("Docker is unavailable; using the MONGODB_URI configured in backend/.env.");
}

console.log("Starting TradePilot. Open http://localhost:5173 when Vite is ready.");
const runner = spawn(npm, ["run", "dev"], { cwd: root, stdio: "inherit", shell: isWindows });
runner.on("exit", (code) => process.exit(code ?? 0));
for (const signal of ["SIGINT", "SIGTERM"]) {
  process.on(signal, () => runner.kill(signal));
}

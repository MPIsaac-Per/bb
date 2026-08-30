import { spawn } from "node:child_process";
import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { basename, dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const scriptPath = fileURLToPath(import.meta.url);
const mpivVersionPattern = /^\d+\.\d+\.\d+-mpiv\.[1-9]\d*\.[1-9]\d*$/u;
const hostPattern = /^[a-zA-Z0-9._-]+$/u;
const hashPattern = /^[a-f0-9]{64}$/u;
const commitPattern = /^[a-f0-9]{7,64}$/u;
const remoteInstaller = `set -euo pipefail
release_dir="$1"
expected_version="$2"
artifact_name="$3"
manifest_name="$4"
package_prefix="/home/michael/.npm-global"
data_dir="/home/michael/.bb"
service="bb-server.service"
artifact_path="$release_dir/$artifact_name"
manifest_path="$release_dir/$manifest_name"
result_path="$release_dir/deployment-result.json"
systemctl --user is-active --quiet "$service"
expected_sha="$(node -e 'const fs=require("node:fs"); const p=JSON.parse(fs.readFileSync(process.argv[1],"utf8")); process.stdout.write(p.artifact.sha256)' "$manifest_path")"
actual_sha="$(sha256sum "$artifact_path" | awk '{print $1}')"
test "$actual_sha" = "$expected_sha"
sqlite3 "$data_dir/bb.db" ".backup '$release_dir/bb.db.before'"
rollback_name="$(npm pack "$package_prefix/lib/node_modules/bb-app" --pack-destination "$release_dir" --silent)"
mv "$release_dir/$rollback_name" "$release_dir/bb-app.before.tgz"
old_version="$(node -e 'process.stdout.write(require(process.argv[1]).version)' "$package_prefix/lib/node_modules/bb-app/package.json")"
rollback() {
  set +e
  systemctl --user stop "$service"
  npm install --global --prefix "$package_prefix" "$release_dir/bb-app.before.tgz"
  cp "$data_dir/bb.db" "$release_dir/bb.db.failed"
  cp "$release_dir/bb.db.before" "$data_dir/bb.db"
  rm -f "$data_dir/bb.db-wal" "$data_dir/bb.db-shm"
  systemctl --user start "$service"
  node -e 'const fs=require("node:fs"); fs.writeFileSync(process.argv[1], JSON.stringify({status:"rolled-back",expectedVersion:process.argv[2],restoredVersion:process.argv[3],finishedAt:new Date().toISOString()},null,2)+"\\n")' "$result_path" "$expected_version" "$old_version"
  exit 1
}
trap rollback ERR
npm install --global --prefix "$package_prefix" "$artifact_path"
systemctl --user restart "$service"
for attempt in $(seq 1 20); do
  if curl --fail --silent http://127.0.0.1:38886/health >/dev/null; then
    break
  fi
  if [ "$attempt" -eq 20 ]; then
    false
  fi
  sleep 2
done
actual_version="$(curl --fail --silent http://127.0.0.1:38886/install/version | node -e 'let body=""; process.stdin.on("data",chunk=>body+=chunk); process.stdin.on("end",()=>process.stdout.write(JSON.parse(body).version))')"
test "$actual_version" = "$expected_version"
"$package_prefix/bin/bb" status --json > "$release_dir/bb-status.json"
node -e 'const fs=require("node:fs"); fs.writeFileSync(process.argv[1], JSON.stringify({status:"deployed",version:process.argv[2],previousVersion:process.argv[3],finishedAt:new Date().toISOString()},null,2)+"\\n")' "$result_path" "$expected_version" "$old_version"
trap - ERR
printf '%s\\n' "$actual_version"
`;

function defaultRunCommand(options) {
  return new Promise((resolvePromise, rejectPromise) => {
    const child = spawn(options.command, options.args, {
      stdio: ["pipe", "pipe", "pipe"],
    });
    let stdout = "";
    let stderr = "";
    child.stdout.setEncoding("utf8");
    child.stderr.setEncoding("utf8");
    child.stdout.on("data", (chunk) => {
      stdout += chunk;
    });
    child.stderr.on("data", (chunk) => {
      stderr += chunk;
    });
    child.on("error", rejectPromise);
    child.on("close", (code) => {
      if (code === 0) {
        resolvePromise({ stderr, stdout });
        return;
      }
      rejectPromise(
        new Error(`${options.command} exited ${code}: ${stderr.trim()}`),
      );
    });
    child.stdin.end(options.input ?? "");
  });
}

async function readDeploymentInputs(artifactPath, manifestPath) {
  const artifact = await readFile(artifactPath);
  const parsed = JSON.parse(await readFile(manifestPath, "utf8"));
  if (
    typeof parsed !== "object" ||
    parsed === null ||
    parsed.schemaVersion !== 1 ||
    parsed.distribution !== "mpiv" ||
    typeof parsed.createdAt !== "string" ||
    !Number.isSafeInteger(Date.parse(parsed.createdAt)) ||
    !Number.isSafeInteger(parsed.customCommitCount) ||
    parsed.customCommitCount < 0 ||
    !Number.isSafeInteger(parsed.protocolVersion) ||
    parsed.protocolVersion < 1 ||
    typeof parsed.sourceBranch !== "string" ||
    parsed.sourceBranch.length === 0 ||
    typeof parsed.sourceCommit !== "string" ||
    !commitPattern.test(parsed.sourceCommit) ||
    typeof parsed.upstreamBase !== "string" ||
    !commitPattern.test(parsed.upstreamBase) ||
    typeof parsed.version !== "string" ||
    !mpivVersionPattern.test(parsed.version) ||
    typeof parsed.artifact !== "object" ||
    parsed.artifact === null ||
    typeof parsed.artifact.file !== "string" ||
    typeof parsed.artifact.sha256 !== "string" ||
    !hashPattern.test(parsed.artifact.sha256)
  ) {
    throw new Error("Invalid MPIV provenance manifest.");
  }
  if (basename(artifactPath) !== parsed.artifact.file) {
    throw new Error(
      "Artifact filename does not match the provenance manifest.",
    );
  }
  const sha256 = createHash("sha256").update(artifact).digest("hex");
  if (sha256 !== parsed.artifact.sha256) {
    throw new Error(
      "Artifact checksum does not match the provenance manifest.",
    );
  }
  return { sha256, version: parsed.version };
}

export async function deployMpivHub(options) {
  const host = options.host ?? "hub";
  if (!hostPattern.test(host)) {
    throw new Error(`Invalid SSH host: ${host}`);
  }
  const artifactPath = resolve(options.artifactPath);
  const manifestPath = resolve(options.manifestPath);
  const { sha256, version } = await readDeploymentInputs(
    artifactPath,
    manifestPath,
  );
  const releaseId = `${version}-${sha256.slice(0, 12)}`;
  const remoteDir = `/home/michael/.bb-mpiv/releases/${releaseId}`;
  const plan = { host, mode: "plan", releaseId, remoteDir, sha256, version };
  if (!options.deploy) {
    return plan;
  }
  const runCommand = options.runCommand ?? defaultRunCommand;
  await runCommand({
    args: [host, "mkdir", "-p", remoteDir],
    command: "ssh",
  });
  await runCommand({
    args: [artifactPath, manifestPath, `${host}:${remoteDir}/`],
    command: "scp",
  });
  const result = await runCommand({
    args: [
      host,
      "bash",
      "-s",
      "--",
      remoteDir,
      version,
      basename(artifactPath),
      basename(manifestPath),
    ],
    command: "ssh",
    input: remoteInstaller,
  });
  return { ...plan, mode: "deployed", stdout: result.stdout.trim() };
}

function parseArgs(args) {
  const parsed = {
    artifactPath: "",
    deploy: false,
    host: "hub",
    manifestPath: "",
  };
  for (let index = 0; index < args.length; index += 1) {
    const argument = args[index];
    if (argument === "--deploy") {
      parsed.deploy = true;
    } else if (argument === "--artifact") {
      parsed.artifactPath = args[index + 1] ?? "";
      index += 1;
    } else if (argument === "--manifest") {
      parsed.manifestPath = args[index + 1] ?? "";
      index += 1;
    } else if (argument === "--host") {
      parsed.host = args[index + 1] ?? "";
      index += 1;
    } else {
      throw new Error(`Unknown argument: ${argument}`);
    }
  }
  if (!parsed.artifactPath || !parsed.manifestPath) {
    throw new Error(
      "Usage: node scripts/mpiv-hub-deploy.mjs --artifact <tgz> --manifest <json> [--host hub] [--deploy]",
    );
  }
  return parsed;
}

async function main() {
  const result = await deployMpivHub(parseArgs(process.argv.slice(2)));
  process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
}

if (resolve(process.argv[1] ?? "") === scriptPath) {
  main().catch((error) => {
    const message = error instanceof Error ? error.message : String(error);
    console.error(message);
    process.exitCode = 1;
  });
}

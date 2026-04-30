#!/usr/bin/env node

import { spawnSync } from "node:child_process";
import { constants } from "node:fs";
import { access, copyFile, mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";

const args = process.argv.slice(2);

const getArg = (name) => {
  const index = args.indexOf(name);
  if (index === -1) {
    return undefined;
  }
  return args[index + 1];
};

const hasFlag = (name) => args.includes(name);

const tag = getArg("--tag");
const push = hasFlag("--push");
const skipValidation = hasFlag("--skip-validation");
const skipRemoteSmoke = hasFlag("--skip-remote-smoke");
const remote = getArg("--remote") ?? "origin";
const branch = getArg("--branch") ?? "flowglad-main";

const usage = () => {
  console.error(`Usage:
  node scripts/create-flowglad-package-tag.mjs --tag v2.14.3-fgp.2 [--push]

Options:
  --tag <tag>             Required. Must match package version: v<version>-fgp.<n>
  --push                  Push ${branch} and the new tag to the remote.
  --remote <name>         Remote to use. Default: origin.
  --branch <name>         Branch to release from. Default: flowglad-main.
  --skip-validation       Skip build/typecheck/focused tests.
  --skip-remote-smoke     With --push, skip clean install from GitHub tag.
`);
};

const run = (command, commandArgs, options = {}) => {
  const result = spawnSync(command, commandArgs, {
    cwd: options.cwd ?? repoRoot,
    encoding: "utf8",
    stdio: options.capture ? "pipe" : "inherit",
  });

  if (result.status !== 0) {
    if (options.capture) {
      process.stderr.write(result.stderr);
      process.stderr.write(result.stdout);
    }
    throw new Error(`${command} ${commandArgs.join(" ")} failed`);
  }

  return result.stdout?.trim() ?? "";
};

const repoRoot = resolve(new URL("..", import.meta.url).pathname);
const packageDir = "packages/just-bash";
const wasmPath = `${packageDir}/vendor/cpython-emscripten/python.wasm`;

if (!tag) {
  usage();
  process.exit(2);
}

const packageJson = JSON.parse(
  await readFile(join(repoRoot, packageDir, "package.json"), "utf8"),
);
const expectedTagPrefix = `v${packageJson.version}-fgp.`;
const tagIncrement = tag.slice(expectedTagPrefix.length);

if (
  !tag.startsWith(expectedTagPrefix) ||
  tagIncrement.length === 0 ||
  !Array.from(tagIncrement).every((char) => char >= "0" && char <= "9")
) {
  throw new Error(
    `Tag ${tag} does not match package version ${packageJson.version}. Expected v${packageJson.version}-fgp.<n>.`,
  );
}

const currentBranch = run("git", ["branch", "--show-current"], {
  capture: true,
});
if (currentBranch !== branch) {
  throw new Error(
    `Refusing to release from ${currentBranch}; expected ${branch}.`,
  );
}

// `-c core.fileMode=false` so executable-bit flips don't show up here. esbuild
// emits dist/bin/*.js at mode 100644 on Linux, but those files were originally
// committed at 100755 (and macOS preserves that on rebuild), so a CI rebuild
// would otherwise look like a "dirty worktree" or "validation changed files"
// even when no content changed.
const status = run(
  "git",
  ["-c", "core.fileMode=false", "status", "--porcelain"],
  { capture: true },
);
if (status) {
  throw new Error(`Refusing to release with a dirty worktree:\n${status}`);
}

const localTag = spawnSync(
  "git",
  ["rev-parse", "-q", "--verify", `refs/tags/${tag}`],
  {
    cwd: repoRoot,
    encoding: "utf8",
    stdio: "pipe",
  },
);
if (localTag.status === 0) {
  throw new Error(`Local tag already exists: ${tag}`);
}

const remoteTag = run("git", ["ls-remote", "--tags", remote, tag], {
  capture: true,
});
if (remoteTag) {
  throw new Error(`Remote tag already exists: ${tag}`);
}

await access(join(repoRoot, wasmPath), constants.R_OK);
const wasmHeader = (await readFile(join(repoRoot, wasmPath))).subarray(0, 4);
if (
  Buffer.compare(
    Buffer.from(wasmHeader).subarray(0, 4),
    Buffer.from("\0asm"),
  ) !== 0
) {
  throw new Error(
    `${wasmPath} is not hydrated. Run git lfs install --local && git lfs pull.`,
  );
}

if (!skipValidation) {
  run("pnpm", ["install", "--frozen-lockfile"]);
  run("pnpm", ["--filter", "just-bash", "build"]);
  run("pnpm", ["--filter", "just-bash", "typecheck"]);
  run("pnpm", [
    "--filter",
    "just-bash",
    "exec",
    "vitest",
    "run",
    "src/commands/sqlite3/sqlite3.test.ts",
    "src/commands/python3/python3.optin.test.ts",
  ]);

  const postValidationStatus = run(
    "git",
    ["-c", "core.fileMode=false", "status", "--porcelain"],
    { capture: true },
  );
  if (postValidationStatus) {
    throw new Error(
      `Validation changed files. Commit the build output first, then rerun:\n${postValidationStatus}`,
    );
  }
}

const splitBranch = `flowglad-package-${tag}`;
const splitBranchExists = spawnSync(
  "git",
  ["rev-parse", "-q", "--verify", splitBranch],
  {
    cwd: repoRoot,
    encoding: "utf8",
    stdio: "pipe",
  },
);
if (splitBranchExists.status === 0) {
  throw new Error(`Temporary split branch already exists: ${splitBranch}`);
}

run("git", ["subtree", "split", `--prefix=${packageDir}`, "-b", splitBranch]);

const worktreeDir = await mkdtemp(join(tmpdir(), `flowglad-${tag}-`));

try {
  run("git", ["worktree", "add", worktreeDir, splitBranch]);

  const packageWasmPath = join(
    worktreeDir,
    "vendor/cpython-emscripten/python.wasm",
  );
  const packageWasm = await readFile(packageWasmPath);
  if (Buffer.compare(packageWasm.subarray(0, 4), Buffer.from("\0asm")) !== 0) {
    await copyFile(join(repoRoot, wasmPath), packageWasmPath);
    run("git", ["add", "vendor/cpython-emscripten/python.wasm"], {
      cwd: worktreeDir,
    });
    const commitResult = spawnSync(
      "git",
      ["commit", "-m", "chore: embed python wasm for git package tag"],
      { cwd: worktreeDir, encoding: "utf8", stdio: "inherit" },
    );
    if (commitResult.status !== 0) {
      throw new Error(
        "Failed to commit hydrated python.wasm in package worktree",
      );
    }
  }

  const tagTarget = spawnSync("git", ["rev-parse", "HEAD"], {
    cwd: worktreeDir,
    encoding: "utf8",
    stdio: "pipe",
  });
  if (tagTarget.status !== 0) {
    throw new Error("Failed to resolve package tag target");
  }

  run("git", ["tag", tag, tagTarget.stdout.trim()]);

  const packedOutput = run("npm", ["pack", "--pack-destination", worktreeDir], {
    cwd: worktreeDir,
    capture: true,
  });
  const tarballName = packedOutput.split("\n").at(-1);
  if (!tarballName) {
    throw new Error("npm pack did not report a tarball name");
  }

  const packageSpec = `file:${join(worktreeDir, tarballName)}`;
  run("node", ["scripts/flowglad-consumability-smoke.mjs", packageSpec]);

  if (push) {
    run("git", ["push", remote, branch]);
    run("git", ["push", remote, `refs/tags/${tag}`]);

    if (!skipRemoteSmoke) {
      run("node", [
        "scripts/flowglad-consumability-smoke.mjs",
        `github:flowglad/just-bash#${tag}`,
      ]);
    }
  }

  console.log(`Created consumable package-root tag ${tag}.`);
  console.log(`Tag target: ${tagTarget.stdout.trim()}`);
  if (!push) {
    console.log(`Push with: git push ${remote} refs/tags/${tag}`);
  }
} catch (error) {
  try {
    run("git", ["tag", "-d", tag]);
  } catch {
    // Tag may not have been created.
  }
  throw error;
} finally {
  const shouldKeep = process.exitCode && process.exitCode !== 0;
  if (!shouldKeep) {
    try {
      run("git", ["worktree", "remove", "--force", worktreeDir]);
      await rm(worktreeDir, { recursive: true, force: true });
      run("git", ["branch", "-D", splitBranch]);
    } catch {
      // Leave the path printed above if cleanup fails.
    }
  }
}

#!/usr/bin/env node

import { spawn } from "node:child_process";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

const specArg = process.argv.slice(2).find((arg) => arg !== "--");

if (!specArg) {
  console.error(
    "Usage: node scripts/flowglad-consumability-smoke.mjs <package-spec>",
  );
  process.exit(2);
}

const run = (command, args, options = {}) =>
  new Promise((resolve, reject) => {
    const child = spawn(command, args, {
      stdio: "inherit",
      ...options,
    });

    child.on("error", reject);
    child.on("exit", (code) => {
      if (code === 0) {
        resolve();
        return;
      }
      reject(new Error(`${command} ${args.join(" ")} exited ${code}`));
    });
  });

const smokeSource = String.raw`
import { Bash } from 'just-bash';

const resolved = import.meta.resolve('just-bash');
if (!resolved.includes('/dist/bundle/index.js')) {
  throw new Error('just-bash resolved to unexpected entry: ' + resolved);
}

const bash = new Bash({ python: true });

const cases = [
  {
    name: 'python',
    command: "python3 -c 'print(1 + 2)'",
    stdout: '3\n',
  },
  {
    name: 'jq-control-char',
    command: "printf '{\"x\":\"a\\u0001b\"}' | jq .x",
    stdout: '"a\\u0001b"\n',
  },
  {
    name: 'awk-comma-newline',
    command: 'awk ' + JSON.stringify('BEGIN { print "a",\n"b" }'),
    stdout: 'a b\n',
  },
];

for (const testCase of cases) {
  const result = await bash.exec(testCase.command);
  if (result.exitCode !== 0) {
    throw new Error(
      testCase.name + ' exited ' + result.exitCode + ': ' + result.stderr,
    );
  }
  if (result.stdout !== testCase.stdout) {
    throw new Error(
      testCase.name +
        ' stdout mismatch. Expected ' +
        JSON.stringify(testCase.stdout) +
        ', got ' +
        JSON.stringify(result.stdout),
    );
  }
}

console.log('just-bash consumability smoke passed:', resolved);
`;

const dir = await mkdtemp(join(tmpdir(), "flowglad-just-bash-smoke-"));

try {
  await run("bun", ["init", "-y"], { cwd: dir });
  await run("bun", ["add", "--backend", "copyfile", specArg], { cwd: dir });
  await run("bun", ["-e", smokeSource], { cwd: dir });
} finally {
  await rm(dir, { recursive: true, force: true });
}

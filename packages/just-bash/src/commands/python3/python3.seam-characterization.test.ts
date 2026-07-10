import { describe, expect, it } from "vitest";
import { Bash } from "../../Bash.js";

describe("reasoning execution seam characterization", () => {
  it(
    "reports python3 as available through the canonical probe",
    { timeout: 60_000 },
    async () => {
      const env = new Bash({ python: true });

      const result = await env.exec("which python3 && python3 --version");

      expect(result.stdout).toBe(
        "/usr/bin/python3\nPython 3.13.2 (Emscripten)\n",
      );
      expect(result.stderr).toBe("");
      expect(result.exitCode).toBe(0);
    },
  );

  it("executes multiline python3 -c source without a compatibility wrapper", async () => {
    const env = new Bash({ python: true });

    const result = await env.exec('python3 -c "x = 1\ny = 2\nprint(x + y)"');

    expect(result.stdout).toBe("3\n");
    expect(result.stderr).toBe("");
    expect(result.exitCode).toBe(0);
  });

  it("executes python source from heredoc stdin directly", async () => {
    const env = new Bash({ python: true });

    const result = await env.exec(
      "python3 - <<'PY'\nimport sys\nprint('argv0=' + sys.argv[0])\nPY\n",
    );

    expect(result.stdout).toBe("argv0=-\n");
    expect(result.stderr).toBe("");
    expect(result.exitCode).toBe(0);
  });

  it("preserves grouped command control flow around python execution", async () => {
    const env = new Bash({
      python: true,
      files: { "/workspace/x.py": 'print("x-ok")\n' },
    });

    const result = await env.exec(
      "(cd /workspace && python3 x.py) && echo done",
    );

    expect(result.stdout).toBe("x-ok\ndone\n");
    expect(result.stderr).toBe("");
    expect(result.exitCode).toBe(0);
  });

  it("rejects the internal /host mount with the canonical script path", async () => {
    const env = new Bash({
      python: true,
      files: { "/workspace/value.py": 'print("mounted-value")\n' },
    });

    const result = await env.exec("python3 /host/workspace/value.py");

    expect(result.stdout).toBe("");
    expect(result.stderr).toBe(
      "python3: internal path alias '/host/workspace/value.py' is not supported; use '/workspace/value.py'\n",
    );
    expect(result.exitCode).toBe(2);
  });

  it("rejects the internal /host mount from high-level Python file APIs", async () => {
    const env = new Bash({
      python: true,
      files: {
        "/workspace/value.txt": "mounted-value\n",
        "/workspace/host_alias.py": `import sys
try:
    open('/host/workspace/value.txt').read()
except OSError as error:
    print(error, file=sys.stderr)
    sys.exit(2)
`,
      },
    });

    const result = await env.exec("python3 /workspace/host_alias.py");

    expect(result.stdout).toBe("");
    expect(result.stderr).toBe(
      "internal path alias '/host/workspace/value.txt' is not supported; use '/workspace/value.txt'\n",
    );
    expect(result.exitCode).toBe(2);
  });

  it("preserves explicit Python exit status and stderr without teardown noise", async () => {
    const env = new Bash({ python: true });

    const result = await env.exec(
      `python3 -c "import sys; print('real error', file=sys.stderr); sys.exit(3)"`,
    );

    expect(result.stdout).toBe("");
    expect(result.stderr).toBe("real error\n");
    expect(result.exitCode).toBe(3);
  });
});

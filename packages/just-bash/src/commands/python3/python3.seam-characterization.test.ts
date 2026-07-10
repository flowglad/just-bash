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

  it("keeps the internal /host mount visible only inside wasm python", async () => {
    const env = new Bash({
      python: true,
      files: { "/workspace/value.txt": "mounted-value\n" },
    });

    const shellResult = await env.exec("cat /host/workspace/value.txt");
    const pythonResult = await env.exec(
      `python3 -c "print(open('/host/workspace/value.txt').read(), end='')"`,
    );

    expect(shellResult.stdout).toBe("");
    expect(shellResult.stderr).toBe(
      "cat: /host/workspace/value.txt: No such file or directory\n",
    );
    expect(shellResult.exitCode).toBe(1);
    expect(pythonResult.stdout).toBe("mounted-value\n");
    expect(pythonResult.stderr).toBe("");
    expect(pythonResult.exitCode).toBe(0);
  });
});

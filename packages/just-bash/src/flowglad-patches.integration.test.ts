import { describe, expect, it } from "vitest";
import { Bash } from "./Bash.js";

describe("Flowglad carried patches", () => {
  it("runs sqlite3 with the packaged worker", async () => {
    const env = new Bash();

    const result = await env.exec(
      'sqlite3 :memory: "CREATE TABLE t(x); INSERT INTO t VALUES(42); SELECT x FROM t"',
    );

    expect(result.stderr).toBe("");
    expect(result.stdout).toBe("42\n");
    expect(result.exitCode).toBe(0);
  });

  it("continues awk expressions across a newline after comma", async () => {
    const env = new Bash();

    const result = await env.exec(`awk 'BEGIN { printf "%s-%s\\n",
  "left", "right" }'`);

    expect(result.stderr).toBe("");
    expect(result.stdout).toBe("left-right\n");
    expect(result.exitCode).toBe(0);
  });

  it("accepts literal control characters inside jq JSON strings", async () => {
    const env = new Bash({
      files: {
        "/shopify.json": '{"body":"first\nsecond"}\n',
      },
    });

    const result = await env.exec("jq -r '.body' /shopify.json");

    expect(result.stderr).toBe("");
    expect(result.stdout).toBe("first\nsecond\n");
    expect(result.exitCode).toBe(0);
  });
});

import { describe, expect, it } from "vitest";
import { Bash } from "./Bash.js";

// One describe block per carried patch (see README.md "Flowglad fork notes").
// Adding a new patch requires adding a corresponding describe block here so
// the consumability CI gates the next release on it.
describe("Flowglad carried patches", () => {
  describe("sqlite3-worker", () => {
    it("ships the bundled worker so basic SQL runs", async () => {
      const env = new Bash();

      const result = await env.exec(
        'sqlite3 :memory: "CREATE TABLE t(x); INSERT INTO t VALUES(42); SELECT x FROM t"',
      );

      expect(result.stderr).toBe("");
      expect(result.stdout).toBe("42\n");
      expect(result.exitCode).toBe(0);
    });

    it("translates the .tables dot-command into a sqlite_master query", async () => {
      const env = new Bash();

      const result = await env.exec(
        'sqlite3 :memory: "CREATE TABLE alpha(x); CREATE TABLE beta(y); .tables"',
      );

      expect(result.stderr).toBe("");
      expect(result.stdout).toBe("alpha\nbeta\n");
      expect(result.exitCode).toBe(0);
    });

    it("translates the .schema dot-command into a sqlite_master query", async () => {
      const env = new Bash();

      const result = await env.exec(
        'sqlite3 :memory: "CREATE TABLE alpha(x INTEGER); .schema alpha"',
      );

      expect(result.stderr).toBe("");
      expect(result.stdout).toBe("CREATE TABLE alpha(x INTEGER)\n");
      expect(result.exitCode).toBe(0);
    });
  });

  describe("awk-comma-continuation", () => {
    it("continues awk expressions across a newline after comma", async () => {
      const env = new Bash();

      const result = await env.exec(`awk 'BEGIN { printf "%s-%s\\n",
  "left", "right" }'`);

      expect(result.stderr).toBe("");
      expect(result.stdout).toBe("left-right\n");
      expect(result.exitCode).toBe(0);
    });
  });

  describe("jq-permissive-control-chars", () => {
    it("accepts a literal newline inside a JSON string", async () => {
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

    it("accepts a literal tab inside a JSON string", async () => {
      const env = new Bash({
        files: {
          "/payload.json": '{"body":"col1\tcol2"}\n',
        },
      });

      const result = await env.exec("jq -r '.body' /payload.json");

      expect(result.stderr).toBe("");
      expect(result.stdout).toBe("col1\tcol2\n");
      expect(result.exitCode).toBe(0);
    });
  });
});

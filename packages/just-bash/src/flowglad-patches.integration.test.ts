import { describe, expect, it } from "vitest";
import { Bash } from "./Bash.js";

// One describe block per carried patch (see README.md "Flowglad fork notes").
// Adding a new patch requires adding a corresponding describe block here so
// the consumability CI gates the next release on it.
describe("Flowglad carried patches", () => {
  describe("sqlite3-dot-commands", () => {
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
      // .schema appends `;` to each CREATE statement to match real sqlite3.
      expect(result.stdout).toBe("CREATE TABLE alpha(x INTEGER);\n");
      expect(result.exitCode).toBe(0);
    });

    it(".mode csv mutates the formatter for downstream SQL", async () => {
      const env = new Bash();

      const result = await env.exec(
        'sqlite3 :memory: "CREATE TABLE t(a,b); INSERT INTO t VALUES(1,2),(3,4); .mode csv\nSELECT * FROM t"',
      );

      expect(result.stderr).toBe("");
      expect(result.stdout).toBe("1,2\n3,4\n");
      expect(result.exitCode).toBe(0);
    });

    it(".read inlines the contents of a referenced script", async () => {
      const env = new Bash({
        files: {
          "/seed.sql": "CREATE TABLE t(x);\nINSERT INTO t VALUES(7);\n",
        },
      });

      const result = await env.exec(
        'sqlite3 :memory: ".read /seed.sql\nSELECT x FROM t"',
      );

      expect(result.stderr).toBe("");
      expect(result.stdout).toBe("7\n");
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

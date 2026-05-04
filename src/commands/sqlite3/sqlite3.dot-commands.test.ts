/**
 * Dot-command tests for sqlite3.
 *
 * Real sqlite3 supports CLI dot-commands (`.tables`, `.schema`, `.help`,
 * `.read script.sql`, ...). The Braintrust trace catalogue showed agents
 * reach for these by reflex; the preprocessor pins behavior here.
 * D-numbers map to docs/sqlite3-invocation-shapes.md.
 *
 * Contract (see dot-commands.ts for the full rationale):
 *
 *   - The scanner is char-level and tracks SQL string literals and
 *     comments, so `.foo` inside `'…'`, `"…"`, `-- …`, or `/* … *​/`
 *     is left intact. Boundaries are start-of-input, `;`, and `\n`.
 *
 *   - `.tables`, `.schema`, `.indexes`/`.indices`, `.databases`, `.help`
 *     translate to equivalent SQL or SELECTs.
 *
 *   - `.headers` / `.header` / `.mode` / `.separator` / `.nullvalue` /
 *     `.echo` / `.timer` / `.changes` / `.bail` / `.show` / `.eqp` /
 *     `.width` / `.prompt` / `.print` / `.explain` are silently dropped
 *     — surrounding SQL still executes. The CLI exposes the equivalent
 *     options as `-header`, `-csv`, etc.
 *
 *   - `.read`, `.dump`, `.save`, `.import`, etc. translate to a
 *     `SELECT '…' AS error;` so the message rides in stdout in
 *     script-order, exit 0. No actual file inlining.
 *
 *   - `.quit` / `.exit` terminate preprocessing; everything after is
 *     dropped.
 *
 *   - Unknown dot-commands are left in place verbatim so sql.js
 *     produces its native `near ".": syntax error`.
 */
import { describe, expect, it } from "vitest";
import { Bash } from "../../Bash.js";

describe("sqlite3 dot-commands", () => {
  describe("D1: .tables", () => {
    it("lists user tables, excludes sqlite_*", async () => {
      const env = new Bash();
      await env.exec(
        "sqlite3 /db.sqlite 'CREATE TABLE orders(id INT); CREATE TABLE refunds(id INT)'",
      );
      const result = await env.exec('sqlite3 /db.sqlite ".tables"');
      expect(result.stdout).toBe("orders\nrefunds\n");
      expect(result.stderr).toBe("");
      expect(result.exitCode).toBe(0);
    });

    it("filters by quoted LIKE pattern", async () => {
      const env = new Bash();
      await env.exec(
        "sqlite3 /db.sqlite 'CREATE TABLE orders(id INT); CREATE TABLE order_items(id INT); CREATE TABLE refunds(id INT)'",
      );
      const result = await env.exec("sqlite3 /db.sqlite \".tables 'order%'\"");
      expect(result.stdout).toBe("order_items\norders\n");
      expect(result.exitCode).toBe(0);
    });

    it("converts shell-style `*` to SQL `%`", async () => {
      const env = new Bash();
      const result = await env.exec(
        'sqlite3 :memory: "CREATE TABLE users(id INT); CREATE TABLE orders(id INT); .tables user*"',
      );
      expect(result.stdout.trim()).toBe("users");
      expect(result.exitCode).toBe(0);
    });

    it("converts shell-style `?` to SQL `_`", async () => {
      const env = new Bash();
      const result = await env.exec(
        'sqlite3 :memory: "CREATE TABLE ab(id INT); CREATE TABLE abc(id INT); .tables a?"',
      );
      expect(result.stdout.trim()).toBe("ab");
      expect(result.exitCode).toBe(0);
    });

    it("returns empty for empty database", async () => {
      const env = new Bash();
      const result = await env.exec('sqlite3 :memory: ".tables"');
      expect(result.stdout).toBe("");
      expect(result.exitCode).toBe(0);
    });
  });

  describe("D2: .schema", () => {
    it("emits CREATE statements with trailing semicolons", async () => {
      const env = new Bash();
      await env.exec(
        "sqlite3 /db.sqlite 'CREATE TABLE users(id INTEGER PRIMARY KEY, email TEXT NOT NULL)'",
      );
      const result = await env.exec('sqlite3 /db.sqlite ".schema users"');
      expect(result.stdout).toBe(
        "CREATE TABLE users(id INTEGER PRIMARY KEY, email TEXT NOT NULL);\n",
      );
      expect(result.exitCode).toBe(0);
    });

    it("with no pattern dumps all schema", async () => {
      const env = new Bash();
      await env.exec(
        "sqlite3 /db.sqlite 'CREATE TABLE a(x); CREATE TABLE b(y); CREATE INDEX idx_b ON b(y);'",
      );
      const result = await env.exec('sqlite3 /db.sqlite ".schema"');
      expect(result.stdout).toBe(
        "CREATE TABLE a(x);\nCREATE TABLE b(y);\nCREATE INDEX idx_b ON b(y);\n",
      );
      expect(result.exitCode).toBe(0);
    });
  });

  describe("D3: .indexes / .indices", () => {
    it("lists indexes; .indices is an alias", async () => {
      const env = new Bash();
      await env.exec(
        "sqlite3 /db.sqlite 'CREATE TABLE t(x INT); CREATE INDEX idx_t_x ON t(x)'",
      );
      const r1 = await env.exec('sqlite3 /db.sqlite ".indexes"');
      expect(r1.stdout.trim()).toBe("idx_t_x");
      expect(r1.exitCode).toBe(0);

      const r2 = await env.exec('sqlite3 /db.sqlite ".indices"');
      expect(r2.stdout.trim()).toBe("idx_t_x");
      expect(r2.exitCode).toBe(0);
    });

    it("filters by table-name glob", async () => {
      const env = new Bash();
      await env.exec(
        "sqlite3 /db.sqlite 'CREATE TABLE users(id INT); CREATE TABLE orders(id INT); CREATE INDEX users_id ON users(id); CREATE INDEX orders_id ON orders(id)'",
      );
      const result = await env.exec('sqlite3 /db.sqlite ".indexes user*"');
      expect(result.stdout.trim()).toBe("users_id");
      expect(result.exitCode).toBe(0);
    });
  });

  describe("D4: .databases", () => {
    it("reports `main` for an in-memory connection", async () => {
      const env = new Bash();
      const result = await env.exec('sqlite3 :memory: ".databases"');
      expect(result.exitCode).toBe(0);
      expect(result.stdout).toContain("main");
    });
  });

  describe("D5: .help", () => {
    it("emits the supported-commands summary", async () => {
      const env = new Bash();
      const result = await env.exec('sqlite3 :memory: ".help"');
      expect(result.exitCode).toBe(0);
      expect(result.stdout).toContain("Supported dot commands");
      expect(result.stdout).toContain(".tables");
      expect(result.stdout).toContain(".schema");
    });
  });

  describe("D6: silent-drop metacommands", () => {
    // .headers / .header / .mode / .separator / .nullvalue / .echo / .timer
    // / .changes / .bail / .show / .eqp / .width / .prompt / .print / .explain
    // are all silently dropped. The CLI flags (`-header`, `-csv`, etc.) are
    // the supported way to change formatter state mid-stream.

    it(".headers on is dropped — surrounding SQL still runs, no header", async () => {
      const env = new Bash();
      await env.exec(
        "sqlite3 /db.sqlite \"CREATE TABLE t(id INT, name TEXT); INSERT INTO t VALUES (1, 'a')\"",
      );
      const script = `.headers on\nSELECT id, name FROM t`;
      const result = await env.exec(`sqlite3 /db.sqlite '${script}'`);
      expect(result.stdout).toBe("1|a\n");
      expect(result.exitCode).toBe(0);
    });

    it(".mode csv is dropped — output stays in default list mode", async () => {
      const env = new Bash();
      await env.exec(
        `sqlite3 /db.sqlite "CREATE TABLE t(a INT, b TEXT); INSERT INTO t VALUES (1, 'hello')"`,
      );
      const script = `.mode csv\nSELECT * FROM t`;
      const result = await env.exec(`sqlite3 /db.sqlite '${script}'`);
      expect(result.stdout).toBe("1|hello\n");
      expect(result.exitCode).toBe(0);
    });

    it(".separator is dropped — column separator stays as the default `|`", async () => {
      const env = new Bash();
      await env.exec(
        `sqlite3 /db.sqlite "CREATE TABLE t(a INT, b INT); INSERT INTO t VALUES (1, 2)"`,
      );
      const script = `.separator ,\nSELECT * FROM t`;
      const result = await env.exec(`sqlite3 /db.sqlite '${script}'`);
      expect(result.stdout).toBe("1|2\n");
      expect(result.exitCode).toBe(0);
    });

    it(".nullvalue is dropped — NULL fields stay empty", async () => {
      const env = new Bash();
      await env.exec(
        "sqlite3 /db.sqlite 'CREATE TABLE t(x); INSERT INTO t VALUES (NULL), (1)'",
      );
      const script = `.nullvalue NULL\nSELECT * FROM t ORDER BY x`;
      const result = await env.exec(`sqlite3 /db.sqlite '${script}'`);
      expect(result.stdout).toBe("\n1\n");
      expect(result.exitCode).toBe(0);
    });

    it("inline `;`-separated dot-commands and SQL run cleanly", async () => {
      // Real regression case from downstream agent harnesses: the scanner
      // must recognize each `;`-separated segment as its own boundary.
      const env = new Bash();
      const result = await env.exec(
        'sqlite3 :memory: ".headers on; .mode csv; CREATE TABLE t(x); INSERT INTO t VALUES(42); SELECT * FROM t;"',
      );
      expect(result.stdout.trim()).toBe("42");
      expect(result.exitCode).toBe(0);
    });
  });

  describe("D7: .read (unsupported in this sandbox)", () => {
    it("emits an in-band actionable message naming the file", async () => {
      const env = new Bash();
      const result = await env.exec('sqlite3 :memory: ".read /tmp/x.sql"');
      expect(result.exitCode).toBe(0);
      expect(result.stdout).toContain(".read is not supported");
      expect(result.stdout).toContain("cat /tmp/x.sql");
    });

    it("emits an in-band message even with no filename", async () => {
      const env = new Bash();
      const result = await env.exec('sqlite3 :memory: ".read"');
      expect(result.exitCode).toBe(0);
      expect(result.stdout).toContain(".read is not supported");
    });
  });

  describe("D8: .dump / .save / .import / .clone / .restore / .open / etc.", () => {
    it.each([
      [".dump", "query sqlite_master"],
      [".save /tmp/x.db", "redirect with shell"],
      [".backup /tmp/x.db", "redirect with shell"],
      [".import data.csv t", "INSERTs from a SQL script"],
      [".clone other.db", "INSERT INTO ... SELECT"],
      [".restore /tmp/x.db", "open the file directly"],
      [".open other.db", "open the file directly"],
      [".output /tmp/x.txt", "redirect output with shell"],
      [".shell ls", "use bash for shell commands"],
      [".system ls", "use bash for shell commands"],
      [".cd /tmp", "use bash 'cd'"],
      [".load ext.so", "extension loading is disabled"],
    ])("%s emits an in-band SELECT with an actionable hint", async (invocation, hintFragment) => {
      const env = new Bash();
      const result = await env.exec(`sqlite3 :memory: '${invocation}'`);
      expect(result.exitCode).toBe(0);
      expect(result.stdout).toContain(invocation.split(/\s+/, 1)[0]);
      expect(result.stdout).toContain("is not supported");
      expect(result.stdout).toContain(hintFragment);
    });
  });

  describe("D9: unknown dot-commands fall through to sql.js", () => {
    it(".bogus_command produces sql.js's native syntax error", async () => {
      const env = new Bash();
      const result = await env.exec('sqlite3 :memory: ".bogus_command"');
      expect(result.exitCode).toBe(0);
      expect(result.stdout).toContain("syntax error");
    });
  });

  describe("D10: SQL string literals and comments are preserved", () => {
    it("does not corrupt single-quoted string literals containing dot-command-like text", async () => {
      const env = new Bash();
      const result = await env.exec(
        `sqlite3 :memory: "CREATE TABLE t(s TEXT); INSERT INTO t VALUES('node.js'); SELECT * FROM t"`,
      );
      expect(result.exitCode).toBe(0);
      expect(result.stdout.trim()).toBe("node.js");
    });

    it("does not corrupt multiline single-quoted literals containing `\\n.tables`", async () => {
      // Real regression case: a newline-prefixed dot-command-like fragment
      // inside a string literal would be picked up by a line-based scanner
      // and rewritten into a SELECT against sqlite_master, mangling the row.
      const env = new Bash();
      const result = await env.exec(
        `sqlite3 :memory: <<'SQL'\nCREATE TABLE t(s TEXT);\nINSERT INTO t VALUES('a\n.tables');\nSELECT s FROM t;\nSQL`,
      );
      expect(result.exitCode).toBe(0);
      expect(result.stdout).toContain("a\n.tables");
    });

    it("does not translate dot-commands inside SQL `--` line comments", async () => {
      const env = new Bash();
      const result = await env.exec(
        `sqlite3 :memory: <<'SQL'\n-- .read foo.sql\nSELECT 1;\nSQL`,
      );
      expect(result.exitCode).toBe(0);
      expect(result.stdout.trim()).toBe("1");
    });

    it("does not translate dot-commands inside SQL `/* */` block comments", async () => {
      const env = new Bash();
      const result = await env.exec(
        `sqlite3 :memory: <<'SQL'\n/* .read foo.sql */\nSELECT 1;\nSQL`,
      );
      expect(result.exitCode).toBe(0);
      expect(result.stdout.trim()).toBe("1");
    });
  });

  describe("D11: .quit / .exit terminate preprocessing", () => {
    it(".quit stops processing — SQL after it is dropped", async () => {
      const env = new Bash();
      await env.exec(
        "sqlite3 /db.sqlite 'CREATE TABLE t(x INT); INSERT INTO t VALUES (1)'",
      );
      const script = `SELECT * FROM t;\n.quit\nDROP TABLE t`;
      const result = await env.exec(`sqlite3 /db.sqlite '${script}'`);
      expect(result.stdout).toBe("1\n");
      expect(result.exitCode).toBe(0);
      const after = await env.exec(
        "sqlite3 /db.sqlite \"SELECT name FROM sqlite_master WHERE type='table'\"",
      );
      expect(after.stdout).toBe("t\n");
    });

    it(".exit behaves the same as .quit", async () => {
      const env = new Bash();
      await env.exec("sqlite3 /db.sqlite 'CREATE TABLE t(x INT)'");
      const script = `.exit\nDROP TABLE t`;
      const result = await env.exec(`sqlite3 /db.sqlite '${script}'`);
      expect(result.exitCode).toBe(0);
      const after = await env.exec(
        "sqlite3 /db.sqlite \"SELECT name FROM sqlite_master WHERE type='table'\"",
      );
      expect(after.stdout).toBe("t\n");
    });
  });
});

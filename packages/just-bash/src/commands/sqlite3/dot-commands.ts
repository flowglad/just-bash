/**
 * Dot-command preprocessor for sqlite3.
 *
 * Real sqlite3's CLI accepts dot-commands (`.tables`, `.schema`, `.mode csv`,
 * `.read script.sql`, etc.) interleaved with SQL. The sql.js engine doesn't
 * implement these — they're a feature of the CLI, not the library — so we
 * translate them to equivalent SQL or drop them before handing the script
 * to the worker.
 *
 * Scanner: char-level, with state for SQL string literals (`'…'`, `"…"`
 * including the SQL doubled-quote escape `''` / `""`), line comments
 * (`-- …\n`), and block comments (`/* … *​/`). A dot-command is
 * recognized only at a "boundary" — start of input, just after a `;`,
 * or just after a `\n` — and only when not inside a string or comment.
 * This is what lets `'a\n.tables'` round-trip intact and what lets
 * `.headers on; .mode csv; CREATE TABLE…;` be three separate tokens
 * on a single line.
 *
 * Each recognized dot-command resolves to one of four outcomes:
 *
 *   1. SQL replacement — emit equivalent SQL in the dot-command's place.
 *      Used for: .tables, .schema, .indexes/.indices, .databases (sqlite_master
 *      queries / PRAGMA), .help (a SELECT of the help text), and the
 *      "not-supported" family (.read, .dump, .save, .import, .backup,
 *      .restore, .open, .shell, .system, .iotrace, .log, .cd, .load,
 *      .excel, .clone, .output) which become `SELECT '…' AS error;` so
 *      callers see the message in script-order on stdout instead of an
 *      out-of-band exit.
 *
 *   2. Silent drop — recognize and discard, surrounding SQL still runs.
 *      Used for: .headers/.header, .mode, .separator, .nullvalue, .echo,
 *      .timer, .changes, .bail, .show, .eqp, .width, .prompt, .print,
 *      .explain. The CLI exposes `-header`, `-csv`, `-separator`, etc.
 *      for mid-stream formatter changes, so the metacommand form is a
 *      no-op rather than driving formatter state from inside the SQL.
 *
 *   3. Quit — .quit / .exit terminate preprocessing; anything after them
 *      (in the current input or in a future .read'd file, were that
 *      supported) is dropped.
 *
 *   4. Passthrough — unknown dot-commands are left in place verbatim,
 *      so sql.js produces its native "near \".\": syntax error" rather
 *      than us inventing a CLI-shaped error message.
 *
 * Pattern handling: `.tables PAT` and `.schema PAT` and `.indexes PAT`
 * convert shell-glob `*`/`?` to SQL `%`/`_` so `.tables user*` matches
 * the way agents expect.
 */

import type { CommandContext } from "../../types.js";

const SILENT_DROP_COMMANDS: ReadonlySet<string> = new Set([
  ".headers",
  ".header",
  ".mode",
  ".separator",
  ".nullvalue",
  ".echo",
  ".timer",
  ".changes",
  ".bail",
  ".show",
  ".eqp",
  ".width",
  ".prompt",
  ".print",
  ".explain",
]);

const HELP_TEXT =
  "Supported dot commands: .tables [PAT], .schema [PAT], .indexes [TBL] (alias .indices), .databases, .help. " +
  "Stops processing: .quit / .exit. " +
  "Silently dropped (use the matching CLI flag instead): .headers, .header, .mode, .separator, .nullvalue, .echo, .timer, .changes, .bail, .show, .eqp, .width, .prompt, .print, .explain. " +
  "Unsupported (use shell pipes/redirects instead): .read, .dump, .save, .import, .backup, .restore, .open, .shell, .system, .iotrace, .log, .cd, .load, .excel, .clone, .output. " +
  "Unknown commands fall through to sql.js for a native syntax error.";

export interface PreprocessResult {
  /** SQL with dot-commands replaced by equivalent SQL or dropped. */
  sql: string;
  /** Set when .quit / .exit was encountered; everything after is dropped. */
  quit?: true;
}

type Translation =
  | { kind: "sql"; sql: string }
  | { kind: "drop" }
  | { kind: "passthrough" }
  | { kind: "quit" };

/**
 * Tokenize a dot-command's argument tail into a list of strings. Single-
 * and double-quoted segments are honored and their quotes stripped so a
 * caller's `'order%'` becomes the bare argument `order%`. Anything else
 * splits on whitespace.
 */
function tokenizeArgs(tail: string): string[] {
  const tokens: string[] = [];
  let current = "";
  let inQuote: '"' | "'" | null = null;
  let hasContent = false;

  for (let i = 0; i < tail.length; i++) {
    const ch = tail[i];
    if (inQuote) {
      if (ch === inQuote) {
        inQuote = null;
      } else {
        current += ch;
        hasContent = true;
      }
    } else if (ch === '"' || ch === "'") {
      inQuote = ch;
      hasContent = true;
    } else if (ch === " " || ch === "\t" || ch === "\r") {
      if (hasContent) {
        tokens.push(current);
        current = "";
        hasContent = false;
      }
    } else {
      current += ch;
      hasContent = true;
    }
  }
  if (hasContent) tokens.push(current);
  return tokens;
}

function escapeSqlLiteral(s: string): string {
  return s.replace(/'/g, "''");
}

function sqlString(s: string): string {
  return `'${escapeSqlLiteral(s)}'`;
}

/** Convert shell-style glob (`*`, `?`) to SQL LIKE wildcards (`%`, `_`). */
function globToSqlLike(pat: string): string {
  return pat.replace(/\*/g, "%").replace(/\?/g, "_");
}

function notSupportedSelect(
  cmd: string,
  hint: string,
): { kind: "sql"; sql: string } {
  const msg = `sqlite3: ${cmd} is not supported in this sandbox - ${hint}`;
  return { kind: "sql", sql: `SELECT ${sqlString(msg)} AS error;` };
}

function translateDotCommand(cmd: string, args: string[]): Translation {
  if (SILENT_DROP_COMMANDS.has(cmd)) {
    return { kind: "drop" };
  }

  switch (cmd) {
    case ".tables": {
      const pat = args[0];
      const baseFilter =
        "type='table' AND name NOT LIKE 'sqlite~_%' ESCAPE '~'";
      const where = pat
        ? `${baseFilter} AND name LIKE ${sqlString(globToSqlLike(pat))}`
        : baseFilter;
      return {
        kind: "sql",
        sql: `SELECT name FROM sqlite_master WHERE ${where} ORDER BY name;`,
      };
    }
    case ".schema": {
      const pat = args[0];
      const baseFilter =
        "type IN ('table','index','view','trigger') AND sql IS NOT NULL";
      const where = pat
        ? `${baseFilter} AND name LIKE ${sqlString(globToSqlLike(pat))}`
        : baseFilter;
      // Append ';' so output mirrors real sqlite3 .schema (each CREATE ends with ;).
      return {
        kind: "sql",
        sql: `SELECT sql || ';' FROM sqlite_master WHERE ${where} ORDER BY name;`,
      };
    }
    case ".indexes":
    case ".indices": {
      const pat = args[0];
      const where = pat
        ? `type='index' AND tbl_name LIKE ${sqlString(globToSqlLike(pat))}`
        : "type='index'";
      return {
        kind: "sql",
        sql: `SELECT name FROM sqlite_master WHERE ${where} ORDER BY name;`,
      };
    }
    case ".databases": {
      return { kind: "sql", sql: "PRAGMA database_list;" };
    }
    case ".help": {
      return { kind: "sql", sql: `SELECT ${sqlString(HELP_TEXT)} AS help;` };
    }
    case ".quit":
    case ".exit": {
      return { kind: "quit" };
    }
    case ".read": {
      const file = args[0] ?? "FILE";
      return notSupportedSelect(cmd, `use: cat ${file} | sqlite3 DB`);
    }
    case ".dump":
      return notSupportedSelect(
        cmd,
        "query sqlite_master for schema, then emit per-table SELECTs",
      );
    case ".save":
    case ".backup":
      return notSupportedSelect(
        cmd,
        "emit a SELECT and redirect with shell instead",
      );
    case ".import":
      return notSupportedSelect(
        cmd,
        "read the source file with cat and run INSERTs from a SQL script",
      );
    case ".restore":
    case ".open":
      return notSupportedSelect(cmd, "open the file directly: sqlite3 path.db");
    case ".clone":
      return notSupportedSelect(
        cmd,
        "use .schema then INSERT INTO ... SELECT to copy",
      );
    case ".output":
      return notSupportedSelect(cmd, "redirect output with shell > or |");
    case ".shell":
    case ".system":
      return notSupportedSelect(cmd, "use bash for shell commands");
    case ".cd":
      return notSupportedSelect(
        cmd,
        "use bash 'cd' for working-directory changes",
      );
    case ".load":
      return notSupportedSelect(
        cmd,
        "extension loading is disabled in this sandbox",
      );
    case ".iotrace":
    case ".log":
    case ".excel":
      return notSupportedSelect(cmd, "not available in this sandbox");
    default:
      // Unknown dot-command — leave it in place so sql.js produces its
      // native "near \".\": syntax error" rather than us inventing a
      // CLI-shaped error message.
      return { kind: "passthrough" };
  }
}

/**
 * Public entry point. Char-scans the SQL, replacing recognized dot-commands
 * with equivalent SQL (or dropping them), and returns the rewritten SQL.
 *
 * The `_ctx` argument is unused today; it stays in the signature so a
 * future `.read FILE` reintroduction can add file inlining without
 * breaking callers.
 */
export async function preprocessDotCommands(
  sql: string,
  _ctx: { fs: CommandContext["fs"]; cwd: string },
): Promise<PreprocessResult> {
  // Fast path: no `.` at any potential boundary anywhere → nothing to do.
  if (!/(?:^|;|\n)\s*\./.test(sql)) {
    return { sql };
  }

  let out = "";
  let i = 0;
  let atBoundary = true;
  let buffered = "";

  const len = sql.length;

  while (i < len) {
    const ch = sql[i];
    const next = sql[i + 1];

    // SQL string literal: track but do not translate inside.
    if (ch === "'" || ch === '"') {
      out += buffered;
      buffered = "";
      const quote = ch;
      out += ch;
      i++;
      while (i < len) {
        const c = sql[i];
        out += c;
        i++;
        if (c === quote) {
          if (sql[i] === quote) {
            // Doubled-quote escape — consume the second quote and keep going.
            out += sql[i];
            i++;
            continue;
          }
          break;
        }
      }
      atBoundary = false;
      continue;
    }

    // SQL line comment: `-- ...` to end of line. Don't consume the newline;
    // the main loop handles it as a boundary on the next iteration.
    if (ch === "-" && next === "-") {
      out += buffered;
      buffered = "";
      while (i < len && sql[i] !== "\n") {
        out += sql[i];
        i++;
      }
      continue;
    }

    // SQL block comment: `/* ... */`. Not nested in SQLite.
    if (ch === "/" && next === "*") {
      out += buffered;
      buffered = "";
      out += "/*";
      i += 2;
      while (i < len) {
        if (sql[i] === "*" && sql[i + 1] === "/") {
          out += "*/";
          i += 2;
          break;
        }
        out += sql[i];
        i++;
      }
      continue;
    }

    // Statement boundary.
    if (ch === ";" || ch === "\n") {
      out += buffered;
      buffered = "";
      out += ch;
      atBoundary = true;
      i++;
      continue;
    }

    // Whitespace at boundary — buffer until we know whether this line is a
    // dot-command (then drop the buffer) or SQL (then flush it through).
    if (ch === " " || ch === "\t" || ch === "\r") {
      buffered += ch;
      i++;
      continue;
    }

    // Possible dot-command at boundary. The `[a-zA-Z]` guard rejects SQL
    // numeric continuations like `.5` and other non-command dots.
    if (atBoundary && ch === "." && next && /[a-zA-Z]/.test(next)) {
      let j = i + 1;
      const cmdStart = j;
      while (j < len && /[a-zA-Z0-9_]/.test(sql[j] ?? "")) j++;
      const cmd = `.${sql.slice(cmdStart, j).toLowerCase()}`;
      const tail = [];
      while (j < len && sql[j] !== ";" && sql[j] !== "\n") {
        tail.push(sql[j]);
        j++;
      }
      const args = tokenizeArgs(tail.join(""));

      const result = translateDotCommand(cmd, args);

      if (result.kind === "drop") {
        // Discard the command and any whitespace that led up to it.
        buffered = "";
      } else if (result.kind === "passthrough") {
        // Leave the dot-command in place verbatim (sql.js will syntax-error).
        out += buffered;
        buffered = "";
        out += sql.slice(i, j);
      } else if (result.kind === "quit") {
        // Drop everything from here to end of input.
        return { sql: out, quit: true };
      } else {
        out += buffered;
        buffered = "";
        out += result.sql;
      }

      i = j;
      atBoundary = false;
      continue;
    }

    // Regular character — flush buffer, emit, leave boundary.
    out += buffered;
    buffered = "";
    out += ch;
    atBoundary = false;
    i++;
  }

  out += buffered;
  return { sql: out };
}

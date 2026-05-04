/**
 * Dot-command preprocessor for sqlite3.
 *
 * Real sqlite3's CLI accepts dot-commands (`.tables`, `.schema`, `.mode csv`,
 * `.read script.sql`, etc.) interleaved with SQL. The sql.js engine doesn't
 * implement these — they're a feature of the CLI, not the library — so we
 * translate them to equivalent SQL, mutate formatter state, recursively
 * inline `.read`'d files, or surface errors before handing the script to
 * the worker.
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
 * Each recognized dot-command resolves to one of these outcomes:
 *
 *   1. SQL replacement — emit equivalent SQL in the dot-command's place.
 *      Used for: .tables, .schema, .indexes/.indices, .databases (sqlite_master
 *      queries / PRAGMA) and .help (a SELECT of the help text). Also used
 *      for the recursively-inlined contents of a successful `.read FILE`.
 *
 *   2. Formatter mutation — adjust output state for downstream SQL.
 *      Used for: .headers/.header (on/off), .mode <mode>, .separator <s>
 *      [<row>], .nullvalue <text>. Bad arguments surface a preprocessor
 *      error matching real sqlite3's wording (e.g. "Error: unknown mode:
 *      parquet"). Last write wins within a single invocation.
 *
 *   3. Silent drop — recognize and discard, surrounding SQL still runs.
 *      Used for the no-op metacommands the sandbox doesn't implement
 *      (.echo, .timer, .changes, .bail, .show, .eqp, .width, .prompt,
 *      .print, .explain).
 *
 *   4. .read FILE — open the file, recursively run the same scanner on
 *      its contents (sharing the formatter mutation and bumping depth),
 *      and splice the result into the output stream. Missing files,
 *      missing arguments, or exceeding MAX_READ_DEPTH surface a
 *      preprocessor error.
 *
 *   5. .quit / .exit — terminate preprocessing; anything after them is
 *      dropped (including in a parent scanner that called us through
 *      `.read`).
 *
 *   6. Not-implemented family — .dump, .save, .backup, .import, .clone,
 *      .restore, .open, .output, .shell, .system, .cd, .load, .iotrace,
 *      .log, .excel translate to a `SELECT 'Error: …' AS error;` so the
 *      message rides in stdout in script-order without aborting the
 *      surrounding SQL. We don't implement these, but agents reach for
 *      them and an actionable hint is friendlier than a syntax error.
 *
 *   7. Passthrough — unknown dot-commands are left in place verbatim,
 *      so sql.js produces its native "near \".\": syntax error" rather
 *      than us inventing a CLI-shaped error message.
 *
 * Pattern handling: `.tables PAT`, `.schema PAT`, `.indexes PAT` convert
 * shell-glob `*`/`?` to SQL `%`/`_` so `.tables user*` matches the way
 * agents expect.
 */
import type { CommandContext } from "../../types.js";
import type { OutputMode } from "./formatters.js";
export interface FormatterMutation {
    mode?: OutputMode;
    header?: boolean;
    separator?: string;
    newline?: string;
    nullValue?: string;
}
export interface PreprocessResult {
    /** SQL with dot-commands replaced by equivalent SQL or dropped. */
    sql: string;
    /** Accumulated formatter state from .mode / .headers / .separator / .nullvalue. */
    formatterMutation: FormatterMutation;
    /** First dot-command error encountered; preprocessing stops at that point. */
    error?: string;
    /** Set when .quit / .exit was encountered; everything after is dropped. */
    quit?: true;
}
/**
 * Public entry point. Char-scans the SQL, replacing recognized dot-commands
 * with equivalent SQL (or applying formatter mutations / inlining .read'd
 * files / dropping silent no-ops), and returns the rewritten SQL plus the
 * accumulated formatter state.
 */
export declare function preprocessDotCommands(sql: string, ctx: {
    fs: CommandContext["fs"];
    cwd: string;
}): Promise<PreprocessResult>;

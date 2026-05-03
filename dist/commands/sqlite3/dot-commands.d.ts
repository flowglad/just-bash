/**
 * Dot-command preprocessor for sqlite3.
 *
 * Real sqlite3's CLI accepts dot-commands (`.tables`, `.schema`, `.mode csv`,
 * `.read script.sql`, etc.) interleaved with SQL. The sql.js engine doesn't
 * implement these — they're a feature of the CLI, not the library — so we
 * translate them to equivalent SQL or to formatter mutations before handing
 * the script to the worker.
 *
 * Supported:
 *   .tables [pattern]           -> SELECT name FROM sqlite_master ...
 *   .schema [pattern]           -> SELECT sql FROM sqlite_master ...
 *   .indexes [pattern]          -> SELECT name FROM sqlite_master WHERE type='index' ...
 *   .databases                  -> emits a synthetic "main" row (sql.js has no ATTACH-to-file)
 *   .headers on|off             -> formatter mutation
 *   .header  on|off             -> alias of .headers
 *   .mode <mode>                -> formatter mutation (list|csv|json|line|column|table|markdown|tabs|box|quote|html|ascii)
 *   .separator <col> [<row>]    -> formatter mutation
 *   .nullvalue <text>           -> formatter mutation
 *   .read <file>                -> inline file contents (recursive, max depth 8)
 *   .quit / .exit               -> stop processing further input (best-effort)
 *
 * Not supported (returns an error so an agent sees a clear signal):
 *   .import .dump .clone .save .restore .backup .open .shell .system .iotrace
 *
 * Limitation: formatter mutations are global within a single sqlite3
 * invocation. The LAST seen `.mode` / `.headers` / `.separator` wins.
 * Real sqlite3 applies them incrementally; we approximate. This matches
 * the most common agent use case (`.mode csv` followed by SELECTs).
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
    /** SQL with dot-commands replaced by their SQL equivalents. */
    sql: string;
    /** Accumulated formatter mutation (last-write-wins). */
    formatterMutation: FormatterMutation;
    /** First error encountered, if any. */
    error?: string;
    /** Set when .quit/.exit was encountered; everything after is dropped. */
    quit?: true;
}
/**
 * Public entry point. Walks the SQL line by line, replacing dot-commands
 * with equivalent SQL or formatter mutations. Returns the rewritten SQL
 * plus the accumulated mutation to apply to FormatOptions.
 */
export declare function preprocessDotCommands(sql: string, ctx: {
    fs: CommandContext["fs"];
    cwd: string;
}): Promise<PreprocessResult>;

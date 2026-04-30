/**
 * Worker thread for sqlite3 query execution.
 *
 * This isolates potentially long-running queries so they can be
 * terminated if they exceed the timeout.
 *
 * Uses sql.js (WASM-based SQLite) which is fully sandboxed and cannot
 * access the real filesystem.
 *
 * Security: Uses phased defense-in-depth:
 * 1. Init phase: sql.js WASM loads without restrictions
 * 2. Defense phase: Activate full blocking after sql.js init
 * 3. Execute phase: User SQL runs with all dangerous globals blocked
 */
import { type WorkerDefenseStats } from "../../security/index.js";
/**
 * Coerce a host-supplied dbBuffer into the form sql.js expects.
 *
 * Why: Bun's worker_threads structured-clone has regressed across versions
 * (notably the build shipped in Trigger.dev's container) and surfaces a
 * host-side `null` dbBuffer as a zero-length ArrayBuffer here. A truthy
 * empty ArrayBuffer would slip past `if (data.dbBuffer)` and reach
 * `new SQL.Database(arrayBuffer)`, which throws "Expected ArrayBuffer for
 * the first argument" (sql.js wants Uint8Array, not bare ArrayBuffer).
 * Treat empty/non-Uint8Array values as "no buffer" → fresh in-memory db,
 * matching the host's intent for :memory: databases.
 */
export declare function coerceDbBuffer(raw: unknown): Uint8Array | null;
export interface WorkerInput {
    protocolToken: string;
    dbBuffer: Uint8Array | null;
    sql: string;
    options: {
        bail: boolean;
        echo: boolean;
    };
}
export interface WorkerSuccess {
    success: true;
    results: StatementResult[];
    hasModifications: boolean;
    dbBuffer: Uint8Array | null;
    /** Defense-in-depth stats if enabled */
    defenseStats?: WorkerDefenseStats;
}
export interface StatementResult {
    type: "data" | "error";
    columns?: string[];
    rows?: unknown[][];
    error?: string;
}
export interface WorkerError {
    success: false;
    error: string;
    /** Defense-in-depth stats if enabled */
    defenseStats?: WorkerDefenseStats;
}
export type WorkerOutput = WorkerSuccess | WorkerError;

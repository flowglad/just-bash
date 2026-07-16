import type { Writable } from "node:stream";
import { Bash, type JavaScriptConfig } from "../Bash.js";
import type { CommandName } from "../commands/registry.js";
import type { CustomCommand } from "../custom-commands.js";
import type { IFileSystem } from "../fs/interface.js";
import type { NetworkConfig, SecureFetch } from "../network/index.js";
import type { DefenseInDepthConfig } from "../security/types.js";
import type { CommandFinished } from "./Command.js";
import { Command } from "./Command.js";
export interface SandboxOptions {
    cwd?: string;
    env?: Record<string, string>;
    timeoutMs?: number;
    /**
     * Custom filesystem implementation.
     * Mutually exclusive with `overlayRoot`.
     */
    fs?: IFileSystem;
    /**
     * Path to a directory to use as the root of an OverlayFs.
     * Reads come from this directory, writes stay in memory.
     * Mutually exclusive with `fs`.
     */
    overlayRoot?: string;
    maxCallDepth?: number;
    maxCommandCount?: number;
    maxLoopIterations?: number;
    /**
     * Network configuration for commands like curl.
     * Network access is disabled by default - you must explicitly configure allowed URLs.
     */
    network?: NetworkConfig;
    /**
     * Defense-in-depth configuration. Defaults to true (enabled).
     * Monkey-patches dangerous JavaScript globals during bash execution.
     */
    defenseInDepth?: DefenseInDepthConfig | boolean;
    /**
     * Enable the python3/python commands. Disabled by default: Python adds
     * security surface (arbitrary code execution via CPython). Forwarded to
     * the underlying `Bash`.
     */
    python?: boolean;
    /**
     * Enable the js-exec command (sandboxed JavaScript via QuickJS). Accepts a
     * boolean or a {@link JavaScriptConfig} (bootstrap code / `invokeTool`
     * hook). Disabled by default. Forwarded to the underlying `Bash`.
     */
    javascript?: boolean | JavaScriptConfig;
    /**
     * Restrict the registered command set. When omitted, all built-in commands
     * are available; pass a list to allow only those. Forwarded to the
     * underlying `Bash`.
     */
    commands?: CommandName[];
    /**
     * Custom commands registered alongside the built-ins (these take precedence
     * over built-ins with the same name). Forwarded to the underlying `Bash`.
     */
    customCommands?: CustomCommand[];
    /**
     * Custom secure fetch implementation used instead of one derived from
     * `network`. Providing either `fetch` or `network` registers the network
     * commands (curl, wget). Forwarded to the underlying `Bash`.
     */
    fetch?: SecureFetch;
}
export interface RunCommandParams {
    cmd: string;
    args?: string[];
    cwd?: string;
    env?: Record<string, string>;
    /** Run the command with sudo. No-op in just-bash (already runs as root). */
    sudo?: boolean;
    /** Return immediately with a live Command object instead of waiting for completion. */
    detached?: boolean;
    /** Stream standard output to a writable. Written after command completes. */
    stdout?: Writable;
    /** Stream standard error to a writable. Written after command completes. */
    stderr?: Writable;
    signal?: AbortSignal;
}
export interface WriteFilesInput {
    [path: string]: string | {
        content: string;
        encoding?: "utf-8" | "base64";
    };
}
export declare class Sandbox {
    private bashEnv;
    private timeoutMs?;
    private constructor();
    static create(opts?: SandboxOptions): Promise<Sandbox>;
    runCommand(params: RunCommandParams & {
        detached: true;
    }): Promise<Command>;
    runCommand(params: RunCommandParams): Promise<CommandFinished>;
    runCommand(command: string, args: string[], opts?: {
        signal?: AbortSignal;
    }): Promise<CommandFinished>;
    runCommand(command: string, opts?: {
        cwd?: string;
        env?: Record<string, string>;
    }): Promise<CommandFinished>;
    writeFiles(files: WriteFilesInput): Promise<void>;
    readFile(path: string, encoding?: "utf-8" | "base64"): Promise<string>;
    mkDir(path: string, opts?: {
        recursive?: boolean;
    }): Promise<void>;
    stop(): Promise<void>;
    extendTimeout(_ms: number): Promise<void>;
    get domain(): string | undefined;
    /**
     * Bash-specific: Get the underlying Bash instance for advanced operations.
     * Not available in Vercel Sandbox API.
     */
    get bashEnvInstance(): Bash;
}
export { Command };
export type { CommandFinished };
export type { OutputMessage } from "./Command.js";

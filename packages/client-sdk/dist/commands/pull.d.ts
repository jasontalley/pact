/**
 * Pull Command
 *
 * Fetches the latest Main state from the remote Pact server
 * and caches it locally in .pact/main-cache.json.
 *
 * This is the `pact pull` developer command.
 */
import { PullResult } from '../types';
export interface PullCommandOptions {
    /** Remote Pact server URL */
    serverUrl: string;
    /** Project root directory */
    projectRoot: string;
    /** Project ID (for multi-tenant deployments) */
    projectId?: string;
    /** Authentication token */
    authToken?: string;
    /** Request timeout in milliseconds */
    timeout?: number;
    /** Only pull if cache is older than this (milliseconds) */
    maxCacheAge?: number;
    /** Force pull even if cache is fresh */
    force?: boolean;
}
export interface PullCommandResult extends PullResult {
    /** Whether a pull was actually performed (false if cache was fresh) */
    wasPerformed: boolean;
    /** Cache file path */
    cachePath: string;
}
/**
 * Execute the pull command.
 *
 * Fetches the latest Main state from the server and replaces the local cache.
 * This is a simple replace operation - no merge logic needed.
 *
 * @param options - Pull command options
 * @returns Pull result
 */
export declare function pull(options: PullCommandOptions): Promise<PullCommandResult>;
/**
 * Create a pull command with pre-configured options.
 * Useful for CLI tools.
 */
export declare function createPullCommand(defaultOptions: Partial<PullCommandOptions>): (options?: Partial<PullCommandOptions>) => Promise<PullCommandResult>;

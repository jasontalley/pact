/**
 * Pact API Client Module
 *
 * Typed HTTP client for all Pact REST endpoints.
 * Uses only Node.js built-ins (fetch) - no external dependencies.
 */
import { AtomSummary, AtomDetail, MoleculeSummary, AtomTestLinkSummary, PreReadContent, ReconciliationRunStart, ReconciliationResult, AtomRecommendation, CoverageData, MainStateCache, DriftSummary, CIAttestedRun, PaginatedResponse } from './types';
export interface ApiClientOptions {
    /** Server URL */
    serverUrl: string;
    /** Project ID for multi-tenant deployments */
    projectId?: string;
    /** Authentication token */
    authToken?: string;
    /** Request timeout in milliseconds */
    timeout?: number;
}
export interface RequestOptions {
    /** HTTP method */
    method?: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE';
    /** Request body (will be JSON-serialized) */
    body?: unknown;
    /** Additional headers */
    headers?: Record<string, string>;
    /** Query parameters */
    params?: Record<string, string | number | boolean | undefined>;
}
/**
 * Typed API client for Pact server endpoints.
 * Zero dependencies on external packages.
 */
export declare class PactApiClient {
    private readonly serverUrl;
    private readonly projectId?;
    private readonly authToken?;
    private readonly timeout;
    constructor(options: ApiClientOptions);
    /**
     * Start a reconciliation analysis using pre-read content.
     *
     * @param content - Pre-read file content
     * @returns Run start information
     */
    submitPreReadContent(content: PreReadContent): Promise<ReconciliationRunStart>;
    /**
     * Get details of a reconciliation run.
     *
     * @param runId - Run ID
     * @returns Run details including status
     */
    getRunDetails(runId: string): Promise<ReconciliationResult>;
    /**
     * Get recommendations from a reconciliation run.
     *
     * @param runId - Run ID
     * @returns Atom recommendations
     */
    getRecommendations(runId: string): Promise<AtomRecommendation[]>;
    /**
     * Apply selected recommendations from a run.
     *
     * @param runId - Run ID
     * @param recommendations - Array of recommendation tempIds to apply
     * @returns Result of applying recommendations
     */
    applyRecommendations(runId: string, recommendations: string[]): Promise<{
        applied: number;
        atomIds: string[];
    }>;
    /**
     * Poll for run completion.
     *
     * @param runId - Run ID
     * @param pollInterval - Interval in milliseconds (default: 2000)
     * @param maxWait - Maximum wait time in milliseconds (default: 300000 / 5 minutes)
     * @returns Final run result
     */
    waitForCompletion(runId: string, pollInterval?: number, maxWait?: number): Promise<ReconciliationResult>;
    /**
     * List atoms with optional filtering.
     *
     * @param filters - Optional filters
     * @returns Paginated list of atoms
     */
    listAtoms(filters?: {
        status?: 'draft' | 'proposed' | 'committed';
        category?: string;
        page?: number;
        pageSize?: number;
    }): Promise<PaginatedResponse<AtomSummary>>;
    /**
     * Get a single atom by ID.
     *
     * @param id - Atom ID
     * @returns Atom details
     */
    getAtom(id: string): Promise<AtomDetail>;
    /**
     * Commit an atom (change status to committed).
     *
     * @param id - Atom ID
     * @returns Updated atom
     */
    commitAtom(id: string): Promise<AtomSummary>;
    /**
     * List molecules with optional filtering.
     *
     * @param filters - Optional filters
     * @returns Paginated list of molecules
     */
    listMolecules(filters?: {
        lensType?: string;
        page?: number;
        pageSize?: number;
    }): Promise<PaginatedResponse<MoleculeSummary>>;
    /**
     * Get a single molecule by ID.
     *
     * @param id - Molecule ID
     * @returns Molecule details
     */
    getMolecule(id: string): Promise<MoleculeSummary>;
    /**
     * Pull the current Main state snapshot for local caching.
     *
     * @param since - Only include changes since this snapshot version
     * @returns Main state cache data
     */
    pullMainState(since?: number): Promise<MainStateCache>;
    /**
     * Get drift summary (atoms without tests, tests without atoms, etc.).
     *
     * @returns Drift summary
     */
    getDriftSummary(): Promise<DriftSummary>;
    /**
     * List atom-test links.
     *
     * @param filters - Optional filters
     * @returns Paginated list of links
     */
    listAtomTestLinks(filters?: {
        atomId?: string;
        testFile?: string;
        page?: number;
        pageSize?: number;
    }): Promise<PaginatedResponse<AtomTestLinkSummary>>;
    /**
     * Submit a CI-attested reconciliation run.
     * Only CI-attested runs can update canonical state.
     *
     * @param runData - CI attestation data
     * @returns Submitted run result
     */
    submitAttestedRun(runData: CIAttestedRun): Promise<{
        accepted: boolean;
        runId: string;
    }>;
    /**
     * Upload coverage data.
     *
     * @param data - Coverage data
     * @returns Upload result
     */
    uploadCoverage(data: CoverageData): Promise<{
        accepted: boolean;
    }>;
    /**
     * Check server health.
     *
     * @returns Health status
     */
    health(): Promise<{
        status: 'ok' | 'degraded' | 'down';
        version: string;
    }>;
    /**
     * Make an HTTP request to the Pact server.
     */
    private request;
    /**
     * Build the full URL with query parameters.
     */
    private buildUrl;
    /**
     * Build request headers.
     */
    private buildHeaders;
    /**
     * Handle error responses.
     */
    private handleErrorResponse;
    /**
     * Sleep helper for polling.
     */
    private sleep;
}

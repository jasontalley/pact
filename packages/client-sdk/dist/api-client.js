"use strict";
/**
 * Pact API Client Module
 *
 * Typed HTTP client for all Pact REST endpoints.
 * Uses only Node.js built-ins (fetch) - no external dependencies.
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.PactApiClient = void 0;
/**
 * Typed API client for Pact server endpoints.
 * Zero dependencies on external packages.
 */
class PactApiClient {
    serverUrl;
    projectId;
    authToken;
    timeout;
    constructor(options) {
        this.serverUrl = options.serverUrl.replace(/\/$/, ''); // Remove trailing slash
        this.projectId = options.projectId;
        this.authToken = options.authToken;
        this.timeout = options.timeout ?? 30000;
    }
    // ===========================================================================
    // Reconciliation Endpoints
    // ===========================================================================
    /**
     * Start a reconciliation analysis using pre-read content.
     *
     * @param content - Pre-read file content
     * @returns Run start information
     */
    async submitPreReadContent(content) {
        return this.request('/agents/reconciliation/analyze/pre-read', {
            method: 'POST',
            body: content,
        });
    }
    /**
     * Get details of a reconciliation run.
     *
     * @param runId - Run ID
     * @returns Run details including status
     */
    async getRunDetails(runId) {
        return this.request(`/agents/reconciliation/runs/${runId}`);
    }
    /**
     * Get recommendations from a reconciliation run.
     *
     * @param runId - Run ID
     * @returns Atom recommendations
     */
    async getRecommendations(runId) {
        return this.request(`/agents/reconciliation/runs/${runId}/recommendations`);
    }
    /**
     * Apply selected recommendations from a run.
     *
     * @param runId - Run ID
     * @param recommendations - Array of recommendation tempIds to apply
     * @returns Result of applying recommendations
     */
    async applyRecommendations(runId, recommendations) {
        return this.request(`/agents/reconciliation/runs/${runId}/apply`, {
            method: 'POST',
            body: { recommendations },
        });
    }
    /**
     * Poll for run completion.
     *
     * @param runId - Run ID
     * @param pollInterval - Interval in milliseconds (default: 2000)
     * @param maxWait - Maximum wait time in milliseconds (default: 300000 / 5 minutes)
     * @returns Final run result
     */
    async waitForCompletion(runId, pollInterval = 2000, maxWait = 300000) {
        const startTime = Date.now();
        while (Date.now() - startTime < maxWait) {
            const result = await this.getRunDetails(runId);
            if (result.status === 'complete' || result.status === 'failed') {
                return result;
            }
            await this.sleep(pollInterval);
        }
        throw new Error(`Reconciliation run ${runId} did not complete within ${maxWait}ms`);
    }
    // ===========================================================================
    // Atom Endpoints
    // ===========================================================================
    /**
     * List atoms with optional filtering.
     *
     * @param filters - Optional filters
     * @returns Paginated list of atoms
     */
    async listAtoms(filters) {
        return this.request('/atoms', {
            params: filters,
        });
    }
    /**
     * Get a single atom by ID.
     *
     * @param id - Atom ID
     * @returns Atom details
     */
    async getAtom(id) {
        return this.request(`/atoms/${id}`);
    }
    /**
     * Commit an atom (change status to committed).
     *
     * @param id - Atom ID
     * @returns Updated atom
     */
    async commitAtom(id) {
        return this.request(`/atoms/${id}/commit`, {
            method: 'PATCH',
        });
    }
    // ===========================================================================
    // Molecule Endpoints
    // ===========================================================================
    /**
     * List molecules with optional filtering.
     *
     * @param filters - Optional filters
     * @returns Paginated list of molecules
     */
    async listMolecules(filters) {
        return this.request('/molecules', {
            params: filters,
        });
    }
    /**
     * Get a single molecule by ID.
     *
     * @param id - Molecule ID
     * @returns Molecule details
     */
    async getMolecule(id) {
        return this.request(`/molecules/${id}`);
    }
    // ===========================================================================
    // Main State Endpoints (17D)
    // ===========================================================================
    /**
     * Pull the current Main state snapshot for local caching.
     *
     * @param since - Only include changes since this snapshot version
     * @returns Main state cache data
     */
    async pullMainState(since) {
        return this.request('/agents/main-state', {
            params: since !== undefined ? { since } : undefined,
        });
    }
    // ===========================================================================
    // Drift Endpoints
    // ===========================================================================
    /**
     * Get drift summary (atoms without tests, tests without atoms, etc.).
     *
     * @returns Drift summary
     */
    async getDriftSummary() {
        return this.request('/agents/drift/summary');
    }
    /**
     * List atom-test links.
     *
     * @param filters - Optional filters
     * @returns Paginated list of links
     */
    async listAtomTestLinks(filters) {
        return this.request('/agents/links', {
            params: filters,
        });
    }
    // ===========================================================================
    // CI Attestation Endpoints
    // ===========================================================================
    /**
     * Submit a CI-attested reconciliation run.
     * Only CI-attested runs can update canonical state.
     *
     * @param runData - CI attestation data
     * @returns Submitted run result
     */
    async submitAttestedRun(runData) {
        return this.request('/agents/ci/submit', {
            method: 'POST',
            body: runData,
        });
    }
    // ===========================================================================
    // Coverage Endpoints
    // ===========================================================================
    /**
     * Upload coverage data.
     *
     * @param data - Coverage data
     * @returns Upload result
     */
    async uploadCoverage(data) {
        return this.request('/agents/coverage', {
            method: 'POST',
            body: data,
        });
    }
    // ===========================================================================
    // Health/Status Endpoints
    // ===========================================================================
    /**
     * Check server health.
     *
     * @returns Health status
     */
    async health() {
        return this.request('/health');
    }
    // ===========================================================================
    // Internal Request Handling
    // ===========================================================================
    /**
     * Make an HTTP request to the Pact server.
     */
    async request(endpoint, options) {
        const url = this.buildUrl(endpoint, options?.params);
        const headers = this.buildHeaders(options?.headers);
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), this.timeout);
        try {
            const response = await fetch(url, {
                method: options?.method ?? 'GET',
                headers,
                body: options?.body ? JSON.stringify(options.body) : undefined,
                signal: controller.signal,
            });
            clearTimeout(timeoutId);
            if (!response.ok) {
                await this.handleErrorResponse(response);
            }
            const data = await response.json();
            return data;
        }
        catch (error) {
            clearTimeout(timeoutId);
            if (error instanceof Error && error.name === 'AbortError') {
                throw new Error(`Request to ${endpoint} timed out after ${this.timeout}ms`);
            }
            throw error;
        }
    }
    /**
     * Build the full URL with query parameters.
     */
    buildUrl(endpoint, params) {
        const url = new URL(`${this.serverUrl}${endpoint}`);
        // Add project ID as query param if set
        if (this.projectId) {
            url.searchParams.set('projectId', this.projectId);
        }
        // Add additional params
        if (params) {
            for (const [key, value] of Object.entries(params)) {
                if (value !== undefined) {
                    url.searchParams.set(key, String(value));
                }
            }
        }
        return url.toString();
    }
    /**
     * Build request headers.
     */
    buildHeaders(additional) {
        const headers = {
            'Content-Type': 'application/json',
            Accept: 'application/json',
        };
        // Add auth token if set
        if (this.authToken) {
            headers['Authorization'] = `Bearer ${this.authToken}`;
        }
        // Add project ID header if set
        if (this.projectId) {
            headers['x-pact-project-id'] = this.projectId;
        }
        // Merge additional headers
        if (additional) {
            Object.assign(headers, additional);
        }
        return headers;
    }
    /**
     * Handle error responses.
     */
    async handleErrorResponse(response) {
        let errorData;
        try {
            errorData = (await response.json());
        }
        catch {
            errorData = {
                code: 'UNKNOWN_ERROR',
                message: `HTTP ${response.status}: ${response.statusText}`,
                statusCode: response.status,
            };
        }
        const error = new Error(errorData.message);
        error.code = errorData.code;
        error.statusCode = errorData.statusCode;
        error.details = errorData.details;
        throw error;
    }
    /**
     * Sleep helper for polling.
     */
    sleep(ms) {
        return new Promise((resolve) => setTimeout(resolve, ms));
    }
}
exports.PactApiClient = PactApiClient;

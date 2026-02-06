/**
 * Pact API Client Module
 *
 * Typed HTTP client for all Pact REST endpoints.
 * Uses only Node.js built-ins (fetch) - no external dependencies.
 */

import {
  PactClientConfig,
  AtomSummary,
  AtomDetail,
  MoleculeSummary,
  AtomTestLinkSummary,
  PreReadContent,
  ReconciliationRunStart,
  ReconciliationResult,
  AtomRecommendation,
  CoverageData,
  MainStateCache,
  DriftSummary,
  CIAttestedRun,
  ApiResponse,
  ApiError,
  PaginatedResponse,
} from './types';

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
export class PactApiClient {
  private readonly serverUrl: string;
  private readonly projectId?: string;
  private readonly authToken?: string;
  private readonly timeout: number;

  constructor(options: ApiClientOptions) {
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
  async submitPreReadContent(content: PreReadContent): Promise<ReconciliationRunStart> {
    return this.request<ReconciliationRunStart>('/agents/reconciliation/analyze/pre-read', {
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
  async getRunDetails(runId: string): Promise<ReconciliationResult> {
    return this.request<ReconciliationResult>(`/agents/reconciliation/runs/${runId}`);
  }

  /**
   * Get recommendations from a reconciliation run.
   *
   * @param runId - Run ID
   * @returns Atom recommendations
   */
  async getRecommendations(runId: string): Promise<AtomRecommendation[]> {
    return this.request<AtomRecommendation[]>(`/agents/reconciliation/runs/${runId}/recommendations`);
  }

  /**
   * Apply selected recommendations from a run.
   *
   * @param runId - Run ID
   * @param recommendations - Array of recommendation tempIds to apply
   * @returns Result of applying recommendations
   */
  async applyRecommendations(
    runId: string,
    recommendations: string[],
  ): Promise<{ applied: number; atomIds: string[] }> {
    return this.request<{ applied: number; atomIds: string[] }>(
      `/agents/reconciliation/runs/${runId}/apply`,
      {
        method: 'POST',
        body: { recommendations },
      },
    );
  }

  /**
   * Poll for run completion.
   *
   * @param runId - Run ID
   * @param pollInterval - Interval in milliseconds (default: 2000)
   * @param maxWait - Maximum wait time in milliseconds (default: 300000 / 5 minutes)
   * @returns Final run result
   */
  async waitForCompletion(
    runId: string,
    pollInterval: number = 2000,
    maxWait: number = 300000,
  ): Promise<ReconciliationResult> {
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
  async listAtoms(filters?: {
    status?: 'draft' | 'proposed' | 'committed';
    category?: string;
    page?: number;
    pageSize?: number;
  }): Promise<PaginatedResponse<AtomSummary>> {
    return this.request<PaginatedResponse<AtomSummary>>('/atoms', {
      params: filters as Record<string, string | number | boolean | undefined>,
    });
  }

  /**
   * Get a single atom by ID.
   *
   * @param id - Atom ID
   * @returns Atom details
   */
  async getAtom(id: string): Promise<AtomDetail> {
    return this.request<AtomDetail>(`/atoms/${id}`);
  }

  /**
   * Commit an atom (change status to committed).
   *
   * @param id - Atom ID
   * @returns Updated atom
   */
  async commitAtom(id: string): Promise<AtomSummary> {
    return this.request<AtomSummary>(`/atoms/${id}/commit`, {
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
  async listMolecules(filters?: {
    lensType?: string;
    page?: number;
    pageSize?: number;
  }): Promise<PaginatedResponse<MoleculeSummary>> {
    return this.request<PaginatedResponse<MoleculeSummary>>('/molecules', {
      params: filters as Record<string, string | number | boolean | undefined>,
    });
  }

  /**
   * Get a single molecule by ID.
   *
   * @param id - Molecule ID
   * @returns Molecule details
   */
  async getMolecule(id: string): Promise<MoleculeSummary> {
    return this.request<MoleculeSummary>(`/molecules/${id}`);
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
  async pullMainState(since?: number): Promise<MainStateCache> {
    return this.request<MainStateCache>('/agents/main-state', {
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
  async getDriftSummary(): Promise<DriftSummary> {
    return this.request<DriftSummary>('/agents/drift/summary');
  }

  /**
   * List atom-test links.
   *
   * @param filters - Optional filters
   * @returns Paginated list of links
   */
  async listAtomTestLinks(filters?: {
    atomId?: string;
    testFile?: string;
    page?: number;
    pageSize?: number;
  }): Promise<PaginatedResponse<AtomTestLinkSummary>> {
    return this.request<PaginatedResponse<AtomTestLinkSummary>>('/agents/links', {
      params: filters as Record<string, string | number | boolean | undefined>,
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
  async submitAttestedRun(runData: CIAttestedRun): Promise<{ accepted: boolean; runId: string }> {
    return this.request<{ accepted: boolean; runId: string }>('/agents/ci/submit', {
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
  async uploadCoverage(data: CoverageData): Promise<{ accepted: boolean }> {
    return this.request<{ accepted: boolean }>('/agents/coverage', {
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
  async health(): Promise<{ status: 'ok' | 'degraded' | 'down'; version: string }> {
    return this.request<{ status: 'ok' | 'degraded' | 'down'; version: string }>('/health');
  }

  // ===========================================================================
  // Internal Request Handling
  // ===========================================================================

  /**
   * Make an HTTP request to the Pact server.
   */
  private async request<T>(endpoint: string, options?: RequestOptions): Promise<T> {
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
      return data as T;
    } catch (error) {
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
  private buildUrl(endpoint: string, params?: Record<string, string | number | boolean | undefined>): string {
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
  private buildHeaders(additional?: Record<string, string>): Record<string, string> {
    const headers: Record<string, string> = {
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
  private async handleErrorResponse(response: Response): Promise<never> {
    let errorData: ApiError;

    try {
      errorData = (await response.json()) as ApiError;
    } catch {
      errorData = {
        code: 'UNKNOWN_ERROR',
        message: `HTTP ${response.status}: ${response.statusText}`,
        statusCode: response.status,
      };
    }

    const error = new Error(errorData.message) as Error & { code: string; statusCode: number; details?: unknown };
    error.code = errorData.code;
    error.statusCode = errorData.statusCode;
    error.details = errorData.details;

    throw error;
  }

  /**
   * Sleep helper for polling.
   */
  private sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }
}

/**
 * HTTP client for MCP server to call Pact API.
 *
 * The MCP server acts as a proxy, translating MCP tool calls
 * into HTTP requests to the Pact REST API.
 */

const PACT_API_URL = process.env.PACT_API_URL || 'http://localhost:3000';

interface RequestOptions {
  method?: string;
  body?: unknown;
  params?: Record<string, string | number | boolean | undefined>;
}

async function request<T>(path: string, options: RequestOptions = {}): Promise<T> {
  const { method = 'GET', body, params } = options;

  let url = `${PACT_API_URL}${path}`;

  if (params) {
    const searchParams = new URLSearchParams();
    for (const [key, value] of Object.entries(params)) {
      if (value !== undefined && value !== null) {
        searchParams.set(key, String(value));
      }
    }
    const qs = searchParams.toString();
    if (qs) url += `?${qs}`;
  }

  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
  };

  const fetchOptions: RequestInit = { method, headers };
  if (body) {
    fetchOptions.body = JSON.stringify(body);
  }

  const response = await fetch(url, fetchOptions);

  if (!response.ok) {
    const errorBody = await response.text();
    let message: string;
    try {
      const parsed = JSON.parse(errorBody);
      message = parsed.message || errorBody;
    } catch {
      message = errorBody;
    }
    throw new Error(`Pact API error (${response.status}): ${message}`);
  }

  return response.json() as Promise<T>;
}

// ---------- Atom endpoints ----------

export interface AtomData {
  id: string;
  atomId: string;
  description: string;
  category: string;
  qualityScore: number | null;
  status: string;
  supersededBy: string | null;
  createdAt: string;
  committedAt: string | null;
  observableOutcomes: string[];
  falsifiabilityCriteria: string[];
  tags: string[];
  intentIdentity: string | null;
  intentVersion: number;
}

export interface PaginatedAtoms {
  items: AtomData[];
  total: number;
  page: number;
  limit: number;
}

export async function getAtom(id: string): Promise<AtomData> {
  return request<AtomData>(`/atoms/${id}`);
}

export async function listAtoms(filters?: {
  status?: string;
  category?: string;
  search?: string;
  tags?: string[];
  limit?: number;
  page?: number;
}): Promise<PaginatedAtoms> {
  const params: Record<string, string | number | undefined> = {};
  if (filters?.status) params.status = filters.status;
  if (filters?.category) params.category = filters.category;
  if (filters?.search) params.search = filters.search;
  if (filters?.limit) params.limit = filters.limit;
  if (filters?.page) params.page = filters.page;

  return request<PaginatedAtoms>('/atoms', { params });
}

export async function searchAtoms(
  query: string,
  filters?: {
    category?: string;
    status?: string;
    limit?: number;
  },
): Promise<PaginatedAtoms> {
  const params: Record<string, string | number | undefined> = {
    search: query,
  };
  if (filters?.category) params.category = filters.category;
  if (filters?.status) params.status = filters.status;
  if (filters?.limit) params.limit = filters.limit;

  return request<PaginatedAtoms>('/atoms', { params });
}

export interface SuggestAtomRequest {
  description: string;
  category: 'functional' | 'security' | 'performance' | 'ux' | 'operational';
  rationale: string;
  relatedAtomId?: string;
  validators?: string[];
}

export interface SuggestAtomResponse {
  atomId: string;
  status: string;
  scope: string;
  message: string;
  reviewUrl: string;
}

export async function suggestAtom(req: SuggestAtomRequest): Promise<SuggestAtomResponse> {
  return request<SuggestAtomResponse>('/atoms', {
    method: 'POST',
    body: {
      ...req,
      status: 'proposed',
      source: 'agent_inference',
      proposedBy: 'claude-code',
    },
  });
}

export async function getImplementableAtoms(filters?: {
  limit?: number;
  category?: string;
  minCoverage?: number;
  includeProposed?: boolean;
}): Promise<AtomData[]> {
  const params: Record<string, string | number | undefined> = {
    status: 'committed',
  };
  if (filters?.category) params.category = filters.category;
  if (filters?.limit) params.limit = filters.limit;
  // Note: Coverage filtering would need backend support

  return request<PaginatedAtoms>('/atoms', { params }).then((result) => result.items);
}

// ---------- Test record endpoints ----------

export interface TestRecordData {
  id: string;
  filePath: string;
  testName: string;
  status: string;
  hadAtomAnnotation: boolean;
  linkedAtomId: string | null;
  atomRecommendationId: string | null;
}

export async function getTestRecordsForFile(testFilePath: string): Promise<TestRecordData[]> {
  // Use the reconciliation runs approach: query test records by file path
  const params: Record<string, string> = { filePath: testFilePath };
  try {
    return await request<TestRecordData[]>('/test-records', { params });
  } catch {
    // Endpoint might not exist yet; return empty
    return [];
  }
}

// ---------- Metrics endpoints ----------

export interface EpistemicMetrics {
  proven: { count: number; percentage: number };
  committed: { count: number; percentage: number };
  inferred: { count: number; percentage: number };
  unknown: { orphanTestsCount: number; uncoveredCodeFilesCount: number };
  totalCertainty: number;
  timestamp: string;
}

export interface CouplingMetrics {
  atomTestCoupling: {
    totalAtoms: number;
    atomsWithTests: number;
    rate: number;
    orphanAtoms: Array<{ id: string; atomId: string; description: string; status: string }>;
  };
  testAtomCoupling: {
    totalTests: number;
    testsWithAtoms: number;
    rate: number;
    orphanTests: Array<{ id: string; filePath: string; testName: string; status: string }>;
  };
  codeAtomCoverage: {
    totalSourceFiles: number;
    filesWithAtoms: number;
    rate: number;
    uncoveredFiles: string[];
  };
  timestamp: string;
}

export async function getEpistemicMetrics(): Promise<EpistemicMetrics> {
  return request<EpistemicMetrics>('/metrics/epistemic');
}

export async function getCouplingMetrics(): Promise<CouplingMetrics> {
  return request<CouplingMetrics>('/metrics/coupling');
}

// ---------- Intent history ----------

export async function getIntentHistory(intentIdentity: string): Promise<AtomData[]> {
  return request<AtomData[]>(`/atoms/intent/${intentIdentity}`);
}

export async function getAtomVersionHistory(atomId: string): Promise<{
  intentIdentity: string;
  versions: AtomData[];
  currentVersion: AtomData;
}> {
  return request(`/atoms/${atomId}/versions`);
}

// ---------- Conflicts ----------

export interface ConflictData {
  id: string;
  conflictType: string;
  atomIdA: string;
  atomIdB: string;
  testRecordId: string | null;
  similarityScore: number | null;
  description: string;
  status: string;
  resolution: unknown;
  createdAt: string;
  resolvedAt: string | null;
}

export async function getConflicts(filters?: {
  status?: string;
  type?: string;
  atomId?: string;
}): Promise<ConflictData[]> {
  const params: Record<string, string | undefined> = {};
  if (filters?.status) params.status = filters.status;
  if (filters?.type) params.type = filters.type;
  if (filters?.atomId) params.atomId = filters.atomId;

  return request<ConflictData[]>('/conflicts', { params });
}

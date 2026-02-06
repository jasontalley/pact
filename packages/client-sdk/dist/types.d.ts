/**
 * @pact/client-sdk Type Definitions
 *
 * Shared types for API requests/responses, file manifests, and sync payloads.
 * Aligned with server-side DTOs.
 */
export interface PactClientConfig {
    /** Remote Pact server URL */
    serverUrl: string;
    /** Project ID for multi-tenant deployments */
    projectId?: string;
    /** Authentication token */
    authToken?: string;
    /** Local project root directory */
    projectRoot: string;
    /** Request timeout in milliseconds (default: 30000) */
    timeout?: number;
}
export interface FileEntry {
    /** File path relative to project root */
    path: string;
    /** Whether this is a directory */
    isDirectory: boolean;
    /** File size in bytes (optional) */
    size?: number;
}
export interface ListOptions {
    /** Include file type information */
    withFileTypes?: boolean;
    /** Recurse into subdirectories */
    recursive?: boolean;
}
export interface FileManifest {
    /** All files in the project */
    files: string[];
    /** Test files (*.spec.ts, *.test.ts, etc.) */
    testFiles: string[];
    /** Source files (non-test TypeScript/JavaScript) */
    sourceFiles: string[];
    /** Documentation files (*.md) */
    docFiles: string[];
    /** Total file count */
    totalCount: number;
    /** Generated at timestamp */
    generatedAt: Date;
}
export interface ReadContent {
    /** File manifest */
    manifest: FileManifest;
    /** File contents map (path → content) */
    contents: Map<string, string>;
    /** Total size in bytes */
    totalSize: number;
    /** Git commit hash (if available) */
    commitHash?: string;
}
export interface AtomSummary {
    /** Unique atom ID */
    id: string;
    /** Atom description */
    description: string;
    /** Atom category */
    category: 'functional' | 'performance' | 'security' | 'ux' | 'operational';
    /** Current status */
    status: 'draft' | 'proposed' | 'committed';
    /** Quality score (0-100) */
    qualityScore?: number;
    /** Creation timestamp */
    createdAt: Date;
    /** Last update timestamp */
    updatedAt: Date;
}
export interface AtomDetail extends AtomSummary {
    /** Full atom content/specification */
    content: string;
    /** Source intent (where this atom came from) */
    sourceIntent?: string;
    /** Tags for organization */
    tags: string[];
    /** Related atom IDs */
    relatedAtomIds: string[];
}
export interface MoleculeSummary {
    /** Unique molecule ID */
    id: string;
    /** Molecule name */
    name: string;
    /** Molecule description */
    description: string;
    /** Lens type for categorization */
    lensType: 'user_story' | 'feature' | 'journey' | 'epic' | 'release' | 'capability' | 'custom';
    /** Custom lens label (when lensType is 'custom') */
    lensLabel?: string;
    /** Parent molecule ID (for nesting) */
    parentMoleculeId?: string;
    /** Atom IDs contained in this molecule */
    atomIds: string[];
    /** Tags for organization */
    tags: string[];
    /** Creation timestamp */
    createdAt: Date;
}
export interface AtomTestLinkSummary {
    /** Unique link ID */
    id: string;
    /** Linked atom ID */
    atomId: string;
    /** Test file path */
    testFilePath: string;
    /** Test case name/description */
    testCaseName?: string;
    /** Line number of the @atom annotation */
    lineNumber?: number;
    /** Confidence score (0-1) */
    confidence: number;
    /** Whether this is CI-attested (canonical) or local (plausible) */
    isAttested: boolean;
}
export interface ReconciliationOptions {
    /** Run mode (defaults to fullscan) */
    mode?: 'fullscan' | 'delta';
    /** Include source file analysis */
    includeSourceFiles?: boolean;
    /** Include documentation */
    includeDocs?: boolean;
    /** Maximum files to process */
    maxFiles?: number;
    /** Git ref for delta mode (e.g., 'main', 'HEAD~1') */
    deltaBase?: string;
}
export interface PreReadContent {
    /** Root directory path */
    rootDirectory: string;
    /** File manifest */
    manifest: {
        files: string[];
        testFiles: string[];
        sourceFiles: string[];
    };
    /** File contents (path → content) */
    fileContents: Record<string, string>;
    /** Git commit hash */
    commitHash?: string;
    /** Reconciliation options */
    options?: ReconciliationOptions;
}
export interface ReconciliationRunStart {
    /** Unique run ID */
    runId: string;
    /** Run status */
    status: 'started' | 'processing' | 'review' | 'complete' | 'failed';
    /** Start timestamp */
    startedAt: Date;
    /** Estimated completion (if available) */
    estimatedCompletion?: Date;
}
export interface AtomRecommendation {
    /** Temporary ID for this recommendation */
    tempId: string;
    /** Recommended atom description */
    description: string;
    /** Recommended category */
    category: 'functional' | 'performance' | 'security' | 'ux' | 'operational';
    /** Test files that evidence this atom */
    testFiles: string[];
    /** Confidence score (0-1) */
    confidence: number;
    /** Rationale for this recommendation */
    rationale: string;
    /** Whether to auto-commit (based on confidence threshold) */
    autoCommit: boolean;
}
export interface MoleculeRecommendation {
    /** Temporary ID for this recommendation */
    tempId: string;
    /** Recommended molecule name */
    name: string;
    /** Recommended description */
    description: string;
    /** Lens type */
    lensType: 'user_story' | 'feature' | 'journey' | 'epic' | 'release' | 'capability' | 'custom';
    /** Atom temp IDs to include */
    atomTempIds: string[];
    /** Confidence score (0-1) */
    confidence: number;
}
export interface ReconciliationResult {
    /** Run ID */
    runId: string;
    /** Final status */
    status: 'complete' | 'failed';
    /** Atom recommendations */
    atomRecommendations: AtomRecommendation[];
    /** Molecule recommendations */
    moleculeRecommendations: MoleculeRecommendation[];
    /** Orphan test files (no atom linkage found) */
    orphanTests: string[];
    /** Duration in milliseconds */
    durationMs: number;
    /** Completion timestamp */
    completedAt: Date;
}
export interface AnnotationPatch {
    /** Target file path */
    filePath: string;
    /** Line number to insert before */
    lineNumber: number;
    /** Annotation to insert (e.g., '// @atom IA-001') */
    annotation: string;
    /** Atom ID being linked */
    atomId: string;
    /** Preview of surrounding context */
    context?: {
        before: string[];
        after: string[];
    };
}
export interface PatchResult {
    /** File path that was patched */
    filePath: string;
    /** Whether the patch was successful */
    success: boolean;
    /** Error message if failed */
    error?: string;
    /** New file content (if preview mode) */
    preview?: string;
}
export interface CoverageData {
    /** Coverage format (istanbul, c8, lcov) */
    format: 'istanbul' | 'c8' | 'lcov';
    /** Statement coverage percentage */
    statements: number;
    /** Branch coverage percentage */
    branches: number;
    /** Function coverage percentage */
    functions: number;
    /** Line coverage percentage */
    lines: number;
    /** File-level coverage details */
    files: CoverageFileSummary[];
    /** Test run timestamp */
    timestamp: Date;
    /** Git commit hash */
    commitHash?: string;
}
export interface CoverageFileSummary {
    /** File path */
    path: string;
    /** Statement coverage percentage */
    statements: number;
    /** Branch coverage percentage */
    branches: number;
    /** Function coverage percentage */
    functions: number;
    /** Line coverage percentage */
    lines: number;
    /** Uncovered line numbers */
    uncoveredLines: number[];
}
export interface MainStateCache {
    /** Cached atoms from Pact Main */
    atoms: AtomSummary[];
    /** Cached molecules from Pact Main */
    molecules: MoleculeSummary[];
    /** Cached atom-test links */
    atomTestLinks: AtomTestLinkSummary[];
    /** Snapshot version number */
    snapshotVersion: number;
    /** When this cache was pulled */
    pulledAt: Date;
    /** Server URL this was pulled from */
    serverUrl: string;
    /** Project ID (if multi-tenant) */
    projectId?: string;
}
export interface PullResult {
    /** Number of atoms pulled */
    atomCount: number;
    /** Number of molecules pulled */
    moleculeCount: number;
    /** Number of atom-test links pulled */
    linkCount: number;
    /** Snapshot version */
    snapshotVersion: number;
    /** Pull timestamp */
    pulledAt: Date;
}
export interface LocalReconciliationReport {
    /** Plausible atom-test links found locally */
    plausibleLinks: {
        atomId: string;
        testFile: string;
        confidence: number;
    }[];
    /** Test files with no atom linkage */
    orphanTests: string[];
    /** Atoms with no test coverage */
    uncoveredAtoms: string[];
    /** Quality summary */
    qualitySummary?: {
        averageScore: number;
        gradeDistribution: Record<string, number>;
    };
    /** When this report was generated */
    generatedAt: Date;
    /** Git commit hash at generation time */
    commitHash?: string;
    /** Warning: this is advisory only */
    isAdvisory: true;
}
export interface CIAttestedRun {
    /** Run ID */
    runId: string;
    /** CI provider (github, gitlab, jenkins, etc.) */
    ciProvider: string;
    /** CI run/job ID */
    ciRunId: string;
    /** Git commit hash */
    commitHash: string;
    /** Git branch */
    branch: string;
    /** Whether this was on the integration target branch */
    isIntegrationTarget: boolean;
    /** Attestation timestamp */
    attestedAt: Date;
    /** Reconciliation result */
    result: ReconciliationResult;
    /** Coverage data (if available) */
    coverage?: CoverageData;
}
export interface DriftSummary {
    /** Total drift items */
    totalDriftItems: number;
    /** Atoms with no test coverage */
    uncoveredAtoms: number;
    /** Tests with no atom linkage */
    orphanTests: number;
    /** Stale atom-test links */
    staleLinks: number;
    /** Last canonical run date */
    lastCanonicalRun?: Date;
    /** Days since last canonical run */
    daysSinceCanonical?: number;
}
export interface ApiResponse<T> {
    /** Response data */
    data: T;
    /** Response metadata */
    meta?: {
        timestamp: Date;
        version: string;
    };
}
export interface ApiError {
    /** Error code */
    code: string;
    /** Error message */
    message: string;
    /** Additional details */
    details?: Record<string, unknown>;
    /** HTTP status code */
    statusCode: number;
}
export interface PaginatedResponse<T> {
    /** Response items */
    items: T[];
    /** Total count */
    total: number;
    /** Current page */
    page: number;
    /** Items per page */
    pageSize: number;
    /** Whether there are more pages */
    hasMore: boolean;
}

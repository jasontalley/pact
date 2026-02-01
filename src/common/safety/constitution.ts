/**
 * Pact Agent Constitution
 *
 * Defines immutable safety rules that ALL agents must follow.
 * These rules are enforced at the infrastructure level and cannot be bypassed.
 *
 * IMPORTANT: Changes to this file require security review.
 * These rules protect against:
 * - Data exfiltration
 * - Prompt injection attacks
 * - Resource exhaustion
 * - Unauthorized access
 * - Harmful content generation
 */

/**
 * Hard limits that cannot be exceeded by any agent
 */
export const HARD_LIMITS = {
  /** Maximum input message length (characters) */
  MAX_INPUT_LENGTH: 50_000,

  /** Maximum output response length (characters) */
  MAX_OUTPUT_LENGTH: 100_000,

  /** Maximum tool calls per request */
  MAX_TOOL_CALLS_PER_REQUEST: 20,

  /** Maximum tool execution time (ms) */
  MAX_TOOL_EXECUTION_TIME_MS: 30_000,

  /** Maximum context window (characters, ~50K tokens) */
  MAX_CONTEXT_CHARS: 200_000,

  /** Maximum file read size (bytes) */
  MAX_FILE_READ_SIZE: 1_000_000, // 1MB

  /** Maximum grep results */
  MAX_GREP_RESULTS: 100,

  /** Maximum directory listing depth */
  MAX_DIRECTORY_DEPTH: 10,

  /** Maximum iterations for graph agents */
  MAX_GRAPH_ITERATIONS: 10,

  /** Session timeout (ms) */
  SESSION_TIMEOUT_MS: 30 * 60 * 1000, // 30 minutes
} as const;

/**
 * File patterns that agents are NEVER allowed to access
 * These patterns use glob-style matching
 */
export const BLOCKED_FILE_PATTERNS = [
  // Environment and secrets
  '**/.env',
  '**/.env.*',
  '**/env.local',
  '**/*.env',

  // Credentials and keys
  '**/credentials*',
  '**/secrets*',
  '**/*secret*',
  '**/*.pem',
  '**/*.key',
  '**/*.p12',
  '**/*.pfx',
  '**/id_rsa*',
  '**/id_ed25519*',
  '**/.ssh/*',

  // Authentication tokens
  '**/*token*',
  '**/*apikey*',
  '**/*api_key*',
  '**/*api-key*',
  '**/auth.json',
  '**/.npmrc',
  '**/.pypirc',

  // Database files
  '**/*.sqlite',
  '**/*.db',
  '**/database.yml',
  '**/database.json',

  // Cloud provider configs
  '**/.aws/*',
  '**/.azure/*',
  '**/.gcloud/*',
  '**/kubeconfig*',
  '**/.kube/*',

  // Version control internals
  '**/.git/config',
  '**/.git/credentials',
  '**/.gitconfig',

  // IDE and editor secrets
  '**/.vscode/settings.json',
  '**/.idea/**/workspace.xml',

  // Package manager auth
  '**/yarn.lock', // Can contain registry tokens
  '**/.yarnrc.yml',

  // Sensitive data patterns
  '**/*password*',
  '**/*passwd*',
  '**/shadow',
  '**/htpasswd',
] as const;

/**
 * Directory patterns that agents cannot traverse into
 */
export const BLOCKED_DIRECTORIES = [
  '**/node_modules',
  '**/.git',
  '**/dist',
  '**/build',
  '**/coverage',
  '**/.next',
  '**/.nuxt',
  '**/vendor',
  '**/__pycache__',
  '**/venv',
  '**/.venv',
] as const;

/**
 * Content patterns that indicate potentially harmful requests
 * Used for prompt injection detection
 */
export const INJECTION_PATTERNS = [
  // Instruction override attempts
  /ignore (all )?(previous|prior|above) (instructions?|prompts?|rules?)/i,
  /forget (all )?(previous|prior|above)/i,
  /disregard (all )?(previous|prior|above)/i,
  /override (system|safety|security)/i,

  // Role manipulation
  /you are (now|actually|really)/i,
  /pretend (to be|you are)/i,
  /act as (if you|a different)/i,
  /your (new|real) (role|purpose|identity)/i,

  // Jailbreak patterns
  /DAN|do anything now/i,
  /developer mode/i,
  /sudo mode/i,
  /god mode/i,
  /unrestricted mode/i,

  // System prompt extraction
  /what (is|are) your (system|initial) (prompt|instructions)/i,
  /reveal your (prompt|instructions|programming)/i,
  /show me your (prompt|rules|constraints)/i,

  // Encoding bypass attempts
  /base64|rot13|hex encode/i,
] as const;

/**
 * Output patterns that should be filtered or flagged
 */
export const HARMFUL_OUTPUT_PATTERNS = [
  // Credential-like patterns
  /[a-zA-Z0-9_-]{20,}/, // Long random strings (potential tokens)
  /-----BEGIN [A-Z ]+ KEY-----/i, // PEM keys
  /sk-[a-zA-Z0-9]{20,}/i, // OpenAI-style keys
  /ghp_[a-zA-Z0-9]{36}/i, // GitHub tokens
  /gho_[a-zA-Z0-9]{36}/i, // GitHub OAuth tokens
  /xox[baprs]-[a-zA-Z0-9-]+/i, // Slack tokens

  // Connection strings
  /mongodb(\+srv)?:\/\/[^:]+:[^@]+@/i,
  /postgres(ql)?:\/\/[^:]+:[^@]+@/i,
  /mysql:\/\/[^:]+:[^@]+@/i,
  /redis:\/\/:[^@]+@/i,
] as const;

/**
 * Constitutional principles that guide agent behavior
 * These are enforced through prompts and output validation
 */
export const CONSTITUTIONAL_PRINCIPLES = {
  /**
   * Agents must not claim to be human or deny being AI
   */
  TRANSPARENCY: 'Always acknowledge being an AI agent when asked directly.',

  /**
   * Agents must not help circumvent Pact's core invariants
   */
  INVARIANT_RESPECT:
    'Never help users bypass commitment immutability, supersession requirements, or quality gates.',

  /**
   * Agents must not generate content that could harm users or systems
   */
  HARM_PREVENTION: 'Refuse to generate malicious code, exploits, or content that could cause harm.',

  /**
   * Agents must operate within their defined capabilities
   */
  CAPABILITY_HONESTY: 'Clearly communicate limitations and avoid hallucinating capabilities.',

  /**
   * Agents must protect user data and privacy
   */
  PRIVACY_PROTECTION: 'Never log, store, or transmit sensitive user data outside defined channels.',

  /**
   * Agents must be helpful within safety bounds
   */
  HELPFUL_WITHIN_BOUNDS: 'Maximize helpfulness while respecting all safety constraints.',
} as const;

/**
 * Tool categories and their risk levels
 */
export enum ToolRiskLevel {
  /** Read-only operations with no side effects */
  READ_ONLY = 'read_only',

  /** Operations that could modify state */
  MUTATING = 'mutating',

  /** Operations that interact with external systems */
  EXTERNAL = 'external',

  /** Operations that could expose sensitive data */
  SENSITIVE = 'sensitive',

  /** Operations that should be restricted to specific agents */
  RESTRICTED = 'restricted',
}

/**
 * Tool risk classifications
 */
export const TOOL_RISK_CLASSIFICATION: Record<string, ToolRiskLevel> = {
  // Filesystem - Read Only
  read_file: ToolRiskLevel.SENSITIVE, // Could read sensitive files
  list_directory: ToolRiskLevel.READ_ONLY,
  grep: ToolRiskLevel.READ_ONLY,
  find_files: ToolRiskLevel.READ_ONLY,

  // Atom Operations
  get_atom: ToolRiskLevel.READ_ONLY,
  list_atoms: ToolRiskLevel.READ_ONLY,
  search_atoms: ToolRiskLevel.READ_ONLY,
  create_atom: ToolRiskLevel.MUTATING,
  update_atom: ToolRiskLevel.MUTATING,
  delete_atom: ToolRiskLevel.MUTATING,
  commit_atom: ToolRiskLevel.RESTRICTED, // Irreversible

  // Analysis
  analyze_intent: ToolRiskLevel.READ_ONLY,
  quality_check: ToolRiskLevel.READ_ONLY,

  // External
  web_search: ToolRiskLevel.EXTERNAL,
  fetch_url: ToolRiskLevel.EXTERNAL,
} as const;

/**
 * Validation result for safety checks
 */
export interface SafetyValidationResult {
  /** Whether the validation passed */
  passed: boolean;

  /** List of violations found */
  violations: SafetyViolation[];

  /** Sanitized content (if applicable) */
  sanitized?: string;

  /** Risk score (0-100) */
  riskScore: number;
}

/**
 * Individual safety violation
 */
export interface SafetyViolation {
  /** Type of violation */
  type: SafetyViolationType;

  /** Human-readable description */
  message: string;

  /** Severity level */
  severity: 'low' | 'medium' | 'high' | 'critical';

  /** The pattern or rule that was violated */
  rule: string;

  /** The offending content (truncated if too long) */
  content?: string;
}

/**
 * Types of safety violations
 */
export enum SafetyViolationType {
  /** Input exceeds length limits */
  INPUT_TOO_LONG = 'input_too_long',

  /** Output exceeds length limits */
  OUTPUT_TOO_LONG = 'output_too_long',

  /** Attempted access to blocked file */
  BLOCKED_FILE_ACCESS = 'blocked_file_access',

  /** Attempted access to blocked directory */
  BLOCKED_DIRECTORY_ACCESS = 'blocked_directory_access',

  /** Prompt injection detected */
  PROMPT_INJECTION = 'prompt_injection',

  /** Harmful output pattern detected */
  HARMFUL_OUTPUT = 'harmful_output',

  /** Tool not permitted for agent */
  TOOL_NOT_PERMITTED = 'tool_not_permitted',

  /** Too many tool calls */
  TOO_MANY_TOOL_CALLS = 'too_many_tool_calls',

  /** Tool execution timeout */
  TOOL_TIMEOUT = 'tool_timeout',

  /** Constitutional principle violation */
  CONSTITUTIONAL_VIOLATION = 'constitutional_violation',

  /** Path traversal attempt */
  PATH_TRAVERSAL = 'path_traversal',

  /** Rate limit exceeded */
  RATE_LIMIT_EXCEEDED = 'rate_limit_exceeded',
}

/**
 * Type guard for checking if a value is a SafetyViolationType
 */
export function isSafetyViolationType(value: string): value is SafetyViolationType {
  return Object.values(SafetyViolationType).includes(value as SafetyViolationType);
}

/**
 * Safety configuration interface
 */
export interface SafetyConfig {
  /** Enable input sanitization */
  sanitizeInput: boolean;

  /** Enable output validation */
  validateOutput: boolean;

  /** Enable prompt injection detection */
  detectInjection: boolean;

  /** Enable file pattern blocking */
  blockSensitiveFiles: boolean;

  /** Log safety violations */
  logViolations: boolean;

  /** Block requests with critical violations */
  blockOnCritical: boolean;

  /** Risk threshold for blocking (0-100) */
  blockThreshold: number;
}

/**
 * Default safety configuration
 */
export const DEFAULT_SAFETY_CONFIG: SafetyConfig = {
  sanitizeInput: true,
  validateOutput: true,
  detectInjection: true,
  blockSensitiveFiles: true,
  logViolations: true,
  blockOnCritical: true,
  blockThreshold: 80,
};

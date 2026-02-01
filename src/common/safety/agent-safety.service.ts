/**
 * Agent Safety Service
 *
 * Unified coordinator for all agent safety mechanisms.
 * This is the primary interface for safety checks throughout the system.
 */

import { Injectable, Logger } from '@nestjs/common';
import { InputSanitizerService, SanitizeOptions } from './input-sanitizer.service';
import { OutputValidatorService, ValidateOutputOptions } from './output-validator.service';
import { ToolPermissionsService, AgentProfile } from './tool-permissions.service';
import {
  HARD_LIMITS,
  CONSTITUTIONAL_PRINCIPLES,
  SafetyValidationResult,
  SafetyViolation,
  SafetyViolationType,
  SafetyConfig,
  DEFAULT_SAFETY_CONFIG,
} from './constitution';

/**
 * Request context for safety validation
 */
export interface SafetyContext {
  /** Agent ID performing the request */
  agentId: string;

  /** Session ID (for rate limiting) */
  sessionId?: string;

  /** User ID (if authenticated) */
  userId?: string;

  /** Request timestamp */
  timestamp: Date;

  /** Workspace root for file operations */
  workspaceRoot: string;
}

/**
 * Complete validation result for a request
 */
export interface RequestValidationResult {
  /** Whether the request is allowed to proceed */
  allowed: boolean;

  /** Input validation result */
  inputValidation: SafetyValidationResult;

  /** Tool permission validation */
  toolValidation?: {
    allowedTools: string[];
    deniedTools: SafetyViolation[];
  };

  /** Overall risk score */
  overallRiskScore: number;

  /** Sanitized input (if applicable) */
  sanitizedInput?: string;

  /** All violations across all checks */
  allViolations: SafetyViolation[];

  /** Agent profile used */
  agentProfile: AgentProfile;
}

/**
 * Response validation result
 */
export interface ResponseValidationResult {
  /** Whether the response is safe to return */
  safe: boolean;

  /** Output validation result */
  outputValidation: SafetyValidationResult;

  /** Sanitized output */
  sanitizedOutput: string;

  /** Risk score */
  riskScore: number;
}

@Injectable()
export class AgentSafetyService {
  private readonly logger = new Logger(AgentSafetyService.name);
  private config: SafetyConfig;

  constructor(
    private readonly inputSanitizer: InputSanitizerService,
    private readonly outputValidator: OutputValidatorService,
    private readonly toolPermissions: ToolPermissionsService,
  ) {
    this.config = { ...DEFAULT_SAFETY_CONFIG };
    this.logger.log('Agent Safety Service initialized');
    this.logConfiguration();
  }

  /**
   * Log current safety configuration
   */
  private logConfiguration(): void {
    this.logger.log('Safety configuration:');
    this.logger.log(`  - Input sanitization: ${this.config.sanitizeInput}`);
    this.logger.log(`  - Output validation: ${this.config.validateOutput}`);
    this.logger.log(`  - Injection detection: ${this.config.detectInjection}`);
    this.logger.log(`  - Sensitive file blocking: ${this.config.blockSensitiveFiles}`);
    this.logger.log(`  - Block threshold: ${this.config.blockThreshold}`);
  }

  /**
   * Update safety configuration
   */
  updateConfig(config: Partial<SafetyConfig>): void {
    this.config = { ...this.config, ...config };
    this.logger.log('Safety configuration updated');
    this.logConfiguration();
  }

  /**
   * Get current safety configuration
   */
  getConfig(): SafetyConfig {
    return { ...this.config };
  }

  /**
   * Validate an incoming request (input + tool permissions)
   */
  validateRequest(
    input: string,
    requestedTools: string[],
    context: SafetyContext,
  ): RequestValidationResult {
    const allViolations: SafetyViolation[] = [];
    const agentProfile = this.toolPermissions.getProfile(context.agentId);

    // 1. Validate input
    const inputOptions: SanitizeOptions = {
      maxLength: agentProfile.limits?.maxInputLength ?? HARD_LIMITS.MAX_INPUT_LENGTH,
      detectInjection: this.config.detectInjection,
      validateFilePaths: this.config.blockSensitiveFiles,
      context: 'user_message',
    };

    const inputValidation = this.config.sanitizeInput
      ? this.inputSanitizer.sanitize(input, inputOptions)
      : { passed: true, violations: [], riskScore: 0, sanitized: input };

    allViolations.push(...inputValidation.violations);

    // 2. Validate tool permissions
    let toolValidation: RequestValidationResult['toolValidation'];
    if (requestedTools.length > 0) {
      const toolResult = this.toolPermissions.validateToolCalls(context.agentId, requestedTools);
      toolValidation = {
        allowedTools: toolResult.allowed,
        deniedTools: toolResult.denied,
      };
      allViolations.push(...toolResult.denied);
    }

    // 3. Calculate overall risk score
    const overallRiskScore = Math.min(
      100,
      inputValidation.riskScore + (toolValidation?.deniedTools.length || 0) * 20,
    );

    // 4. Determine if request should be blocked
    const hasCriticalViolation = allViolations.some((v) => v.severity === 'critical');
    const exceedsThreshold = overallRiskScore >= this.config.blockThreshold;

    const allowed = !hasCriticalViolation && !(this.config.blockOnCritical && exceedsThreshold);

    // 5. Log violations if configured
    if (this.config.logViolations && allViolations.length > 0) {
      this.logViolations(context, allViolations, overallRiskScore);
    }

    return {
      allowed,
      inputValidation,
      toolValidation,
      overallRiskScore,
      sanitizedInput: inputValidation.sanitized,
      allViolations,
      agentProfile,
    };
  }

  /**
   * Validate a response before returning to user
   */
  validateResponse(output: string, context: SafetyContext): ResponseValidationResult {
    const agentProfile = this.toolPermissions.getProfile(context.agentId);

    const outputOptions: ValidateOutputOptions = {
      maxLength: agentProfile.limits?.maxOutputLength ?? HARD_LIMITS.MAX_OUTPUT_LENGTH,
      redactSensitive: true,
      detectCredentials: true,
      agentId: context.agentId,
    };

    const outputValidation = this.config.validateOutput
      ? this.outputValidator.validate(output, outputOptions)
      : { passed: true, violations: [], riskScore: 0, sanitized: output };

    const safe = outputValidation.passed;

    if (this.config.logViolations && outputValidation.violations.length > 0) {
      this.logger.warn(
        `Output validation for ${context.agentId}: ${outputValidation.violations.length} issues found`,
      );
    }

    return {
      safe,
      outputValidation,
      sanitizedOutput: outputValidation.sanitized || output,
      riskScore: outputValidation.riskScore,
    };
  }

  /**
   * Validate a file path before file operations
   */
  validateFilePath(path: string, context: SafetyContext): SafetyValidationResult {
    return this.inputSanitizer.validateFilePath(path, context.workspaceRoot);
  }

  /**
   * Quick check if input appears safe (for fast path)
   */
  quickInputCheck(input: string): boolean {
    return this.inputSanitizer.quickCheck(input);
  }

  /**
   * Quick check if output appears safe (for fast path)
   */
  quickOutputCheck(output: string): boolean {
    return this.outputValidator.quickValidate(output);
  }

  /**
   * Get allowed tools for an agent
   */
  getAllowedTools(agentId: string): string[] {
    return this.toolPermissions.getAllowedTools(agentId);
  }

  /**
   * Check if a specific tool is allowed for an agent
   */
  canUseTool(agentId: string, toolName: string): boolean {
    return this.toolPermissions.canUseTool(agentId, toolName);
  }

  /**
   * Get limits for an agent
   */
  getAgentLimits(agentId: string): ReturnType<ToolPermissionsService['getLimits']> {
    return this.toolPermissions.getLimits(agentId);
  }

  /**
   * Get constitutional principles
   */
  getConstitutionalPrinciples(): typeof CONSTITUTIONAL_PRINCIPLES {
    return CONSTITUTIONAL_PRINCIPLES;
  }

  /**
   * Get hard limits
   */
  getHardLimits(): typeof HARD_LIMITS {
    return HARD_LIMITS;
  }

  /**
   * Log violations for auditing
   */
  private logViolations(
    context: SafetyContext,
    violations: SafetyViolation[],
    riskScore: number,
  ): void {
    const criticalCount = violations.filter((v) => v.severity === 'critical').length;
    const highCount = violations.filter((v) => v.severity === 'high').length;

    const level = criticalCount > 0 ? 'error' : highCount > 0 ? 'warn' : 'log';

    const message =
      `Safety violations for ${context.agentId} (session: ${context.sessionId || 'unknown'}): ` +
      `${violations.length} total (${criticalCount} critical, ${highCount} high), risk score: ${riskScore}`;

    if (level === 'error') {
      this.logger.error(message);
    } else if (level === 'warn') {
      this.logger.warn(message);
    } else {
      this.logger.log(message);
    }

    // Log individual violations at debug level
    for (const violation of violations) {
      this.logger.debug(
        `  [${violation.severity.toUpperCase()}] ${violation.type}: ${violation.message}`,
      );
    }
  }

  /**
   * Create a safety context from request parameters
   */
  createContext(params: {
    agentId: string;
    sessionId?: string;
    userId?: string;
    workspaceRoot: string;
  }): SafetyContext {
    return {
      ...params,
      timestamp: new Date(),
    };
  }

  /**
   * Get a summary of all registered agent profiles
   */
  getAgentProfiles(): AgentProfile[] {
    return this.toolPermissions.listProfiles();
  }

  /**
   * Register a custom agent profile
   */
  registerAgentProfile(profile: AgentProfile): void {
    this.toolPermissions.registerProfile(profile);
  }
}

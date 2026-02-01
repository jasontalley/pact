/**
 * Output Validator Service
 *
 * Validates and filters LLM outputs before returning to users.
 * Prevents accidental exposure of sensitive data.
 */

import { Injectable, Logger } from '@nestjs/common';
import {
  HARD_LIMITS,
  HARMFUL_OUTPUT_PATTERNS,
  SafetyValidationResult,
  SafetyViolation,
  SafetyViolationType,
} from './constitution';

/**
 * Output validation options
 */
export interface ValidateOutputOptions {
  /** Maximum output length (defaults to HARD_LIMITS.MAX_OUTPUT_LENGTH) */
  maxLength?: number;

  /** Whether to redact sensitive patterns (default: true) */
  redactSensitive?: boolean;

  /** Whether to check for credential-like patterns (default: true) */
  detectCredentials?: boolean;

  /** Custom patterns to redact */
  customRedactPatterns?: RegExp[];

  /** Agent ID for context-aware validation */
  agentId?: string;
}

/**
 * Redaction placeholder
 */
const REDACTED = '[REDACTED]';

@Injectable()
export class OutputValidatorService {
  private readonly logger = new Logger(OutputValidatorService.name);

  /**
   * Validate and optionally sanitize LLM output
   */
  validate(output: string, options: ValidateOutputOptions = {}): SafetyValidationResult {
    const violations: SafetyViolation[] = [];
    let sanitized = output;
    let riskScore = 0;

    const maxLength = options.maxLength ?? HARD_LIMITS.MAX_OUTPUT_LENGTH;
    const redactSensitive = options.redactSensitive ?? true;
    const detectCredentials = options.detectCredentials ?? true;

    // Check output length
    if (output.length > maxLength) {
      violations.push({
        type: SafetyViolationType.OUTPUT_TOO_LONG,
        message: `Output length ${output.length} exceeds maximum ${maxLength}`,
        severity: 'medium',
        rule: 'MAX_OUTPUT_LENGTH',
      });
      riskScore += 20;
      sanitized = output.slice(0, maxLength) + '\n\n[Output truncated]';
    }

    // Detect and optionally redact sensitive patterns
    if (detectCredentials) {
      const credentialResult = this.detectCredentials(output);
      violations.push(...credentialResult.violations);
      riskScore += credentialResult.riskScore;

      if (redactSensitive && credentialResult.violations.length > 0) {
        sanitized = this.redactCredentials(sanitized);
      }
    }

    // Check for harmful output patterns
    const harmfulResult = this.detectHarmfulPatterns(output);
    violations.push(...harmfulResult.violations);
    riskScore += harmfulResult.riskScore;

    // Apply custom redaction patterns
    if (options.customRedactPatterns) {
      for (const pattern of options.customRedactPatterns) {
        sanitized = sanitized.replace(pattern, REDACTED);
      }
    }

    // Check for file content that shouldn't be exposed
    const fileContentResult = this.detectSensitiveFileContent(output);
    violations.push(...fileContentResult.violations);
    riskScore += fileContentResult.riskScore;

    if (redactSensitive && fileContentResult.violations.length > 0) {
      sanitized = this.redactSensitiveContent(sanitized);
    }

    // Cap risk score at 100
    riskScore = Math.min(riskScore, 100);

    const passed = violations.filter((v) => v.severity === 'critical').length === 0;

    if (violations.length > 0) {
      this.logger.warn(`Output validation found ${violations.length} issues (risk: ${riskScore})`);
    }

    return {
      passed,
      violations,
      sanitized,
      riskScore,
    };
  }

  /**
   * Detect credential-like patterns in output
   */
  private detectCredentials(output: string): {
    violations: SafetyViolation[];
    riskScore: number;
  } {
    const violations: SafetyViolation[] = [];
    let riskScore = 0;

    // API key patterns
    const apiKeyPatterns = [
      { pattern: /sk-[a-zA-Z0-9]{20,}/g, name: 'OpenAI API key' },
      { pattern: /ghp_[a-zA-Z0-9]{36}/g, name: 'GitHub personal token' },
      { pattern: /gho_[a-zA-Z0-9]{36}/g, name: 'GitHub OAuth token' },
      { pattern: /ghs_[a-zA-Z0-9]{36}/g, name: 'GitHub server token' },
      { pattern: /github_pat_[a-zA-Z0-9_]{22,}/g, name: 'GitHub fine-grained token' },
      { pattern: /xox[baprs]-[a-zA-Z0-9-]+/g, name: 'Slack token' },
      { pattern: /AKIA[0-9A-Z]{16}/g, name: 'AWS Access Key' },
      { pattern: /[a-zA-Z0-9/+]{40}/g, name: 'AWS Secret Key (potential)' },
      { pattern: /eyJ[a-zA-Z0-9_-]{10,}\.[a-zA-Z0-9_-]{10,}/g, name: 'JWT token' },
      { pattern: /npm_[a-zA-Z0-9]{36}/g, name: 'NPM token' },
      { pattern: /pypi-[a-zA-Z0-9]{100,}/g, name: 'PyPI token' },
    ];

    for (const { pattern, name } of apiKeyPatterns) {
      const matches = output.match(pattern);
      if (matches) {
        for (const match of matches) {
          violations.push({
            type: SafetyViolationType.HARMFUL_OUTPUT,
            message: `Potential ${name} detected in output`,
            severity: 'critical',
            rule: `credential_detection:${name}`,
            content: `${match.slice(0, 8)}...${match.slice(-4)}`,
          });
          riskScore += 40;
        }
      }
    }

    // PEM key patterns
    if (/-----BEGIN [A-Z ]+ KEY-----/.test(output)) {
      violations.push({
        type: SafetyViolationType.HARMFUL_OUTPUT,
        message: 'Private key detected in output',
        severity: 'critical',
        rule: 'pem_key_detection',
      });
      riskScore += 50;
    }

    // Connection string patterns
    const connectionPatterns = [
      { pattern: /mongodb(\+srv)?:\/\/[^:]+:[^@]+@[^\s]+/gi, name: 'MongoDB' },
      { pattern: /postgres(ql)?:\/\/[^:]+:[^@]+@[^\s]+/gi, name: 'PostgreSQL' },
      { pattern: /mysql:\/\/[^:]+:[^@]+@[^\s]+/gi, name: 'MySQL' },
      { pattern: /redis:\/\/:[^@]+@[^\s]+/gi, name: 'Redis' },
    ];

    for (const { pattern, name } of connectionPatterns) {
      if (pattern.test(output)) {
        violations.push({
          type: SafetyViolationType.HARMFUL_OUTPUT,
          message: `${name} connection string with credentials detected`,
          severity: 'critical',
          rule: `connection_string:${name}`,
        });
        riskScore += 40;
      }
    }

    return { violations, riskScore };
  }

  /**
   * Redact credential patterns from output
   */
  private redactCredentials(output: string): string {
    let redacted = output;

    // Redact API keys
    redacted = redacted.replace(/sk-[a-zA-Z0-9]{20,}/g, `sk-${REDACTED}`);
    redacted = redacted.replace(/ghp_[a-zA-Z0-9]{36}/g, `ghp_${REDACTED}`);
    redacted = redacted.replace(/gho_[a-zA-Z0-9]{36}/g, `gho_${REDACTED}`);
    redacted = redacted.replace(/ghs_[a-zA-Z0-9]{36}/g, `ghs_${REDACTED}`);
    redacted = redacted.replace(/github_pat_[a-zA-Z0-9_]{22,}/g, `github_pat_${REDACTED}`);
    redacted = redacted.replace(/xox[baprs]-[a-zA-Z0-9-]+/g, `xox-${REDACTED}`);
    redacted = redacted.replace(/AKIA[0-9A-Z]{16}/g, `AKIA${REDACTED}`);
    redacted = redacted.replace(/npm_[a-zA-Z0-9]{36}/g, `npm_${REDACTED}`);

    // Redact JWTs
    redacted = redacted.replace(
      /eyJ[a-zA-Z0-9_-]{10,}\.[a-zA-Z0-9_-]{10,}\.[a-zA-Z0-9_-]*/g,
      `eyJ${REDACTED}`,
    );

    // Redact PEM keys
    redacted = redacted.replace(
      /-----BEGIN [A-Z ]+ KEY-----[\s\S]*?-----END [A-Z ]+ KEY-----/g,
      `-----BEGIN KEY-----\n${REDACTED}\n-----END KEY-----`,
    );

    // Redact connection strings (preserve host but remove credentials)
    redacted = redacted.replace(
      /mongodb(\+srv)?:\/\/[^:]+:[^@]+@/gi,
      `mongodb$1://${REDACTED}:${REDACTED}@`,
    );
    redacted = redacted.replace(
      /postgres(ql)?:\/\/[^:]+:[^@]+@/gi,
      `postgres$1://${REDACTED}:${REDACTED}@`,
    );
    redacted = redacted.replace(/mysql:\/\/[^:]+:[^@]+@/gi, `mysql://${REDACTED}:${REDACTED}@`);
    redacted = redacted.replace(/redis:\/\/:[^@]+@/gi, `redis://:${REDACTED}@`);

    return redacted;
  }

  /**
   * Detect harmful patterns in output
   */
  private detectHarmfulPatterns(output: string): {
    violations: SafetyViolation[];
    riskScore: number;
  } {
    const violations: SafetyViolation[] = [];
    let riskScore = 0;

    for (const pattern of HARMFUL_OUTPUT_PATTERNS) {
      if (pattern.test(output)) {
        violations.push({
          type: SafetyViolationType.HARMFUL_OUTPUT,
          message: `Potentially harmful pattern detected in output`,
          severity: 'medium',
          rule: pattern.source,
        });
        riskScore += 15;
      }
    }

    return { violations, riskScore };
  }

  /**
   * Detect sensitive file content in output
   */
  private detectSensitiveFileContent(output: string): {
    violations: SafetyViolation[];
    riskScore: number;
  } {
    const violations: SafetyViolation[] = [];
    let riskScore = 0;

    // Patterns that indicate sensitive file content
    const sensitiveContentPatterns = [
      { pattern: /DB_PASSWORD\s*[=:]/i, name: 'database password' },
      { pattern: /API_KEY\s*[=:]/i, name: 'API key assignment' },
      { pattern: /SECRET\s*[=:]/i, name: 'secret assignment' },
      { pattern: /PRIVATE_KEY\s*[=:]/i, name: 'private key assignment' },
      { pattern: /AWS_SECRET/i, name: 'AWS secret' },
      { pattern: /password\s*[=:]\s*["'][^"']+["']/i, name: 'password value' },
    ];

    for (const { pattern, name } of sensitiveContentPatterns) {
      if (pattern.test(output)) {
        violations.push({
          type: SafetyViolationType.HARMFUL_OUTPUT,
          message: `Sensitive content pattern (${name}) detected in output`,
          severity: 'high',
          rule: `sensitive_content:${name}`,
        });
        riskScore += 25;
      }
    }

    return { violations, riskScore };
  }

  /**
   * Redact sensitive content patterns
   */
  private redactSensitiveContent(output: string): string {
    let redacted = output;

    // Redact environment variable assignments
    redacted = redacted.replace(
      /(DB_PASSWORD|API_KEY|SECRET|PRIVATE_KEY|AWS_SECRET)\s*[=:]\s*["']?[^"'\s]+["']?/gi,
      `$1=${REDACTED}`,
    );

    // Redact password assignments
    redacted = redacted.replace(/password\s*[=:]\s*["'][^"']+["']/gi, `password="${REDACTED}"`);

    return redacted;
  }

  /**
   * Quick validation for performance-critical paths
   */
  quickValidate(output: string): boolean {
    // Quick length check
    if (output.length > HARD_LIMITS.MAX_OUTPUT_LENGTH) {
      return false;
    }

    // Quick check for obvious credential patterns
    const quickPatterns = [
      /sk-[a-zA-Z0-9]{20,}/,
      /-----BEGIN [A-Z ]+ KEY-----/,
      /ghp_[a-zA-Z0-9]{36}/,
    ];

    for (const pattern of quickPatterns) {
      if (pattern.test(output)) {
        return false;
      }
    }

    return true;
  }

  /**
   * Strip all potentially sensitive content (nuclear option)
   */
  stripSensitive(output: string): string {
    let stripped = this.redactCredentials(output);
    stripped = this.redactSensitiveContent(stripped);

    // Also strip anything that looks like a long random string
    // This is aggressive but safe
    stripped = stripped.replace(/[a-zA-Z0-9_-]{40,}/g, REDACTED);

    return stripped;
  }
}

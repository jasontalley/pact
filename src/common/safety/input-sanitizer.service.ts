/**
 * Input Sanitizer Service
 *
 * Defends against prompt injection attacks and validates input.
 * Runs before any user input reaches the LLM.
 */

import { Injectable, Logger } from '@nestjs/common';
import {
  HARD_LIMITS,
  INJECTION_PATTERNS,
  BLOCKED_FILE_PATTERNS,
  SafetyValidationResult,
  SafetyViolation,
  SafetyViolationType,
} from './constitution';
import { minimatch } from 'minimatch';

/**
 * Input sanitization options
 */
export interface SanitizeOptions {
  /** Maximum input length (defaults to HARD_LIMITS.MAX_INPUT_LENGTH) */
  maxLength?: number;

  /** Whether to detect injection attempts (default: true) */
  detectInjection?: boolean;

  /** Whether to validate file paths (default: true) */
  validateFilePaths?: boolean;

  /** Context for the input (helps with more accurate detection) */
  context?: 'user_message' | 'tool_argument' | 'system_prompt';
}

@Injectable()
export class InputSanitizerService {
  private readonly logger = new Logger(InputSanitizerService.name);

  /**
   * Sanitize and validate user input
   */
  sanitize(input: string, options: SanitizeOptions = {}): SafetyValidationResult {
    const violations: SafetyViolation[] = [];
    let sanitized = input;
    let riskScore = 0;

    const maxLength = options.maxLength ?? HARD_LIMITS.MAX_INPUT_LENGTH;
    const detectInjection = options.detectInjection ?? true;
    const validateFilePaths = options.validateFilePaths ?? true;

    // Check input length
    if (input.length > maxLength) {
      violations.push({
        type: SafetyViolationType.INPUT_TOO_LONG,
        message: `Input length ${input.length} exceeds maximum ${maxLength}`,
        severity: 'medium',
        rule: 'MAX_INPUT_LENGTH',
        content: `${input.slice(0, 100)}...`,
      });
      riskScore += 30;
      // Truncate but don't block
      sanitized = input.slice(0, maxLength);
    }

    // Detect prompt injection attempts
    if (detectInjection) {
      const injectionResult = this.detectInjectionAttempts(input);
      violations.push(...injectionResult.violations);
      riskScore += injectionResult.riskScore;
    }

    // Validate any file paths in the input
    if (validateFilePaths) {
      const pathResult = this.validatePathsInInput(input);
      violations.push(...pathResult.violations);
      riskScore += pathResult.riskScore;
    }

    // Normalize unicode to prevent homograph attacks
    sanitized = this.normalizeUnicode(sanitized);

    // Remove null bytes and control characters (except newlines/tabs)
    sanitized = this.removeControlCharacters(sanitized);

    // Cap risk score at 100
    riskScore = Math.min(riskScore, 100);

    const passed = violations.filter((v) => v.severity === 'critical').length === 0;

    if (violations.length > 0) {
      this.logger.warn(`Input validation found ${violations.length} issues (risk: ${riskScore})`);
    }

    return {
      passed,
      violations,
      sanitized,
      riskScore,
    };
  }

  /**
   * Detect prompt injection attempts
   */
  private detectInjectionAttempts(input: string): {
    violations: SafetyViolation[];
    riskScore: number;
  } {
    const violations: SafetyViolation[] = [];
    let riskScore = 0;

    for (const pattern of INJECTION_PATTERNS) {
      const match = input.match(pattern);
      if (match) {
        const severity = this.classifyInjectionSeverity(pattern);
        violations.push({
          type: SafetyViolationType.PROMPT_INJECTION,
          message: `Potential prompt injection detected: "${match[0]}"`,
          severity,
          rule: pattern.source,
          content: match[0],
        });
        riskScore += severity === 'critical' ? 50 : severity === 'high' ? 30 : 15;
      }
    }

    // Check for unusual patterns that might indicate injection
    const suspiciousPatterns = this.detectSuspiciousPatterns(input);
    violations.push(...suspiciousPatterns.violations);
    riskScore += suspiciousPatterns.riskScore;

    return { violations, riskScore };
  }

  /**
   * Classify injection pattern severity
   */
  private classifyInjectionSeverity(pattern: RegExp): 'low' | 'medium' | 'high' | 'critical' {
    const patternStr = pattern.source.toLowerCase();

    // Critical: Direct instruction override attempts
    if (
      patternStr.includes('ignore') ||
      patternStr.includes('override') ||
      patternStr.includes('disregard')
    ) {
      return 'critical';
    }

    // High: Role manipulation or jailbreak attempts
    if (
      patternStr.includes('pretend') ||
      patternStr.includes('dan') ||
      patternStr.includes('mode')
    ) {
      return 'high';
    }

    // Medium: Information extraction attempts
    if (patternStr.includes('reveal') || patternStr.includes('show')) {
      return 'medium';
    }

    return 'low';
  }

  /**
   * Detect suspicious patterns that might indicate injection
   */
  private detectSuspiciousPatterns(input: string): {
    violations: SafetyViolation[];
    riskScore: number;
  } {
    const violations: SafetyViolation[] = [];
    let riskScore = 0;

    // Check for excessive special characters (potential encoding bypass)
    const specialCharRatio = (input.match(/[<>{}[\]|\\`]/g) || []).length / input.length;
    if (specialCharRatio > 0.1 && input.length > 50) {
      violations.push({
        type: SafetyViolationType.PROMPT_INJECTION,
        message: 'Unusual density of special characters detected',
        severity: 'low',
        rule: 'special_char_ratio',
      });
      riskScore += 10;
    }

    // Check for markdown/XML that might be trying to inject structure
    const structurePatterns = [
      /```system/i,
      /<\s*system\s*>/i,
      /\[INST\]/i,
      /<<SYS>>/i,
      /<\|im_start\|>/i,
    ];

    for (const pattern of structurePatterns) {
      if (pattern.test(input)) {
        violations.push({
          type: SafetyViolationType.PROMPT_INJECTION,
          message: 'Structural injection attempt detected',
          severity: 'high',
          rule: pattern.source,
        });
        riskScore += 25;
      }
    }

    // Check for base64 encoded content (potential bypass)
    const base64Pattern = /[A-Za-z0-9+/]{50,}={0,2}/;
    if (base64Pattern.test(input)) {
      violations.push({
        type: SafetyViolationType.PROMPT_INJECTION,
        message: 'Potential encoded content detected',
        severity: 'low',
        rule: 'base64_detection',
      });
      riskScore += 5;
    }

    return { violations, riskScore };
  }

  /**
   * Validate file paths in input
   */
  private validatePathsInInput(input: string): {
    violations: SafetyViolation[];
    riskScore: number;
  } {
    const violations: SafetyViolation[] = [];
    let riskScore = 0;

    // Extract potential file paths from input
    const pathPatterns = [
      /\/[\w./\-_]+/g, // Unix paths
      /[A-Z]:\\[\w.\\-_]+/gi, // Windows paths
      /\.\.\/+/g, // Path traversal
    ];

    const extractedPaths = new Set<string>();
    for (const pattern of pathPatterns) {
      const matches = input.match(pattern) || [];
      matches.forEach((m) => extractedPaths.add(m));
    }

    // Check each path against blocked patterns
    for (const path of extractedPaths) {
      // Check for path traversal
      if (path.includes('..')) {
        violations.push({
          type: SafetyViolationType.PATH_TRAVERSAL,
          message: `Path traversal attempt detected: ${path}`,
          severity: 'critical',
          rule: 'path_traversal',
          content: path,
        });
        riskScore += 50;
        continue;
      }

      // Check against blocked file patterns
      for (const blockedPattern of BLOCKED_FILE_PATTERNS) {
        if (minimatch(path, blockedPattern, { dot: true })) {
          violations.push({
            type: SafetyViolationType.BLOCKED_FILE_ACCESS,
            message: `Attempted access to sensitive file pattern: ${path}`,
            severity: 'high',
            rule: blockedPattern,
            content: path,
          });
          riskScore += 30;
          break;
        }
      }
    }

    return { violations, riskScore };
  }

  /**
   * Normalize unicode to prevent homograph attacks
   */
  private normalizeUnicode(input: string): string {
    // Normalize to NFC form
    let normalized = input.normalize('NFC');

    // Replace common lookalike characters with ASCII equivalents
    const homoglyphs: Record<string, string> = {
      '\u0430': 'a', // Cyrillic а
      '\u0435': 'e', // Cyrillic е
      '\u043E': 'o', // Cyrillic о
      '\u0440': 'p', // Cyrillic р
      '\u0441': 'c', // Cyrillic с
      '\u0445': 'x', // Cyrillic х
      '\u0443': 'y', // Cyrillic у
      '\u0391': 'A', // Greek Α
      '\u0392': 'B', // Greek Β
      '\u0395': 'E', // Greek Ε
      '\u0397': 'H', // Greek Η
      '\u0399': 'I', // Greek Ι
      '\u039A': 'K', // Greek Κ
      '\u039C': 'M', // Greek Μ
      '\u039D': 'N', // Greek Ν
      '\u039F': 'O', // Greek Ο
      '\u03A1': 'P', // Greek Ρ
      '\u03A4': 'T', // Greek Τ
      '\u03A7': 'X', // Greek Χ
      '\u03A5': 'Y', // Greek Υ
      '\u0417': 'Z', // Cyrillic З
    };

    for (const [homoglyph, replacement] of Object.entries(homoglyphs)) {
      normalized = normalized.replace(new RegExp(homoglyph, 'g'), replacement);
    }

    return normalized;
  }

  /**
   * Remove control characters except newlines and tabs
   */
  private removeControlCharacters(input: string): string {
    // Remove all control characters except \n, \r, \t
    // eslint-disable-next-line no-control-regex
    return input.replace(/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/g, '');
  }

  /**
   * Validate a file path argument
   */
  validateFilePath(path: string, workspaceRoot: string): SafetyValidationResult {
    const violations: SafetyViolation[] = [];
    let riskScore = 0;

    // Normalize the path
    const normalizedPath = path.replace(/\\/g, '/');

    // Check for path traversal
    if (normalizedPath.includes('..')) {
      violations.push({
        type: SafetyViolationType.PATH_TRAVERSAL,
        message: `Path traversal attempt: ${path}`,
        severity: 'critical',
        rule: 'path_traversal',
        content: path,
      });
      riskScore = 100;
      return { passed: false, violations, riskScore };
    }

    // Ensure path is within workspace
    if (!normalizedPath.startsWith(workspaceRoot.replace(/\\/g, '/'))) {
      violations.push({
        type: SafetyViolationType.PATH_TRAVERSAL,
        message: `Path outside workspace: ${path}`,
        severity: 'critical',
        rule: 'workspace_containment',
        content: path,
      });
      riskScore = 100;
      return { passed: false, violations, riskScore };
    }

    // Check against blocked patterns
    for (const pattern of BLOCKED_FILE_PATTERNS) {
      if (minimatch(normalizedPath, pattern, { dot: true })) {
        violations.push({
          type: SafetyViolationType.BLOCKED_FILE_ACCESS,
          message: `Access to sensitive file blocked: ${path}`,
          severity: 'high',
          rule: pattern,
          content: path,
        });
        riskScore += 50;
      }
    }

    return {
      passed: violations.filter((v) => v.severity === 'critical').length === 0,
      violations,
      riskScore: Math.min(riskScore, 100),
    };
  }

  /**
   * Quick check if input appears safe (for fast path)
   */
  quickCheck(input: string): boolean {
    // Quick length check
    if (input.length > HARD_LIMITS.MAX_INPUT_LENGTH) {
      return false;
    }

    // Quick injection pattern check (most common patterns only)
    const quickPatterns = [/ignore.*instructions/i, /forget.*previous/i, /you are now/i, /\.\.\//];

    for (const pattern of quickPatterns) {
      if (pattern.test(input)) {
        return false;
      }
    }

    return true;
  }
}

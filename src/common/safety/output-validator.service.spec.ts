import { Test, TestingModule } from '@nestjs/testing';
import { OutputValidatorService } from './output-validator.service';
import { SafetyViolationType, HARD_LIMITS } from './constitution';

describe('OutputValidatorService', () => {
  let service: OutputValidatorService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [OutputValidatorService],
    }).compile();

    service = module.get<OutputValidatorService>(OutputValidatorService);
  });

  describe('validate', () => {
    it('should pass safe output', () => {
      const result = service.validate('The test coverage is 85%.');

      expect(result.passed).toBe(true);
      expect(result.violations).toHaveLength(0);
      expect(result.riskScore).toBe(0);
    });

    it('should detect output length violations', () => {
      const longOutput = 'a'.repeat(HARD_LIMITS.MAX_OUTPUT_LENGTH + 1000);
      const result = service.validate(longOutput);

      expect(result.violations.some((v) => v.type === SafetyViolationType.OUTPUT_TOO_LONG)).toBe(
        true,
      );
      expect(result.sanitized!.length).toBeLessThanOrEqual(
        HARD_LIMITS.MAX_OUTPUT_LENGTH + 20, // Allow for truncation message
      );
    });

    it('should detect OpenAI API keys', () => {
      const output = 'Found API key: sk-1234567890abcdefghijklmnopqrstuvwxyz';
      const result = service.validate(output);

      expect(result.violations.some((v) => v.type === SafetyViolationType.HARMFUL_OUTPUT)).toBe(
        true,
      );
      expect(result.riskScore).toBeGreaterThan(0);
    });

    it('should detect GitHub tokens', () => {
      const outputs = [
        'Token: ghp_1234567890abcdefghijklmnopqrstuvwxyz',
        'OAuth: gho_1234567890abcdefghijklmnopqrstuvwxyz',
      ];

      for (const output of outputs) {
        const result = service.validate(output);
        expect(result.violations.some((v) => v.type === SafetyViolationType.HARMFUL_OUTPUT)).toBe(
          true,
        );
      }
    });

    it('should detect AWS credentials', () => {
      const output = 'AWS Key: AKIAIOSFODNN7EXAMPLE';
      const result = service.validate(output);

      expect(result.violations.some((v) => v.type === SafetyViolationType.HARMFUL_OUTPUT)).toBe(
        true,
      );
    });

    it('should detect PEM private keys', () => {
      const output = `
-----BEGIN RSA PRIVATE KEY-----
MIIEpAIBAAKCAQEA...
-----END RSA PRIVATE KEY-----
      `;
      const result = service.validate(output);

      expect(result.violations.some((v) => v.type === SafetyViolationType.HARMFUL_OUTPUT)).toBe(
        true,
      );
    });

    it('should detect MongoDB connection strings with credentials', () => {
      const output = 'mongodb://user:password123@cluster.mongodb.net/db';
      const result = service.validate(output);

      expect(result.violations.some((v) => v.type === SafetyViolationType.HARMFUL_OUTPUT)).toBe(
        true,
      );
    });

    it('should detect PostgreSQL connection strings with credentials', () => {
      const output = 'postgresql://admin:secretpass@localhost:5432/mydb';
      const result = service.validate(output);

      expect(result.violations.some((v) => v.type === SafetyViolationType.HARMFUL_OUTPUT)).toBe(
        true,
      );
    });

    it('should detect JWT tokens', () => {
      const output =
        'Token: eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiIxMjM0NTY3ODkwIn0.dozjgNryP4J3jVmNHl0w5N_XgL0n3I9PlFUP0THsR8U';
      const result = service.validate(output);

      expect(result.violations.some((v) => v.type === SafetyViolationType.HARMFUL_OUTPUT)).toBe(
        true,
      );
    });

    it('should detect environment variable assignments', () => {
      const outputs = ['DB_PASSWORD=mysecretpassword', 'API_KEY: sk-12345', 'SECRET=verysecret123'];

      for (const output of outputs) {
        const result = service.validate(output);
        expect(result.violations.length).toBeGreaterThan(0);
      }
    });

    it('should redact credentials when redactSensitive is true', () => {
      const output = 'Found key: sk-1234567890abcdefghijklmnopqrstuvwxyz';
      const result = service.validate(output, { redactSensitive: true });

      expect(result.sanitized).toContain('[REDACTED]');
      expect(result.sanitized).not.toContain('1234567890abcdefghijklmnopqrstuvwxyz');
    });

    it('should redact connection strings', () => {
      const output = 'mongodb://admin:secret123@cluster.mongodb.net/db';
      const result = service.validate(output, { redactSensitive: true });

      expect(result.sanitized).toContain('[REDACTED]');
      expect(result.sanitized).not.toContain('secret123');
    });

    it('should redact PEM keys', () => {
      const output = `
-----BEGIN PRIVATE KEY-----
MIIEvgIBADANBgkqhkiG9w0BAQEFAASCBKgwggSkAgEAAoIBAQC7...
-----END PRIVATE KEY-----
      `;
      const result = service.validate(output, { redactSensitive: true });

      expect(result.sanitized).toContain('[REDACTED]');
      expect(result.sanitized).not.toContain(
        'MIIEvgIBADANBgkqhkiG9w0BAQEFAASCBKgwggSkAgEAAoIBAQC7',
      );
    });
  });

  describe('quickValidate', () => {
    it('should return true for safe output', () => {
      expect(service.quickValidate('The test passed successfully.')).toBe(true);
    });

    it('should return false for output with API keys', () => {
      expect(service.quickValidate('sk-1234567890abcdefghijklmnopqrstuvwxyz')).toBe(false);
    });

    it('should return false for output exceeding length limit', () => {
      const longOutput = 'a'.repeat(HARD_LIMITS.MAX_OUTPUT_LENGTH + 1);
      expect(service.quickValidate(longOutput)).toBe(false);
    });

    it('should return false for PEM keys', () => {
      expect(service.quickValidate('-----BEGIN PRIVATE KEY-----')).toBe(false);
    });
  });

  describe('stripSensitive', () => {
    it('should strip all credential patterns', () => {
      const output = `
        API Key: sk-1234567890abcdefghijklmnopqrstuvwxyz
        Token: ghp_1234567890abcdefghijklmnopqrstuvwxyz
        DB: mongodb://user:pass@localhost/db
      `;
      const stripped = service.stripSensitive(output);

      expect(stripped).not.toContain('1234567890abcdefghijklmnopqrstuvwxyz');
      expect(stripped).toContain('[REDACTED]');
    });

    it('should strip long random strings', () => {
      const output = 'Secret: abcdefghijklmnopqrstuvwxyz1234567890ABCDEFGHIJ';
      const stripped = service.stripSensitive(output);

      expect(stripped).toContain('[REDACTED]');
    });
  });
});

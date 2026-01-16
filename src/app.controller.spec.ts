import { Test, TestingModule } from '@nestjs/testing';
import { AppController } from './app.controller';
import { AppService } from './app.service';

describe('AppController', () => {
  let appController: AppController;

  beforeEach(async () => {
    const app: TestingModule = await Test.createTestingModule({
      controllers: [AppController],
      providers: [AppService],
    }).compile();

    appController = app.get<AppController>(AppController);
  });

  // @atom IA-014
  describe('root endpoint', () => {
    // @atom IA-014
    it('should return the exact welcome message for Pact application', () => {
      const result = appController.getHello();

      // Welcome message must match the expected Pact branding
      expect(result).toBe('Pact - Intent-Driven Software Development');
    });

    // @atom IA-014
    it('should return a non-empty string response', () => {
      const result = appController.getHello();

      // Root endpoint must return a string
      expect(typeof result).toBe('string');
      // Root endpoint response must not be empty
      expect(result.length).toBeGreaterThan(0);
    });
  });

  // @atom IA-015
  describe('health check endpoint', () => {
    // @atom IA-015
    it('should return ok status indicating service is healthy', () => {
      const result = appController.getHealth();

      // Health check must return ok status when service is healthy
      expect(result.status).toBe('ok');
    });

    // @atom IA-015
    it('should include a valid ISO timestamp in health response', () => {
      // Use fixed date for deterministic testing
      const fixedDate = '2024-01-15T10:00:00.000Z';
      jest.spyOn(Date.prototype, 'toISOString').mockReturnValue(fixedDate);

      const result = appController.getHealth();

      // Health check must include a timestamp
      expect(result.timestamp).not.toBeNull();
      // Timestamp must be a valid ISO string
      expect(result.timestamp).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/);

      jest.restoreAllMocks();
    });

    // @atom IA-015
    it('should return consistent status on multiple calls', () => {
      const result1 = appController.getHealth();
      const result2 = appController.getHealth();

      // Health check status must be consistent across calls
      expect(result1.status).toBe(result2.status);
    });

    // @atom IA-015
    it('should return timestamp that is not null or undefined', () => {
      const result = appController.getHealth();

      // Timestamp must not be null
      expect(result.timestamp).not.toBeNull();
      // Timestamp must not be undefined
      expect(result.timestamp).not.toBeUndefined();
    });
  });

  // @atom IA-016
  describe('boundary conditions', () => {
    // @atom IA-016
    it('should handle rapid consecutive health check calls', () => {
      const results = Array.from({ length: 10 }, () => appController.getHealth());

      results.forEach((result) => {
        // Each health check call must return ok status
        expect(result.status).toBe('ok');
      });
    });

    // @atom IA-016
    it('should return status that is exactly ok not truthy equivalent', () => {
      const result = appController.getHealth();

      // Status must be exactly 'ok', not just truthy
      expect(result.status).toBe('ok');
      // Status must not be empty string
      expect(result.status).not.toBe('');
      // Status must not be null
      expect(result.status).not.toBeNull();
    });

    // @atom IA-016
    it('should return health object with expected shape', () => {
      const result = appController.getHealth();

      // Result must have status property
      expect(result).toHaveProperty('status');
      // Result must have timestamp property
      expect(result).toHaveProperty('timestamp');
    });
  });

  // @atom IA-017
  describe('negative cases and edge conditions', () => {
    // @atom IA-017
    it('should not return error status for healthy service', () => {
      const result = appController.getHealth();

      // Status must not indicate error
      expect(result.status).not.toBe('error');
      // Status must not indicate failure
      expect(result.status).not.toBe('fail');
      // Status must not indicate unhealthy
      expect(result.status).not.toBe('unhealthy');
    });

    // @atom IA-017
    it('should not return empty welcome message', () => {
      const result = appController.getHello();

      // Welcome message must not be empty
      expect(result).not.toBe('');
      // Welcome message length must be greater than zero
      expect(result.length).toBeGreaterThan(0);
    });
  });
});

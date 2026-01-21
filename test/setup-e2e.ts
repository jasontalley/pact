import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import { AppModule } from '../src/app.module';

let app: INestApplication | undefined;
let moduleFixture: TestingModule | undefined;

/**
 * Global setup for E2E tests.
 * Creates a single NestJS application instance shared across all tests.
 * This avoids multiple database connections and open handle issues.
 */
export async function setupE2EApp(): Promise<INestApplication> {
  if (app) {
    return app;
  }

  moduleFixture = await Test.createTestingModule({
    imports: [AppModule],
  }).compile();

  app = moduleFixture.createNestApplication();

  // Apply global pipes (same as main.ts)
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
    }),
  );

  await app.init();
  return app;
}

/**
 * Global teardown for E2E tests.
 * Closes the NestJS application and cleans up resources.
 */
export async function teardownE2EApp(): Promise<void> {
  if (app) {
    await app.close();
    app = undefined;
    moduleFixture = undefined;
  }
}

/**
 * Get the current E2E app instance.
 * Throws if app hasn't been initialized.
 */
export function getE2EApp(): INestApplication {
  if (!app) {
    throw new Error('E2E app not initialized. Call setupE2EApp() first.');
  }
  return app;
}

// Jest global setup/teardown hooks
beforeAll(async () => {
  await setupE2EApp();
});

afterAll(async () => {
  await teardownE2EApp();
});

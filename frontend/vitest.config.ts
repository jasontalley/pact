import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';
import path from 'path';

// In Docker (CI=true), frontend is at /app so test-results go to /app/test-results
// On host, frontend is in a subdirectory so we go up two levels to project root
const isDocker = process.env.CI === 'true';
const coverageDir = isDocker
  ? './test-results/frontend/unit/coverage'
  : '../../test-results/frontend/unit/coverage';

export default defineConfig({
  plugins: [react()],
  test: {
    environment: 'jsdom',
    globals: true,
    setupFiles: ['./__tests__/setup.ts'],
    include: ['**/*.{test,spec}.{js,mjs,cjs,ts,mts,cts,jsx,tsx}'],
    exclude: ['node_modules', 'dist', 'e2e/**'],
    coverage: {
      provider: 'v8',
      reporter: ['text', 'json', 'html', 'lcov'],
      reportsDirectory: coverageDir,
      include: [
        'app/**/*.{ts,tsx}',
        'components/**/*.{ts,tsx}',
        'hooks/**/*.{ts,tsx}',
        'lib/**/*.{ts,tsx}',
        'stores/**/*.{ts,tsx}',
      ],
      exclude: [
        'node_modules/',
        '__tests__/',
        'e2e/',
        '**/*.d.ts',
        '**/*.config.*',
        '**/*.spec.*',
        '**/*.test.*',
        '.next/',
        'types/**',
      ],
      thresholds: {
        // Initial thresholds - increase as coverage improves
        statements: 5,
        branches: 30,
        functions: 30,
        lines: 5,
      },
    },
  },
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './'),
    },
  },
});

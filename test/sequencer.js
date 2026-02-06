/**
 * Custom Jest test sequencer for E2E tests.
 * Ensures tests run in a specific order to manage database state properly.
 */
const Sequencer = require('@jest/test-sequencer').default;

class CustomSequencer extends Sequencer {
  sort(tests) {
    // Define the order of test files
    const order = [
      'app.e2e-spec.ts',           // Run basic app tests first
      'atoms-crud.e2e-spec.ts',    // Then CRUD tests (creates atoms IA-001 onwards)
      'service-integration.e2e-spec.ts', // Finally integration tests
    ];

    return tests.sort((a, b) => {
      const aFile = a.path.split('/').pop();
      const bFile = b.path.split('/').pop();
      const aIndex = order.findIndex(f => aFile.includes(f));
      const bIndex = order.findIndex(f => bFile.includes(f));

      // Files not in the order list go last
      const aOrder = aIndex === -1 ? order.length : aIndex;
      const bOrder = bIndex === -1 ? order.length : bIndex;

      return aOrder - bOrder;
    });
  }
}

module.exports = CustomSequencer;

import { getAtom, getTestRecordsForFile } from '../pact-api-client';
import type { ToolDefinition } from './index';

export const getAtomForTestTool: ToolDefinition = {
  name: 'get_atom_for_test',
  description:
    'Given a test file path, find the atom(s) it validates or should validate. ' +
    'Reports whether the test is an orphan (no atom linkage).',
  inputSchema: {
    type: 'object' as const,
    properties: {
      testFilePath: {
        type: 'string',
        description: 'The file path of the test file (e.g., "src/users/users.service.spec.ts")',
      },
    },
    required: ['testFilePath'],
  },
  handler: async (args: Record<string, unknown>) => {
    const testFilePath = args.testFilePath as string;
    if (!testFilePath) {
      return {
        content: [{ type: 'text' as const, text: 'Error: testFilePath is required' }],
        isError: true,
      };
    }

    try {
      const testRecords = await getTestRecordsForFile(testFilePath);

      const linkedAtoms: Array<{
        id: string;
        atomId: string;
        description: string;
        status: string;
      }> = [];
      const orphanTests: Array<{ testName: string; status: string }> = [];

      for (const record of testRecords) {
        if (record.linkedAtomId) {
          try {
            const atom = await getAtom(record.linkedAtomId);
            linkedAtoms.push({
              id: atom.id,
              atomId: atom.atomId,
              description: atom.description,
              status: atom.status,
            });
          } catch {
            // Atom might have been deleted
          }
        } else if (!record.hadAtomAnnotation && !record.atomRecommendationId) {
          orphanTests.push({
            testName: record.testName,
            status: record.status,
          });
        }
      }

      const isOrphan = testRecords.length === 0 || orphanTests.length === testRecords.length;

      const result = {
        testFilePath,
        linkedAtoms,
        orphanTests,
        isOrphan,
        totalTests: testRecords.length,
      };

      return {
        content: [{ type: 'text' as const, text: JSON.stringify(result, null, 2) }],
      };
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      return { content: [{ type: 'text' as const, text: `Error: ${message}` }], isError: true };
    }
  },
};

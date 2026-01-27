/**
 * Atom Tools Definitions
 *
 * Tool definitions for all atom-related operations.
 * These are registered with the ToolRegistryService.
 */

import { ToolDefinition } from '../../../common/llm/providers/types';

/**
 * All atom management tool definitions
 */
export const ATOM_TOOLS: ToolDefinition[] = [
  {
    name: 'analyze_intent',
    description: 'Analyze raw intent text for atomicity and suggest improvements',
    parameters: {
      type: 'object',
      properties: {
        intent: {
          type: 'string',
          description: 'The raw intent text to analyze',
        },
      },
      required: ['intent'],
    },
  },
  {
    name: 'count_atoms',
    description:
      'Get the total count of atoms in the system. Use this to answer questions like "How many atoms do we have?"',
    parameters: {
      type: 'object',
      properties: {
        status: {
          type: 'string',
          description: 'Optional: Filter by status (draft, committed, superseded)',
          enum: ['draft', 'committed', 'superseded'],
        },
        category: {
          type: 'string',
          description: 'Optional: Filter by category',
          enum: [
            'functional',
            'security',
            'performance',
            'reliability',
            'usability',
            'maintainability',
          ],
        },
      },
    },
  },
  {
    name: 'get_statistics',
    description:
      'Get comprehensive statistics about atoms including counts by status, category, and other metrics',
    parameters: {
      type: 'object',
      properties: {},
    },
  },
  {
    name: 'search_atoms',
    description: 'Search for existing atoms by description, tags, or category',
    parameters: {
      type: 'object',
      properties: {
        query: {
          type: 'string',
          description: 'Search query (description keywords)',
        },
        category: {
          type: 'string',
          description: 'Filter by category (functional, security, performance, etc.)',
          enum: [
            'functional',
            'security',
            'performance',
            'reliability',
            'usability',
            'maintainability',
          ],
        },
        status: {
          type: 'string',
          description: 'Filter by status (draft, committed, superseded)',
          enum: ['draft', 'committed', 'superseded'],
        },
        limit: {
          type: 'number',
          description: 'Maximum number of results to return (default: 20)',
        },
      },
    },
  },
  {
    name: 'list_atoms',
    description: 'List atoms with pagination. Use this to browse atoms or get a list of all atoms.',
    parameters: {
      type: 'object',
      properties: {
        page: {
          type: 'number',
          description: 'Page number (default: 1)',
        },
        limit: {
          type: 'number',
          description: 'Number of atoms per page (default: 20, max: 100)',
        },
        status: {
          type: 'string',
          description: 'Filter by status',
          enum: ['draft', 'committed', 'superseded'],
        },
        category: {
          type: 'string',
          description: 'Filter by category',
          enum: [
            'functional',
            'security',
            'performance',
            'reliability',
            'usability',
            'maintainability',
          ],
        },
        sortBy: {
          type: 'string',
          description: 'Sort field (default: createdAt)',
          enum: ['createdAt', 'updatedAt', 'qualityScore', 'atomId'],
        },
        sortOrder: {
          type: 'string',
          description: 'Sort order',
          enum: ['ASC', 'DESC'],
        },
      },
    },
  },
  {
    name: 'get_atom',
    description: 'Get details of a specific atom by ID or atom ID (e.g., IA-001)',
    parameters: {
      type: 'object',
      properties: {
        atomId: {
          type: 'string',
          description: 'The atom ID (e.g., IA-001) or UUID',
        },
      },
      required: ['atomId'],
    },
  },
  {
    name: 'refine_atom',
    description: 'Get refinement suggestions for an atom to improve its quality',
    parameters: {
      type: 'object',
      properties: {
        atomId: {
          type: 'string',
          description: 'The atom ID to refine',
        },
        feedback: {
          type: 'string',
          description: 'Optional feedback to guide refinement',
        },
      },
      required: ['atomId'],
    },
  },
  {
    name: 'create_atom',
    description: 'Create a new draft atom from a refined description',
    parameters: {
      type: 'object',
      properties: {
        description: {
          type: 'string',
          description: 'The atom description',
        },
        category: {
          type: 'string',
          description:
            'Atom category (functional, security, performance, reliability, usability, maintainability)',
          enum: [
            'functional',
            'security',
            'performance',
            'reliability',
            'usability',
            'maintainability',
          ],
        },
        tags: {
          type: 'string',
          description: 'Comma-separated tags',
        },
      },
      required: ['description', 'category'],
    },
  },
  {
    name: 'update_atom',
    description: 'Update a draft atom. Only draft atoms can be updated.',
    parameters: {
      type: 'object',
      properties: {
        atomId: {
          type: 'string',
          description: 'The atom ID or UUID to update',
        },
        description: {
          type: 'string',
          description: 'Updated description',
        },
        category: {
          type: 'string',
          description: 'Updated category',
          enum: [
            'functional',
            'security',
            'performance',
            'reliability',
            'usability',
            'maintainability',
          ],
        },
        tags: {
          type: 'string',
          description: 'Updated comma-separated tags',
        },
        qualityScore: {
          type: 'number',
          description: 'Updated quality score (0-100)',
        },
      },
      required: ['atomId'],
    },
  },
  {
    name: 'commit_atom',
    description: 'Commit a draft atom (make it immutable). Requires quality score >= 80.',
    parameters: {
      type: 'object',
      properties: {
        atomId: {
          type: 'string',
          description: 'The atom ID or UUID to commit',
        },
      },
      required: ['atomId'],
    },
  },
  {
    name: 'delete_atom',
    description: 'Delete a draft atom. Only draft atoms can be deleted.',
    parameters: {
      type: 'object',
      properties: {
        atomId: {
          type: 'string',
          description: 'The atom ID or UUID to delete',
        },
      },
      required: ['atomId'],
    },
  },
  {
    name: 'get_popular_tags',
    description: 'Get popular tags with usage counts',
    parameters: {
      type: 'object',
      properties: {
        limit: {
          type: 'number',
          description: 'Maximum number of tags to return (default: 20)',
        },
      },
    },
  },
];

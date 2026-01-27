/**
 * Atom Tools Service
 *
 * Provides tool executors for all atom-related operations.
 * These tools are registered with the ToolRegistryService.
 */

import { Injectable } from '@nestjs/common';
import { AtomsService } from '../../atoms/atoms.service';
import { AtomizationService } from '../atomization.service';
import { IntentRefinementService } from '../intent-refinement.service';
import { ToolExecutor } from './tool-registry.service';

/**
 * Tool executor for atom management operations
 */
@Injectable()
export class AtomToolsService implements ToolExecutor {
  constructor(
    private readonly atomsService: AtomsService,
    private readonly atomizationService: AtomizationService,
    private readonly refinementService: IntentRefinementService,
  ) {}

  async execute(name: string, args: Record<string, unknown>): Promise<unknown> {
    switch (name) {
      case 'analyze_intent':
        return this.atomizationService.atomize({
          intentDescription: args.intent as string,
        });

      case 'count_atoms': {
        const searchDto: any = {};
        if (args.status) searchDto.status = args.status;
        if (args.category) searchDto.category = args.category;
        const atoms = await this.atomsService.findAll(searchDto);
        return { total: atoms.total };
      }

      case 'get_statistics':
        return this.atomsService.getStatistics();

      case 'search_atoms':
        return this.atomsService.findAll({
          search: args.query as string,
          category: args.category as any,
          status: args.status as any,
          limit: (args.limit as number) || 20,
        });

      case 'list_atoms':
        return this.atomsService.findAll({
          page: (args.page as number) || 1,
          limit: (args.limit as number) || 20,
          status: args.status as any,
          category: args.category as any,
          sortBy: ((args.sortBy as string) || 'createdAt') as
            | 'createdAt'
            | 'qualityScore'
            | 'atomId'
            | 'committedAt',
          sortOrder: (args.sortOrder as 'ASC' | 'DESC') || 'DESC',
        });

      case 'get_atom': {
        const atomId = args.atomId as string;
        try {
          if (atomId.match(/^IA-\d+$/)) {
            return await this.atomsService.findByAtomId(atomId);
          } else {
            return await this.atomsService.findOne(atomId);
          }
        } catch {
          return null;
        }
      }

      case 'refine_atom':
        return this.refinementService.suggestRefinements(args.atomId as string);

      case 'create_atom': {
        const tags = args.tags ? (args.tags as string).split(',').map((t) => t.trim()) : [];
        return this.atomsService.create({
          description: args.description as string,
          category: args.category as any,
          tags,
        });
      }

      case 'update_atom': {
        const atomId = args.atomId as string;
        let atom;
        try {
          if (atomId.match(/^IA-\d+$/)) {
            atom = await this.atomsService.findByAtomId(atomId);
          } else {
            atom = await this.atomsService.findOne(atomId);
          }
        } catch {
          throw new Error(`Atom ${atomId} not found`);
        }

        const updateDto: any = {};
        if (args.description !== undefined) updateDto.description = args.description;
        if (args.category !== undefined) updateDto.category = args.category;
        if (args.tags !== undefined) {
          updateDto.tags = (args.tags as string).split(',').map((t) => t.trim());
        }
        if (args.qualityScore !== undefined) updateDto.qualityScore = args.qualityScore;

        return this.atomsService.update(atom.id, updateDto);
      }

      case 'commit_atom': {
        const atomId = args.atomId as string;
        let atom;
        try {
          if (atomId.match(/^IA-\d+$/)) {
            atom = await this.atomsService.findByAtomId(atomId);
          } else {
            atom = await this.atomsService.findOne(atomId);
          }
        } catch {
          throw new Error(`Atom ${atomId} not found`);
        }

        return this.atomsService.commit(atom.id);
      }

      case 'delete_atom': {
        const atomId = args.atomId as string;
        let atom;
        try {
          if (atomId.match(/^IA-\d+$/)) {
            atom = await this.atomsService.findByAtomId(atomId);
          } else {
            atom = await this.atomsService.findOne(atomId);
          }
        } catch {
          throw new Error(`Atom ${atomId} not found`);
        }

        await this.atomsService.remove(atom.id);
        return { success: true, message: `Atom ${atom.atomId} deleted` };
      }

      case 'get_popular_tags':
        return this.atomsService.getPopularTags((args.limit as number) || 20);

      default:
        throw new Error(`Unknown atom tool: ${name}`);
    }
  }
}

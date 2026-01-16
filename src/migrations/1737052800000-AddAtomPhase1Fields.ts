import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Migration: Add Phase 1 Intent Atom fields
 *
 * This migration adds the following fields to support Phase 1 requirements:
 * - observableOutcomes: JSONB array of observable effects
 * - falsifiabilityCriteria: JSONB array of conditions that disprove the atom
 * - tags: JSONB array of user-defined tags
 * - canvasPosition: JSONB object with x, y coordinates
 * - parentIntent: TEXT field for original user input
 * - refinementHistory: JSONB array of refinement records
 */
export class AddAtomPhase1Fields1737052800000 implements MigrationInterface {
  name = 'AddAtomPhase1Fields1737052800000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    // Add observableOutcomes column with default empty array
    await queryRunner.query(`
      ALTER TABLE "atoms"
      ADD COLUMN IF NOT EXISTS "observableOutcomes" jsonb NOT NULL DEFAULT '[]'
    `);

    // Add falsifiabilityCriteria column with default empty array
    await queryRunner.query(`
      ALTER TABLE "atoms"
      ADD COLUMN IF NOT EXISTS "falsifiabilityCriteria" jsonb NOT NULL DEFAULT '[]'
    `);

    // Add tags column with default empty array
    await queryRunner.query(`
      ALTER TABLE "atoms"
      ADD COLUMN IF NOT EXISTS "tags" jsonb NOT NULL DEFAULT '[]'
    `);

    // Add canvasPosition column (nullable)
    await queryRunner.query(`
      ALTER TABLE "atoms"
      ADD COLUMN IF NOT EXISTS "canvasPosition" jsonb
    `);

    // Add parentIntent column (nullable text)
    await queryRunner.query(`
      ALTER TABLE "atoms"
      ADD COLUMN IF NOT EXISTS "parentIntent" text
    `);

    // Add refinementHistory column with default empty array
    await queryRunner.query(`
      ALTER TABLE "atoms"
      ADD COLUMN IF NOT EXISTS "refinementHistory" jsonb NOT NULL DEFAULT '[]'
    `);

    // Create GIN index on tags for efficient tag filtering
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "IDX_atoms_tags"
      ON "atoms" USING GIN ("tags")
    `);

    // Create index on parentIntent for traceability queries
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "IDX_atoms_parentIntent"
      ON "atoms" ("parentIntent")
      WHERE "parentIntent" IS NOT NULL
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    // Drop indexes first
    await queryRunner.query(`DROP INDEX IF EXISTS "IDX_atoms_parentIntent"`);
    await queryRunner.query(`DROP INDEX IF EXISTS "IDX_atoms_tags"`);

    // Drop columns
    await queryRunner.query(`ALTER TABLE "atoms" DROP COLUMN IF EXISTS "refinementHistory"`);
    await queryRunner.query(`ALTER TABLE "atoms" DROP COLUMN IF EXISTS "parentIntent"`);
    await queryRunner.query(`ALTER TABLE "atoms" DROP COLUMN IF EXISTS "canvasPosition"`);
    await queryRunner.query(`ALTER TABLE "atoms" DROP COLUMN IF EXISTS "tags"`);
    await queryRunner.query(`ALTER TABLE "atoms" DROP COLUMN IF EXISTS "falsifiabilityCriteria"`);
    await queryRunner.query(`ALTER TABLE "atoms" DROP COLUMN IF EXISTS "observableOutcomes"`);
  }
}

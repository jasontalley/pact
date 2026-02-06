import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Phase 18: Add agent-suggested atom fields
 *
 * Extends Atom entity with:
 * - source: Where the atom came from (human, interview_agent, agent_inference, reconciliation_inference)
 * - confidence: Agent confidence score (0.0-1.0) for suggested atoms
 * - rationale: Why the agent suggested this atom
 * - relatedAtomId: Link to parent/related atom
 * - proposedBy: Agent or user identifier who proposed the atom
 * - approvedBy: User who approved the proposed atom
 * - approvedAt: When the atom was approved
 * - status: Add 'abandoned' to the enum for rejected proposed atoms
 */
export class AddAtomProposedStatus1739088000000 implements MigrationInterface {
  name = 'AddAtomProposedStatus1739088000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    // Add source column
    await queryRunner.query(`
      ALTER TABLE "atoms"
      ADD COLUMN IF NOT EXISTS "source" VARCHAR(30) DEFAULT 'human'
    `);

    // Add confidence column with check constraint
    await queryRunner.query(`
      ALTER TABLE "atoms"
      ADD COLUMN IF NOT EXISTS "confidence" FLOAT
    `);

    await queryRunner.query(`
      DO $$
      BEGIN
        IF NOT EXISTS (
          SELECT 1 FROM pg_constraint
          WHERE conname = 'chk_atoms_confidence_range'
        ) THEN
          ALTER TABLE "atoms"
          ADD CONSTRAINT "chk_atoms_confidence_range"
          CHECK (confidence IS NULL OR (confidence >= 0.0 AND confidence <= 1.0));
        END IF;
      END $$;
    `);

    // Add rationale column
    await queryRunner.query(`
      ALTER TABLE "atoms"
      ADD COLUMN IF NOT EXISTS "rationale" TEXT
    `);

    // Add relatedAtomId column
    await queryRunner.query(`
      ALTER TABLE "atoms"
      ADD COLUMN IF NOT EXISTS "relatedAtomId" UUID
    `);

    // Add proposedBy column
    await queryRunner.query(`
      ALTER TABLE "atoms"
      ADD COLUMN IF NOT EXISTS "proposedBy" VARCHAR(255)
    `);

    // Add approvedBy column
    await queryRunner.query(`
      ALTER TABLE "atoms"
      ADD COLUMN IF NOT EXISTS "approvedBy" VARCHAR(255)
    `);

    // Add approvedAt column
    await queryRunner.query(`
      ALTER TABLE "atoms"
      ADD COLUMN IF NOT EXISTS "approvedAt" TIMESTAMP
    `);

    // Update existing atoms to have source = 'human' where null
    await queryRunner.query(`
      UPDATE "atoms"
      SET "source" = 'human'
      WHERE "source" IS NULL
    `);

    // Create index on status for fast filtering
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "idx_atoms_status"
      ON "atoms" ("status")
    `);

    // Create index on source for filtering by atom source
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "idx_atoms_source"
      ON "atoms" ("source")
    `);

    // Create partial index on proposed atoms for HITL review queries
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "idx_atoms_proposed"
      ON "atoms" ("status", "proposedBy", "createdAt")
      WHERE "status" = 'proposed'
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP INDEX IF EXISTS "idx_atoms_proposed"`);
    await queryRunner.query(`DROP INDEX IF EXISTS "idx_atoms_source"`);
    await queryRunner.query(`DROP INDEX IF EXISTS "idx_atoms_status"`);
    await queryRunner.query(`
      ALTER TABLE "atoms" DROP CONSTRAINT IF EXISTS "chk_atoms_confidence_range"
    `);
    await queryRunner.query(`ALTER TABLE "atoms" DROP COLUMN IF EXISTS "approvedAt"`);
    await queryRunner.query(`ALTER TABLE "atoms" DROP COLUMN IF EXISTS "approvedBy"`);
    await queryRunner.query(`ALTER TABLE "atoms" DROP COLUMN IF EXISTS "proposedBy"`);
    await queryRunner.query(`ALTER TABLE "atoms" DROP COLUMN IF EXISTS "relatedAtomId"`);
    await queryRunner.query(`ALTER TABLE "atoms" DROP COLUMN IF EXISTS "rationale"`);
    await queryRunner.query(`ALTER TABLE "atoms" DROP COLUMN IF EXISTS "confidence"`);
    await queryRunner.query(`ALTER TABLE "atoms" DROP COLUMN IF EXISTS "source"`);
  }
}

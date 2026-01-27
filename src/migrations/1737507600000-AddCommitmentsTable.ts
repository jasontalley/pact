import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Migration: Phase 3 Commitments Table
 *
 * This migration creates:
 * 1. commitments table - Immutable commitment artifacts
 * 2. commitment_atoms join table - Links commitments to atoms
 * 3. Adds committedAt to atoms table
 * 4. Adds immutability trigger for canonical_json
 *
 * Phase 3 Goal: Implement the Commitment Boundary where intent becomes
 * immutable and enforceable.
 */
export class AddCommitmentsTable1737507600000 implements MigrationInterface {
  name = 'AddCommitmentsTable1737507600000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    // ========================================
    // Part 1: Create commitments table
    // ========================================

    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "commitments" (
        "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
        "commitmentId" varchar(20) NOT NULL UNIQUE,
        "projectId" uuid,
        "moleculeId" uuid,
        "canonicalJson" jsonb NOT NULL,
        "committedBy" varchar(255) NOT NULL,
        "committedAt" timestamp NOT NULL DEFAULT now(),
        "invariantChecks" jsonb NOT NULL DEFAULT '[]',
        "overrideJustification" text,
        "supersedes" uuid,
        "supersededBy" uuid,
        "status" varchar(20) NOT NULL DEFAULT 'active',
        "metadata" jsonb NOT NULL DEFAULT '{}',
        CONSTRAINT "PK_commitments" PRIMARY KEY ("id")
      )
    `);

    // ========================================
    // Part 2: Create commitment_atoms join table
    // ========================================

    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "commitment_atoms" (
        "commitmentId" uuid NOT NULL,
        "atomId" uuid NOT NULL,
        CONSTRAINT "PK_commitment_atoms" PRIMARY KEY ("commitmentId", "atomId")
      )
    `);

    // ========================================
    // Part 3: Add committedAt to atoms table
    // ========================================

    await queryRunner.query(`
      ALTER TABLE "atoms"
      ADD COLUMN IF NOT EXISTS "committedAt" timestamp
    `);

    // ========================================
    // Part 4: Create indexes
    // ========================================

    // Index on commitments.projectId
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "IDX_commitments_projectId"
      ON "commitments" ("projectId")
      WHERE "projectId" IS NOT NULL
    `);

    // Index on commitments.moleculeId
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "IDX_commitments_moleculeId"
      ON "commitments" ("moleculeId")
      WHERE "moleculeId" IS NOT NULL
    `);

    // Index on commitments.status
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "IDX_commitments_status"
      ON "commitments" ("status")
    `);

    // Index on commitments.committedAt for time-based queries
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "IDX_commitments_committedAt"
      ON "commitments" ("committedAt" DESC)
    `);

    // Index on commitments.committedBy
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "IDX_commitments_committedBy"
      ON "commitments" ("committedBy")
    `);

    // Index on commitment_atoms.atomId for reverse lookups
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "IDX_commitment_atoms_atomId"
      ON "commitment_atoms" ("atomId")
    `);

    // ========================================
    // Part 5: Add foreign key constraints
    // ========================================

    // FK: commitments.projectId -> projects.id
    await queryRunner.query(`
      ALTER TABLE "commitments"
      ADD CONSTRAINT "FK_commitments_projectId"
      FOREIGN KEY ("projectId")
      REFERENCES "projects"("id")
      ON DELETE SET NULL
    `);

    // FK: commitments.moleculeId -> molecules.id
    await queryRunner.query(`
      ALTER TABLE "commitments"
      ADD CONSTRAINT "FK_commitments_moleculeId"
      FOREIGN KEY ("moleculeId")
      REFERENCES "molecules"("id")
      ON DELETE SET NULL
    `);

    // FK: commitments.supersedes -> commitments.id
    await queryRunner.query(`
      ALTER TABLE "commitments"
      ADD CONSTRAINT "FK_commitments_supersedes"
      FOREIGN KEY ("supersedes")
      REFERENCES "commitments"("id")
      ON DELETE SET NULL
    `);

    // FK: commitments.supersededBy -> commitments.id
    await queryRunner.query(`
      ALTER TABLE "commitments"
      ADD CONSTRAINT "FK_commitments_supersededBy"
      FOREIGN KEY ("supersededBy")
      REFERENCES "commitments"("id")
      ON DELETE SET NULL
    `);

    // FK: commitment_atoms.commitmentId -> commitments.id
    await queryRunner.query(`
      ALTER TABLE "commitment_atoms"
      ADD CONSTRAINT "FK_commitment_atoms_commitmentId"
      FOREIGN KEY ("commitmentId")
      REFERENCES "commitments"("id")
      ON DELETE CASCADE
    `);

    // FK: commitment_atoms.atomId -> atoms.id
    await queryRunner.query(`
      ALTER TABLE "commitment_atoms"
      ADD CONSTRAINT "FK_commitment_atoms_atomId"
      FOREIGN KEY ("atomId")
      REFERENCES "atoms"("id")
      ON DELETE CASCADE
    `);

    // ========================================
    // Part 6: Immutability trigger for canonical_json
    // ========================================

    // Create function to prevent updates to canonical_json
    await queryRunner.query(`
      CREATE OR REPLACE FUNCTION prevent_canonical_json_update()
      RETURNS TRIGGER AS $$
      BEGIN
        IF OLD."canonicalJson" IS DISTINCT FROM NEW."canonicalJson" THEN
          RAISE EXCEPTION 'INV-004: canonicalJson is immutable and cannot be modified';
        END IF;
        RETURN NEW;
      END;
      $$ LANGUAGE plpgsql;
    `);

    // Create trigger
    await queryRunner.query(`
      CREATE TRIGGER commitment_immutability_trigger
      BEFORE UPDATE ON "commitments"
      FOR EACH ROW
      EXECUTE FUNCTION prevent_canonical_json_update();
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    // Drop trigger and function
    await queryRunner.query(
      `DROP TRIGGER IF EXISTS commitment_immutability_trigger ON "commitments"`,
    );
    await queryRunner.query(`DROP FUNCTION IF EXISTS prevent_canonical_json_update`);

    // Drop foreign key constraints
    await queryRunner.query(
      `ALTER TABLE "commitment_atoms" DROP CONSTRAINT IF EXISTS "FK_commitment_atoms_atomId"`,
    );
    await queryRunner.query(
      `ALTER TABLE "commitment_atoms" DROP CONSTRAINT IF EXISTS "FK_commitment_atoms_commitmentId"`,
    );
    await queryRunner.query(
      `ALTER TABLE "commitments" DROP CONSTRAINT IF EXISTS "FK_commitments_supersededBy"`,
    );
    await queryRunner.query(
      `ALTER TABLE "commitments" DROP CONSTRAINT IF EXISTS "FK_commitments_supersedes"`,
    );
    await queryRunner.query(
      `ALTER TABLE "commitments" DROP CONSTRAINT IF EXISTS "FK_commitments_moleculeId"`,
    );
    await queryRunner.query(
      `ALTER TABLE "commitments" DROP CONSTRAINT IF EXISTS "FK_commitments_projectId"`,
    );

    // Drop indexes
    await queryRunner.query(`DROP INDEX IF EXISTS "IDX_commitment_atoms_atomId"`);
    await queryRunner.query(`DROP INDEX IF EXISTS "IDX_commitments_committedBy"`);
    await queryRunner.query(`DROP INDEX IF EXISTS "IDX_commitments_committedAt"`);
    await queryRunner.query(`DROP INDEX IF EXISTS "IDX_commitments_status"`);
    await queryRunner.query(`DROP INDEX IF EXISTS "IDX_commitments_moleculeId"`);
    await queryRunner.query(`DROP INDEX IF EXISTS "IDX_commitments_projectId"`);

    // Remove committedAt from atoms
    await queryRunner.query(`ALTER TABLE "atoms" DROP COLUMN IF EXISTS "committedAt"`);

    // Drop tables
    await queryRunner.query(`DROP TABLE IF EXISTS "commitment_atoms"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "commitments"`);
  }
}

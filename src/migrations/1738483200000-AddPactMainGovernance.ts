import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Phase 15: Pact Main Governance Model
 *
 * Adds governance columns to atoms table:
 * - promotedToMainAt: timestamp for when atom was promoted to Main
 * - changeSetId: FK to molecules.id for governed change set membership
 *
 * Backfills existing committed atoms as "on Main" (promotedToMainAt = committedAt).
 */
export class AddPactMainGovernance1738483200000 implements MigrationInterface {
  name = 'AddPactMainGovernance1738483200000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    // Add promotedToMainAt timestamp column
    await queryRunner.query(`
      ALTER TABLE "atoms"
      ADD COLUMN IF NOT EXISTS "promotedToMainAt" TIMESTAMP NULL
    `);

    // Add changeSetId column with FK to molecules
    await queryRunner.query(`
      ALTER TABLE "atoms"
      ADD COLUMN IF NOT EXISTS "changeSetId" UUID NULL
    `);

    // Add FK constraint (molecules.id)
    await queryRunner.query(`
      DO $$
      BEGIN
        IF NOT EXISTS (
          SELECT 1 FROM pg_constraint WHERE conname = 'FK_atoms_changeSetId_molecules'
        ) THEN
          ALTER TABLE "atoms"
          ADD CONSTRAINT "FK_atoms_changeSetId_molecules"
          FOREIGN KEY ("changeSetId") REFERENCES "molecules"("id")
          ON DELETE SET NULL;
        END IF;
      END $$
    `);

    // Backfill: existing committed atoms are grandfathered as "on Main"
    await queryRunner.query(`
      UPDATE "atoms"
      SET "promotedToMainAt" = "committedAt"
      WHERE "status" = 'committed' AND "promotedToMainAt" IS NULL
    `);

    // Partial index for efficient Main scope queries
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "idx_atoms_promoted"
      ON "atoms" ("promotedToMainAt")
      WHERE "promotedToMainAt" IS NOT NULL
    `);

    // Partial index for efficient change set membership queries
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "idx_atoms_change_set"
      ON "atoms" ("changeSetId")
      WHERE "changeSetId" IS NOT NULL
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP INDEX IF EXISTS "idx_atoms_change_set"`);
    await queryRunner.query(`DROP INDEX IF EXISTS "idx_atoms_promoted"`);
    await queryRunner.query(`
      ALTER TABLE "atoms" DROP CONSTRAINT IF EXISTS "FK_atoms_changeSetId_molecules"
    `);
    await queryRunner.query(`ALTER TABLE "atoms" DROP COLUMN IF EXISTS "changeSetId"`);
    await queryRunner.query(`ALTER TABLE "atoms" DROP COLUMN IF EXISTS "promotedToMainAt"`);
  }
}

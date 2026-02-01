import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Migration: Phase 4 Molecules
 *
 * This migration:
 * 1. Creates the molecules table with hierarchy support
 * 2. Creates the molecule_atoms junction table with composition history
 * 3. Adds triggers for hierarchy cycle prevention and max depth enforcement
 *
 * Phase 4 Goal: Users can organize Intent Atoms into human-friendly groupings
 * called "Molecules" (displayed as "Views" or "Lenses" in UI).
 *
 * Key Design Decisions:
 * - RESTRICT on molecule_atoms.atomId deletion (atoms should be superseded, not hard-deleted)
 * - Soft-delete pattern for junction rows (removedAt/removedBy)
 * - Max hierarchy depth of 10 levels (enforced by trigger)
 * - Cycle prevention via trigger
 */
export class AddMoleculesPhase41738137600000 implements MigrationInterface {
  name = 'AddMoleculesPhase41738137600000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    // ========================================
    // Part 0: Clean up any partial state from failed migrations
    // ========================================

    // Drop junction table first (depends on molecules)
    await queryRunner.query(`DROP TABLE IF EXISTS "molecule_atoms" CASCADE`);
    // Drop molecules table
    await queryRunner.query(`DROP TABLE IF EXISTS "molecules" CASCADE`);
    // Drop functions that may exist
    await queryRunner.query(`DROP FUNCTION IF EXISTS enforce_molecule_max_depth() CASCADE`);
    await queryRunner.query(`DROP FUNCTION IF EXISTS prevent_molecule_cycle() CASCADE`);

    // ========================================
    // Part 1: Create molecules table
    // ========================================

    await queryRunner.query(`
      CREATE TABLE "molecules" (
        "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
        "moleculeId" varchar(20) NOT NULL,
        "name" varchar(255) NOT NULL,
        "description" text,
        "lensType" varchar(50) NOT NULL,
        "lensLabel" varchar(100),
        "parentMoleculeId" uuid,
        "ownerId" varchar(255) NOT NULL,
        "tags" jsonb NOT NULL DEFAULT '[]',
        "metadata" jsonb NOT NULL DEFAULT '{}',
        "createdAt" timestamp NOT NULL DEFAULT now(),
        "updatedAt" timestamp NOT NULL DEFAULT now(),
        CONSTRAINT "PK_molecules" PRIMARY KEY ("id"),
        CONSTRAINT "UQ_molecules_moleculeId" UNIQUE ("moleculeId")
      )
    `);

    // Self-referential foreign key for hierarchy
    await queryRunner.query(`
      ALTER TABLE "molecules"
      ADD CONSTRAINT "FK_molecules_parentMoleculeId"
      FOREIGN KEY ("parentMoleculeId")
      REFERENCES "molecules"("id")
      ON DELETE SET NULL
    `);

    // ========================================
    // Part 2: Create molecule_atoms junction table
    // ========================================

    await queryRunner.query(`
      CREATE TABLE "molecule_atoms" (
        "moleculeId" uuid NOT NULL,
        "atomId" uuid NOT NULL,
        "order" integer NOT NULL DEFAULT 0,
        "note" text,
        "addedAt" timestamp NOT NULL DEFAULT now(),
        "addedBy" varchar(255) NOT NULL,
        "removedAt" timestamp,
        "removedBy" varchar(255),
        CONSTRAINT "PK_molecule_atoms" PRIMARY KEY ("moleculeId", "atomId")
      )
    `);

    // Foreign key to molecules (CASCADE on delete)
    await queryRunner.query(`
      ALTER TABLE "molecule_atoms"
      ADD CONSTRAINT "FK_molecule_atoms_moleculeId"
      FOREIGN KEY ("moleculeId")
      REFERENCES "molecules"("id")
      ON DELETE CASCADE
    `);

    // Foreign key to atoms (RESTRICT on delete)
    // This prevents silent cascade deletion of composition history
    await queryRunner.query(`
      ALTER TABLE "molecule_atoms"
      ADD CONSTRAINT "FK_molecule_atoms_atomId"
      FOREIGN KEY ("atomId")
      REFERENCES "atoms"("id")
      ON DELETE RESTRICT
    `);

    // ========================================
    // Part 3: Create indexes
    // ========================================

    // Molecules indexes
    await queryRunner.query(`
      CREATE UNIQUE INDEX IF NOT EXISTS "IDX_molecules_moleculeId"
      ON "molecules" ("moleculeId")
    `);

    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "IDX_molecules_lensType"
      ON "molecules" ("lensType")
    `);

    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "IDX_molecules_ownerId"
      ON "molecules" ("ownerId")
    `);

    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "IDX_molecules_parentMoleculeId"
      ON "molecules" ("parentMoleculeId")
      WHERE "parentMoleculeId" IS NOT NULL
    `);

    // GIN index for tags filtering
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "IDX_molecules_tags"
      ON "molecules" USING GIN ("tags")
    `);

    // Molecule_atoms indexes
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "IDX_molecule_atoms_moleculeId"
      ON "molecule_atoms" ("moleculeId")
    `);

    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "IDX_molecule_atoms_atomId"
      ON "molecule_atoms" ("atomId")
    `);

    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "IDX_molecule_atoms_order"
      ON "molecule_atoms" ("moleculeId", "order")
    `);

    // Index for active (non-removed) atoms only
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "IDX_molecule_atoms_active"
      ON "molecule_atoms" ("moleculeId")
      WHERE "removedAt" IS NULL
    `);

    // ========================================
    // Part 4: Cycle prevention trigger
    // ========================================

    // Function to check for cycles in molecule hierarchy
    await queryRunner.query(`
      CREATE OR REPLACE FUNCTION prevent_molecule_cycle()
      RETURNS TRIGGER AS $$
      DECLARE
        cycle_found BOOLEAN := FALSE;
        current_id uuid;
        depth INTEGER := 0;
        max_depth INTEGER := 10;
      BEGIN
        -- If no parent, no cycle possible
        IF NEW."parentMoleculeId" IS NULL THEN
          RETURN NEW;
        END IF;

        -- Check if setting this parent would create a cycle
        current_id := NEW."parentMoleculeId";

        WHILE current_id IS NOT NULL AND depth < max_depth + 1 LOOP
          -- If we find our own ID in the ancestor chain, it's a cycle
          IF current_id = NEW.id THEN
            RAISE EXCEPTION 'Cannot set parent: would create a cycle in molecule hierarchy';
          END IF;

          -- Move to the next ancestor
          SELECT "parentMoleculeId" INTO current_id
          FROM molecules
          WHERE id = current_id;

          depth := depth + 1;
        END LOOP;

        RETURN NEW;
      END;
      $$ LANGUAGE plpgsql;
    `);

    // Create trigger for cycle prevention
    await queryRunner.query(`
      DROP TRIGGER IF EXISTS molecule_cycle_check ON molecules;
      CREATE TRIGGER molecule_cycle_check
      BEFORE INSERT OR UPDATE OF "parentMoleculeId" ON molecules
      FOR EACH ROW
      EXECUTE FUNCTION prevent_molecule_cycle();
    `);

    // ========================================
    // Part 5: Max depth enforcement trigger
    // ========================================

    // Function to enforce max hierarchy depth
    await queryRunner.query(`
      CREATE OR REPLACE FUNCTION enforce_molecule_max_depth()
      RETURNS TRIGGER AS $$
      DECLARE
        current_id uuid;
        depth INTEGER := 0;
        max_depth INTEGER := 10;
      BEGIN
        -- If no parent, depth is 0
        IF NEW."parentMoleculeId" IS NULL THEN
          RETURN NEW;
        END IF;

        -- Count ancestors
        current_id := NEW."parentMoleculeId";

        WHILE current_id IS NOT NULL LOOP
          depth := depth + 1;

          IF depth > max_depth THEN
            RAISE EXCEPTION 'Cannot set parent: would exceed maximum hierarchy depth of %', max_depth;
          END IF;

          SELECT "parentMoleculeId" INTO current_id
          FROM molecules
          WHERE id = current_id;
        END LOOP;

        RETURN NEW;
      END;
      $$ LANGUAGE plpgsql;
    `);

    // Create trigger for max depth enforcement
    await queryRunner.query(`
      DROP TRIGGER IF EXISTS molecule_max_depth_check ON molecules;
      CREATE TRIGGER molecule_max_depth_check
      BEFORE INSERT OR UPDATE OF "parentMoleculeId" ON molecules
      FOR EACH ROW
      EXECUTE FUNCTION enforce_molecule_max_depth();
    `);

    // ========================================
    // Part 6: Check constraint for lens type
    // ========================================

    await queryRunner.query(`
      ALTER TABLE "molecules"
      ADD CONSTRAINT "CHK_molecules_lensType"
      CHECK ("lensType" IN ('user_story', 'feature', 'journey', 'epic', 'release', 'capability', 'custom'))
    `);

    // Custom lens label required when type is 'custom'
    await queryRunner.query(`
      ALTER TABLE "molecules"
      ADD CONSTRAINT "CHK_molecules_custom_label"
      CHECK (
        "lensType" != 'custom' OR ("lensType" = 'custom' AND "lensLabel" IS NOT NULL)
      )
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    // Drop check constraints
    await queryRunner.query(`
      ALTER TABLE "molecules"
      DROP CONSTRAINT IF EXISTS "CHK_molecules_custom_label"
    `);

    await queryRunner.query(`
      ALTER TABLE "molecules"
      DROP CONSTRAINT IF EXISTS "CHK_molecules_lensType"
    `);

    // Drop triggers
    await queryRunner.query(`DROP TRIGGER IF EXISTS molecule_max_depth_check ON molecules`);
    await queryRunner.query(`DROP TRIGGER IF EXISTS molecule_cycle_check ON molecules`);

    // Drop functions
    await queryRunner.query(`DROP FUNCTION IF EXISTS enforce_molecule_max_depth()`);
    await queryRunner.query(`DROP FUNCTION IF EXISTS prevent_molecule_cycle()`);

    // Drop indexes
    await queryRunner.query(`DROP INDEX IF EXISTS "IDX_molecule_atoms_active"`);
    await queryRunner.query(`DROP INDEX IF EXISTS "IDX_molecule_atoms_order"`);
    await queryRunner.query(`DROP INDEX IF EXISTS "IDX_molecule_atoms_atomId"`);
    await queryRunner.query(`DROP INDEX IF EXISTS "IDX_molecule_atoms_moleculeId"`);
    await queryRunner.query(`DROP INDEX IF EXISTS "IDX_molecules_tags"`);
    await queryRunner.query(`DROP INDEX IF EXISTS "IDX_molecules_parentMoleculeId"`);
    await queryRunner.query(`DROP INDEX IF EXISTS "IDX_molecules_ownerId"`);
    await queryRunner.query(`DROP INDEX IF EXISTS "IDX_molecules_lensType"`);
    await queryRunner.query(`DROP INDEX IF EXISTS "IDX_molecules_moleculeId"`);

    // Drop foreign keys
    await queryRunner.query(`
      ALTER TABLE "molecule_atoms"
      DROP CONSTRAINT IF EXISTS "FK_molecule_atoms_atomId"
    `);

    await queryRunner.query(`
      ALTER TABLE "molecule_atoms"
      DROP CONSTRAINT IF EXISTS "FK_molecule_atoms_moleculeId"
    `);

    await queryRunner.query(`
      ALTER TABLE "molecules"
      DROP CONSTRAINT IF EXISTS "FK_molecules_parentMoleculeId"
    `);

    // Drop tables
    await queryRunner.query(`DROP TABLE IF EXISTS "molecule_atoms"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "molecules"`);
  }
}

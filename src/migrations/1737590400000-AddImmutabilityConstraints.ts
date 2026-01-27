import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Migration: Phase 3 Immutability Constraints
 *
 * This migration creates database-level enforcement for immutability:
 * 1. Trigger to prevent updates to committed atoms
 * 2. Trigger to prevent changes to committedAt once set
 * 3. Trigger to prevent status changing from 'committed' back to 'draft'
 *
 * Implements INV-004: Commitment Is Immutable
 *
 * Note: These triggers work alongside the existing commitment_immutability_trigger
 * that prevents changes to canonicalJson in the commitments table.
 */
export class AddImmutabilityConstraints1737590400000 implements MigrationInterface {
  name = 'AddImmutabilityConstraints1737590400000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    // ========================================
    // Part 1: Prevent updates to committed atoms
    // ========================================

    // Create function to prevent updates to committed atoms
    // Only allows: status change to 'superseded' and supersededBy update
    await queryRunner.query(`
      CREATE OR REPLACE FUNCTION prevent_committed_atom_update()
      RETURNS TRIGGER AS $$
      BEGIN
        -- If atom is committed, only allow specific changes
        IF OLD.status = 'committed' THEN
          -- Allow status change from 'committed' to 'superseded'
          IF NEW.status = 'superseded' AND OLD.status = 'committed' THEN
            -- Also allow supersededBy to be set when transitioning to superseded
            IF NEW.description IS DISTINCT FROM OLD.description
               OR NEW.category IS DISTINCT FROM OLD.category
               OR NEW."qualityScore" IS DISTINCT FROM OLD."qualityScore"
               OR NEW."observableOutcomes" IS DISTINCT FROM OLD."observableOutcomes"
               OR NEW."falsifiabilityCriteria" IS DISTINCT FROM OLD."falsifiabilityCriteria"
               OR NEW.tags IS DISTINCT FROM OLD.tags
               OR NEW."parentIntent" IS DISTINCT FROM OLD."parentIntent"
               OR NEW."refinementHistory" IS DISTINCT FROM OLD."refinementHistory"
            THEN
              RAISE EXCEPTION 'INV-004: Committed atoms are immutable. Only status can be changed to superseded.';
            END IF;
            RETURN NEW;
          END IF;

          -- Block any other changes to committed atoms
          RAISE EXCEPTION 'INV-004: Committed atoms are immutable. Use supersession to create a new version.';
        END IF;

        -- Allow all changes to draft atoms
        RETURN NEW;
      END;
      $$ LANGUAGE plpgsql;
    `);

    // Create trigger for atom immutability
    await queryRunner.query(`
      CREATE TRIGGER atom_immutability_trigger
      BEFORE UPDATE ON "atoms"
      FOR EACH ROW
      EXECUTE FUNCTION prevent_committed_atom_update();
    `);

    // ========================================
    // Part 2: Prevent changes to committedAt once set
    // ========================================

    await queryRunner.query(`
      CREATE OR REPLACE FUNCTION prevent_committed_at_change()
      RETURNS TRIGGER AS $$
      BEGIN
        IF OLD."committedAt" IS NOT NULL AND NEW."committedAt" IS DISTINCT FROM OLD."committedAt" THEN
          RAISE EXCEPTION 'INV-004: committedAt timestamp is immutable once set.';
        END IF;
        RETURN NEW;
      END;
      $$ LANGUAGE plpgsql;
    `);

    await queryRunner.query(`
      CREATE TRIGGER atom_committed_at_trigger
      BEFORE UPDATE ON "atoms"
      FOR EACH ROW
      EXECUTE FUNCTION prevent_committed_at_change();
    `);

    // ========================================
    // Part 3: Prevent status regression
    // ========================================

    await queryRunner.query(`
      CREATE OR REPLACE FUNCTION prevent_status_regression()
      RETURNS TRIGGER AS $$
      BEGIN
        -- Prevent committed -> draft regression
        IF OLD.status = 'committed' AND NEW.status = 'draft' THEN
          RAISE EXCEPTION 'INV-004: Cannot change status from committed to draft. Use supersession.';
        END IF;

        -- Prevent superseded -> draft regression
        IF OLD.status = 'superseded' AND NEW.status = 'draft' THEN
          RAISE EXCEPTION 'INV-004: Cannot change status from superseded to draft.';
        END IF;

        -- Prevent superseded -> committed regression
        IF OLD.status = 'superseded' AND NEW.status = 'committed' THEN
          RAISE EXCEPTION 'INV-004: Cannot change status from superseded to committed.';
        END IF;

        RETURN NEW;
      END;
      $$ LANGUAGE plpgsql;
    `);

    await queryRunner.query(`
      CREATE TRIGGER atom_status_regression_trigger
      BEFORE UPDATE ON "atoms"
      FOR EACH ROW
      EXECUTE FUNCTION prevent_status_regression();
    `);

    // ========================================
    // Part 4: Prevent deletion of committed atoms
    // ========================================

    await queryRunner.query(`
      CREATE OR REPLACE FUNCTION prevent_committed_atom_deletion()
      RETURNS TRIGGER AS $$
      BEGIN
        IF OLD.status IN ('committed', 'superseded') THEN
          RAISE EXCEPTION 'INV-004: Committed and superseded atoms cannot be deleted.';
        END IF;
        RETURN OLD;
      END;
      $$ LANGUAGE plpgsql;
    `);

    await queryRunner.query(`
      CREATE TRIGGER atom_deletion_trigger
      BEFORE DELETE ON "atoms"
      FOR EACH ROW
      EXECUTE FUNCTION prevent_committed_atom_deletion();
    `);

    // ========================================
    // Part 5: Enhanced commitment immutability
    // ========================================

    // Prevent changes to committedBy and committedAt in commitments
    await queryRunner.query(`
      CREATE OR REPLACE FUNCTION prevent_commitment_metadata_change()
      RETURNS TRIGGER AS $$
      BEGIN
        IF OLD."committedBy" IS DISTINCT FROM NEW."committedBy" THEN
          RAISE EXCEPTION 'INV-004: committedBy is immutable after commitment.';
        END IF;
        IF OLD."committedAt" IS DISTINCT FROM NEW."committedAt" THEN
          RAISE EXCEPTION 'INV-004: committedAt timestamp is immutable.';
        END IF;
        IF OLD."commitmentId" IS DISTINCT FROM NEW."commitmentId" THEN
          RAISE EXCEPTION 'INV-004: commitmentId is immutable.';
        END IF;
        RETURN NEW;
      END;
      $$ LANGUAGE plpgsql;
    `);

    await queryRunner.query(`
      CREATE TRIGGER commitment_metadata_trigger
      BEFORE UPDATE ON "commitments"
      FOR EACH ROW
      EXECUTE FUNCTION prevent_commitment_metadata_change();
    `);

    // ========================================
    // Part 6: Prevent deletion of commitments
    // ========================================

    await queryRunner.query(`
      CREATE OR REPLACE FUNCTION prevent_commitment_deletion()
      RETURNS TRIGGER AS $$
      BEGIN
        RAISE EXCEPTION 'INV-004: Commitments cannot be deleted. They are immutable audit records.';
      END;
      $$ LANGUAGE plpgsql;
    `);

    await queryRunner.query(`
      CREATE TRIGGER commitment_deletion_trigger
      BEFORE DELETE ON "commitments"
      FOR EACH ROW
      EXECUTE FUNCTION prevent_commitment_deletion();
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    // Drop commitment deletion trigger
    await queryRunner.query(`DROP TRIGGER IF EXISTS commitment_deletion_trigger ON "commitments"`);
    await queryRunner.query(`DROP FUNCTION IF EXISTS prevent_commitment_deletion`);

    // Drop commitment metadata trigger
    await queryRunner.query(`DROP TRIGGER IF EXISTS commitment_metadata_trigger ON "commitments"`);
    await queryRunner.query(`DROP FUNCTION IF EXISTS prevent_commitment_metadata_change`);

    // Drop atom deletion trigger
    await queryRunner.query(`DROP TRIGGER IF EXISTS atom_deletion_trigger ON "atoms"`);
    await queryRunner.query(`DROP FUNCTION IF EXISTS prevent_committed_atom_deletion`);

    // Drop status regression trigger
    await queryRunner.query(`DROP TRIGGER IF EXISTS atom_status_regression_trigger ON "atoms"`);
    await queryRunner.query(`DROP FUNCTION IF EXISTS prevent_status_regression`);

    // Drop committedAt trigger
    await queryRunner.query(`DROP TRIGGER IF EXISTS atom_committed_at_trigger ON "atoms"`);
    await queryRunner.query(`DROP FUNCTION IF EXISTS prevent_committed_at_change`);

    // Drop atom immutability trigger
    await queryRunner.query(`DROP TRIGGER IF EXISTS atom_immutability_trigger ON "atoms"`);
    await queryRunner.query(`DROP FUNCTION IF EXISTS prevent_committed_atom_update`);
  }
}

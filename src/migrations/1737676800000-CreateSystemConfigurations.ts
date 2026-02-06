import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Creates system_configurations and configuration_audit_log tables
 * for the layered configuration system (Phase 3.7)
 */
export class CreateSystemConfigurations1737676800000 implements MigrationInterface {
  name = 'CreateSystemConfigurations1737676800000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    // Create system_configurations table (idempotent)
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "system_configurations" (
        "id" uuid NOT NULL DEFAULT gen_random_uuid(),
        "domain" varchar(50) NOT NULL,
        "key" varchar(100) NOT NULL,
        "value" jsonb NOT NULL,
        "value_type" varchar(20) NOT NULL,
        "description" text,
        "env_var_name" varchar(100),
        "code_default" jsonb,
        "validation" jsonb,
        "category" varchar(50),
        "is_sensitive" boolean NOT NULL DEFAULT false,
        "requires_restart" boolean NOT NULL DEFAULT false,
        "created_at" TIMESTAMP NOT NULL DEFAULT now(),
        "updated_at" TIMESTAMP NOT NULL DEFAULT now(),
        "updated_by" varchar(255),
        CONSTRAINT "PK_system_configurations" PRIMARY KEY ("id"),
        CONSTRAINT "UQ_system_configurations_domain_key" UNIQUE ("domain", "key")
      )
    `);

    // Create indexes for system_configurations (idempotent)
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "IDX_system_configurations_domain" ON "system_configurations" ("domain")
    `);

    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "IDX_system_configurations_category" ON "system_configurations" ("category")
    `);

    // Create configuration_audit_log table (idempotent)
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "configuration_audit_log" (
        "id" uuid NOT NULL DEFAULT gen_random_uuid(),
        "config_id" uuid,
        "domain" varchar(50) NOT NULL,
        "key" varchar(100) NOT NULL,
        "old_value" jsonb,
        "new_value" jsonb,
        "changed_by" varchar(255) NOT NULL,
        "changed_at" TIMESTAMP NOT NULL DEFAULT now(),
        "change_reason" text,
        CONSTRAINT "PK_configuration_audit_log" PRIMARY KEY ("id"),
        CONSTRAINT "FK_configuration_audit_log_config" FOREIGN KEY ("config_id")
          REFERENCES "system_configurations"("id") ON DELETE SET NULL
      )
    `);

    // Create indexes for audit log (idempotent)
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "IDX_configuration_audit_log_domain_key" ON "configuration_audit_log" ("domain", "key")
    `);

    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "IDX_configuration_audit_log_changed_at" ON "configuration_audit_log" ("changed_at")
    `);

    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "IDX_configuration_audit_log_changed_by" ON "configuration_audit_log" ("changed_by")
    `);

    // Create trigger for updated_at (CREATE OR REPLACE is already idempotent)
    await queryRunner.query(`
      CREATE OR REPLACE FUNCTION update_system_configurations_updated_at()
      RETURNS TRIGGER AS $$
      BEGIN
        NEW.updated_at = NOW();
        RETURN NEW;
      END;
      $$ LANGUAGE plpgsql
    `);

    // Drop trigger if exists and recreate (idempotent)
    await queryRunner.query(`
      DROP TRIGGER IF EXISTS trigger_update_system_configurations_updated_at ON "system_configurations"
    `);

    await queryRunner.query(`
      CREATE TRIGGER trigger_update_system_configurations_updated_at
      BEFORE UPDATE ON "system_configurations"
      FOR EACH ROW
      EXECUTE FUNCTION update_system_configurations_updated_at()
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `DROP TRIGGER IF EXISTS trigger_update_system_configurations_updated_at ON "system_configurations"`,
    );
    await queryRunner.query(`DROP FUNCTION IF EXISTS update_system_configurations_updated_at`);
    await queryRunner.query(`DROP INDEX IF EXISTS "IDX_configuration_audit_log_changed_by"`);
    await queryRunner.query(`DROP INDEX IF EXISTS "IDX_configuration_audit_log_changed_at"`);
    await queryRunner.query(`DROP INDEX IF EXISTS "IDX_configuration_audit_log_domain_key"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "configuration_audit_log"`);
    await queryRunner.query(`DROP INDEX IF EXISTS "IDX_system_configurations_category"`);
    await queryRunner.query(`DROP INDEX IF EXISTS "IDX_system_configurations_domain"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "system_configurations"`);
  }
}

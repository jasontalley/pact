import {
  Entity,
  Column,
  PrimaryGeneratedColumn,
  CreateDateColumn,
  Index,
} from 'typeorm';

/**
 * API Key entity for authenticating CLI tools, CI pipelines, and external integrations.
 *
 * Keys are stored as SHA-256 hashes — the raw key is shown once on creation and never again.
 * The keyPrefix (first 12 chars) is stored for display/identification purposes.
 */
@Entity('api_keys')
@Index('idx_api_keys_hash', ['keyHash'], { unique: true })
@Index('idx_api_keys_active', ['isActive'])
export class ApiKey {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  /** Human-readable label, e.g. "CI Key", "Local CLI" */
  @Column({ length: 255 })
  name: string;

  /** SHA-256 hex digest of the full key */
  @Column({ length: 64 })
  keyHash: string;

  /** First 12 characters of the key for display (e.g. "pact_a1b2c3d4") */
  @Column({ length: 12 })
  keyPrefix: string;

  @Column({ default: true })
  isActive: boolean;

  @CreateDateColumn()
  createdAt: Date;

  @Column({ type: 'timestamp', nullable: true })
  lastUsedAt: Date | null;

  @Column({ type: 'timestamp', nullable: true })
  revokedAt: Date | null;
}

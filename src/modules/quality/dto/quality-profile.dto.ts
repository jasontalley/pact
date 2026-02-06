import { QualityDimensionConfig } from '../quality-profile.entity';

/**
 * DTO for creating a quality profile
 */
export interface CreateQualityProfileDto {
  /** Profile name */
  name: string;
  /** Optional description */
  description?: string;
  /** Optional project association */
  projectId?: string;
  /** Quality dimension configurations */
  dimensions: QualityDimensionConfig[];
  /** Whether this is the default profile */
  isDefault?: boolean;
}

/**
 * DTO for updating a quality profile
 */
export interface UpdateQualityProfileDto {
  /** Profile name */
  name?: string;
  /** Description */
  description?: string;
  /** Quality dimension configurations */
  dimensions?: QualityDimensionConfig[];
  /** Whether this is the default profile */
  isDefault?: boolean;
}

/**
 * Response DTO for a quality profile
 */
export interface QualityProfileResponseDto {
  id: string;
  name: string;
  description: string | null;
  projectId: string | null;
  dimensions: QualityDimensionConfig[];
  isDefault: boolean;
  createdAt: string;
  updatedAt: string;
}

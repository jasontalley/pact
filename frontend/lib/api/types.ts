// Re-export all types from the central types directory
export * from '@/types/atom';

/**
 * Generic API error response
 */
export interface ApiError {
  statusCode: number;
  message: string;
  error?: string;
}

/**
 * Dashboard statistics response
 */
export interface DashboardStats {
  totalAtoms: number;
  draftAtoms: number;
  committedAtoms: number;
  supersededAtoms: number;
  averageQualityScore: number;
  atomsCreatedToday: number;
  atomsCommittedToday: number;
}

/**
 * Quality dimension breakdown
 */
export interface QualityDimension {
  name: string;
  score: number;
  maxScore: number;
  description: string;
}

/**
 * Full quality assessment result
 */
export interface QualityAssessment {
  overallScore: number;
  dimensions: QualityDimension[];
  recommendations: string[];
  passesThreshold: boolean;
}

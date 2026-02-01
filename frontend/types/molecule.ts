/**
 * Lens types represent familiar product development concepts.
 * Displayed in UI using human-friendly labels.
 */
export type LensType =
  | 'user_story'
  | 'feature'
  | 'journey'
  | 'epic'
  | 'release'
  | 'capability'
  | 'custom';

/**
 * Human-friendly display labels for lens types.
 */
export const LENS_TYPE_LABELS: Record<LensType, string> = {
  user_story: 'User Story',
  feature: 'Feature',
  journey: 'User Journey',
  epic: 'Epic',
  release: 'Release',
  capability: 'Capability',
  custom: 'Custom',
};

/**
 * Descriptions for each lens type.
 */
export const LENS_TYPE_DESCRIPTIONS: Record<LensType, string> = {
  user_story:
    'A specific user need or requirement, typically written as "As a [user], I want [goal] so that [benefit]"',
  feature: 'A distinct piece of functionality that delivers value to users',
  journey: 'A sequence of interactions a user takes to accomplish a goal',
  epic: 'A large body of work that can be broken down into smaller pieces',
  release: 'A collection of features or changes planned for a specific version',
  capability: 'A high-level ability or competency the system provides',
  custom: 'A custom grouping type with your own label',
};

/**
 * Icons for lens types (using lucide-react icon names)
 */
export const LENS_TYPE_ICONS: Record<LensType, string> = {
  user_story: 'User',
  feature: 'Puzzle',
  journey: 'Map',
  epic: 'Layers',
  release: 'Tag',
  capability: 'Zap',
  custom: 'Edit',
};

/**
 * Colors for lens types (Tailwind color classes)
 */
export const LENS_TYPE_COLORS: Record<LensType, string> = {
  user_story: 'blue',
  feature: 'purple',
  journey: 'orange',
  epic: 'cyan',
  release: 'red',
  capability: 'green',
  custom: 'gray',
};

/**
 * Realization status for a molecule
 */
export interface RealizationStatus {
  draft: number;
  committed: number;
  superseded: number;
  overall: 'unrealized' | 'partial' | 'realized';
}

/**
 * Quality score breakdown
 */
export interface QualityScore {
  average: number;
  min: number | null;
  max: number | null;
}

/**
 * Computed metrics for a molecule
 */
export interface MoleculeMetrics {
  atomCount: number;
  validatorCoverage: number;
  verificationHealth: number;
  realizationStatus: RealizationStatus;
  aggregateQuality: QualityScore;
  childMoleculeCount: number;
}

/**
 * Junction record for atom-molecule relationship
 */
export interface MoleculeAtom {
  moleculeId: string;
  atomId: string;
  order: number;
  note: string | null;
  addedAt: string;
  addedBy: string;
  removedAt: string | null;
  removedBy: string | null;
}

/**
 * Core Molecule entity
 */
export interface Molecule {
  id: string;
  moleculeId: string;
  name: string;
  description: string | null;
  lensType: LensType;
  lensLabel: string | null;
  parentMoleculeId: string | null;
  ownerId: string;
  tags: string[];
  metadata: Record<string, unknown>;
  createdAt: string;
  updatedAt: string;
}

/**
 * Molecule with computed metrics (from API response)
 */
export interface MoleculeWithMetrics extends Molecule {
  displayLabel: string;
  metrics: MoleculeMetrics;
}

/**
 * DTO for creating a new molecule
 */
export interface CreateMoleculeDto {
  name: string;
  description?: string;
  lensType: LensType;
  lensLabel?: string;
  parentMoleculeId?: string;
  tags?: string[];
}

/**
 * DTO for updating a molecule
 */
export interface UpdateMoleculeDto {
  name?: string;
  description?: string;
  lensType?: LensType;
  lensLabel?: string;
  parentMoleculeId?: string | null;
  tags?: string[];
}

/**
 * DTO for adding an atom to a molecule
 */
export interface AddAtomToMoleculeDto {
  atomId: string;
  order?: number;
  note?: string;
}

/**
 * DTO for batch adding atoms
 */
export interface BatchAddAtomsDto {
  atoms: AddAtomToMoleculeDto[];
}

/**
 * DTO for reordering atoms
 */
export interface ReorderAtomsDto {
  atomOrders: Array<{ atomId: string; order: number }>;
}

/**
 * Query options for getting atoms
 */
export interface GetAtomsQueryDto {
  includeChildMolecules?: boolean;
  includeAtomDependencies?: boolean;
  recursive?: boolean;
  activeOnly?: boolean;
}

/**
 * Search/filter parameters for molecules
 */
export interface MoleculeFilters {
  lensType?: LensType | LensType[];
  ownerId?: string;
  parentMoleculeId?: string | null;
  hasAtoms?: boolean;
  tags?: string[];
  search?: string;
  limit?: number;
  offset?: number;
  cursor?: string;
  sortBy?: 'name' | 'createdAt' | 'updatedAt' | 'moleculeId';
  sortOrder?: 'asc' | 'desc';
}

/**
 * Paginated response for molecules
 */
export interface MoleculeListResponse {
  items: MoleculeWithMetrics[];
  total: number;
  limit: number;
  offset: number;
  nextCursor?: string;
}

/**
 * Statistics about molecules
 */
export interface MoleculeStatistics {
  totalMolecules: number;
  byLensType: Record<LensType, number>;
  averageAtomsPerMolecule: number;
  rootMoleculeCount: number;
  orphanAtomCount: number;
}

/**
 * Lens type info for UI display
 */
export interface LensTypeInfo {
  type: LensType;
  label: string;
  description: string;
}

/**
 * Helper function to get display label for a molecule
 */
export function getMoleculeDisplayLabel(molecule: Molecule): string {
  if (molecule.lensType === 'custom' && molecule.lensLabel) {
    return molecule.lensLabel;
  }
  return LENS_TYPE_LABELS[molecule.lensType];
}

/**
 * Helper function to get color class for a lens type
 */
export function getLensTypeColorClass(
  lensType: LensType,
  variant: 'bg' | 'text' | 'border' = 'bg'
): string {
  const color = LENS_TYPE_COLORS[lensType];
  return `${variant}-${color}-500`;
}

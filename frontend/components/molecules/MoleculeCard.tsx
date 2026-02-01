'use client';

import { useState } from 'react';
import Link from 'next/link';
import { cn } from '@/lib/utils';
import { MoleculeLensTypeBadge } from './MoleculeLensTypeBadge';
import type { Molecule, MoleculeWithMetrics, MoleculeMetrics } from '@/types/molecule';
import { useDeleteMolecule } from '@/hooks/molecules';
import {
  MoreVertical,
  Edit,
  Trash2,
  Eye,
  Layers,
  GitBranch,
  CheckCircle,
  AlertCircle,
  Clock,
} from 'lucide-react';

interface MoleculeCardProps {
  molecule: Molecule | MoleculeWithMetrics;
  onEdit?: (molecule: Molecule) => void;
  onViewAtoms?: (molecule: Molecule) => void;
  showMetrics?: boolean;
  className?: string;
}

/**
 * Card component for displaying a molecule
 */
export function MoleculeCard({
  molecule,
  onEdit,
  onViewAtoms,
  showMetrics = true,
  className,
}: MoleculeCardProps) {
  const [showMenu, setShowMenu] = useState(false);
  const deleteMolecule = useDeleteMolecule();

  const metrics = 'metrics' in molecule ? molecule.metrics : undefined;

  const handleDelete = () => {
    if (confirm(`Are you sure you want to delete "${molecule.name}"?`)) {
      deleteMolecule.mutate(molecule.id);
    }
  };

  const truncatedDescription =
    molecule.description && molecule.description.length > 120
      ? molecule.description.substring(0, 120) + '...'
      : molecule.description;

  return (
    <div
      className={cn(
        'p-4 rounded-lg border bg-card hover:shadow-md transition-shadow',
        className
      )}
    >
      {/* Header */}
      <div className="flex items-start justify-between gap-2 mb-3">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <Link
              href={`/molecules/${molecule.id}`}
              className="font-medium truncate hover:text-primary hover:underline"
            >
              {molecule.name}
            </Link>
            <span className="text-xs text-muted-foreground font-mono">
              {molecule.moleculeId}
            </span>
          </div>
          {truncatedDescription && (
            <p className="text-sm text-muted-foreground mt-0.5 line-clamp-2">
              {truncatedDescription}
            </p>
          )}
        </div>

        {/* Actions Menu */}
        <div className="relative">
          <button
            onClick={() => setShowMenu(!showMenu)}
            className="p-1 rounded hover:bg-accent"
            aria-label="More actions"
          >
            <MoreVertical className="h-4 w-4" />
          </button>

          {showMenu && (
            <>
              <div
                className="fixed inset-0 z-10"
                onClick={() => setShowMenu(false)}
              />
              <div className="absolute right-0 mt-1 w-48 bg-popover border rounded-md shadow-lg z-20">
                <Link
                  href={`/molecules/${molecule.id}`}
                  className="flex items-center gap-2 w-full px-3 py-2 text-sm hover:bg-accent"
                  onClick={() => setShowMenu(false)}
                >
                  <Eye className="h-4 w-4" />
                  View Details
                </Link>
                {onViewAtoms && (
                  <button
                    onClick={() => {
                      onViewAtoms(molecule);
                      setShowMenu(false);
                    }}
                    className="flex items-center gap-2 w-full px-3 py-2 text-sm hover:bg-accent"
                  >
                    <Layers className="h-4 w-4" />
                    View Atoms
                  </button>
                )}
                {onEdit && (
                  <button
                    onClick={() => {
                      onEdit(molecule);
                      setShowMenu(false);
                    }}
                    className="flex items-center gap-2 w-full px-3 py-2 text-sm hover:bg-accent"
                  >
                    <Edit className="h-4 w-4" />
                    Edit
                  </button>
                )}
                <button
                  onClick={() => {
                    handleDelete();
                    setShowMenu(false);
                  }}
                  className="flex items-center gap-2 w-full px-3 py-2 text-sm hover:bg-accent text-destructive"
                >
                  <Trash2 className="h-4 w-4" />
                  Delete
                </button>
              </div>
            </>
          )}
        </div>
      </div>

      {/* Badges */}
      <div className="flex flex-wrap gap-2 mb-3">
        <MoleculeLensTypeBadge type={molecule.lensType} customLabel={molecule.lensLabel} />
        {molecule.parentMoleculeId && (
          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-xs font-medium bg-gray-100 text-gray-600 dark:bg-gray-800 dark:text-gray-400">
            <GitBranch className="h-3 w-3" />
            Nested
          </span>
        )}
        {molecule.tags && molecule.tags.length > 0 && (
          <>
            {molecule.tags.slice(0, 3).map((tag) => (
              <span
                key={tag}
                className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-blue-100 text-blue-700 dark:bg-blue-900 dark:text-blue-300"
              >
                {tag}
              </span>
            ))}
            {molecule.tags.length > 3 && (
              <span className="text-xs text-muted-foreground">
                +{molecule.tags.length - 3} more
              </span>
            )}
          </>
        )}
      </div>

      {/* Metrics (if available and enabled) */}
      {showMetrics && metrics && (
        <div className="flex items-center gap-4 pt-3 border-t text-sm">
          <div className="flex items-center gap-1">
            <Layers className="h-4 w-4 text-muted-foreground" />
            <span>{metrics.atomCount} atoms</span>
          </div>

          <div className="flex items-center gap-1">
            <RealizationStatusIcon status={metrics.realizationStatus.overall} />
            <span className="capitalize">{metrics.realizationStatus.overall}</span>
          </div>

          {metrics.validatorCoverage !== undefined && (
            <div className="flex items-center gap-1">
              <CheckCircle className="h-4 w-4 text-muted-foreground" />
              <span>{metrics.validatorCoverage}% coverage</span>
            </div>
          )}

          {metrics.aggregateQuality?.average !== undefined && (
            <div className="flex items-center gap-1">
              <QualityIndicator score={metrics.aggregateQuality.average} />
              <span>Q: {metrics.aggregateQuality.average}</span>
            </div>
          )}
        </div>
      )}

      {/* Footer */}
      <div className="flex items-center justify-between text-xs text-muted-foreground mt-3">
        <span>Owner: {molecule.ownerId || 'Unassigned'}</span>
        <span>{new Date(molecule.createdAt).toLocaleDateString()}</span>
      </div>
    </div>
  );
}

/**
 * Icon component for realization status
 */
function RealizationStatusIcon({ status }: { status: string }) {
  switch (status) {
    case 'realized':
      return <CheckCircle className="h-4 w-4 text-green-500" />;
    case 'partial':
      return <Clock className="h-4 w-4 text-yellow-500" />;
    case 'unrealized':
      return <AlertCircle className="h-4 w-4 text-gray-400" />;
    default:
      return <AlertCircle className="h-4 w-4 text-gray-400" />;
  }
}

/**
 * Visual indicator for quality score
 */
function QualityIndicator({ score }: { score: number }) {
  const getColor = () => {
    if (score >= 80) return 'text-green-500';
    if (score >= 60) return 'text-yellow-500';
    return 'text-red-500';
  };

  return (
    <div className={cn('h-4 w-4 rounded-full border-2', getColor())}>
      <div
        className={cn('h-full rounded-full', getColor().replace('text-', 'bg-'))}
        style={{ width: `${score}%` }}
      />
    </div>
  );
}

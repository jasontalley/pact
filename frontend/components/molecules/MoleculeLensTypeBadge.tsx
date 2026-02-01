'use client';

import { cn } from '@/lib/utils';
import type { LensType } from '@/types/molecule';
import { LENS_TYPE_LABELS, LENS_TYPE_COLORS } from '@/types/molecule';

interface MoleculeLensTypeBadgeProps {
  type: LensType;
  customLabel?: string | null;
  className?: string;
}

/**
 * Badge component for displaying molecule lens type
 */
export function MoleculeLensTypeBadge({
  type,
  customLabel,
  className,
}: MoleculeLensTypeBadgeProps) {
  const label = type === 'custom' && customLabel ? customLabel : LENS_TYPE_LABELS[type];
  const colorClass = LENS_TYPE_COLORS[type];

  return (
    <span
      className={cn(
        'inline-flex items-center px-2 py-0.5 rounded text-xs font-medium',
        colorClass,
        className
      )}
    >
      {label}
    </span>
  );
}

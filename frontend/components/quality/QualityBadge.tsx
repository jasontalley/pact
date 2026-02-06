'use client';

import { cn } from '@/lib/utils';

interface QualityBadgeProps {
  score: number | null;
  className?: string;
  showLabel?: boolean;
}

/**
 * Get quality level from score
 */
function getQualityLevel(score: number | null): {
  level: 'unknown' | 'reject' | 'revise' | 'approve';
  label: string;
  className: string;
} {
  if (score === null) {
    return {
      level: 'unknown',
      label: 'Not Scored',
      className: 'bg-gray-100 text-gray-600 dark:bg-gray-800 dark:text-gray-400',
    };
  }

  if (score < 60) {
    return {
      level: 'reject',
      label: 'Needs Work',
      className: 'bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-200',
    };
  }

  if (score < 80) {
    return {
      level: 'revise',
      label: 'Review',
      className: 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900 dark:text-yellow-200',
    };
  }

  return {
    level: 'approve',
    label: 'Ready',
    className: 'bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200',
  };
}

/**
 * Badge component for displaying quality score
 */
export function QualityBadge({ score, className, showLabel = false }: QualityBadgeProps) {
  const { label, className: levelClassName } = getQualityLevel(score);

  return (
    <span
      className={cn(
        'inline-flex items-center px-2 py-0.5 rounded text-xs font-medium',
        levelClassName,
        className
      )}
    >
      {score !== null ? (
        <>
          {score}%{showLabel && ` - ${label}`}
        </>
      ) : (
        label
      )}
    </span>
  );
}

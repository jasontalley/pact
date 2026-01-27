'use client';

import { useState } from 'react';
import { cn } from '@/lib/utils';
import { ValidatorTypeBadge } from './ValidatorTypeBadge';
import { ValidatorFormatBadge } from './ValidatorFormatBadge';
import type { Validator } from '@/types/validator';
import { useActivateValidator, useDeactivateValidator, useDeleteValidator } from '@/hooks/validators';
import { Play, Pause, Trash2, Edit, Languages, MoreVertical } from 'lucide-react';

interface ValidatorCardProps {
  validator: Validator;
  onEdit?: (validator: Validator) => void;
  onTranslate?: (validator: Validator) => void;
  className?: string;
}

/**
 * Card component for displaying a validator
 */
export function ValidatorCard({ validator, onEdit, onTranslate, className }: ValidatorCardProps) {
  const [showMenu, setShowMenu] = useState(false);
  const activateValidator = useActivateValidator();
  const deactivateValidator = useDeactivateValidator();
  const deleteValidator = useDeleteValidator();

  const handleToggleActive = () => {
    if (validator.isActive) {
      deactivateValidator.mutate(validator.id);
    } else {
      activateValidator.mutate(validator.id);
    }
  };

  const handleDelete = () => {
    if (confirm('Are you sure you want to delete this validator?')) {
      deleteValidator.mutate(validator.id);
    }
  };

  const truncatedContent = validator.content.length > 150
    ? validator.content.substring(0, 150) + '...'
    : validator.content;

  return (
    <div
      className={cn(
        'p-4 rounded-lg border bg-card hover:shadow-md transition-shadow',
        !validator.isActive && 'opacity-60',
        className
      )}
    >
      {/* Header */}
      <div className="flex items-start justify-between gap-2 mb-3">
        <div className="flex-1 min-w-0">
          <h3 className="font-medium truncate">{validator.name}</h3>
          {validator.description && (
            <p className="text-sm text-muted-foreground truncate mt-0.5">
              {validator.description}
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
                {onEdit && (
                  <button
                    onClick={() => { onEdit(validator); setShowMenu(false); }}
                    className="flex items-center gap-2 w-full px-3 py-2 text-sm hover:bg-accent"
                  >
                    <Edit className="h-4 w-4" />
                    Edit
                  </button>
                )}
                {onTranslate && (
                  <button
                    onClick={() => { onTranslate(validator); setShowMenu(false); }}
                    className="flex items-center gap-2 w-full px-3 py-2 text-sm hover:bg-accent"
                  >
                    <Languages className="h-4 w-4" />
                    Translate
                  </button>
                )}
                <button
                  onClick={() => { handleToggleActive(); setShowMenu(false); }}
                  className="flex items-center gap-2 w-full px-3 py-2 text-sm hover:bg-accent"
                >
                  {validator.isActive ? (
                    <>
                      <Pause className="h-4 w-4" />
                      Deactivate
                    </>
                  ) : (
                    <>
                      <Play className="h-4 w-4" />
                      Activate
                    </>
                  )}
                </button>
                <button
                  onClick={() => { handleDelete(); setShowMenu(false); }}
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
        <ValidatorTypeBadge type={validator.validatorType} />
        <ValidatorFormatBadge format={validator.format} />
        {!validator.isActive && (
          <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-gray-100 text-gray-600 dark:bg-gray-800 dark:text-gray-400">
            Inactive
          </span>
        )}
      </div>

      {/* Content Preview */}
      <div className="bg-muted rounded p-3 mb-3">
        <pre className="text-xs overflow-x-auto whitespace-pre-wrap font-mono">
          {truncatedContent}
        </pre>
      </div>

      {/* Footer */}
      <div className="flex items-center justify-between text-xs text-muted-foreground">
        <span>
          {validator.executionCount > 0
            ? `Executed ${validator.executionCount} time${validator.executionCount !== 1 ? 's' : ''}`
            : 'Never executed'}
        </span>
        <span>
          {new Date(validator.createdAt).toLocaleDateString()}
        </span>
      </div>
    </div>
  );
}

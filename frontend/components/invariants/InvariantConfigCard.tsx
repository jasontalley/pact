'use client';

import { useState } from 'react';
import { cn } from '@/lib/utils';
import { useEnableInvariant, useDisableInvariant, useUpdateInvariant } from '@/hooks/invariants';
import type { InvariantConfig } from '@/types/invariant';
import { Shield, ShieldAlert, ShieldCheck, Settings, Lock, ChevronDown, ChevronUp } from 'lucide-react';

interface InvariantConfigCardProps {
  invariant: InvariantConfig;
  onEdit?: (invariant: InvariantConfig) => void;
  className?: string;
}

/**
 * Card component for displaying and managing an invariant configuration
 */
export function InvariantConfigCard({
  invariant,
  onEdit,
  className,
}: InvariantConfigCardProps) {
  const [showDetails, setShowDetails] = useState(false);
  const enableMutation = useEnableInvariant();
  const disableMutation = useDisableInvariant();
  const updateMutation = useUpdateInvariant();

  const isToggling = enableMutation.isPending || disableMutation.isPending;

  const handleToggleEnabled = () => {
    if (invariant.isEnabled) {
      disableMutation.mutate(invariant.id);
    } else {
      enableMutation.mutate(invariant.id);
    }
  };

  const handleToggleBlocking = () => {
    updateMutation.mutate({
      id: invariant.id,
      data: { isBlocking: !invariant.isBlocking },
    });
  };

  return (
    <div
      className={cn(
        'border rounded-lg transition-colors',
        invariant.isEnabled
          ? 'bg-card'
          : 'bg-muted/30',
        className
      )}
    >
      {/* Header */}
      <div className="p-4 flex items-start justify-between">
        <div className="flex items-start gap-3 flex-1">
          {/* Icon */}
          <div
            className={cn(
              'p-2 rounded-lg',
              invariant.isEnabled
                ? invariant.isBlocking
                  ? 'bg-red-100 text-red-600'
                  : 'bg-yellow-100 text-yellow-600'
                : 'bg-muted text-muted-foreground'
            )}
          >
            {invariant.isEnabled ? (
              invariant.isBlocking ? (
                <ShieldAlert className="h-5 w-5" />
              ) : (
                <ShieldCheck className="h-5 w-5" />
              )
            ) : (
              <Shield className="h-5 w-5" />
            )}
          </div>

          {/* Content */}
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <span className="font-mono text-sm font-medium">{invariant.invariantId}</span>
              {invariant.isBuiltin && (
                <span className="inline-flex items-center gap-1 text-xs px-2 py-0.5 bg-blue-100 text-blue-800 rounded">
                  <Lock className="h-3 w-3" />
                  Built-in
                </span>
              )}
              <InvariantTypeBadge type={invariant.checkType} />
            </div>
            <h4 className="font-medium mt-1">{invariant.name}</h4>
            <p className="text-sm text-muted-foreground mt-1 line-clamp-2">
              {invariant.description}
            </p>
          </div>
        </div>

        {/* Toggle */}
        <div className="ml-4">
          <button
            onClick={handleToggleEnabled}
            disabled={isToggling}
            className={cn(
              'relative inline-flex h-6 w-11 items-center rounded-full transition-colors',
              invariant.isEnabled ? 'bg-primary' : 'bg-muted',
              isToggling && 'opacity-50 cursor-not-allowed'
            )}
            role="switch"
            aria-checked={invariant.isEnabled}
          >
            <span
              className={cn(
                'inline-block h-4 w-4 transform rounded-full bg-white transition-transform',
                invariant.isEnabled ? 'translate-x-6' : 'translate-x-1'
              )}
            />
          </button>
        </div>
      </div>

      {/* Status Row */}
      <div className="px-4 pb-2 flex items-center gap-4">
        <span
          className={cn(
            'text-xs px-2 py-0.5 rounded',
            invariant.isEnabled
              ? 'bg-green-100 text-green-800'
              : 'bg-gray-100 text-gray-600'
          )}
        >
          {invariant.isEnabled ? 'Enabled' : 'Disabled'}
        </span>
        {invariant.isEnabled && (
          <button
            onClick={handleToggleBlocking}
            disabled={updateMutation.isPending}
            className={cn(
              'text-xs px-2 py-0.5 rounded transition-colors',
              invariant.isBlocking
                ? 'bg-red-100 text-red-800 hover:bg-red-200'
                : 'bg-yellow-100 text-yellow-800 hover:bg-yellow-200'
            )}
          >
            {invariant.isBlocking ? 'Blocking' : 'Warning Only'}
          </button>
        )}
      </div>

      {/* Expand/Collapse */}
      <button
        onClick={() => setShowDetails(!showDetails)}
        className="w-full px-4 py-2 flex items-center justify-center gap-1 text-xs text-muted-foreground hover:bg-muted/50 border-t"
      >
        {showDetails ? (
          <>
            <ChevronUp className="h-3 w-3" /> Hide Details
          </>
        ) : (
          <>
            <ChevronDown className="h-3 w-3" /> Show Details
          </>
        )}
      </button>

      {/* Details */}
      {showDetails && (
        <div className="px-4 pb-4 border-t pt-3 space-y-3">
          <div>
            <p className="text-xs font-medium text-muted-foreground mb-1">Error Message</p>
            <p className="text-sm bg-muted p-2 rounded">{invariant.errorMessage}</p>
          </div>

          {invariant.suggestionPrompt && (
            <div>
              <p className="text-xs font-medium text-muted-foreground mb-1">Suggestion</p>
              <p className="text-sm bg-muted p-2 rounded">{invariant.suggestionPrompt}</p>
            </div>
          )}

          {invariant.checkConfig && Object.keys(invariant.checkConfig).length > 0 && (
            <div>
              <p className="text-xs font-medium text-muted-foreground mb-1">Configuration</p>
              <pre className="text-xs bg-muted p-2 rounded overflow-x-auto">
                {JSON.stringify(invariant.checkConfig, null, 2)}
              </pre>
            </div>
          )}

          {onEdit && !invariant.isBuiltin && (
            <button
              onClick={() => onEdit(invariant)}
              className="flex items-center gap-1 text-sm text-primary hover:underline"
            >
              <Settings className="h-4 w-4" />
              Edit Configuration
            </button>
          )}
        </div>
      )}
    </div>
  );
}

/**
 * Badge for invariant check type
 */
function InvariantTypeBadge({ type }: { type: string }) {
  const config: Record<string, { bg: string; text: string; label: string }> = {
    builtin: { bg: 'bg-purple-100', text: 'text-purple-800', label: 'Built-in' },
    custom: { bg: 'bg-orange-100', text: 'text-orange-800', label: 'Custom' },
    llm: { bg: 'bg-cyan-100', text: 'text-cyan-800', label: 'LLM' },
  };

  const { bg, text, label } = config[type] || config.builtin;

  return (
    <span className={cn('text-xs px-2 py-0.5 rounded', bg, text)}>
      {label}
    </span>
  );
}

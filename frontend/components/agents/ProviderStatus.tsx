'use client';

import { cn } from '@/lib/utils';
import { useProviders, useBudgetStatus } from '@/hooks/llm';
import type { ProviderStatus as ProviderStatusType, LLMProviderType } from '@/types/llm';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';

interface ProviderStatusProps {
  className?: string;
  showBudget?: boolean;
  compact?: boolean;
}

/**
 * Provider icon based on provider name
 */
function ProviderIcon({ provider, available }: { provider: LLMProviderType; available: boolean }) {
  const baseClass = 'w-3 h-3 rounded-full';
  const statusColor = available ? 'bg-green-500' : 'bg-gray-400';

  return (
    <span
      className={cn(baseClass, statusColor)}
      aria-label={`${provider} ${available ? 'available' : 'unavailable'}`}
    />
  );
}

/**
 * Individual provider status badge
 */
function ProviderBadge({ provider }: { provider: ProviderStatusType }) {
  const providerLabels: Record<LLMProviderType, string> = {
    openai: 'OpenAI',
    anthropic: 'Anthropic',
    ollama: 'Local',
  };

  return (
    <TooltipProvider>
      <Tooltip>
        <TooltipTrigger asChild>
          <div
            className={cn(
              'flex items-center gap-1.5 px-2 py-1 rounded-md text-xs',
              provider.available
                ? 'bg-green-50 text-green-700 dark:bg-green-950 dark:text-green-300'
                : 'bg-gray-50 text-gray-500 dark:bg-gray-900 dark:text-gray-500'
            )}
          >
            <ProviderIcon provider={provider.name} available={provider.available} />
            <span>{providerLabels[provider.name]}</span>
          </div>
        </TooltipTrigger>
        <TooltipContent>
          <div className="text-xs">
            <p className="font-medium">{provider.displayName}</p>
            <p className="text-muted-foreground">
              {provider.available ? 'Available' : 'Unavailable'}
            </p>
            {provider.health.averageLatencyMs && (
              <p className="text-muted-foreground">
                Latency: {provider.health.averageLatencyMs}ms
              </p>
            )}
            {provider.supportedModels.length > 0 && (
              <p className="text-muted-foreground mt-1">
                Models: {provider.supportedModels.slice(0, 3).join(', ')}
                {provider.supportedModels.length > 3 && '...'}
              </p>
            )}
          </div>
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}

/**
 * Budget indicator with progress bar
 */
function BudgetIndicator() {
  const { data: budget, dailyUtilization, isDailyBudgetExceeded } = useBudgetStatus();

  if (!budget) return null;

  const progressColor = isDailyBudgetExceeded
    ? 'bg-red-500'
    : dailyUtilization > 80
    ? 'bg-yellow-500'
    : 'bg-green-500';

  return (
    <TooltipProvider>
      <Tooltip>
        <TooltipTrigger asChild>
          <div className="flex items-center gap-2">
            <div className="w-20">
              <Progress
                value={Math.min(dailyUtilization, 100)}
                className="h-1.5"
              />
            </div>
            <span className="text-xs text-muted-foreground">
              ${budget.dailyCost.toFixed(2)}
            </span>
          </div>
        </TooltipTrigger>
        <TooltipContent>
          <div className="text-xs">
            <p className="font-medium">Budget Status</p>
            <p>
              Daily: ${budget.dailyCost.toFixed(2)} / ${budget.dailyLimit.toFixed(2)} ({dailyUtilization.toFixed(0)}%)
            </p>
            <p>
              Monthly: ${budget.monthlyCost.toFixed(2)} / ${budget.monthlyLimit.toFixed(2)} ({budget.monthlyUtilization.toFixed(0)}%)
            </p>
            {budget.hardStopEnabled && (
              <p className="text-yellow-600 mt-1">Hard stop enabled</p>
            )}
          </div>
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}

/**
 * Provider Status Indicator Component
 *
 * Shows which LLM providers are available, their health status,
 * and optionally the current budget utilization.
 */
export function ProviderStatus({
  className,
  showBudget = true,
  compact = false,
}: ProviderStatusProps) {
  const { data, isLoading, error } = useProviders();

  if (isLoading) {
    return (
      <div className={cn('flex items-center gap-2', className)}>
        <div className="animate-pulse flex gap-2">
          <div className="w-16 h-6 bg-gray-200 rounded dark:bg-gray-700" />
          <div className="w-16 h-6 bg-gray-200 rounded dark:bg-gray-700" />
        </div>
      </div>
    );
  }

  if (error || !data) {
    return (
      <div className={cn('flex items-center gap-2', className)}>
        <Badge variant="destructive" className="text-xs">
          LLM Unavailable
        </Badge>
      </div>
    );
  }

  if (compact) {
    // Compact mode: just show availability count
    return (
      <TooltipProvider>
        <Tooltip>
          <TooltipTrigger asChild>
            <div className={cn('flex items-center gap-1.5', className)}>
              <span
                className={cn(
                  'w-2 h-2 rounded-full',
                  data.availableCount > 0 ? 'bg-green-500' : 'bg-red-500'
                )}
              />
              <span className="text-xs text-muted-foreground">
                {data.availableCount}/{data.totalCount} LLM
              </span>
            </div>
          </TooltipTrigger>
          <TooltipContent>
            <div className="text-xs">
              <p className="font-medium">LLM Providers</p>
              {data.providers.map((p) => (
                <p key={p.name} className="flex items-center gap-1.5 mt-0.5">
                  <ProviderIcon provider={p.name} available={p.available} />
                  {p.displayName}
                </p>
              ))}
            </div>
          </TooltipContent>
        </Tooltip>
      </TooltipProvider>
    );
  }

  // Full mode: show each provider badge
  return (
    <div className={cn('flex items-center gap-3', className)}>
      <div className="flex items-center gap-1.5">
        {data.providers.map((provider) => (
          <ProviderBadge key={provider.name} provider={provider} />
        ))}
      </div>
      {showBudget && <BudgetIndicator />}
    </div>
  );
}

/**
 * Compact provider indicator for headers/sidebars
 */
export function ProviderStatusCompact({ className }: { className?: string }) {
  return <ProviderStatus compact showBudget={false} className={className} />;
}

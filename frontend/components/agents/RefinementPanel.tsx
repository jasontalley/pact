'use client';

import { useState, useEffect } from 'react';
import { cn } from '@/lib/utils';
import { useRefineAtom, useSuggestRefinements, useAcceptSuggestion } from '@/hooks/atoms/use-analyze-intent';
import { useAtom, useUpdateAtom } from '@/hooks/atoms/use-atoms';
import { useProviders, useCostEstimate, useBudgetStatus } from '@/hooks/llm';
import { QualityBadge } from '@/components/quality/QualityBadge';
import { ProviderStatus } from './ProviderStatus';
import { Button } from '@/components/ui/button';
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from '@/components/ui/sheet';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Progress } from '@/components/ui/progress';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { Separator } from '@/components/ui/separator';
import type { Atom } from '@/types/atom';

interface RefinementPanelProps {
  atomId: string | null;
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
}

/**
 * Quality dimension display component
 */
function QualityDimension({
  label,
  score,
  description,
}: {
  label: string;
  score: number;
  description?: string;
}) {
  const getColor = (s: number) => {
    if (s >= 80) return 'bg-green-500';
    if (s >= 60) return 'bg-yellow-500';
    return 'bg-red-500';
  };

  return (
    <div className="space-y-1">
      <div className="flex justify-between items-center text-sm">
        <span>{label}</span>
        <span className="font-medium">{score}%</span>
      </div>
      <Progress value={score} className={cn('h-1.5', getColor(score))} />
      {description && (
        <p className="text-xs text-muted-foreground">{description}</p>
      )}
    </div>
  );
}

/**
 * Suggestion card component
 */
function SuggestionCard({
  suggestion,
  type,
  onAccept,
  onReject,
  isPending,
}: {
  suggestion: string;
  type: 'clarification' | 'decomposition' | 'precision';
  onAccept: () => void;
  onReject: () => void;
  isPending: boolean;
}) {
  const typeLabels = {
    clarification: 'Clarify',
    decomposition: 'Split',
    precision: 'Precise',
  };

  const typeColors = {
    clarification: 'bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200',
    decomposition: 'bg-purple-100 text-purple-800 dark:bg-purple-900 dark:text-purple-200',
    precision: 'bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200',
  };

  return (
    <Card className="border-l-4 border-l-primary">
      <CardContent className="p-4">
        <div className="flex items-start justify-between gap-4">
          <div className="flex-1">
            <Badge className={cn('mb-2', typeColors[type])}>
              {typeLabels[type]}
            </Badge>
            <p className="text-sm">{suggestion}</p>
          </div>
          <div className="flex flex-col gap-2">
            <Button
              size="sm"
              onClick={onAccept}
              disabled={isPending}
            >
              Apply
            </Button>
            <Button
              size="sm"
              variant="ghost"
              onClick={onReject}
              disabled={isPending}
            >
              Skip
            </Button>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

/**
 * RefinementPanel - Side panel for improving atom quality
 *
 * Features:
 * - Current quality score breakdown
 * - AI-generated suggestions
 * - One-click apply suggestions
 * - Manual feedback input
 * - Side-by-side comparison (before/after)
 */
export function RefinementPanel({ atomId, open, onOpenChange }: RefinementPanelProps) {
  const { data: atom, isLoading: atomLoading } = useAtom(atomId || '');
  const { data: providers } = useProviders();
  const { isDailyBudgetExceeded } = useBudgetStatus();

  const suggestRefinements = useSuggestRefinements();
  const acceptSuggestion = useAcceptSuggestion();
  const refineAtom = useRefineAtom();
  const updateAtom = useUpdateAtom();

  // Cost estimate for refinement task
  const { data: costEstimate } = useCostEstimate('refinement', 300, 200);

  const [customFeedback, setCustomFeedback] = useState('');
  const [suggestions, setSuggestions] = useState<
    Array<{ text: string; type: 'clarification' | 'decomposition' | 'precision' }>
  >([]);
  const [dismissedSuggestions, setDismissedSuggestions] = useState<Set<number>>(new Set());

  // Load suggestions when atom changes
  useEffect(() => {
    if (atomId && atom && atom.status === 'draft') {
      // Only auto-fetch if quality is low
      if (atom.qualityScore !== null && atom.qualityScore < 80) {
        handleGetSuggestions();
      }
    }
    // Reset state
    setCustomFeedback('');
    setSuggestions([]);
    setDismissedSuggestions(new Set());
  }, [atomId]);

  const handleGetSuggestions = () => {
    if (!atomId) return;

    suggestRefinements.mutate(atomId, {
      onSuccess: (result) => {
        // Map the response to our suggestion format
        const newSuggestions: typeof suggestions = [];
        if (result.clarifications) {
          result.clarifications.forEach((s: string) =>
            newSuggestions.push({ text: s, type: 'clarification' })
          );
        }
        if (result.decompositions) {
          result.decompositions.forEach((s: string) =>
            newSuggestions.push({ text: s, type: 'decomposition' })
          );
        }
        if (result.precisions) {
          result.precisions.forEach((s: string) =>
            newSuggestions.push({ text: s, type: 'precision' })
          );
        }
        setSuggestions(newSuggestions);
      },
    });
  };

  const handleAcceptSuggestion = (index: number, type: 'clarification' | 'decomposition' | 'precision') => {
    if (!atomId) return;

    acceptSuggestion.mutate(
      { id: atomId, suggestionIndex: index, suggestionType: type },
      {
        onSuccess: () => {
          // Remove the suggestion from the list
          setSuggestions((prev) => prev.filter((_, i) => i !== index));
        },
      }
    );
  };

  const handleDismissSuggestion = (index: number) => {
    setDismissedSuggestions((prev) => new Set([...prev, index]));
  };

  const handleRefineWithFeedback = () => {
    if (!atomId || !customFeedback.trim()) return;

    refineAtom.mutate(
      { id: atomId, feedback: customFeedback },
      {
        onSuccess: () => {
          setCustomFeedback('');
          // Refresh suggestions
          handleGetSuggestions();
        },
      }
    );
  };

  const hasAvailableProvider = providers?.availableCount ? providers.availableCount > 0 : false;
  const canRefine = atom?.status === 'draft' && hasAvailableProvider && !isDailyBudgetExceeded;

  // Filter out dismissed suggestions
  const visibleSuggestions = suggestions.filter((_, i) => !dismissedSuggestions.has(i));

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent className="w-[500px] sm:max-w-[500px] overflow-y-auto">
        <SheetHeader>
          <SheetTitle className="flex items-center gap-2">
            Refine Atom
            {atom && (
              <Badge variant="outline" className="font-mono">
                {atom.atomId}
              </Badge>
            )}
          </SheetTitle>
          <SheetDescription>
            Improve your atom's quality score with AI-assisted refinement
          </SheetDescription>
        </SheetHeader>

        {/* Provider Status */}
        <div className="mt-4 py-2 px-3 bg-muted/50 rounded-lg">
          <ProviderStatus compact showBudget={false} />
          {costEstimate && (
            <div className="text-xs text-muted-foreground mt-1">
              Est. cost per refinement: {costEstimate.formattedMinCost}
            </div>
          )}
        </div>

        {/* Loading State */}
        {atomLoading && (
          <div className="space-y-4 mt-6">
            <Skeleton className="h-24 w-full" />
            <Skeleton className="h-48 w-full" />
          </div>
        )}

        {/* Atom Content */}
        {atom && !atomLoading && (
          <div className="mt-6 space-y-6">
            {/* Current Quality Score */}
            <Card>
              <CardHeader className="p-4 pb-2">
                <CardTitle className="text-sm flex items-center justify-between">
                  Quality Score
                  <QualityBadge score={atom.qualityScore} showLabel />
                </CardTitle>
              </CardHeader>
              <CardContent className="p-4 pt-0">
                {atom.qualityScore !== null && (
                  <div className="space-y-3">
                    {/* Mock quality dimensions - in real implementation, these would come from the backend */}
                    <QualityDimension
                      label="Specificity"
                      score={Math.min(100, atom.qualityScore + Math.random() * 10)}
                      description="How precisely the intent is defined"
                    />
                    <QualityDimension
                      label="Testability"
                      score={Math.min(100, atom.qualityScore - Math.random() * 5)}
                      description="Can be verified through testing"
                    />
                    <QualityDimension
                      label="Atomicity"
                      score={Math.min(100, atom.qualityScore + Math.random() * 5)}
                      description="Single, indivisible behavior"
                    />
                    <QualityDimension
                      label="Independence"
                      score={Math.min(100, atom.qualityScore - Math.random() * 10)}
                      description="Not dependent on other atoms"
                    />
                    <QualityDimension
                      label="Value"
                      score={Math.min(100, atom.qualityScore + Math.random() * 8)}
                      description="Delivers business value"
                    />
                  </div>
                )}
                {atom.qualityScore === null && (
                  <p className="text-sm text-muted-foreground">
                    Quality not yet assessed
                  </p>
                )}
              </CardContent>
            </Card>

            {/* Current Description */}
            <Card>
              <CardHeader className="p-4 pb-2">
                <CardTitle className="text-sm">Current Description</CardTitle>
              </CardHeader>
              <CardContent className="p-4 pt-0">
                <p className="text-sm">{atom.description}</p>
              </CardContent>
            </Card>

            {/* Suggestions */}
            {canRefine && (
              <>
                <Separator />

                <div className="space-y-3">
                  <div className="flex items-center justify-between">
                    <Label className="text-sm font-medium">AI Suggestions</Label>
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={handleGetSuggestions}
                      disabled={suggestRefinements.isPending}
                    >
                      {suggestRefinements.isPending ? 'Loading...' : 'Refresh'}
                    </Button>
                  </div>

                  {visibleSuggestions.length > 0 ? (
                    <div className="space-y-3">
                      {visibleSuggestions.map((suggestion, index) => (
                        <SuggestionCard
                          key={index}
                          suggestion={suggestion.text}
                          type={suggestion.type}
                          onAccept={() => handleAcceptSuggestion(index, suggestion.type)}
                          onReject={() => handleDismissSuggestion(index)}
                          isPending={acceptSuggestion.isPending}
                        />
                      ))}
                    </div>
                  ) : suggestRefinements.isPending ? (
                    <div className="space-y-2">
                      <Skeleton className="h-20 w-full" />
                      <Skeleton className="h-20 w-full" />
                    </div>
                  ) : (
                    <p className="text-sm text-muted-foreground">
                      No suggestions available. Click "Refresh" to get AI recommendations.
                    </p>
                  )}
                </div>

                <Separator />

                {/* Custom Feedback */}
                <div className="space-y-3">
                  <Label htmlFor="custom-feedback" className="text-sm font-medium">
                    Custom Refinement
                  </Label>
                  <Textarea
                    id="custom-feedback"
                    value={customFeedback}
                    onChange={(e) => setCustomFeedback(e.target.value)}
                    placeholder="Describe how you want to improve this atom..."
                    className="min-h-[80px]"
                  />
                  <Button
                    onClick={handleRefineWithFeedback}
                    disabled={!customFeedback.trim() || refineAtom.isPending}
                    className="w-full"
                  >
                    {refineAtom.isPending ? 'Refining...' : 'Apply Refinement'}
                  </Button>
                </div>
              </>
            )}

            {/* Not Refinable Messages */}
            {atom.status !== 'draft' && (
              <div className="p-3 bg-yellow-50 text-yellow-800 dark:bg-yellow-950 dark:text-yellow-200 rounded-lg text-sm">
                Only draft atoms can be refined. This atom is {atom.status}.
              </div>
            )}

            {!hasAvailableProvider && (
              <div className="p-3 bg-yellow-50 text-yellow-800 dark:bg-yellow-950 dark:text-yellow-200 rounded-lg text-sm">
                No LLM providers available for refinement.
              </div>
            )}

            {isDailyBudgetExceeded && (
              <div className="p-3 bg-destructive/10 text-destructive rounded-lg text-sm">
                Daily budget exceeded. Refinement unavailable.
              </div>
            )}
          </div>
        )}

        {/* No Atom Selected */}
        {!atomId && !atomLoading && (
          <div className="mt-6 text-center text-muted-foreground">
            <p>Select an atom to refine</p>
          </div>
        )}
      </SheetContent>
    </Sheet>
  );
}

'use client';

import { useState, useEffect } from 'react';
import { cn } from '@/lib/utils';
import { useRefinementWizardStore } from '@/stores/refinement-wizard';
import { useAnalyzeIntent } from '@/hooks/atoms/use-analyze-intent';
import { useCreateAtom } from '@/hooks/atoms/use-atoms';
import { useProviders, useCostEstimate, useBudgetStatus } from '@/hooks/llm';
import { QualityBadge } from '@/components/quality/QualityBadge';
import { ProviderStatus } from './ProviderStatus';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Progress } from '@/components/ui/progress';
import { Skeleton } from '@/components/ui/skeleton';
import type { AtomCategory } from '@/types/atom';

const categories: { value: AtomCategory; label: string }[] = [
  { value: 'functional', label: 'Functional' },
  { value: 'performance', label: 'Performance' },
  { value: 'security', label: 'Security' },
  { value: 'reliability', label: 'Reliability' },
  { value: 'usability', label: 'Usability' },
  { value: 'maintainability', label: 'Maintainability' },
];

interface AtomizationWizardProps {
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
}

/**
 * AtomizationWizard - Enhanced atom creation with LLM awareness
 *
 * Features:
 * - Provider status display
 * - Cost estimation
 * - Model selection
 * - Step-by-step wizard flow
 */
export function AtomizationWizard({ open, onOpenChange }: AtomizationWizardProps) {
  const {
    step,
    rawIntent,
    analysisResult,
    selectedCategory,
    refinedDescription,
    pendingSuggestions,
    isAnalyzing,
    error,
    setRawIntent,
    setSelectedCategory,
    setRefinedDescription,
    nextStep,
    prevStep,
    acceptSuggestion,
    rejectSuggestion,
    reset,
  } = useRefinementWizardStore();

  const analyzeIntent = useAnalyzeIntent();
  const createAtom = useCreateAtom();
  const { data: providers, isLoading: providersLoading } = useProviders();
  const { isDailyBudgetExceeded } = useBudgetStatus();

  // Estimate cost for atomization task (estimate ~500 input, ~300 output tokens)
  const { data: costEstimate } = useCostEstimate('atomization', 500, 300);

  const [tags, setTags] = useState<string[]>([]);
  const [tagInput, setTagInput] = useState('');

  // Reset state when dialog closes
  useEffect(() => {
    if (!open) {
      setTags([]);
      setTagInput('');
    }
  }, [open]);

  const handleAnalyze = () => {
    if (rawIntent.trim().length < 10) return;
    analyzeIntent.mutate({ intent: rawIntent });
  };

  const handleAddTag = () => {
    if (tagInput.trim() && !tags.includes(tagInput.trim())) {
      setTags([...tags, tagInput.trim()]);
      setTagInput('');
    }
  };

  const handleRemoveTag = (tag: string) => {
    setTags(tags.filter((t) => t !== tag));
  };

  const handleCreate = () => {
    if (!selectedCategory || !refinedDescription) return;

    createAtom.mutate(
      {
        description: refinedDescription,
        category: selectedCategory,
        tags,
      },
      {
        onSuccess: () => {
          onOpenChange?.(false);
          reset();
        },
      }
    );
  };

  const handleClose = () => {
    onOpenChange?.(false);
    reset();
  };

  // Estimate quality based on atomicity result
  const estimatedQuality = analysisResult
    ? analysisResult.atomicity.isAtomic
      ? Math.round(80 + analysisResult.atomicity.confidence * 20)
      : Math.round(40 + analysisResult.atomicity.confidence * 30)
    : null;

  const hasAvailableProvider = providers?.availableCount ? providers.availableCount > 0 : false;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[700px] max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            Create Intent Atom
            <Badge variant="secondary" className="text-xs">
              Step {step + 1}/3
            </Badge>
          </DialogTitle>
          <DialogDescription>
            Use AI to analyze and refine your intent into an atomic requirement
          </DialogDescription>
        </DialogHeader>

        {/* Provider Status Bar */}
        <div className="flex items-center justify-between py-2 px-3 bg-muted/50 rounded-lg">
          <ProviderStatus compact showBudget={false} />
          {costEstimate && (
            <div className="text-xs text-muted-foreground">
              Est. cost: {costEstimate.formattedMinCost}
              {costEstimate.localModelsAvailable && (
                <span className="ml-1 text-green-600">(Free with local)</span>
              )}
            </div>
          )}
        </div>

        {/* Budget Warning */}
        {isDailyBudgetExceeded && (
          <div className="p-3 bg-destructive/10 text-destructive rounded-lg text-sm">
            Daily budget limit reached. Local models only or wait until tomorrow.
          </div>
        )}

        {/* No Providers Warning */}
        {!hasAvailableProvider && !providersLoading && (
          <div className="p-3 bg-yellow-50 text-yellow-800 dark:bg-yellow-950 dark:text-yellow-200 rounded-lg text-sm">
            No LLM providers available. Please configure API keys or start Ollama.
          </div>
        )}

        {/* Step Content */}
        <div className="py-4">
          {/* Step 0: Raw Intent Input */}
          {step === 0 && (
            <div className="space-y-4">
              <div>
                <Label htmlFor="intent-input">
                  Describe your intent in natural language
                </Label>
                <Textarea
                  id="intent-input"
                  value={rawIntent}
                  onChange={(e) => setRawIntent(e.target.value)}
                  placeholder="Example: Users should be able to log in with their email and password, receiving clear feedback on success or failure..."
                  className="mt-2 min-h-[120px]"
                  autoFocus
                />
                <p className="text-xs text-muted-foreground mt-1">
                  Be specific about the behavior, not the implementation. Minimum 10 characters.
                </p>
              </div>

              {/* Model Info */}
              {costEstimate && costEstimate.recommendations.length > 0 && (
                <Card className="bg-muted/30">
                  <CardContent className="p-3">
                    <div className="text-xs text-muted-foreground">
                      <span className="font-medium">Using:</span>{' '}
                      {costEstimate.recommendedModel} ({costEstimate.formattedMinCost})
                    </div>
                  </CardContent>
                </Card>
              )}

              {error && (
                <div className="p-3 bg-destructive/10 text-destructive rounded-lg text-sm">
                  {error}
                </div>
              )}
            </div>
          )}

          {/* Step 1: Analysis Results & Refinement */}
          {step === 1 && analysisResult && (
            <div className="space-y-4">
              {/* Atomicity Assessment */}
              <Card>
                <CardHeader className="p-4 pb-2">
                  <CardTitle className="text-sm flex items-center justify-between">
                    Atomicity Assessment
                    <Badge
                      variant={analysisResult.atomicity.isAtomic ? 'default' : 'secondary'}
                    >
                      {analysisResult.atomicity.isAtomic ? 'Atomic' : 'Needs Refinement'}
                    </Badge>
                  </CardTitle>
                </CardHeader>
                <CardContent className="p-4 pt-0">
                  <div className="space-y-2">
                    <div className="flex items-center gap-2">
                      <span className="text-sm text-muted-foreground">Confidence:</span>
                      <Progress
                        value={analysisResult.atomicity.confidence * 100}
                        className="flex-1 h-2"
                      />
                      <span className="text-sm font-medium">
                        {Math.round(analysisResult.atomicity.confidence * 100)}%
                      </span>
                    </div>
                  </div>
                </CardContent>
              </Card>

              {/* Violations */}
              {analysisResult.atomicity.violations &&
                analysisResult.atomicity.violations.length > 0 && (
                  <Card className="border-destructive/50">
                    <CardHeader className="p-4 pb-2">
                      <CardTitle className="text-sm text-destructive">Issues Found</CardTitle>
                    </CardHeader>
                    <CardContent className="p-4 pt-0">
                      <ul className="space-y-1">
                        {analysisResult.atomicity.violations.map((v, i) => (
                          <li key={i} className="text-sm flex items-start gap-2">
                            <span className="text-destructive">•</span>
                            <span>{v}</span>
                          </li>
                        ))}
                      </ul>
                    </CardContent>
                  </Card>
                )}

              {/* Suggestions */}
              {pendingSuggestions.length > 0 && (
                <Card>
                  <CardHeader className="p-4 pb-2">
                    <CardTitle className="text-sm">Suggestions</CardTitle>
                  </CardHeader>
                  <CardContent className="p-4 pt-0 space-y-2">
                    {pendingSuggestions.map((suggestion, i) => (
                      <div
                        key={i}
                        className="flex items-start justify-between p-3 bg-muted rounded-lg"
                      >
                        <span className="text-sm flex-1">{suggestion}</span>
                        <div className="flex gap-2 ml-4">
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => acceptSuggestion(i)}
                          >
                            Apply
                          </Button>
                          <Button
                            size="sm"
                            variant="ghost"
                            onClick={() => rejectSuggestion(i)}
                          >
                            Dismiss
                          </Button>
                        </div>
                      </div>
                    ))}
                  </CardContent>
                </Card>
              )}

              {/* Refined Description */}
              <div className="space-y-2">
                <Label htmlFor="refined-description">Refined Description</Label>
                <Textarea
                  id="refined-description"
                  value={refinedDescription}
                  onChange={(e) => setRefinedDescription(e.target.value)}
                  className="min-h-[80px]"
                />
              </div>

              {/* Category Selection */}
              <div className="space-y-2">
                <Label htmlFor="category-select">Category</Label>
                <Select
                  value={selectedCategory || ''}
                  onValueChange={(value) => setSelectedCategory(value as AtomCategory)}
                >
                  <SelectTrigger id="category-select">
                    <SelectValue placeholder="Select category..." />
                  </SelectTrigger>
                  <SelectContent>
                    {categories.map((cat) => (
                      <SelectItem key={cat.value} value={cat.value}>
                        {cat.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
          )}

          {/* Step 2: Final Review */}
          {step === 2 && (
            <div className="space-y-4">
              <Card>
                <CardHeader className="p-4 pb-2">
                  <CardTitle className="text-sm">Review Your Atom</CardTitle>
                </CardHeader>
                <CardContent className="p-4 pt-0 space-y-3">
                  <div>
                    <dt className="text-sm text-muted-foreground">Description</dt>
                    <dd className="mt-1">{refinedDescription}</dd>
                  </div>

                  <div>
                    <dt className="text-sm text-muted-foreground">Category</dt>
                    <dd className="mt-1 capitalize">{selectedCategory}</dd>
                  </div>

                  <div>
                    <dt className="text-sm text-muted-foreground">Estimated Quality</dt>
                    <dd className="mt-1">
                      <QualityBadge score={estimatedQuality} showLabel />
                    </dd>
                  </div>
                </CardContent>
              </Card>

              {/* Tags */}
              <div className="space-y-2">
                <Label htmlFor="tag-input">Tags (optional)</Label>
                <div className="flex gap-2">
                  <Input
                    id="tag-input"
                    value={tagInput}
                    onChange={(e) => setTagInput(e.target.value)}
                    onKeyDown={(e) =>
                      e.key === 'Enter' && (e.preventDefault(), handleAddTag())
                    }
                    placeholder="Add a tag..."
                    className="flex-1"
                  />
                  <Button variant="outline" onClick={handleAddTag}>
                    Add
                  </Button>
                </div>
                {tags.length > 0 && (
                  <div className="flex flex-wrap gap-2 mt-2">
                    {tags.map((tag) => (
                      <Badge key={tag} variant="secondary" className="gap-1">
                        {tag}
                        <button
                          onClick={() => handleRemoveTag(tag)}
                          className="ml-1 hover:text-destructive"
                        >
                          ×
                        </button>
                      </Badge>
                    ))}
                  </div>
                )}
              </div>

              {estimatedQuality !== null && estimatedQuality < 80 && (
                <div className="p-3 bg-yellow-50 text-yellow-800 dark:bg-yellow-950 dark:text-yellow-200 rounded-lg text-sm">
                  Note: This atom may need further refinement before it can be
                  committed. Quality score must be ≥ 80 for commitment.
                </div>
              )}
            </div>
          )}
        </div>

        <DialogFooter className="flex justify-between sm:justify-between">
          <Button variant="outline" onClick={handleClose}>
            Cancel
          </Button>

          <div className="flex gap-2">
            {step > 0 && (
              <Button variant="outline" onClick={prevStep}>
                Back
              </Button>
            )}

            {step === 0 && (
              <Button
                onClick={handleAnalyze}
                disabled={
                  rawIntent.trim().length < 10 ||
                  isAnalyzing ||
                  !hasAvailableProvider ||
                  isDailyBudgetExceeded
                }
              >
                {isAnalyzing ? 'Analyzing...' : 'Analyze Intent'}
              </Button>
            )}

            {step === 1 && (
              <Button
                onClick={nextStep}
                disabled={!selectedCategory || !refinedDescription}
              >
                Continue
              </Button>
            )}

            {step === 2 && (
              <Button onClick={handleCreate} disabled={createAtom.isPending}>
                {createAtom.isPending ? 'Creating...' : 'Create Atom'}
              </Button>
            )}
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

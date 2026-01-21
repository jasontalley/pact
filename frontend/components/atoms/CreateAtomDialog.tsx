'use client';

import { useState, useEffect } from 'react';
import { useRefinementWizardStore } from '@/stores/refinement-wizard';
import { useAnalyzeIntent } from '@/hooks/atoms/use-analyze-intent';
import { useCreateAtom } from '@/hooks/atoms/use-atoms';
import { QualityBadge } from '@/components/quality/QualityBadge';
import type { AtomCategory } from '@/types/atom';

const categories: { value: AtomCategory; label: string }[] = [
  { value: 'functional', label: 'Functional' },
  { value: 'performance', label: 'Performance' },
  { value: 'security', label: 'Security' },
  { value: 'reliability', label: 'Reliability' },
  { value: 'usability', label: 'Usability' },
  { value: 'maintainability', label: 'Maintainability' },
];

/**
 * Multi-step dialog for creating atoms with AI assistance
 */
export function CreateAtomDialog() {
  const {
    isOpen,
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
    closeWizard,
    reset,
  } = useRefinementWizardStore();

  const analyzeIntent = useAnalyzeIntent();
  const createAtom = useCreateAtom();
  const [tags, setTags] = useState<string[]>([]);
  const [tagInput, setTagInput] = useState('');

  // Reset tags when wizard closes
  useEffect(() => {
    if (!isOpen) {
      setTags([]);
      setTagInput('');
    }
  }, [isOpen]);

  if (!isOpen) return null;

  const handleAnalyze = () => {
    if (rawIntent.trim().length < 10) return;
    // Backend expects 'intent' field, not 'rawIntent'
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
          closeWizard();
          reset();
        },
      }
    );
  };

  const handleClose = () => {
    closeWizard();
    reset();
  };

  // Estimate quality based on atomicity result
  const estimatedQuality = analysisResult
    ? analysisResult.atomicity.isAtomic
      ? Math.round(80 + analysisResult.atomicity.confidence * 20)
      : Math.round(40 + analysisResult.atomicity.confidence * 30)
    : null;

  return (
    <div
      className="fixed inset-0 bg-black/50 flex items-center justify-center z-50"
      role="presentation"
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="create-atom-dialog-title"
        className="bg-card rounded-lg border shadow-lg max-w-2xl w-full max-h-[90vh] overflow-y-auto"
      >
        {/* Header */}
        <div className="p-6 border-b">
          <h2 id="create-atom-dialog-title" className="text-xl font-semibold">Create Intent Atom</h2>
          <p className="text-sm text-muted-foreground mt-1">
            Step {step + 1} of 3
          </p>
        </div>

        {/* Content */}
        <div className="p-6">
          {/* Step 0: Raw Intent Input */}
          {step === 0 && (
            <div className="space-y-4">
              <div>
                <label className="text-sm font-medium block mb-2">
                  Describe your intent in natural language
                </label>
                <textarea
                  value={rawIntent}
                  onChange={(e) => setRawIntent(e.target.value)}
                  placeholder="Example: Users should be able to log in with their email and password..."
                  className="w-full h-32 px-3 py-2 border rounded-md resize-none"
                  autoFocus
                />
                <p className="text-xs text-muted-foreground mt-1">
                  Be specific about the behavior, not the implementation
                </p>
              </div>

              {error && (
                <div className="p-3 bg-destructive/10 text-destructive rounded-md text-sm">
                  {error}
                </div>
              )}
            </div>
          )}

          {/* Step 1: Analysis Results & Refinement */}
          {step === 1 && analysisResult && (
            <div className="space-y-6">
              {/* Atomicity Assessment */}
              <div className="p-4 rounded-lg border">
                <div className="flex items-center justify-between mb-2">
                  <span className="font-medium">Atomicity Assessment</span>
                  <span
                    className={`px-2 py-1 rounded text-sm ${
                      analysisResult.atomicity.isAtomic
                        ? 'bg-green-100 text-green-800'
                        : 'bg-yellow-100 text-yellow-800'
                    }`}
                  >
                    {analysisResult.atomicity.isAtomic ? 'Atomic' : 'Needs Refinement'}
                  </span>
                </div>
                <div className="text-sm text-muted-foreground">
                  Confidence: {Math.round(analysisResult.atomicity.confidence * 100)}%
                </div>
              </div>

              {/* Violations */}
              {analysisResult.atomicity.violations && analysisResult.atomicity.violations.length > 0 && (
                <div>
                  <h4 className="font-medium mb-2">Issues Found</h4>
                  <ul className="space-y-1">
                    {analysisResult.atomicity.violations.map((v, i) => (
                      <li key={i} className="text-sm text-destructive flex items-start gap-2">
                        <span>•</span>
                        <span>{v}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              )}

              {/* Suggestions */}
              {pendingSuggestions.length > 0 && (
                <div>
                  <h4 className="font-medium mb-2">Suggestions</h4>
                  <div className="space-y-2">
                    {pendingSuggestions.map((suggestion, i) => (
                      <div key={i} className="flex items-start justify-between p-3 bg-muted rounded-lg">
                        <span className="text-sm flex-1">{suggestion}</span>
                        <div className="flex gap-2 ml-4">
                          <button
                            onClick={() => acceptSuggestion(i)}
                            className="text-xs px-2 py-1 bg-green-100 text-green-800 rounded hover:bg-green-200"
                          >
                            Apply
                          </button>
                          <button
                            onClick={() => rejectSuggestion(i)}
                            className="text-xs px-2 py-1 bg-gray-100 text-gray-800 rounded hover:bg-gray-200"
                          >
                            Dismiss
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Refined Description */}
              <div>
                <label className="text-sm font-medium block mb-2">
                  Refined Description
                </label>
                <textarea
                  value={refinedDescription}
                  onChange={(e) => setRefinedDescription(e.target.value)}
                  className="w-full h-24 px-3 py-2 border rounded-md resize-none"
                />
              </div>

              {/* Category Selection */}
              <div>
                <label className="text-sm font-medium block mb-2">
                  Category
                </label>
                <select
                  value={selectedCategory || ''}
                  onChange={(e) => setSelectedCategory(e.target.value as AtomCategory)}
                  className="w-full px-3 py-2 border rounded-md"
                >
                  <option value="">Select category...</option>
                  {categories.map((cat) => (
                    <option key={cat.value} value={cat.value}>
                      {cat.label}
                    </option>
                  ))}
                </select>
              </div>
            </div>
          )}

          {/* Step 2: Final Review */}
          {step === 2 && (
            <div className="space-y-6">
              <div className="p-4 rounded-lg border">
                <h4 className="font-medium mb-4">Review Your Atom</h4>

                <dl className="space-y-3">
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
                </dl>
              </div>

              {/* Tags */}
              <div>
                <label className="text-sm font-medium block mb-2">
                  Tags (optional)
                </label>
                <div className="flex gap-2 mb-2">
                  <input
                    type="text"
                    value={tagInput}
                    onChange={(e) => setTagInput(e.target.value)}
                    onKeyDown={(e) => e.key === 'Enter' && (e.preventDefault(), handleAddTag())}
                    placeholder="Add a tag..."
                    className="flex-1 px-3 py-2 border rounded-md"
                  />
                  <button
                    onClick={handleAddTag}
                    className="px-4 py-2 border rounded-md hover:bg-accent"
                  >
                    Add
                  </button>
                </div>
                {tags.length > 0 && (
                  <div className="flex flex-wrap gap-2">
                    {tags.map((tag) => (
                      <span
                        key={tag}
                        className="inline-flex items-center gap-1 bg-muted px-2 py-1 rounded-full text-sm"
                      >
                        {tag}
                        <button
                          onClick={() => handleRemoveTag(tag)}
                          className="text-muted-foreground hover:text-foreground"
                        >
                          ×
                        </button>
                      </span>
                    ))}
                  </div>
                )}
              </div>

              {estimatedQuality !== null && estimatedQuality < 80 && (
                <div className="p-3 bg-yellow-50 text-yellow-800 rounded-md text-sm">
                  Note: This atom may need further refinement before it can be committed.
                  Quality score must be ≥ 80 for commitment.
                </div>
              )}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="p-6 border-t flex justify-between">
          <button
            onClick={handleClose}
            className="px-4 py-2 border rounded-lg hover:bg-accent"
          >
            Cancel
          </button>

          <div className="flex gap-2">
            {step > 0 && (
              <button
                onClick={prevStep}
                className="px-4 py-2 border rounded-lg hover:bg-accent"
              >
                Back
              </button>
            )}

            {step === 0 && (
              <button
                onClick={handleAnalyze}
                disabled={rawIntent.trim().length < 10 || isAnalyzing}
                className="px-4 py-2 bg-primary text-primary-foreground rounded-lg hover:bg-primary/90 disabled:opacity-50"
              >
                {isAnalyzing ? 'Analyzing...' : 'Analyze Intent'}
              </button>
            )}

            {step === 1 && (
              <button
                onClick={nextStep}
                disabled={!selectedCategory || !refinedDescription}
                className="px-4 py-2 bg-primary text-primary-foreground rounded-lg hover:bg-primary/90 disabled:opacity-50"
              >
                Continue
              </button>
            )}

            {step === 2 && (
              <button
                onClick={handleCreate}
                disabled={createAtom.isPending}
                className="px-4 py-2 bg-primary text-primary-foreground rounded-lg hover:bg-primary/90 disabled:opacity-50"
              >
                {createAtom.isPending ? 'Creating...' : 'Create Atom'}
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

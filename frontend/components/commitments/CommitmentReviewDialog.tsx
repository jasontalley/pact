'use client';

import { useState, useEffect } from 'react';
import {
  usePreviewCommitment,
  useCreateCommitment,
} from '@/hooks/commitments/use-commitments';
import { QualityBadge } from '@/components/quality/QualityBadge';
import { StatusBadge } from '@/components/shared/StatusBadge';
import type { AtomSummary, InvariantCheckResult } from '@/types/commitment';

interface CommitmentReviewDialogProps {
  isOpen: boolean;
  atomIds: string[];
  committedBy: string;
  onClose: () => void;
  onSuccess?: () => void;
}

/**
 * Commitment Review Dialog - The "Commitment Ceremony"
 *
 * Per UX spec: "Atom creation should feel closer to signing a contract than writing a note."
 * This dialog enforces explicit acknowledgment before making atoms immutable.
 */
export function CommitmentReviewDialog({
  isOpen,
  atomIds,
  committedBy,
  onClose,
  onSuccess,
}: CommitmentReviewDialogProps) {
  const [step, setStep] = useState<'preview' | 'review' | 'confirm'>(
    'preview'
  );
  const [acknowledged, setAcknowledged] = useState(false);
  const [overrideJustification, setOverrideJustification] = useState('');

  const previewMutation = usePreviewCommitment();
  const createMutation = useCreateCommitment();

  // Fetch preview when dialog opens
  useEffect(() => {
    if (isOpen && atomIds.length > 0) {
      previewMutation.mutate({ atomIds, committedBy });
      setStep('preview');
      setAcknowledged(false);
      setOverrideJustification('');
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpen, atomIds.join(','), committedBy]);

  if (!isOpen) return null;

  const preview = previewMutation.data;
  const isLoading = previewMutation.isPending;
  const hasError = previewMutation.isError;

  const handleCommit = () => {
    createMutation.mutate(
      {
        atomIds,
        committedBy,
        overrideJustification: overrideJustification || undefined,
      },
      {
        onSuccess: () => {
          onSuccess?.();
          onClose();
        },
      }
    );
  };

  const canProceedToReview = preview && !preview.hasBlockingIssues;
  const canCommit =
    preview &&
    acknowledged &&
    (!preview.hasWarnings || overrideJustification.trim());

  return (
    <div
      className="fixed inset-0 bg-black/50 flex items-center justify-center z-50"
      role="presentation"
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="commitment-review-dialog-title"
        className="bg-card rounded-lg border shadow-lg max-w-3xl w-full max-h-[90vh] overflow-hidden flex flex-col"
      >
        {/* Header */}
        <div className="p-6 border-b flex-shrink-0">
          <h2
            id="commitment-review-dialog-title"
            className="text-xl font-semibold"
          >
            Commitment Review
          </h2>
          <p className="text-sm text-muted-foreground mt-1">
            {step === 'preview' && 'Checking invariants...'}
            {step === 'review' && 'Review atoms and issues'}
            {step === 'confirm' && 'Confirm commitment'}
          </p>
        </div>

        {/* Content */}
        <div className="p-6 overflow-y-auto flex-1">
          {/* Loading State */}
          {isLoading && (
            <div className="flex items-center justify-center py-12">
              <div className="text-muted-foreground">
                Running invariant checks...
              </div>
            </div>
          )}

          {/* Error State */}
          {hasError && (
            <div className="p-4 bg-destructive/10 text-destructive rounded-lg">
              Failed to preview commitment. Please try again.
            </div>
          )}

          {/* Preview/Review Step */}
          {preview && (step === 'preview' || step === 'review') && (
            <div className="space-y-6">
              {/* Summary */}
              <div className="flex items-center justify-between p-4 rounded-lg border">
                <div>
                  <span className="font-medium">
                    {preview.atomCount} atom{preview.atomCount !== 1 ? 's' : ''}{' '}
                    to commit
                  </span>
                </div>
                <div className="flex items-center gap-2">
                  {preview.canCommit ? (
                    <span className="px-2 py-1 bg-green-100 text-green-800 rounded text-sm">
                      Ready to Commit
                    </span>
                  ) : (
                    <span className="px-2 py-1 bg-red-100 text-red-800 rounded text-sm">
                      Cannot Commit
                    </span>
                  )}
                </div>
              </div>

              {/* Blocking Issues */}
              {preview.hasBlockingIssues && preview.blockingIssues && (
                <div className="space-y-2">
                  <h4 className="font-medium text-destructive">
                    Blocking Issues
                  </h4>
                  <div className="p-4 bg-destructive/10 rounded-lg">
                    <ul className="space-y-2">
                      {preview.blockingIssues.map((issue, i) => (
                        <li
                          key={i}
                          className="text-sm text-destructive flex items-start gap-2"
                        >
                          <span className="mt-0.5">
                            <svg
                              className="w-4 h-4"
                              fill="none"
                              viewBox="0 0 24 24"
                              stroke="currentColor"
                            >
                              <path
                                strokeLinecap="round"
                                strokeLinejoin="round"
                                strokeWidth={2}
                                d="M6 18L18 6M6 6l12 12"
                              />
                            </svg>
                          </span>
                          <span>{issue}</span>
                        </li>
                      ))}
                    </ul>
                  </div>
                </div>
              )}

              {/* Warnings */}
              {preview.hasWarnings && preview.warnings && (
                <div className="space-y-2">
                  <h4 className="font-medium text-yellow-700">Warnings</h4>
                  <div className="p-4 bg-yellow-50 rounded-lg">
                    <ul className="space-y-2">
                      {preview.warnings.map((warning, i) => (
                        <li
                          key={i}
                          className="text-sm text-yellow-800 flex items-start gap-2"
                        >
                          <span className="mt-0.5">
                            <svg
                              className="w-4 h-4"
                              fill="none"
                              viewBox="0 0 24 24"
                              stroke="currentColor"
                            >
                              <path
                                strokeLinecap="round"
                                strokeLinejoin="round"
                                strokeWidth={2}
                                d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"
                              />
                            </svg>
                          </span>
                          <span>{warning}</span>
                        </li>
                      ))}
                    </ul>
                  </div>
                </div>
              )}

              {/* Invariant Check Results */}
              <div className="space-y-2">
                <h4 className="font-medium">Invariant Checks</h4>
                <div className="rounded-lg border overflow-hidden">
                  <table className="w-full text-sm">
                    <thead className="bg-muted">
                      <tr>
                        <th className="text-left p-3">Invariant</th>
                        <th className="text-left p-3">Status</th>
                        <th className="text-left p-3">Message</th>
                      </tr>
                    </thead>
                    <tbody>
                      {preview.invariantChecks.map((check, i) => (
                        <tr key={i} className="border-t">
                          <td className="p-3">{check.invariantName}</td>
                          <td className="p-3">
                            {check.passed ? (
                              <span className="text-green-600">Passed</span>
                            ) : check.severity === 'error' ? (
                              <span className="text-destructive">Failed</span>
                            ) : (
                              <span className="text-yellow-600">Warning</span>
                            )}
                          </td>
                          <td className="p-3 text-muted-foreground">
                            {check.message}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>

              {/* Atoms List */}
              <div className="space-y-2">
                <h4 className="font-medium">Atoms to Commit</h4>
                <div className="space-y-2">
                  {preview.atoms.map((atom) => (
                    <AtomSummaryCard key={atom.id} atom={atom} />
                  ))}
                </div>
              </div>
            </div>
          )}

          {/* Confirm Step */}
          {preview && step === 'confirm' && (
            <div className="space-y-6">
              {/* Warning Box */}
              <div className="p-4 bg-yellow-50 border border-yellow-200 rounded-lg">
                <h4 className="font-medium text-yellow-900 mb-2">
                  This action is permanent
                </h4>
                <p className="text-sm text-yellow-800">
                  Once committed, these {preview.atomCount} atom
                  {preview.atomCount !== 1 ? 's' : ''} cannot be edited or
                  deleted. They can only be superseded by creating new versions.
                </p>
              </div>

              {/* Override Justification (if warnings) */}
              {preview.hasWarnings && (
                <div className="space-y-2">
                  <label className="text-sm font-medium block">
                    Override Justification (Required)
                  </label>
                  <textarea
                    value={overrideJustification}
                    onChange={(e) => setOverrideJustification(e.target.value)}
                    placeholder="Explain why you are proceeding despite the warnings..."
                    className="w-full h-24 px-3 py-2 border rounded-md resize-none"
                  />
                  <p className="text-xs text-muted-foreground">
                    This justification will be recorded with the commitment.
                  </p>
                </div>
              )}

              {/* Explicit Acknowledgment */}
              <div className="flex items-start gap-3 p-4 border rounded-lg">
                <input
                  type="checkbox"
                  id="commitment-acknowledge"
                  checked={acknowledged}
                  onChange={(e) => setAcknowledged(e.target.checked)}
                  className="mt-1"
                />
                <label
                  htmlFor="commitment-acknowledge"
                  className="text-sm cursor-pointer"
                >
                  I understand that this commitment is <strong>immutable</strong>
                  . The {preview.atomCount} atom
                  {preview.atomCount !== 1 ? 's' : ''} will become permanent
                  records and cannot be modified or deleted.
                </label>
              </div>

              {/* Committer Info */}
              <div className="p-4 bg-muted rounded-lg">
                <div className="text-sm">
                  <span className="text-muted-foreground">Committed by: </span>
                  <span className="font-medium">{committedBy}</span>
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="p-6 border-t flex justify-between flex-shrink-0">
          <button
            onClick={onClose}
            className="px-4 py-2 border rounded-lg hover:bg-accent"
          >
            Cancel
          </button>

          <div className="flex gap-2">
            {step === 'confirm' && (
              <button
                onClick={() => setStep('review')}
                className="px-4 py-2 border rounded-lg hover:bg-accent"
              >
                Back
              </button>
            )}

            {(step === 'preview' || step === 'review') && (
              <button
                onClick={() => setStep('confirm')}
                disabled={!canProceedToReview || isLoading}
                className="px-4 py-2 bg-primary text-primary-foreground rounded-lg hover:bg-primary/90 disabled:opacity-50"
              >
                Continue to Confirm
              </button>
            )}

            {step === 'confirm' && (
              <button
                onClick={handleCommit}
                disabled={!canCommit || createMutation.isPending}
                className="px-4 py-2 bg-destructive text-destructive-foreground rounded-lg hover:bg-destructive/90 disabled:opacity-50"
              >
                {createMutation.isPending ? 'Committing...' : 'Commit Atoms'}
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

/**
 * Compact atom summary card for the commitment review
 */
function AtomSummaryCard({ atom }: { atom: AtomSummary }) {
  return (
    <div className="p-3 border rounded-lg flex items-center justify-between">
      <div className="flex-1">
        <div className="flex items-center gap-2">
          <span className="font-mono text-sm text-muted-foreground">
            {atom.atomId}
          </span>
          <span className="text-xs px-2 py-0.5 bg-muted rounded capitalize">
            {atom.category}
          </span>
        </div>
        <p className="text-sm mt-1 line-clamp-1">{atom.description}</p>
      </div>
      <div className="ml-4">
        <QualityBadge score={atom.qualityScore} />
      </div>
    </div>
  );
}

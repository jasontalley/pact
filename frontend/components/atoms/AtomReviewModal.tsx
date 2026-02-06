'use client';

import { useState } from 'react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { StatusBadge } from '@/components/shared/StatusBadge';
import { useApproveAtom, useRejectAtom } from '@/hooks/atoms/use-atoms';
import type { Atom } from '@/types/atom';

interface AtomReviewModalProps {
  atom: Atom;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onReviewComplete?: () => void;
}

/**
 * Modal for reviewing and approving/rejecting proposed atoms (Phase 18)
 */
export function AtomReviewModal({ atom, open, onOpenChange, onReviewComplete }: AtomReviewModalProps) {
  const [mode, setMode] = useState<'review' | 'approve' | 'reject'>('review');
  const [editedDescription, setEditedDescription] = useState(atom.description);
  const [editedCategory, setEditedCategory] = useState(atom.category);
  const [rejectionReason, setRejectionReason] = useState('');

  const approveMutation = useApproveAtom();
  const rejectMutation = useRejectAtom();

  const isLoading = approveMutation.isPending || rejectMutation.isPending;
  const confidencePercent = Math.round((atom.confidence || 0) * 100);

  const handleApprove = async () => {
    const hasEdits = editedDescription !== atom.description || editedCategory !== atom.category;

    await approveMutation.mutateAsync({
      id: atom.id,
      data: {
        approvedBy: 'current-user', // TODO: Get from auth context
        ...(hasEdits ? { description: editedDescription, category: editedCategory } : {}),
      },
    });

    onReviewComplete?.();
  };

  const handleReject = async () => {
    await rejectMutation.mutateAsync({
      id: atom.id,
      data: {
        rejectedBy: 'current-user', // TODO: Get from auth context
        reason: rejectionReason || undefined,
      },
    });

    onReviewComplete?.();
  };

  const resetAndClose = () => {
    setMode('review');
    setEditedDescription(atom.description);
    setEditedCategory(atom.category);
    setRejectionReason('');
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={resetAndClose}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <span className="font-mono text-sm text-muted-foreground">{atom.atomId}</span>
            <StatusBadge status={atom.status} />
            <Badge variant="outline" className="ml-auto">
              {confidencePercent}% confidence
            </Badge>
          </DialogTitle>
          <DialogDescription>
            Review the proposed atom and decide whether to approve or reject it.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-4">
          {/* Review Mode: Show details */}
          {mode === 'review' && (
            <>
              <div>
                <Label>Description</Label>
                <p className="text-sm mt-1">{atom.description}</p>
              </div>

              <div>
                <Label>Category</Label>
                <Badge variant="outline" className="mt-1 capitalize">{atom.category}</Badge>
              </div>

              {atom.rationale && (
                <div>
                  <Label>Rationale</Label>
                  <p className="text-sm mt-1 text-muted-foreground">{atom.rationale}</p>
                </div>
              )}

              {atom.observableOutcomes && atom.observableOutcomes.length > 0 && (
                <div>
                  <Label>Observable Outcomes</Label>
                  <ul className="list-disc list-inside text-sm mt-1 space-y-1">
                    {atom.observableOutcomes.map((outcome, idx) => (
                      <li key={idx}>{outcome.description}</li>
                    ))}
                  </ul>
                </div>
              )}

              <div className="text-xs text-muted-foreground bg-muted/50 p-3 rounded">
                <div className="font-medium mb-1">Metadata</div>
                <div>Proposed by: {atom.proposedBy || 'Unknown'}</div>
                {atom.source && <div>Source: {atom.source.replace(/_/g, ' ')}</div>}
                {!!atom.metadata?.sourceOrphanTest && (
                  <div className="mt-2 space-y-1">
                    <div className="font-medium">Inferred from test:</div>
                    <div className="truncate">
                      Test: {(atom.metadata.sourceOrphanTest as { testName?: string }).testName}
                    </div>
                    <div className="truncate">
                      File: {(atom.metadata.sourceOrphanTest as { filePath?: string }).filePath}
                    </div>
                  </div>
                )}
              </div>
            </>
          )}

          {/* Approve Mode: Allow editing */}
          {mode === 'approve' && (
            <>
              <div>
                <Label htmlFor="edit-description">Description (edit if needed)</Label>
                <Textarea
                  id="edit-description"
                  value={editedDescription}
                  onChange={(e) => setEditedDescription(e.target.value)}
                  className="mt-1"
                  rows={3}
                />
              </div>

              <div>
                <Label htmlFor="edit-category">Category</Label>
                <select
                  id="edit-category"
                  value={editedCategory}
                  onChange={(e) => setEditedCategory(e.target.value as typeof editedCategory)}
                  className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50 mt-1"
                >
                  <option value="functional">Functional</option>
                  <option value="security">Security</option>
                  <option value="performance">Performance</option>
                  <option value="ux">UX</option>
                  <option value="operational">Operational</option>
                </select>
              </div>

              <div className="bg-blue-50 dark:bg-blue-950 p-3 rounded text-sm">
                <strong>Note:</strong> Approving this atom will make it a committed atom. Any edits you make
                will be applied before committing.
              </div>
            </>
          )}

          {/* Reject Mode: Ask for reason */}
          {mode === 'reject' && (
            <>
              <div>
                <Label htmlFor="rejection-reason">Reason for rejection (optional)</Label>
                <Textarea
                  id="rejection-reason"
                  value={rejectionReason}
                  onChange={(e) => setRejectionReason(e.target.value)}
                  placeholder="E.g., Duplicate of IA-042, Too broad, etc."
                  className="mt-1"
                  rows={3}
                />
              </div>

              <div className="bg-amber-50 dark:bg-amber-950 p-3 rounded text-sm">
                <strong>Note:</strong> Rejecting this atom will mark it as abandoned. This action can be
                reversed later if needed.
              </div>
            </>
          )}
        </div>

        <DialogFooter>
          {mode === 'review' && (
            <>
              <Button variant="destructive" onClick={() => setMode('reject')} disabled={isLoading}>
                Reject
              </Button>
              <Button variant="outline" onClick={resetAndClose} disabled={isLoading}>
                Cancel
              </Button>
              <Button onClick={() => setMode('approve')} disabled={isLoading}>
                Approve
              </Button>
            </>
          )}

          {mode === 'approve' && (
            <>
              <Button variant="outline" onClick={() => setMode('review')} disabled={isLoading}>
                Back
              </Button>
              <Button onClick={handleApprove} disabled={isLoading}>
                {isLoading ? 'Approving...' : 'Confirm Approval'}
              </Button>
            </>
          )}

          {mode === 'reject' && (
            <>
              <Button variant="outline" onClick={() => setMode('review')} disabled={isLoading}>
                Back
              </Button>
              <Button variant="destructive" onClick={handleReject} disabled={isLoading}>
                {isLoading ? 'Rejecting...' : 'Confirm Rejection'}
              </Button>
            </>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

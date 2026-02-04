'use client';

import { useState } from 'react';
import { useResolveConflict, useEscalateConflict } from '@/hooks/conflicts/use-conflicts';
import { cn } from '@/lib/utils';
import { X } from 'lucide-react';
import type { ConflictRecord } from '@/lib/api/conflicts';

const resolutionActions = [
  { value: 'supersede_a', label: 'Supersede Atom A' },
  { value: 'supersede_b', label: 'Supersede Atom B' },
  { value: 'split_test', label: 'Split Test' },
  { value: 'reject_a', label: 'Reject Atom A' },
  { value: 'reject_b', label: 'Reject Atom B' },
  { value: 'clarify', label: 'Clarify' },
];

interface ConflictDetailPanelProps {
  conflict: ConflictRecord;
  onClose: () => void;
}

export function ConflictDetailPanel({ conflict, onClose }: ConflictDetailPanelProps) {
  const [action, setAction] = useState('');
  const [reason, setReason] = useState('');
  const [resolvedBy, setResolvedBy] = useState('');

  const resolveConflict = useResolveConflict();
  const escalateConflict = useEscalateConflict();

  const isResolved = conflict.status === 'resolved';
  const isEscalated = conflict.status === 'escalated';
  const canResolve = conflict.status !== 'resolved';

  const handleResolve = () => {
    if (!action || !resolvedBy) return;
    resolveConflict.mutate({
      id: conflict.id,
      data: { action, resolvedBy, reason: reason || undefined },
    });
  };

  const handleEscalate = () => {
    escalateConflict.mutate(conflict.id);
  };

  return (
    <div className="bg-card rounded-lg border shadow-sm">
      {/* Header */}
      <div className="flex items-center justify-between p-4 border-b">
        <h3 className="text-lg font-semibold">Conflict Details</h3>
        <button
          type="button"
          onClick={onClose}
          className="text-muted-foreground hover:text-foreground"
        >
          <X className="h-5 w-5" />
        </button>
      </div>

      <div className="p-4 space-y-4 overflow-y-auto max-h-[calc(100vh-200px)]">
        {/* Conflict info */}
        <div>
          <p className="text-sm font-medium text-muted-foreground">Type</p>
          <p className="text-sm capitalize">{conflict.conflictType.replace('_', ' ')}</p>
        </div>

        <div>
          <p className="text-sm font-medium text-muted-foreground">Status</p>
          <p className={cn(
            'text-sm font-medium capitalize',
            conflict.status === 'open' && 'text-yellow-700',
            conflict.status === 'resolved' && 'text-green-700',
            conflict.status === 'escalated' && 'text-red-700',
          )}>
            {conflict.status}
          </p>
        </div>

        <div>
          <p className="text-sm font-medium text-muted-foreground">Description</p>
          <p className="text-sm">{conflict.description}</p>
        </div>

        {/* Atoms involved */}
        <div className="grid grid-cols-2 gap-3">
          <div className="p-3 rounded-lg bg-muted/50">
            <p className="text-xs font-medium text-muted-foreground mb-1">Atom A</p>
            <p className="text-sm font-mono truncate">{conflict.atomIdA}</p>
          </div>
          <div className="p-3 rounded-lg bg-muted/50">
            <p className="text-xs font-medium text-muted-foreground mb-1">Atom B</p>
            <p className="text-sm font-mono truncate">{conflict.atomIdB}</p>
          </div>
        </div>

        {conflict.similarityScore != null && (
          <div>
            <p className="text-sm font-medium text-muted-foreground">Similarity Score</p>
            <p className="text-sm">{conflict.similarityScore}%</p>
          </div>
        )}

        {conflict.testRecordId && (
          <div>
            <p className="text-sm font-medium text-muted-foreground">Test Record</p>
            <p className="text-sm font-mono truncate">{conflict.testRecordId}</p>
          </div>
        )}

        <div>
          <p className="text-sm font-medium text-muted-foreground">Created</p>
          <p className="text-sm">{new Date(conflict.createdAt).toLocaleString()}</p>
        </div>

        {/* Resolution details (if resolved) */}
        {isResolved && conflict.resolution && (
          <div className="p-3 rounded-lg bg-green-50 border border-green-200">
            <p className="text-sm font-medium text-green-800 mb-2">Resolution</p>
            <p className="text-sm">
              <span className="font-medium">Action:</span> {conflict.resolution.action}
            </p>
            <p className="text-sm">
              <span className="font-medium">By:</span> {conflict.resolution.resolvedBy}
            </p>
            {conflict.resolution.reason && (
              <p className="text-sm">
                <span className="font-medium">Reason:</span> {conflict.resolution.reason}
              </p>
            )}
            {conflict.resolvedAt && (
              <p className="text-sm text-muted-foreground mt-1">
                {new Date(conflict.resolvedAt).toLocaleString()}
              </p>
            )}
          </div>
        )}

        {/* Resolution form (if not resolved) */}
        {canResolve && (
          <div className="space-y-3 pt-2 border-t">
            <p className="text-sm font-semibold">Resolve Conflict</p>

            <div>
              <label className="text-sm text-muted-foreground block mb-1">Action</label>
              <select
                value={action}
                onChange={(e) => setAction(e.target.value)}
                className="w-full text-sm border rounded-md px-3 py-2 bg-background"
              >
                <option value="">Select action...</option>
                {resolutionActions.map((a) => (
                  <option key={a.value} value={a.value}>
                    {a.label}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="text-sm text-muted-foreground block mb-1">Resolved By</label>
              <input
                type="text"
                value={resolvedBy}
                onChange={(e) => setResolvedBy(e.target.value)}
                placeholder="Your name or email"
                className="w-full text-sm border rounded-md px-3 py-2 bg-background"
              />
            </div>

            <div>
              <label className="text-sm text-muted-foreground block mb-1">Reason (optional)</label>
              <textarea
                value={reason}
                onChange={(e) => setReason(e.target.value)}
                placeholder="Why this resolution?"
                rows={2}
                className="w-full text-sm border rounded-md px-3 py-2 bg-background resize-none"
              />
            </div>

            <div className="flex gap-2">
              <button
                type="button"
                onClick={handleResolve}
                disabled={!action || !resolvedBy || resolveConflict.isPending}
                className="flex-1 px-4 py-2 text-sm font-medium bg-primary text-primary-foreground rounded-md hover:bg-primary/90 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
              >
                {resolveConflict.isPending ? 'Resolving...' : 'Resolve'}
              </button>
              {!isEscalated && (
                <button
                  type="button"
                  onClick={handleEscalate}
                  disabled={escalateConflict.isPending}
                  className="px-4 py-2 text-sm font-medium border rounded-md hover:bg-accent transition-colors disabled:opacity-50"
                >
                  Escalate
                </button>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

'use client';

import { useState } from 'react';
import { useChangeSet, useSubmitChangeSet, useApproveChangeSet } from '@/hooks/change-sets/use-change-sets';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import {
  GitPullRequest, Send, CheckCircle2, XCircle, Lock,
  Loader2, AlertTriangle, Atom,
} from 'lucide-react';
import { CommitChangeSetDialog } from './CommitChangeSetDialog';

interface ChangeSetDetailViewProps {
  id: string;
}

export function ChangeSetDetailView({ id }: ChangeSetDetailViewProps) {
  const { data, isLoading, error } = useChangeSet(id);
  const submitMutation = useSubmitChangeSet();
  const approveMutation = useApproveChangeSet();
  const [showCommitDialog, setShowCommitDialog] = useState(false);

  if (isLoading) return <div className="flex items-center justify-center p-8"><Loader2 className="h-6 w-6 animate-spin" /></div>;
  if (error || !data) return <div className="text-destructive p-4">Failed to load change set</div>;

  const { molecule: cs, atoms } = data;
  const meta = cs.changeSetMetadata;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <GitPullRequest className="h-6 w-6" />
            {cs.name}
          </h1>
          {cs.description && <p className="text-muted-foreground mt-1">{cs.description}</p>}
        </div>
        <Badge variant="outline" className="text-sm">{meta.status}</Badge>
      </div>

      {/* Action bar */}
      <div className="flex gap-2">
        {meta.status === 'draft' && (
          <Button onClick={() => submitMutation.mutate(id)} disabled={submitMutation.isPending}>
            {submitMutation.isPending ? <Loader2 className="h-4 w-4 mr-1 animate-spin" /> : <Send className="h-4 w-4 mr-1" />}
            Submit for Review
          </Button>
        )}
        {meta.status === 'review' && (
          <>
            <Button
              onClick={() => approveMutation.mutate({ id, decision: 'approved', comment: 'Approved' })}
              disabled={approveMutation.isPending}
            >
              <CheckCircle2 className="h-4 w-4 mr-1" />
              Approve
            </Button>
            <Button
              variant="destructive"
              onClick={() => approveMutation.mutate({ id, decision: 'rejected', comment: 'Changes requested' })}
              disabled={approveMutation.isPending}
            >
              <XCircle className="h-4 w-4 mr-1" />
              Reject
            </Button>
          </>
        )}
        {meta.status === 'approved' && (
          <Button onClick={() => setShowCommitDialog(true)}>
            <Lock className="h-4 w-4 mr-1" />
            Commit All
          </Button>
        )}
      </div>

      <Separator />

      {/* Atoms list */}
      <div>
        <h2 className="text-lg font-semibold mb-3 flex items-center gap-2">
          <Atom className="h-5 w-5" />
          Atoms ({atoms.length})
        </h2>
        {atoms.length === 0 ? (
          <p className="text-muted-foreground text-sm">No atoms in this change set yet.</p>
        ) : (
          <div className="space-y-2">
            {atoms.map((atom) => (
              <Card key={atom.id}>
                <CardContent className="py-3">
                  <div className="flex items-center justify-between">
                    <div>
                      <span className="font-mono text-sm mr-2">{atom.atomId}</span>
                      <span className="text-sm">{atom.description}</span>
                    </div>
                    <div className="flex items-center gap-2">
                      {atom.qualityScore != null && (
                        <Badge variant={Number(atom.qualityScore) >= 80 ? 'default' : 'destructive'}>
                          {Number(atom.qualityScore).toFixed(0)}
                        </Badge>
                      )}
                      {atom.qualityScore != null && Number(atom.qualityScore) < 80 && (
                        <AlertTriangle className="h-4 w-4 text-yellow-500" />
                      )}
                    </div>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        )}
      </div>

      {/* Approvals */}
      {meta.approvals.length > 0 && (
        <div>
          <h2 className="text-lg font-semibold mb-3">Approvals</h2>
          <div className="space-y-2">
            {meta.approvals.map((approval, i) => (
              <div key={i} className="flex items-center gap-3 text-sm">
                {approval.decision === 'approved' ? (
                  <CheckCircle2 className="h-4 w-4 text-green-500" />
                ) : (
                  <XCircle className="h-4 w-4 text-red-500" />
                )}
                <span className="font-medium">{approval.reviewer}</span>
                <span className="text-muted-foreground">{approval.comment}</span>
                <span className="text-xs text-muted-foreground ml-auto">
                  {new Date(approval.timestamp).toLocaleDateString()}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Commit dialog */}
      {showCommitDialog && (
        <CommitChangeSetDialog
          changeSetId={id}
          atoms={atoms}
          open={showCommitDialog}
          onOpenChange={setShowCommitDialog}
        />
      )}
    </div>
  );
}

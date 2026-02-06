'use client';

import { useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Badge } from '@/components/ui/badge';
import { useCommitChangeSet } from '@/hooks/change-sets/use-change-sets';
import { Lock, Loader2, AlertTriangle } from 'lucide-react';

interface CommitChangeSetDialogProps {
  changeSetId: string;
  atoms: Array<{
    id: string;
    atomId: string;
    description: string;
    qualityScore: number | null;
  }>;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function CommitChangeSetDialog({ changeSetId, atoms, open, onOpenChange }: CommitChangeSetDialogProps) {
  const [acknowledged, setAcknowledged] = useState(false);
  const commitMutation = useCommitChangeSet();
  const lowQualityAtoms = atoms.filter(a => a.qualityScore != null && Number(a.qualityScore) < 80);

  const handleCommit = () => {
    commitMutation.mutate(changeSetId, {
      onSuccess: () => onOpenChange(false),
    });
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Lock className="h-5 w-5" />
            Commit Change Set
          </DialogTitle>
          <DialogDescription>
            This action is <strong>permanent</strong>. Once committed, these atoms
            cannot be edited or deleted — only superseded.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-3 py-4">
          <p className="text-sm font-medium">{atoms.length} atom(s) will be committed:</p>
          <div className="max-h-48 overflow-y-auto space-y-1">
            {atoms.map((atom) => (
              <div key={atom.id} className="flex items-center justify-between text-sm py-1">
                <span>
                  <span className="font-mono mr-2">{atom.atomId}</span>
                  <span className="text-muted-foreground">{atom.description.slice(0, 60)}</span>
                </span>
                {atom.qualityScore != null && (
                  <Badge variant={Number(atom.qualityScore) >= 80 ? 'default' : 'destructive'} className="text-xs">
                    {Number(atom.qualityScore).toFixed(0)}
                  </Badge>
                )}
              </div>
            ))}
          </div>

          {lowQualityAtoms.length > 0 && (
            <div className="flex items-start gap-2 p-3 bg-yellow-50 dark:bg-yellow-950/30 rounded-md">
              <AlertTriangle className="h-4 w-4 text-yellow-500 mt-0.5" />
              <p className="text-sm text-yellow-800 dark:text-yellow-200">
                {lowQualityAtoms.length} atom(s) have quality scores below 80. These may be excluded from commitment.
              </p>
            </div>
          )}
        </div>

        <div className="flex items-center space-x-2">
          <Checkbox
            id="acknowledge"
            checked={acknowledged}
            onCheckedChange={(checked) => setAcknowledged(checked === true)}
          />
          <label htmlFor="acknowledge" className="text-sm">
            I understand these atoms will become immutable
          </label>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button
            onClick={handleCommit}
            disabled={!acknowledged || commitMutation.isPending}
          >
            {commitMutation.isPending ? (
              <Loader2 className="h-4 w-4 mr-1 animate-spin" />
            ) : (
              <Lock className="h-4 w-4 mr-1" />
            )}
            Commit All
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

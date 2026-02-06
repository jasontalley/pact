'use client';

import { useState } from 'react';
import { AppLayout } from '@/components/layout';
import { useChangeSets, useCreateChangeSet } from '@/hooks/change-sets/use-change-sets';
import { ChangeSetCard } from '@/components/change-sets/ChangeSetCard';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Loader2, Plus, GitPullRequest } from 'lucide-react';
import { cn } from '@/lib/utils';

const statusTabs = [
  { value: undefined, label: 'All' },
  { value: 'draft', label: 'Draft' },
  { value: 'review', label: 'In Review' },
  { value: 'approved', label: 'Approved' },
  { value: 'committed', label: 'Committed' },
] as const;

export default function ChangeSetsPage() {
  const [activeStatus, setActiveStatus] = useState<string | undefined>();
  const { data: changeSets, isLoading } = useChangeSets(activeStatus);
  const createMutation = useCreateChangeSet();
  const [showCreate, setShowCreate] = useState(false);
  const [newName, setNewName] = useState('');

  const handleCreate = () => {
    if (newName.trim()) {
      createMutation.mutate({ name: newName.trim() }, {
        onSuccess: () => {
          setShowCreate(false);
          setNewName('');
        },
      });
    }
  };

  return (
    <AppLayout showSidebar={false}>
      <div className="container mx-auto px-4 py-8">
        <div className="flex items-center justify-between mb-6">
          <div>
            <h1 className="text-3xl font-bold tracking-tight flex items-center gap-2">
              <GitPullRequest className="h-8 w-8" />
              Change Sets
            </h1>
            <p className="text-muted-foreground mt-1">
              Group atoms into reviewable, committable batches
            </p>
          </div>
          <Button onClick={() => setShowCreate(true)}>
            <Plus className="h-4 w-4 mr-1" />
            New Change Set
          </Button>
        </div>

        {/* Status tabs */}
        <div className="flex gap-1 mb-6 border-b">
          {statusTabs.map((tab) => (
            <button
              key={tab.label}
              onClick={() => setActiveStatus(tab.value)}
              className={cn(
                'px-4 py-2 text-sm font-medium border-b-2 transition-colors',
                activeStatus === tab.value
                  ? 'border-primary text-foreground'
                  : 'border-transparent text-muted-foreground hover:text-foreground'
              )}
            >
              {tab.label}
            </button>
          ))}
        </div>

        {/* Change set list */}
        {isLoading ? (
          <div className="flex items-center justify-center p-12">
            <Loader2 className="h-6 w-6 animate-spin" />
          </div>
        ) : !changeSets || changeSets.length === 0 ? (
          <div className="text-center py-12 text-muted-foreground">
            <GitPullRequest className="h-12 w-12 mx-auto mb-4 opacity-30" />
            <p className="text-lg font-medium mb-2">No change sets</p>
            <p className="text-sm">Create a change set to group atoms for batch review and commitment.</p>
          </div>
        ) : (
          <div className="grid gap-4">
            {changeSets.map((cs) => (
              <ChangeSetCard key={cs.id} changeSet={cs} />
            ))}
          </div>
        )}

        {/* Create dialog */}
        <Dialog open={showCreate} onOpenChange={setShowCreate}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Create Change Set</DialogTitle>
            </DialogHeader>
            <div className="py-4">
              <Input
                placeholder="Change set name..."
                value={newName}
                onChange={(e) => setNewName(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && handleCreate()}
              />
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setShowCreate(false)}>Cancel</Button>
              <Button onClick={handleCreate} disabled={!newName.trim() || createMutation.isPending}>
                {createMutation.isPending ? <Loader2 className="h-4 w-4 mr-1 animate-spin" /> : <Plus className="h-4 w-4 mr-1" />}
                Create
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>
    </AppLayout>
  );
}

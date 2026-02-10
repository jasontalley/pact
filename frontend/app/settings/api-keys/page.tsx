'use client';

import { useState, useEffect, useCallback } from 'react';
import { AppLayout } from '@/components/layout';
import { apiKeysApi, type ApiKeyInfo, type CreateKeyResult } from '@/lib/api/api-keys';
import { cn } from '@/lib/utils';
import {
  Key,
  Plus,
  Copy,
  Check,
  Trash2,
  AlertTriangle,
  RefreshCw,
} from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';

export default function ApiKeysPage() {
  return (
    <AppLayout showSidebar>
      <div className="container mx-auto px-4 py-8 max-w-5xl">
        <div className="mb-8">
          <div className="flex items-center gap-3 mb-2">
            <Key className="h-8 w-8 text-primary" />
            <h1 className="text-3xl font-bold">API Keys</h1>
          </div>
          <p className="text-muted-foreground">
            Manage API keys for CLI, CI/CD, and external integrations.
          </p>
        </div>

        <div className="space-y-6">
          <ApiKeyWarning />
          <ApiKeyList />
        </div>
      </div>
    </AppLayout>
  );
}

function ApiKeyWarning() {
  return (
    <div className="flex items-start gap-3 p-4 rounded-lg border border-amber-200 bg-amber-50 dark:border-amber-900 dark:bg-amber-950/30">
      <AlertTriangle className="h-5 w-5 text-amber-600 dark:text-amber-500 mt-0.5 shrink-0" />
      <div className="text-sm">
        <p className="font-medium text-amber-800 dark:text-amber-400">Keep your API keys secure</p>
        <p className="text-amber-700 dark:text-amber-500 mt-1">
          API keys grant full access to the Pact API. Do not share them publicly or commit them to version control.
          Use environment variables or secret managers in CI/CD pipelines.
        </p>
      </div>
    </div>
  );
}

function ApiKeyList() {
  const [keys, setKeys] = useState<ApiKeyInfo[]>([]);
  const [loading, setLoading] = useState(true);
  const [showCreate, setShowCreate] = useState(false);
  const [newKey, setNewKey] = useState<CreateKeyResult | null>(null);
  const [revokeTarget, setRevokeTarget] = useState<ApiKeyInfo | null>(null);

  const loadKeys = useCallback(async () => {
    try {
      const data = await apiKeysApi.list();
      setKeys(data);
    } catch {
      toast.error('Failed to load API keys');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadKeys();
  }, [loadKeys]);

  if (loading) return <ApiKeysSkeleton />;

  return (
    <>
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle>API Keys</CardTitle>
              <CardDescription>
                {keys.length === 0
                  ? 'No API keys created yet'
                  : `${keys.filter((k) => k.isActive).length} active key${keys.filter((k) => k.isActive).length !== 1 ? 's' : ''}`}
              </CardDescription>
            </div>
            <Button onClick={() => setShowCreate(true)}>
              <Plus className="h-4 w-4 mr-2" />
              Create Key
            </Button>
          </div>
        </CardHeader>
        <CardContent>
          {keys.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground">
              <Key className="h-12 w-12 mx-auto mb-3 opacity-30" />
              <p>No API keys yet. Create one to get started.</p>
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Name</TableHead>
                  <TableHead>Key Prefix</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Created</TableHead>
                  <TableHead>Last Used</TableHead>
                  <TableHead className="w-[80px]" />
                </TableRow>
              </TableHeader>
              <TableBody>
                {keys.map((key) => (
                  <ApiKeyRow
                    key={key.id}
                    apiKey={key}
                    onRevoke={() => setRevokeTarget(key)}
                  />
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      <CreateKeyDialog
        open={showCreate}
        onClose={() => setShowCreate(false)}
        onCreated={(result) => {
          setNewKey(result);
          setShowCreate(false);
          loadKeys();
        }}
      />

      <ShowKeyDialog
        result={newKey}
        onClose={() => setNewKey(null)}
      />

      <RevokeKeyDialog
        target={revokeTarget}
        onClose={() => setRevokeTarget(null)}
        onRevoked={() => {
          setRevokeTarget(null);
          loadKeys();
        }}
      />
    </>
  );
}

function ApiKeyRow({
  apiKey,
  onRevoke,
}: {
  apiKey: ApiKeyInfo;
  onRevoke: () => void;
}) {
  const isRevoked = !apiKey.isActive;

  return (
    <TableRow className={cn(isRevoked && 'opacity-50')}>
      <TableCell className="font-medium">{apiKey.name}</TableCell>
      <TableCell>
        <code className="text-sm bg-muted px-2 py-1 rounded">{apiKey.keyPrefix}...</code>
      </TableCell>
      <TableCell>
        {isRevoked ? (
          <Badge variant="destructive">Revoked</Badge>
        ) : (
          <Badge variant="outline" className="text-green-600 border-green-300">Active</Badge>
        )}
      </TableCell>
      <TableCell className="text-sm text-muted-foreground">
        {new Date(apiKey.createdAt).toLocaleDateString()}
      </TableCell>
      <TableCell className="text-sm text-muted-foreground">
        {apiKey.lastUsedAt
          ? new Date(apiKey.lastUsedAt).toLocaleDateString()
          : 'Never'}
      </TableCell>
      <TableCell>
        {!isRevoked && (
          <Button
            variant="ghost"
            size="icon"
            onClick={onRevoke}
            className="text-destructive hover:text-destructive"
          >
            <Trash2 className="h-4 w-4" />
          </Button>
        )}
      </TableCell>
    </TableRow>
  );
}

// --- Dialogs ---

function CreateKeyDialog({
  open,
  onClose,
  onCreated,
}: {
  open: boolean;
  onClose: () => void;
  onCreated: (result: CreateKeyResult) => void;
}) {
  const [name, setName] = useState('');
  const [creating, setCreating] = useState(false);

  const handleCreate = async () => {
    if (!name.trim()) return;
    setCreating(true);
    try {
      const result = await apiKeysApi.create(name.trim());
      onCreated(result);
      setName('');
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to create key');
    } finally {
      setCreating(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Create API Key</DialogTitle>
          <DialogDescription>
            Give the key a descriptive name so you can identify it later.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-4 py-4">
          <div className="space-y-2">
            <Label htmlFor="key-name">Key Name</Label>
            <Input
              id="key-name"
              placeholder='e.g., "CI Pipeline", "Local CLI"'
              value={name}
              onChange={(e) => setName(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && handleCreate()}
            />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Cancel</Button>
          <Button onClick={handleCreate} disabled={creating || !name.trim()}>
            {creating ? (
              <><RefreshCw className="h-4 w-4 mr-2 animate-spin" />Creating...</>
            ) : (
              'Create'
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function ShowKeyDialog({
  result,
  onClose,
}: {
  result: CreateKeyResult | null;
  onClose: () => void;
}) {
  const [copied, setCopied] = useState(false);

  const handleCopy = async () => {
    if (!result) return;
    await navigator.clipboard.writeText(result.key);
    setCopied(true);
    toast.success('API key copied to clipboard');
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <Dialog open={!!result} onOpenChange={(v) => !v && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>API Key Created</DialogTitle>
          <DialogDescription>
            Copy this key now. You won&apos;t be able to see it again.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-4 py-4">
          <div className="space-y-2">
            <Label>Key Name</Label>
            <p className="text-sm font-medium">{result?.name}</p>
          </div>
          <div className="space-y-2">
            <Label>API Key</Label>
            <div className="flex gap-2">
              <code className="flex-1 p-3 bg-muted rounded text-sm font-mono break-all select-all">
                {result?.key}
              </code>
              <Button variant="outline" size="icon" onClick={handleCopy} className="shrink-0">
                {copied ? <Check className="h-4 w-4 text-green-600" /> : <Copy className="h-4 w-4" />}
              </Button>
            </div>
          </div>
          <div className="flex items-start gap-2 p-3 rounded bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-900">
            <AlertTriangle className="h-4 w-4 text-amber-600 mt-0.5 shrink-0" />
            <p className="text-xs text-amber-700 dark:text-amber-500">
              This is the only time the full key will be displayed. Store it securely.
            </p>
          </div>
        </div>
        <DialogFooter>
          <Button onClick={onClose}>Done</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function RevokeKeyDialog({
  target,
  onClose,
  onRevoked,
}: {
  target: ApiKeyInfo | null;
  onClose: () => void;
  onRevoked: () => void;
}) {
  const [revoking, setRevoking] = useState(false);

  const handleRevoke = async () => {
    if (!target) return;
    setRevoking(true);
    try {
      await apiKeysApi.revoke(target.id);
      toast.success(`API key "${target.name}" revoked`);
      onRevoked();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to revoke key');
    } finally {
      setRevoking(false);
    }
  };

  return (
    <Dialog open={!!target} onOpenChange={(v) => !v && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Revoke API Key</DialogTitle>
          <DialogDescription>
            Are you sure you want to revoke &quot;{target?.name}&quot;? Any integrations using this key will stop working immediately.
          </DialogDescription>
        </DialogHeader>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Cancel</Button>
          <Button variant="destructive" onClick={handleRevoke} disabled={revoking}>
            {revoking ? (
              <><RefreshCw className="h-4 w-4 mr-2 animate-spin" />Revoking...</>
            ) : (
              'Revoke Key'
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function ApiKeysSkeleton() {
  return (
    <Card>
      <CardHeader>
        <div className="flex items-center gap-3">
          <Skeleton className="w-5 h-5" />
          <div className="space-y-2">
            <Skeleton className="h-5 w-32" />
            <Skeleton className="h-4 w-48" />
          </div>
        </div>
      </CardHeader>
      <CardContent className="space-y-3">
        <Skeleton className="h-10 w-full" />
        <Skeleton className="h-10 w-full" />
        <Skeleton className="h-10 w-full" />
      </CardContent>
    </Card>
  );
}

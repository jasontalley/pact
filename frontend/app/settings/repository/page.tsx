'use client';

import { useState } from 'react';
import { AppLayout } from '@/components/layout';
import {
  useRepositoryConfig,
  useUpdateRepositoryConfig,
  useValidatePath,
} from '@/hooks/repository';
import type { ValidatePathResult } from '@/types/repository';
import { cn } from '@/lib/utils';
import {
  FolderOpen,
  Check,
  X,
  RefreshCw,
  Info,
  GitBranch,
  AlertTriangle,
  Files,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';

export default function RepositorySettingsPage() {
  return (
    <AppLayout showSidebar>
      <div className="container mx-auto px-4 py-8 max-w-5xl">
        <div className="mb-8">
          <div className="flex items-center gap-3 mb-2">
            <FolderOpen className="h-8 w-8 text-primary" />
            <h1 className="text-3xl font-bold">Repository Settings</h1>
          </div>
          <p className="text-muted-foreground">
            Configure the target repository for analysis and reconciliation.
          </p>
        </div>

        {/* Info Box */}
        <div className="bg-blue-50 border border-blue-200 rounded-lg p-4 mb-8 dark:bg-blue-950 dark:border-blue-800">
          <div className="flex items-start gap-3">
            <Info className="h-5 w-5 text-blue-600 dark:text-blue-400 mt-0.5" />
            <div className="text-sm text-blue-800 dark:text-blue-200">
              <p className="font-medium mb-1">Repository Path Configuration</p>
              <p className="mb-2">
                Set the path to the repository Pact should analyze. This path must be accessible
                from inside the Docker container.
              </p>
              <p>
                <strong>Docker users:</strong> Mount your repository as a volume
                (e.g., <code className="bg-blue-100 dark:bg-blue-900 px-1 rounded">-v /host/repo:/data/repo</code>)
                then enter the container-side path here (e.g., <code className="bg-blue-100 dark:bg-blue-900 px-1 rounded">/data/repo</code>).
              </p>
            </div>
          </div>
        </div>

        <div className="space-y-6">
          <RepositoryPathConfig />
          <GitHubIntegration />
        </div>
      </div>
    </AppLayout>
  );
}

function RepositoryPathConfig() {
  const { data: config, isLoading } = useRepositoryConfig();
  const updateConfig = useUpdateRepositoryConfig();
  const validatePath = useValidatePath();

  const [pathValue, setPathValue] = useState('');
  const [validationResult, setValidationResult] = useState<ValidatePathResult | null>(null);
  const [initialized, setInitialized] = useState(false);

  // Initialize path value from config once loaded
  if (config && !initialized) {
    setPathValue(config.repositoryPath || '');
    setInitialized(true);
  }

  if (isLoading) {
    return <RepositoryPathSkeleton />;
  }

  const handleValidate = async () => {
    if (!pathValue.trim()) return;
    const result = await validatePath.mutateAsync(pathValue.trim());
    setValidationResult(result);
  };

  const handleSave = () => {
    if (!pathValue.trim()) return;
    updateConfig.mutate(
      { repositoryPath: pathValue.trim() },
      {
        onSuccess: () => {
          setValidationResult(null);
        },
      },
    );
  };

  const hasUnsavedChanges = pathValue.trim() !== (config?.repositoryPath || '');

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <div>
            <CardTitle className="flex items-center gap-2">
              <FolderOpen className="h-5 w-5" />
              Local Repository Path
            </CardTitle>
            <CardDescription>
              The filesystem path to the repository inside the container
            </CardDescription>
          </div>
          {config?.repositoryPath && (
            <Badge
              variant={config.isValid ? 'default' : 'destructive'}
              className={cn(
                'text-xs',
                config.isValid && 'bg-green-500 hover:bg-green-600',
              )}
            >
              {config.isValid ? 'Valid' : 'Invalid'}
            </Badge>
          )}
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Current Config */}
        {config?.repositoryPath && (
          <div className="p-3 bg-muted rounded-lg text-sm">
            <div className="flex items-center gap-2 mb-1">
              <span className="text-muted-foreground">Current path:</span>
              <code className="font-mono">{config.repositoryPath}</code>
            </div>
            <div className="flex items-center gap-4 text-xs text-muted-foreground">
              <span className="flex items-center gap-1">
                {config.isValid ? (
                  <Check className="h-3 w-3 text-green-500" />
                ) : (
                  <X className="h-3 w-3 text-red-500" />
                )}
                {config.isValid ? 'Accessible' : 'Not accessible'}
              </span>
              {config.isGitRepo && (
                <span className="flex items-center gap-1">
                  <GitBranch className="h-3 w-3 text-green-500" />
                  Git repository
                </span>
              )}
            </div>
          </div>
        )}

        {/* Path Input */}
        <div className="space-y-2">
          <Label htmlFor="repo-path">Repository Path</Label>
          <div className="flex gap-2">
            <Input
              id="repo-path"
              placeholder="/data/repo"
              value={pathValue}
              onChange={(e) => {
                setPathValue(e.target.value);
                setValidationResult(null);
              }}
            />
            <Button
              variant="outline"
              onClick={handleValidate}
              disabled={!pathValue.trim() || validatePath.isPending}
            >
              {validatePath.isPending ? (
                <RefreshCw className="h-4 w-4 animate-spin" />
              ) : (
                'Validate'
              )}
            </Button>
            <Button
              onClick={handleSave}
              disabled={!pathValue.trim() || !hasUnsavedChanges || updateConfig.isPending}
            >
              {updateConfig.isPending ? 'Saving...' : 'Save'}
            </Button>
          </div>
        </div>

        {/* Validation Result */}
        {validationResult && (
          <ValidationResultDisplay result={validationResult} />
        )}
      </CardContent>
    </Card>
  );
}

function ValidationResultDisplay({ result }: { result: ValidatePathResult }) {
  const allGood = result.exists && result.isDirectory && result.isReadable;

  return (
    <div
      className={cn(
        'p-4 rounded-lg text-sm',
        allGood
          ? 'bg-green-50 dark:bg-green-950 text-green-800 dark:text-green-200'
          : 'bg-red-50 dark:bg-red-950 text-red-800 dark:text-red-200',
      )}
    >
      <div className="flex items-start gap-2 mb-2">
        {allGood ? (
          <Check className="h-4 w-4 mt-0.5" />
        ) : (
          <AlertTriangle className="h-4 w-4 mt-0.5" />
        )}
        <span className="font-medium">
          {allGood ? 'Path is valid and accessible' : 'Path validation failed'}
        </span>
      </div>

      <div className="ml-6 space-y-1">
        <CheckItem label="Path exists" ok={result.exists} />
        <CheckItem label="Is a directory" ok={result.isDirectory} />
        <CheckItem label="Is readable" ok={result.isReadable} />
        {result.isGitRepo !== undefined && (
          <CheckItem label="Git repository detected" ok={result.isGitRepo} />
        )}
        {result.fileCount !== undefined && (
          <div className="flex items-center gap-1 text-xs text-muted-foreground mt-1">
            <Files className="h-3 w-3" />
            {result.fileCount} top-level entries
          </div>
        )}
      </div>

      {result.error && (
        <p className="ml-6 mt-2 text-xs opacity-75">{result.error}</p>
      )}
    </div>
  );
}

function CheckItem({ label, ok }: { label: string; ok: boolean }) {
  return (
    <div className="flex items-center gap-1.5 text-xs">
      {ok ? (
        <Check className="h-3 w-3 text-green-500" />
      ) : (
        <X className="h-3 w-3 text-red-500" />
      )}
      {label}
    </div>
  );
}

function GitHubIntegration() {
  return (
    <Card className="opacity-60">
      <CardHeader>
        <div className="flex items-center justify-between">
          <div>
            <CardTitle className="flex items-center gap-2">
              <GitBranch className="h-5 w-5" />
              GitHub Integration
            </CardTitle>
            <CardDescription>
              Connect Pact to a GitHub repository for automated reconciliation
            </CardDescription>
          </div>
          <Badge variant="outline">Coming Soon</Badge>
        </div>
      </CardHeader>
      <CardContent>
        <div className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="github-url">Repository URL</Label>
            <Input
              id="github-url"
              placeholder="https://github.com/org/repo"
              disabled
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="github-branch">Default Branch</Label>
            <Input
              id="github-branch"
              placeholder="main"
              disabled
            />
          </div>
          <p className="text-xs text-muted-foreground">
            GitHub integration will enable automated reconciliation via GitHub Actions
            and the pre-read content API.
          </p>
        </div>
      </CardContent>
    </Card>
  );
}

function RepositoryPathSkeleton() {
  return (
    <Card>
      <CardHeader>
        <div className="flex items-center gap-3">
          <Skeleton className="w-5 h-5" />
          <div className="space-y-2">
            <Skeleton className="h-5 w-48" />
            <Skeleton className="h-4 w-64" />
          </div>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        <Skeleton className="h-10 w-full" />
        <Skeleton className="h-10 w-full" />
      </CardContent>
    </Card>
  );
}

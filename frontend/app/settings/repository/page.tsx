'use client';

import { useState, useEffect } from 'react';
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
  Plus,
  Upload,
  Trash2,
} from 'lucide-react';
import { toast } from 'sonner';
import { repositoryAdminApi } from '@/lib/api/repository';
import {
  useRepositoryUploadStore,
  browseAndReadDirectory,
} from '@/stores/repository-upload';
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
              <p className="font-medium mb-1">Repository Access</p>
              <p className="mb-2">
                The Reconciliation Wizard supports <strong>browser-based file upload</strong> — select your
                project folder directly from your machine. No Docker volume mount required.
              </p>
              <p>
                The server filesystem path below is optional, for cases where the repository
                is already mounted inside the container.
              </p>
            </div>
          </div>
        </div>

        <div className="space-y-6">
          <BrowserUpload />
          <RepositoryPathConfig />
          <GitHubIntegration />
        </div>
      </div>
    </AppLayout>
  );
}

function BrowserUpload() {
  const { directoryName, summary, isReading, fileContents, manifest } =
    useRepositoryUploadStore();
  const clear = useRepositoryUploadStore((s) => s.clear);

  const handleBrowse = async () => {
    try {
      const { directoryName: name, fileCount } = await browseAndReadDirectory();
      toast.success(`Read ${fileCount} files from "${name}"`);
    } catch (err) {
      if (err instanceof DOMException && err.name === 'AbortError') return;
      toast.error(err instanceof Error ? err.message : String(err));
    }
  };

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <div>
            <CardTitle className="flex items-center gap-2">
              <Upload className="h-5 w-5" />
              Browser Upload
              <Badge variant="default" className="text-xs font-normal bg-primary">
                Recommended
              </Badge>
            </CardTitle>
            <CardDescription>
              Select your project folder — files are read in the browser and sent to the backend
            </CardDescription>
          </div>
          {fileContents && (
            <Badge className="bg-green-500 hover:bg-green-600 text-xs">
              Ready
            </Badge>
          )}
          {!fileContents && manifest && (
            <Badge variant="outline" className="text-xs text-yellow-600 border-yellow-400">
              Re-scan needed
            </Badge>
          )}
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Fully loaded state */}
        {fileContents && manifest ? (
          <div className="p-3 bg-muted rounded-lg text-sm space-y-2">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <FolderOpen className="h-4 w-4 text-primary" />
                <code className="font-mono">{directoryName}</code>
              </div>
              <Button variant="ghost" size="sm" onClick={clear}>
                <Trash2 className="h-4 w-4 mr-1" />
                Clear
              </Button>
            </div>
            <div className="flex items-center gap-4 text-xs text-muted-foreground">
              <span className="flex items-center gap-1">
                <Files className="h-3 w-3" />
                {summary}
              </span>
            </div>
          </div>
        ) : manifest ? (
          /* Metadata persisted but fileContents lost (page refresh) — needs re-scan */
          <div className="p-3 bg-muted rounded-lg text-sm space-y-2">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <FolderOpen className="h-4 w-4 text-yellow-500" />
                <code className="font-mono">{directoryName}</code>
              </div>
              <Button variant="ghost" size="sm" onClick={clear}>
                <Trash2 className="h-4 w-4 mr-1" />
                Clear
              </Button>
            </div>
            <div className="flex items-center gap-4 text-xs text-muted-foreground">
              <span className="flex items-center gap-1">
                <Files className="h-3 w-3" />
                {summary}
              </span>
            </div>
            <p className="text-xs text-yellow-600 dark:text-yellow-400">
              File contents were cleared after page refresh. Click &quot;Re-scan Directory&quot; below to reload.
            </p>
          </div>
        ) : (
          <div className="flex flex-col items-center gap-3 py-4 border-2 border-dashed rounded-lg">
            <p className="text-sm text-muted-foreground">
              No repository loaded. Click below to select your project folder.
            </p>
            <Button onClick={handleBrowse} disabled={isReading}>
              <Plus className="h-4 w-4 mr-2" />
              {isReading ? 'Reading files...' : 'Browse Repository'}
            </Button>
            <p className="text-xs text-muted-foreground max-w-md text-center">
              Excludes node_modules, .git, dist, and other build artifacts.
              Works in Chrome, Firefox, Safari, and Edge.
            </p>
          </div>
        )}

        {/* Re-browse / re-scan button when repo was previously selected */}
        {(fileContents || manifest) && (
          <Button variant="outline" onClick={handleBrowse} disabled={isReading}>
            <RefreshCw className={cn('h-4 w-4 mr-2', isReading && 'animate-spin')} />
            {isReading ? 'Reading files...' : 'Re-scan Directory'}
          </Button>
        )}
      </CardContent>
    </Card>
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
              Server Filesystem Path
              <Badge variant="outline" className="text-xs font-normal">Optional</Badge>
            </CardTitle>
            <CardDescription>
              Only needed if the repository is mounted inside the container
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
  const [repoUrl, setRepoUrl] = useState('');
  const [pat, setPat] = useState('');
  const [defaultBranch, setDefaultBranch] = useState('main');
  const [showPat, setShowPat] = useState(false);
  const [isTesting, setIsTesting] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const [config, setConfig] = useState<{
    owner?: string;
    repo?: string;
    patSet: boolean;
    defaultBranch?: string;
    enabled?: boolean;
    lastTestedAt?: string;
  } | null>(null);

  // Load current config on mount
  useEffect(() => {
    repositoryAdminApi.getGitHubConfig().then((cfg) => {
      setConfig(cfg);
      if (cfg.owner && cfg.repo) {
        setRepoUrl(`https://github.com/${cfg.owner}/${cfg.repo}`);
      }
      if (cfg.defaultBranch) {
        setDefaultBranch(cfg.defaultBranch);
      }
      setLoaded(true);
    }).catch(() => setLoaded(true));
  }, []);

  const parseRepoUrl = (url: string): { owner?: string; repo?: string } => {
    const match = url.match(/github\.com\/([^/]+)\/([^/.]+)/);
    if (match) return { owner: match[1], repo: match[2] };
    return {};
  };

  const handleSave = async () => {
    const { owner, repo } = parseRepoUrl(repoUrl);
    if (!owner || !repo) {
      toast.error('Invalid GitHub URL. Expected: https://github.com/owner/repo');
      return;
    }
    setIsSaving(true);
    try {
      const result = await repositoryAdminApi.updateGitHubConfig({
        owner,
        repo,
        defaultBranch,
        enabled: true,
        ...(pat ? { pat } : {}),
      });
      setConfig(result);
      setPat('');
      toast.success('GitHub configuration saved');
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to save');
    } finally {
      setIsSaving(false);
    }
  };

  const handleTest = async () => {
    setIsTesting(true);
    try {
      const result = await repositoryAdminApi.testGitHubConnection();
      if (result.success) {
        toast.success(`Connected to ${result.repoName} (${result.latencyMs}ms)`);
        // Refresh config to get updated lastTestedAt
        const cfg = await repositoryAdminApi.getGitHubConfig();
        setConfig(cfg);
      } else {
        toast.error(result.error ?? 'Connection failed');
      }
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Test failed');
    } finally {
      setIsTesting(false);
    }
  };

  if (!loaded) return <RepositoryPathSkeleton />;

  return (
    <Card>
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
          {config?.lastTestedAt && (
            <Badge variant="outline" className="text-green-600 border-green-300">
              Connected
            </Badge>
          )}
        </div>
      </CardHeader>
      <CardContent>
        <div className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="github-url">Repository URL</Label>
            <Input
              id="github-url"
              placeholder="https://github.com/org/repo"
              value={repoUrl}
              onChange={(e) => setRepoUrl(e.target.value)}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="github-pat">Personal Access Token (PAT)</Label>
            <div className="flex gap-2">
              <Input
                id="github-pat"
                type={showPat ? 'text' : 'password'}
                placeholder={config?.patSet ? '••••••••••••••••' : 'ghp_...'}
                value={pat}
                onChange={(e) => setPat(e.target.value)}
              />
              <Button
                variant="outline"
                size="icon"
                onClick={() => setShowPat(!showPat)}
                type="button"
              >
                {showPat ? <X className="h-4 w-4" /> : <Check className="h-4 w-4" />}
              </Button>
            </div>
            {config?.patSet && !pat && (
              <p className="text-xs text-green-600">PAT configured. Leave blank to keep current value.</p>
            )}
          </div>
          <div className="space-y-2">
            <Label htmlFor="github-branch">Default Branch</Label>
            <Input
              id="github-branch"
              placeholder="main"
              value={defaultBranch}
              onChange={(e) => setDefaultBranch(e.target.value)}
            />
          </div>
          <div className="flex gap-2">
            <Button onClick={handleSave} disabled={isSaving || !repoUrl}>
              {isSaving ? (
                <><RefreshCw className="h-4 w-4 mr-2 animate-spin" />Saving...</>
              ) : (
                'Save'
              )}
            </Button>
            <Button
              variant="outline"
              onClick={handleTest}
              disabled={isTesting || !config?.patSet}
            >
              {isTesting ? (
                <><RefreshCw className="h-4 w-4 mr-2 animate-spin" />Testing...</>
              ) : (
                'Test Connection'
              )}
            </Button>
          </div>
          <p className="text-xs text-muted-foreground">
            Requires a fine-grained PAT with <strong>Contents: Read-only</strong> permission
            scoped to the target repository. Used by the reconciliation agent to clone and analyze code.
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

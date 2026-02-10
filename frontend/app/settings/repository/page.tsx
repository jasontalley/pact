'use client';

import { useState, useEffect } from 'react';
import { AppLayout } from '@/components/layout';
import { cn } from '@/lib/utils';
import {
  FolderOpen,
  Check,
  X,
  RefreshCw,
  Info,
  GitBranch,
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
                Connect a <strong>GitHub repository</strong> for the best experience — the reconciliation
                agent will clone and analyze code directly. For private repos, provide a fine-grained PAT.
              </p>
              <p>
                Alternatively, use <strong>browser upload</strong> to select your project folder directly
                from your machine.
              </p>
            </div>
          </div>
        </div>

        <div className="space-y-6">
          <GitHubIntegration />
          <BrowserUpload />
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
              <Badge variant="default" className="text-xs font-normal bg-primary">
                Recommended
              </Badge>
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

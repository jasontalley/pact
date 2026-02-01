'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { AppLayout } from '@/components/layout';
import { useActiveRuns } from '@/hooks/reconciliation';
import { ReconciliationWizard } from '@/components/agents/ReconciliationWizard';
import { ReconciliationHistory } from '@/components/agents/ReconciliationHistory';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import {
  GitCompare,
  Play,
  History,
  AlertCircle,
  CheckCircle,
  Clock,
  FileSearch,
} from 'lucide-react';

/**
 * Format relative time
 */
function formatRelativeTime(dateString: string): string {
  const date = new Date(dateString);
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffMins = Math.floor(diffMs / 60000);
  const diffHours = Math.floor(diffMs / 3600000);
  const diffDays = Math.floor(diffMs / 86400000);

  if (diffMins < 60) return `${diffMins} min ago`;
  if (diffHours < 24) return `${diffHours}h ago`;
  return `${diffDays}d ago`;
}

/**
 * Get status badge variant
 */
function getStatusVariant(status: string): 'default' | 'secondary' | 'destructive' | 'outline' {
  switch (status) {
    case 'completed':
      return 'default';
    case 'running':
      return 'secondary';
    case 'failed':
      return 'destructive';
    case 'pending_review':
      return 'outline';
    default:
      return 'outline';
  }
}

/**
 * Get status icon
 */
function getStatusIcon(status: string) {
  switch (status) {
    case 'completed':
      return <CheckCircle className="h-4 w-4 text-green-500" />;
    case 'running':
      return <Clock className="h-4 w-4 text-blue-500 animate-pulse" />;
    case 'failed':
      return <AlertCircle className="h-4 w-4 text-red-500" />;
    case 'pending_review':
      return <FileSearch className="h-4 w-4 text-yellow-500" />;
    default:
      return <Clock className="h-4 w-4 text-muted-foreground" />;
  }
}

export default function ReconciliationPage() {
  const router = useRouter();
  const [showWizard, setShowWizard] = useState(false);
  const [showHistory, setShowHistory] = useState(false);

  const { data: runs, isLoading, refetch } = useActiveRuns();

  // Calculate statistics from runs
  const stats = {
    total: runs?.length ?? 0,
    completed: runs?.filter((r) => r.status === 'completed').length ?? 0,
    running: runs?.filter((r) => r.status === 'running').length ?? 0,
    pendingReview: runs?.filter((r) => r.status === 'pending_review').length ?? 0,
    failed: runs?.filter((r) => r.status === 'failed').length ?? 0,
  };

  const handleRunClick = (runId: string) => {
    router.push(`/reconciliation/${runId}`);
  };

  const handleRecovered = () => {
    refetch();
  };

  return (
    <AppLayout showSidebar={false}>
      <div className="container mx-auto px-4 py-8 max-w-6xl">
        {/* Header */}
        <div className="flex items-center justify-between mb-8">
          <div>
            <h1 className="text-3xl font-bold flex items-center gap-2">
              <GitCompare className="h-8 w-8 text-primary" />
              Reconciliation
            </h1>
            <p className="text-muted-foreground mt-1">
              Analyze your codebase to discover and infer Intent Atoms from tests
            </p>
          </div>
          <div className="flex gap-2">
            <Button variant="outline" onClick={() => setShowHistory(true)}>
              <History className="h-4 w-4 mr-2" />
              History
            </Button>
            <Button onClick={() => setShowWizard(true)}>
              <Play className="h-4 w-4 mr-2" />
              Start Analysis
            </Button>
          </div>
        </div>

        {/* Statistics Cards */}
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-8">
          <Card>
            <CardContent className="p-4">
              <div className="flex items-center gap-2 text-muted-foreground mb-1">
                <GitCompare className="h-4 w-4" />
                <span className="text-sm">Total Runs</span>
              </div>
              <p className="text-2xl font-bold">{stats.total}</p>
            </CardContent>
          </Card>

          <Card>
            <CardContent className="p-4">
              <div className="flex items-center gap-2 text-muted-foreground mb-1">
                <CheckCircle className="h-4 w-4 text-green-500" />
                <span className="text-sm">Completed</span>
              </div>
              <p className="text-2xl font-bold">{stats.completed}</p>
            </CardContent>
          </Card>

          <Card>
            <CardContent className="p-4">
              <div className="flex items-center gap-2 text-muted-foreground mb-1">
                <Clock className="h-4 w-4 text-blue-500" />
                <span className="text-sm">Running</span>
              </div>
              <p className="text-2xl font-bold">{stats.running}</p>
            </CardContent>
          </Card>

          <Card>
            <CardContent className="p-4">
              <div className="flex items-center gap-2 text-muted-foreground mb-1">
                <FileSearch className="h-4 w-4 text-yellow-500" />
                <span className="text-sm">Pending Review</span>
              </div>
              <p className="text-2xl font-bold">{stats.pendingReview}</p>
            </CardContent>
          </Card>
        </div>

        {/* Runs List */}
        <Card>
          <CardHeader>
            <CardTitle className="text-lg flex items-center gap-2">
              Recent Runs
              {isLoading && (
                <span className="w-4 h-4 border-2 border-primary border-t-transparent rounded-full animate-spin" />
              )}
            </CardTitle>
          </CardHeader>
          <CardContent>
            {runs && runs.length > 0 ? (
              <div className="space-y-3">
                {runs.map((run) => (
                  <div
                    key={run.runId}
                    className="flex items-center justify-between p-4 rounded-lg border hover:bg-muted/50 cursor-pointer transition-colors"
                    onClick={() => handleRunClick(run.runId)}
                  >
                    <div className="flex items-center gap-4">
                      {getStatusIcon(run.status)}
                      <div>
                        <div className="flex items-center gap-2">
                          <span className="font-mono text-sm font-medium">
                            {run.runId}
                          </span>
                          <Badge variant={getStatusVariant(run.status)}>
                            {run.status}
                          </Badge>
                        </div>
                        <div className="text-sm text-muted-foreground mt-1">
                          {formatRelativeTime(run.startTime)}
                        </div>
                      </div>
                    </div>

                    <Button variant="ghost" size="sm" onClick={(e) => {
                      e.stopPropagation();
                      handleRunClick(run.runId);
                    }}>
                      View Details
                    </Button>
                  </div>
                ))}
              </div>
            ) : isLoading ? (
              <div className="flex items-center justify-center py-12">
                <div className="w-8 h-8 border-4 border-primary border-t-transparent rounded-full animate-spin" />
              </div>
            ) : (
              <div className="text-center py-12">
                <div className="w-16 h-16 mx-auto mb-4 rounded-full bg-muted flex items-center justify-center">
                  <GitCompare className="w-8 h-8 text-muted-foreground" />
                </div>
                <p className="text-muted-foreground">No reconciliation runs yet</p>
                <p className="text-sm text-muted-foreground mt-1">
                  Start an analysis to discover Intent Atoms from your tests
                </p>
                <Button className="mt-4" onClick={() => setShowWizard(true)}>
                  <Play className="h-4 w-4 mr-2" />
                  Start Analysis
                </Button>
              </div>
            )}
          </CardContent>
        </Card>

        {/* Wizard Dialog */}
        <ReconciliationWizard open={showWizard} onOpenChange={setShowWizard} />

        {/* History Dialog */}
        <ReconciliationHistory
          open={showHistory}
          onOpenChange={setShowHistory}
          onRecovered={handleRecovered}
        />
      </div>
    </AppLayout>
  );
}

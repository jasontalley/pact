'use client';

import { useState, useCallback } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { AppLayout } from '@/components/layout';
import { useRunDetails, useRecommendations, useApplyRecommendations } from '@/hooks/reconciliation';
import { AtomRecommendationCard, ApplyRecommendationsDialog } from '@/components/reconciliation';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { ScrollArea } from '@/components/ui/scroll-area';
import {
  GitCompare,
  ArrowLeft,
  CheckCircle,
  AlertCircle,
  Clock,
  FileSearch,
  Zap,
  Layers,
  CheckCheck,
  XCircle,
} from 'lucide-react';
import type { MoleculeRecommendation } from '@/types/reconciliation';

/**
 * Format date for display
 */
function formatDate(dateString: string): string {
  const date = new Date(dateString);
  return date.toLocaleDateString(undefined, {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
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
    case 'waiting_for_review':
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
      return <CheckCircle className="h-5 w-5 text-green-500" />;
    case 'running':
      return <Clock className="h-5 w-5 text-blue-500 animate-pulse" />;
    case 'failed':
      return <AlertCircle className="h-5 w-5 text-red-500" />;
    case 'pending_review':
    case 'waiting_for_review':
      return <FileSearch className="h-5 w-5 text-yellow-500" />;
    default:
      return <Clock className="h-5 w-5 text-muted-foreground" />;
  }
}

/**
 * Molecule recommendation card
 */
function MoleculeCard({ molecule }: { molecule: MoleculeRecommendation }) {
  return (
    <Card className="mb-3">
      <CardContent className="p-4">
        <div className="flex items-start justify-between gap-4">
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 mb-2">
              <span className="font-mono text-xs text-muted-foreground">
                {molecule.tempId}
              </span>
              <Badge
                variant={molecule.status === 'approved' ? 'default' : molecule.status === 'rejected' ? 'destructive' : 'secondary'}
                className="text-xs"
              >
                {molecule.status}
              </Badge>
            </div>
            <p className="font-medium mb-1">{molecule.name}</p>
            <p className="text-sm text-muted-foreground mb-2">{molecule.description}</p>
            <div className="flex items-center gap-4 text-xs text-muted-foreground">
              <span>
                Confidence: <span className="font-medium">{Math.round(molecule.confidence * 100)}%</span>
              </span>
              <span>
                Atoms: <span className="font-medium">{molecule.atomRecommendationTempIds.length}</span>
              </span>
            </div>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

export default function RunDetailsPage() {
  const params = useParams();
  const router = useRouter();
  const runId = params.runId as string;

  // Decision tracking state
  const [decisions, setDecisions] = useState<Map<string, 'approve' | 'reject'>>(new Map());
  const [showApplyDialog, setShowApplyDialog] = useState(false);

  const { data: runDetails, isLoading: detailsLoading, error: detailsError } = useRunDetails(runId);
  const { data: recommendations, isLoading: recsLoading } = useRecommendations(runId);
  const applyMutation = useApplyRecommendations();

  const isLoading = detailsLoading || recsLoading;

  // Handle individual atom decision (local state only, persisted on Apply)
  const handleAtomDecision = useCallback((atomId: string, decision: 'approve' | 'reject', _reason?: string) => {
    setDecisions(prev => new Map(prev).set(atomId, decision));
  }, []);

  // Bulk approve all passing atoms
  const handleApproveAllPassing = useCallback(() => {
    if (!recommendations) return;
    const passingAtoms = recommendations.atoms.filter(a => (a.qualityScore ?? 0) >= 60);
    const newDecisions = new Map(decisions);
    passingAtoms.forEach(atom => {
      newDecisions.set(atom.tempId, 'approve');
    });
    setDecisions(newDecisions);
  }, [recommendations, decisions]);

  // Bulk reject all failing atoms
  const handleRejectAllFailing = useCallback(() => {
    if (!recommendations) return;
    const failingAtoms = recommendations.atoms.filter(a => (a.qualityScore ?? 0) < 60);
    const newDecisions = new Map(decisions);
    failingAtoms.forEach(atom => {
      newDecisions.set(atom.tempId, 'reject');
    });
    setDecisions(newDecisions);
  }, [recommendations, decisions]);

  // Calculate decision summary
  const decisionSummary = recommendations ? {
    approved: recommendations.atoms.filter(a => decisions.get(a.tempId) === 'approve' || a.status === 'approved').length,
    rejected: recommendations.atoms.filter(a => decisions.get(a.tempId) === 'reject' || a.status === 'rejected').length,
    pending: recommendations.atoms.filter(a => !decisions.has(a.tempId) && a.status === 'pending').length,
  } : { approved: 0, rejected: 0, pending: 0 };

  if (detailsError) {
    return (
      <AppLayout showSidebar={false}>
        <div className="container mx-auto px-4 py-8 max-w-6xl">
          <div className="text-center py-12">
            <AlertCircle className="h-12 w-12 mx-auto mb-4 text-red-500" />
            <h2 className="text-xl font-semibold mb-2">Failed to load run</h2>
            <p className="text-muted-foreground">{(detailsError as Error).message}</p>
            <Button variant="outline" className="mt-4" onClick={() => router.push('/reconciliation')}>
              <ArrowLeft className="h-4 w-4 mr-2" />
              Back to Runs
            </Button>
          </div>
        </div>
      </AppLayout>
    );
  }

  return (
    <AppLayout showSidebar={false}>
      <div className="container mx-auto px-4 py-8 max-w-6xl">
        {/* Header */}
        <div className="flex items-center justify-between mb-8">
          <div className="flex items-center gap-4">
            <Button variant="ghost" size="icon" onClick={() => router.push('/reconciliation')}>
              <ArrowLeft className="h-5 w-5" />
            </Button>
            <div>
              <h1 className="text-2xl font-bold flex items-center gap-2">
                <GitCompare className="h-6 w-6 text-primary" />
                Run {runId}
              </h1>
              {runDetails && (
                <div className="flex items-center gap-2 mt-1">
                  {getStatusIcon(runDetails.status)}
                  <Badge variant={getStatusVariant(runDetails.status)}>
                    {runDetails.status}
                  </Badge>
                  <Badge variant="outline">{runDetails.mode}</Badge>
                  <span className="text-sm text-muted-foreground">
                    {formatDate(runDetails.startTime)}
                  </span>
                </div>
              )}
            </div>
          </div>
          {recommendations && recommendations.atoms.length > 0 && (
            <div className="flex items-center gap-2">
              {/* Decision summary */}
              <div className="text-sm text-muted-foreground mr-2">
                <span className="text-green-600 font-medium">{decisionSummary.approved}</span> approved,{' '}
                <span className="text-red-600 font-medium">{decisionSummary.rejected}</span> rejected,{' '}
                <span className="font-medium">{decisionSummary.pending}</span> pending
              </div>
              <Button
                variant="default"
                onClick={() => setShowApplyDialog(true)}
                disabled={decisionSummary.approved === 0}
              >
                <CheckCheck className="h-4 w-4 mr-2" />
                Apply ({decisionSummary.approved})
              </Button>
            </div>
          )}
        </div>

        {isLoading ? (
          <div className="flex items-center justify-center py-12">
            <div className="w-8 h-8 border-4 border-primary border-t-transparent rounded-full animate-spin" />
          </div>
        ) : (
          <>
            {/* Summary Statistics */}
            {runDetails?.summary && (
              <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-8">
                <Card>
                  <CardContent className="p-4">
                    <div className="flex items-center gap-2 text-muted-foreground mb-1">
                      <FileSearch className="h-4 w-4" />
                      <span className="text-sm">Tests Analyzed</span>
                    </div>
                    <p className="text-2xl font-bold">{runDetails.summary.totalOrphanTests}</p>
                  </CardContent>
                </Card>

                <Card>
                  <CardContent className="p-4">
                    <div className="flex items-center gap-2 text-muted-foreground mb-1">
                      <Zap className="h-4 w-4" />
                      <span className="text-sm">Atoms Inferred</span>
                    </div>
                    <p className="text-2xl font-bold">{runDetails.summary.inferredAtomsCount}</p>
                  </CardContent>
                </Card>

                <Card>
                  <CardContent className="p-4">
                    <div className="flex items-center gap-2 text-muted-foreground mb-1">
                      <Layers className="h-4 w-4" />
                      <span className="text-sm">Molecules</span>
                    </div>
                    <p className="text-2xl font-bold">{runDetails.summary.inferredMoleculesCount}</p>
                  </CardContent>
                </Card>

                <Card>
                  <CardContent className="p-4">
                    <div className="flex items-center gap-2 text-muted-foreground mb-1">
                      <CheckCircle className="h-4 w-4 text-green-500" />
                      <span className="text-sm">Quality Pass Rate</span>
                    </div>
                    <p className="text-2xl font-bold">
                      {runDetails.summary.inferredAtomsCount > 0
                        ? Math.round(
                            (runDetails.summary.qualityPassCount /
                              runDetails.summary.inferredAtomsCount) *
                              100
                          )
                        : 0}
                      %
                    </p>
                  </CardContent>
                </Card>
              </div>
            )}

            {/* Recommendations Tabs */}
            {recommendations && (
              <Card>
                <CardHeader>
                  <CardTitle>Recommendations</CardTitle>
                </CardHeader>
                <CardContent>
                  <Tabs defaultValue="atoms">
                    <TabsList>
                      <TabsTrigger value="atoms" className="flex items-center gap-2">
                        <Zap className="h-4 w-4" />
                        Atoms ({recommendations.atoms.length})
                      </TabsTrigger>
                      <TabsTrigger value="molecules" className="flex items-center gap-2">
                        <Layers className="h-4 w-4" />
                        Molecules ({recommendations.molecules.length})
                      </TabsTrigger>
                    </TabsList>

                    <TabsContent value="atoms" className="mt-4">
                      {recommendations.atoms.length > 0 ? (
                        <>
                          {/* Bulk Actions */}
                          <div className="flex items-center gap-2 mb-4">
                            <Button
                              variant="outline"
                              size="sm"
                              onClick={handleApproveAllPassing}
                              disabled={applyMutation.isPending}
                            >
                              <CheckCheck className="h-4 w-4 mr-1" />
                              Approve All Passing
                            </Button>
                            <Button
                              variant="outline"
                              size="sm"
                              onClick={handleRejectAllFailing}
                              disabled={applyMutation.isPending}
                            >
                              <XCircle className="h-4 w-4 mr-1" />
                              Reject All Failing
                            </Button>
                          </div>
                          <ScrollArea className="h-[500px] pr-4">
                            {recommendations.atoms.map((atom) => (
                              <AtomRecommendationCard
                                key={atom.tempId}
                                atom={atom}
                                decision={decisions.get(atom.tempId)}
                                onApprove={() => handleAtomDecision(atom.tempId, 'approve')}
                                onReject={(reason) => handleAtomDecision(atom.tempId, 'reject', reason)}
                                disabled={applyMutation.isPending}
                              />
                            ))}
                          </ScrollArea>
                        </>
                      ) : (
                        <div className="text-center py-8 text-muted-foreground">
                          No atom recommendations
                        </div>
                      )}
                    </TabsContent>

                    <TabsContent value="molecules" className="mt-4">
                      {recommendations.molecules.length > 0 ? (
                        <ScrollArea className="h-[500px] pr-4">
                          {recommendations.molecules.map((molecule) => (
                            <MoleculeCard key={molecule.id} molecule={molecule} />
                          ))}
                        </ScrollArea>
                      ) : (
                        <div className="text-center py-8 text-muted-foreground">
                          No molecule recommendations
                        </div>
                      )}
                    </TabsContent>
                  </Tabs>
                </CardContent>
              </Card>
            )}

            {/* Run Details */}
            {runDetails && (
              <Card className="mt-6">
                <CardHeader>
                  <CardTitle className="text-base">Run Configuration</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="grid grid-cols-2 gap-4 text-sm">
                    <div>
                      <span className="text-muted-foreground">Root Directory:</span>
                      <p className="font-mono text-xs">{runDetails.rootDirectory}</p>
                    </div>
                    <div>
                      <span className="text-muted-foreground">Mode:</span>
                      <p>{runDetails.mode}</p>
                    </div>
                    {runDetails.options?.qualityThreshold && (
                      <div>
                        <span className="text-muted-foreground">Quality Threshold:</span>
                        <p>{runDetails.options.qualityThreshold}</p>
                      </div>
                    )}
                    {runDetails.options?.requireReview !== undefined && (
                      <div>
                        <span className="text-muted-foreground">Require Review:</span>
                        <p>{runDetails.options.requireReview ? 'Yes' : 'No'}</p>
                      </div>
                    )}
                    {runDetails.metrics && (
                      <>
                        <div>
                          <span className="text-muted-foreground">Duration:</span>
                          <p>{(runDetails.metrics.durationMs / 1000).toFixed(1)}s</p>
                        </div>
                        <div>
                          <span className="text-muted-foreground">LLM Calls:</span>
                          <p>{runDetails.metrics.llmCallCount}</p>
                        </div>
                      </>
                    )}
                  </div>
                </CardContent>
              </Card>
            )}
          </>
        )}
      </div>

      {/* Apply Recommendations Dialog */}
      {recommendations && (
        <ApplyRecommendationsDialog
          open={showApplyDialog}
          onOpenChange={setShowApplyDialog}
          atoms={recommendations.atoms}
          molecules={recommendations.molecules}
          atomDecisions={decisions}
          moleculeDecisions={new Map()}
          onApply={(options) => {
            applyMutation.mutate({
              runId,
              data: options,
            });
            setShowApplyDialog(false);
          }}
          isApplying={applyMutation.isPending}
        />
      )}
    </AppLayout>
  );
}

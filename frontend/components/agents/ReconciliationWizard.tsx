'use client';

import { useState, useEffect, useCallback } from 'react';
import { cn } from '@/lib/utils';
import { useProviders, useBudgetStatus } from '@/hooks/llm';
import { ProviderStatus } from './ProviderStatus';
import { QualityBadge } from '@/components/quality/QualityBadge';
import { useReconciliationEvents } from '@/hooks/socket/use-reconciliation-events';
import { reconciliationApi } from '@/lib/api/reconciliation';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Checkbox } from '@/components/ui/checkbox';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import { ScrollArea } from '@/components/ui/scroll-area';
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from '@/components/ui/accordion';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from '@/components/ui/collapsible';
import { ChevronDown } from 'lucide-react';
import { toast } from 'sonner';
import {
  useRepositoryUploadStore,
  browseAndReadDirectory,
} from '@/stores/repository-upload';
import {
  useStartReconciliation,
  useStartPreReadReconciliation,
  useStartGitHubReconciliation,
  useSubmitReview,
  useApplyRecommendations,
  useCreateChangeSetFromRun,
} from '@/hooks/reconciliation';
import { repositoryAdminApi } from '@/lib/api/repository';
import type {
  StartReconciliationDto,
  ReconciliationMode,
  PendingAtom,
  PendingMolecule,
  PendingReview,
  AnalysisStartResult,
  ReconciliationResult,
  AtomDecision,
  MoleculeDecision,
  PreReadPayload,
} from '@/types/reconciliation';

interface ReconciliationWizardProps {
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
}

type WizardStep = 'config' | 'analyzing' | 'review' | 'apply' | 'complete';

/**
 * Local storage key for persisting wizard state
 */
const STORAGE_KEY = 'pact-reconciliation-wizard-state';

/**
 * Persisted wizard state
 */
interface PersistedWizardState {
  step: WizardStep;
  runId: string | null;
  config: StartReconciliationDto;
  pendingReview: PendingReview | null;
  atomDecisions: Array<[string, 'approve' | 'reject']>;
  moleculeDecisions: Array<[string, 'approve' | 'reject']>;
  savedAt: number;
}

/**
 * Save wizard state to localStorage
 */
function saveWizardState(state: Omit<PersistedWizardState, 'savedAt'>) {
  try {
    const persisted: PersistedWizardState = {
      ...state,
      savedAt: Date.now(),
    };
    localStorage.setItem(STORAGE_KEY, JSON.stringify(persisted));
  } catch (e) {
    console.warn('Failed to persist wizard state:', e);
  }
}

/**
 * Load wizard state from localStorage
 * Returns null if no saved state or if state is stale (> 24 hours old)
 */
function loadWizardState(): PersistedWizardState | null {
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (!stored) return null;

    const parsed = JSON.parse(stored) as PersistedWizardState;

    // Check if state is stale (> 24 hours old)
    const ageMs = Date.now() - parsed.savedAt;
    const maxAgeMs = 24 * 60 * 60 * 1000; // 24 hours
    if (ageMs > maxAgeMs) {
      localStorage.removeItem(STORAGE_KEY);
      return null;
    }

    // Don't restore 'analyzing' state - it's not resumable
    if (parsed.step === 'analyzing') {
      return null;
    }

    return parsed;
  } catch (e) {
    console.warn('Failed to load wizard state:', e);
    return null;
  }
}

/**
 * Clear persisted wizard state
 */
function clearWizardState() {
  try {
    localStorage.removeItem(STORAGE_KEY);
  } catch (e) {
    console.warn('Failed to clear wizard state:', e);
  }
}

/**
 * Pending Atom Card for review
 */
function PendingAtomCard({
  atom,
  decision,
  onDecisionChange,
}: {
  atom: PendingAtom;
  decision: 'approve' | 'reject' | null;
  onDecisionChange: (decision: 'approve' | 'reject') => void;
}) {
  return (
    <Card
      className={cn(
        'transition-colors',
        decision === 'approve' && 'border-green-500/60 bg-green-500/10',
        decision === 'reject' && 'border-red-500/60 bg-red-500/10',
        !decision && !atom.passes && 'border-yellow-500/40',
      )}
    >
      <CardContent className="p-4">
        <div className="flex items-start justify-between gap-3">
          <div className="flex-1 min-w-0">
            <div className="flex flex-wrap items-center gap-2 mb-2">
              <Badge variant="outline" className="capitalize text-xs">
                {atom.category}
              </Badge>
              <QualityBadge score={atom.qualityScore} />
              {atom.passes ? (
                <Badge className="bg-green-600 text-white text-xs">
                  Passes
                </Badge>
              ) : (
                <Badge variant="destructive" className="text-xs">
                  Fails Threshold
                </Badge>
              )}
            </div>
            <p className="text-sm text-foreground leading-relaxed mb-2">{atom.description}</p>
            {atom.issues.length > 0 && (
              <div className="text-xs text-muted-foreground mt-1">
                <p className="font-medium text-yellow-600 dark:text-yellow-400 mb-1">
                  Issues:
                </p>
                <ul className="list-disc list-inside space-y-0.5">
                  {atom.issues.map((issue, i) => (
                    <li key={i}>{issue}</li>
                  ))}
                </ul>
              </div>
            )}
          </div>
          <div className="flex flex-col gap-2 shrink-0">
            <Button
              size="sm"
              variant={decision === 'approve' ? 'default' : 'outline'}
              className={cn(
                'w-20',
                decision === 'approve' && 'bg-green-600 hover:bg-green-700 text-white'
              )}
              onClick={() => onDecisionChange('approve')}
            >
              Approve
            </Button>
            <Button
              size="sm"
              variant={decision === 'reject' ? 'destructive' : 'outline'}
              className="w-20"
              onClick={() => onDecisionChange('reject')}
            >
              Reject
            </Button>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

/**
 * Pending Molecule Card for review
 */
function PendingMoleculeCard({
  molecule,
  decision,
  onDecisionChange,
}: {
  molecule: PendingMolecule;
  decision: 'approve' | 'reject' | null;
  onDecisionChange: (decision: 'approve' | 'reject') => void;
}) {
  const confidencePercent = Math.round(molecule.confidence);

  return (
    <Card
      className={cn(
        'transition-colors',
        decision === 'approve' && 'border-green-500/60 bg-green-500/10',
        decision === 'reject' && 'border-red-500/60 bg-red-500/10',
      )}
    >
      <CardContent className="p-4">
        <div className="flex items-start justify-between gap-3">
          <div className="flex-1 min-w-0">
            <div className="flex flex-wrap items-center gap-2 mb-2">
              <Badge variant="secondary" className="text-xs">Molecule</Badge>
              <span
                className={cn(
                  'text-xs font-medium',
                  confidencePercent >= 80
                    ? 'text-green-600 dark:text-green-400'
                    : confidencePercent >= 60
                    ? 'text-yellow-600 dark:text-yellow-400'
                    : 'text-red-600 dark:text-red-400'
                )}
              >
                {confidencePercent}% confidence
              </span>
              <span className="text-xs text-muted-foreground">
                {molecule.atomCount} atoms
              </span>
            </div>
            <p className="text-sm font-bold text-foreground mb-1">{molecule.name}</p>
            <p className="text-sm text-muted-foreground">{molecule.description}</p>
          </div>
          <div className="flex flex-col gap-2 shrink-0">
            <Button
              size="sm"
              variant={decision === 'approve' ? 'default' : 'outline'}
              className={cn(
                'w-20',
                decision === 'approve' && 'bg-green-600 hover:bg-green-700 text-white'
              )}
              onClick={() => onDecisionChange('approve')}
            >
              Approve
            </Button>
            <Button
              size="sm"
              variant={decision === 'reject' ? 'destructive' : 'outline'}
              className="w-20"
              onClick={() => onDecisionChange('reject')}
            >
              Reject
            </Button>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

/**
 * ReconciliationWizard - Full reconciliation workflow
 *
 * Features:
 * - Configure reconciliation options
 * - Progress tracking during analysis
 * - Human-in-the-loop review for atoms and molecules
 * - Apply approved recommendations
 */
export function ReconciliationWizard({ open, onOpenChange }: ReconciliationWizardProps) {
  const [step, setStep] = useState<WizardStep>('config');
  const [runId, setRunId] = useState<string | null>(null);
  const [pendingReview, setPendingReview] = useState<PendingReview | null>(null);
  const [result, setResult] = useState<ReconciliationResult | null>(null);
  const [hasRestoredState, setHasRestoredState] = useState(false);

  // Progress tracking from WebSocket events
  const [progressPhase, setProgressPhase] = useState('');
  const [progressPercent, setProgressPercent] = useState(0);
  const [progressMessage, setProgressMessage] = useState('Initializing...');

  // Review decisions
  const [atomDecisions, setAtomDecisions] = useState<Map<string, 'approve' | 'reject'>>(
    new Map()
  );
  const [moleculeDecisions, setMoleculeDecisions] = useState<
    Map<string, 'approve' | 'reject'>
  >(new Map());

  // Configuration state
  const [config, setConfig] = useState<StartReconciliationDto>({
    mode: 'full-scan',
    options: {
      analyzeDocs: true,
      maxTests: 100,
      qualityThreshold: 80,
      requireReview: true,
    },
  });

  const { data: providers } = useProviders();
  const { isDailyBudgetExceeded } = useBudgetStatus();

  // Restore state from localStorage on mount
  useEffect(() => {
    if (open && !hasRestoredState) {
      const savedState = loadWizardState();
      if (savedState) {
        setStep(savedState.step);
        setRunId(savedState.runId);
        setConfig(savedState.config);
        setPendingReview(savedState.pendingReview);
        setAtomDecisions(new Map(savedState.atomDecisions));
        setMoleculeDecisions(new Map(savedState.moleculeDecisions));
        setHasRestoredState(true);
      }
    }
  }, [open, hasRestoredState]);

  // Save state to localStorage when it changes (excluding 'complete' and 'config' initial states)
  useEffect(() => {
    if (step !== 'config' && step !== 'complete' && step !== 'analyzing') {
      saveWizardState({
        step,
        runId,
        config,
        pendingReview,
        atomDecisions: Array.from(atomDecisions.entries()),
        moleculeDecisions: Array.from(moleculeDecisions.entries()),
      });
    }
    // Clear state when completed
    if (step === 'complete') {
      clearWizardState();
    }
  }, [step, runId, config, pendingReview, atomDecisions, moleculeDecisions]);

  // Change set creation state
  const [changeSetName, setChangeSetName] = useState('');
  const [showChangeSetInput, setShowChangeSetInput] = useState(false);

  const [isCancelling, setIsCancelling] = useState(false);

  // Source mode: 'browser' = upload from browser, 'github' = clone from GitHub
  type SourceMode = 'browser' | 'github';
  const [sourceMode, setSourceMode] = useState<SourceMode>('browser');
  const [githubBranch, setGithubBranch] = useState('');
  const [githubCommitSha, setGithubCommitSha] = useState('');
  const [githubConfigured, setGithubConfigured] = useState(false);
  const [githubRepoLabel, setGithubRepoLabel] = useState('');

  // Shared upload store (populated from Settings page or wizard browse button)
  const uploadedFiles = useRepositoryUploadStore((s) => s.fileContents);
  const uploadedManifest = useRepositoryUploadStore((s) => s.manifest);
  const uploadedDirectoryName = useRepositoryUploadStore((s) => s.directoryName);
  const isReadingFiles = useRepositoryUploadStore((s) => s.isReading);
  const uploadSummary = useRepositoryUploadStore((s) => s.summary);

  const startMutation = useStartReconciliation();
  const startPreReadMutation = useStartPreReadReconciliation();
  const startGitHubMutation = useStartGitHubReconciliation();
  const submitReviewMutation = useSubmitReview();
  const applyMutation = useApplyRecommendations();
  const createChangeSetMutation = useCreateChangeSetFromRun();

  // Load GitHub config status on mount
  useEffect(() => {
    repositoryAdminApi.getGitHubConfig().then((cfg) => {
      if (cfg.owner && cfg.repo && cfg.patSet) {
        setGithubConfigured(true);
        setGithubRepoLabel(`${cfg.owner}/${cfg.repo}`);
        setSourceMode('github');
        if (cfg.defaultBranch) setGithubBranch(cfg.defaultBranch);
      }
    }).catch(() => { /* GitHub not configured, that's fine */ });
  }, []);

  const hasAvailableProvider = providers?.availableCount ? providers.availableCount > 0 : false;
  const canStart = hasAvailableProvider && !isDailyBudgetExceeded;

  // WebSocket event handlers for real-time reconciliation updates
  const handleWsCompleted = useCallback((event: { runId: string; summary: { totalOrphanTests: number; inferredAtomsCount: number; inferredMoleculesCount: number; qualityPassCount: number; qualityFailCount: number; duration: number } }) => {
    // Fire-and-forget async work (event handler must return void)
    void (async () => {
      try {
        const recs = await reconciliationApi.getRecommendations(event.runId);
        const completedResult: ReconciliationResult = {
          runId: event.runId,
          status: 'completed',
          summary: event.summary,
          inferredAtoms: recs.atoms.map((a) => ({
            tempId: a.tempId,
            description: a.description,
            category: a.category,
            qualityScore: a.qualityScore ?? 0,
            confidence: a.confidence,
            observableOutcomes: a.observableOutcomes?.map((o) => o.description) ?? [],
            reasoning: a.reasoning || '',
            sourceTest: {
              filePath: a.sourceTestFilePath,
              testName: a.sourceTestName,
              lineNumber: a.sourceTestLineNumber || 0,
            },
          })),
          inferredMolecules: recs.molecules.map((m) => ({
            tempId: m.tempId,
            name: m.name,
            description: m.description,
            confidence: m.confidence,
            reasoning: '',
            atomTempIds: m.atomRecommendationTempIds,
          })),
          errors: [],
        };
        setResult(completedResult);
        setStep('apply');
        initializeApplyDecisions(completedResult);
        toast.success(`Reconciliation complete: ${event.summary.inferredAtomsCount} atoms inferred`);
      } catch {
        toast.success(`Reconciliation complete: ${event.summary.inferredAtomsCount} atoms inferred`);
        setStep('complete');
      }
    })();
  }, []);

  const handleWsInterrupted = useCallback((event: { runId: string; reason: string; pendingAtomCount: number; pendingMoleculeCount: number }) => {
    void (async () => {
      try {
        const review = await reconciliationApi.getPendingReview(event.runId);
        setPendingReview(review);
        setStep('review');
        initializeReviewDecisions(review);
        toast.info('Reconciliation paused for review');
      } catch {
        toast.error('Reconciliation interrupted but could not load review data');
        setStep('config');
      }
    })();
  }, []);

  const handleWsFailed = useCallback((event: { error: string }) => {
    toast.error(`Reconciliation failed: ${event.error}`);
    setStep('config');
  }, []);

  const handleWsCancelled = useCallback(() => {
    toast.info('Reconciliation run cancelled');
    setIsCancelling(false);
    setStep('config');
    setRunId(null);
  }, []);

  const handleWsProgress = useCallback((event: { phase: string; progress: number; message: string }) => {
    setProgressPhase(event.phase);
    setProgressPercent(event.progress);
    setProgressMessage(event.message);
  }, []);

  // Subscribe to WebSocket events for the active run
  useReconciliationEvents(step === 'analyzing' ? runId : null, {
    onProgress: handleWsProgress,
    onCompleted: handleWsCompleted,
    onFailed: handleWsFailed,
    onInterrupted: handleWsInterrupted,
    onCancelled: handleWsCancelled,
  });

  // Handle cancel run
  const handleCancelRun = async () => {
    if (!runId) return;
    setIsCancelling(true);
    try {
      await reconciliationApi.cancel(runId);
      toast.info('Cancellation requested...');
    } catch {
      toast.error('Failed to cancel run');
      setIsCancelling(false);
    }
  };

  // Read files from a directory using shared store + File System Access API
  const handleBrowseDirectory = async () => {
    try {
      const { directoryName, fileCount } = await browseAndReadDirectory();
      toast.success(`Read ${fileCount} files from "${directoryName}"`);
    } catch (err) {
      if (err instanceof DOMException && err.name === 'AbortError') return;
      toast.error(err instanceof Error ? err.message : String(err));
    }
  };

  // Handle start analysis — returns immediately, progress via WebSocket
  const handleStartAnalysis = () => {
    setStep('analyzing');
    setProgressPhase('');
    setProgressPercent(0);
    setProgressMessage('Initializing...');

    const onSuccess = (data: AnalysisStartResult) => { setRunId(data.runId); };
    const onError = () => { setStep('config'); };

    if (sourceMode === 'github') {
      startGitHubMutation.mutate(
        {
          branch: githubBranch || undefined,
          commitSha: githubCommitSha || undefined,
        },
        { onSuccess, onError },
      );
    } else if (uploadedFiles && uploadedManifest && uploadedDirectoryName) {
      const payload: PreReadPayload = {
        rootDirectory: uploadedDirectoryName,
        manifest: uploadedManifest,
        fileContents: uploadedFiles,
        options: config.options,
      };
      startPreReadMutation.mutate(payload, { onSuccess, onError });
    }
  };

  // Initialize review decisions (auto-approve passing atoms)
  const initializeReviewDecisions = (review: PendingReview) => {
    const atomDec = new Map<string, 'approve' | 'reject'>();
    review.pendingAtoms.forEach((atom) => {
      atomDec.set(atom.tempId, atom.passes ? 'approve' : 'reject');
    });
    setAtomDecisions(atomDec);

    const molDec = new Map<string, 'approve' | 'reject'>();
    review.pendingMolecules.forEach((mol) => {
      molDec.set(mol.tempId, mol.confidence >= 70 ? 'approve' : 'reject');
    });
    setMoleculeDecisions(molDec);
  };

  // Initialize apply decisions from result
  const initializeApplyDecisions = (res: ReconciliationResult) => {
    const atomDec = new Map<string, 'approve' | 'reject'>();
    (res.inferredAtoms ?? []).forEach((atom) => {
      const passes = (atom.qualityScore || 0) >= (config.options?.qualityThreshold || 80);
      atomDec.set(atom.tempId, passes ? 'approve' : 'reject');
    });
    setAtomDecisions(atomDec);

    const molDec = new Map<string, 'approve' | 'reject'>();
    (res.inferredMolecules ?? []).forEach((mol) => {
      molDec.set(mol.tempId, mol.confidence >= 70 ? 'approve' : 'reject');
    });
    setMoleculeDecisions(molDec);
  };

  // Handle submit review
  const handleSubmitReview = () => {
    if (!runId) return;

    const atomDecs: AtomDecision[] = [];
    atomDecisions.forEach((decision, tempId) => {
      atomDecs.push({ recommendationId: tempId, decision });
    });

    const molDecs: MoleculeDecision[] = [];
    moleculeDecisions.forEach((decision, tempId) => {
      molDecs.push({ recommendationId: tempId, decision });
    });

    submitReviewMutation.mutate(
      {
        runId,
        data: {
          atomDecisions: atomDecs,
          moleculeDecisions: molDecs,
        },
      },
      {
        onSuccess: (res: ReconciliationResult) => {
          setResult(res);
          setStep('apply');
          initializeApplyDecisions(res);
        },
      }
    );
  };

  // Handle apply
  const handleApply = (injectAnnotations: boolean) => {
    if (!runId) return;

    // Get approved recommendations
    const selections: string[] = [];
    atomDecisions.forEach((decision, tempId) => {
      if (decision === 'approve') {
        selections.push(tempId);
      }
    });
    moleculeDecisions.forEach((decision, tempId) => {
      if (decision === 'approve') {
        selections.push(tempId);
      }
    });

    if (selections.length === 0) {
      toast.error('No recommendations selected to apply');
      return;
    }

    applyMutation.mutate(
      {
        runId,
        data: {
          selections,
          injectAnnotations,
        },
      },
      {
        onSuccess: () => {
          setStep('complete');
        },
      }
    );
  };

  // Handle create change set (governed path)
  const handleCreateChangeSet = () => {
    if (!runId) return;

    // Get approved recommendations
    const selections: string[] = [];
    atomDecisions.forEach((decision, tempId) => {
      if (decision === 'approve') {
        selections.push(tempId);
      }
    });
    moleculeDecisions.forEach((decision, tempId) => {
      if (decision === 'approve') {
        selections.push(tempId);
      }
    });

    if (selections.length === 0) {
      toast.error('No recommendations selected');
      return;
    }

    createChangeSetMutation.mutate(
      {
        runId,
        data: {
          selections,
          name: changeSetName || undefined,
        },
      },
      {
        onSuccess: () => {
          setStep('complete');
          setShowChangeSetInput(false);
          setChangeSetName('');
        },
      }
    );
  };

  // Handle close/reset
  const handleClose = (clearState = false) => {
    onOpenChange?.(false);
    setTimeout(() => {
      // Only reset state if completed or explicitly requested
      if (step === 'complete' || clearState) {
        setStep('config');
        setRunId(null);
        setPendingReview(null);
        setResult(null);
        setAtomDecisions(new Map());
        setMoleculeDecisions(new Map());
        setHasRestoredState(false);
        clearWizardState();
      }
      // Otherwise keep state for resume
    }, 200);
  };

  // Handle explicit discard
  const handleDiscard = () => {
    clearWizardState();
    setStep('config');
    setRunId(null);
    setPendingReview(null);
    setResult(null);
    setAtomDecisions(new Map());
    setMoleculeDecisions(new Map());
    setHasRestoredState(false);
  };

  // Bulk select helpers
  const approveAllAtoms = () => {
    const newDec = new Map<string, 'approve' | 'reject'>();
    if (pendingReview) {
      pendingReview.pendingAtoms.forEach((a) => newDec.set(a.tempId, 'approve'));
    } else if (result) {
      (result.inferredAtoms ?? []).forEach((a) => newDec.set(a.tempId, 'approve'));
    }
    setAtomDecisions(newDec);
  };

  const rejectAllAtoms = () => {
    const newDec = new Map<string, 'approve' | 'reject'>();
    if (pendingReview) {
      pendingReview.pendingAtoms.forEach((a) => newDec.set(a.tempId, 'reject'));
    } else if (result) {
      (result.inferredAtoms ?? []).forEach((a) => newDec.set(a.tempId, 'reject'));
    }
    setAtomDecisions(newDec);
  };

  const approvedCount = Array.from(atomDecisions.values()).filter(
    (d) => d === 'approve'
  ).length;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[900px] max-h-[90vh] overflow-hidden flex flex-col">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            Reconciliation Agent
            <Badge variant="secondary" className="text-xs">
              {step === 'config' && 'Configure'}
              {step === 'analyzing' && 'Analyzing...'}
              {step === 'review' && 'Review'}
              {step === 'apply' && 'Apply'}
              {step === 'complete' && 'Complete'}
            </Badge>
          </DialogTitle>
          <DialogDescription>
            Analyze your repository to discover orphan tests and infer Intent Atoms
          </DialogDescription>
        </DialogHeader>

        {/* Provider Status Bar */}
        <div className="flex items-center justify-between py-2 px-3 bg-muted/50 rounded-lg">
          <ProviderStatus compact showBudget={false} />
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto py-4">
          {/* Step: Config */}
          {step === 'config' && (
            <div className="space-y-4">
              {/* Source Mode */}
              <div className="space-y-2">
                <Label>Repository Source</Label>
                <Select
                  value={sourceMode}
                  onValueChange={(value) => setSourceMode(value as SourceMode)}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {githubConfigured && (
                      <SelectItem value="github">
                        GitHub — clone from {githubRepoLabel}
                      </SelectItem>
                    )}
                    <SelectItem value="browser">
                      Upload from Browser — read files from your machine
                    </SelectItem>
                  </SelectContent>
                </Select>
              </div>

              {/* GitHub Config (github mode) */}
              {sourceMode === 'github' && (
                <Card>
                  <CardContent className="pt-4 space-y-3">
                    <p className="text-sm text-muted-foreground">
                      Repository: <strong>{githubRepoLabel}</strong>
                    </p>
                    <div className="space-y-2">
                      <Label htmlFor="github-branch-wizard">Branch</Label>
                      <Input
                        id="github-branch-wizard"
                        placeholder="main"
                        value={githubBranch}
                        onChange={(e) => setGithubBranch(e.target.value)}
                      />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="github-sha-wizard">Commit SHA (optional)</Label>
                      <Input
                        id="github-sha-wizard"
                        placeholder="Leave blank for latest on branch"
                        value={githubCommitSha}
                        onChange={(e) => setGithubCommitSha(e.target.value)}
                      />
                    </div>
                  </CardContent>
                </Card>
              )}

              {/* Directory Picker (browser mode) */}
              {sourceMode === 'browser' && (
                <Card>
                  <CardContent className="pt-4 space-y-3">
                    <div className="flex items-center gap-3">
                      <Button
                        variant="outline"
                        onClick={handleBrowseDirectory}
                        disabled={isReadingFiles}
                      >
                        {isReadingFiles ? 'Reading files...' : uploadedFiles ? 'Re-scan Directory' : 'Browse Repository'}
                      </Button>
                      {uploadSummary && (
                        <p className="text-sm text-muted-foreground">
                          {uploadedDirectoryName && <code className="font-mono mr-2">{uploadedDirectoryName}</code>}
                          {uploadSummary}
                        </p>
                      )}
                    </div>
                    {!uploadedFiles && !uploadedManifest && (
                      <p className="text-xs text-muted-foreground">
                        Select your project folder. Files will be read in your browser and sent to the backend for analysis.
                        Excludes node_modules, .git, dist, and other build artifacts.
                      </p>
                    )}
                    {!uploadedFiles && uploadedManifest && (
                      <p className="text-xs text-yellow-600 dark:text-yellow-400">
                        File contents were cleared after page refresh. Click &quot;Browse Repository&quot; to reload.
                      </p>
                    )}
                  </CardContent>
                </Card>
              )}

              {/* Mode Selection */}
              <div className="space-y-2">
                <Label>Analysis Mode</Label>
                <Select
                  value={config.mode || 'full-scan'}
                  onValueChange={(value) =>
                    setConfig({ ...config, mode: value as ReconciliationMode })
                  }
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="full-scan">
                      Full Scan - Analyze all orphan tests
                    </SelectItem>
                    <SelectItem value="delta">
                      Delta - Only analyze changed tests
                    </SelectItem>
                  </SelectContent>
                </Select>
              </div>

              {/* Quality Threshold */}
              <div className="space-y-2">
                <Label>Quality Threshold</Label>
                <Input
                  type="number"
                  value={config.options?.qualityThreshold || 80}
                  onChange={(e) =>
                    setConfig({
                      ...config,
                      options: {
                        ...config.options,
                        qualityThreshold: parseInt(e.target.value) || 80,
                      },
                    })
                  }
                  min={0}
                  max={100}
                />
                <p className="text-xs text-muted-foreground">
                  Atoms below this score will be flagged for review
                </p>
              </div>

              {/* Max Tests */}
              <div className="space-y-2">
                <Label>Maximum Tests</Label>
                <Input
                  type="number"
                  value={config.options?.maxTests || 100}
                  onChange={(e) =>
                    setConfig({
                      ...config,
                      options: {
                        ...config.options,
                        maxTests: parseInt(e.target.value) || 100,
                      },
                    })
                  }
                  min={1}
                  max={1000}
                />
                <p className="text-xs text-muted-foreground">
                  Limit the number of tests to analyze
                </p>
              </div>

              {/* Options */}
              <div className="space-y-3">
                <div className="flex items-center gap-2">
                  <Checkbox
                    id="analyze-docs"
                    checked={config.options?.analyzeDocs !== false}
                    onCheckedChange={(checked) =>
                      setConfig({
                        ...config,
                        options: { ...config.options, analyzeDocs: !!checked },
                      })
                    }
                  />
                  <Label htmlFor="analyze-docs" className="cursor-pointer">
                    Analyze documentation for context enrichment
                  </Label>
                </div>

                <div className="flex items-center gap-2">
                  <Checkbox
                    id="require-review"
                    checked={config.options?.requireReview !== false}
                    onCheckedChange={(checked) =>
                      setConfig({
                        ...config,
                        options: { ...config.options, requireReview: !!checked },
                      })
                    }
                  />
                  <Label htmlFor="require-review" className="cursor-pointer">
                    Require human review before applying
                  </Label>
                </div>
              </div>

              {/* Exception Lane (Phase 16) */}
              <div className="space-y-2">
                <Label>Exception Lane</Label>
                <Select
                  value={config.options?.exceptionLane || 'normal'}
                  onValueChange={(value) =>
                    setConfig({
                      ...config,
                      options: {
                        ...config.options,
                        exceptionLane: value as 'normal' | 'hotfix-exception' | 'spike-exception',
                      },
                    })
                  }
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="normal">Normal (14-day convergence)</SelectItem>
                    <SelectItem value="hotfix-exception">
                      Hotfix Exception (3-day convergence)
                    </SelectItem>
                    <SelectItem value="spike-exception">
                      Spike Exception (7-day convergence)
                    </SelectItem>
                  </SelectContent>
                </Select>
                <p className="text-xs text-muted-foreground">
                  Exception lanes control drift convergence deadlines (relevant for CI-attested runs)
                </p>
              </div>

              {/* Exception Justification (required for hotfix/spike) */}
              {config.options?.exceptionLane &&
                config.options.exceptionLane !== 'normal' && (
                  <div className="space-y-2">
                    <Label>Exception Justification (Required)</Label>
                    <Textarea
                      placeholder="Explain why this exception lane is needed..."
                      value={config.options?.exceptionJustification || ''}
                      onChange={(e) =>
                        setConfig({
                          ...config,
                          options: {
                            ...config.options,
                            exceptionJustification: e.target.value,
                          },
                        })
                      }
                      rows={2}
                    />
                  </div>
                )}

              {/* Attestation Type Indicator */}
              <div className="flex items-center gap-2 p-3 bg-muted/50 rounded-lg">
                <div
                  className={cn(
                    'w-2 h-2 rounded-full',
                    config.options?.attestationType === 'ci-attested'
                      ? 'bg-green-500'
                      : 'bg-yellow-500'
                  )}
                />
                <span className="text-sm">
                  {config.options?.attestationType === 'ci-attested'
                    ? 'CI-Attested (will create drift records)'
                    : 'Local (advisory only, no drift tracking)'}
                </span>
              </div>

              {/* Advanced Options - Path Filtering */}
              <Collapsible className="space-y-2">
                <CollapsibleTrigger className="flex items-center gap-2 text-sm font-medium hover:text-primary transition-colors [&[data-state=open]>svg]:rotate-180">
                  <ChevronDown className="h-4 w-4 transition-transform duration-200" />
                  Advanced Options (Path Filtering)
                </CollapsibleTrigger>
                <CollapsibleContent className="space-y-4 pt-2">
                  {/* Root Directory */}
                  <div className="space-y-2">
                    <Label>Root Directory (optional)</Label>
                    <Input
                      placeholder="e.g., src/modules/auth"
                      value={config.rootDirectory || ''}
                      onChange={(e) =>
                        setConfig({
                          ...config,
                          rootDirectory: e.target.value || undefined,
                        })
                      }
                    />
                    <p className="text-xs text-muted-foreground">
                      Subdirectory to analyze. Leave empty for entire repository.
                    </p>
                  </div>

                  {/* Include Paths */}
                  <div className="space-y-2">
                    <Label>Include Paths</Label>
                    <Textarea
                      placeholder="e.g., src/modules/auth&#10;src/modules/users/**&#10;src/**/*.spec.ts"
                      value={config.options?.includePaths?.join('\n') || ''}
                      onChange={(e) => {
                        const paths = e.target.value
                          .split('\n')
                          .map((p) => p.trim())
                          .filter((p) => p.length > 0);
                        setConfig({
                          ...config,
                          options: {
                            ...config.options,
                            includePaths: paths.length > 0 ? paths : undefined,
                          },
                        });
                      }}
                      rows={3}
                      className="font-mono text-sm"
                    />
                    <p className="text-xs text-muted-foreground">
                      One path per line. Supports directory prefixes (src/modules) or glob patterns
                      (src/**/*.spec.ts). Only analyze tests under these paths.
                    </p>
                  </div>

                  {/* Exclude Paths */}
                  <div className="space-y-2">
                    <Label>Exclude Paths</Label>
                    <Textarea
                      placeholder="e.g., node_modules&#10;test/e2e/**&#10;**/*.e2e-spec.ts"
                      value={config.options?.excludePaths?.join('\n') || ''}
                      onChange={(e) => {
                        const paths = e.target.value
                          .split('\n')
                          .map((p) => p.trim())
                          .filter((p) => p.length > 0);
                        setConfig({
                          ...config,
                          options: {
                            ...config.options,
                            excludePaths: paths.length > 0 ? paths : undefined,
                          },
                        });
                      }}
                      rows={3}
                      className="font-mono text-sm"
                    />
                    <p className="text-xs text-muted-foreground">
                      One path per line. Supports directory prefixes or glob patterns. Skip tests
                      under these paths.
                    </p>
                  </div>
                </CollapsibleContent>
              </Collapsible>

              {/* Warnings */}
              {!canStart && (
                <div className="p-3 bg-yellow-50 text-yellow-800 dark:bg-yellow-950 dark:text-yellow-200 rounded-lg text-sm">
                  {!hasAvailableProvider
                    ? 'No LLM providers available. Please configure API keys or start Ollama.'
                    : 'Daily budget limit reached. Try again tomorrow or use local models.'}
                </div>
              )}
              {sourceMode === 'browser' && !uploadedFiles && canStart && (
                <div className="p-3 bg-yellow-50 text-yellow-800 dark:bg-yellow-950 dark:text-yellow-200 rounded-lg text-sm">
                  No repository loaded. Use the &quot;Browse Repository&quot; button above to select your project folder.
                </div>
              )}
            </div>
          )}

          {/* Step: Analyzing */}
          {step === 'analyzing' && (
            <div className="flex flex-col items-center justify-center py-12 space-y-4">
              <div className="w-12 h-12 border-4 border-primary border-t-transparent rounded-full animate-spin" />
              <p className="text-lg font-medium">Analyzing repository...</p>
              <p className="text-sm text-muted-foreground text-center max-w-md">
                {progressMessage}
              </p>
              <Progress value={progressPercent} className="w-64 h-2" />
              {progressPhase && (
                <p className="text-xs text-muted-foreground capitalize">
                  Phase: {progressPhase.replaceAll('_', ' ')}
                </p>
              )}
              <Button
                variant="destructive"
                size="sm"
                onClick={handleCancelRun}
                disabled={isCancelling || !runId}
              >
                {isCancelling ? 'Cancelling...' : 'Cancel Run'}
              </Button>
            </div>
          )}

          {/* Step: Review */}
          {step === 'review' && pendingReview && (
            <div className="space-y-4">
              {/* Summary */}
              <Card>
                <CardHeader className="p-4 pb-2">
                  <CardTitle className="text-sm">Review Required</CardTitle>
                </CardHeader>
                <CardContent className="p-4 pt-0">
                  <p className="text-sm text-muted-foreground mb-3">
                    {pendingReview.reason}
                  </p>
                  <div className="grid grid-cols-4 gap-4 text-sm">
                    <div>
                      <p className="text-muted-foreground">Total Atoms</p>
                      <p className="text-xl font-bold">{pendingReview.summary.totalAtoms}</p>
                    </div>
                    <div>
                      <p className="text-muted-foreground">Passing</p>
                      <p className="text-xl font-bold text-green-600">
                        {pendingReview.summary.passCount}
                      </p>
                    </div>
                    <div>
                      <p className="text-muted-foreground">Failing</p>
                      <p className="text-xl font-bold text-red-600">
                        {pendingReview.summary.failCount}
                      </p>
                    </div>
                    <div>
                      <p className="text-muted-foreground">Threshold</p>
                      <p className="text-xl font-bold">
                        {pendingReview.summary.qualityThreshold}
                      </p>
                    </div>
                  </div>
                </CardContent>
              </Card>

              {/* Bulk Actions */}
              <div className="flex items-center justify-between">
                <p className="text-sm text-muted-foreground">
                  {approvedCount} of {pendingReview.pendingAtoms.length} atoms approved
                </p>
                <div className="flex gap-2">
                  <Button size="sm" variant="outline" onClick={approveAllAtoms}>
                    Approve All
                  </Button>
                  <Button size="sm" variant="outline" onClick={rejectAllAtoms}>
                    Reject All
                  </Button>
                </div>
              </div>

              {/* Atoms */}
              <ScrollArea className="h-[350px] pr-4">
                <div className="space-y-3">
                  <h4 className="font-medium text-sm">Atoms ({pendingReview.pendingAtoms.length})</h4>
                  {pendingReview.pendingAtoms.map((atom) => (
                    <PendingAtomCard
                      key={atom.tempId}
                      atom={atom}
                      decision={atomDecisions.get(atom.tempId) || null}
                      onDecisionChange={(decision) => {
                        const newDec = new Map(atomDecisions);
                        newDec.set(atom.tempId, decision);
                        setAtomDecisions(newDec);
                      }}
                    />
                  ))}

                  {pendingReview.pendingMolecules.length > 0 && (
                    <>
                      <h4 className="font-medium text-sm mt-6">
                        Molecules ({pendingReview.pendingMolecules.length})
                      </h4>
                      {pendingReview.pendingMolecules.map((mol) => (
                        <PendingMoleculeCard
                          key={mol.tempId}
                          molecule={mol}
                          decision={moleculeDecisions.get(mol.tempId) || null}
                          onDecisionChange={(decision) => {
                            const newDec = new Map(moleculeDecisions);
                            newDec.set(mol.tempId, decision);
                            setMoleculeDecisions(newDec);
                          }}
                        />
                      ))}
                    </>
                  )}
                </div>
              </ScrollArea>
            </div>
          )}

          {/* Step: Apply */}
          {step === 'apply' && result && (
            <div className="space-y-4">
              {/* Summary */}
              <Card>
                <CardHeader className="p-4 pb-2">
                  <CardTitle className="text-sm">Ready to Apply</CardTitle>
                </CardHeader>
                <CardContent className="p-4 pt-0">
                  <div className="grid grid-cols-3 gap-4 text-sm">
                    <div>
                      <p className="text-muted-foreground">Atoms</p>
                      <p className="text-xl font-bold">{result.summary.inferredAtomsCount}</p>
                    </div>
                    <div>
                      <p className="text-muted-foreground">Molecules</p>
                      <p className="text-xl font-bold">{result.summary.inferredMoleculesCount}</p>
                    </div>
                    <div>
                      <p className="text-muted-foreground">Approved</p>
                      <p className="text-xl font-bold text-green-600">{approvedCount}</p>
                    </div>
                  </div>
                  {result.errors.length > 0 && (
                    <Accordion type="single" collapsible className="mt-4">
                      <AccordionItem value="errors">
                        <AccordionTrigger className="text-sm text-red-600">
                          {result.errors.length} error(s) during analysis
                        </AccordionTrigger>
                        <AccordionContent>
                          <ul className="text-xs text-red-600 space-y-1">
                            {result.errors.map((err, i) => (
                              <li key={i}>{err}</li>
                            ))}
                          </ul>
                        </AccordionContent>
                      </AccordionItem>
                    </Accordion>
                  )}
                </CardContent>
              </Card>

              {/* Options */}
              <Card>
                <CardContent className="p-4">
                  <p className="text-sm mb-3">
                    Click &quot;Apply&quot; to create {approvedCount} atoms and their molecules in
                    the database.
                  </p>
                  <div className="flex items-center gap-2">
                    <Checkbox id="inject-annotations" />
                    <Label htmlFor="inject-annotations" className="cursor-pointer text-sm">
                      Inject @atom annotations into test files
                    </Label>
                  </div>
                </CardContent>
              </Card>
            </div>
          )}

          {/* Step: Complete */}
          {step === 'complete' && (
            <div className="flex flex-col items-center justify-center py-12 space-y-4">
              <div className="w-16 h-16 rounded-full bg-green-100 dark:bg-green-900 flex items-center justify-center">
                <svg
                  className="w-8 h-8 text-green-600"
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M5 13l4 4L19 7"
                  />
                </svg>
              </div>
              <p className="text-lg font-medium">Reconciliation Complete!</p>
              <p className="text-sm text-muted-foreground text-center max-w-md">
                Your atoms have been created and are ready to use. You can view them in the
                Atoms list or the Pending Review page.
              </p>
            </div>
          )}
        </div>

        <DialogFooter className="flex justify-between sm:justify-between">
          <div className="flex gap-2">
            <Button variant="outline" onClick={() => handleClose()}>
              {step === 'complete' ? 'Done' : 'Cancel'}
            </Button>
            {(step === 'review' || step === 'apply') && (
              <Button
                variant="ghost"
                className="text-red-600 hover:text-red-700 hover:bg-red-50"
                onClick={handleDiscard}
              >
                Discard Progress
              </Button>
            )}
          </div>

          <div className="flex gap-2">
            {step === 'config' && (
              <Button
                onClick={handleStartAnalysis}
                disabled={
                  !canStart ||
                  startMutation.isPending ||
                  startPreReadMutation.isPending ||
                  (sourceMode === 'browser' && !uploadedFiles)
                }
              >
                {startMutation.isPending || startPreReadMutation.isPending
                  ? 'Starting...'
                  : 'Start Analysis'}
              </Button>
            )}

            {step === 'review' && (
              <Button
                onClick={handleSubmitReview}
                disabled={submitReviewMutation.isPending || approvedCount === 0}
              >
                {submitReviewMutation.isPending ? 'Submitting...' : 'Submit Review'}
              </Button>
            )}

            {step === 'apply' && (
              <>
                {showChangeSetInput ? (
                  <>
                    <Input
                      placeholder="Change set name (optional)"
                      value={changeSetName}
                      onChange={(e) => setChangeSetName(e.target.value)}
                      className="w-48"
                    />
                    <Button
                      variant="outline"
                      onClick={() => setShowChangeSetInput(false)}
                    >
                      Cancel
                    </Button>
                    <Button
                      onClick={handleCreateChangeSet}
                      disabled={createChangeSetMutation.isPending || approvedCount === 0}
                    >
                      {createChangeSetMutation.isPending ? 'Creating...' : 'Create'}
                    </Button>
                  </>
                ) : (
                  <>
                    <Button
                      variant="outline"
                      onClick={() => setShowChangeSetInput(true)}
                      disabled={applyMutation.isPending || approvedCount === 0}
                    >
                      Create Change Set
                    </Button>
                    <Button
                      variant="outline"
                      onClick={() => handleApply(false)}
                      disabled={applyMutation.isPending || approvedCount === 0}
                    >
                      Apply Directly
                    </Button>
                    <Button
                      onClick={() => handleApply(true)}
                      disabled={applyMutation.isPending || approvedCount === 0}
                    >
                      {applyMutation.isPending ? 'Applying...' : 'Apply + Annotate'}
                    </Button>
                  </>
                )}
              </>
            )}
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

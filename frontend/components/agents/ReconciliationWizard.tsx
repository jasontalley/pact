'use client';

import { useState, useEffect } from 'react';
import { cn } from '@/lib/utils';
import { useProviders, useBudgetStatus } from '@/hooks/llm';
import { ProviderStatus } from './ProviderStatus';
import { QualityBadge } from '@/components/quality/QualityBadge';
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
  useStartReconciliation,
  useSubmitReview,
  useApplyRecommendations,
} from '@/hooks/reconciliation';
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
        decision === 'approve' && 'border-green-500 bg-green-50 dark:bg-green-950/20',
        decision === 'reject' && 'border-red-500 bg-red-50 dark:bg-red-950/20'
      )}
    >
      <CardContent className="p-4">
        <div className="flex items-start justify-between gap-3">
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 mb-2">
              <Badge variant="outline" className="capitalize">
                {atom.category}
              </Badge>
              <QualityBadge score={atom.qualityScore} />
              {atom.passes ? (
                <Badge variant="default" className="bg-green-600 text-xs">
                  Passes
                </Badge>
              ) : (
                <Badge variant="destructive" className="text-xs">
                  Fails Threshold
                </Badge>
              )}
            </div>
            <p className="text-sm font-medium mb-2">{atom.description}</p>
            {atom.issues.length > 0 && (
              <div className="text-xs text-muted-foreground">
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
          <div className="flex flex-col gap-2">
            <Button
              size="sm"
              variant={decision === 'approve' ? 'default' : 'outline'}
              className={cn(
                'w-20',
                decision === 'approve' && 'bg-green-600 hover:bg-green-700'
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
        decision === 'approve' && 'border-green-500 bg-green-50 dark:bg-green-950/20',
        decision === 'reject' && 'border-red-500 bg-red-50 dark:bg-red-950/20'
      )}
    >
      <CardContent className="p-4">
        <div className="flex items-start justify-between gap-3">
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 mb-2">
              <Badge variant="secondary">Molecule</Badge>
              <span
                className={cn(
                  'text-xs font-medium',
                  confidencePercent >= 80
                    ? 'text-green-600'
                    : confidencePercent >= 60
                    ? 'text-yellow-600'
                    : 'text-red-600'
                )}
              >
                {confidencePercent}% confidence
              </span>
              <span className="text-xs text-muted-foreground">
                {molecule.atomCount} atoms
              </span>
            </div>
            <p className="text-sm font-bold mb-1">{molecule.name}</p>
            <p className="text-sm text-muted-foreground">{molecule.description}</p>
          </div>
          <div className="flex flex-col gap-2">
            <Button
              size="sm"
              variant={decision === 'approve' ? 'default' : 'outline'}
              className={cn(
                'w-20',
                decision === 'approve' && 'bg-green-600 hover:bg-green-700'
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

  const startMutation = useStartReconciliation();
  const submitReviewMutation = useSubmitReview();
  const applyMutation = useApplyRecommendations();

  const hasAvailableProvider = providers?.availableCount ? providers.availableCount > 0 : false;
  const canStart = hasAvailableProvider && !isDailyBudgetExceeded;

  // Handle start analysis
  const handleStartAnalysis = () => {
    setStep('analyzing');
    startMutation.mutate(config, {
      onSuccess: (data: AnalysisStartResult) => {
        setRunId(data.runId);

        if (data.completed && data.result) {
          // No review needed, go straight to apply
          setResult(data.result);
          setStep('apply');
          initializeApplyDecisions(data.result);
        } else if (data.pendingReview) {
          // Review needed
          setPendingReview(data.pendingReview);
          setStep('review');
          initializeReviewDecisions(data.pendingReview);
        }
      },
      onError: () => {
        setStep('config');
      },
    });
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
    res.inferredAtoms.forEach((atom) => {
      const passes = (atom.qualityScore || 0) >= (config.options?.qualityThreshold || 80);
      atomDec.set(atom.tempId, passes ? 'approve' : 'reject');
    });
    setAtomDecisions(atomDec);

    const molDec = new Map<string, 'approve' | 'reject'>();
    res.inferredMolecules.forEach((mol) => {
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
      result.inferredAtoms.forEach((a) => newDec.set(a.tempId, 'approve'));
    }
    setAtomDecisions(newDec);
  };

  const rejectAllAtoms = () => {
    const newDec = new Map<string, 'approve' | 'reject'>();
    if (pendingReview) {
      pendingReview.pendingAtoms.forEach((a) => newDec.set(a.tempId, 'reject'));
    } else if (result) {
      result.inferredAtoms.forEach((a) => newDec.set(a.tempId, 'reject'));
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
                    <Label>Include Paths (glob patterns)</Label>
                    <Textarea
                      placeholder="e.g., src/**/*.spec.ts&#10;test/**/*.test.ts"
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
                      One pattern per line. Only analyze tests matching these patterns.
                    </p>
                  </div>

                  {/* Exclude Paths */}
                  <div className="space-y-2">
                    <Label>Exclude Paths (glob patterns)</Label>
                    <Textarea
                      placeholder="e.g., **/node_modules/**&#10;**/*.e2e-spec.ts"
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
                      One pattern per line. Skip tests matching these patterns.
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
            </div>
          )}

          {/* Step: Analyzing */}
          {step === 'analyzing' && (
            <div className="flex flex-col items-center justify-center py-12 space-y-4">
              <div className="w-12 h-12 border-4 border-primary border-t-transparent rounded-full animate-spin" />
              <p className="text-lg font-medium">Analyzing repository...</p>
              <p className="text-sm text-muted-foreground text-center max-w-md">
                Discovering orphan tests, building context, and inferring Intent Atoms.
                This may take a few minutes.
              </p>
              <Progress value={50} className="w-64 h-2" />
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
                Your atoms have been created and are ready to use. You can view them on the
                Canvas or in the Atoms list.
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
                disabled={!canStart || startMutation.isPending}
              >
                {startMutation.isPending ? 'Starting...' : 'Start Analysis'}
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
                <Button
                  variant="outline"
                  onClick={() => handleApply(false)}
                  disabled={applyMutation.isPending || approvedCount === 0}
                >
                  Apply
                </Button>
                <Button
                  onClick={() => handleApply(true)}
                  disabled={applyMutation.isPending || approvedCount === 0}
                >
                  {applyMutation.isPending ? 'Applying...' : 'Apply + Annotate'}
                </Button>
              </>
            )}
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

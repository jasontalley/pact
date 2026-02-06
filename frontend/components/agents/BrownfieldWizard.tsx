'use client';

import { useState } from 'react';
import { cn } from '@/lib/utils';
import { useProviders, useCostEstimate, useBudgetStatus } from '@/hooks/llm';
import { apiClient } from '@/lib/api/client';
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
import { toast } from 'sonner';
import { useMutation } from '@tanstack/react-query';

/**
 * Types matching the backend DTOs
 */
interface BrownfieldAnalysisRequest {
  rootDirectory?: string;
  includePatterns?: string[];
  excludePatterns?: string[];
  analyzeDocumentation?: boolean;
  autoCreateAtoms?: boolean;
  maxTests?: number;
  useCache?: boolean;
  validateQuality?: boolean;
}

interface OrphanTestInfo {
  filePath: string;
  testName: string;
  lineNumber: number;
  testCode: string;
  relatedSourceFile?: string;
}

interface InferredAtom {
  description: string;
  category: string;
  confidence: number;
  reasoning: string;
  sourceTest: OrphanTestInfo;
  relatedDocs?: string[];
  observableOutcomes?: string[];
}

interface BrownfieldAnalysisResult {
  success: boolean;
  totalOrphanTests: number;
  inferredAtomsCount: number;
  createdAtomsCount: number;
  inferredAtoms: InferredAtom[];
  unanalyzedTests: OrphanTestInfo[];
  summary: string;
  metadata: {
    rootDirectory: string;
    testFilesAnalyzed: number;
    documentationFilesAnalyzed: number;
    analysisDurationMs: number;
  };
}

interface BrownfieldWizardProps {
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
}

/**
 * Inferred Atom Card Component
 */
function InferredAtomCard({
  atom,
  selected,
  onSelect,
}: {
  atom: InferredAtom;
  selected: boolean;
  onSelect: (selected: boolean) => void;
}) {
  const confidencePercent = Math.round(atom.confidence * 100);

  return (
    <Card className={cn('transition-colors', selected && 'border-primary')}>
      <CardContent className="p-4">
        <div className="flex items-start gap-3">
          <Checkbox
            checked={selected}
            onCheckedChange={onSelect}
            className="mt-1"
          />
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 mb-2">
              <Badge variant="outline" className="capitalize">
                {atom.category}
              </Badge>
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
            </div>
            <p className="text-sm font-medium mb-2">{atom.description}</p>
            <div className="text-xs text-muted-foreground space-y-1">
              <p>
                From: <code className="bg-muted px-1 rounded">{atom.sourceTest.testName}</code>
              </p>
              <p className="truncate">
                File: {atom.sourceTest.filePath}:{atom.sourceTest.lineNumber}
              </p>
            </div>
            {atom.observableOutcomes && atom.observableOutcomes.length > 0 && (
              <div className="mt-2">
                <p className="text-xs font-medium text-muted-foreground mb-1">
                  Observable Outcomes:
                </p>
                <ul className="text-xs text-muted-foreground list-disc list-inside">
                  {atom.observableOutcomes.slice(0, 3).map((outcome, i) => (
                    <li key={i} className="truncate">
                      {outcome}
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

/**
 * BrownfieldWizard - Analyze existing tests to infer atoms
 *
 * Features:
 * - Configure analysis options
 * - Progress tracking during analysis
 * - Review inferred atoms with confidence scores
 * - Bulk accept/reject interface
 * - Link to existing atoms option
 */
export function BrownfieldWizard({ open, onOpenChange }: BrownfieldWizardProps) {
  const [step, setStep] = useState<'config' | 'analyzing' | 'results'>('config');
  const [result, setResult] = useState<BrownfieldAnalysisResult | null>(null);
  const [selectedAtoms, setSelectedAtoms] = useState<Set<number>>(new Set());

  // Configuration state
  const [config, setConfig] = useState<BrownfieldAnalysisRequest>({
    includePatterns: ['**/*.spec.ts', '**/*.test.ts'],
    excludePatterns: ['**/node_modules/**', '**/dist/**'],
    analyzeDocumentation: true,
    autoCreateAtoms: false,
    maxTests: 50,
    validateQuality: true,
  });

  const { data: providers } = useProviders();
  const { isDailyBudgetExceeded } = useBudgetStatus();
  const { data: costEstimate } = useCostEstimate('analysis', 2000, 1000);

  const analyzeMutation = useMutation({
    mutationFn: async (request: BrownfieldAnalysisRequest) => {
      const response = await apiClient.post<BrownfieldAnalysisResult>(
        '/agents/brownfield-analysis/analyze',
        request
      );
      return response.data;
    },
    onSuccess: (data) => {
      setResult(data);
      setStep('results');
      // Select all high-confidence atoms by default
      const highConfidence = new Set<number>();
      data.inferredAtoms.forEach((atom, i) => {
        if (atom.confidence >= 0.7) {
          highConfidence.add(i);
        }
      });
      setSelectedAtoms(highConfidence);
      toast.success(`Found ${data.inferredAtomsCount} potential atoms`);
    },
    onError: (error: Error) => {
      toast.error(`Analysis failed: ${error.message}`);
      setStep('config');
    },
  });

  const handleStartAnalysis = () => {
    setStep('analyzing');
    analyzeMutation.mutate(config);
  };

  const handleSelectAll = () => {
    if (!result) return;
    const allIndices = new Set<number>(result.inferredAtoms.map((_, i) => i));
    setSelectedAtoms(allIndices);
  };

  const handleDeselectAll = () => {
    setSelectedAtoms(new Set());
  };

  const handleClose = () => {
    onOpenChange?.(false);
    // Reset after a delay to avoid visual flash
    setTimeout(() => {
      setStep('config');
      setResult(null);
      setSelectedAtoms(new Set());
    }, 200);
  };

  const handleCreateSelected = () => {
    if (!result) return;

    // TODO: Implement bulk creation API
    const selected = result.inferredAtoms.filter((_, i) => selectedAtoms.has(i));
    toast.success(`Creating ${selected.length} atoms (feature coming soon)`);
    handleClose();
  };

  const hasAvailableProvider = providers?.availableCount ? providers.availableCount > 0 : false;
  const canAnalyze = hasAvailableProvider && !isDailyBudgetExceeded;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[800px] max-h-[90vh] overflow-hidden flex flex-col">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            Brownfield Analysis
            <Badge variant="secondary" className="text-xs">
              {step === 'config' && 'Configure'}
              {step === 'analyzing' && 'Analyzing...'}
              {step === 'results' && 'Results'}
            </Badge>
          </DialogTitle>
          <DialogDescription>
            Analyze existing tests to infer intent atoms from your codebase
          </DialogDescription>
        </DialogHeader>

        {/* Provider Status Bar */}
        <div className="flex items-center justify-between py-2 px-3 bg-muted/50 rounded-lg">
          <ProviderStatus compact showBudget={false} />
          {costEstimate && (
            <div className="text-xs text-muted-foreground">
              Est. cost: {costEstimate.formattedMinCost} - {costEstimate.formattedMaxCost}
            </div>
          )}
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto py-4">
          {/* Step: Config */}
          {step === 'config' && (
            <div className="space-y-4">
              {/* Include Patterns */}
              <div className="space-y-2">
                <Label>Test File Patterns</Label>
                <Input
                  value={config.includePatterns?.join(', ') || ''}
                  onChange={(e) =>
                    setConfig({
                      ...config,
                      includePatterns: e.target.value.split(',').map((s) => s.trim()),
                    })
                  }
                  placeholder="**/*.spec.ts, **/*.test.ts"
                />
                <p className="text-xs text-muted-foreground">
                  Glob patterns to match test files (comma-separated)
                </p>
              </div>

              {/* Exclude Patterns */}
              <div className="space-y-2">
                <Label>Exclude Patterns</Label>
                <Input
                  value={config.excludePatterns?.join(', ') || ''}
                  onChange={(e) =>
                    setConfig({
                      ...config,
                      excludePatterns: e.target.value.split(',').map((s) => s.trim()),
                    })
                  }
                  placeholder="**/node_modules/**, **/dist/**"
                />
                <p className="text-xs text-muted-foreground">
                  Patterns to exclude from analysis
                </p>
              </div>

              {/* Max Tests */}
              <div className="space-y-2">
                <Label>Maximum Tests</Label>
                <Input
                  type="number"
                  value={config.maxTests || 50}
                  onChange={(e) =>
                    setConfig({ ...config, maxTests: parseInt(e.target.value) || 50 })
                  }
                  min={1}
                  max={500}
                />
                <p className="text-xs text-muted-foreground">
                  Safety limit to prevent excessive processing
                </p>
              </div>

              {/* Options */}
              <div className="space-y-3">
                <div className="flex items-center gap-2">
                  <Checkbox
                    id="analyze-docs"
                    checked={config.analyzeDocumentation}
                    onCheckedChange={(checked) =>
                      setConfig({ ...config, analyzeDocumentation: !!checked })
                    }
                  />
                  <Label htmlFor="analyze-docs" className="cursor-pointer">
                    Analyze documentation (README, docs/)
                  </Label>
                </div>

                <div className="flex items-center gap-2">
                  <Checkbox
                    id="validate-quality"
                    checked={config.validateQuality}
                    onCheckedChange={(checked) =>
                      setConfig({ ...config, validateQuality: !!checked })
                    }
                  />
                  <Label htmlFor="validate-quality" className="cursor-pointer">
                    Validate atom quality (adds extra LLM calls)
                  </Label>
                </div>
              </div>

              {/* Warnings */}
              {!canAnalyze && (
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
              <p className="text-sm text-muted-foreground">
                This may take a few minutes depending on codebase size
              </p>
              <Progress value={30} className="w-64 h-2" />
            </div>
          )}

          {/* Step: Results */}
          {step === 'results' && result && (
            <div className="space-y-4">
              {/* Summary */}
              <Card>
                <CardHeader className="p-4 pb-2">
                  <CardTitle className="text-sm">Analysis Summary</CardTitle>
                </CardHeader>
                <CardContent className="p-4 pt-0">
                  <div className="grid grid-cols-2 gap-4 text-sm">
                    <div>
                      <p className="text-muted-foreground">Orphan Tests Found</p>
                      <p className="text-xl font-bold">{result.totalOrphanTests}</p>
                    </div>
                    <div>
                      <p className="text-muted-foreground">Atoms Inferred</p>
                      <p className="text-xl font-bold text-green-600">
                        {result.inferredAtomsCount}
                      </p>
                    </div>
                    <div>
                      <p className="text-muted-foreground">Test Files Analyzed</p>
                      <p className="font-medium">{result.metadata.testFilesAnalyzed}</p>
                    </div>
                    <div>
                      <p className="text-muted-foreground">Analysis Time</p>
                      <p className="font-medium">
                        {(result.metadata.analysisDurationMs / 1000).toFixed(1)}s
                      </p>
                    </div>
                  </div>
                  <p className="text-sm text-muted-foreground mt-3">{result.summary}</p>
                </CardContent>
              </Card>

              {/* Selection Controls */}
              <div className="flex items-center justify-between">
                <p className="text-sm text-muted-foreground">
                  {selectedAtoms.size} of {result.inferredAtoms.length} atoms selected
                </p>
                <div className="flex gap-2">
                  <Button size="sm" variant="outline" onClick={handleSelectAll}>
                    Select All
                  </Button>
                  <Button size="sm" variant="outline" onClick={handleDeselectAll}>
                    Deselect All
                  </Button>
                </div>
              </div>

              {/* Inferred Atoms */}
              <ScrollArea className="h-[300px] pr-4">
                <div className="space-y-3">
                  {result.inferredAtoms.map((atom, index) => (
                    <InferredAtomCard
                      key={index}
                      atom={atom}
                      selected={selectedAtoms.has(index)}
                      onSelect={(selected) => {
                        const newSelected = new Set(selectedAtoms);
                        if (selected) {
                          newSelected.add(index);
                        } else {
                          newSelected.delete(index);
                        }
                        setSelectedAtoms(newSelected);
                      }}
                    />
                  ))}
                </div>
              </ScrollArea>

              {/* Unanalyzed Tests */}
              {result.unanalyzedTests.length > 0 && (
                <Accordion type="single" collapsible>
                  <AccordionItem value="unanalyzed">
                    <AccordionTrigger className="text-sm">
                      Unanalyzed Tests ({result.unanalyzedTests.length})
                    </AccordionTrigger>
                    <AccordionContent>
                      <div className="space-y-2">
                        {result.unanalyzedTests.map((test, i) => (
                          <div
                            key={i}
                            className="text-xs p-2 bg-muted rounded"
                          >
                            <p className="font-medium">{test.testName}</p>
                            <p className="text-muted-foreground truncate">
                              {test.filePath}:{test.lineNumber}
                            </p>
                          </div>
                        ))}
                      </div>
                    </AccordionContent>
                  </AccordionItem>
                </Accordion>
              )}
            </div>
          )}
        </div>

        <DialogFooter className="flex justify-between sm:justify-between">
          <Button variant="outline" onClick={handleClose}>
            {step === 'results' ? 'Close' : 'Cancel'}
          </Button>

          <div className="flex gap-2">
            {step === 'config' && (
              <Button onClick={handleStartAnalysis} disabled={!canAnalyze}>
                Start Analysis
              </Button>
            )}

            {step === 'results' && (
              <Button
                onClick={handleCreateSelected}
                disabled={selectedAtoms.size === 0}
              >
                Create {selectedAtoms.size} Atom{selectedAtoms.size !== 1 ? 's' : ''}
              </Button>
            )}
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

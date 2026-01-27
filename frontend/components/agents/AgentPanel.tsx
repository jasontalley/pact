'use client';

import { useState } from 'react';
import { cn } from '@/lib/utils';
import { useProviders, useHasAvailableProviders } from '@/hooks/llm';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from '@/components/ui/collapsible';
import { Badge } from '@/components/ui/badge';
import { ProviderStatus } from './ProviderStatus';
import { AtomizationWizard } from './AtomizationWizard';
import { RefinementPanel } from './RefinementPanel';
import { BrownfieldWizard } from './BrownfieldWizard';

/**
 * Agent type definitions
 */
export interface AgentConfig {
  id: string;
  name: string;
  description: string;
  icon: React.ReactNode;
  taskType: string;
  requiresLLM: boolean;
}

/**
 * Available agents configuration
 */
const AGENTS: AgentConfig[] = [
  {
    id: 'atomization',
    name: 'Atomization Agent',
    description: 'Analyze raw intent and generate atomic, testable requirements',
    icon: <AtomIcon />,
    taskType: 'atomization',
    requiresLLM: true,
  },
  {
    id: 'refinement',
    name: 'Refinement Agent',
    description: 'Improve atom quality scores with targeted suggestions',
    icon: <RefineIcon />,
    taskType: 'refinement',
    requiresLLM: true,
  },
  {
    id: 'brownfield',
    name: 'Brownfield Agent',
    description: 'Analyze existing tests to infer and generate atoms',
    icon: <AnalyzeIcon />,
    taskType: 'analysis',
    requiresLLM: true,
  },
  {
    id: 'translation',
    name: 'Validator Translation',
    description: 'Convert validators between formats (Zod, Joi, JSON Schema)',
    icon: <TranslateIcon />,
    taskType: 'translation',
    requiresLLM: true,
  },
];

/**
 * Simple icon components
 */
function AtomIcon() {
  return (
    <svg className="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <circle cx="12" cy="12" r="3" />
      <ellipse cx="12" cy="12" rx="9" ry="4" transform="rotate(45 12 12)" />
      <ellipse cx="12" cy="12" rx="9" ry="4" transform="rotate(-45 12 12)" />
    </svg>
  );
}

function RefineIcon() {
  return (
    <svg className="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z" />
    </svg>
  );
}

function AnalyzeIcon() {
  return (
    <svg className="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <path d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
      <path d="M10 10l4 4" />
    </svg>
  );
}

function TranslateIcon() {
  return (
    <svg className="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <path d="M3 5h12M9 3v2m1.048 9.5A18.022 18.022 0 016.412 9m6.088 9h7M11 21l5-10 5 10M12.751 5C11.783 10.77 8.07 15.61 3 18.129" />
    </svg>
  );
}

function ChevronIcon({ open }: { open: boolean }) {
  return (
    <svg
      className={cn('w-4 h-4 transition-transform', open && 'rotate-180')}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
    >
      <path d="M19 9l-7 7-7-7" />
    </svg>
  );
}

interface AgentCardProps {
  agent: AgentConfig;
  onSelect: (agent: AgentConfig) => void;
  disabled: boolean;
}

/**
 * Individual agent card
 */
function AgentCard({ agent, onSelect, disabled }: AgentCardProps) {
  return (
    <Card
      className={cn(
        'cursor-pointer transition-colors hover:bg-accent/50',
        disabled && 'opacity-50 cursor-not-allowed'
      )}
      onClick={() => !disabled && onSelect(agent)}
    >
      <CardHeader className="p-4">
        <div className="flex items-center gap-3">
          <div
            className={cn(
              'p-2 rounded-lg',
              disabled
                ? 'bg-gray-100 text-gray-400 dark:bg-gray-800'
                : 'bg-primary/10 text-primary'
            )}
          >
            {agent.icon}
          </div>
          <div className="flex-1 min-w-0">
            <CardTitle className="text-sm font-medium">{agent.name}</CardTitle>
            <CardDescription className="text-xs line-clamp-1">
              {agent.description}
            </CardDescription>
          </div>
          {agent.requiresLLM && (
            <Badge variant="secondary" className="text-[10px] px-1.5">
              AI
            </Badge>
          )}
        </div>
      </CardHeader>
    </Card>
  );
}

interface AgentPanelProps {
  className?: string;
  defaultOpen?: boolean;
  onAgentSelect?: (agent: AgentConfig) => void;
}

/**
 * Agent Panel Component
 *
 * A collapsible panel that lists available Pact agents and allows
 * users to invoke them. Shows provider status and enables/disables
 * agents based on LLM availability.
 */
export function AgentPanel({
  className,
  defaultOpen = true,
  onAgentSelect,
}: AgentPanelProps) {
  const [isOpen, setIsOpen] = useState(defaultOpen);
  const [selectedAgent, setSelectedAgent] = useState<AgentConfig | null>(null);
  const hasProviders = useHasAvailableProviders();

  const handleAgentSelect = (agent: AgentConfig) => {
    setSelectedAgent(agent);
    onAgentSelect?.(agent);
  };

  const handleDialogClose = () => {
    setSelectedAgent(null);
  };

  return (
    <div className={cn('w-full', className)}>
      <Collapsible open={isOpen} onOpenChange={setIsOpen}>
        <CollapsibleTrigger asChild>
          <Button
            variant="ghost"
            className="w-full flex items-center justify-between p-3 h-auto"
          >
            <div className="flex items-center gap-2">
              <span className="font-medium">AI Agents</span>
              <Badge variant="secondary" className="text-[10px]">
                {AGENTS.length}
              </Badge>
            </div>
            <ChevronIcon open={isOpen} />
          </Button>
        </CollapsibleTrigger>
        <CollapsibleContent className="space-y-2 pt-2">
          {/* Provider Status */}
          <div className="px-3 pb-2">
            <ProviderStatus compact showBudget={false} />
          </div>

          {/* Agent Cards */}
          <div className="space-y-2 px-2">
            {AGENTS.map((agent) => (
              <AgentCard
                key={agent.id}
                agent={agent}
                onSelect={handleAgentSelect}
                disabled={agent.requiresLLM && !hasProviders}
              />
            ))}
          </div>

          {!hasProviders && (
            <p className="text-xs text-muted-foreground px-3 py-2">
              No LLM providers available. Check your API keys or start Ollama.
            </p>
          )}
        </CollapsibleContent>
      </Collapsible>

      {/* Agent-specific Wizards */}
      <AtomizationWizard
        open={selectedAgent?.id === 'atomization'}
        onOpenChange={(open) => !open && handleDialogClose()}
      />

      <RefinementPanel
        atomId={null}
        open={selectedAgent?.id === 'refinement'}
        onOpenChange={(open) => !open && handleDialogClose()}
      />

      <BrownfieldWizard
        open={selectedAgent?.id === 'brownfield'}
        onOpenChange={(open) => !open && handleDialogClose()}
      />

      {/* Translation Agent - placeholder for now (minimal UI needed) */}
      {selectedAgent?.id === 'translation' && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center" onClick={handleDialogClose}>
          <Card className="max-w-md mx-4" onClick={(e) => e.stopPropagation()}>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                {selectedAgent.icon}
                {selectedAgent.name}
              </CardTitle>
              <CardDescription>{selectedAgent.description}</CardDescription>
            </CardHeader>
            <CardContent>
              <p className="text-sm text-muted-foreground mb-4">
                Validator translation is available through the Validators page. Navigate to a validator to translate between formats.
              </p>
              <Button variant="outline" onClick={handleDialogClose}>
                Close
              </Button>
            </CardContent>
          </Card>
        </div>
      )}
    </div>
  );
}

/**
 * Floating Agent Button
 *
 * A floating action button that opens the agent panel as a popover.
 */
export function AgentButton({ className }: { className?: string }) {
  const [isOpen, setIsOpen] = useState(false);
  const hasProviders = useHasAvailableProviders();

  return (
    <div className={cn('relative', className)}>
      <Button
        variant="default"
        size="icon"
        className={cn(
          'rounded-full w-12 h-12 shadow-lg',
          !hasProviders && 'opacity-50'
        )}
        onClick={() => setIsOpen(!isOpen)}
      >
        <AtomIcon />
      </Button>

      {isOpen && (
        <Card className="absolute bottom-16 right-0 w-80 shadow-lg z-50">
          <AgentPanel defaultOpen />
        </Card>
      )}
    </div>
  );
}

// Export agent configurations for use in other components
export { AGENTS };

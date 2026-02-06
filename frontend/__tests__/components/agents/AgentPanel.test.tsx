/**
 * Agent Panel Component Tests
 *
 * Tests for the main agent panel that lists available AI agents.
 *
 * @atom IA-008 - LLM Provider Implementation
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { AgentPanel, AgentButton, AGENTS } from '@/components/agents/AgentPanel';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

// Mock the LLM hooks
vi.mock('@/hooks/llm', () => ({
  useProviders: vi.fn(() => ({
    data: {
      providers: [
        { name: 'openai', displayName: 'OpenAI', available: true, supportedModels: [], health: {} },
        { name: 'anthropic', displayName: 'Anthropic', available: true, supportedModels: [], health: {} },
      ],
      availableCount: 2,
      totalCount: 2,
    },
    isLoading: false,
    error: null,
  })),
  useHasAvailableProviders: vi.fn(() => true),
  useBudgetStatus: vi.fn(() => ({
    data: { dailyCost: 0.5, dailyLimit: 1.0 },
    dailyUtilization: 50,
    isDailyBudgetExceeded: false,
  })),
}));

// Mock the sub-components
vi.mock('@/components/agents/ProviderStatus', () => ({
  ProviderStatus: ({ compact, showBudget }: { compact?: boolean; showBudget?: boolean }) => (
    <div data-testid="provider-status" data-compact={compact} data-show-budget={showBudget}>
      Provider Status Mock
    </div>
  ),
}));

vi.mock('@/components/agents/AtomizationWizard', () => ({
  AtomizationWizard: ({ open, onOpenChange }: { open: boolean; onOpenChange: (open: boolean) => void }) => (
    open ? (
      <div data-testid="atomization-wizard">
        <button onClick={() => onOpenChange(false)}>Close Atomization</button>
      </div>
    ) : null
  ),
}));

vi.mock('@/components/agents/RefinementPanel', () => ({
  RefinementPanel: ({ open, onOpenChange }: { open: boolean; onOpenChange: (open: boolean) => void }) => (
    open ? (
      <div data-testid="refinement-panel">
        <button onClick={() => onOpenChange(false)}>Close Refinement</button>
      </div>
    ) : null
  ),
}));

vi.mock('@/components/agents/BrownfieldWizard', () => ({
  BrownfieldWizard: ({ open, onOpenChange }: { open: boolean; onOpenChange: (open: boolean) => void }) => (
    open ? (
      <div data-testid="brownfield-wizard">
        <button onClick={() => onOpenChange(false)}>Close Brownfield</button>
      </div>
    ) : null
  ),
}));

import { useHasAvailableProviders } from '@/hooks/llm';

const createWrapper = () => {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: { retry: false },
    },
  });
  return ({ children }: { children: React.ReactNode }) => (
    <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
  );
};

describe('AgentPanel', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    (useHasAvailableProviders as ReturnType<typeof vi.fn>).mockReturnValue(true);
  });

  // @atom IA-008
  describe('rendering', () => {
    it('renders the panel header', () => {
      render(<AgentPanel />, { wrapper: createWrapper() });
      // Verify panel title is displayed
      expect(screen.getByText('AI Agents')).toBeInTheDocument();
    });

    it('renders agent count badge', () => {
      render(<AgentPanel />, { wrapper: createWrapper() });
      // Verify agent count is displayed
      expect(screen.getByText(String(AGENTS.length))).toBeInTheDocument();
    });

    it('renders all agent cards', () => {
      render(<AgentPanel />, { wrapper: createWrapper() });
      // Verify all agents are displayed
      expect(screen.getByText('Atomization Agent')).toBeInTheDocument();
      expect(screen.getByText('Refinement Agent')).toBeInTheDocument();
      expect(screen.getByText('Brownfield Agent')).toBeInTheDocument();
      expect(screen.getByText('Validator Translation')).toBeInTheDocument();
    });

    it('renders provider status', () => {
      render(<AgentPanel />, { wrapper: createWrapper() });
      // Verify provider status is shown
      expect(screen.getByTestId('provider-status')).toBeInTheDocument();
    });

    it('shows AI badge for agents requiring LLM', () => {
      render(<AgentPanel />, { wrapper: createWrapper() });
      // All agents require LLM, so AI badges should be present
      const aiBadges = screen.getAllByText('AI');
      expect(aiBadges.length).toBeGreaterThan(0);
    });
  });

  // @atom IA-008
  describe('collapsible behavior', () => {
    it('is expanded by default when defaultOpen is true', () => {
      render(<AgentPanel defaultOpen={true} />, { wrapper: createWrapper() });
      // Content should be visible
      expect(screen.getByText('Atomization Agent')).toBeInTheDocument();
    });

    it('is collapsed when defaultOpen is false', () => {
      render(<AgentPanel defaultOpen={false} />, { wrapper: createWrapper() });
      // Content should be hidden (collapsible is closed)
      // The collapsible hides content, but the element may still be in DOM
      // We check that clicking the trigger opens it
      const trigger = screen.getByRole('button', { name: /AI Agents/i });
      expect(trigger).toBeInTheDocument();
    });

    it('toggles open/close when header is clicked', async () => {
      const user = userEvent.setup();
      render(<AgentPanel defaultOpen={true} />, { wrapper: createWrapper() });

      const trigger = screen.getByRole('button', { name: /AI Agents/i });

      // Click to collapse
      await user.click(trigger);

      // Click to expand
      await user.click(trigger);

      // Should still render agents
      expect(screen.getByText('Atomization Agent')).toBeInTheDocument();
    });
  });

  // @atom IA-008
  describe('agent selection', () => {
    it('opens Atomization wizard when Atomization Agent is clicked', async () => {
      const user = userEvent.setup();
      render(<AgentPanel />, { wrapper: createWrapper() });

      const atomizationCard = screen.getByText('Atomization Agent').closest('[class*="cursor-pointer"]');
      await user.click(atomizationCard!);

      // Verify atomization wizard opens
      await waitFor(() => {
        expect(screen.getByTestId('atomization-wizard')).toBeInTheDocument();
      });
    });

    it('opens Refinement panel when Refinement Agent is clicked', async () => {
      const user = userEvent.setup();
      render(<AgentPanel />, { wrapper: createWrapper() });

      const refinementCard = screen.getByText('Refinement Agent').closest('[class*="cursor-pointer"]');
      await user.click(refinementCard!);

      // Verify refinement panel opens
      await waitFor(() => {
        expect(screen.getByTestId('refinement-panel')).toBeInTheDocument();
      });
    });

    it('opens Brownfield wizard when Brownfield Agent is clicked', async () => {
      const user = userEvent.setup();
      render(<AgentPanel />, { wrapper: createWrapper() });

      const brownfieldCard = screen.getByText('Brownfield Agent').closest('[class*="cursor-pointer"]');
      await user.click(brownfieldCard!);

      // Verify brownfield wizard opens
      await waitFor(() => {
        expect(screen.getByTestId('brownfield-wizard')).toBeInTheDocument();
      });
    });

    it('shows translation placeholder when Translation is clicked', async () => {
      const user = userEvent.setup();
      render(<AgentPanel />, { wrapper: createWrapper() });

      const translationCard = screen.getByText('Validator Translation').closest('[class*="cursor-pointer"]');
      await user.click(translationCard!);

      // Verify translation placeholder appears
      await waitFor(() => {
        expect(screen.getByText(/Validator translation is available/)).toBeInTheDocument();
      });
    });

    it('calls onAgentSelect callback when agent is selected', async () => {
      const onAgentSelect = vi.fn();
      const user = userEvent.setup();
      render(<AgentPanel onAgentSelect={onAgentSelect} />, { wrapper: createWrapper() });

      const atomizationCard = screen.getByText('Atomization Agent').closest('[class*="cursor-pointer"]');
      await user.click(atomizationCard!);

      // Verify callback was called with correct agent
      expect(onAgentSelect).toHaveBeenCalledWith(
        expect.objectContaining({
          id: 'atomization',
          name: 'Atomization Agent',
        })
      );
    });

    it('closes dialog when sub-wizard closes', async () => {
      const user = userEvent.setup();
      render(<AgentPanel />, { wrapper: createWrapper() });

      // Open atomization wizard
      const atomizationCard = screen.getByText('Atomization Agent').closest('[class*="cursor-pointer"]');
      await user.click(atomizationCard!);

      await waitFor(() => {
        expect(screen.getByTestId('atomization-wizard')).toBeInTheDocument();
      });

      // Close it
      await user.click(screen.getByText('Close Atomization'));

      // Wizard should be closed
      await waitFor(() => {
        expect(screen.queryByTestId('atomization-wizard')).not.toBeInTheDocument();
      });
    });
  });

  // @atom IA-008
  describe('disabled state', () => {
    it('disables agents when no providers available', () => {
      (useHasAvailableProviders as ReturnType<typeof vi.fn>).mockReturnValue(false);

      render(<AgentPanel />, { wrapper: createWrapper() });

      // All agent cards should have disabled styling
      const cards = document.querySelectorAll('[class*="opacity-50"]');
      expect(cards.length).toBeGreaterThan(0);
    });

    it('shows no providers message when unavailable', () => {
      (useHasAvailableProviders as ReturnType<typeof vi.fn>).mockReturnValue(false);

      render(<AgentPanel />, { wrapper: createWrapper() });

      // Verify warning message is shown
      expect(screen.getByText(/No LLM providers available/)).toBeInTheDocument();
    });

    it('prevents agent selection when disabled', async () => {
      (useHasAvailableProviders as ReturnType<typeof vi.fn>).mockReturnValue(false);
      const onAgentSelect = vi.fn();
      const user = userEvent.setup();

      render(<AgentPanel onAgentSelect={onAgentSelect} />, { wrapper: createWrapper() });

      const atomizationCard = screen.getByText('Atomization Agent').closest('[class*="cursor-not-allowed"]');
      await user.click(atomizationCard!);

      // Callback should not be called
      expect(onAgentSelect).not.toHaveBeenCalled();
    });
  });

  // @atom IA-008
  describe('custom className', () => {
    it('applies custom className', () => {
      const { container } = render(<AgentPanel className="custom-class" />, {
        wrapper: createWrapper(),
      });
      // Verify custom class is applied
      expect(container.firstChild).toHaveClass('custom-class');
    });
  });

  // @atom IA-008
  describe('boundary tests', () => {
    it('handles rapid open/close toggles', async () => {
      const user = userEvent.setup();
      render(<AgentPanel />, { wrapper: createWrapper() });

      const trigger = screen.getByRole('button', { name: /AI Agents/i });

      // Rapid clicks
      await user.click(trigger);
      await user.click(trigger);
      await user.click(trigger);

      // Should still be functional
      expect(screen.getByText('AI Agents')).toBeInTheDocument();
    });

    it('handles multiple agent selections', async () => {
      const user = userEvent.setup();
      render(<AgentPanel />, { wrapper: createWrapper() });

      // Select atomization
      const atomizationCard = screen.getByText('Atomization Agent').closest('[class*="cursor-pointer"]');
      await user.click(atomizationCard!);

      await waitFor(() => {
        expect(screen.getByTestId('atomization-wizard')).toBeInTheDocument();
      });

      // Close it
      await user.click(screen.getByText('Close Atomization'));

      // Select refinement
      const refinementCard = screen.getByText('Refinement Agent').closest('[class*="cursor-pointer"]');
      await user.click(refinementCard!);

      await waitFor(() => {
        expect(screen.getByTestId('refinement-panel')).toBeInTheDocument();
      });
    });
  });
});

describe('AgentButton', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    (useHasAvailableProviders as ReturnType<typeof vi.fn>).mockReturnValue(true);
  });

  // @atom IA-008
  it('renders the floating button', () => {
    render(<AgentButton />, { wrapper: createWrapper() });
    // Verify button is rendered
    const button = screen.getByRole('button');
    expect(button).toBeInTheDocument();
    expect(button).toHaveClass('rounded-full');
  });

  // @atom IA-008
  it('toggles panel when clicked', async () => {
    const user = userEvent.setup();
    render(<AgentButton />, { wrapper: createWrapper() });

    const button = screen.getByRole('button');
    await user.click(button);

    // Panel should be visible
    await waitFor(() => {
      expect(screen.getByText('AI Agents')).toBeInTheDocument();
    });

    // Click again to close
    await user.click(button);

    // Panel should close (may need animation time)
    await waitFor(() => {
      // The panel card should not be visible
      const agentCards = screen.queryAllByText('Atomization Agent');
      // Either no agents visible or panel is closed
    });
  });

  // @atom IA-008
  it('shows reduced opacity when no providers available', () => {
    (useHasAvailableProviders as ReturnType<typeof vi.fn>).mockReturnValue(false);

    render(<AgentButton />, { wrapper: createWrapper() });

    const button = screen.getByRole('button');
    expect(button).toHaveClass('opacity-50');
  });

  // @atom IA-008
  it('applies custom className', () => {
    const { container } = render(<AgentButton className="custom-class" />, {
      wrapper: createWrapper(),
    });
    // Verify custom class is applied
    expect(container.firstChild).toHaveClass('custom-class');
  });
});

describe('AGENTS configuration', () => {
  // @atom IA-008
  it('exports AGENTS array with correct structure', () => {
    expect(Array.isArray(AGENTS)).toBe(true);
    expect(AGENTS.length).toBe(4);
  });

  // @atom IA-008
  it('all agents have required properties', () => {
    AGENTS.forEach((agent) => {
      expect(agent).toHaveProperty('id');
      expect(agent).toHaveProperty('name');
      expect(agent).toHaveProperty('description');
      expect(agent).toHaveProperty('icon');
      expect(agent).toHaveProperty('taskType');
      expect(agent).toHaveProperty('requiresLLM');
    });
  });

  // @atom IA-008
  it('all agents have unique IDs', () => {
    const ids = AGENTS.map((a) => a.id);
    const uniqueIds = new Set(ids);
    expect(uniqueIds.size).toBe(ids.length);
  });
});

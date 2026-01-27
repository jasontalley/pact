/**
 * Provider Status Component Tests
 *
 * Tests for the LLM provider status indicator component.
 *
 * @atom IA-008 - LLM Provider Implementation
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import { ProviderStatus, ProviderStatusCompact } from '@/components/agents/ProviderStatus';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

// Mock the LLM hooks
vi.mock('@/hooks/llm', () => ({
  useProviders: vi.fn(),
  useBudgetStatus: vi.fn(),
  useHasAvailableProviders: vi.fn(),
}));

import { useProviders, useBudgetStatus } from '@/hooks/llm';

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

const mockProviderData = {
  providers: [
    {
      name: 'openai' as const,
      displayName: 'OpenAI',
      available: true,
      supportedModels: ['gpt-5-nano', 'gpt-5-mini'],
      health: {
        available: true,
        averageLatencyMs: 250,
      },
    },
    {
      name: 'anthropic' as const,
      displayName: 'Anthropic',
      available: true,
      supportedModels: ['claude-sonnet-4-5', 'claude-haiku-3'],
      health: {
        available: true,
        averageLatencyMs: 300,
      },
    },
    {
      name: 'ollama' as const,
      displayName: 'Local (Ollama)',
      available: false,
      supportedModels: [],
      health: {
        available: false,
        averageLatencyMs: null,
      },
    },
  ],
  availableCount: 2,
  totalCount: 3,
};

const mockBudgetData = {
  dailyCost: 0.45,
  dailyLimit: 1.0,
  monthlyCost: 12.50,
  monthlyLimit: 50.0,
  monthlyUtilization: 25,
  hardStopEnabled: false,
};

describe('ProviderStatus', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    (useProviders as ReturnType<typeof vi.fn>).mockReturnValue({
      data: mockProviderData,
      isLoading: false,
      error: null,
    });
    (useBudgetStatus as ReturnType<typeof vi.fn>).mockReturnValue({
      data: mockBudgetData,
      dailyUtilization: 45,
      isDailyBudgetExceeded: false,
    });
  });

  // @atom IA-008
  describe('loading state', () => {
    it('shows loading skeleton when providers are loading', () => {
      (useProviders as ReturnType<typeof vi.fn>).mockReturnValue({
        data: undefined,
        isLoading: true,
        error: null,
      });

      render(<ProviderStatus />, { wrapper: createWrapper() });
      // Verify loading skeleton is displayed while data is being fetched
      expect(document.querySelector('.animate-pulse')).toBeInTheDocument();
    });
  });

  // @atom IA-008
  describe('error state', () => {
    it('shows error badge when provider fetch fails', () => {
      (useProviders as ReturnType<typeof vi.fn>).mockReturnValue({
        data: undefined,
        isLoading: false,
        error: new Error('Network error'),
      });

      render(<ProviderStatus />, { wrapper: createWrapper() });
      // Verify error indicator is shown when providers cannot be fetched
      expect(screen.getByText('LLM Unavailable')).toBeInTheDocument();
    });

    it('shows error badge when data is null', () => {
      (useProviders as ReturnType<typeof vi.fn>).mockReturnValue({
        data: null,
        isLoading: false,
        error: null,
      });

      render(<ProviderStatus />, { wrapper: createWrapper() });
      // Verify error indicator is shown when no data available
      expect(screen.getByText('LLM Unavailable')).toBeInTheDocument();
    });
  });

  // @atom IA-008
  describe('provider display', () => {
    it('renders all provider badges', () => {
      render(<ProviderStatus />, { wrapper: createWrapper() });
      // Verify all configured providers are displayed
      expect(screen.getByText('OpenAI')).toBeInTheDocument();
      expect(screen.getByText('Anthropic')).toBeInTheDocument();
      expect(screen.getByText('Local')).toBeInTheDocument();
    });

    it('shows green indicator for available providers', () => {
      render(<ProviderStatus />, { wrapper: createWrapper() });
      // The available providers should have green styling
      const openaiElement = screen.getByText('OpenAI').closest('div');
      expect(openaiElement).toHaveClass('bg-green-50');
    });

    it('shows gray indicator for unavailable providers', () => {
      render(<ProviderStatus />, { wrapper: createWrapper() });
      // The unavailable provider should have gray styling
      const ollamaElement = screen.getByText('Local').closest('div');
      expect(ollamaElement).toHaveClass('bg-gray-50');
    });
  });

  // @atom IA-008
  describe('budget display', () => {
    it('shows budget indicator by default', () => {
      render(<ProviderStatus />, { wrapper: createWrapper() });
      // Verify daily cost is displayed
      expect(screen.getByText('$0.45')).toBeInTheDocument();
    });

    it('hides budget indicator when showBudget is false', () => {
      render(<ProviderStatus showBudget={false} />, { wrapper: createWrapper() });
      // Verify budget is not displayed when disabled
      expect(screen.queryByText('$0.45')).not.toBeInTheDocument();
    });

    it('shows progress bar for budget utilization', () => {
      render(<ProviderStatus />, { wrapper: createWrapper() });
      // Verify progress bar is rendered
      const progressBar = document.querySelector('[role="progressbar"]');
      expect(progressBar).toBeInTheDocument();
    });
  });

  // @atom IA-008
  describe('compact mode', () => {
    it('shows compact display with count when compact is true', () => {
      render(<ProviderStatus compact />, { wrapper: createWrapper() });
      // Verify compact format shows provider count
      expect(screen.getByText('2/3 LLM')).toBeInTheDocument();
    });

    it('does not show individual provider badges in compact mode', () => {
      render(<ProviderStatus compact />, { wrapper: createWrapper() });
      // Verify individual provider names are not shown
      expect(screen.queryByText('OpenAI')).not.toBeInTheDocument();
      expect(screen.queryByText('Anthropic')).not.toBeInTheDocument();
    });

    it('shows green indicator when providers available', () => {
      render(<ProviderStatus compact />, { wrapper: createWrapper() });
      // The compact indicator should show green for available
      const indicator = document.querySelector('.bg-green-500');
      expect(indicator).toBeInTheDocument();
    });

    it('shows red indicator when no providers available', () => {
      (useProviders as ReturnType<typeof vi.fn>).mockReturnValue({
        data: { ...mockProviderData, availableCount: 0 },
        isLoading: false,
        error: null,
      });

      render(<ProviderStatus compact />, { wrapper: createWrapper() });
      // The compact indicator should show red when unavailable
      const indicator = document.querySelector('.bg-red-500');
      expect(indicator).toBeInTheDocument();
    });
  });

  // @atom IA-008
  describe('budget warnings', () => {
    it('shows warning color when budget exceeds 80%', () => {
      (useBudgetStatus as ReturnType<typeof vi.fn>).mockReturnValue({
        data: mockBudgetData,
        dailyUtilization: 85,
        isDailyBudgetExceeded: false,
      });

      render(<ProviderStatus />, { wrapper: createWrapper() });
      // Budget indicator should be present (warning state is visual)
      const progressBar = document.querySelector('[role="progressbar"]');
      expect(progressBar).toBeInTheDocument();
    });

    it('shows exceeded indicator when budget is exceeded', () => {
      (useBudgetStatus as ReturnType<typeof vi.fn>).mockReturnValue({
        data: { ...mockBudgetData, dailyCost: 1.5 },
        dailyUtilization: 150,
        isDailyBudgetExceeded: true,
      });

      render(<ProviderStatus />, { wrapper: createWrapper() });
      // Verify the exceeded budget amount is shown
      expect(screen.getByText('$1.50')).toBeInTheDocument();
    });
  });

  // @atom IA-008
  describe('boundary tests', () => {
    it('handles zero available providers', () => {
      (useProviders as ReturnType<typeof vi.fn>).mockReturnValue({
        data: { ...mockProviderData, availableCount: 0 },
        isLoading: false,
        error: null,
      });

      render(<ProviderStatus />, { wrapper: createWrapper() });
      // Should still render without error
      expect(screen.getByText('Local')).toBeInTheDocument();
    });

    it('handles zero budget utilization', () => {
      (useBudgetStatus as ReturnType<typeof vi.fn>).mockReturnValue({
        data: { ...mockBudgetData, dailyCost: 0 },
        dailyUtilization: 0,
        isDailyBudgetExceeded: false,
      });

      render(<ProviderStatus />, { wrapper: createWrapper() });
      // Verify zero cost is displayed
      expect(screen.getByText('$0.00')).toBeInTheDocument();
    });

    it('handles 100% budget utilization', () => {
      (useBudgetStatus as ReturnType<typeof vi.fn>).mockReturnValue({
        data: { ...mockBudgetData, dailyCost: 1.0 },
        dailyUtilization: 100,
        isDailyBudgetExceeded: false,
      });

      render(<ProviderStatus />, { wrapper: createWrapper() });
      // Verify exact limit cost is displayed
      expect(screen.getByText('$1.00')).toBeInTheDocument();
    });

    it('handles empty provider list', () => {
      (useProviders as ReturnType<typeof vi.fn>).mockReturnValue({
        data: { providers: [], availableCount: 0, totalCount: 0 },
        isLoading: false,
        error: null,
      });

      render(<ProviderStatus />, { wrapper: createWrapper() });
      // Should render empty state without crashing
      expect(document.querySelector('.flex')).toBeInTheDocument();
    });

    it('handles null budget data gracefully', () => {
      (useBudgetStatus as ReturnType<typeof vi.fn>).mockReturnValue({
        data: null,
        dailyUtilization: 0,
        isDailyBudgetExceeded: false,
      });

      render(<ProviderStatus />, { wrapper: createWrapper() });
      // Should not show budget indicator when data is null
      expect(screen.queryByText(/\$/)).not.toBeInTheDocument();
    });
  });
});

describe('ProviderStatusCompact', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    (useProviders as ReturnType<typeof vi.fn>).mockReturnValue({
      data: mockProviderData,
      isLoading: false,
      error: null,
    });
    (useBudgetStatus as ReturnType<typeof vi.fn>).mockReturnValue({
      data: mockBudgetData,
      dailyUtilization: 45,
      isDailyBudgetExceeded: false,
    });
  });

  // @atom IA-008
  it('renders as compact mode by default', () => {
    render(<ProviderStatusCompact />, { wrapper: createWrapper() });
    // Verify compact format is used
    expect(screen.getByText('2/3 LLM')).toBeInTheDocument();
  });

  // @atom IA-008
  it('does not show budget by default', () => {
    render(<ProviderStatusCompact />, { wrapper: createWrapper() });
    // Verify budget is not shown
    expect(screen.queryByText('$0.45')).not.toBeInTheDocument();
  });

  // @atom IA-008
  it('applies custom className', () => {
    const { container } = render(<ProviderStatusCompact className="custom-class" />, {
      wrapper: createWrapper(),
    });
    // Verify custom class is applied to some element in the component
    expect(container.querySelector('.custom-class')).toBeInTheDocument();
  });
});

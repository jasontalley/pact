/**
 * Agent Chat Component Tests
 *
 * Tests for the conversational agent chat interface.
 *
 * @atom IA-008 - LLM Provider Implementation
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { AgentChat, AgentChatButton } from '@/components/agents/AgentChat';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

// Mock the LLM hooks
vi.mock('@/hooks/llm', () => ({
  useProviders: vi.fn(() => ({
    data: {
      providers: [
        { name: 'openai', displayName: 'OpenAI', available: true, supportedModels: [], health: {} },
      ],
      availableCount: 1,
      totalCount: 1,
    },
    isLoading: false,
    error: null,
  })),
  useBudgetStatus: vi.fn(() => ({
    data: { dailyCost: 0.5, dailyLimit: 1.0 },
    dailyUtilization: 50,
    isDailyBudgetExceeded: false,
  })),
}));

// Mock the API client
vi.mock('@/lib/api/client', () => ({
  apiClient: {
    post: vi.fn(),
  },
}));

// Mock sonner toast
vi.mock('sonner', () => ({
  toast: {
    error: vi.fn(),
    success: vi.fn(),
  },
}));

// Mock ProviderStatusCompact
vi.mock('@/components/agents/ProviderStatus', () => ({
  ProviderStatusCompact: () => <div data-testid="provider-status-compact">Provider Status</div>,
}));

import { apiClient } from '@/lib/api/client';
import { toast } from 'sonner';
import { useProviders, useBudgetStatus } from '@/hooks/llm';

const createWrapper = () => {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: { retry: false },
      mutations: { retry: false },
    },
  });
  return ({ children }: { children: React.ReactNode }) => (
    <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
  );
};

describe('AgentChat', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    (useProviders as ReturnType<typeof vi.fn>).mockReturnValue({
      data: { providers: [], availableCount: 1, totalCount: 1 },
      isLoading: false,
      error: null,
    });
    (useBudgetStatus as ReturnType<typeof vi.fn>).mockReturnValue({
      data: { dailyCost: 0.5, dailyLimit: 1.0 },
      dailyUtilization: 50,
      isDailyBudgetExceeded: false,
    });
  });

  // @atom IA-008
  describe('rendering', () => {
    it('renders the chat interface', () => {
      render(<AgentChat />, { wrapper: createWrapper() });
      // Verify chat title is displayed
      expect(screen.getByText('Pact Assistant')).toBeInTheDocument();
    });

    it('renders provider status', () => {
      render(<AgentChat />, { wrapper: createWrapper() });
      // Verify provider status is shown
      expect(screen.getByTestId('provider-status-compact')).toBeInTheDocument();
    });

    it('renders welcome message', () => {
      render(<AgentChat />, { wrapper: createWrapper() });
      // Verify welcome message is displayed
      expect(screen.getByText(/I can help you with Pact tasks/)).toBeInTheDocument();
    });

    it('renders input field', () => {
      render(<AgentChat />, { wrapper: createWrapper() });
      // Verify input is present
      expect(screen.getByPlaceholderText(/Ask me anything about Pact/)).toBeInTheDocument();
    });

    it('renders send button', () => {
      render(<AgentChat />, { wrapper: createWrapper() });
      // Verify send button is present
      const buttons = screen.getAllByRole('button');
      // One of the buttons should be the send button
      expect(buttons.length).toBeGreaterThan(0);
    });

    it('renders clear button', () => {
      render(<AgentChat />, { wrapper: createWrapper() });
      // Verify clear button is present
      expect(screen.getByRole('button', { name: 'Clear' })).toBeInTheDocument();
    });
  });

  // @atom IA-008
  describe('message sending', () => {
    it('enables input when providers are available', () => {
      render(<AgentChat />, { wrapper: createWrapper() });
      const input = screen.getByPlaceholderText(/Ask me anything about Pact/);
      expect(input).not.toBeDisabled();
    });

    it('adds user message when sent', async () => {
      const user = userEvent.setup();
      (apiClient.post as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
        data: {
          sessionId: 'test-session',
          message: 'Hello! I can help with that.',
          suggestedActions: [],
        },
      });

      render(<AgentChat />, { wrapper: createWrapper() });

      const input = screen.getByPlaceholderText(/Ask me anything about Pact/);
      await user.type(input, 'Hello');
      await user.keyboard('{Enter}');

      // Verify user message appears
      await waitFor(() => {
        expect(screen.getByText('Hello')).toBeInTheDocument();
      });
    });

    it('clears input after sending', async () => {
      const user = userEvent.setup();
      (apiClient.post as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
        data: {
          sessionId: 'test-session',
          message: 'Response',
          suggestedActions: [],
        },
      });

      render(<AgentChat />, { wrapper: createWrapper() });

      const input = screen.getByPlaceholderText(/Ask me anything about Pact/) as HTMLInputElement;
      await user.type(input, 'Hello');
      await user.keyboard('{Enter}');

      // Verify input is cleared
      await waitFor(() => {
        expect(input.value).toBe('');
      });
    });

    it('shows assistant response after sending', async () => {
      const user = userEvent.setup();
      (apiClient.post as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
        data: {
          sessionId: 'test-session',
          message: 'I found 5 atoms matching your query.',
          suggestedActions: [],
        },
      });

      render(<AgentChat />, { wrapper: createWrapper() });

      const input = screen.getByPlaceholderText(/Ask me anything about Pact/);
      await user.type(input, 'Search for atoms');
      await user.keyboard('{Enter}');

      // Verify assistant response appears
      await waitFor(() => {
        expect(screen.getByText('I found 5 atoms matching your query.')).toBeInTheDocument();
      });
    });

    it('does not send empty messages', async () => {
      const user = userEvent.setup();

      render(<AgentChat />, { wrapper: createWrapper() });

      const input = screen.getByPlaceholderText(/Ask me anything about Pact/);
      await user.keyboard('{Enter}');

      // API should not be called
      expect(apiClient.post).not.toHaveBeenCalled();
    });

    it('sends message on Enter key', async () => {
      const user = userEvent.setup();
      (apiClient.post as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
        data: {
          sessionId: 'test-session',
          message: 'Response',
          suggestedActions: [],
        },
      });

      render(<AgentChat />, { wrapper: createWrapper() });

      const input = screen.getByPlaceholderText(/Ask me anything about Pact/);
      await user.type(input, 'Test message');
      await user.keyboard('{Enter}');

      // API should be called
      await waitFor(() => {
        expect(apiClient.post).toHaveBeenCalledWith('/agents/chat', {
          message: 'Test message',
          sessionId: undefined,
        });
      });
    });
  });

  // @atom IA-008
  describe('session management', () => {
    it('shows session badge when session is active', async () => {
      const user = userEvent.setup();
      (apiClient.post as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
        data: {
          sessionId: 'test-session-123',
          message: 'Response',
          suggestedActions: [],
        },
      });

      render(<AgentChat />, { wrapper: createWrapper() });

      const input = screen.getByPlaceholderText(/Ask me anything about Pact/);
      await user.type(input, 'Hello');
      await user.keyboard('{Enter}');

      // Verify session badge appears
      await waitFor(() => {
        expect(screen.getByText('Session active')).toBeInTheDocument();
      });
    });

    it('maintains session ID across messages', async () => {
      const user = userEvent.setup();
      (apiClient.post as ReturnType<typeof vi.fn>)
        .mockResolvedValueOnce({
          data: {
            sessionId: 'session-abc',
            message: 'First response',
            suggestedActions: [],
          },
        })
        .mockResolvedValueOnce({
          data: {
            sessionId: 'session-abc',
            message: 'Second response',
            suggestedActions: [],
          },
        });

      render(<AgentChat />, { wrapper: createWrapper() });

      const input = screen.getByPlaceholderText(/Ask me anything about Pact/);

      // First message
      await user.type(input, 'First');
      await user.keyboard('{Enter}');

      await waitFor(() => {
        expect(screen.getByText('First response')).toBeInTheDocument();
      });

      // Second message
      await user.type(input, 'Second');
      await user.keyboard('{Enter}');

      // Verify session ID was used
      await waitFor(() => {
        expect(apiClient.post).toHaveBeenLastCalledWith('/agents/chat', {
          message: 'Second',
          sessionId: 'session-abc',
        });
      });
    });

    it('clears session on Clear button click', async () => {
      const user = userEvent.setup();
      (apiClient.post as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
        data: {
          sessionId: 'test-session',
          message: 'Response',
          suggestedActions: [],
        },
      });

      render(<AgentChat />, { wrapper: createWrapper() });

      // Send a message to establish session
      const input = screen.getByPlaceholderText(/Ask me anything about Pact/);
      await user.type(input, 'Hello');
      await user.keyboard('{Enter}');

      await waitFor(() => {
        expect(screen.getByText('Session active')).toBeInTheDocument();
      });

      // Clear chat
      await user.click(screen.getByRole('button', { name: 'Clear' }));

      // Session badge should be gone
      await waitFor(() => {
        expect(screen.queryByText('Session active')).not.toBeInTheDocument();
      });

      // New welcome message should appear
      expect(screen.getByText('Chat cleared. How can I help you with Pact today?')).toBeInTheDocument();
    });
  });

  // @atom IA-008
  describe('suggested actions', () => {
    it('shows suggested actions from response', async () => {
      const user = userEvent.setup();
      (apiClient.post as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
        data: {
          sessionId: 'test-session',
          message: 'Response',
          suggestedActions: ['View atom details', 'Refine atom'],
        },
      });

      render(<AgentChat />, { wrapper: createWrapper() });

      const input = screen.getByPlaceholderText(/Ask me anything about Pact/);
      await user.type(input, 'Hello');
      await user.keyboard('{Enter}');

      // Verify suggested actions appear
      await waitFor(() => {
        expect(screen.getByText('View atom details')).toBeInTheDocument();
        expect(screen.getByText('Refine atom')).toBeInTheDocument();
      });
    });

    it('fills input when suggestion is clicked', async () => {
      const user = userEvent.setup();
      (apiClient.post as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
        data: {
          sessionId: 'test-session',
          message: 'Response',
          suggestedActions: ['Search atoms'],
        },
      });

      render(<AgentChat />, { wrapper: createWrapper() });

      const input = screen.getByPlaceholderText(/Ask me anything about Pact/) as HTMLInputElement;
      await user.type(input, 'Hello');
      await user.keyboard('{Enter}');

      await waitFor(() => {
        expect(screen.getByText('Search atoms')).toBeInTheDocument();
      });

      // Click suggestion
      await user.click(screen.getByText('Search atoms'));

      // Input should be filled
      expect(input.value).toBe('Search atoms');
    });

    it('clears suggestions when new message is sent', async () => {
      const user = userEvent.setup();
      (apiClient.post as ReturnType<typeof vi.fn>)
        .mockResolvedValueOnce({
          data: {
            sessionId: 'test-session',
            message: 'Response',
            suggestedActions: ['Suggestion 1'],
          },
        })
        .mockResolvedValueOnce({
          data: {
            sessionId: 'test-session',
            message: 'Response 2',
            suggestedActions: [],
          },
        });

      render(<AgentChat />, { wrapper: createWrapper() });

      const input = screen.getByPlaceholderText(/Ask me anything about Pact/);

      // First message
      await user.type(input, 'First');
      await user.keyboard('{Enter}');

      await waitFor(() => {
        expect(screen.getByText('Suggestion 1')).toBeInTheDocument();
      });

      // Second message
      await user.type(input, 'Second');
      await user.keyboard('{Enter}');

      // Old suggestion should be cleared
      await waitFor(() => {
        expect(screen.queryByText('Suggestion 1')).not.toBeInTheDocument();
      });
    });
  });

  // @atom IA-008
  describe('tool calls display', () => {
    it('shows tool calls in message', async () => {
      const user = userEvent.setup();
      (apiClient.post as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
        data: {
          sessionId: 'test-session',
          message: 'I searched for atoms.',
          toolCalls: [
            { id: 'call-1', name: 'search_atoms', arguments: { query: 'auth' } },
          ],
          toolResults: [
            { toolCallId: 'call-1', name: 'search_atoms', result: { count: 5 }, success: true },
          ],
          suggestedActions: [],
        },
      });

      render(<AgentChat />, { wrapper: createWrapper() });

      const input = screen.getByPlaceholderText(/Ask me anything about Pact/);
      await user.type(input, 'Search auth');
      await user.keyboard('{Enter}');

      // Verify tool call badge appears
      await waitFor(() => {
        expect(screen.getByText('search_atoms')).toBeInTheDocument();
      });
    });

    it('shows tool result success/failure', async () => {
      const user = userEvent.setup();
      (apiClient.post as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
        data: {
          sessionId: 'test-session',
          message: 'Completed.',
          toolCalls: [{ id: 'call-1', name: 'create_atom', arguments: {} }],
          toolResults: [
            { toolCallId: 'call-1', name: 'create_atom', result: {}, success: true },
          ],
          suggestedActions: [],
        },
      });

      render(<AgentChat />, { wrapper: createWrapper() });

      const input = screen.getByPlaceholderText(/Ask me anything about Pact/);
      await user.type(input, 'Create atom');
      await user.keyboard('{Enter}');

      // Verify success indicator appears
      await waitFor(() => {
        expect(screen.getByText('create_atom: Success')).toBeInTheDocument();
      });
    });
  });

  // @atom IA-008
  describe('error handling', () => {
    it('shows error toast on API failure', async () => {
      const user = userEvent.setup();
      (apiClient.post as ReturnType<typeof vi.fn>).mockRejectedValueOnce(
        new Error('Network error')
      );

      render(<AgentChat />, { wrapper: createWrapper() });

      const input = screen.getByPlaceholderText(/Ask me anything about Pact/);
      await user.type(input, 'Hello');
      await user.keyboard('{Enter}');

      // Verify error toast is shown
      await waitFor(() => {
        expect(toast.error).toHaveBeenCalledWith(
          expect.stringContaining('Chat failed')
        );
      });
    });

    it('adds error message to chat on API failure', async () => {
      const user = userEvent.setup();
      (apiClient.post as ReturnType<typeof vi.fn>).mockRejectedValueOnce(
        new Error('Service unavailable')
      );

      render(<AgentChat />, { wrapper: createWrapper() });

      const input = screen.getByPlaceholderText(/Ask me anything about Pact/);
      await user.type(input, 'Hello');
      await user.keyboard('{Enter}');

      // Verify error message appears in chat
      await waitFor(() => {
        expect(screen.getByText(/Sorry, I encountered an error/)).toBeInTheDocument();
      });
    });
  });

  // @atom IA-008
  describe('disabled state', () => {
    it('disables input when no providers available', () => {
      (useProviders as ReturnType<typeof vi.fn>).mockReturnValue({
        data: { providers: [], availableCount: 0, totalCount: 0 },
        isLoading: false,
        error: null,
      });

      render(<AgentChat />, { wrapper: createWrapper() });

      const input = screen.getByPlaceholderText('Chat unavailable');
      expect(input).toBeDisabled();
    });

    it('disables input when budget exceeded', () => {
      (useBudgetStatus as ReturnType<typeof vi.fn>).mockReturnValue({
        data: { dailyCost: 1.5, dailyLimit: 1.0 },
        dailyUtilization: 150,
        isDailyBudgetExceeded: true,
      });

      render(<AgentChat />, { wrapper: createWrapper() });

      const input = screen.getByPlaceholderText('Chat unavailable');
      expect(input).toBeDisabled();
    });

    it('shows unavailable reason for no providers', () => {
      (useProviders as ReturnType<typeof vi.fn>).mockReturnValue({
        data: { providers: [], availableCount: 0, totalCount: 0 },
        isLoading: false,
        error: null,
      });

      render(<AgentChat />, { wrapper: createWrapper() });

      expect(screen.getByText('No LLM providers available')).toBeInTheDocument();
    });

    it('shows unavailable reason for budget exceeded', () => {
      (useBudgetStatus as ReturnType<typeof vi.fn>).mockReturnValue({
        data: { dailyCost: 1.5, dailyLimit: 1.0 },
        dailyUtilization: 150,
        isDailyBudgetExceeded: true,
      });

      render(<AgentChat />, { wrapper: createWrapper() });

      expect(screen.getByText('Daily budget exceeded')).toBeInTheDocument();
    });
  });

  // @atom IA-008
  describe('boundary tests', () => {
    it('handles empty suggested actions array', async () => {
      const user = userEvent.setup();
      (apiClient.post as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
        data: {
          sessionId: 'test-session',
          message: 'Response',
          suggestedActions: [],
        },
      });

      render(<AgentChat />, { wrapper: createWrapper() });

      const input = screen.getByPlaceholderText(/Ask me anything about Pact/);
      await user.type(input, 'Hello');
      await user.keyboard('{Enter}');

      // Should render without suggested actions section
      await waitFor(() => {
        expect(screen.getByText('Response')).toBeInTheDocument();
      });
    });

    it('handles undefined toolCalls', async () => {
      const user = userEvent.setup();
      (apiClient.post as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
        data: {
          sessionId: 'test-session',
          message: 'Simple response',
        },
      });

      render(<AgentChat />, { wrapper: createWrapper() });

      const input = screen.getByPlaceholderText(/Ask me anything about Pact/);
      await user.type(input, 'Hello');
      await user.keyboard('{Enter}');

      // Should render without crashing
      await waitFor(() => {
        expect(screen.getByText('Simple response')).toBeInTheDocument();
      });
    });

    it('handles whitespace-only input', async () => {
      const user = userEvent.setup();

      render(<AgentChat />, { wrapper: createWrapper() });

      const input = screen.getByPlaceholderText(/Ask me anything about Pact/);
      await user.type(input, '   ');
      await user.keyboard('{Enter}');

      // API should not be called for whitespace
      expect(apiClient.post).not.toHaveBeenCalled();
    });

    it('trims message before sending', async () => {
      const user = userEvent.setup();
      (apiClient.post as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
        data: {
          sessionId: 'test-session',
          message: 'Response',
          suggestedActions: [],
        },
      });

      render(<AgentChat />, { wrapper: createWrapper() });

      const input = screen.getByPlaceholderText(/Ask me anything about Pact/);
      await user.type(input, '  Hello  ');
      await user.keyboard('{Enter}');

      // Message should be trimmed
      await waitFor(() => {
        expect(apiClient.post).toHaveBeenCalledWith('/agents/chat', {
          message: 'Hello',
          sessionId: undefined,
        });
      });
    });
  });

  // @atom IA-008
  describe('code formatting', () => {
    it('renders code blocks in messages', async () => {
      const user = userEvent.setup();
      (apiClient.post as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
        data: {
          sessionId: 'test-session',
          message: 'Here is some code:\n```typescript\nconst x = 1;\n```',
          suggestedActions: [],
        },
      });

      render(<AgentChat />, { wrapper: createWrapper() });

      const input = screen.getByPlaceholderText(/Ask me anything about Pact/);
      await user.type(input, 'Show code');
      await user.keyboard('{Enter}');

      // Verify code block is rendered
      await waitFor(() => {
        expect(screen.getByText('typescript')).toBeInTheDocument();
        expect(screen.getByText('const x = 1;')).toBeInTheDocument();
      });
    });
  });
});

describe('AgentChatButton', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    (useProviders as ReturnType<typeof vi.fn>).mockReturnValue({
      data: { providers: [], availableCount: 1, totalCount: 1 },
      isLoading: false,
      error: null,
    });
    (useBudgetStatus as ReturnType<typeof vi.fn>).mockReturnValue({
      data: { dailyCost: 0.5, dailyLimit: 1.0 },
      dailyUtilization: 50,
      isDailyBudgetExceeded: false,
    });
  });

  // @atom IA-008
  it('renders the chat button', () => {
    render(<AgentChatButton />, { wrapper: createWrapper() });
    // Verify button is rendered
    const button = screen.getByRole('button');
    expect(button).toBeInTheDocument();
    expect(button).toHaveClass('rounded-full');
  });

  // @atom IA-008
  it('opens chat sheet when clicked', async () => {
    const user = userEvent.setup();
    render(<AgentChatButton />, { wrapper: createWrapper() });

    const button = screen.getByRole('button');
    await user.click(button);

    // Chat should be visible in sheet (may have multiple elements with same text)
    await waitFor(() => {
      const assistantTexts = screen.getAllByText('Pact Assistant');
      expect(assistantTexts.length).toBeGreaterThan(0);
    });
  });

  // @atom IA-008
  it('applies custom className', () => {
    const { container } = render(<AgentChatButton className="custom-class" />, {
      wrapper: createWrapper(),
    });
    // Verify custom class is applied
    expect(container.querySelector('.custom-class')).toBeInTheDocument();
  });
});

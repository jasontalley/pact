import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { CreateAtomDialog } from '@/components/atoms/CreateAtomDialog';
import { useRefinementWizardStore } from '@/stores/refinement-wizard';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

// Mock the stores and hooks
vi.mock('@/stores/refinement-wizard', () => ({
  useRefinementWizardStore: vi.fn(),
}));

vi.mock('@/hooks/atoms/use-analyze-intent', () => ({
  useAnalyzeIntent: vi.fn(() => ({
    mutate: vi.fn(),
    isPending: false,
  })),
}));

vi.mock('@/hooks/atoms/use-atoms', () => ({
  useCreateAtom: vi.fn(() => ({
    mutate: vi.fn(),
    isPending: false,
  })),
}));

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

const defaultStoreState = {
  isOpen: true,
  step: 0,
  rawIntent: '',
  analysisResult: null,
  selectedCategory: null,
  refinedDescription: '',
  pendingSuggestions: [],
  isAnalyzing: false,
  error: null,
  setRawIntent: vi.fn(),
  setSelectedCategory: vi.fn(),
  setRefinedDescription: vi.fn(),
  nextStep: vi.fn(),
  prevStep: vi.fn(),
  acceptSuggestion: vi.fn(),
  rejectSuggestion: vi.fn(),
  closeWizard: vi.fn(),
  reset: vi.fn(),
};

describe('CreateAtomDialog', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    (useRefinementWizardStore as unknown as ReturnType<typeof vi.fn>).mockReturnValue(
      defaultStoreState
    );
  });

  describe('visibility', () => {
    it('renders when isOpen is true', () => {
      render(<CreateAtomDialog />, { wrapper: createWrapper() });
      expect(screen.getByText('Create Intent Atom')).toBeInTheDocument();
    });

    it('does not render when isOpen is false', () => {
      (useRefinementWizardStore as unknown as ReturnType<typeof vi.fn>).mockReturnValue({
        ...defaultStoreState,
        isOpen: false,
      });
      render(<CreateAtomDialog />, { wrapper: createWrapper() });
      expect(screen.queryByText('Create Intent Atom')).not.toBeInTheDocument();
    });
  });

  describe('Step 0: Raw Intent Input', () => {
    it('shows step indicator for step 1 of 3', () => {
      render(<CreateAtomDialog />, { wrapper: createWrapper() });
      expect(screen.getByText('Step 1 of 3')).toBeInTheDocument();
    });

    it('displays textarea for intent input', () => {
      render(<CreateAtomDialog />, { wrapper: createWrapper() });
      expect(screen.getByPlaceholderText(/Example: Users should be able/)).toBeInTheDocument();
    });

    it('calls setRawIntent when typing in textarea', async () => {
      const setRawIntent = vi.fn();
      (useRefinementWizardStore as unknown as ReturnType<typeof vi.fn>).mockReturnValue({
        ...defaultStoreState,
        setRawIntent,
      });

      render(<CreateAtomDialog />, { wrapper: createWrapper() });
      const textarea = screen.getByPlaceholderText(/Example: Users should be able/);
      fireEvent.change(textarea, { target: { value: 'Test intent' } });
      expect(setRawIntent).toHaveBeenCalledWith('Test intent');
    });

    it('disables Analyze button when intent is too short', () => {
      (useRefinementWizardStore as unknown as ReturnType<typeof vi.fn>).mockReturnValue({
        ...defaultStoreState,
        rawIntent: 'short',
      });

      render(<CreateAtomDialog />, { wrapper: createWrapper() });
      const button = screen.getByRole('button', { name: 'Analyze Intent' });
      expect(button).toBeDisabled();
    });

    it('enables Analyze button when intent is long enough', () => {
      (useRefinementWizardStore as unknown as ReturnType<typeof vi.fn>).mockReturnValue({
        ...defaultStoreState,
        rawIntent: 'This is a valid intent description with enough characters',
      });

      render(<CreateAtomDialog />, { wrapper: createWrapper() });
      const button = screen.getByRole('button', { name: 'Analyze Intent' });
      expect(button).not.toBeDisabled();
    });

    it('shows error message when error exists', () => {
      (useRefinementWizardStore as unknown as ReturnType<typeof vi.fn>).mockReturnValue({
        ...defaultStoreState,
        error: 'Analysis failed',
      });

      render(<CreateAtomDialog />, { wrapper: createWrapper() });
      expect(screen.getByText('Analysis failed')).toBeInTheDocument();
    });
  });

  describe('Step 1: Analysis Results', () => {
    const analysisResult = {
      atomicity: {
        isAtomic: true,
        confidence: 0.85,
        violations: [],
      },
    };

    it('shows atomicity assessment when on step 1', () => {
      (useRefinementWizardStore as unknown as ReturnType<typeof vi.fn>).mockReturnValue({
        ...defaultStoreState,
        step: 1,
        analysisResult,
        refinedDescription: 'Test description',
      });

      render(<CreateAtomDialog />, { wrapper: createWrapper() });
      expect(screen.getByText('Atomicity Assessment')).toBeInTheDocument();
    });

    it('shows "Atomic" badge when isAtomic is true', () => {
      (useRefinementWizardStore as unknown as ReturnType<typeof vi.fn>).mockReturnValue({
        ...defaultStoreState,
        step: 1,
        analysisResult,
        refinedDescription: 'Test description',
      });

      render(<CreateAtomDialog />, { wrapper: createWrapper() });
      expect(screen.getByText('Atomic')).toBeInTheDocument();
    });

    it('shows "Needs Refinement" when isAtomic is false', () => {
      (useRefinementWizardStore as unknown as ReturnType<typeof vi.fn>).mockReturnValue({
        ...defaultStoreState,
        step: 1,
        analysisResult: {
          atomicity: {
            isAtomic: false,
            confidence: 0.5,
            violations: ['Found compound statement'],
          },
        },
        refinedDescription: 'Test description',
      });

      render(<CreateAtomDialog />, { wrapper: createWrapper() });
      expect(screen.getByText('Needs Refinement')).toBeInTheDocument();
    });

    it('shows violations when present', () => {
      (useRefinementWizardStore as unknown as ReturnType<typeof vi.fn>).mockReturnValue({
        ...defaultStoreState,
        step: 1,
        analysisResult: {
          atomicity: {
            isAtomic: false,
            confidence: 0.5,
            violations: ['Found compound statement'],
          },
        },
        refinedDescription: 'Test description',
      });

      render(<CreateAtomDialog />, { wrapper: createWrapper() });
      expect(screen.getByText('Found compound statement')).toBeInTheDocument();
    });

    it('displays category selector', () => {
      (useRefinementWizardStore as unknown as ReturnType<typeof vi.fn>).mockReturnValue({
        ...defaultStoreState,
        step: 1,
        analysisResult,
        refinedDescription: 'Test description',
      });

      render(<CreateAtomDialog />, { wrapper: createWrapper() });
      expect(screen.getByText('Category')).toBeInTheDocument();
      expect(screen.getByText('Select category...')).toBeInTheDocument();
    });

    it('disables Continue button without category', () => {
      (useRefinementWizardStore as unknown as ReturnType<typeof vi.fn>).mockReturnValue({
        ...defaultStoreState,
        step: 1,
        analysisResult,
        refinedDescription: 'Test description',
        selectedCategory: null,
      });

      render(<CreateAtomDialog />, { wrapper: createWrapper() });
      const button = screen.getByRole('button', { name: 'Continue' });
      expect(button).toBeDisabled();
    });
  });

  describe('Step 2: Final Review', () => {
    const fullState = {
      ...defaultStoreState,
      step: 2,
      analysisResult: {
        atomicity: {
          isAtomic: true,
          confidence: 0.85,
          violations: [],
        },
      },
      selectedCategory: 'functional',
      refinedDescription: 'Users must be able to log in within 3 seconds',
    };

    it('shows review screen on step 2', () => {
      (useRefinementWizardStore as unknown as ReturnType<typeof vi.fn>).mockReturnValue(fullState);

      render(<CreateAtomDialog />, { wrapper: createWrapper() });
      expect(screen.getByText('Review Your Atom')).toBeInTheDocument();
    });

    it('displays refined description', () => {
      (useRefinementWizardStore as unknown as ReturnType<typeof vi.fn>).mockReturnValue(fullState);

      render(<CreateAtomDialog />, { wrapper: createWrapper() });
      expect(
        screen.getByText('Users must be able to log in within 3 seconds')
      ).toBeInTheDocument();
    });

    it('displays selected category', () => {
      (useRefinementWizardStore as unknown as ReturnType<typeof vi.fn>).mockReturnValue(fullState);

      render(<CreateAtomDialog />, { wrapper: createWrapper() });
      expect(screen.getByText('functional')).toBeInTheDocument();
    });

    it('shows Create Atom button on final step', () => {
      (useRefinementWizardStore as unknown as ReturnType<typeof vi.fn>).mockReturnValue(fullState);

      render(<CreateAtomDialog />, { wrapper: createWrapper() });
      expect(screen.getByRole('button', { name: 'Create Atom' })).toBeInTheDocument();
    });

    it('shows quality warning for low estimated quality', () => {
      (useRefinementWizardStore as unknown as ReturnType<typeof vi.fn>).mockReturnValue({
        ...fullState,
        analysisResult: {
          atomicity: {
            isAtomic: false,
            confidence: 0.3,
            violations: [],
          },
        },
      });

      render(<CreateAtomDialog />, { wrapper: createWrapper() });
      expect(screen.getByText(/may need further refinement/)).toBeInTheDocument();
    });
  });

  describe('Navigation', () => {
    it('calls closeWizard when Cancel is clicked', () => {
      const closeWizard = vi.fn();
      const reset = vi.fn();
      (useRefinementWizardStore as unknown as ReturnType<typeof vi.fn>).mockReturnValue({
        ...defaultStoreState,
        closeWizard,
        reset,
      });

      render(<CreateAtomDialog />, { wrapper: createWrapper() });
      fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));
      expect(closeWizard).toHaveBeenCalled();
      expect(reset).toHaveBeenCalled();
    });

    it('shows Back button on step > 0', () => {
      (useRefinementWizardStore as unknown as ReturnType<typeof vi.fn>).mockReturnValue({
        ...defaultStoreState,
        step: 1,
        analysisResult: {
          atomicity: { isAtomic: true, confidence: 0.85, violations: [] },
        },
        refinedDescription: 'Test',
      });

      render(<CreateAtomDialog />, { wrapper: createWrapper() });
      expect(screen.getByRole('button', { name: 'Back' })).toBeInTheDocument();
    });

    it('calls prevStep when Back is clicked', () => {
      const prevStep = vi.fn();
      (useRefinementWizardStore as unknown as ReturnType<typeof vi.fn>).mockReturnValue({
        ...defaultStoreState,
        step: 1,
        analysisResult: {
          atomicity: { isAtomic: true, confidence: 0.85, violations: [] },
        },
        refinedDescription: 'Test',
        prevStep,
      });

      render(<CreateAtomDialog />, { wrapper: createWrapper() });
      fireEvent.click(screen.getByRole('button', { name: 'Back' }));
      expect(prevStep).toHaveBeenCalled();
    });
  });

  describe('Tags', () => {
    it('allows adding tags on step 2', async () => {
      const user = userEvent.setup();
      (useRefinementWizardStore as unknown as ReturnType<typeof vi.fn>).mockReturnValue({
        ...defaultStoreState,
        step: 2,
        analysisResult: {
          atomicity: { isAtomic: true, confidence: 0.85, violations: [] },
        },
        selectedCategory: 'functional',
        refinedDescription: 'Test description',
      });

      render(<CreateAtomDialog />, { wrapper: createWrapper() });

      const input = screen.getByPlaceholderText('Add a tag...');
      await user.type(input, 'test-tag');
      await user.click(screen.getByRole('button', { name: 'Add' }));

      expect(screen.getByText('test-tag')).toBeInTheDocument();
    });
  });
});

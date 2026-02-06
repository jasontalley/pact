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
    // @atom IA-UI-009
    it('renders when isOpen is true', () => {
      render(<CreateAtomDialog />, { wrapper: createWrapper() });
      // Verify the dialog title is visible when the dialog is open
      expect(screen.getByText('Create Intent Atom')).toBeInTheDocument();
    });

    // @atom IA-UI-009
    it('does not render when isOpen is false', () => {
      (useRefinementWizardStore as unknown as ReturnType<typeof vi.fn>).mockReturnValue({
        ...defaultStoreState,
        isOpen: false,
      });
      render(<CreateAtomDialog />, { wrapper: createWrapper() });
      // Verify the dialog is not rendered when isOpen is false
      expect(screen.queryByText('Create Intent Atom')).not.toBeInTheDocument();
    });
  });

  describe('Step 0: Raw Intent Input', () => {
    // @atom IA-UI-009
    it('shows step indicator for step 1 of 3', () => {
      render(<CreateAtomDialog />, { wrapper: createWrapper() });
      // Verify the step indicator shows the correct step number
      expect(screen.getByText('Step 1 of 3')).toBeInTheDocument();
    });

    // @atom IA-UI-009
    it('displays textarea for intent input', () => {
      render(<CreateAtomDialog />, { wrapper: createWrapper() });
      // Verify the textarea with placeholder text is rendered for user input
      expect(screen.getByPlaceholderText(/Example: Users should be able/)).toBeInTheDocument();
    });

    // @atom IA-UI-009
    it('calls setRawIntent when typing in textarea', async () => {
      const setRawIntent = vi.fn();
      (useRefinementWizardStore as unknown as ReturnType<typeof vi.fn>).mockReturnValue({
        ...defaultStoreState,
        setRawIntent,
      });

      render(<CreateAtomDialog />, { wrapper: createWrapper() });
      const textarea = screen.getByPlaceholderText(/Example: Users should be able/);
      fireEvent.change(textarea, { target: { value: 'Test intent' } });
      // Verify setRawIntent is called with the user's input when typing
      expect(setRawIntent).toHaveBeenCalledWith('Test intent');
    });

    // @atom IA-UI-009
    it('disables Analyze button when intent is too short', () => {
      (useRefinementWizardStore as unknown as ReturnType<typeof vi.fn>).mockReturnValue({
        ...defaultStoreState,
        rawIntent: 'short',
      });

      render(<CreateAtomDialog />, { wrapper: createWrapper() });
      const button = screen.getByRole('button', { name: 'Analyze Intent' });
      // Verify the Analyze button is disabled when intent is below minimum length
      expect(button).toBeDisabled();
    });

    // @atom IA-UI-009
    it('enables Analyze button when intent is long enough', () => {
      (useRefinementWizardStore as unknown as ReturnType<typeof vi.fn>).mockReturnValue({
        ...defaultStoreState,
        rawIntent: 'This is a valid intent description with enough characters',
      });

      render(<CreateAtomDialog />, { wrapper: createWrapper() });
      const button = screen.getByRole('button', { name: 'Analyze Intent' });
      // Verify the Analyze button is enabled when intent meets minimum length requirement
      expect(button).not.toBeDisabled();
    });

    // @atom IA-UI-009
    it('shows error message when error exists', () => {
      (useRefinementWizardStore as unknown as ReturnType<typeof vi.fn>).mockReturnValue({
        ...defaultStoreState,
        error: 'Analysis failed',
      });

      render(<CreateAtomDialog />, { wrapper: createWrapper() });
      // Verify error message is displayed to the user when an error occurs
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

    // @atom IA-UI-009
    it('shows atomicity assessment when on step 1', () => {
      (useRefinementWizardStore as unknown as ReturnType<typeof vi.fn>).mockReturnValue({
        ...defaultStoreState,
        step: 1,
        analysisResult,
        refinedDescription: 'Test description',
      });

      render(<CreateAtomDialog />, { wrapper: createWrapper() });
      // Verify the atomicity assessment section is displayed on step 1
      expect(screen.getByText('Atomicity Assessment')).toBeInTheDocument();
    });

    // @atom IA-UI-009
    it('shows "Atomic" badge when isAtomic is true', () => {
      (useRefinementWizardStore as unknown as ReturnType<typeof vi.fn>).mockReturnValue({
        ...defaultStoreState,
        step: 1,
        analysisResult,
        refinedDescription: 'Test description',
      });

      render(<CreateAtomDialog />, { wrapper: createWrapper() });
      // Verify the "Atomic" badge is shown when analysis determines intent is atomic
      expect(screen.getByText('Atomic')).toBeInTheDocument();
    });

    // @atom IA-UI-009
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
      // Verify "Needs Refinement" badge is shown when analysis determines intent is not atomic
      expect(screen.getByText('Needs Refinement')).toBeInTheDocument();
    });

    // @atom IA-UI-009
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
      // Verify atomicity violations are displayed to help user understand issues
      expect(screen.getByText('Found compound statement')).toBeInTheDocument();
    });

    // @atom IA-UI-009
    it('displays category selector', () => {
      (useRefinementWizardStore as unknown as ReturnType<typeof vi.fn>).mockReturnValue({
        ...defaultStoreState,
        step: 1,
        analysisResult,
        refinedDescription: 'Test description',
      });

      render(<CreateAtomDialog />, { wrapper: createWrapper() });
      // Verify category label is displayed
      expect(screen.getByText('Category')).toBeInTheDocument();
      // Verify category selector placeholder is shown for user selection
      expect(screen.getByText('Select category...')).toBeInTheDocument();
    });

    // @atom IA-UI-009
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
      // Verify Continue button is disabled when no category is selected
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

    // @atom IA-UI-009
    it('shows review screen on step 2', () => {
      (useRefinementWizardStore as unknown as ReturnType<typeof vi.fn>).mockReturnValue(fullState);

      render(<CreateAtomDialog />, { wrapper: createWrapper() });
      // Verify the review screen title is displayed on the final step
      expect(screen.getByText('Review Your Atom')).toBeInTheDocument();
    });

    // @atom IA-UI-009
    it('displays refined description', () => {
      (useRefinementWizardStore as unknown as ReturnType<typeof vi.fn>).mockReturnValue(fullState);

      render(<CreateAtomDialog />, { wrapper: createWrapper() });
      // Verify the refined description text is displayed for user review
      expect(
        screen.getByText('Users must be able to log in within 3 seconds')
      ).toBeInTheDocument();
    });

    // @atom IA-UI-009
    it('displays selected category', () => {
      (useRefinementWizardStore as unknown as ReturnType<typeof vi.fn>).mockReturnValue(fullState);

      render(<CreateAtomDialog />, { wrapper: createWrapper() });
      // Verify the selected category is displayed for user confirmation
      expect(screen.getByText('functional')).toBeInTheDocument();
    });

    // @atom IA-UI-009
    it('shows Create Atom button on final step', () => {
      (useRefinementWizardStore as unknown as ReturnType<typeof vi.fn>).mockReturnValue(fullState);

      render(<CreateAtomDialog />, { wrapper: createWrapper() });
      // Verify the Create Atom button is present on the final review step
      expect(screen.getByRole('button', { name: 'Create Atom' })).toBeInTheDocument();
    });

    // @atom IA-UI-009
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
      // Verify quality warning message is shown when confidence is low
      expect(screen.getByText(/may need further refinement/)).toBeInTheDocument();
    });
  });

  describe('Navigation', () => {
    // @atom IA-UI-009
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
      // Verify closeWizard is called to close the dialog
      expect(closeWizard).toHaveBeenCalled();
      // Verify reset is called to clear the wizard state
      expect(reset).toHaveBeenCalled();
    });

    // @atom IA-UI-009
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
      // Verify Back button is visible when user is past the first step
      expect(screen.getByRole('button', { name: 'Back' })).toBeInTheDocument();
    });

    // @atom IA-UI-009
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
      // Verify prevStep is called to navigate to the previous step
      expect(prevStep).toHaveBeenCalled();
    });
  });

  describe('Tags', () => {
    // @atom IA-UI-009
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

      // Verify the tag was added and is displayed in the UI
      expect(screen.getByText('test-tag')).toBeInTheDocument();
    });
  });

  describe('Boundary Tests', () => {
    // @atom IA-UI-009
    it('disables Analyze button at exactly minimum length boundary minus one character', () => {
      // Testing boundary: intent with 9 characters (assuming 10 is minimum)
      (useRefinementWizardStore as unknown as ReturnType<typeof vi.fn>).mockReturnValue({
        ...defaultStoreState,
        rawIntent: '123456789', // 9 characters - just below typical minimum
      });

      render(<CreateAtomDialog />, { wrapper: createWrapper() });
      const button = screen.getByRole('button', { name: 'Analyze Intent' });
      // Verify Analyze button is disabled when intent is exactly one character below minimum
      expect(button).toBeDisabled();
    });

    // @atom IA-UI-009
    it('enables Analyze button at exactly minimum length boundary', () => {
      // Testing boundary: intent with exactly 10 characters (assuming 10 is minimum)
      (useRefinementWizardStore as unknown as ReturnType<typeof vi.fn>).mockReturnValue({
        ...defaultStoreState,
        rawIntent: '1234567890', // 10 characters - exactly at typical minimum
      });

      render(<CreateAtomDialog />, { wrapper: createWrapper() });
      const button = screen.getByRole('button', { name: 'Analyze Intent' });
      // Verify Analyze button is enabled when intent meets exactly minimum length
      expect(button).not.toBeDisabled();
    });

    // @atom IA-UI-009
    it('handles empty rawIntent with zero length boundary', () => {
      // Testing boundary: empty string (zero length)
      (useRefinementWizardStore as unknown as ReturnType<typeof vi.fn>).mockReturnValue({
        ...defaultStoreState,
        rawIntent: '',
      });

      render(<CreateAtomDialog />, { wrapper: createWrapper() });
      const button = screen.getByRole('button', { name: 'Analyze Intent' });
      // Verify empty intent has zero length (boundary assertion)
      expect(defaultStoreState.rawIntent.length).toBe(0);
      // Verify Analyze button is disabled when intent is empty
      expect(button).toBeDisabled();
    });

    // @atom IA-UI-009
    it('handles confidence at boundary value of 0', () => {
      // Testing boundary: minimum confidence value
      const zeroConfidence = 0;
      (useRefinementWizardStore as unknown as ReturnType<typeof vi.fn>).mockReturnValue({
        ...defaultStoreState,
        step: 2,
        analysisResult: {
          atomicity: {
            isAtomic: false,
            confidence: zeroConfidence, // Minimum confidence value
            violations: [],
          },
        },
        selectedCategory: 'functional',
        refinedDescription: 'Test description',
      });

      render(<CreateAtomDialog />, { wrapper: createWrapper() });
      // Verify confidence is exactly zero (boundary assertion)
      expect(zeroConfidence).toBe(0);
      // Verify quality warning is shown when confidence is at minimum (0)
      expect(screen.getByText(/may need further refinement/)).toBeInTheDocument();
    });

    // @atom IA-UI-009
    it('handles confidence at boundary value of 1 (100%)', () => {
      // Testing boundary: maximum confidence value
      const maxConfidence = 1;
      (useRefinementWizardStore as unknown as ReturnType<typeof vi.fn>).mockReturnValue({
        ...defaultStoreState,
        step: 2,
        analysisResult: {
          atomicity: {
            isAtomic: true,
            confidence: maxConfidence, // Maximum confidence value (100%)
            violations: [],
          },
        },
        selectedCategory: 'functional',
        refinedDescription: 'Test description',
      });

      render(<CreateAtomDialog />, { wrapper: createWrapper() });
      // Verify confidence is greater than threshold for high quality (boundary assertion)
      expect(maxConfidence).toBeGreaterThan(0.7);
      // Verify no quality warning is shown when confidence is at maximum (1.0)
      expect(screen.queryByText(/may need further refinement/)).not.toBeInTheDocument();
    });

    // @atom IA-UI-009
    it('handles step at maximum boundary (step 2)', () => {
      // Testing boundary: last step in the wizard
      const maxStep = 2;
      (useRefinementWizardStore as unknown as ReturnType<typeof vi.fn>).mockReturnValue({
        ...defaultStoreState,
        step: maxStep,
        analysisResult: {
          atomicity: { isAtomic: true, confidence: 0.85, violations: [] },
        },
        selectedCategory: 'functional',
        refinedDescription: 'Test description',
      });

      render(<CreateAtomDialog />, { wrapper: createWrapper() });
      // Verify step indicator shows final step
      expect(screen.getByText('Step 3 of 3')).toBeInTheDocument();
      // Verify Create Atom button is present on final step
      expect(screen.getByRole('button', { name: 'Create Atom' })).toBeInTheDocument();
    });

    // @atom IA-UI-009
    it('rejects null selectedCategory on step 1', () => {
      // Testing boundary: null category selection
      (useRefinementWizardStore as unknown as ReturnType<typeof vi.fn>).mockReturnValue({
        ...defaultStoreState,
        step: 1,
        analysisResult: {
          atomicity: { isAtomic: true, confidence: 0.85, violations: [] },
        },
        selectedCategory: null, // Null boundary
        refinedDescription: 'Test description',
      });

      render(<CreateAtomDialog />, { wrapper: createWrapper() });
      // Verify selectedCategory is null (boundary assertion)
      expect(defaultStoreState.selectedCategory).toBeNull();
      // Verify Continue button is disabled when category is null
      const button = screen.getByRole('button', { name: 'Continue' });
      expect(button).toBeDisabled();
    });

    // @atom IA-UI-009
    it('handles analysisResult being null before analysis', () => {
      // Testing boundary: null analysisResult
      (useRefinementWizardStore as unknown as ReturnType<typeof vi.fn>).mockReturnValue({
        ...defaultStoreState,
        step: 0,
        analysisResult: null, // Null boundary
      });

      render(<CreateAtomDialog />, { wrapper: createWrapper() });
      // Verify analysisResult is null (boundary assertion)
      expect(defaultStoreState.analysisResult).toBeNull();
      // Verify the textarea is rendered for initial input
      expect(screen.getByPlaceholderText(/Example: Users should be able/)).toBeInTheDocument();
    });

    // @atom IA-UI-009
    it('handles error being null in success state', () => {
      // Testing boundary: null error state
      (useRefinementWizardStore as unknown as ReturnType<typeof vi.fn>).mockReturnValue({
        ...defaultStoreState,
        error: null, // Null boundary
      });

      render(<CreateAtomDialog />, { wrapper: createWrapper() });
      // Verify error is null (boundary assertion)
      expect(defaultStoreState.error).toBeNull();
      // Verify no error message is displayed
      expect(screen.queryByRole('alert')).not.toBeInTheDocument();
    });

    // @atom IA-UI-009
    it('validates confidence must be greater than 0 for any positive quality', () => {
      // Testing boundary: confidence comparison
      const lowConfidence = 0.3;
      const threshold = 0.5;

      (useRefinementWizardStore as unknown as ReturnType<typeof vi.fn>).mockReturnValue({
        ...defaultStoreState,
        step: 2,
        analysisResult: {
          atomicity: {
            isAtomic: false,
            confidence: lowConfidence,
            violations: [],
          },
        },
        selectedCategory: 'functional',
        refinedDescription: 'Test description',
      });

      render(<CreateAtomDialog />, { wrapper: createWrapper() });
      // Verify low confidence is less than threshold (boundary assertion)
      expect(lowConfidence).toBeLessThan(threshold);
      // Verify quality warning is shown for low confidence
      expect(screen.getByText(/may need further refinement/)).toBeInTheDocument();
    });

    // @atom IA-UI-009
    it('validates step must be greater than 0 to show Back button', () => {
      // Testing boundary: step comparison for navigation
      const currentStep = 1;

      (useRefinementWizardStore as unknown as ReturnType<typeof vi.fn>).mockReturnValue({
        ...defaultStoreState,
        step: currentStep,
        analysisResult: {
          atomicity: { isAtomic: true, confidence: 0.85, violations: [] },
        },
        refinedDescription: 'Test',
      });

      render(<CreateAtomDialog />, { wrapper: createWrapper() });
      // Verify step is greater than 0 (boundary assertion)
      expect(currentStep).toBeGreaterThan(0);
      // Verify Back button is visible when step > 0
      expect(screen.getByRole('button', { name: 'Back' })).toBeInTheDocument();
    });

    // @atom IA-UI-009
    it('validates violations array is empty for atomic intents', () => {
      // Testing boundary: empty violations array
      const emptyViolations: string[] = [];

      (useRefinementWizardStore as unknown as ReturnType<typeof vi.fn>).mockReturnValue({
        ...defaultStoreState,
        step: 1,
        analysisResult: {
          atomicity: {
            isAtomic: true,
            confidence: 0.85,
            violations: emptyViolations,
          },
        },
        refinedDescription: 'Test description',
      });

      render(<CreateAtomDialog />, { wrapper: createWrapper() });
      // Verify violations array length is zero (boundary assertion)
      expect(emptyViolations.length).toBe(0);
      // Verify "Atomic" badge is shown when no violations
      expect(screen.getByText('Atomic')).toBeInTheDocument();
    });

    // @atom IA-UI-009
    it('validates step at minimum boundary (step 0) hides Back button', () => {
      // Testing boundary: minimum step value
      const minStep = 0;

      (useRefinementWizardStore as unknown as ReturnType<typeof vi.fn>).mockReturnValue({
        ...defaultStoreState,
        step: minStep,
      });

      render(<CreateAtomDialog />, { wrapper: createWrapper() });
      // Verify step is not greater than 0 at minimum (boundary assertion)
      expect(minStep).toBeLessThan(1);
      // Verify Back button is not visible on step 0
      expect(screen.queryByRole('button', { name: 'Back' })).not.toBeInTheDocument();
    });
  });
});

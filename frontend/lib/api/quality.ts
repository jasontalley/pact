import { apiClient } from './client';

export interface QualityDimensionScore {
  score: number;
  label: string;
  weight: number;
}

export interface TestQualityResult {
  overallScore: number;
  grade: string;
  dimensions: Record<string, QualityDimensionScore>;
}

export interface QualityProfile {
  id: string;
  name: string;
  description: string | null;
  projectId: string | null;
  isDefault: boolean;
  createdAt: string;
  updatedAt: string;
}

export const qualityApi = {
  analyzeTest: async (sourceCode: string, options?: {
    profileId?: string;
    testRecordId?: string;
  }): Promise<TestQualityResult> => {
    const response = await apiClient.post<TestQualityResult>('/quality/analyze-test', {
      sourceCode,
      ...options,
    });
    return response.data;
  },

  getProfiles: async (): Promise<QualityProfile[]> => {
    const response = await apiClient.get<QualityProfile[]>('/quality/profiles');
    return response.data;
  },
};

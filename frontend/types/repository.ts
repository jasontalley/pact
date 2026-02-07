/**
 * Repository configuration types
 */

export interface RepositoryConfig {
  repositoryPath: string;
  isValid: boolean;
  isGitRepo?: boolean;
  projectId?: string;
  projectName?: string;
}

export interface UpdateRepositoryConfigRequest {
  repositoryPath: string;
}

export interface ValidatePathResult {
  path: string;
  exists: boolean;
  isDirectory: boolean;
  isReadable: boolean;
  isGitRepo?: boolean;
  fileCount?: number;
  error?: string;
}

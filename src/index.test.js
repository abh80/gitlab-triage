import { PlatinumTriage } from './index.js';
import { jest } from '@jest/globals';
import chalk from 'chalk';

describe('PlatinumTriage.processProject', () => {
  let triage;
  let mockGitlab;
  
  beforeEach(() => {
    // Set up mocks
    mockGitlab = {
      Projects: {
        show: jest.fn()
      }
    };
    
    // Create instance with mocked gitlab
    triage = new PlatinumTriage({ token: 'test-token' });
    triage.gitlab = mockGitlab;
    
    // Mock console.log
    console.log = jest.fn();
    
    // Mock processResourceRules
    triage.processResourceRules = jest.fn();
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  it('should successfully process an existing project', async () => {
    const mockProject = {
      id: 123,
      path_with_namespace: 'test/project'
    };
    const mockConfig = { some: 'config' };
    
    mockGitlab.Projects.show.mockResolvedValue(mockProject);

    await triage.processProject(mockConfig, 123, false);

    expect(mockGitlab.Projects.show).toHaveBeenCalledWith(123);
    expect(console.log).toHaveBeenCalledWith(
      chalk.cyan(`\n📁 Processing project: test/project`)
    );
    expect(triage.processResourceRules).toHaveBeenCalledWith(
      mockConfig,
      'project',
      123,
      false
    );
  });

  it('should throw error for non-existent project', async () => {
    mockGitlab.Projects.show.mockResolvedValue(null);

    await expect(triage.processProject({}, 456, false))
      .rejects
      .toThrow('Project with ID 456 not found');

    expect(mockGitlab.Projects.show).toHaveBeenCalledWith(456);
    expect(triage.processResourceRules).not.toHaveBeenCalled();
  });

  it('should handle API errors', async () => {
    mockGitlab.Projects.show.mockRejectedValue(new Error('API Error'));

    await expect(triage.processProject({}, 789, false))
      .rejects
      .toThrow('API Error');

    expect(mockGitlab.Projects.show).toHaveBeenCalledWith(789);
    expect(triage.processResourceRules).not.toHaveBeenCalled();
  });

  it('should pass dry run flag correctly', async () => {
    const mockProject = {
      id: 123,
      path_with_namespace: 'test/project'
    };
    const mockConfig = { some: 'config' };
    
    mockGitlab.Projects.show.mockResolvedValue(mockProject);

    await triage.processProject(mockConfig, 123, true);

    expect(triage.processResourceRules).toHaveBeenCalledWith(
      mockConfig,
      'project',
      123,
      true
    );
  });
});
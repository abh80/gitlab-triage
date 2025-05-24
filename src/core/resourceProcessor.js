import debug from 'debug';

const log = debug('platinum-triage:resourceProcessor');
export class ResourceProcessor {
  constructor(gitlab) {
    this.gitlab = gitlab;
  }

  /**
   * Loads resources from GitLab based on the specified parameters.
   *
   * @param {string} resourceType - The type of resource to load (e.g., 'issues', 'merge_requests').
   * @param {string} sourceType - The source type (e.g., 'project', 'group').
   * @param {string|number} sourceId - The ID of the source (e.g., project ID or group ID).
   * @import { IssueSchema } from "@gitbeaker/rest"
   * @returns {Promise<Array<IssueSchema>>} - A promise that resolves to an array of resources.
   */
  async loadResources(resourceType, sourceType, sourceId) {
    log(`Loading resources: type=${resourceType}, sourceType=${sourceType}, sourceId=${sourceId}`);
    let resources = [];

    try {
      if (resourceType === 'issues') {
        resources = await this.gitlab.Issues.all({ projectId: sourceId });
      } else if (resourceType === 'merge_requests') {
        resources = await this.gitlab.MergeRequests.all({
          projectId: sourceId,
        });
      } else {
        throw new Error(`Unsupported resource type: ${resourceType}`);
      }

      log(`Loaded ${resources.length} resources of type ${resourceType}`);

      return resources;
    } catch (error) {
      log(`Error loading resources: ${error.message}`);
      throw error;
    }
  }
}

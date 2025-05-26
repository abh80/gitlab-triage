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
      if (resourceType === 'issue') {
        resources = await this.gitlab.Issues.all({ projectId: sourceId });
      } else if (resourceType === 'merge_request') {
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

  async loadResourceByIid(resourceType, sourceType, sourceId, iid) {
    log(`Loading resources: type=${resourceType}, sourceType=${sourceType}, sourceId=${sourceId}, iid=${iid}`);
    if (resourceType === 'issue') {
      return await this.gitlab.Issues.show(iid, { projectId: sourceId });
    } else if (resourceType === 'merge_request') {
      return await this.gitlab.MergeRequests.show(sourceId, iid);
    } else {
      throw new Error(`Unsupported resource type: ${resourceType}`);
    }
  }

  getResourceTypeFromReference(resourceReference) {
    if (resourceReference.startsWith('#')) return 'issue';
    else if (resourceReference.startsWith('!')) return 'merge_request';
    else throw new Error(`Invalid resource reference ${resourceReference}`);
  }
}

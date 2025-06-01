import debug from 'debug';
import chalk from 'chalk';
import * as path from 'node:path';
import { pathToFileURL } from 'url';
import { Gitlab } from '@gitbeaker/rest';

const log = debug('platinum-triage:actionExecutor');

export class ActionExecutor {
  /**
   * Creates an instance of the ActionExecutor class.
   *
   * @constructor
   * @import { Gitlab } from '@gitbeaker/rest';
   * @param {Gitlab} gitlab - An instance of the GitLab API client used to interact with GitLab resources.
   */
  constructor(gitlab) {
    this.gitlab = gitlab;
    this.extensionLoaded = new Map();
  }

  registerExtension(extensionClass, alias) {
      if (!extensionClass || !alias) {
        throw new Error("Both extensionClass and alias are required to register an extension.");
      }
      this.extensionLoaded.set(alias, new extensionClass(this));
    }

  /**
   * Executes actions on the provided resources.
   *
   * @param {Object} actions - The actions to execute.
   * @param {Array} resources - The resources to apply the actions to.
   * @param {string} resourceType - The type of resource (e.g., 'issues', 'merge_requests').
   * @param {boolean} dryRun - If true, simulates the actions without making actual changes.
   */
  async execute(actions, resources, resourceType, dryRun) {
    for (let resource of resources) {
      console.log(chalk.yellow(`Executing actions for resource: ${resource.id}`));
      if (actions.labels) {
        resource = await this.addLabels(resource, actions.labels, resourceType, dryRun);
      }
      if (actions.remove_labels) {
        resource = await this.removeLabels(resource, actions.remove_labels, resourceType, dryRun);
      }
      if (actions.status) {
        resource = await this.changeStatus(resource, actions.status, resourceType, dryRun);
      }
      if (actions.mention) {
        resource = await this.mentionUsers(resource, actions.mention, resourceType, dryRun);
      }
      if (actions.move && resourceType === 'issue') {
        resource = await this.moveResource(resource, actions.move, dryRun);
      }
      if (actions.comment) {
        await this.addComment(resource, actions, resourceType, dryRun);
      }
      if (actions.delete && resourceType === 'branch') {
        await this.deleteBranch(resource, dryRun);
      }
      if (actions.assignee) {
        resource = await this.assignResource(resource, actions.assignee, resourceType, dryRun);
      }
      if (actions.reviewer && resourceType === 'merge_request') {
        resource = await this.assignReviewer(resource, actions.reviewer, dryRun);
      }
      if (actions.merge && resourceType === 'merge_request') {
        resource = await this.mergeMergeRequest(resource, actions.merge, dryRun);
      }
      if (actions.extension) {
        log('Executing custom script action from ' + actions.extension);
        if (this.extensionLoaded.has(actions.extension)) {
          log("Founded already loaded extension")
          await this.extensionLoaded.get(actions.extension).run(resource, resourceType, dryRun)
          return;
        }
        const filePath = path.join(process.cwd(), actions.extension);
        const fileUrl = pathToFileURL(path.resolve(filePath)).href;
        const script = await import(fileUrl);
        const instanceOfScript = new script.default(this);
        await instanceOfScript.run(resource, resourceType, dryRun);
      }
    }
  }

  /**
   * Gets the appropriate API client based on resource type
   * @param {string} resourceType - The type of resource
   * @returns {Object} - The appropriate GitLab API client
   */
  getApiClient(resourceType) {
    switch (resourceType) {
      case 'issue':
        return this.gitlab.Issues;
      case 'merge_request':
        return this.gitlab.MergeRequests;
      default:
        throw new Error(`Unsupported resource type: ${resourceType}`);
    }
  }

  /**
   * Gets the appropriate notes API client based on resource type
   * @param {string} resourceType - The type of resource
   * @returns {Object} - The appropriate GitLab notes API client
   */
  getNotesApiClient(resourceType) {
    switch (resourceType) {
      case 'issue':
        return this.gitlab.IssueNotes;
      case 'merge_request':
        return this.gitlab.MergeRequestNotes;
      default:
        throw new Error(`Unsupported resource type: ${resourceType}`);
    }
  }

  /**
   * @import { IssueSchema, MergeRequestSchema} from "@gitbeaker/rest"
   * @param {IssueSchema|MergeRequestSchema} resource - The resource object containing data to replace placeholders.
   * @param {Array<string>} labels - Labels to add
   * @param {string} resourceType - The type of resource
   * @param {boolean} dryRun - If true, simulates the action
   */
  async addLabels(resource, labels, resourceType, dryRun) {
    log(`Adding labels: ${labels} to ${resourceType}: ${resource.id}`);
    resource.labels = [...resource.labels, ...labels];
    if (!dryRun) {
      const apiClient = this.getApiClient(resourceType);
      return await apiClient.edit(resource.project_id, resource.iid, {
        labels: resource.labels,
      });
    }
    return resource;
  }

  async removeLabels(resource, labels, resourceType, dryRun) {
    log(`Removing labels: ${labels} from ${resourceType}: ${resource.id}`);
    resource.labels = resource.labels.filter(x => !labels.includes(x));
    if (!dryRun) {
      const apiClient = this.getApiClient(resourceType);
      return await apiClient.edit(resource.project_id, resource.iid, {
        labels: resource.labels,
      });
    }
    return resource;
  }

  async changeStatus(resource, status, resourceType, dryRun) {
    log(`Changing status to: ${status} for ${resourceType}: ${resource.id}`);
    if (!dryRun) {
      const apiClient = this.getApiClient(resourceType);
      const updateParams = {};

      if (resourceType === 'issue') {
        updateParams.stateEvent = status;
      } else if (resourceType === 'merge_request') {
        // For merge requests, status can be 'close', 'reopen', or 'merge'
        if (status === 'close' || status === 'reopen') {
          updateParams.stateEvent = status;
        } else if (status === 'merge') {
          // Handle merge separately as it requires different API call
          return await this.mergeMergeRequest(resource, { when_pipeline_succeeds: false }, dryRun);
        }
      }

      return await apiClient.edit(resource.project_id, resource.iid, updateParams);
    }

    return resource;
  }

  async assignResource(resource, assigneeId, resourceType, dryRun) {
    log(`Assigning ${resourceType}: ${resource.id} to user: ${assigneeId}`);
    if (!dryRun) {
      const apiClient = this.getApiClient(resourceType);
      return await apiClient.edit(resource.project_id, resource.iid, {
        assignee_id: assigneeId,
      });
    }
    return resource;
  }

  async assignReviewer(resource, reviewerIds, dryRun) {
    log(`Assigning reviewers: ${reviewerIds} to merge request: ${resource.id}`);
    if (!dryRun) {
      return await this.gitlab.MergeRequests.edit(resource.project_id, resource.iid, {
        reviewer_ids: Array.isArray(reviewerIds) ? reviewerIds : [reviewerIds],
      });
    }
    return resource;
  }

  async mergeMergeRequest(resource, mergeOptions, dryRun) {
    log(`Merging merge request: ${resource.id}`);
    if (!dryRun) {
      if (mergeOptions.cancel) {
        log(`Canceling merge request: ${resource.id}`);
        return await this.gitlab.MergeRequests.cancelOnPipelineSuccess(resource.project_id, resource.iid);
      }
      
      return await this.gitlab.MergeRequests.merge(resource.project_id, resource.iid, mergeOptions);
    }
    return resource;
  }

  async mentionUsers(resource, users, resourceType, dryRun) {
    const mentionText = users.map((user) => `@${user}`).join(' ');
    log(`Mentioning users: ${mentionText} for ${resourceType}: ${resource.id}`);
    if (!dryRun) {
      const notesClient = this.getNotesApiClient(resourceType);
      await notesClient.create(resource.project_id, resource.iid, mentionText);
    }
    return resource;
  }

  async moveResource(resource, targetProjectPath, dryRun) {
    log(`Moving issue: ${resource.id} to project: ${targetProjectPath}`);
    if (!dryRun) {
      // Note: Only issues can be moved, not merge requests
      return await this.gitlab.Issues.move(resource.project_id, resource.iid, targetProjectPath);
    }
    return resource;
  }

  async addComment(resource, actions, resourceType, dryRun) {
    const { comment_type, comment_internal } = actions;
    const comment = unmarkComment(resource, actions.comment);
    log(`Adding comment to ${resourceType}: ${resource.id} ${comment}`);
    if (!dryRun) {
      const options = {
        internal: comment_internal || false,
      };

      // Note: comment_type might not be applicable for merge requests
      if (resourceType === 'issue' && comment_type) {
        options.type = comment_type;
      }

      const notesClient = this.getNotesApiClient(resourceType);
      return notesClient.create(resource.project_id, resource.iid, comment, options);
    }

    return resource;
  }

  async deleteBranch(resource, dryRun) {
    log(`Deleting branch: ${resource.name}`);
    if (!dryRun) {
      await this.gitlab.Branches.remove(resource.project_id, resource.name);
    }

    return resource;
  }

  /**
   * Executes summary actions.
   *
   * @param {Object} summarize - The summarize action configuration.
   * @param {Array} summaryData - The data to include in the summary.
   * @param {string} resourceType - The type of resource being summarized.
   * @param {boolean} dryRun - If true, simulates the actions without making actual changes.
   */
  async executeSummary(summarize, summaryData, resourceType, dryRun) {
    log(`Executing summary action: ${summarize.title}`);
    const items = summaryData.map((data) => data.summary.item).join('\n');
    const summary = summarize.summary.replace('{{items}}', items).replace('{{type}}', resourceType);

    if (!dryRun) {
      await this.gitlab.Issues.create(
        summarize.destination || summaryData[0].resources[0].project_id,
        summarize.title,
        { description: summary },
      );
    }
  }
}

/**
 * Replaces placeholders in a comment template with corresponding values from a resource object.
 *
 * @import { IssueSchema, MergeRequestSchema} from "@gitbeaker/rest"
 * @param {IssueSchema|MergeRequestSchema} resource - The resource object containing data to replace placeholders.
 * @param {string} commentTemplate - The template string containing placeholders in the format `{{key}}`.
 * @returns {string} - The resulting string with placeholders replaced by resource values.
 *
 * The `resource` object can include the following properties:
 * - `created_at` (string): The creation timestamp of the resource.
 * - `updated_at` (string): The last updated timestamp of the resource.
 * - `closed_at` (string): The timestamp when the resource was closed.
 * - `merged_at` (string): The timestamp when the resource was merged (merge requests only).
 * - `state` (string): The current state of the resource (e.g., open, closed, merged).
 * - `author` (string): The username of the author of the resource.
 * - `assignee` (string|null): The username of the assigned user, or null if unassigned.
 * - `assignees` (Array<string>|null): An array of usernames of assigned users, or null if none.
 * - `reviewers` (Array<string>|null): An array of usernames of reviewers, or null if none (merge requests only).
 * - `closed_by` (string|null): The username of the user who closed the resource, or null if not applicable.
 * - `merged_by` (string|null): The username of the user who merged the resource, or null if not applicable (merge requests only).
 * - `milestone` (string|null): The milestone associated with the resource, or null if none.
 * - `labels` (Array<string>|null): An array of labels associated with the resource, or null if none.
 * - `upvotes` (number): The number of upvotes the resource has received.
 * - `downvotes` (number): The number of downvotes the resource has received.
 * - `title` (string): The title of the resource.
 * - `web_url` (string): The web URL of the resource.
 * - `full_reference` (string): The full reference string of the resource (e.g., project/issue number).
 * - `type` (string): The type of the resource (e.g., issue, merge request).
 * - `source_branch` (string): The source branch name (merge requests only).
 * - `target_branch` (string): The target branch name (merge requests only).
 * - `merge_status` (string): The merge status (merge requests only).
 * - `pipeline_status` (string): The pipeline status (merge requests only).
 *
 * The `commentTemplate` string uses placeholders wrapped in double curly braces.
 * For example, `{{author}}` will be replaced with the `author` property of the resource.
 * If a placeholder does not have a corresponding property in the resource object, it will be replaced with an empty string.
 */
function unmarkComment(resource, commentTemplate) {
  const placeholders = {
    created_at: resource.created_at,
    updated_at: resource.updated_at,
    closed_at: resource.closed_at,
    merged_at: resource.merged_at,
    state: resource.state,
    author: resource.author ? `@${resource.author.username}` : '',
    assignee: resource.assignee ? `@${resource.assignee.username}` : null,
    assignees: resource.assignees ? resource.assignees.map((a) => `@${a.username || a}`).join(', ') : null,
    reviewers: resource.reviewers ? resource.reviewers.map((r) => `@${r.username || r}`).join(', ') : null,
    closed_by: resource.closed_by ? `@${resource.closed_by.username}` : null,
    merged_by: resource.merged_by ? `@${resource.merged_by.username}` : null,
    milestone: resource.milestone ? resource.milestone.title : null,
    labels: resource.labels ? resource.labels.map((l) => `~${l}`).join(', ') : null,
    upvotes: resource.upvotes,
    downvotes: resource.downvotes,
    title: resource.title,
    web_url: resource.web_url,
    full_reference: resource.references ? resource.references.full : '',
    type: resource.type || (resource.merge_status !== undefined ? 'merge_request' : 'issue'),
    // Merge request specific fields
    source_branch: resource.source_branch,
    target_branch: resource.target_branch,
    merge_status: resource.merge_status,
    pipeline_status: resource.head_pipeline ? resource.head_pipeline.status : null,
  };

  return commentTemplate.replace(/{{(.*?)}}/g, (_, key) => placeholders[key] || '');
}
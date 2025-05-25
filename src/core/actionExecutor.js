import debug from 'debug';

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
    for (const resource of resources) {
      log(`Executing actions for resource: ${resource.id}`);
      if (actions.labels) {
        await this.addLabels(resource, actions.labels, dryRun);
      }
      if (actions.remove_labels) {
        await this.removeLabels(resource, actions.remove_labels, dryRun);
      }
      if (actions.status) {
        await this.changeStatus(resource, actions.status, dryRun);
      }
      if (actions.mention) {
        await this.mentionUsers(resource, actions.mention, dryRun);
      }
      if (actions.move) {
        await this.moveResource(resource, actions.move, dryRun);
      }
      if (actions.comment) {
        await this.addComment(resource, actions, dryRun);
      }
      if (actions.delete && resourceType === 'branches') {
        await this.deleteBranch(resource, dryRun);
      }
    }
  }

  /**
   * @import { IssueSchema, MergeRequestSchema} from "@gitbeaker/rest"
   * @param {IssueSchema|MergeRequestSchema} resource - The resource object containing data to replace placeholders.
   * @param labels
   * @param dryRun
   */
  async addLabels(resource, labels, dryRun) {
    log(`Adding labels: ${labels} to resource: ${resource.id}`);
    if (!dryRun) {
      await this.gitlab.Issues.edit(resource.project_id, resource.iid, {
        labels: [...resource.labels, ...labels],
      });
    }
  }

  async removeLabels(resource, labels, dryRun) {
    log(`Removing labels: ${labels} from resource: ${resource.id}`);
    if (!dryRun) {
      await this.gitlab.Issues.edit(resource.project_id, resource.iid, {
        labels: resource.labels.filter(x => !labels.contains(x)),
      });
    }
  }

  async changeStatus(resource, status, dryRun) {
    log(`Changing status to: ${status} for resource: ${resource.id}`);
    if (!dryRun) {
      if (status === 'close') {
        await this.gitlab.Issues.edit(resource.project_id, resource.iid, {
          stateEvent: 'close',
        });
      } else if (status === 'reopen') {
        await this.gitlab.Issues.edit(resource.project_id, resource.iid, {
          stateEvent: 'reopen',
        });
      }
    }
  }

  async mentionUsers(resource, users, dryRun) {
    const mentionText = users.map((user) => `@${user}`).join(' ');
    log(`Mentioning users: ${mentionText} for resource: ${resource.id}`);
    if (!dryRun) {
      await this.gitlab.IssueNotes.create(resource.project_id, resource.iid, mentionText);
    }
  }

  async moveResource(resource, targetProjectPath, dryRun) {
    log(`Moving resource: ${resource.id} to project: ${targetProjectPath}`);
    if (!dryRun) {
      await this.gitlab.Issues.move(resource.project_id, resource.iid, targetProjectPath);
    }
  }

  async addComment(resource, actions, dryRun) {
    const { comment_type, comment_internal } = actions;
    const comment = unmarkComment(resource, actions.comment);
    log(`Adding comment to resource: ${resource.id} ${comment}`);
    if (!dryRun) {
      const options = {
        internal: comment_internal || false,
        type: comment_type || 'comment',
      };
      await this.gitlab.IssueNotes.create(resource.project_id, resource.iid, comment, options);
    }
  }

  async deleteBranch(resource, dryRun) {
    log(`Deleting branch: ${resource.name}`);
    if (!dryRun) {
      await this.gitlab.Branches.remove(resource.project_id, resource.name);
    }
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
 * - `merged_at` (string): The timestamp when the resource was merged.
 * - `state` (string): The current state of the resource (e.g., open, closed).
 * - `author` (string): The username of the author of the resource.
 * - `assignee` (string|null): The username of the assigned user, or null if unassigned.
 * - `assignees` (Array<string>|null): An array of usernames of assigned users, or null if none.
 * - `reviewers` (Array<string>|null): An array of usernames of reviewers, or null if none.
 * - `closed_by` (string|null): The username of the user who closed the resource, or null if not applicable.
 * - `merged_by` (string|null): The username of the user who merged the resource, or null if not applicable.
 * - `milestone` (string|null): The milestone associated with the resource, or null if none.
 * - `labels` (Array<string>|null): An array of labels associated with the resource, or null if none.
 * - `upvotes` (number): The number of upvotes the resource has received.
 * - `downvotes` (number): The number of downvotes the resource has received.
 * - `title` (string): The title of the resource.
 * - `web_url` (string): The web URL of the resource.
 * - `full_reference` (string): The full reference string of the resource (e.g., project/issue number).
 * - `type` (string): The type of the resource (e.g., issue, merge request).
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
    author: `@${resource.author.username}`,
    assignee: resource.assignee ? `@${resource.assignee}` : null,
    assignees: resource.assignees ? resource.assignees.map((a) => `@${a}`).join(', ') : null,
    reviewers: resource.reviewers ? resource.reviewers.map((r) => `@${r}`).join(', ') : null,
    closed_by: resource.closed_by ? `@${resource.closed_by}` : null,
    merged_by: resource.merged_by ? `@${resource.merged_by}` : null,
    milestone: resource.milestone,
    labels: resource.labels ? resource.labels.map((l) => `~${l}`).join(', ') : null,
    upvotes: resource.upvotes,
    downvotes: resource.downvotes,
    title: resource.title,
    web_url: resource.web_url,
    full_reference: resource.references.full,
    type: resource.type,
  };

  return commentTemplate.replace(/{{(.*?)}}/g, (_, key) => placeholders[key] || '');
}

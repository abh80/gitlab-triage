import debug from 'debug';
import chalk from 'chalk';
import { Gitlab } from '@gitbeaker/rest';
import { PlatinumTriage } from './index.js';
import CommandFramework from './core/CommandFramework.js';

const log = debug('platinum-triage:hooks');

export class PlatinumTriageHookManager extends PlatinumTriage {
    config;

    async init(policiesFile = './.triage-policies.yml') {
        this.config = await this.loadConfig(policiesFile);
        if (this.config.host_url && this.config.host_url !== this.hostUrl) {
            this.hostUrl = this.config.host_url;
            this.gitlab = new Gitlab({
                token: this.token,
                host: this.hostUrl,
            });
        }
    }
    
    registerExtension(extensionClass, alias) {
        this.actionExecutor.registerExtension(extensionClass, alias);
    }

    async handleEvent(headers, restBody) {
        if (!this.config) throw new Error(`Policy was not initialized, call the \`init\` function before proceeding.`);
        if (!headers || typeof headers != 'object' || !headers.get('x-gitlab-event')) throw new Error(`Headers was not provided, must be object of Headers received from Gitlab.`);
        if (!restBody || typeof restBody != 'object' || !restBody['object_kind']) throw new Error('Invalid rest body was provided.');

        console.log(chalk.blue(`Processing ${headers.get('X-GITLAB-EVENT')}...`));

        const event_type = restBody['event_type'];

        switch (event_type) {
            case 'issue':
                await this.executeIssueHook(restBody);
                break;
            case 'merge_request':
                await this.executeMergeRequestHook(restBody);
                break;
            case 'note':
                await this.executeNoteHook(restBody);
                break;
            default:
                log(`Unknown event type: ${event_type}`);
                return;
        }
    }

    async executeIssueHook(restBody) {
        const action = restBody.object_attributes.action;

        console.log(chalk.blue(`Running hook rules for Issue ${action}`));

        if (this.config.resource_rules?.issue?.allow_on_hooks === true) {
            console.log(chalk.blue('Now running normal rules on issue ' + restBody.object_attributes.iid));
            await this.processSpecificResource(this.config, 'project', restBody.project?.id, `#${restBody.object_attributes.iid}`);
        }

        // Execute issue-specific hooks
        const hooks = this.getHooks(restBody, 'issue');
        if (hooks.length > 0) {
            console.log(chalk.blue(`Executing ${hooks.length} hooks for event type: issue`));
            for (const hook of hooks) {
                await this.executeResourceHook(hook, restBody, 'issue');
            }
        }

        console.log(chalk.green('Successfully executed issue hook.'));
    }

    async executeMergeRequestHook(restBody) {
        const action = restBody.object_attributes.action;

        console.log(chalk.blue(`Running hook rules for Merge Request ${action}`));

        if (this.config.resource_rules?.merge_request?.allow_on_hooks === true) {
            console.log(chalk.blue('Now running normal rules on merge request ' + restBody.object_attributes.iid));
            await this.processSpecificResource(this.config, 'project', restBody.project?.id, `!${restBody.object_attributes.iid}`);
        }

        // Execute merge request-specific hooks
        const hooks = this.getHooks(restBody, 'merge_request');
        if (hooks.length > 0) {
            console.log(chalk.blue(`Executing ${hooks.length} hooks for event type: merge_request`));
            for (const hook of hooks) {
                await this.executeResourceHook(hook, restBody, 'merge_request');
            }
        }

        console.log(chalk.green('Successfully executed merge request hook.'));
    }

    async executeResourceHook(hook, restBody, resourceType) {
        console.log(chalk.blue(`Running hook ${hook.name} for ${resourceType}`));

        let resource;
        if (resourceType === 'issue' && restBody.object_attributes) {
            resource = await this.resourceProcessor.loadResourceByIid('issue', 'project', restBody.project.id, restBody.object_attributes.iid);
        } else if (resourceType === 'merge_request' && restBody.object_attributes) {
            resource = await this.resourceProcessor.loadResourceByIid('merge_request', 'project', restBody.project.id, restBody.object_attributes.iid);
        }

        if (!resource) {
            console.log(chalk.yellow(`Could not load resource for hook ${hook.name}`));
            return;
        }

        hook.resource = resource;
        hook.resource.hook_rest_body = restBody;

        const conditionResult = await this.evaluateConditions(hook, restBody);
        if (!conditionResult) {
            console.log(chalk.grey(`No condition passed for hook ${hook.name}`));
            return;
        }

        await this.processResourceActions(hook, restBody, resourceType);
    }

    getHooks(restBody, event_type) {
        const resourceRules = this.config.resource_rules || {};
        if (!resourceRules.hooks) return [];
        return resourceRules.hooks.filter(x => x.on === event_type);
    }

    async executeNoteHook(restBody) {
        if (restBody.user.username === this.config.bot_username) return;

        const hooks = this.getHooks(restBody, 'note');
        console.log(chalk.blue(`Executing ${hooks.length} hooks for event type: note`));

        for (const hook of hooks) {
            if (!hook.use_command_framework) {
                console.log(chalk.red('Currently only command framework is supported.'));
                continue;
            }
            console.log(chalk.blue(`Running hook ${hook.name}`));
            const command = hook.command;
            if (!command) throw new Error('No field for command found');

            const cf = new CommandFramework(this.config.bot_username, command);
            const note = restBody.object_attributes.note;

            const match = cf.handleInput(note);

            if (!match || !match.matched) continue;

            let resource;
            let resourceType;

            if (restBody.issue) {
                resource = await this.resourceProcessor.loadResourceByIid('issue', 'project', restBody.project_id, restBody.issue.iid);
                resourceType = 'issue';
            }
            if (restBody.merge_request) {
                resource = await this.resourceProcessor.loadResourceByIid('merge_request', 'project', restBody.project_id, restBody.merge_request.iid);
                resourceType = 'merge_request';
            }

            if (!resource || !resourceType) {
                console.log(chalk.yellow(`Could not determine resource type for note hook ${hook.name}`));
                continue;
            }

            hook.resource = resource;
            hook.resource.hook_rest_body = restBody;

            const conditionResult = await this.evaluateConditions(hook, restBody);
            if (!conditionResult) {
                console.log(chalk.grey(`No condition passed for hook ${hook.name}`));
                continue;
            }
            await this.processHook(hook, restBody, match, resourceType);
        }
    }

    async evaluateConditions(hook, restBody) {
        if (hook.conditions) {
            return this.policyEngine.evaluateConditions(hook.resource, hook.conditions);
        }
        return true; // No conditions means always proceed
    }

    async processHook(hook, restBody, match, resourceType) {
        if (hook.actions) {
            console.log(chalk.blue(`Executing actions for hook on ${resourceType}`));
            await this.executeHookActions(hook, match, resourceType);
        }
    }

    async processResourceActions(hook, restBody, resourceType) {
        if (hook.actions) {
            console.log(chalk.blue(`Executing actions for ${resourceType.slice(0, -1)} hook`));
            await this.executeHookActions(hook, null, resourceType);
        }
    }

    async executeHookActions(hook, match, resourceType) {
        for (const action in hook.actions) {
            try {
                switch (action) {
                    case 'labels': {
                        let labels = [...hook.actions[action]]; // Create a copy
                        if (match && labels.find(x => x === '{{...labels}}')) {
                            labels = labels.filter(x => x !== '{{...labels}}');
                            if (match.variables && match.variables.labels) {
                                match.variables.labels.forEach(x => labels.push(x));
                            }
                        }
                        await this.actionExecutor.addLabels(hook.resource, labels, resourceType, false);
                        break;
                    }
                    case 'remove_labels': {
                        let labels = [...hook.actions[action]]; // Create a copy
                        if (match && labels.find(x => x === '{{...labels}}')) {
                            labels = labels.filter(x => x !== '{{...labels}}');
                            if (match.variables && match.variables.labels) {
                                match.variables.labels.forEach(x => labels.push(x));
                            }
                        }
                        await this.actionExecutor.removeLabels(hook.resource, labels, resourceType, false);
                        break;
                    }
                    case 'status':
                        await this.actionExecutor.changeStatus(hook.resource, hook.actions[action], resourceType, false);
                        break;
                    case 'assignee':
                        await this.actionExecutor.assignResource(hook.resource, hook.actions[action], resourceType, false);
                        break;
                    case 'reviewer':
                        if (resourceType === 'merge_request') {
                            await this.actionExecutor.assignReviewer(hook.resource, hook.actions[action], false);
                        } else {
                            console.log(chalk.yellow(`Reviewer action not supported for ${resourceType}`));
                        }
                        break;
                    case 'merge':
                        if (resourceType === 'merge_request') {
                            const mergeOptions = typeof hook.actions[action] === 'object'
                                ? hook.actions[action]
                                : { when_pipeline_succeeds: false };
                            await this.actionExecutor.mergeMergeRequest(hook.resource, mergeOptions, false);
                        } else {
                            console.log(chalk.yellow(`Merge action not supported for ${resourceType}`));
                        }
                        break;
                    case 'mention':
                        await this.actionExecutor.mentionUsers(hook.resource, hook.actions[action], resourceType, false);
                        break;
                    case 'comment':
                        const commentActions = {
                            comment: hook.actions[action],
                            comment_type: hook.actions.comment_type,
                            comment_internal: hook.actions.comment_internal
                        };
                        const jobId = hook.name.replace(/ /g, '-').toLowerCase();
                        await this.actionExecutor.addComment(hook.resource, commentActions, resourceType, false, jobId);
                        break;
                    case 'move':
                        if (resourceType === 'issue') {
                            await this.actionExecutor.moveResource(hook.resource, hook.actions[action], false);
                        } else {
                            console.log(chalk.yellow(`Move action not supported for ${resourceType}`));
                        }
                        break;
                    default:
                        console.log(chalk.yellow(`Not implemented action ${action} for ${resourceType}`));
                }
            } catch (error) {
                console.error(chalk.red(`Error executing action ${action} for ${resourceType}:`), error);
            }
        }
    }
}
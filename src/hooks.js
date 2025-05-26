import debug from 'debug';
import { parse as parseYaml } from 'yaml';
import chalk from 'chalk';
import { readFileSync } from 'fs';
import { Gitlab } from '@gitbeaker/rest';
import { ConfigValidator } from './core/configValidator.js';
import { PolicyEngine } from './core/policyEngine.js';
import { ResourceProcessor } from './core/resourceProcessor.js';
import { ActionExecutor } from './core/actionExecutor.js';
import { PlatinumTriage } from './index.js';

const log = debug('platinum-triage:hooks');

export class PlatinumTriageHookManager extends PlatinumTriage {
    config;

    init(policiesFile = './.triage-policies.yml') {
        this.config = this.loadConfig(policiesFile);
        if (this.config.host_url && this.config.host_url !== this.hostUrl) {
            this.hostUrl = this.config.host_url;
            this.gitlab = new Gitlab({
                token: this.token,
                host: this.hostUrl,
            });
        }
    }


    async handleEvent(headers, restBody) {
        if (!this.config) throw new Error(`Policy was not initialized, call the \`init\` function before proceeding.`);
        if (!headers || typeof headers != 'object' || !headers['X-GITLAB-EVENT']) throw new Error(`Headers was not provided, must be object of Headers received from Gitlab.`);
        if (!restBody || typeof restBody != 'object' || !restBody['object_kind']) throw new Error('Invalid rest body was provided.');

        console.log(chalk.blue(`Processing ${headers['X-GITLAB-EVENT']}...`));

        const resourceType = restBody['object_kind'] + 's';

        const resourceRules = this.config.resource_rules || {};
        if (!resourceRules.hooks) return console.log(chalk.grey(`No hook rules to proccess.`));

        const event_type = restBody['event_type'];
        const hooks = resourceRules.hooks.find(x => x.on === event_type);

        log(`Processing ${hooks.length} hook rules for ${event_type}`);

        switch (event_type) {
            case 'issue':
                await this.executeIssueHook(hooks, restBody);
                break;
            case 'merge_request':
                await this.executeMergeRequestHook(hooks, restBody);
                break;

            case 'note':
                await this.executeNoteHook(hooks, restBody);
                break;
            default:
                log(`Unknown event type: ${event_type}`);
                return;
        }
    }

    async executeIssueHook(hooks, restBody) {
        const action = restBody.object_attributes.action;

        console.log(chalk.blue(`Running hook rules for Issue ${action}`));
        const resource = this.resourceProcessor.loadResourceByIid('issue', 'project', restBody.project?.id, restBody.object_attributes.iid);

        for (const hook of hooks) {
            try {
                await this.processRule(hook, [resource], 'issue', false);
            } catch (error) {
                console.error(chalk.red(`Error processing rule "${hook.name}": ${error.message}`));
                if (this.debug) {
                    console.error(error.stack);
                }
            }
        }
    }
}

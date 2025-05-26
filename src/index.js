import ora from 'ora';
import debug from 'debug';
import { parse as parseYaml } from 'yaml';
import chalk from 'chalk';
import { readFileSync } from 'fs';
import { Gitlab } from '@gitbeaker/rest';
import { ConfigValidator } from './core/configValidator.js';
import { PolicyEngine } from './core/policyEngine.js';
import { ResourceProcessor } from './core/resourceProcessor.js';
import { ActionExecutor } from './core/actionExecutor.js';

const log = debug('platinum-triage');

export class PlatinumTriage {
  configValidator = new ConfigValidator();
  policyEngine = new PolicyEngine();

  token;
  hostUrl;
  debug;

  /**
   * Creates an instance of PlatinumTriage.
   *
   * @constructor
   * @param {Object} config - Configuration options for the instance.
   * @param {string} config.token - The authentication token used for API requests.
   * @param {string} [config.hostUrl='https://gitlab.com'] - The base URL of the GitLab instance.
   * @param {boolean} [config.debug=false] - Flag to enable or disable debug mode.
   */
  constructor({ token, hostUrl, debug }) {
    this.token = token;
    this.hostUrl = hostUrl || 'https://gitlab.com';
    this.debug = debug || false;

    this.gitlab = new Gitlab({
      token,
      host: hostUrl,
    });

    this.resourceProcessor = new ResourceProcessor(this.gitlab);
    this.actionExecutor = new ActionExecutor(this.gitlab);

  }

  /**
   * Executes the triage process with the specified options.
   *
   * @async
   * @param {Object} [options={}] - Configuration options for the execution.
   * @param {boolean} [options.dryRun=false] - If true, performs a simulation without making actual changes.
   * @param {string} [options.policiesFile='./.triage-policies.yml'] - Path to the policies file used for triage operations.
   * @param {boolean} [options.allProjects=false] - If true, includes all available projects in the triage process.
   * @param {string} [options.source='projects'] - The source to be used, such as 'projects' or other predefined values.
   * @param {string} [options.sourceId] - Identifier for the specific source to be processed.
   * @param {string} [options.resourceReference] - Reference to a specific resource for filtering purposes.
   * @param {string} [options.requireFile] - Specifies a requirement file to be applied during the execution.
   */
  async run(options = {}) {
    const {
      dryRun = false,
      policiesFile = './.triage-policies.yml',
      allProjects = false,
      source = 'projects',
      sourceId,
      resourceReference,
      requireFile,
    } = options;

    log('Starting GitLab Triage with options:', options);

    const config = await this.loadConfig(policiesFile);

    if (config.host_url && config.host_url !== this.hostUrl) {
      this.hostUrl = config.host_url;
      this.gitlab = new Gitlab({
        token: this.token,
        host: this.hostUrl,
      });
    }

    console.log(chalk.blue(`🚀 Starting GitLab Triage (${dryRun ? 'DRY RUN' : 'LIVE MODE'})`));
    console.log(chalk.gray(`Host: ${this.hostUrl}`));

    if (allProjects) {
      await this.processAllProjects(config, dryRun);
    } else if (resourceReference) {
      await this.processSpecificResource(config, source, sourceId, resourceReference, dryRun);
    } else {
      await this.processSource(config, source, sourceId, dryRun);
    }

    console.log(chalk.green('✅ Triage completed successfully'));
  }

  async loadConfig(policiesFile) {
    try {
      const configContent = readFileSync(policiesFile, 'utf8');
      const config = parseYaml(configContent);

      const validationResult = this.configValidator.validate(config);
      if (!validationResult.valid) {
        throw new Error(`Invalid configuration: ${validationResult.errors.join(', ')}`);
      }

      log('Configuration loaded and validated successfully');
      return config;
    } catch (error) {
      if (error.code === 'ENOENT') {
        throw new Error(
          `Policy file not found: ${policiesFile}. Use --init to create an example file.`,
        );
      }
      throw error;
    }
  }

  async processSource(config, source, sourceId, dryRun) {
    if (source === 'groups') {
      await this.processGroup(config, sourceId, dryRun);
    } else {
      await this.processProject(config, sourceId, dryRun);
    }
  }

  async processProject(config, projectId, dryRun) {
    const project = await this.gitlab.Projects.show(projectId);

    if (!project) {
      throw new Error(`Project with ID ${projectId} not found`);
    }

    console.log(chalk.cyan(`\n📁 Processing project: ${project.path_with_namespace}`));

    await this.processResourceRules(config, 'project', project.id, dryRun);
  }

  async processResourceRules(config, sourceType, sourceId, dryRun) {
    const resourceRules = config.resource_rules || {};

    // Process regular rules
    for (const [resourceType, ruleConfig] of Object.entries(resourceRules)) {
      if (ruleConfig.rules) {
        await this.processResourceType(
          ruleConfig.rules,
          resourceType,
          sourceType,
          sourceId,
          dryRun,
        );
      }

      // Process summary policies
      if (ruleConfig.summaries) {
        await this.processSummaryPolicies(
          ruleConfig.summaries,
          resourceType,
          sourceType,
          sourceId,
          dryRun,
        );
      }
    }
  }

  async processResourceType(rules, resourceType, sourceType, sourceId, dryRun) {
    log(`Processing ${rules.length} rules for ${resourceType}`);
    const resources = await this.resourceProcessor.loadResources(
      resourceType,
      sourceType,
      sourceId,
    );

    for (const rule of rules) {
      try {
        await this.processRule(rule, resources, resourceType, dryRun);
      } catch (error) {
        console.error(chalk.red(`Error processing rule "${rule.name}": ${error.message}`));
        if (this.debug) {
          console.error(error.stack);
        }
      }
    }
  }

  async processRule(rule, resources, resourceType, dryRun) {
    if (resources.length === 0) {
      log(`No resources found for rule: ${rule.name}`);
      return;
    }

    console.log(chalk.blue(`\n📋 Rule: ${rule.name}`));
    console.log(chalk.gray(`   Found ${resources.length} matching ${resourceType}`));

    // Filter resources based on conditions
    const filteredResources = this.policyEngine.filterResources(resources, rule.conditions || {});

    if (filteredResources.length === 0) {
      log(`No resources passed conditions for rule: ${rule.name}`);
      return;
    }

    console.log(chalk.gray(`${filteredResources.length} resources passed conditions`));

    // Execute actions
    if (rule.actions) {
      await this.actionExecutor.execute(rule.actions, filteredResources, resourceType, dryRun);
    }
  }

  /**
   * Runs a resource processing operation based on its Instance ID (IID).
   *
   * @async
   * @param {Object} config - The configuration object used for processing.
   * @param {string} sourceId - Identifier for the specific source to be processed.
   * @param {string} source
   * @param {string} resourceReference - The IID of the resource to process.
   * @param {boolean} dryRun - If true, simulates the operation without applying changes.
   * @throws {Error} Throws an error if the resource with the specified IID is not found.
   * @returns {Promise<Object>} The result of the processed resource.
   */
  async runResourceByIID(config, sourceId, source, resourceReference, dryRun) {
    const resourceType = this.resourceProcessor.getResourceTypeFromReference(resourceReference);
    const iid = parseInt(resourceReference.slice(1));
    const resource = await this.resourceProcessor.loadResourceByIid(resourceType, source, sourceId, iid);

    if (!resource) {
      throw new Error(`Resource with IID ${resourceIID} not found.`);
    }
    console.log(chalk.cyan(`📃 Processing single resource ${resourceType}: ${sourceId}:${resourceReference}`));
    const resourceRules = config.resource_rules || {};
    const rulesConfig = resourceRules[resourceType];
    if (!rulesConfig || !rulesConfig.rules) return console.log(chalk.grey(`No rules to proccess for resource type: ${resourceType}`));
    const rules = rulesConfig.rules;
    log(`Processing ${rules.length} rules for ${resourceType}`);

    for (const rule of rules) {
      try {
        await this.processRule(rule, [resource], resourceType, dryRun);
      } catch (error) {
        console.error(chalk.red(`Error processing rule "${rule.name}": ${error.message}`));
        if (this.debug) {
          console.error(error.stack);
        }
      }
    }
  }

  async processSummaryPolicies(summaries, resourceType, sourceType, sourceId, dryRun) {
    for (const summary of summaries) {
      console.log(chalk.blue(`\n📊 Summary Policy: ${summary.name}`));

      const summaryData = [];
      const resources = await this.resourceProcessor.loadResources(
        resourceType,
        sourceType,
        sourceId,
      );

      for (const rule of summary.rules || []) {
        const filteredResources = this.policyEngine.filterResources(
          resources,
          rule.conditions || {},
        );

        if (filteredResources.length > 0 && rule.actions?.summarize) {
          summaryData.push({
            rule,
            resources: filteredResources,
            summary: rule.actions.summarize,
          });
        }
      }

      // Create combined summary
      if (summaryData.length > 0 && summary.actions?.summarize) {
        await this.actionExecutor.executeSummary(
          summary.actions.summarize,
          summaryData,
          resourceType,
          dryRun,
        );
      }
    }
  }

  async processSpecificResource(config, source, sourceId, resourceReference, dryRun) {
    if (source === 'groups') throw new Error('Source groups are not supported yet.');

    await this.runResourceByIID(config, sourceId, source, resourceReference, dryRun);
  }
}

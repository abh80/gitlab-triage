#!/usr/bin/env node

import { Command } from 'commander';
import chalk from 'chalk';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { readFileSync, writeFileSync, existsSync } from 'fs';
import { PlatinumTriage } from '../src/index.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const program = new Command();
const packagePath = join(__dirname, '..', 'package.json');
const packageJson = JSON.parse(readFileSync(packagePath, 'utf8'));

program
  .name('triage-bot')
  .description('Node.js implementation of GitLab Triage for automated issue and MR management')
  .version(packageJson.version);

program
  .option('-n, --dry-run', "Don't actually update anything, just print what would be done", false)
  .option('-f, --policies-file <file>', 'Path to policies YAML file', './.triage-policies.yml')
  .option('--all-projects', 'Process all projects the token has access to', false)
  .option('-s, --source <type>', 'The source type: projects or groups', 'projects')
  .option('-i, --source-id <id>', 'Source ID or path')
  .option('--resource-reference <ref>', 'Resource short-reference, e.g. #42, !33')
  .option('-t, --token <token>', 'GitLab API token')
  .option('-H, --host-url <url>', 'GitLab host URL', 'https://gitlab.com')
  .option('-r, --require <file>', 'Require a file before performing operations')
  .option('-d, --debug', 'Print debug information', false)
  .option('--init', 'Initialize project with example policy file', false)
  .option('--init-ci', 'Initialize project with example .gitlab-ci.yml', false);

program.action(async (options) => {
  try {
    if (options.init) {
      await initPolicyFile();
      return;
    }

    if (options.initCi) {
      await initCiFile();
      return;
    }

    // Validate required options
    if (!options.token && !process.env.GITLAB_API_TOKEN) {
      console.error(
        chalk.red(
          'Error: GitLab API token is required. Use --token or set GITLAB_API_TOKEN environment variable.',
        ),
      );
      process.exit(1);
    }

    if (!options.allProjects && !options.sourceId) {
      console.error(
        chalk.red('Error: --source-id is required unless --all-projects is specified.'),
      );
      process.exit(1);
    }

    const token = options.token || process.env.GITLAB_API_TOKEN;

    const triage = new PlatinumTriage({
      token,
      hostUrl: options.hostUrl,
      debug: options.debug,
    });

    await triage.run({
      dryRun: options.dryRun,
      policiesFile: options.policiesFile,
      allProjects: options.allProjects,
      source: options.source,
      sourceId: options.sourceId,
      resourceReference: options.resourceReference,
      requireFile: options.require,
    });
  } catch (error) {
    console.error(chalk.red('Error:'), error.message);
    if (options.debug) {
      console.error(error.stack);
    }
    process.exit(1);
  }
});

async function initPolicyFile() {
  const filePath = './.triage-policies.yml';

  if (existsSync(filePath)) {
    console.log(chalk.yellow(`Policy file ${filePath} already exists.`));
    return;
  }

  const examplePolicy = `# GitLab Triage Policies Configuration
# This file defines automated triage rules for issues, merge requests, and epics

host_url: https://gitlab.com

resource_rules:
  issues:
    rules:
      - name: Add "needs attention" label to unlabeled issues older than 5 days
        conditions:
          date:
            attribute: updated_at
            condition: older_than
            interval_type: days
            interval: 5
          state: opened
          labels:
            - None
        limits:
          most_recent: 50
        actions:
          labels:
            - needs attention
          comment: |
            {{author}} This issue has been unlabeled for 5 days. Please add appropriate labels to help with triage.

  merge_requests:
    rules:
      - name: Add "needs review" label to unlabeled MRs
        conditions:
          state: opened
          labels:
            - None
        limits:
          most_recent: 25
        actions:
          labels:
            - needs review
          comment: |
            {{author}} This merge request needs labels. Please add appropriate labels for better organization.

  # Example of summary policy
  # issues:
  #   summaries:
  #     - name: Weekly triage summary
  #       rules:
  #         - name: New issues
  #           conditions:
  #             state: opened
  #           limits:
  #             most_recent: 10
  #           actions:
  #             summarize:
  #               item: "- [ ] [{{title}}]({{web_url}}) {{labels}}"
  #               summary: |
  #                 Recent {{type}} requiring attention:
  #
  #                 {{items}}
  #       actions:
  #         summarize:
  #           title: "Weekly Triage Summary"
  #           summary: |
  #             Weekly triage summary:
  #
  #             {{items}}
`;

  writeFileSync(filePath, examplePolicy);
  console.log(chalk.green(`✓ Created example policy file: ${filePath}`));
  console.log(chalk.blue('Edit this file to customize your triage policies.'));
}

async function initCiFile() {
  const filePath = './.gitlab-ci.yml';

  if (existsSync(filePath)) {
    console.log(chalk.yellow(`CI file ${filePath} already exists.`));
    return;
  }

  const exampleCi = `# GitLab CI configuration for automated triage
# This runs the triage bot on a schedule

stages:
  - triage

triage:
  stage: triage
  image: node:18-alpine
  before_script:
    - npm install -g gitlab-triage-node
  script:
    - gitlab-triage-node --token $GITLAB_API_TOKEN --source-id $CI_PROJECT_PATH
  rules:
    - if: $CI_PIPELINE_SOURCE == "schedule"
  only:
    variables:
      - $GITLAB_API_TOKEN
`;

  writeFileSync(filePath, exampleCi);
  console.log(chalk.green(`✓ Created example CI file: ${filePath}`));
  console.log(
    chalk.blue(
      'Set up a scheduled pipeline and GITLAB_API_TOKEN variable in your project settings.',
    ),
  );
}

program.parse();

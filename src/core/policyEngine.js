import {
    parseISO,
    differenceInMinutes,
    differenceInHours,
    differenceInDays,
    differenceInWeeks,
    differenceInMonths,
    differenceInYears,
    isBefore,
    isAfter,
} from 'date-fns';

import vm from 'vm';

import debug from 'debug';
import { Gitlab } from '@gitbeaker/rest';

const log = debug('platinum-triage:policy');

export class PolicyEngine {

    /**
     * Constructs an instance of the PolicyEngine class.
     *
     * @param {Gitlab} gitlab - An instance or interface for interacting with GitLab. This is used
     *                          for integrating GitLab-specific functionalities into the policy engine.
     */
    constructor(gitlab) {
        this.customFilters = new Map();
        this.gitlab = gitlab;
    }

    /**
     * Registers a custom filter function that can be used in conditions
     * @param {string} name - The name of the custom filter
     * @param {Function} filterFn - The filter function that takes (resource, value) and returns boolean
     */
    registerCustomFilter(name, filterFn) {
        this.customFilters.set(name, filterFn);
        log(`Registered custom filter: ${name}`);
    }

    /**
     * Filters a collection of resources based on specified filtering conditions.
     *
     * The method checks each resource in the provided collection and evaluates it
     * against the given conditions. If `conditions` is empty or not provided, the method
     * returns the unmodified collection of resources.
     *
     * @param {Array} resources - The array of resource objects to be filtered.
     * @param {Object} conditions - An object specifying the filtering conditions to be applied.
     * @returns {Array} An array of resources that satisfy the specified conditions.
     */
    filterResources(resources, conditions) {
        if (!conditions || Object.keys(conditions).length === 0) {
            return resources;
        }

        return resources.filter((resource) => {
            return this.evaluateConditions(resource, conditions);
        });
    }

    /**
     * Evaluates multiple conditions against a given resource.
     *
     * This method iterates through all the specified conditions and checks if the
     * resource satisfies each condition. If any condition fails, the method returns `false`.
     * If all conditions are satisfied, it returns `true`.
     *
     * @param {Object} resource - The resource object to be evaluated against the conditions.
     * @param {Object} conditions - An object containing one or more conditions where the keys
     * represent the condition types and the values represent the expected values for these conditions.
     * @returns {boolean} `true` if all conditions are satisfied by the resource, otherwise `false`.
     */
    evaluateConditions(resource, conditions) {
        for (const [conditionType, conditionValue] of Object.entries(conditions)) {
            if (!this.evaluateCondition(resource, conditionType, conditionValue)) {
                return false;
            }
        }
        return true;
    }

    /**
     * Evaluates a single condition against a resource
     * @param {Object} resource - The resource to evaluate
     * @param {string} conditionType - The type of condition to evaluate
     * @param {*} conditionValue - The value/configuration for the condition
     * @returns {boolean} True if the condition is satisfied
     */
    evaluateCondition(resource, conditionType, conditionValue) {
        log(`Evaluating condition: ${conditionType}`, conditionValue);

        switch (conditionType) {
            case 'date':
                return this.evaluateDateCondition(resource, conditionValue);
            case 'state':
                return this.evaluateStateCondition(resource, conditionValue);
            case 'labels':
                return this.evaluateLabelsCondition(resource, conditionValue);
            case 'forbidden_labels':
                return this.evaluateForbiddenLabelsCondition(resource, conditionValue);
            case 'no_additional_labels':
                return this.evaluateNoAdditionalLabelsCondition(resource, conditionValue);
            case 'author_username':
                return this.evaluateAuthorUsernameCondition(resource, conditionValue);
            case 'milestone':
                return this.evaluateMilestoneCondition(resource, conditionValue);
            case 'votes':
                return this.evaluateVotesCondition(resource, conditionValue);
            case 'draft':
                return this.evaluateDraftCondition(resource, conditionValue);
            case 'source_branch':
                return this.evaluateSourceBranchCondition(resource, conditionValue);
            case 'target_branch':
                return this.evaluateTargetBranchCondition(resource, conditionValue);
            case 'weight':
                return this.evaluateWeightCondition(resource, conditionValue);
            case 'health_status':
                return this.evaluateHealthStatusCondition(resource, conditionValue);
            case 'issue_type':
                return this.evaluateIssueTypeCondition(resource, conditionValue);
            case 'discussions':
                return this.evaluateDiscussionsCondition(resource, conditionValue);
            case 'js':
                return this.evaluateJavaScriptCondition(resource, conditionValue);
            case 'author_member':
                return this.evaluateAuthorMemberCondition(resource, conditionValue);
            default:
                if (this.customFilters.has(conditionType)) {
                    const customFilter = this.customFilters.get(conditionType);
                    return customFilter(resource, conditionValue);
                }
                log(`Unknown condition type: ${conditionType}`);
                return false;
        }
    }

    /**
     * Evaluates whether a resource satisfies the 'author member' condition.
     *
     * The method checks if the parameters provided contain the necessary details to evaluate
     * membership conditions for an author in a specific context (e.g., group). If the source,
     * source_id, or the condition is missing, it logs an error and returns `false`.
     *
     * Supported sources can include entities like `group`. If an unsupported source is encountered,
     * an error is thrown. Additional logic may need to be implemented for supported sources.
     *
     * @async
     * @param {IssueSchema|MergeSchema} resource - The resource to evaluate
     * @param {Object} parameters - The parameters required for evaluation.
     * @param {string} parameters.source - The context or entity (e.g., 'group') for evaluating the condition.
     * @param {string|number} parameters.source_id - The identifier of the source (e.g., group ID).
     * @param {Object} parameters.condition - The condition details to evaluate membership.
     * @returns {Promise<boolean>} A promise that resolves to `true` if the condition is met, else `false`.
     * @throws {Error} If the `parameters.source` is unsupported.
     */
    async evaluateAuthorMemberCondition(resource, parameters) {
        const { source, source_id, condition } = parameters;

        if (!source || !source_id || !condition) {
            log('Invalid parameters for evaluateAuthorMemberCondition');
            return false;
        }

        switch (source) {
            case 'group':
                try {
                    const member = await this.gitlab.GroupMembers.show(source_id, resource.author.id);
                    return !!member;
                } catch {
                    return false;
                }
                break;
            default:
                throw new Error(`Unsupported source: ${source}`);
        }

        return false;
    }

    /**
     * Evaluates date-based conditions
     */
    evaluateDateCondition(resource, dateConfig) {
        const { attribute, condition, interval_type, interval } = dateConfig;

        if (!resource[attribute]) {
            return false;
        }

        const resourceDate = parseISO(resource[attribute]);
        const now = new Date();

        let timeDifference;
        switch (interval_type) {
            case 'minutes':
                timeDifference = differenceInMinutes(now, resourceDate);
                break;
            case 'hours':
                timeDifference = differenceInHours(now, resourceDate);
                break;
            case 'days':
                timeDifference = differenceInDays(now, resourceDate);
                break;
            case 'weeks':
                timeDifference = differenceInWeeks(now, resourceDate);
                break;
            case 'months':
                timeDifference = differenceInMonths(now, resourceDate);
                break;
            case 'years':
                timeDifference = differenceInYears(now, resourceDate);
                break;
            default:
                return false;
        }

        switch (condition) {
            case 'older_than':
                return timeDifference >= interval;
            case 'newer_than':
                return timeDifference <= interval;
            default:
                return false;
        }
    }

    /**
     * Evaluates state conditions
     */
    evaluateStateCondition(resource, expectedState) {
        return resource.state === expectedState;
    }

    /**
     * Evaluates label conditions - ALL specified labels must be present
     */
    evaluateLabelsCondition(resource, requiredLabels) {
        if (!Array.isArray(requiredLabels)) {
            return false;
        }

        const resourceLabels = resource.labels || [];
        const labelNames = resourceLabels.map((label) =>
            typeof label === 'string' ? label : label.name,
        );

        // Handle special cases
        if (requiredLabels.includes('None')) {
            return labelNames.length === 0;
        }
        if (requiredLabels.includes('Any')) {
            return labelNames.length > 0;
        }

        const orLabels = requiredLabels.filter(x => x.includes('{'));

        for (const label of orLabels) {
            let eitherLabels = this.stringToArray(label);
            if (!eitherLabels.some((label_) => labelNames.includes(label_))) return false;

            requiredLabels = requiredLabels.filter(x => !x === label);
        }
        return requiredLabels.every((label) => labelNames.includes(label));
    }

    stringToArray(str) {
        const match = str.match(/^(.+?)([{])([^}]+)(})/);
        if (!match) return [];

        const key = match[1].trim();
        const separator = match[2] === '{' ? '' : str.slice(match[1].length, match[1].length + 1);
        const values = match[3].split(',').map(v => v.trim());

        return values.map(value => `${key}${separator}${value}`);
    }

    /**
     * Evaluates forbidden labels condition - ALL specified labels must be absent
     */
    evaluateForbiddenLabelsCondition(resource, forbiddenLabels) {
        if (!Array.isArray(forbiddenLabels)) {
            return false;
        }

        const resourceLabels = resource.labels || [];
        const labelNames = resourceLabels.map((label) =>
            typeof label === 'string' ? label : label.name,
        );

        // Check that none of the forbidden labels are present
        return !forbiddenLabels.some((label) => labelNames.includes(label));
    }

    /**
     * Evaluates no additional labels condition
     */
    evaluateNoAdditionalLabelsCondition(resource, shouldHaveNoAdditional) {
        if (!shouldHaveNoAdditional) {
            return true;
        }

        // This condition should be used with the 'labels' condition
        // We can't evaluate this in isolation without knowing the allowed labels
        log('no_additional_labels condition requires a labels condition to be meaningful');
        return true;
    }

    /**
     * Evaluates author username condition
     */
    evaluateAuthorUsernameCondition(resource, expectedUsername) {
        const author = resource.author;
        const authorUsername = typeof author === 'object' ? author.username : author;
        return authorUsername === expectedUsername;
    }

    /**
     * Evaluates milestone condition
     */
    evaluateMilestoneCondition(resource, expectedMilestone) {
        const milestone = resource.milestone;

        if (expectedMilestone === 'none') {
            return !milestone;
        }
        if (expectedMilestone === 'any') {
            return !!milestone;
        }

        if (!milestone) {
            return false;
        }

        const milestoneTitle = typeof milestone === 'object' ? milestone.title : milestone;
        return milestoneTitle === expectedMilestone;
    }

    /**
     * Evaluates vote-based conditions
     */
    evaluateVotesCondition(resource, voteConfig) {
        const { attribute, condition, threshold } = voteConfig;
        const voteCount = resource[attribute] || 0;

        switch (condition) {
            case 'less_than':
                return voteCount < threshold;
            case 'greater_than':
                return voteCount > threshold;
            default:
                return false;
        }
    }

    /**
     * Evaluates draft condition (for merge requests)
     */
    evaluateDraftCondition(resource, expectedDraft) {
        return !!resource.draft === expectedDraft;
    }

    /**
     * Evaluates source branch condition (for merge requests)
     */
    evaluateSourceBranchCondition(resource, expectedBranch) {
        return resource.source_branch === expectedBranch;
    }

    /**
     * Evaluates target branch condition (for merge requests)
     */
    evaluateTargetBranchCondition(resource, expectedBranch) {
        return resource.target_branch === expectedBranch;
    }

    /**
     * Evaluates weight condition (for issues)
     */
    evaluateWeightCondition(resource, expectedWeight) {
        const weight = resource.weight;

        if (expectedWeight === 'None') {
            return weight === null || weight === undefined;
        }
        if (expectedWeight === 'Any') {
            return weight !== null && weight !== undefined;
        }

        return weight === expectedWeight;
    }

    /**
     * Evaluates health status condition (for issues)
     */
    evaluateHealthStatusCondition(resource, expectedStatus) {
        const healthStatus = resource.health_status;

        if (expectedStatus === 'None') {
            return !healthStatus;
        }
        if (expectedStatus === 'Any') {
            return !!healthStatus;
        }

        return healthStatus === expectedStatus;
    }

    /**
     * Evaluates issue type condition
     */
    evaluateIssueTypeCondition(resource, expectedType) {
        return resource.issue_type === expectedType;
    }

    /**
     * Evaluates discussions condition
     */
    evaluateDiscussionsCondition(resource, discussionConfig) {
        const { attribute, condition, threshold } = discussionConfig;
        const count = resource[attribute] || 0;

        switch (condition) {
            case 'less_than':
                return count < threshold;
            case 'greater_than':
                return count > threshold;
            default:
                return false;
        }
    }

    /**
     * Applies limits to a collection of resources
     * @param {Array} resources - The resources to limit
     * @param {Object} limits - The limit configuration
     * @returns {Array} The limited resources
     */
    applyLimits(resources, limits) {
        if (!limits) {
            return resources;
        }

        let sortedResources = [...resources];

        if (limits.most_recent) {
            // Sort by created_at descending (newest first)
            sortedResources.sort((a, b) => new Date(b.created_at) - new Date(a.created_at));
            return sortedResources.slice(0, limits.most_recent);
        }

        if (limits.oldest) {
            // Sort by created_at ascending (oldest first)
            sortedResources.sort((a, b) => new Date(a.created_at) - new Date(b.created_at));
            return sortedResources.slice(0, limits.oldest);
        }

        return resources;
    }

    /**
     * Processes a complete policy rule against a collection of resources
     * @param {Array} resources - The resources to process
     * @param {Object} rule - The policy rule containing conditions, limits, and actions
     * @returns {Array} The resources that match the rule conditions and limits
     */
    processRule(resources, rule) {
        log(`Processing rule: ${rule.name}`);

        // Apply conditions
        let filteredResources = this.filterResources(resources, rule.conditions);
        log(`After conditions: ${filteredResources.length} resources`);

        // Apply limits
        if (rule.limits) {
            filteredResources = this.applyLimits(filteredResources, rule.limits);
            log(`After limits: ${filteredResources.length} resources`);
        }

        return filteredResources;
    }

    /**
     * Evaluates JavaScript expressions for a resource
     * @import { IssueSchema, MergeSchema } from "@gitbeaker/rest"
     * @param {IssueSchema|MergeSchema} resource - The resource to evaluate
     * @param {string} jsExpression - The JavaScript expression to evaluate
     * @returns {boolean} True if the expression evaluates to a truthy value
     */
    evaluateJavaScriptCondition(resource, jsExpression) {
        const context = {
            resource,
            milestone: resource.milestone,
            labels: resource.labels || [],
            author: resource.author,
            state: resource.state,
            full_reference: resource.references.full,
            Date,
            hook_rest_body: resource.hook_rest_body
        };

        try {
            const script = new vm.Script(jsExpression);
            const sandbox = vm.createContext(context);
            return script.runInContext(sandbox);
        } catch (error) {
            log(`Error evaluating JavaScript condition: ${error.message}`);
            return false;
        }
    }
}

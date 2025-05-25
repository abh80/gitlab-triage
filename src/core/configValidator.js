import { z } from 'zod';

// Zod schemas for configuration validation
const DateConditionSchema = z.object({
  attribute: z.enum(['created_at', 'updated_at', 'merged_at', 'authored_date', 'committed_date']),
  condition: z.enum(['older_than', 'newer_than']),
  interval_type: z.enum(['minutes', 'hours', 'days', 'weeks', 'months', 'years']),
  interval: z.number().int().positive(),
  filter_in_ruby: z.boolean().optional(),
});

const VotesConditionSchema = z.object({
  attribute: z.enum(['upvotes', 'downvotes']),
  condition: z.enum(['less_than', 'greater_than']),
  threshold: z.number().int().nonnegative(),
});

const AuthorMemberConditionSchema = z.object({
  source: z.enum(['group', 'project']),
  condition: z.enum(['member_of', 'not_member_of']),
  source_id: z.union([z.number(), z.string()]),
});

const DiscussionsConditionSchema = z.object({
  attribute: z.enum(['threads', 'notes']),
  condition: z.enum(['less_than', 'greater_than']),
  threshold: z.number().int().nonnegative(),
});

const ConditionsSchema = z.object({
  date: DateConditionSchema.optional(),
  milestone: z.string().optional(),
  iteration: z.string().optional(),
  state: z.enum(['opened', 'closed', 'locked', 'merged']).optional(),
  votes: VotesConditionSchema.optional(),
  labels: z.array(z.string()).optional(),
  forbidden_labels: z.array(z.string()).optional(),
  no_additional_labels: z.boolean().optional(),
  author_username: z.string().optional(),
  author_member: AuthorMemberConditionSchema.optional(),
  assignee_member: AuthorMemberConditionSchema.optional(),
  draft: z.boolean().optional(),
  source_branch: z.string().optional(),
  target_branch: z.string().optional(),
  health_status: z.enum(['Any', 'None', 'on_track', 'needs_attention', 'at_risk']).optional(),
  weight: z.union([z.string(), z.number()]).optional(),
  issue_type: z.enum(['issue', 'incident', 'test_case']).optional(),
  discussions: DiscussionsConditionSchema.optional(),
  protected: z.boolean().optional(),
  ruby: z.string().optional(),
  reviewer_id: z.union([z.string(), z.number()]).optional(),
});

const LimitsSchema = z
  .object({
    most_recent: z.number().int().positive().optional(),
    oldest: z.number().int().positive().optional(),
  })
  .refine(
    (data) => {
      const keys = Object.keys(data);
      return keys.length <= 1;
    },
    {
      message: 'Only one limit type (most_recent or oldest) can be specified',
    },
  );

const SummarizeActionSchema = z.object({
  title: z.string(),
  destination: z.union([z.number(), z.string()]).optional(),
  item: z.string().optional(),
  summary: z.string().optional(),
  redact_confidential_resources: z.boolean().optional(),
});

const IssueActionSchema = z.object({
  title: z.string(),
  destination: z.union([z.number(), z.string()]).optional(),
  description: z.string().optional(),
  redact_confidential_resources: z.boolean().optional(),
});

const ActionsSchema = z.object({
  labels: z.array(z.string()).optional(),
  remove_labels: z.array(z.string()).optional(),
  status: z.enum(['close', 'reopen']).optional(),
  mention: z.array(z.string()).optional(),
  move: z.string().optional(),
  comment: z.string().optional(),
  comment_type: z.enum(['comment', 'thread']).optional(),
  comment_internal: z.boolean().optional(),
  redact_confidential_resources: z.boolean().optional(),
  summarize: SummarizeActionSchema.optional(),
  comment_on_summary: z.string().optional(),
  issue: IssueActionSchema.optional(),
  delete: z.boolean().optional(),
});

const RuleSchema = z.object({
  name: z.string(),
  conditions: ConditionsSchema.optional(),
  limits: LimitsSchema.optional(),
  actions: ActionsSchema.optional(),
});

const SummaryPolicySchema = z.object({
  name: z.string(),
  rules: z.array(RuleSchema),
  actions: ActionsSchema,
});

const ResourceRulesSchema = z.object({
  rules: z.array(RuleSchema).optional(),
  summaries: z.array(SummaryPolicySchema).optional(),
});

const ConfigSchema = z.object({
  host_url: z.string().url().optional(),
  resource_rules: z
    .object({
      issues: ResourceRulesSchema.optional(),
      merge_requests: ResourceRulesSchema.optional(),
      epics: ResourceRulesSchema.optional(),
      branches: ResourceRulesSchema.optional(),
    })
    .optional(),
});

export class ConfigValidator {
  validate(config) {
    if (!config || typeof config !== 'object') {
      return { valid: false, errors: ['Configuration must be an object'] };
    }

    if (Object.keys(config).length === 0) {
      return { valid: false, errors: ["Configuration must contain resource_rules"] };
    }

    try {
      ConfigSchema.parse(config);
      return { valid: true, errors: [] };
    } catch (error) {
      if (error instanceof z.ZodError) {
        const errors = error.errors.map((err) => {
          const path = err.path.join('.');
          return `${path}: ${err.message}`;
        });
        return { valid: false, errors };
      }
      return { valid: false, errors: [error.message] };
    }
  }

  validateRule(rule) {
    try {
      RuleSchema.parse(rule);
      return { valid: true, errors: [] };
    } catch (error) {
      if (error instanceof z.ZodError) {
        const errors = error.errors.map((err) => {
          const path = err.path.join('.');
          return `${path}: ${err.message}`;
        });
        return { valid: false, errors };
      }
      return { valid: false, errors: [error.message] };
    }
  }

  validateConditions(conditions) {
    try {
      ConditionsSchema.parse(conditions);
      return { valid: true, errors: [] };
    } catch (error) {
      if (error instanceof z.ZodError) {
        const errors = error.errors.map((err) => {
          const path = err.path.join('.');
          return `${path}: ${err.message}`;
        });
        return { valid: false, errors };
      }
      return { valid: false, errors: [error.message] };
    }
  }

  validateActions(actions) {
    try {
      ActionsSchema.parse(actions);
      return { valid: true, errors: [] };
    } catch (error) {
      if (error instanceof z.ZodError) {
        const errors = error.errors.map((err) => {
          const path = err.path.join('.');
          return `${path}: ${err.message}`;
        });
        return { valid: false, errors };
      }
      return { valid: false, errors: [error.message] };
    }
  }
}

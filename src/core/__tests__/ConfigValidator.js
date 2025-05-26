import { ConfigValidator } from '../configValidator.js';
import { jest } from '@jest/globals';

describe('ConfigValidator', () => {
    let validator;

    beforeEach(() => {
        validator = new ConfigValidator();
    });

    it('should validate a valid configuration', () => {
        const validConfig = {
            resource_rules: {
                issue: {
                    rules: [
                        {
                            name: 'Close old issues',
                            conditions: {
                                created_before: '30 days ago',
                                state: 'opened'
                            },
                            actions: {
                                close: true
                            }
                        }
                    ]
                }
            }
        };

        const result = validator.validate(validConfig);
        expect(result.valid).toBe(true);
        expect(result.errors).toHaveLength(0);
    });

    it('should reject invalid configuration without resource_rules', () => {
        const invalidConfig = {};

        const result = validator.validate(invalidConfig);
        expect(result.valid).toBe(false);
        expect(result.errors).toContain('Configuration must contain resource_rules');
    });


    it('should validate summary policies', () => {
        const configWithSummaries = {
            resource_rules: {
                issue: {
                    summaries: [
                        {
                            name: 'Issue Summary',
                            rules: [
                                {
                                    name: 'Old Issues',
                                    conditions: {
                                        created_before: '30 days ago'
                                    },
                                    actions: {
                                        summarize: {
                                            title: 'Old Issues Report'
                                        }
                                    }
                                }
                            ],
                            actions: {
                                summarize: {
                                    title: 'Combined Summary'
                                }
                            }
                        }
                    ]
                }
            }
        };

        const result = validator.validate(configWithSummaries);
        console.log(result)
        expect(result.valid).toBe(true);
        expect(result.errors).toHaveLength(0);
    });

    it('should validate host_url if present', () => {
        const configWithHostUrl = {
            host_url: 'https://gitlab.example.com',
            resource_rules: {
                issue: {
                    rules: []
                }
            }
        };

        const result = validator.validate(configWithHostUrl);
        expect(result.valid).toBe(true);
    });
});
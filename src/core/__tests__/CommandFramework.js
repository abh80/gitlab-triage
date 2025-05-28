import CommandFramework from '../CommandFramework';

describe('CommandFramework', () => {
    describe('Constructor and Basic Setup', () => {
        test('should initialize with bot username and command', () => {
            const framework = new CommandFramework('testbot', 'help');
            expect(framework.bot_username).toBe('testbot');
            expect(framework.command).toBe('help');
        });

        test('should parse tokens on initialization', () => {
            const framework = new CommandFramework('testbot', 'help');
            const tokens = framework.getTokens();
            expect(tokens).toHaveLength(1);
            expect(tokens[0]).toEqual({
                type: 'literal',
                value: 'help',
                position: 0,
            });
        });
    });

    describe('parseTokens()', () => {
        test('should handle empty or invalid commands', () => {
            const framework1 = new CommandFramework('testbot', '');
            expect(framework1.getTokens()).toHaveLength(0);

            const framework2 = new CommandFramework('testbot', '   ');
            expect(framework2.getTokens()).toHaveLength(0);

            const framework3 = new CommandFramework('testbot', null);
            expect(framework3.getTokens()).toHaveLength(0);
        });

        test('should parse simple literal commands', () => {
            const framework = new CommandFramework('testbot', 'help');
            const tokens = framework.getTokens();

            expect(tokens).toHaveLength(1);
            expect(tokens[0]).toEqual({
                type: 'literal',
                value: 'help',
                position: 0,
            });
        });

        test('should parse multi-word literal commands', () => {
            const framework = new CommandFramework('testbot', 'show status');
            const tokens = framework.getTokens();

            expect(tokens).toHaveLength(2);
            expect(tokens[0]).toEqual({
                type: 'literal',
                value: 'show',
                position: 0,
            });
            expect(tokens[1]).toEqual({
                type: 'literal',
                value: 'status',
                position: 1,
            });
        });

        test('should parse commands with variables', () => {
            const framework = new CommandFramework('testbot', 'labels {{...labels}}');
            const tokens = framework.getTokens();

            expect(tokens).toHaveLength(2);
            expect(tokens[0]).toEqual({
                type: 'literal',
                value: 'labels',
                position: 0,
            });
            expect(tokens[1]).toEqual({
                type: 'variable',
                name: 'labels',
                position: 1,
            });
        });

        test('should parse complex commands with multiple variables', () => {
            const framework = new CommandFramework('testbot', 'assign {{...users}} to {{...tasks}}');
            const tokens = framework.getTokens();

            expect(tokens).toHaveLength(4);
            expect(tokens[0]).toEqual({
                type: 'literal',
                value: 'assign',
                position: 0,
            });
            expect(tokens[1]).toEqual({
                type: 'variable',
                name: 'users',
                position: 1,
            });
            expect(tokens[2]).toEqual({
                type: 'literal',
                value: 'to',
                position: 2,
            });
            expect(tokens[3]).toEqual({
                type: 'variable',
                name: 'tasks',
                position: 3,
            });
        });

        test('should handle extra whitespace', () => {
            const framework = new CommandFramework('testbot', '  labels   {{...labels}}  ');
            const tokens = framework.getTokens();

            expect(tokens).toHaveLength(2);
            expect(tokens[0].value).toBe('labels');
            expect(tokens[1].name).toBe('labels');
        });
    });

    describe('match()', () => {
        describe('Simple literal commands', () => {
            test('should match exact literal command', () => {
                const framework = new CommandFramework('testbot', 'help');
                const result = framework.match('help');

                expect(result).toEqual({
                    matched: true,
                    variables: {},
                });
            });

            test('should not match different literal command', () => {
                const framework = new CommandFramework('testbot', 'help');
                const result = framework.match('status');

                expect(result).toBeNull();
            });

            test('should match multi-word literal commands', () => {
                const framework = new CommandFramework('testbot', 'show status');
                const result = framework.match('show status');

                expect(result).toEqual({
                    matched: true,
                    variables: {},
                });
            });

            test('should not match partial literal commands', () => {
                const framework = new CommandFramework('testbot', 'show status');
                const result = framework.match('show');

                expect(result).toBeNull();
            });
        });

        describe('Commands with variables', () => {
            test('should match labels command with tilde-prefixed labels', () => {
                const framework = new CommandFramework('testbot', 'labels {{...labels}}');
                const result = framework.match('labels ~bug ~urgent');

                expect(result).toEqual({
                    matched: true,
                    variables: {
                        labels: ['~bug', '~urgent'],
                    },
                });
            });

            test('should match labels command with single label', () => {
                const framework = new CommandFramework('testbot', 'labels {{...labels}}');
                const result = framework.match('labels ~feature');

                expect(result).toEqual({
                    matched: true,
                    variables: {
                        labels: ['~feature'],
                    },
                });
            });

            test('should match labels command with no labels', () => {
                const framework = new CommandFramework('testbot', 'labels {{...labels}}');
                const result = framework.match('labels');

                expect(result).toEqual({
                    matched: true,
                    variables: {
                        labels: [],
                    },
                });
            });

            test('should not match labels with non-tilde-prefixed words', () => {
                const framework = new CommandFramework('testbot', 'labels {{...labels}}');
                const result = framework.match('labels bug urgent');

                expect(result).toBeNull();
            });

            test('should not match when labels are followed by non-tilde words', () => {
                const framework = new CommandFramework('testbot', 'labels {{...labels}}');
                const result = framework.match('labels ~bug urgent ~feature');

                // Should return null because 'urgent' and '~feature' are not consumed
                expect(result).toBeNull();
            });

            test('should match when labels command ends with tilde words only', () => {
                const framework = new CommandFramework('testbot', 'labels {{...labels}}');
                const result = framework.match('labels ~bug ~feature');

                expect(result).toEqual({
                    matched: true,
                    variables: {
                        labels: ['~bug', '~feature'],
                    },
                });
            });
        });

        describe('Complex commands with multiple variables', () => {
            test('should match command with multiple variables', () => {
                const framework = new CommandFramework('testbot', 'assign {{...users}} to {{...tasks}}');
                const result = framework.match('assign john jane to task1 task2');

                expect(result).toEqual({
                    matched: true,
                    variables: {
                        users: ['john', 'jane'],
                        tasks: ['task1', 'task2'],
                    },
                });
            });

            test('should handle empty variables in complex commands', () => {
                const framework = new CommandFramework('testbot', 'assign {{...users}} to {{...tasks}}');
                const result = framework.match('assign to');

                expect(result).toEqual({
                    matched: true,
                    variables: {
                        users: [],
                        tasks: [],
                    },
                });
            });
        });

        describe('Edge cases', () => {
            test('should handle null or undefined input', () => {
                const framework = new CommandFramework('testbot', 'help');

                expect(framework.match(null)).toBeNull();
                expect(framework.match(undefined)).toBeNull();
                expect(framework.match('')).toBeNull();
            });

            test('should handle extra whitespace in input', () => {
                const framework = new CommandFramework('testbot', 'labels {{...labels}}');
                const result = framework.match('  labels   ~bug   ~urgent  ');

                expect(result).toEqual({
                    matched: true,
                    variables: {
                        labels: ['~bug', '~urgent'],
                    },
                });
            });

            test('should not match when input has extra words', () => {
                const framework = new CommandFramework('testbot', 'help');
                const result = framework.match('help me please');

                expect(result).toBeNull();
            });
        });
    });

    describe('Helper methods', () => {
        test('isSimpleCommand() should identify simple literal commands', () => {
            const simpleFramework = new CommandFramework('testbot', 'help');
            expect(simpleFramework.isSimpleCommand()).toBe(true);

            const complexFramework = new CommandFramework('testbot', 'labels {{...labels}}');
            expect(complexFramework.isSimpleCommand()).toBe(false);
        });

        test('getPattern() should return readable pattern string', () => {
            const framework1 = new CommandFramework('testbot', 'help');
            expect(framework1.getPattern()).toBe('help');

            const framework2 = new CommandFramework('testbot', 'labels {{...labels}}');
            expect(framework2.getPattern()).toBe('labels {{...labels}}');

            const framework3 = new CommandFramework('testbot', 'assign {{...users}} to {{...tasks}}');
            expect(framework3.getPattern()).toBe('assign {{...users}} to {{...tasks}}');
        });

        test('getTokens() should return copy of tokens array', () => {
            const framework = new CommandFramework('testbot', 'help');
            const tokens1 = framework.getTokens();
            const tokens2 = framework.getTokens();

            expect(tokens1).toEqual(tokens2);
            expect(tokens1).not.toBe(tokens2); // Should be different objects
        });
    });

    describe('Real-world scenarios', () => {
        test('should handle GitHub-style label commands', () => {
            const framework = new CommandFramework('testbot', 'labels {{...labels}}');

            // Add labels
            expect(framework.match('labels ~bug ~priority:high ~status:open')).toEqual({
                matched: true,
                variables: {
                    labels: ['~bug', '~priority:high', '~status:open'],
                },
            });

            // Remove labels scenario (different command)
            const removeFramework = new CommandFramework('testbot', 'remove labels {{...labels}}');
            expect(removeFramework.match('remove labels ~bug ~urgent')).toEqual({
                matched: true,
                variables: {
                    labels: ['~bug', '~urgent'],
                },
            });
        });

        test('should handle user assignment commands', () => {
            const framework = new CommandFramework('testbot', 'assign {{...users}}');

            expect(framework.match('assign @john @jane @doe')).toEqual({
                matched: true,
                variables: {
                    users: ['@john', '@jane', '@doe'],
                },
            });
        });

        test('should handle milestone commands', () => {
            const framework = new CommandFramework('testbot', 'milestone {{...name}}');

            expect(framework.match('milestone v1.0 release')).toEqual({
                matched: true,
                variables: {
                    name: ['v1.0', 'release'],
                },
            });
        });

        test('should handle command that dosent start with literal', () => {
            const framework = new CommandFramework('testbot', '{{...labels}}');

            expect(framework.match('~label1 ~label2')).toEqual({
                matched: true,
                variables: {
                    labels: ['~label1', '~label2'],
                },
            });
        });
    });

    describe('handleInput()', () => {
        test('should return null for invalid input', () => {
            const framework = new CommandFramework('testbot', 'help');

            expect(framework.handleInput(null)).toBeNull();
            expect(framework.handleInput(undefined)).toBeNull();
            expect(framework.handleInput('')).toBeNull();
            expect(framework.handleInput(123)).toBeNull();
        });

        test('should return null when message does not start with bot mention', () => {
            const framework = new CommandFramework('testbot', 'help');

            expect(framework.handleInput('help')).toBeNull();
            expect(framework.handleInput('some random message')).toBeNull();
            expect(framework.handleInput('@otherbot help')).toBeNull();
        });

        test('should process message that starts with bot mention', () => {
            const framework = new CommandFramework('testbot', 'help');
            const result = framework.handleInput('@testbot help');

            expect(result).toEqual({
                matched: true,
                variables: {},
            });
        });

        test('should handle bot mention with extra whitespace', () => {
            const framework = new CommandFramework('testbot', 'help');
            const result = framework.handleInput('@testbot   help');

            expect(result).toEqual({
                matched: true,
                variables: {},
            });
        });

        test('should process commands with variables after bot mention', () => {
            const framework = new CommandFramework('testbot', 'labels {{...labels}}');
            const result = framework.handleInput('@testbot labels ~bug ~urgent');

            expect(result).toEqual({
                matched: true,
                variables: {
                    labels: ['~bug', '~urgent'],
                },
            });
        });

        test('should return null when command after mention does not match pattern', () => {
            const framework = new CommandFramework('testbot', 'help');
            const result = framework.handleInput('@testbot status');

            expect(result).toBeNull();
        });

        test('should handle bot mention followed by empty command', () => {
            const framework = new CommandFramework('testbot', 'help');
            const result = framework.handleInput('@testbot');

            expect(result).toBeNull();
        });

        test('should handle bot mention with only whitespace after', () => {
            const framework = new CommandFramework('testbot', 'help');
            const result = framework.handleInput('@testbot   ');

            expect(result).toBeNull();
        });

        test('should work with different bot usernames', () => {
            const framework = new CommandFramework('mybot', 'help');

            expect(framework.handleInput('@mybot help')).toEqual({
                matched: true,
                variables: {},
            });
            expect(framework.handleInput('@testbot help')).toBeNull();
        });

        test('should handle complex commands after bot mention', () => {
            const framework = new CommandFramework('testbot', 'assign {{...users}} to {{...tasks}}');
            const result = framework.handleInput('@testbot assign john jane to task1 task2');

            expect(result).toEqual({
                matched: true,
                variables: {
                    users: ['john', 'jane'],
                    tasks: ['task1', 'task2'],
                },
            });
        });
    });
});
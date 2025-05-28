import debug from 'debug';

const log = debug('platinum-triage:command-framework');

export default class CommandFramework {
    /**
     * Initializes a new instance of the CommandFramework class.
     *
     * @param {string} bot_username - The username of bot
     * @param {string} command - The message associated with the command framework.
     * @param {boolean} prefix
     */
    constructor(bot_username, command, prefix = true) {
        this.bot_username = bot_username;
        this.command = command;
        this.prefix = true;
        this.#tokens = [];
        this.parseTokens();
    }

    #tokens;

    /**
     * Parses the command string into tokens for pattern matching
     */
    parseTokens() {
        if (!this.command || typeof this.command !== 'string') {
            throw new Error('Invalid command provided: ' + this.command);
        }

        const trimmedCommand = this.command.trim();
        if (!trimmedCommand) {
            log('Empty command provided');
            return;
        }

        // Split command into words
        const words = trimmedCommand.split(/\s+/);
        this.#tokens = [];

        for (let i = 0; i < words.length; i++) {
            const word = words[i];

            // Check if this word contains variable pattern {{...}}
            const variableMatch = word.match(/{{\.\.\.(\w+)}}/);
            if (variableMatch) {
                // This is a variable token
                this.#tokens.push({
                    type: 'variable',
                    name: variableMatch[1],
                    position: i,
                });
                log(`Found variable token: ${variableMatch[1]} at position ${i}`);
            } else {
                // This is a literal token
                this.#tokens.push({
                    type: 'literal',
                    value: word,
                    position: i,
                });
                log(`Found literal token: ${word} at position ${i}`);
            }
        }
    }

    /**
     * Gets the parsed tokens
     * @returns {Array} Array of token objects
     */
    getTokens() {
        return [...this.#tokens];
    }

    /**
     * @param {string} message
     */
    handleInput(message) {
        log(message);
        if (!message || typeof message !== 'string') {
            return null;
        }

        if (this.prefix && !message.startsWith(`@${this.bot_username}`)) {
            return null;
        }

        const m = this.prefix ? message.slice(`@${this.bot_username}`.length).trim() : message;
        log(`Processing recieved message: ${m}`);

        return this.match(m);
    }

    /**
     * Matches an input string against the parsed command pattern
     * @param {string} input - The input string to match
     * @returns {Object|null} Match result with extracted variables or null if no match
     */
    match(input) {
        if (!input || typeof input !== 'string') {
            return null;
        }

        const inputWords = input.trim().split(/\s+/);
        if (inputWords.length === 1 && inputWords[0] === '') {
            return null;
        }

        const extractedVars = {};
        let inputIndex = 0;

        for (let tokenIndex = 0; tokenIndex < this.#tokens.length; tokenIndex++) {
            const token = this.#tokens[tokenIndex];
            const nextToken = this.#tokens[tokenIndex + 1];

            if (token.type === 'literal') {
                // Check if the current input word matches the literal token
                if (inputIndex >= inputWords.length || inputWords[inputIndex] !== token.value) {
                    log(`Literal token mismatch: expected '${token.value}', got '${inputWords[inputIndex] || 'undefined'}'`);
                    return null;
                }
                inputIndex++;
            } else if (token.type === 'variable') {
                const variableValues = [];

                if (token.name === 'labels') {
                    // For labels, collect words that start with ~
                    while (inputIndex < inputWords.length && inputWords[inputIndex].startsWith('~')) {
                        variableValues.push(inputWords[inputIndex].slice(1,));
                        inputIndex++;
                    }
                } else if (nextToken && nextToken.type === 'literal') {
                    // If there's a next literal token, collect words until we find it
                    while (inputIndex < inputWords.length && inputWords[inputIndex] !== nextToken.value) {
                        variableValues.push(inputWords[inputIndex]);
                        inputIndex++;
                    }
                } else {
                    // If this is the last token or no literal follows, collect all remaining words
                    while (inputIndex < inputWords.length) {
                        variableValues.push(inputWords[inputIndex]);
                        inputIndex++;
                    }
                }

                extractedVars[token.name] = variableValues;
                log(`Extracted variable '${token.name}':`, variableValues);
            }
        }

        if (inputIndex !== inputWords.length) {
            log(`Not all input words consumed. Processed: ${inputIndex}, Total: ${inputWords.length}`);
            return null;
        }

        return {
            matched: true,
            variables: extractedVars,
        };
    }

    /**
     * Checks if the command pattern is a simple literal command (no variables)
     * @returns {boolean}
     */
    isSimpleCommand() {
        return this.#tokens.every(token => token.type === 'literal');
    }

    /**
     * Gets the command pattern as a string for debugging
     * @returns {string}
     */
    getPattern() {
        return this.#tokens.map(token => {
            if (token.type === 'literal') {
                return token.value;
            } else {
                return `{{...${token.name}}}`;
            }
        }).join(' ');
    }
}
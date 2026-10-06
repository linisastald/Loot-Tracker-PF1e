const {OpenAI} = require('openai');
const dbUtils = require('../utils/dbUtils');
const logger = require('../utils/logger');

// Longest we wait for OpenAI before the caller gets a clean failure (no retries: the
// user is waiting on the form, and a retry would double the wait).
const REQUEST_TIMEOUT_MS = 15000;

/**
 * Failure of the parsing service that the UI can show as-is. `status` is the HTTP status
 * the controller answers with; `message` never contains provider text or secrets.
 */
class ItemParsingUnavailableError extends Error {
    constructor(message, status = 502) {
        super(message);
        this.name = 'ItemParsingUnavailableError';
        this.status = status;
    }
}

/**
 * Get OpenAI key from settings and decrypt it
 * @returns {Promise<string>} - The decrypted OpenAI API key
 */
const getOpenAiKey = async () => {
    const result = await dbUtils.executeQuery(
        'SELECT value, value_type FROM settings WHERE name = $1',
        ['openai_key']
    );

    if (result.rows.length === 0 || !result.rows[0].value) {
        throw new ItemParsingUnavailableError(
            'Item parsing is not available: the OpenAI key is not configured. Enter the item manually.',
            503
        );
    }

    const row = result.rows[0];
    // Decrypt the stored key if it's encrypted
    if (row.value_type === 'encrypted') {
        return Buffer.from(row.value, 'base64').toString('utf8');
    }

    return row.value;
};

const isTimeout = (error) =>
    ['APIConnectionTimeoutError', 'AbortError', 'TimeoutError'].includes(error.name)
    || error.code === 'ETIMEDOUT';

/**
 * Parse the model's reply, tolerating a markdown code fence around the JSON.
 */
const parseReply = (content) => {
    const text = String(content || '').trim().replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, '');
    try {
        return JSON.parse(text);
    } catch (parseError) {
        throw new ItemParsingUnavailableError(
            'The item parser returned an unreadable answer. Try again or enter the item manually.'
        );
    }
};

/**
 * Function to call GPT API to parse item description
 * @param {string} description - The item description to parse
 * @returns {Promise<Object>} - The parsed item data
 * @throws {ItemParsingUnavailableError} on a missing key, timeout, upstream failure or unreadable reply
 */
const parseItemDescriptionWithGPT = async (description) => {
    try {
        // The text is the user's own; keep it out of info-level logs.
        logger.debug(`Parsing item description with GPT (${description.length} characters)`);

        const apiKey = await getOpenAiKey();
        const openai = new OpenAI({ apiKey, timeout: REQUEST_TIMEOUT_MS, maxRetries: 0 });

        const response = await openai.chat.completions.create({
            model: "gpt-3.5-turbo",
            messages: [
                {
                    role: "system",
                    content: `You are a helpful assistant that parses item descriptions into mods, materials, and item names.
                             - A mod can be an enhancement bonus (e.g., +1, +2), a magical property (e.g., Ghost Touch, Flaming), or a material (e.g., Adamantine, Silver, Mithril).
                             - Each mod should be a separate item in the "mods" array.
                             - The item name should not include any mods or materials.
                             Examples:
                             1. "+1 Ghost Touch Adamantine Rapier" => { "mods": ["+1", "Ghost Touch", "Adamantine"], "item": "Rapier" }
                             2. "+4 Flaming Burst Silver Lance" => { "mods": ["+4", "Flaming Burst", "Silver"], "item": "Lance" }
                             3. "+2 Flaming Steel Longbow" => { "mods": ["+2", "Flaming", "Steel"], "item": "Longbow" }
                             4. "+5 Vicious Mithril Quarterstaff" => { "mods": ["+5", "Vicious", "Mithril"], "item": "Quarterstaff" }
                             5. "+4 Frostbite Cold Iron Battleaxe" => { "mods": ["+4", "Frostbite", "Cold Iron"], "item": "Battleaxe" }
                             Return the result in JSON format like this: { "mods": ["mod1", "mod2", "mod3"], "item": "item_name" }.`
                },
                {
                    role: "user",
                    content: `Parse the following item description into its components (mods and item): "${description}".`
                }
            ],
            temperature: 0.5,
            max_tokens: 256,
            response_format: { type: 'json_object' },
            top_p: 1,
        });

        const parsedData = parseReply(response.choices[0].message.content);
        logger.debug('Item description parsed by GPT');
        return parsedData;
    } catch (error) {
        if (error instanceof ItemParsingUnavailableError) {
            logger.warn(`Item parsing unavailable: ${error.message}`);
            throw error;
        }
        // Log only the error type/status: provider messages can echo request details.
        logger.error('Error parsing item description with GPT', { name: error.name, status: error.status });
        if (isTimeout(error)) {
            throw new ItemParsingUnavailableError(
                'The item parser timed out. Try again or enter the item manually.',
                504
            );
        }
        throw new ItemParsingUnavailableError(
            'The item parser is not available right now. Try again or enter the item manually.'
        );
    }
};

module.exports = {parseItemDescriptionWithGPT, ItemParsingUnavailableError, REQUEST_TIMEOUT_MS};

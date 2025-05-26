const {OpenAI} = require('openai');
const dbUtils = require('../utils/dbUtils');
const logger = require('../utils/logger');

/**
 * Get OpenAI key from settings and decrypt it
 * @returns {Promise<string>} - The decrypted OpenAI API key
 */
const getOpenAiKey = async () => {
    try {
        const result = await dbUtils.executeQuery(
            'SELECT value, value_type FROM settings WHERE name = $1',
            ['openai_key']
        );
        
        if (result.rows.length === 0 || !result.rows[0].value) {
            throw new Error('OpenAI API key not configured in settings');
        }
        
        const row = result.rows[0];
        // Decrypt the stored key if it's encrypted
        if (row.value_type === 'encrypted') {
            return Buffer.from(row.value, 'base64').toString('utf8');
        }
        
        return row.value;
    } catch (error) {
        logger.error('Error retrieving OpenAI key from settings:', error);
        throw error;
    }
};

/**
 * Create OpenAI client with key from settings
 * @returns {Promise<OpenAI>} - OpenAI client instance
 */
const createOpenAiClient = async () => {
    const apiKey = await getOpenAiKey();
    return new OpenAI({ apiKey });
};

/**
 * Function to call GPT API to parse item description
 * @param {string} description - The item description to parse
 * @returns {Promise<Object>} - The parsed item data
 */
const parseItemDescriptionWithGPT = async (description) => {
    try {
        logger.info(`Parsing item description with GPT: "${description.substring(0, 50)}..."`);

        const openai = await createOpenAiClient();
        
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
            max_tokens: 64,
            top_p: 1,
        });

        const parsedData = JSON.parse(response.choices[0].message.content.trim());
        logger.info(`Successfully parsed item: ${JSON.stringify(parsedData)}`);
        return parsedData;
    } catch (error) {
        logger.error(`Error parsing item description with GPT: ${error.message}`);
        throw error;
    }
};

module.exports = {parseItemDescriptionWithGPT};
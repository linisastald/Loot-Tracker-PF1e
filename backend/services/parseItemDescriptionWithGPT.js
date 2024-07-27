const {OpenAI} = require('openai');

const openai = new OpenAI({
    apiKey: process.env.OPENAI_API_KEY // This is also the default, can be omitted
});
// Function to call GPT API to parse item description
const parseItemDescriptionWithGPT = async (description) => {
    try {
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
        return parsedData;
    } catch (error) {
        console.error("Error parsing item description with GPT:", error);
        throw error;
    }
};

module.exports = {parseItemDescriptionWithGPT};

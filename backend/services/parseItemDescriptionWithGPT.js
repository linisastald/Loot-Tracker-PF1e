const { OpenAI } = require('openai');

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
          content:
            'You are a helpful assistant that parses item descriptions into mods, materials, and item names. Materials are considered mods.  Return the result in JSON format like this: { "mods": ["mod1", "mod2"], "item": "item_name" }',
        },
        {
          role: "user",
          content: `Parse the following item description into its components (mods and item): "${description}".`,
        },
      ],
      temperature: 0.5,
      max_tokens: 64,
      top_p: 1,
    });

    const parsedData = JSON.parse(response.choices[0].message.content.trim());
    console.log(parsedData)
    return parsedData;
  } catch (error) {
    console.error("Error parsing item description with GPT:", error);
    throw error;
  }
};

module.exports = { parseItemDescriptionWithGPT };

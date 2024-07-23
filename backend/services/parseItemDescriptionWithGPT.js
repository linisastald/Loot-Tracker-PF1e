const {OpenAIApi } = require("openai");

const openai = new OpenAIApi({
  apiKey: process.env.OPENAI_API_KEY, // Ensure your API key is stored securely
});

// Function to call GPT API to parse item description
const parseItemDescriptionWithGPT = async (description) => {
  try {
    const response = await openai.createChatCompletion({
      model: "gpt-3.5-turbo",
      messages: [
        {
          role: "system",
          content:
            'You are a helpful assistant that parses item descriptions into mods and item names. Return the result in JSON format like this: { "mods": ["mod1", "mod2"], "item": "item_name" }',
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

    const parsedData = JSON.parse(response.data.choices[0].message.content.trim());
    return parsedData;
  } catch (error) {
    console.error("Error parsing item description with GPT:", error);
    throw error;
  }
};

module.exports = { parseItemDescriptionWithGPT };

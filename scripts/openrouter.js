require('dotenv').config();
const OpenAI = require('openai');
const logger = require('../src/utils/logger');

// OpenRouter reasoning demo: asks a question with reasoning enabled, then
// re-sends the assistant's reasoning_details unmodified so the model picks
// up its train of thought instead of starting fresh.
//
// Usage:
//   node scripts/openrouter.js                 -> run the strawberry demo
//   node scripts/openrouter.js "your prompt"   -> ask something else (single call)
//
// Env:
//   OPENROUTER_API_KEY  - required, from https://openrouter.ai/keys
//   OPENROUTER_MODEL    - optional, defaults to the free dots-3 preview

const MODEL = process.env.OPENROUTER_MODEL || 'dots-studio/dots-3-note-preview:free';

async function main() {
    if (!process.env.OPENROUTER_API_KEY) {
        logger.error('OPENROUTER_API_KEY must be set in .env');
        process.exitCode = 1;
        return;
    }

    const client = new OpenAI({
        baseURL: 'https://openrouter.ai/api/v1',
        apiKey: process.env.OPENROUTER_API_KEY,
    });

    const question = process.argv[2] || "How many r's are in the word 'strawberry'?";

    // First API call with reasoning
    const apiResponse = await client.chat.completions.create({
        model: MODEL,
        messages: [
            {
                role: 'user',
                content: question,
            },
        ],
        reasoning: { enabled: true },
    });

    const response = apiResponse.choices[0].message;
    console.log(response.content);
    if (response.reasoning_details) {
        console.log('\n--- reasoning_details ---');
        console.log(JSON.stringify(response.reasoning_details, null, 2));
    }

    // Preserve the assistant message with reasoning_details
    const messages = [
        {
            role: 'user',
            content: question,
        },
        {
            role: 'assistant',
            content: response.content,
            reasoning_details: response.reasoning_details, // Pass back unmodified
        },
        {
            role: 'user',
            content: 'Are you sure? Think carefully.',
        },
    ];

    // Second API call - model continues reasoning from where it left off
    const response2 = await client.chat.completions.create({
        model: MODEL,
        messages, // Includes preserved reasoning_details
        reasoning: { enabled: true },
    });

    console.log('\n--- follow-up ---');
    console.log(response2.choices[0].message.content);
}

main().catch((err) => {
    logger.error('OpenRouter request failed:', err?.error ? JSON.stringify(err.error) : err);
    process.exitCode = 1;
});

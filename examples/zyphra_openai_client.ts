/**
 * Zyphra Cloud chat-completion example using the OpenAI SDK.
 *
 * Zyphra Cloud exposes an OpenAI-compatible Chat Completions endpoint, so the
 * official `openai` client can talk to it directly by overriding `baseURL`.
 *
 * Run with:
 *
 *   ZYPHRA_API_KEY=zk-... npx ts-node examples/zyphra_openai_client.ts
 */

import OpenAI from 'openai';

const client = new OpenAI({
  apiKey: process.env.ZYPHRA_API_KEY,
  baseURL: 'https://api.zyphracloud.com/api/v1',
});

async function main() {
  const response = await client.chat.completions.create({
    model: 'zyphra/ZAYA1-8B',
    messages: [{ role: 'user', content: 'Hello!' }],
  });
  console.log(response.choices[0].message.content);
}

main();

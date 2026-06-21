require('dotenv').config({ path: '.env.local' });
const { GoogleGenerativeAI } = require('@google/generative-ai');

async function testAll() {
  const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY, { apiVersion: 'v1beta' });
  const modelsToTest = [
    'gemini-2.5-flash',
    'gemini-2.0-flash',
    'gemini-3.1-pro-preview',
    'gemini-3.5-flash',
    'antigravity-preview-05-2026'
  ];
  for (const m of modelsToTest) {
    console.log(`Testing ${m}...`);
    try {
      const model = genAI.getGenerativeModel({ model: m });
      const result = await model.generateContent('Say hello world');
      console.log(`[SUCCESS] ${m}:`, result.response.text().trim());
      // Wait to avoid overlapping rate limits if any
      await new Promise(r => setTimeout(r, 1000));
    } catch(e) {
      console.log(`[FAILED] ${m}:`, e.message.split('\n')[0]);
    }
  }
}
testAll();

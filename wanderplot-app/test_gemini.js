require('dotenv').config({ path: '.env.local' });
const { GoogleGenerativeAI } = require('@google/generative-ai');

async function test() {
  const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY, { apiVersion: 'v1' });
  const model = genAI.getGenerativeModel({ model: 'gemini-1.5-flash' });
  try {
    const result = await model.generateContent('Say hello world');
    console.log(result.response.text());
  } catch (e) {
    console.error("Error:", e);
  }
}
test();

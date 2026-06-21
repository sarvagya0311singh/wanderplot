require('dotenv').config({ path: '.env.local' });
const { GoogleGenerativeAI } = require('@google/generative-ai');
async function run() {
  try {
    const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
    const model = genAI.getGenerativeModel({ model: 'gemini-3.5-flash' });
    const result = await model.generateContent('Say hello');
    console.log('[SUCCESS]', result.response.text().trim());
  } catch(e) {
    console.error('[ERROR]', e.message);
  }
}
run();

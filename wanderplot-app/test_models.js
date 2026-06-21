require('dotenv').config({ path: '.env.local' });
const { GoogleGenerativeAI } = require('@google/generative-ai');

async function testModel(modelName) {
  const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY, { apiVersion: 'v1' });
  const model = genAI.getGenerativeModel({ model: modelName });
  console.log(`Testing ${modelName}...`);
  try {
    const result = await model.generateContent('Say hello');
    console.log(`[SUCCESS] ${modelName}:`, result.response.text().trim());
  } catch (e) {
    console.log(`[FAILED] ${modelName}:`, e.message.split('\n')[0]);
  }
}

async function run() {
  await testModel('gemini-1.5-flash');
  await testModel('gemini-1.5-pro');
  await testModel('gemini-1.0-pro');
  await testModel('gemini-2.0-flash');
}
run();

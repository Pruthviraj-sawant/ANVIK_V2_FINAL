import { GoogleGenerativeAI } from '@google/generative-ai';
import dotenv from 'dotenv';
import path from 'path';

dotenv.config({ path: path.join(process.cwd(), '.env') });

async function testEmbedding() {
    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) {
        console.error('GEMINI_API_KEY not found in .env');
        return;
    }

    const genAI = new GoogleGenerativeAI(apiKey);
    const modelName = 'text-embedding-004';

    console.log(`Testing embedding with model: ${modelName}`);

    try {
        const model = genAI.getGenerativeModel({ model: modelName });
        const text = "This is a test sentence for embedding generation.";
        const result = await model.embedContent(text);
        const values = result.embedding.values;

        console.log('Success!');
        console.log(`Dimensions: ${values.length}`);
        console.log(`Sample values: ${values.slice(0, 5)}...`);

        if (values.length !== 768) {
            console.warn(`WARNING: Dimensions are ${values.length}, but schema expects 768!`);
        } else {
            console.log('Dimensions match the schema (768).');
        }
    } catch (error) {
        console.error('Error generating embedding:');
        if (error instanceof Error) {
            console.error(error.message);
            if ('response' in error) {
                console.error('Response data:', (error as any).response?.data);
            }
        } else {
            console.error(error);
        }
    }
}

testEmbedding();

import { GoogleGenerativeAI } from '@google/generative-ai'
import dotenv from 'dotenv'

dotenv.config()

if (!process.env.GEMINI_API_KEY) {
  throw new Error('GEMINI_API_KEY environment variable is required')
}

if (!process.env.GOOGLE_GENERATIVE_AI_API_KEY) {
  process.env.GOOGLE_GENERATIVE_AI_API_KEY = process.env.GEMINI_API_KEY
}
export const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY)


export const EMBEDDING_DIMENSION = 768;

export function embeddingModelName() {
  // The user's API key has access to 'gemini-embedding-001' which supports custom dimensionality.
  return 'gemini-embedding-001';
}

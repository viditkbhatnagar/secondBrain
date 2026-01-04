export interface PromptContext {
  query: string;
  sources: Array<{
    content: string;
    documentName: string;
    relevanceScore: number;
  }>;
  conversationHistory?: Array<{ role: string; content: string }>;
  userPreferences?: {
    responseLength: 'brief' | 'detailed' | 'comprehensive';
    tone: 'professional' | 'casual' | 'academic';
    includeExamples: boolean;
  };
}

export class PromptService {
  
  // Main RAG prompt with source citations
  buildRAGPrompt(context: PromptContext): string {
    const { query, sources, conversationHistory, userPreferences } = context;

    const sourcesText = sources
      .map((s, i) => `[Source ${i + 1}: ${s.documentName}]\n${s.content}`)
      .join('\n\n---\n\n');

    const lengthInstruction = {
      brief: 'Keep your response concise (2-3 sentences).',
      detailed: 'Provide a detailed response with explanations.',
      comprehensive: 'Provide a comprehensive response covering all aspects.'
    }[userPreferences?.responseLength || 'detailed'];

    const toneInstruction = {
      professional: 'Use a professional, business-appropriate tone.',
      casual: 'Use a friendly, conversational tone.',
      academic: 'Use an academic, formal tone with precise terminology.'
    }[userPreferences?.tone || 'professional'];

    return `You are an intelligent assistant that answers questions based ONLY on the provided sources.

CRITICAL RULES:
1. ONLY use information from the provided sources
2. If the sources don't contain the answer, say "I couldn't find information about this in your documents"
3. ALWAYS cite sources using [Source N] format
4. Be accurate - don't make up information
5. If sources conflict, mention both perspectives
6. ${lengthInstruction}
7. ${toneInstruction}

SOURCES:
${sourcesText}

${conversationHistory?.length ? `CONVERSATION HISTORY:
${conversationHistory.map(m => `${m.role}: ${m.content}`).join('\n')}` : ''}

USER QUESTION: ${query}

Provide your response with source citations:`;
  }

  // Prompt for when no sources found
  buildNoSourcesPrompt(query: string): string {
    return `The user asked: "${query}"

Unfortunately, I couldn't find any relevant information in your knowledge base documents.

Please respond helpfully by:
1. Acknowledging you don't have information on this topic in the uploaded documents
2. Suggesting what types of documents they might upload to get this information
3. Offering to help with a different question

Keep the response brief and helpful.`;
  }

  // Prompt for source validation
  buildValidationPrompt(query: string, sources: string[]): string {
    return `Evaluate if these sources can answer the question.

Question: ${query}

Sources:
${sources.map((s, i) => `[${i + 1}] ${s.slice(0, 300)}...`).join('\n\n')}

Return JSON:
{
  "canAnswer": true/false,
  "confidence": 0-100,
  "relevantSourceIndices": [1, 2, ...],
  "missingInfo": "what info is missing if can't fully answer"
}`;
  }

  // Prompt for summarization
  buildSummaryPrompt(content: string, maxLength: number = 200): string {
    return `Summarize the following text in ${maxLength} characters or less.

Capture the main points and key information.

Text: ${content}

Summary:`;
  }

  // Prompt for extracting key facts
  buildFactExtractionPrompt(content: string): string {
    return `Extract key facts from this text as a JSON array.

Text: ${content}

Return JSON array of facts:
[
  {"fact": "...", "confidence": 0.9, "category": "..."},
  ...
]`;
  }
}

export const promptService = new PromptService();

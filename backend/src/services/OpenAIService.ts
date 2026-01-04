import OpenAI from 'openai';

// Lazy initialization to avoid errors when env vars aren't loaded yet
let openaiClient: OpenAI | null = null;

function getOpenAIClient(): OpenAI {
  if (!openaiClient) {
    openaiClient = new OpenAI({
      apiKey: process.env.OPENAI_API_KEY,
    });
  }
  return openaiClient;
}

export interface GeneralAnswer {
  answer: string;
  isGeneralKnowledge: boolean;
  model: string;
}

export class OpenAIService {
  private static model = 'gpt-4o-mini'; // Fast and cost-effective

  /**
   * Check if OpenAI is configured
   */
  static isConfigured(): boolean {
    return !!process.env.OPENAI_API_KEY;
  }

  /**
   * Generate a general knowledge answer using OpenAI
   * Used as fallback when no relevant documents are found
   */
  static async generateGeneralAnswer(
    question: string,
    conversationHistory?: Array<{ role: 'user' | 'assistant'; content: string }>
  ): Promise<GeneralAnswer> {
    if (!this.isConfigured()) {
      throw new Error('OpenAI API key not configured');
    }

    try {
      const openai = getOpenAIClient();
      const messages: OpenAI.Chat.ChatCompletionMessageParam[] = [
        {
          role: 'system',
          content: `You are a helpful AI assistant providing general knowledge answers.

IMPORTANT FORMATTING RULES:
- Do NOT use markdown formatting (no **, no ##, no *, no backticks)
- Use plain text only
- For emphasis, use quotation marks like "important term" instead of **bold**
- Use simple punctuation: periods, commas, question marks, exclamation points
- Write in a natural, conversational tone
- Keep responses clear and concise
- Use line breaks for readability when listing multiple points`
        }
      ];

      // Add conversation history if provided
      if (conversationHistory && conversationHistory.length > 0) {
        for (const msg of conversationHistory.slice(-6)) { // Last 6 messages for context
          messages.push({
            role: msg.role,
            content: msg.content
          });
        }
      }

      // Add the current question
      messages.push({
        role: 'user',
        content: question
      });

      const response = await openai.chat.completions.create({
        model: this.model,
        messages,
        max_tokens: 1500,
        temperature: 0.7,
      });

      let answer = response.choices[0]?.message?.content || 'I apologize, but I was unable to generate a response.';
      
      // Clean up any markdown that slipped through
      answer = answer
        .replace(/\*\*([^*]+)\*\*/g, '"$1"')  // **bold** -> "bold"
        .replace(/\*([^*]+)\*/g, '$1')         // *italic* -> plain
        .replace(/`([^`]+)`/g, '"$1"')         // `code` -> "code"
        .replace(/^#+\s*/gm, '')               // Remove headers
        .replace(/^[-*]\s+/gm, '• ');          // Convert list markers to bullets

      return {
        answer,
        isGeneralKnowledge: true,
        model: this.model
      };
    } catch (error: any) {
      console.error('OpenAI API error:', error);
      throw new Error(`Failed to generate general answer: ${error.message}`);
    }
  }

  /**
   * Stream a general knowledge answer using OpenAI
   */
  static async *streamGeneralAnswer(
    question: string,
    conversationHistory?: Array<{ role: 'user' | 'assistant'; content: string }>
  ): AsyncGenerator<string, void, unknown> {
    if (!this.isConfigured()) {
      throw new Error('OpenAI API key not configured');
    }

    const openai = getOpenAIClient();
    const messages: OpenAI.Chat.ChatCompletionMessageParam[] = [
      {
        role: 'system',
        content: `You are a helpful AI assistant providing general knowledge answers.

IMPORTANT FORMATTING RULES:
- Do NOT use markdown formatting (no **, no ##, no *, no backticks)
- Use plain text only
- For emphasis, use quotation marks like "important term" instead of **bold**
- Use simple punctuation: periods, commas, question marks, exclamation points
- Write in a natural, conversational tone
- Keep responses clear and concise`
      }
    ];

    if (conversationHistory && conversationHistory.length > 0) {
      for (const msg of conversationHistory.slice(-6)) {
        messages.push({
          role: msg.role,
          content: msg.content
        });
      }
    }

    messages.push({
      role: 'user',
      content: question
    });

    const stream = await openai.chat.completions.create({
      model: this.model,
      messages,
      max_tokens: 1500,
      temperature: 0.7,
      stream: true,
    });

    for await (const chunk of stream) {
      let content = chunk.choices[0]?.delta?.content;
      if (content) {
        // Clean markdown on the fly
        content = content.replace(/\*\*/g, '"');
        yield content;
      }
    }
  }
}

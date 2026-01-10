import { Response } from 'express';
import { OpenAI } from 'openai';
import { logger } from '../utils/logger';

export class StreamingService {
  private openai: OpenAI | null = null;

  private getOpenAI(): OpenAI {
    if (!this.openai) {
      this.openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
    }
    return this.openai;
  }

  // Stream LLM response to client
  async streamResponse(
    res: Response,
    prompt: string,
    options: {
      model?: string;
      temperature?: number;
      maxTokens?: number;
      onToken?: (token: string) => void;
    } = {}
  ): Promise<void> {
    const {
      model = 'gpt-5',
      temperature = 1,
      maxTokens = 1000,
      onToken
    } = options;

    // Set headers for SSE
    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');
    res.setHeader('X-Accel-Buffering', 'no');

    try {
      const stream = await this.getOpenAI().chat.completions.create({
        model,
        messages: [{ role: 'user', content: prompt }],
        temperature,
        max_completion_tokens: maxTokens,
        stream: true
      });

      let fullResponse = '';

      for await (const chunk of stream) {
        const content = chunk.choices[0]?.delta?.content || '';
        if (content) {
          fullResponse += content;
          
          // Send chunk to client
          res.write(`data: ${JSON.stringify({ content, done: false })}\n\n`);
          
          // Optional callback
          onToken?.(content);
        }
      }

      // Send completion signal
      res.write(`data: ${JSON.stringify({ content: '', done: true, fullResponse })}\n\n`);
      res.end();

    } catch (error) {
      logger.error('Streaming failed:', error);
      res.write(`data: ${JSON.stringify({ error: 'Streaming failed', done: true })}\n\n`);
      res.end();
    }
  }

  // Stream with sources
  async streamWithSources(
    res: Response,
    query: string,
    sources: Array<{ content: string; documentName: string; score: number }>,
    options: any = {}
  ): Promise<void> {
    // First, send sources immediately
    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');

    // Send sources first (instant)
    res.write(`data: ${JSON.stringify({ 
      type: 'sources',
      sources: sources.map(s => ({
        documentName: s.documentName,
        score: s.score,
        preview: s.content.slice(0, 200)
      }))
    })}\n\n`);

    // Build prompt
    const prompt = this.buildStreamingPrompt(query, sources);

    // Stream the response
    try {
      const stream = await this.getOpenAI().chat.completions.create({
        model: options.model || 'gpt-5',
        messages: [{ role: 'user', content: prompt }],
        temperature: 1,
        max_completion_tokens: 12000,
        stream: true
      });

      let fullResponse = '';

      for await (const chunk of stream) {
        const content = chunk.choices[0]?.delta?.content || '';
        if (content) {
          fullResponse += content;
          res.write(`data: ${JSON.stringify({ type: 'content', content })}\n\n`);
        }
      }

      // Send completion
      res.write(`data: ${JSON.stringify({ type: 'done', fullResponse })}\n\n`);
      res.end();

    } catch (error) {
      logger.error('Streaming with sources failed:', error);
      res.write(`data: ${JSON.stringify({ type: 'error', message: 'Failed to generate response' })}\n\n`);
      res.end();
    }
  }

  private buildStreamingPrompt(query: string, sources: any[]): string {
    const sourcesText = sources
      .map((s, i) => `[Source ${i + 1}: ${s.documentName}]
${s.content}`)
      .join('\n\n---\n\n');

    return `You are a research assistant providing real-time answers based on retrieved documents. Your responses will be streamed to the user, so maintain clarity and structure throughout.

========================================
RETRIEVED SOURCES
========================================
${sourcesText}

========================================
USER QUESTION
========================================
${query}

========================================
RESPONSE GUIDELINES
========================================

1. ACCURACY & GROUNDING:
   - Base your answer ONLY on the provided sources
   - Present information clearly without source citations
   - If information is not in sources, explicitly state: "This information is not available in the provided documents."
   - Never invent or infer facts not present in sources

2. STRUCTURE & CLARITY:
   - Start with a direct answer to the question
   - Organize information logically with clear sections if needed
   - Use bullet points or numbered lists for multiple items
   - Maintain coherent flow suitable for streaming delivery

3. COMPLETENESS:
   - Include ALL relevant details from sources
   - When sources contain lists or steps, include ALL items
   - Synthesize information from multiple sources when they complement each other
   - Preserve important numbers, dates, and specific details

4. CONTENT PRESENTATION:
   - NO source citations needed - present information cleanly
   - When quoting verbatim, use quotes: "exact text"
   - Synthesize information from multiple sources seamlessly

5. STREAMING OPTIMIZATION:
   - Write in complete sentences and paragraphs
   - Avoid placeholder text or incomplete thoughts
   - Structure response so partial streaming makes sense
   - Conclude with a natural ending (don't leave response hanging)

ANSWER:`;
  }
}

export const streamingService = new StreamingService();

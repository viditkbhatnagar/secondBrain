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
      .map((s, i) => `[Source ${i + 1}: ${s.documentName}]\n${s.content}`)
      .join('\n\n');

    return `Based on these sources, answer the question. Cite sources using [Source N] format.

SOURCES:
${sourcesText}

QUESTION: ${query}

Answer:`;
  }
}

export const streamingService = new StreamingService();

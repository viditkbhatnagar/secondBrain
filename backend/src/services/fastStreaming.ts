import { Response } from 'express';
import { OpenAI } from 'openai';
import { logger } from '../utils/logger';

interface StreamConfig {
  model: string;
  temperature: number;
  maxTokens: number;
}

const DEFAULT_CONFIG: StreamConfig = {
  model: 'gpt-5',
  temperature: 1,
  maxTokens: 12000
};

export class FastStreamingService {
  private openai: OpenAI | null = null;

  private getOpenAI(): OpenAI {
    if (!this.openai) {
      this.openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
    }
    return this.openai;
  }

  // Stream response with immediate source delivery
  async streamRAGResponse(
    res: Response,
    query: string,
    sources: Array<{ documentName: string; content: string; score: number }>,
    config: Partial<StreamConfig> = {}
  ): Promise<void> {
    const cfg = { ...DEFAULT_CONFIG, ...config };
    const startTime = Date.now();

    // Setup SSE headers
    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');
    res.setHeader('X-Accel-Buffering', 'no');
    res.flushHeaders();

    // IMMEDIATELY send sources (user sees something instantly)
    res.write(`data: ${JSON.stringify({
      type: 'sources',
      data: sources.map(s => ({
        documentName: s.documentName,
        score: Math.round(s.score * 100),
        preview: s.content.slice(0, 150)
      }))
    })}\n\n`);

    // Send thinking indicator
    res.write(`data: ${JSON.stringify({ type: 'thinking' })}\n\n`);

    try {
      // Build optimized prompt
      const prompt = this.buildFastPrompt(query, sources);

      // Start streaming from LLM
      const stream = await this.getOpenAI().chat.completions.create({
        model: cfg.model,
        messages: [
          {
            role: 'system',
            content: 'You are a helpful assistant that answers questions based on provided sources. Always cite sources using [Source N] format. Be concise but comprehensive.'
          },
          { role: 'user', content: prompt }
        ],
        temperature: cfg.temperature,
        max_completion_tokens: cfg.maxTokens,
        stream: true
      });

      let fullResponse = '';
      let tokenCount = 0;
      let firstTokenTime: number | null = null;

      for await (const chunk of stream) {
        const content = chunk.choices[0]?.delta?.content || '';
        if (content) {
          if (!firstTokenTime) {
            firstTokenTime = Date.now();
            logger.info(`Time to first token: ${firstTokenTime - startTime}ms`);
          }

          fullResponse += content;
          tokenCount++;

          // Send token to client
          res.write(`data: ${JSON.stringify({
            type: 'token',
            data: content
          })}\n\n`);
        }
      }

      // Send completion
      res.write(`data: ${JSON.stringify({
        type: 'done',
        data: {
          fullResponse,
          tokenCount,
          responseTime: Date.now() - startTime,
          ttft: firstTokenTime ? firstTokenTime - startTime : null
        }
      })}\n\n`);

      logger.info(`Streaming completed`, {
        query: query.slice(0, 50),
        responseTime: Date.now() - startTime,
        ttft: firstTokenTime ? firstTokenTime - startTime : null,
        tokenCount
      });

    } catch (error: any) {
      logger.error('Streaming failed:', error);
      res.write(`data: ${JSON.stringify({
        type: 'error',
        data: { message: error.message || 'Streaming failed' }
      })}\n\n`);
    } finally {
      res.end();
    }
  }

  private buildFastPrompt(query: string, sources: any[]): string {
    const sourcesText = sources
      .map((s, i) => `[Source ${i + 1}: ${s.documentName}]
${s.content}`)
      .join('\n\n---\n\n');

    return `You are a high-speed research assistant optimized for rapid, accurate responses. Provide a concise yet comprehensive answer based on the retrieved sources.

========================================
SOURCES
========================================
${sourcesText}

========================================
QUESTION
========================================
${query}

========================================
RESPONSE REQUIREMENTS
========================================

SPEED & EFFICIENCY:
- Get to the point immediately - no preambles
- Prioritize the most relevant information first
- Be concise while maintaining completeness
- Avoid redundant explanations

ACCURACY & GROUNDING:
- Use ONLY information from provided sources
- Present information clearly without source citations
- If information is missing, state: "Not found in provided sources"
- Never speculate or infer beyond source content

STRUCTURE:
- Lead with direct answer to the question
- Use bullet points for lists and multiple items
- Include ALL relevant details from sources (don't summarize away important info)
- Organize logically for quick comprehension

CONTENT PRESENTATION:
- NO source citations needed
- For quotes: "exact text"
- Synthesize information seamlessly

ANSWER:`;
  }

  // Stream with custom system prompt
  async streamWithSystemPrompt(
    res: Response,
    systemPrompt: string,
    userPrompt: string,
    config: Partial<StreamConfig> = {}
  ): Promise<void> {
    const cfg = { ...DEFAULT_CONFIG, ...config };
    const startTime = Date.now();

    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');
    res.setHeader('X-Accel-Buffering', 'no');
    res.flushHeaders();

    try {
      const stream = await this.getOpenAI().chat.completions.create({
        model: cfg.model,
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: userPrompt }
        ],
        temperature: cfg.temperature,
        max_completion_tokens: cfg.maxTokens,
        stream: true
      });

      let fullResponse = '';

      for await (const chunk of stream) {
        const content = chunk.choices[0]?.delta?.content || '';
        if (content) {
          fullResponse += content;
          res.write(`data: ${JSON.stringify({ type: 'token', data: content })}\n\n`);
        }
      }

      res.write(`data: ${JSON.stringify({
        type: 'done',
        data: { fullResponse, responseTime: Date.now() - startTime }
      })}\n\n`);

    } catch (error: any) {
      res.write(`data: ${JSON.stringify({
        type: 'error',
        data: { message: error.message }
      })}\n\n`);
    } finally {
      res.end();
    }
  }
}

export const fastStreaming = new FastStreamingService();

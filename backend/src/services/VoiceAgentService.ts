import WebSocket from 'ws';
import { logger } from '../utils/logger';
import { TrainingService } from './TrainingService';
import { analyticsService } from './AnalyticsService';

// OpenAI Realtime API configuration
const OPENAI_REALTIME_URL = 'wss://api.openai.com/v1/realtime';
const OPENAI_REALTIME_MODEL = 'gpt-4o-realtime-preview-2024-12-17';

// Pricing for Realtime API (per 1M tokens)
const REALTIME_INPUT_TEXT_COST = 5.00;
const REALTIME_INPUT_AUDIO_COST = 100.00;
const REALTIME_OUTPUT_TEXT_COST = 20.00;
const REALTIME_OUTPUT_AUDIO_COST = 200.00;

interface VoiceSession {
  id: string;
  clientWs: WebSocket;
  openaiWs: WebSocket | null;
  documentId: string;
  pageNumber: number;
  pageContext: string;
  isConnected: boolean;
  startTime: number;
}

/**
 * VoiceAgentService - Handles real-time voice conversations using OpenAI Realtime API
 * Provides an interactive voice agent that can discuss training document pages
 */
export class VoiceAgentService {
  private static sessions: Map<string, VoiceSession> = new Map();

  /**
   * Calculate estimated cost for voice session
   */
  private static calculateCost(
    inputTextTokens: number,
    inputAudioTokens: number,
    outputTextTokens: number,
    outputAudioTokens: number
  ): number {
    return (
      (inputTextTokens / 1_000_000) * REALTIME_INPUT_TEXT_COST +
      (inputAudioTokens / 1_000_000) * REALTIME_INPUT_AUDIO_COST +
      (outputTextTokens / 1_000_000) * REALTIME_OUTPUT_TEXT_COST +
      (outputAudioTokens / 1_000_000) * REALTIME_OUTPUT_AUDIO_COST
    );
  }

  /**
   * Create a new voice session for a document page
   */
  static async createSession(
    sessionId: string,
    clientWs: WebSocket,
    documentId: string,
    pageNumber: number
  ): Promise<void> {
    try {
      // Extract page content for context
      const pageContext = await TrainingService.extractPageContent(documentId, pageNumber);

      if (!pageContext || pageContext.trim().length < 50) {
        clientWs.send(JSON.stringify({
          type: 'error',
          message: 'Insufficient content on this page for voice interaction'
        }));
        return;
      }

      // Get document info for context
      const document = await TrainingService.getDocumentById(documentId);
      const documentName = document?.originalName || 'Unknown Document';

      // Create session object
      const session: VoiceSession = {
        id: sessionId,
        clientWs,
        openaiWs: null,
        documentId,
        pageNumber,
        pageContext,
        isConnected: false,
        startTime: Date.now()
      };

      this.sessions.set(sessionId, session);

      // Connect to OpenAI Realtime API
      await this.connectToOpenAI(session, documentName);

      logger.info(`Voice session created: ${sessionId} for document ${documentId} page ${pageNumber}`);
    } catch (error: any) {
      logger.error('Failed to create voice session:', error);
      clientWs.send(JSON.stringify({
        type: 'error',
        message: error.message || 'Failed to create voice session'
      }));
    }
  }

  /**
   * Connect to OpenAI Realtime API
   */
  private static async connectToOpenAI(session: VoiceSession, documentName: string): Promise<void> {
    const apiKey = process.env.OPENAI_API_KEY;
    if (!apiKey) {
      throw new Error('OPENAI_API_KEY is required for voice agent');
    }

    const url = `${OPENAI_REALTIME_URL}?model=${OPENAI_REALTIME_MODEL}`;

    const openaiWs = new WebSocket(url, {
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'OpenAI-Beta': 'realtime=v1'
      }
    });

    session.openaiWs = openaiWs;

    openaiWs.on('open', () => {
      logger.info(`OpenAI Realtime connection established for session ${session.id}`);
      session.isConnected = true;

      // Configure the session with page context
      const systemPrompt = this.buildSystemPrompt(session.pageContext, documentName, session.pageNumber);

      // Send session configuration
      openaiWs.send(JSON.stringify({
        type: 'session.update',
        session: {
          modalities: ['text', 'audio'],
          instructions: systemPrompt,
          voice: 'alloy',
          input_audio_format: 'pcm16',
          output_audio_format: 'pcm16',
          input_audio_transcription: {
            model: 'whisper-1'
          },
          turn_detection: {
            type: 'server_vad',
            threshold: 0.5,
            prefix_padding_ms: 300,
            silence_duration_ms: 500
          },
          tools: [],
          tool_choice: 'auto',
          temperature: 0.8,
          max_response_output_tokens: 4096
        }
      }));

      // Notify client that connection is ready
      session.clientWs.send(JSON.stringify({
        type: 'session.ready',
        sessionId: session.id
      }));
    });

    openaiWs.on('message', (data: WebSocket.Data) => {
      this.handleOpenAIMessage(session, data);
    });

    openaiWs.on('error', (error) => {
      logger.error(`OpenAI WebSocket error for session ${session.id}:`, error);
      session.clientWs.send(JSON.stringify({
        type: 'error',
        message: 'Voice connection error'
      }));
    });

    openaiWs.on('close', () => {
      logger.info(`OpenAI connection closed for session ${session.id}`);
      session.isConnected = false;
      session.clientWs.send(JSON.stringify({
        type: 'session.closed'
      }));
    });
  }

  /**
   * Build system prompt with page context
   */
  private static buildSystemPrompt(pageContext: string, documentName: string, pageNumber: number): string {
    return `You are an intelligent, friendly voice assistant helping a sales consultant learn from training materials. You have access to the content of a specific page from a training document and should answer questions about it conversationally.

DOCUMENT: ${documentName}
PAGE: ${pageNumber}

PAGE CONTENT:
${pageContext}

GUIDELINES:
1. Be conversational, warm, and encouraging - like a helpful colleague
2. Answer questions based on the page content above
3. If asked about something not on this page, politely say it's not covered here and suggest what topics are available
4. Explain concepts in simple, practical terms
5. Give real-world examples when helpful
6. Keep responses concise for voice - aim for 2-4 sentences unless more detail is requested
7. If the user seems confused, offer to explain differently
8. You can reference specific parts of the content to help the user understand
9. Be proactive in highlighting key takeaways from the material

Remember: You're having a voice conversation, so be natural and avoid bullet points or formatted text. Speak as you would to a colleague.`;
  }

  /**
   * Handle messages from OpenAI Realtime API
   */
  private static handleOpenAIMessage(session: VoiceSession, data: WebSocket.Data): void {
    try {
      const message = JSON.parse(data.toString());

      // Forward relevant messages to client
      switch (message.type) {
        case 'session.created':
        case 'session.updated':
          // Session configuration confirmed
          logger.debug(`Session ${message.type} for ${session.id}`);
          break;

        case 'response.audio.delta':
          // Stream audio to client
          session.clientWs.send(JSON.stringify({
            type: 'audio.delta',
            delta: message.delta
          }));
          break;

        case 'response.audio.done':
          session.clientWs.send(JSON.stringify({
            type: 'audio.done'
          }));
          break;

        case 'response.audio_transcript.delta':
          // Stream transcript to client
          session.clientWs.send(JSON.stringify({
            type: 'transcript.delta',
            delta: message.delta,
            role: 'assistant'
          }));
          break;

        case 'response.audio_transcript.done':
          session.clientWs.send(JSON.stringify({
            type: 'transcript.done',
            transcript: message.transcript,
            role: 'assistant'
          }));
          break;

        case 'conversation.item.input_audio_transcription.completed':
          // User's speech transcribed
          session.clientWs.send(JSON.stringify({
            type: 'transcript.done',
            transcript: message.transcript,
            role: 'user'
          }));
          break;

        case 'input_audio_buffer.speech_started':
          session.clientWs.send(JSON.stringify({
            type: 'speech.started'
          }));
          break;

        case 'input_audio_buffer.speech_stopped':
          session.clientWs.send(JSON.stringify({
            type: 'speech.stopped'
          }));
          break;

        case 'response.done':
          // Track usage if available
          if (message.response?.usage) {
            const usage = message.response.usage;
            const cost = this.calculateCost(
              usage.input_tokens || 0,
              usage.input_token_details?.audio_tokens || 0,
              usage.output_tokens || 0,
              usage.output_token_details?.audio_tokens || 0
            );

            analyticsService.trackEvent('ai_response', 'voice-session', {
              aiSource: 'training',
              aiFeature: 'voice_agent',
              tokensUsed: (usage.input_tokens || 0) + (usage.output_tokens || 0),
              estimatedCost: cost,
              responseTime: Date.now() - session.startTime,
              documentId: session.documentId
            });
          }

          session.clientWs.send(JSON.stringify({
            type: 'response.done'
          }));
          break;

        case 'error':
          logger.error(`OpenAI error for session ${session.id}:`, message.error);
          session.clientWs.send(JSON.stringify({
            type: 'error',
            message: message.error?.message || 'An error occurred'
          }));
          break;

        default:
          // Log unknown message types for debugging
          logger.debug(`Unknown OpenAI message type: ${message.type}`);
      }
    } catch (error) {
      logger.error('Failed to parse OpenAI message:', error);
    }
  }

  /**
   * Handle audio data from client
   */
  static sendAudioToOpenAI(sessionId: string, audioData: string): void {
    const session = this.sessions.get(sessionId);
    if (!session || !session.openaiWs || !session.isConnected) {
      logger.warn(`Cannot send audio - session ${sessionId} not connected`);
      return;
    }

    // Forward audio to OpenAI
    session.openaiWs.send(JSON.stringify({
      type: 'input_audio_buffer.append',
      audio: audioData
    }));
  }

  /**
   * Commit audio buffer to trigger response
   */
  static commitAudio(sessionId: string): void {
    const session = this.sessions.get(sessionId);
    if (!session || !session.openaiWs || !session.isConnected) {
      return;
    }

    session.openaiWs.send(JSON.stringify({
      type: 'input_audio_buffer.commit'
    }));
  }

  /**
   * Send text message (for testing or accessibility)
   */
  static sendTextMessage(sessionId: string, text: string): void {
    const session = this.sessions.get(sessionId);
    if (!session || !session.openaiWs || !session.isConnected) {
      logger.warn(`Cannot send text - session ${sessionId} not connected`);
      return;
    }

    // Create a conversation item with user text
    session.openaiWs.send(JSON.stringify({
      type: 'conversation.item.create',
      item: {
        type: 'message',
        role: 'user',
        content: [{
          type: 'input_text',
          text: text
        }]
      }
    }));

    // Trigger response
    session.openaiWs.send(JSON.stringify({
      type: 'response.create'
    }));
  }

  /**
   * Interrupt current response
   */
  static interruptResponse(sessionId: string): void {
    const session = this.sessions.get(sessionId);
    if (!session || !session.openaiWs || !session.isConnected) {
      return;
    }

    session.openaiWs.send(JSON.stringify({
      type: 'response.cancel'
    }));
  }

  /**
   * Close a voice session
   */
  static closeSession(sessionId: string): void {
    const session = this.sessions.get(sessionId);
    if (!session) {
      return;
    }

    // Track session duration
    const duration = Date.now() - session.startTime;
    logger.info(`Voice session ${sessionId} ended after ${duration}ms`);

    // Close OpenAI connection
    if (session.openaiWs) {
      session.openaiWs.close();
    }

    // Remove from sessions map
    this.sessions.delete(sessionId);
  }

  /**
   * Handle client WebSocket close
   */
  static handleClientDisconnect(sessionId: string): void {
    this.closeSession(sessionId);
  }

  /**
   * Get active session count (for monitoring)
   */
  static getActiveSessionCount(): number {
    return this.sessions.size;
  }
}

export const voiceAgentService = VoiceAgentService;

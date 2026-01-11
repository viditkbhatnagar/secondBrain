import { v4 as uuidv4 } from 'uuid';
import OpenAI from 'openai';
import fs from 'fs-extra';
import path from 'path';
import pdfParse from 'pdf-parse';
import * as pdfjsLib from 'pdfjs-dist/legacy/build/pdf.mjs';
import {
  TrainingOrganizationModel,
  TrainingCourseModel,
  TrainingDocumentModel,
  ITrainingOrganization,
  ITrainingCourse,
  ITrainingDocument
} from '../models/index';
import { logger } from '../utils/logger';
import { analyticsService } from './AnalyticsService';

// GPT-4o pricing (per 1M tokens)
const GPT4O_INPUT_COST_PER_1M = 2.50;
const GPT4O_OUTPUT_COST_PER_1M = 10.00;
// TTS-1 pricing (per 1M characters)
const TTS1_COST_PER_1M_CHARS = 15.00;

// Types for AI features
export interface FlashcardContent {
  type: 'explanation' | 'keyTerms' | 'qa';
  pageNumber: number;
  content: {
    explanation?: string;
    keyTerms?: Array<{ term: string; definition: string }>;
    questions?: Array<{ question: string; answer: string }>;
  };
}

export interface QuizQuestion {
  type: 'mcq' | 'trueFalse' | 'fillBlank';
  question: string;
  options?: string[];
  correctAnswer: string | boolean;
  explanation: string;
}

export interface QuizContent {
  pageNumber: number;
  questions: QuizQuestion[];
}

// Training uploads directory
const TRAINING_UPLOADS_DIR = path.join(__dirname, '../../uploads/training');

/**
 * Training Service - Handles all training module operations
 * Organizations, Courses, Documents, and AI features (explain, flashcards, quiz, audio)
 */
export class TrainingService {
  private static openai: OpenAI;
  private static readonly model = 'gpt-4o'; // Using GPT-4o for training explanations
  private static readonly ttsModel = 'tts-1';
  private static readonly ttsVoice = 'alloy';

  /**
   * Resolve file path to handle different environments (production vs local)
   * Database may have production paths while running locally
   */
  private static async resolveFilePath(document: ITrainingDocument): Promise<string | null> {
    // First try the stored absolute path
    if (await fs.pathExists(document.filePath)) {
      return document.filePath;
    }

    // If not found, try to resolve using the filename from the path in local uploads directory
    const filenameFromPath = path.basename(document.filePath);
    const localPath = path.join(TRAINING_UPLOADS_DIR, filenameFromPath);

    if (await fs.pathExists(localPath)) {
      logger.info(`Resolved file path from production to local: ${filenameFromPath}`);
      return localPath;
    }

    // Also try using the stored filename field directly
    const altPath = path.join(TRAINING_UPLOADS_DIR, document.filename);
    if (await fs.pathExists(altPath)) {
      logger.info(`Resolved file path using filename field: ${document.filename}`);
      return altPath;
    }

    logger.error(`Document file not found at any path:`, {
      storedPath: document.filePath,
      localPath,
      altPath
    });
    return null;
  }

  /**
   * Initialize the training service
   */
  static initialize() {
    if (!process.env.OPENAI_API_KEY) {
      throw new Error('OPENAI_API_KEY is required for Training Service');
    }
    this.openai = new OpenAI({
      apiKey: process.env.OPENAI_API_KEY,
    });
    logger.info('Training service initialized');
  }

  /**
   * Calculate cost based on token usage
   */
  private static calculateCost(promptTokens: number, completionTokens: number): number {
    const inputCost = (promptTokens / 1_000_000) * GPT4O_INPUT_COST_PER_1M;
    const outputCost = (completionTokens / 1_000_000) * GPT4O_OUTPUT_COST_PER_1M;
    return inputCost + outputCost;
  }

  /**
   * Calculate TTS cost based on character count
   */
  private static calculateTtsCost(characterCount: number): number {
    return (characterCount / 1_000_000) * TTS1_COST_PER_1M_CHARS;
  }

  /**
   * Track AI usage for training features
   */
  private static async trackAiUsage(
    feature: 'explain' | 'flashcards' | 'quiz' | 'audio',
    promptTokens: number,
    completionTokens: number,
    responseTime: number,
    documentId?: string
  ): Promise<void> {
    const totalTokens = promptTokens + completionTokens;
    const cost = this.calculateCost(promptTokens, completionTokens);

    await analyticsService.trackEvent(
      'ai_response',
      'training-session',  // Generic session for training
      {
        aiSource: 'training',
        aiFeature: feature,
        tokensUsed: totalTokens,
        promptTokens,
        completionTokens,
        estimatedCost: cost,
        responseTime,
        documentId
      }
    );

    logger.info(`Training AI usage tracked: ${feature}, tokens=${totalTokens}, cost=$${cost.toFixed(4)}`);
  }

  /**
   * Track TTS usage for audio feature
   */
  private static async trackTtsUsage(
    characterCount: number,
    responseTime: number,
    documentId?: string
  ): Promise<void> {
    const cost = this.calculateTtsCost(characterCount);

    await analyticsService.trackEvent(
      'ai_response',
      'training-session',
      {
        aiSource: 'training',
        aiFeature: 'audio',
        tokensUsed: characterCount,  // Store character count in tokensUsed for simplicity
        estimatedCost: cost,
        responseTime,
        documentId
      }
    );

    logger.info(`Training TTS usage tracked: chars=${characterCount}, cost=$${cost.toFixed(4)}`);
  }

  // ========================================
  // ORGANIZATION CRUD
  // ========================================

  static async createOrganization(
    name: string,
    description?: string,
    logoUrl?: string
  ): Promise<ITrainingOrganization> {
    const id = uuidv4();
    const org = new TrainingOrganizationModel({
      id,
      name,
      description,
      logoUrl,
      isActive: true,
      courseCount: 0,
      createdAt: new Date(),
      updatedAt: new Date()
    });
    await org.save();
    logger.info(`Created organization: ${name}`);
    return org;
  }

  static async getOrganizations(includeInactive = false): Promise<ITrainingOrganization[]> {
    const filter = includeInactive ? {} : { isActive: true };
    return TrainingOrganizationModel.find(filter).sort({ name: 1 });
  }

  static async getOrganizationById(id: string): Promise<ITrainingOrganization | null> {
    return TrainingOrganizationModel.findOne({ id });
  }

  static async updateOrganization(
    id: string,
    updates: Partial<{ name: string; description: string; logoUrl: string; isActive: boolean }>
  ): Promise<ITrainingOrganization | null> {
    const org = await TrainingOrganizationModel.findOneAndUpdate(
      { id },
      { ...updates, updatedAt: new Date() },
      { new: true }
    );
    if (org) {
      logger.info(`Updated organization: ${org.name}`);
    }
    return org;
  }

  static async deleteOrganization(id: string): Promise<boolean> {
    // First delete all courses and documents under this organization
    const courses = await TrainingCourseModel.find({ organizationId: id });
    for (const course of courses) {
      await this.deleteCourse(course.id);
    }

    const result = await TrainingOrganizationModel.deleteOne({ id });
    if (result.deletedCount > 0) {
      logger.info(`Deleted organization: ${id}`);
      return true;
    }
    return false;
  }

  // ========================================
  // COURSE CRUD
  // ========================================

  static async createCourse(
    organizationId: string,
    name: string,
    fullName: string,
    description?: string,
    thumbnailUrl?: string
  ): Promise<ITrainingCourse> {
    const id = uuidv4();
    const course = new TrainingCourseModel({
      id,
      organizationId,
      name,
      fullName,
      description,
      thumbnailUrl,
      isActive: true,
      documentCount: 0,
      createdAt: new Date(),
      updatedAt: new Date()
    });
    await course.save();

    // Update organization course count
    await TrainingOrganizationModel.updateOne(
      { id: organizationId },
      { $inc: { courseCount: 1 }, updatedAt: new Date() }
    );

    logger.info(`Created course: ${name} under organization ${organizationId}`);
    return course;
  }

  static async getCoursesByOrganization(organizationId: string, includeInactive = false): Promise<ITrainingCourse[]> {
    const filter: any = { organizationId };
    if (!includeInactive) {
      filter.isActive = true;
    }
    return TrainingCourseModel.find(filter).sort({ name: 1 });
  }

  static async getCourseById(id: string): Promise<ITrainingCourse | null> {
    return TrainingCourseModel.findOne({ id });
  }

  static async getAllCourses(includeInactive = false): Promise<ITrainingCourse[]> {
    const filter = includeInactive ? {} : { isActive: true };
    return TrainingCourseModel.find(filter).sort({ name: 1 });
  }

  static async updateCourse(
    id: string,
    updates: Partial<{ name: string; fullName: string; description: string; thumbnailUrl: string; isActive: boolean }>
  ): Promise<ITrainingCourse | null> {
    const course = await TrainingCourseModel.findOneAndUpdate(
      { id },
      { ...updates, updatedAt: new Date() },
      { new: true }
    );
    if (course) {
      logger.info(`Updated course: ${course.name}`);
    }
    return course;
  }

  static async deleteCourse(id: string): Promise<boolean> {
    const course = await TrainingCourseModel.findOne({ id });
    if (!course) return false;

    // Delete all documents under this course
    const documents = await TrainingDocumentModel.find({ courseId: id });
    for (const doc of documents) {
      await this.deleteDocument(doc.id);
    }

    const result = await TrainingCourseModel.deleteOne({ id });
    if (result.deletedCount > 0) {
      // Update organization course count
      await TrainingOrganizationModel.updateOne(
        { id: course.organizationId },
        { $inc: { courseCount: -1 }, updatedAt: new Date() }
      );
      logger.info(`Deleted course: ${id}`);
      return true;
    }
    return false;
  }

  // ========================================
  // DOCUMENT CRUD
  // ========================================

  static async createDocument(
    courseId: string,
    organizationId: string,
    filename: string,
    originalName: string,
    mimeType: string,
    filePath: string,
    fileSize: number,
    pageCount: number,
    description?: string
  ): Promise<ITrainingDocument> {
    const id = uuidv4();
    const doc = new TrainingDocumentModel({
      id,
      courseId,
      organizationId,
      filename,
      originalName,
      mimeType,
      filePath,
      fileSize,
      pageCount,
      description,
      isActive: true,
      uploadedAt: new Date(),
      updatedAt: new Date()
    });
    await doc.save();

    // Update course document count
    await TrainingCourseModel.updateOne(
      { id: courseId },
      { $inc: { documentCount: 1 }, updatedAt: new Date() }
    );

    logger.info(`Created training document: ${originalName}`);
    return doc;
  }

  static async getDocumentsByCourse(courseId: string, includeInactive = false): Promise<ITrainingDocument[]> {
    const filter: any = { courseId };
    if (!includeInactive) {
      filter.isActive = true;
    }
    return TrainingDocumentModel.find(filter).sort({ uploadedAt: -1 });
  }

  static async getDocumentById(id: string): Promise<ITrainingDocument | null> {
    return TrainingDocumentModel.findOne({ id });
  }

  static async updateDocument(
    id: string,
    updates: Partial<{ description: string; isActive: boolean }>
  ): Promise<ITrainingDocument | null> {
    const doc = await TrainingDocumentModel.findOneAndUpdate(
      { id },
      { ...updates, updatedAt: new Date() },
      { new: true }
    );
    if (doc) {
      logger.info(`Updated document: ${doc.originalName}`);
    }
    return doc;
  }

  static async deleteDocument(id: string): Promise<boolean> {
    const doc = await TrainingDocumentModel.findOne({ id });
    if (!doc) return false;

    // Delete the physical file
    try {
      const resolvedPath = await this.resolveFilePath(doc);
      if (resolvedPath) {
        await fs.remove(resolvedPath);
      }
    } catch (error) {
      logger.warn(`Failed to delete file: ${doc.filePath}`, error);
    }

    const result = await TrainingDocumentModel.deleteOne({ id });
    if (result.deletedCount > 0) {
      // Update course document count
      await TrainingCourseModel.updateOne(
        { id: doc.courseId },
        { $inc: { documentCount: -1 }, updatedAt: new Date() }
      );
      logger.info(`Deleted document: ${id}`);
      return true;
    }
    return false;
  }

  // ========================================
  // PDF PAGE EXTRACTION
  // ========================================

  /**
   * Extract text content from a specific page of a PDF using pdfjs-dist
   * This properly extracts text from only the requested page
   */
  static async extractPageContent(documentId: string, pageNumber: number): Promise<string> {
    const doc = await this.getDocumentById(documentId);
    if (!doc) {
      throw new Error('Document not found');
    }

    // Resolve the file path to handle different environments
    const resolvedPath = await this.resolveFilePath(doc);
    if (!resolvedPath) {
      throw new Error('Document file not found');
    }

    const dataBuffer = await fs.readFile(resolvedPath);
    const uint8Array = new Uint8Array(dataBuffer);

    // Use pdfjs-dist to load the PDF and extract specific page content
    // Disable worker for Node.js environment
    const loadingTask = pdfjsLib.getDocument({
      data: uint8Array,
      useSystemFonts: true,
      disableFontFace: true,
      isEvalSupported: false,
    });

    const pdfDocument = await loadingTask.promise;
    const totalPages = pdfDocument.numPages;

    if (pageNumber < 1 || pageNumber > totalPages) {
      throw new Error(`Invalid page number. Document has ${totalPages} pages.`);
    }

    // Get the specific page
    const page = await pdfDocument.getPage(pageNumber);
    const textContent = await page.getTextContent();

    // Extract text items and join them
    // Group text by y-position to maintain line structure
    const textItems = textContent.items as any[];

    // Sort by y position (descending, since PDF y-axis is bottom-up) then x position
    const sortedItems = textItems
      .filter((item: any) => item.str && item.str.trim())
      .sort((a: any, b: any) => {
        const yDiff = b.transform[5] - a.transform[5]; // y position (descending)
        if (Math.abs(yDiff) > 5) return yDiff; // Different lines
        return a.transform[4] - b.transform[4]; // Same line, sort by x
      });

    // Group items into lines based on y-position proximity
    const lines: string[] = [];
    let currentLine: string[] = [];
    let lastY: number | null = null;

    for (const item of sortedItems) {
      const y = item.transform[5];

      if (lastY !== null && Math.abs(lastY - y) > 5) {
        // New line - save current line and start fresh
        if (currentLine.length > 0) {
          lines.push(currentLine.join(' '));
        }
        currentLine = [];
      }

      currentLine.push(item.str.trim());
      lastY = y;
    }

    // Don't forget the last line
    if (currentLine.length > 0) {
      lines.push(currentLine.join(' '));
    }

    const pageText = lines.join('\n').trim();

    logger.info(`Extracted ${pageText.length} chars from page ${pageNumber} of document ${documentId}`);

    return pageText;
  }

  /**
   * Get PDF page count
   */
  static async getPdfPageCount(filePath: string): Promise<number> {
    try {
      const dataBuffer = await fs.readFile(filePath);
      const pdfData = await pdfParse(dataBuffer);
      return pdfData.numpages;
    } catch (error) {
      logger.error('Failed to get PDF page count:', error);
      return 0;
    }
  }

  // ========================================
  // AI FEATURES
  // ========================================

  /**
   * Generate explanation for a specific page
   */
  static async explainPage(documentId: string, pageNumber: number): Promise<string> {
    const startTime = Date.now();
    const pageContent = await this.extractPageContent(documentId, pageNumber);

    if (!pageContent || pageContent.trim().length < 50) {
      throw new Error('Insufficient content on this page to generate explanation');
    }

    const prompt = `You are an expert educational instructor. Analyze the following page content from a training document and provide a clear, comprehensive explanation that helps a sales consultant understand the material.

PAGE CONTENT:
${pageContent}

INSTRUCTIONS:
1. Summarize the main concepts and key points
2. Explain any technical terms or jargon in simple language
3. Highlight the most important information for a sales consultant
4. Provide practical insights on how this information can be used
5. Keep the explanation concise but thorough (2-4 paragraphs)

EXPLANATION:`;

    const response = await this.openai.chat.completions.create({
      model: this.model,
      max_tokens: 1500,
      temperature: 0.7,
      messages: [{ role: 'user', content: prompt }]
    });

    const responseTime = Date.now() - startTime;

    // Track AI usage
    const usage = response.usage;
    if (usage) {
      await this.trackAiUsage(
        'explain',
        usage.prompt_tokens,
        usage.completion_tokens,
        responseTime,
        documentId
      );
    }

    return response.choices[0]?.message?.content?.trim() || 'Unable to generate explanation';
  }

  /**
   * Generate flashcards (explanation, key terms, Q&A) for a page
   */
  static async generateFlashcards(
    documentId: string,
    pageNumber: number,
    type: 'explanation' | 'keyTerms' | 'qa' | 'all' = 'all'
  ): Promise<FlashcardContent> {
    const startTime = Date.now();
    let totalPromptTokens = 0;
    let totalCompletionTokens = 0;

    const pageContent = await this.extractPageContent(documentId, pageNumber);

    if (!pageContent || pageContent.trim().length < 50) {
      throw new Error('Insufficient content on this page to generate flashcards');
    }

    const flashcard: FlashcardContent = {
      type: type === 'all' ? 'explanation' : type,
      pageNumber,
      content: {}
    };

    // Generate explanation
    if (type === 'all' || type === 'explanation') {
      const explanationPrompt = `Analyze this training content and provide a concise explanation (2-3 sentences) suitable for a flashcard:

CONTENT:
${pageContent}

FLASHCARD EXPLANATION:`;

      const expResponse = await this.openai.chat.completions.create({
        model: this.model,
        max_tokens: 300,
        temperature: 0.7,
        messages: [{ role: 'user', content: explanationPrompt }]
      });
      flashcard.content.explanation = expResponse.choices[0]?.message?.content?.trim() || '';

      if (expResponse.usage) {
        totalPromptTokens += expResponse.usage.prompt_tokens;
        totalCompletionTokens += expResponse.usage.completion_tokens;
      }
    }

    // Generate key terms
    if (type === 'all' || type === 'keyTerms') {
      const termsPrompt = `Extract 3-5 key terms from this training content with their definitions. Return as JSON array:
[{"term": "Term Name", "definition": "Brief definition"}]

CONTENT:
${pageContent}

JSON ARRAY:`;

      const termsResponse = await this.openai.chat.completions.create({
        model: this.model,
        max_tokens: 500,
        temperature: 0.7,
        messages: [{ role: 'user', content: termsPrompt }]
      });

      if (termsResponse.usage) {
        totalPromptTokens += termsResponse.usage.prompt_tokens;
        totalCompletionTokens += termsResponse.usage.completion_tokens;
      }

      try {
        const termsText = termsResponse.choices[0]?.message?.content?.trim() || '[]';
        // Extract JSON from the response
        const jsonMatch = termsText.match(/\[[\s\S]*\]/);
        if (jsonMatch) {
          flashcard.content.keyTerms = JSON.parse(jsonMatch[0]);
        }
      } catch (e) {
        flashcard.content.keyTerms = [];
      }
    }

    // Generate Q&A
    if (type === 'all' || type === 'qa') {
      const qaPrompt = `Create 3-5 question-answer pairs based on this training content. Return as JSON array:
[{"question": "Question text?", "answer": "Answer text"}]

CONTENT:
${pageContent}

JSON ARRAY:`;

      const qaResponse = await this.openai.chat.completions.create({
        model: this.model,
        max_tokens: 600,
        temperature: 0.7,
        messages: [{ role: 'user', content: qaPrompt }]
      });

      if (qaResponse.usage) {
        totalPromptTokens += qaResponse.usage.prompt_tokens;
        totalCompletionTokens += qaResponse.usage.completion_tokens;
      }

      try {
        const qaText = qaResponse.choices[0]?.message?.content?.trim() || '[]';
        const jsonMatch = qaText.match(/\[[\s\S]*\]/);
        if (jsonMatch) {
          flashcard.content.questions = JSON.parse(jsonMatch[0]);
        }
      } catch (e) {
        flashcard.content.questions = [];
      }
    }

    // Track total AI usage for flashcards
    const responseTime = Date.now() - startTime;
    if (totalPromptTokens > 0 || totalCompletionTokens > 0) {
      await this.trackAiUsage(
        'flashcards',
        totalPromptTokens,
        totalCompletionTokens,
        responseTime,
        documentId
      );
    }

    return flashcard;
  }

  /**
   * Generate quiz questions for a page
   */
  static async generateQuiz(documentId: string, pageNumber: number): Promise<QuizContent> {
    const startTime = Date.now();
    const pageContent = await this.extractPageContent(documentId, pageNumber);

    if (!pageContent || pageContent.trim().length < 50) {
      throw new Error('Insufficient content on this page to generate quiz');
    }

    const prompt = `Create a quiz based on this training content. Generate exactly:
- 2 Multiple Choice Questions (MCQ) with 4 options each
- 2 True/False Questions
- 1 Fill in the Blank Question

Return as a valid JSON array with this structure:
[
  {
    "type": "mcq",
    "question": "Question text?",
    "options": ["Option A", "Option B", "Option C", "Option D"],
    "correctAnswer": "Option A",
    "explanation": "Brief explanation why this is correct"
  },
  {
    "type": "trueFalse",
    "question": "Statement to evaluate",
    "correctAnswer": true,
    "explanation": "Brief explanation"
  },
  {
    "type": "fillBlank",
    "question": "The _____ is important for...",
    "correctAnswer": "missing word",
    "explanation": "Brief explanation"
  }
]

CONTENT:
${pageContent}

JSON ARRAY:`;

    const response = await this.openai.chat.completions.create({
      model: this.model,
      max_tokens: 1500,
      temperature: 0.7,
      messages: [{ role: 'user', content: prompt }]
    });

    const responseTime = Date.now() - startTime;

    // Track AI usage
    const usage = response.usage;
    if (usage) {
      await this.trackAiUsage(
        'quiz',
        usage.prompt_tokens,
        usage.completion_tokens,
        responseTime,
        documentId
      );
    }

    const responseText = response.choices[0]?.message?.content?.trim() || '[]';

    try {
      const jsonMatch = responseText.match(/\[[\s\S]*\]/);
      if (jsonMatch) {
        const questions = JSON.parse(jsonMatch[0]) as QuizQuestion[];
        return { pageNumber, questions };
      }
    } catch (e) {
      logger.error('Failed to parse quiz response:', e);
    }

    return { pageNumber, questions: [] };
  }

  /**
   * Generate audio explanation using OpenAI TTS
   */
  static async generateAudioExplanation(
    documentId: string,
    pageNumber: number
  ): Promise<Buffer> {
    const startTime = Date.now();

    // Extract page content for detailed audio explanation
    const pageContent = await this.extractPageContent(documentId, pageNumber);

    if (!pageContent || pageContent.trim().length < 50) {
      throw new Error('Insufficient content on this page to generate audio explanation');
    }

    // Generate a detailed, conversational explanation specifically for audio narration
    const audioPrompt = `You are an expert trainer creating an audio lecture for sales consultants. Based on the following training material, create a detailed, engaging spoken explanation that would work well as an audio lecture.

PAGE CONTENT:
${pageContent}

INSTRUCTIONS:
1. Start with a brief introduction to what this section covers
2. Explain each concept thoroughly as if you're teaching a live class
3. Use conversational language that sounds natural when spoken aloud
4. Include practical examples and real-world applications for sales consultants
5. Explain technical terms in simple, everyday language
6. Add transitions between topics (e.g., "Now, let's move on to...", "An important point to remember is...")
7. Summarize key takeaways at the end
8. Keep the tone professional but friendly and engaging
9. Make it detailed - aim for 3-5 minutes of spoken content (approximately 500-800 words)
10. Do NOT use bullet points, numbers, or formatting - write in flowing paragraphs suitable for narration

AUDIO LECTURE SCRIPT:`;

    const response = await this.openai.chat.completions.create({
      model: this.model,
      max_tokens: 2500,
      temperature: 0.7,
      messages: [{ role: 'user', content: audioPrompt }]
    });

    const scriptGenerationTime = Date.now() - startTime;

    // Track GPT-4o usage for script generation
    const usage = response.usage;
    if (usage) {
      await this.trackAiUsage(
        'audio',
        usage.prompt_tokens,
        usage.completion_tokens,
        scriptGenerationTime,
        documentId
      );
    }

    const audioScript = response.choices[0]?.message?.content?.trim();

    if (!audioScript || audioScript.length < 100) {
      throw new Error('Unable to generate audio script');
    }

    // Limit text length for TTS (max ~4096 chars)
    const textForAudio = audioScript.substring(0, 4000);

    const ttsStartTime = Date.now();

    const mp3Response = await this.openai.audio.speech.create({
      model: this.ttsModel,
      voice: this.ttsVoice,
      input: textForAudio,
      response_format: 'mp3',
      speed: 1.0
    });

    const ttsTime = Date.now() - ttsStartTime;

    // Track TTS usage
    await this.trackTtsUsage(textForAudio.length, ttsTime, documentId);

    // Convert response to Buffer
    const arrayBuffer = await mp3Response.arrayBuffer();
    return Buffer.from(arrayBuffer);
  }

  // ========================================
  // STATISTICS
  // ========================================

  static async getStats(): Promise<{
    totalOrganizations: number;
    totalCourses: number;
    totalDocuments: number;
    activeOrganizations: number;
    activeCourses: number;
    activeDocuments: number;
  }> {
    const [
      totalOrganizations,
      totalCourses,
      totalDocuments,
      activeOrganizations,
      activeCourses,
      activeDocuments
    ] = await Promise.all([
      TrainingOrganizationModel.countDocuments(),
      TrainingCourseModel.countDocuments(),
      TrainingDocumentModel.countDocuments(),
      TrainingOrganizationModel.countDocuments({ isActive: true }),
      TrainingCourseModel.countDocuments({ isActive: true }),
      TrainingDocumentModel.countDocuments({ isActive: true })
    ]);

    return {
      totalOrganizations,
      totalCourses,
      totalDocuments,
      activeOrganizations,
      activeCourses,
      activeDocuments
    };
  }
}

export const trainingService = TrainingService;

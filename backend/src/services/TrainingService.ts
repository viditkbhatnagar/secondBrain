import { v4 as uuidv4 } from 'uuid';
import OpenAI from 'openai';
import fs from 'fs-extra';
import path from 'path';
import pdfParse from 'pdf-parse';
import {
  TrainingOrganizationModel,
  TrainingCourseModel,
  TrainingDocumentModel,
  ITrainingOrganization,
  ITrainingCourse,
  ITrainingDocument
} from '../models/index';
import { logger } from '../utils/logger';

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
      if (await fs.pathExists(doc.filePath)) {
        await fs.remove(doc.filePath);
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
   * Extract text content from a specific page of a PDF
   */
  static async extractPageContent(documentId: string, pageNumber: number): Promise<string> {
    const doc = await this.getDocumentById(documentId);
    if (!doc) {
      throw new Error('Document not found');
    }

    if (!await fs.pathExists(doc.filePath)) {
      throw new Error('Document file not found');
    }

    const dataBuffer = await fs.readFile(doc.filePath);

    // pdf-parse doesn't support page-specific extraction directly
    // We'll parse the full PDF and try to segment by page
    const pdfData = await pdfParse(dataBuffer, {
      // Get page-by-page text
      pagerender: (pageData: any) => {
        return pageData.getTextContent().then((textContent: any) => {
          let text = '';
          for (const item of textContent.items) {
            text += item.str + ' ';
          }
          return text;
        });
      }
    });

    // Split content by page markers or estimate based on position
    // This is a simplified approach - for better accuracy, use pdf-lib or similar
    const pages = pdfData.text.split(/\f|\n{4,}/); // Form feed or multiple newlines as page separator

    if (pageNumber < 1 || pageNumber > pages.length) {
      // If page extraction fails, return a portion of the full text
      const charsPerPage = Math.ceil(pdfData.text.length / (doc.pageCount || 1));
      const startIdx = (pageNumber - 1) * charsPerPage;
      const endIdx = startIdx + charsPerPage;
      return pdfData.text.substring(startIdx, endIdx).trim();
    }

    return pages[pageNumber - 1]?.trim() || '';
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

    return flashcard;
  }

  /**
   * Generate quiz questions for a page
   */
  static async generateQuiz(documentId: string, pageNumber: number): Promise<QuizContent> {
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
    // First get the text explanation
    const explanation = await this.explainPage(documentId, pageNumber);

    if (!explanation || explanation.length < 10) {
      throw new Error('Unable to generate explanation for audio');
    }

    // Limit text length for TTS (max ~4096 chars typically)
    const textForAudio = explanation.substring(0, 4000);

    const mp3Response = await this.openai.audio.speech.create({
      model: this.ttsModel,
      voice: this.ttsVoice,
      input: textForAudio,
      response_format: 'mp3'
    });

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

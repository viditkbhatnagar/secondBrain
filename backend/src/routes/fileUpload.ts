import express from 'express';
import { FileProcessor } from '../services/FileProcessor';
import { VectorService } from '../services/VectorService';
import { DatabaseService } from '../services/DatabaseService';
import { ClaudeService } from '../services/ClaudeService';

export const fileUploadRouter = express.Router();

fileUploadRouter.post('/', async (req, res) => {
  let filePath: string | undefined;

  try {
    if (!req.file) {
      return res.status(400).json({ 
        error: 'File Upload Required',
        message: 'Please select a file to upload.',
        code: 'NO_FILE_PROVIDED'
      });
    }

    const { path, originalname, mimetype } = req.file;
    filePath = path;

    console.log(`Processing file: ${originalname}`);

    // Validate file type
    const allowedTypes = [
      'application/pdf',
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      'text/plain',
      'text/markdown'
    ];

    if (!allowedTypes.includes(mimetype)) {
      return res.status(400).json({
        error: 'Invalid File Type',
        message: 'Only PDF, DOCX, TXT, and MD files are supported.',
        code: 'INVALID_FILE_TYPE'
      });
    }

    // Process the file and extract content
    const processedDocument = await FileProcessor.processFile(
      filePath,
      originalname,
      mimetype
    );

    if (!processedDocument.content.trim()) {
      return res.status(400).json({
        error: 'Empty Document',
        message: 'The uploaded document appears to be empty or could not be processed.',
        code: 'EMPTY_DOCUMENT'
      });
    }

    // Store document chunks as vectors (requires OpenAI)
    await VectorService.storeDocumentChunks(
      processedDocument.chunks,
      processedDocument.originalName
    );

    // Generate summary using Claude
    const summary = await ClaudeService.summarizeDocument(
      processedDocument.content,
      processedDocument.originalName
    );

    // Extract topics using Claude
    const topics = await ClaudeService.extractTopics(processedDocument.content);

    // Store document metadata in database
    const documentRecord = await DatabaseService.createDocument({
      id: processedDocument.id,
      filename: processedDocument.filename,
      originalName: processedDocument.originalName,
      mimeType: processedDocument.mimeType,
      content: processedDocument.content,
      summary,
      topics,
      metadata: processedDocument.metadata,
      chunkCount: processedDocument.chunks.length
    });

    // Clean up the uploaded file
    await FileProcessor.cleanupFile(filePath);
    filePath = undefined; // Mark as cleaned up

    console.log(`Successfully processed document: ${originalname}`);

    res.json({
      success: true,
      document: {
        id: documentRecord.id,
        filename: documentRecord.filename,
        originalName: documentRecord.originalName,
        uploadedAt: documentRecord.uploadedAt,
        wordCount: documentRecord.wordCount,
        chunkCount: documentRecord.chunkCount,
        summary: documentRecord.summary,
        topics: documentRecord.topics
      }
    });

  } catch (error: any) {
    console.error('Upload processing error:', error);
    
    // Clean up file if it exists and wasn't cleaned up already
    if (filePath) {
      await FileProcessor.cleanupFile(filePath);
    }

    // Handle specific error types with user-friendly messages
    let errorResponse = {
      error: 'Upload Failed',
      message: 'An unexpected error occurred while processing your file.',
      code: 'UNKNOWN_ERROR'
    };

    const errorMessage = error.message || '';

    // OpenAI API errors
    if (errorMessage.includes('OpenAI API authentication')) {
      errorResponse = {
        error: 'Configuration Error',
        message: 'OpenAI API key is invalid. Please contact the administrator.',
        code: 'OPENAI_AUTH_ERROR'
      };
    } else if (errorMessage.includes('OpenAI API rate limit')) {
      errorResponse = {
        error: 'Service Temporarily Unavailable',
        message: 'The embedding service is currently rate-limited. Please try again in a few minutes.',
        code: 'OPENAI_RATE_LIMIT'
      };
    } else if (errorMessage.includes('OpenAI API quota exceeded')) {
      errorResponse = {
        error: 'Service Quota Exceeded',
        message: 'The embedding service has exceeded its quota. Please contact the administrator.',
        code: 'OPENAI_QUOTA_ERROR'
      };
    }
    // Claude API errors
    else if (errorMessage.includes('Claude API authentication')) {
      errorResponse = {
        error: 'Configuration Error',
        message: 'Claude API key is invalid. Please contact the administrator.',
        code: 'CLAUDE_AUTH_ERROR'
      };
    } else if (errorMessage.includes('Claude API rate limit')) {
      errorResponse = {
        error: 'Service Temporarily Unavailable',
        message: 'The AI service is currently rate-limited. Please try again in a few minutes.',
        code: 'CLAUDE_RATE_LIMIT'
      };
    } else if (errorMessage.includes('credit balance too low')) {
      errorResponse = {
        error: 'Service Credits Exhausted',
        message: 'The AI service has insufficient credits. Please contact the administrator to add credits.',
        code: 'CLAUDE_CREDITS_ERROR'
      };
    }
    // File processing errors
    else if (errorMessage.includes('Unsupported file type')) {
      errorResponse = {
        error: 'Unsupported File Type',
        message: 'This file type is not supported. Please upload a PDF, DOCX, TXT, or MD file.',
        code: 'UNSUPPORTED_FILE_TYPE'
      };
    } else if (errorMessage.includes('Failed to process file')) {
      errorResponse = {
        error: 'File Processing Failed',
        message: 'The file could not be processed. It may be corrupted or password-protected.',
        code: 'FILE_PROCESSING_ERROR'
      };
    }
    // Vector storage errors
    else if (errorMessage.includes('Failed to store document chunks')) {
      errorResponse = {
        error: 'Storage Error',
        message: 'Failed to store the document for searching. The document may be too large.',
        code: 'STORAGE_ERROR'
      };
    }

    res.status(500).json(errorResponse);
  }
});
import React, { useState, useCallback } from 'react';
import { useDropzone } from 'react-dropzone';
import { Upload, File, X, CheckCircle, AlertCircle } from 'lucide-react';
import { Document } from '../App';
import { API_ENDPOINTS } from '../config/api';
import { Button, Card } from './ui';

interface FileUploadProps {
  onFileUploaded: (document: Document) => void;
}

interface UploadStatus {
  status: 'idle' | 'uploading' | 'processing' | 'success' | 'error';
  message?: string;
}

export const FileUpload: React.FC<FileUploadProps> = ({ onFileUploaded }) => {
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [uploadStatus, setUploadStatus] = useState<UploadStatus>({ status: 'idle' });

  const onDrop = useCallback((acceptedFiles: File[]) => {
    if (acceptedFiles.length > 0) {
      setSelectedFile(acceptedFiles[0]);
      setUploadStatus({ status: 'idle' });
    }
  }, []);

  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop,
    accept: {
      'application/pdf': ['.pdf'],
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document': ['.docx'],
      'text/plain': ['.txt'],
      'text/markdown': ['.md'],
      'image/png': ['.png'],
      'image/jpeg': ['.jpg', '.jpeg'],
      'application/json': ['.json']
    },
    maxSize: 100 * 1024 * 1024,
    multiple: false
  });

  const handleUpload = async () => {
    if (!selectedFile) return;

    setUploadStatus({ status: 'uploading' });

    const formData = new FormData();
    formData.append('file', selectedFile);

    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 300000);

      const response = await fetch(API_ENDPOINTS.upload, {
        method: 'POST',
        body: formData,
        signal: controller.signal,
      });

      clearTimeout(timeoutId);

      const result = await response.json();

      if (!response.ok) {
        throw new Error(result.message || result.error || 'Upload failed');
      }

      setUploadStatus({ 
        status: 'processing', 
        message: 'Processing document and generating AI summary...' 
      });

      const processingDelay = selectedFile.size > 5 * 1024 * 1024 ? 500 : 1000;
      await new Promise(resolve => setTimeout(resolve, processingDelay));
      
      setUploadStatus({ 
        status: 'success', 
        message: `Successfully processed ${result.document.wordCount} words in ${result.document.chunkCount} chunks` 
      });

      // Clear all caches to ensure fresh search results
      try {
        await fetch(API_ENDPOINTS.blazingCacheInvalidate, { method: 'POST' });
        console.log('✅ Search cache cleared after document upload');
      } catch (err) {
        console.warn('Failed to clear cache:', err);
      }

      onFileUploaded(result.document);

      setTimeout(() => {
        setSelectedFile(null);
        setUploadStatus({ status: 'idle' });
      }, 3000);

    } catch (error: any) {
      console.error('Upload error:', error);
      
      let errorMessage = 'Upload failed. Please try again.';
      const message = error.message || '';
      
      if (error.name === 'AbortError') {
        errorMessage = 'Upload timed out. Please try with a smaller file or check your connection.';
      } else if (message.includes('Configuration Error') || message.includes('invalid')) {
        errorMessage = 'Service configuration error. Please contact the administrator.';
      } else if (message.includes('rate limit')) {
        errorMessage = 'Service is temporarily busy. Please try again in a few minutes.';
      } else if (message.includes('quota exceeded') || message.includes('credits')) {
        errorMessage = 'Service quota exceeded. Please contact the administrator.';
      } else if (message.includes('File Upload Required')) {
        errorMessage = 'Please select a file to upload.';
      } else if (message.includes('Invalid File Type')) {
        errorMessage = 'Only PDF, DOCX, TXT, and MD files are supported.';
      } else if (message.includes('Empty Document')) {
        errorMessage = 'The document appears to be empty or corrupted.';
      } else if (message.includes('File Processing Failed') || message.includes('insufficient text')) {
        errorMessage = 'Failed to extract text from the file. It may be corrupted, password-protected, or image-only.';
      } else if (message.includes('too large')) {
        errorMessage = 'File is too large. Please upload a file smaller than 100MB.';
      } else if (message.includes('NetworkError') || message.includes('fetch')) {
        errorMessage = 'Network error. Please check your connection and try again.';
      }
      
      setUploadStatus({ status: 'error', message: errorMessage });
    }
  };

  const handleRemoveFile = () => {
    setSelectedFile(null);
    setUploadStatus({ status: 'idle' });
  };

  const formatFileSize = (bytes: number) => {
    if (bytes === 0) return '0 Bytes';
    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
  };

  const getStatusColor = () => {
    switch (uploadStatus.status) {
      case 'success':
        return 'bg-success-50 dark:bg-success-900/20 border-success-200 dark:border-success-800';
      case 'error':
        return 'bg-danger-50 dark:bg-danger-900/20 border-danger-200 dark:border-danger-800';
      case 'uploading':
      case 'processing':
        return 'bg-primary-50 dark:bg-primary-900/20 border-primary-200 dark:border-primary-800';
      default:
        return 'bg-secondary-50 dark:bg-secondary-800 border-secondary-200 dark:border-secondary-700';
    }
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="text-center">
        <h2 className="text-2xl font-bold text-secondary-900 dark:text-secondary-100">Upload Documents</h2>
        <p className="mt-2 text-secondary-600 dark:text-secondary-400">
          Add PDFs, Word documents, or text files to your knowledge base
        </p>
      </div>

      {/* Upload Area */}
      <div
        {...getRootProps()}
        className={`relative border-2 border-dashed rounded-xl p-8 text-center cursor-pointer transition-all duration-200 ${
          isDragActive
            ? 'border-primary-400 bg-primary-50 dark:bg-primary-900/20'
            : selectedFile
            ? 'border-success-300 dark:border-success-700 bg-success-50 dark:bg-success-900/20'
            : 'border-secondary-300 dark:border-secondary-600 hover:border-secondary-400 dark:hover:border-secondary-500 bg-white dark:bg-secondary-800'
        }`}
      >
        <input {...getInputProps()} />
        
        {!selectedFile ? (
          <div className="space-y-4">
            <div className="mx-auto w-16 h-16 rounded-full bg-secondary-100 dark:bg-secondary-700 flex items-center justify-center">
              <Upload className="h-8 w-8 text-secondary-400 dark:text-secondary-500" />
            </div>
            <div>
              <p className="text-lg font-medium text-secondary-900 dark:text-secondary-100">
                {isDragActive ? 'Drop your file here' : 'Drop files here or click to browse'}
              </p>
              <p className="text-sm text-secondary-500 dark:text-secondary-400 mt-1">
                Supports PDF, DOCX, TXT, MD, PNG, JPG, and JSON files (max 100MB)
              </p>
            </div>
          </div>
        ) : (
          <div className="space-y-4">
            <div className="mx-auto w-16 h-16 rounded-full bg-success-100 dark:bg-success-900/30 flex items-center justify-center">
              <File className="h-8 w-8 text-success-500" />
            </div>
            <div>
              <p className="text-lg font-medium text-secondary-900 dark:text-secondary-100">{selectedFile.name}</p>
              <p className="text-sm text-secondary-500 dark:text-secondary-400">{formatFileSize(selectedFile.size)}</p>
            </div>
            <button
              onClick={(e) => {
                e.stopPropagation();
                handleRemoveFile();
              }}
              className="inline-flex items-center px-3 py-1.5 text-sm font-medium rounded-lg text-danger-700 dark:text-danger-400 bg-danger-100 dark:bg-danger-900/30 hover:bg-danger-200 dark:hover:bg-danger-900/50 transition-colors"
            >
              <X className="h-4 w-4 mr-1" />
              Remove
            </button>
          </div>
        )}
      </div>

      {/* Upload Button */}
      {selectedFile && uploadStatus.status === 'idle' && (
        <div className="text-center">
          <Button
            variant="primary"
            size="lg"
            onClick={handleUpload}
            leftIcon={<Upload className="h-5 w-5" />}
          >
            Upload and Process
          </Button>
        </div>
      )}

      {/* Status Display */}
      {uploadStatus.status !== 'idle' && (
        <div className={`rounded-xl p-4 border ${getStatusColor()}`}>
          <div className="flex items-center">
            {uploadStatus.status === 'success' && <CheckCircle className="h-5 w-5 text-success-500 flex-shrink-0" />}
            {uploadStatus.status === 'error' && <AlertCircle className="h-5 w-5 text-danger-500 flex-shrink-0" />}
            <div className="ml-3 flex-1">
              {uploadStatus.status === 'uploading' && (
                <div className="flex items-center">
                  <div className="animate-spin rounded-full h-4 w-4 border-2 border-primary-600 border-t-transparent mr-2" />
                  <p className="font-medium text-primary-700 dark:text-primary-300">Uploading file...</p>
                </div>
              )}
              
              {uploadStatus.status === 'processing' && (
                <div className="flex items-center">
                  <div className="animate-spin rounded-full h-4 w-4 border-2 border-primary-600 border-t-transparent mr-2" />
                  <p className="font-medium text-primary-700 dark:text-primary-300">Processing document and generating embeddings...</p>
                </div>
              )}
              
              {uploadStatus.status === 'success' && (
                <div>
                  <p className="font-medium text-success-700 dark:text-success-300">Upload successful!</p>
                  {uploadStatus.message && (
                    <p className="text-sm mt-1 text-success-600 dark:text-success-400">{uploadStatus.message}</p>
                  )}
                </div>
              )}
              
              {uploadStatus.status === 'error' && (
                <div>
                  <p className="font-medium text-danger-700 dark:text-danger-300">Upload failed</p>
                  {uploadStatus.message && (
                    <p className="text-sm mt-1 text-danger-600 dark:text-danger-400">{uploadStatus.message}</p>
                  )}
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Supported Formats */}
      <Card variant="filled" padding="md">
        <h3 className="text-sm font-medium text-secondary-900 dark:text-secondary-100 mb-3">Supported Formats</h3>
        <div className="grid grid-cols-2 gap-2 text-sm text-secondary-600 dark:text-secondary-400">
          <div className="flex items-center">
            <span className="inline-block w-2 h-2 bg-danger-500 rounded-full mr-2" />
            PDF Documents
          </div>
          <div className="flex items-center">
            <span className="inline-block w-2 h-2 bg-primary-500 rounded-full mr-2" />
            Word Documents (.docx)
          </div>
          <div className="flex items-center">
            <span className="inline-block w-2 h-2 bg-success-500 rounded-full mr-2" />
            Text Files (.txt)
          </div>
          <div className="flex items-center">
            <span className="inline-block w-2 h-2 bg-accent-500 rounded-full mr-2" />
            Markdown Files (.md)
          </div>
        </div>
      </Card>
    </div>
  );
};

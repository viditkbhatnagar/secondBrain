import React, { useState, useCallback } from 'react';
import { useDropzone } from 'react-dropzone';
import { Upload, File, X, CheckCircle, AlertCircle } from 'lucide-react';
import { Document } from '../App';
import { API_ENDPOINTS } from '../config/api';

interface FileUploadProps {
  onFileUploaded: (document: Document) => void;
}

interface UploadStatus {
  status: 'idle' | 'uploading' | 'processing' | 'success' | 'error';
  message?: string;
  progress?: number;
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
      'text/markdown': ['.md']
    },
    maxSize: 50 * 1024 * 1024, // 50MB
    multiple: false
  });

  const handleUpload = async () => {
    if (!selectedFile) return;

    setUploadStatus({ status: 'uploading', progress: 0 });

    const formData = new FormData();
    formData.append('file', selectedFile);

    try {
      const response = await fetch(API_ENDPOINTS.upload, {
        method: 'POST',
        body: formData,
      });

      const result = await response.json();

      if (!response.ok) {
        // Handle specific error codes from backend
        throw new Error(result.message || result.error || 'Upload failed');
      }

      setUploadStatus({ 
        status: 'processing', 
        message: 'Processing document and generating AI summary...' 
      });

      // Simulate processing time for better UX
      await new Promise(resolve => setTimeout(resolve, 1000));
      
      setUploadStatus({ 
        status: 'success', 
        message: `Successfully processed ${result.document.wordCount} words in ${result.document.chunkCount} chunks` 
      });

      // Call the callback with the new document
      onFileUploaded(result.document);

      // Reset after a delay
      setTimeout(() => {
        setSelectedFile(null);
        setUploadStatus({ status: 'idle' });
      }, 3000);

    } catch (error: any) {
      console.error('Upload error:', error);
      
      let errorMessage = 'Upload failed. Please try again.';
      let isRetryable = true;
      
      // Handle specific error messages from backend
      const message = error.message || '';
      
      if (message.includes('Configuration Error') || message.includes('invalid')) {
        errorMessage = 'Service configuration error. Please contact the administrator.';
        isRetryable = false;
      } else if (message.includes('rate limit')) {
        errorMessage = 'Service is temporarily busy. Please try again in a few minutes.';
      } else if (message.includes('quota exceeded') || message.includes('credits')) {
        errorMessage = 'Service quota exceeded. Please contact the administrator.';
        isRetryable = false;
      } else if (message.includes('File Upload Required')) {
        errorMessage = 'Please select a file to upload.';
      } else if (message.includes('Invalid File Type')) {
        errorMessage = 'Only PDF, DOCX, TXT, and MD files are supported.';
        isRetryable = false;
      } else if (message.includes('Empty Document')) {
        errorMessage = 'The document appears to be empty or corrupted.';
        isRetryable = false;
      } else if (message.includes('File Processing Failed')) {
        errorMessage = 'Failed to process the file. It may be corrupted or password-protected.';
        isRetryable = false;
      } else if (message.includes('too large')) {
        errorMessage = 'File is too large. Please upload a smaller file.';
        isRetryable = false;
      }
      
      setUploadStatus({ 
        status: 'error', 
        message: errorMessage
      });
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

  const getStatusIcon = () => {
    switch (uploadStatus.status) {
      case 'success':
        return <CheckCircle className="h-5 w-5 text-green-500" />;
      case 'error':
        return <AlertCircle className="h-5 w-5 text-red-500" />;
      default:
        return null;
    }
  };

  const getStatusColor = () => {
    switch (uploadStatus.status) {
      case 'success':
        return 'text-green-600 bg-green-50';
      case 'error':
        return 'text-red-600 bg-red-50';
      case 'uploading':
      case 'processing':
        return 'text-blue-600 bg-blue-50';
      default:
        return 'text-gray-600 bg-gray-50';
    }
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="text-center">
        <h2 className="text-2xl font-bold text-gray-900">Upload Documents</h2>
        <p className="mt-2 text-gray-600">
          Add PDFs, Word documents, or text files to your knowledge base
        </p>
      </div>

      {/* Upload Area */}
      <div
        {...getRootProps()}
        className={`relative border-2 border-dashed rounded-lg p-8 text-center cursor-pointer transition-colors ${
          isDragActive
            ? 'border-blue-400 bg-blue-50'
            : selectedFile
            ? 'border-green-300 bg-green-50'
            : 'border-gray-300 hover:border-gray-400'
        }`}
      >
        <input {...getInputProps()} />
        
        {!selectedFile ? (
          <div className="space-y-4">
            <Upload className="mx-auto h-12 w-12 text-gray-400" />
            <div>
              <p className="text-lg font-medium text-gray-900">
                {isDragActive ? 'Drop your file here' : 'Drop files here or click to browse'}
              </p>
              <p className="text-sm text-gray-500 mt-1">
                Supports PDF, DOCX, TXT, and MD files (max 50MB)
              </p>
            </div>
          </div>
        ) : (
          <div className="space-y-4">
            <File className="mx-auto h-12 w-12 text-green-500" />
            <div>
              <p className="text-lg font-medium text-gray-900">{selectedFile.name}</p>
              <p className="text-sm text-gray-500">{formatFileSize(selectedFile.size)}</p>
            </div>
            <button
              onClick={(e) => {
                e.stopPropagation();
                handleRemoveFile();
              }}
              className="inline-flex items-center px-3 py-1 border border-transparent text-sm font-medium rounded-md text-red-700 bg-red-100 hover:bg-red-200"
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
          <button
            onClick={handleUpload}
            className="inline-flex items-center px-6 py-3 border border-transparent text-base font-medium rounded-md shadow-sm text-white bg-blue-600 hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500"
          >
            <Upload className="h-5 w-5 mr-2" />
            Upload and Process
          </button>
        </div>
      )}

      {/* Status Display */}
      {uploadStatus.status !== 'idle' && (
        <div className={`rounded-md p-4 ${getStatusColor()}`}>
          <div className="flex items-center">
            {getStatusIcon()}
            <div className="ml-3 flex-1">
              {uploadStatus.status === 'uploading' && (
                <div>
                  <p className="font-medium">Uploading file...</p>
                  <div className="mt-2 w-full bg-white rounded-full h-2">
                    <div 
                      className="bg-blue-600 h-2 rounded-full transition-all duration-300"
                      style={{ width: `${uploadStatus.progress || 0}%` }}
                    ></div>
                  </div>
                </div>
              )}
              
              {uploadStatus.status === 'processing' && (
                <div className="flex items-center">
                  <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-blue-600 mr-2"></div>
                  <p className="font-medium">Processing document and generating embeddings...</p>
                </div>
              )}
              
              {uploadStatus.status === 'success' && (
                <div>
                  <p className="font-medium">Upload successful!</p>
                  {uploadStatus.message && (
                    <p className="text-sm mt-1">{uploadStatus.message}</p>
                  )}
                </div>
              )}
              
              {uploadStatus.status === 'error' && (
                <div>
                  <p className="font-medium">Upload failed</p>
                  {uploadStatus.message && (
                    <p className="text-sm mt-1">{uploadStatus.message}</p>
                  )}
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Supported Formats */}
      <div className="bg-gray-50 rounded-lg p-4">
        <h3 className="text-sm font-medium text-gray-900 mb-2">Supported Formats</h3>
        <div className="grid grid-cols-2 gap-2 text-sm text-gray-600">
          <div className="flex items-center">
            <span className="inline-block w-2 h-2 bg-red-500 rounded-full mr-2"></span>
            PDF Documents
          </div>
          <div className="flex items-center">
            <span className="inline-block w-2 h-2 bg-blue-500 rounded-full mr-2"></span>
            Word Documents (.docx)
          </div>
          <div className="flex items-center">
            <span className="inline-block w-2 h-2 bg-green-500 rounded-full mr-2"></span>
            Text Files (.txt)
          </div>
          <div className="flex items-center">
            <span className="inline-block w-2 h-2 bg-purple-500 rounded-full mr-2"></span>
            Markdown Files (.md)
          </div>
        </div>
      </div>
    </div>
  );
};
import { API_ENDPOINTS } from '../config/api';

// Types
export interface TrainingOrganization {
  id: string;
  name: string;
  description?: string;
  logoUrl?: string;
  isActive: boolean;
  courseCount: number;
  createdAt: string;
  updatedAt: string;
}

export interface TrainingCourse {
  id: string;
  organizationId: string;
  name: string;
  fullName: string;
  description?: string;
  thumbnailUrl?: string;
  isActive: boolean;
  documentCount: number;
  createdAt: string;
  updatedAt: string;
}

export interface TrainingDocument {
  id: string;
  courseId: string;
  organizationId: string;
  filename: string;
  originalName: string;
  mimeType: string;
  filePath: string;
  fileSize: number;
  pageCount: number;
  description?: string;
  thumbnailUrl?: string;
  isActive: boolean;
  uploadedAt: string;
  updatedAt: string;
}

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

export interface TrainingStats {
  totalOrganizations: number;
  totalCourses: number;
  totalDocuments: number;
  activeOrganizations: number;
  activeCourses: number;
  activeDocuments: number;
}

// Helper to get auth token
const getAuthToken = (): string | null => {
  return localStorage.getItem('adminToken');
};

// Helper for authenticated requests
const authHeaders = (): Record<string, string> => {
  const token = getAuthToken();
  return token ? { Authorization: `Bearer ${token}` } : {};
};

// ========================================
// PUBLIC ENDPOINTS
// ========================================

export const getOrganizations = async (): Promise<TrainingOrganization[]> => {
  const response = await fetch(API_ENDPOINTS.trainingOrganizations);
  const data = await response.json();
  if (!response.ok) throw new Error(data.message || 'Failed to get organizations');
  return data.organizations;
};

export const getOrganizationById = async (id: string): Promise<TrainingOrganization> => {
  const response = await fetch(`${API_ENDPOINTS.trainingOrganizations}/${id}`);
  const data = await response.json();
  if (!response.ok) throw new Error(data.message || 'Failed to get organization');
  return data.organization;
};

export const getCoursesByOrganization = async (orgId: string): Promise<TrainingCourse[]> => {
  const response = await fetch(`${API_ENDPOINTS.trainingOrganizations}/${orgId}/courses`);
  const data = await response.json();
  if (!response.ok) throw new Error(data.message || 'Failed to get courses');
  return data.courses;
};

export const getAllCourses = async (): Promise<TrainingCourse[]> => {
  const response = await fetch(API_ENDPOINTS.trainingCourses);
  const data = await response.json();
  if (!response.ok) throw new Error(data.message || 'Failed to get courses');
  return data.courses;
};

export const getCourseById = async (id: string): Promise<TrainingCourse> => {
  const response = await fetch(`${API_ENDPOINTS.trainingCourses}/${id}`);
  const data = await response.json();
  if (!response.ok) throw new Error(data.message || 'Failed to get course');
  return data.course;
};

export const getDocumentsByCourse = async (courseId: string): Promise<TrainingDocument[]> => {
  const response = await fetch(`${API_ENDPOINTS.trainingCourses}/${courseId}/documents`);
  const data = await response.json();
  if (!response.ok) throw new Error(data.message || 'Failed to get documents');
  return data.documents;
};

export const getDocumentById = async (id: string): Promise<TrainingDocument> => {
  const response = await fetch(`${API_ENDPOINTS.trainingDocuments}/${id}`);
  const data = await response.json();
  if (!response.ok) throw new Error(data.message || 'Failed to get document');
  return data.document;
};

export const getDocumentFileUrl = (id: string): string => {
  return `${API_ENDPOINTS.trainingDocuments}/${id}/file`;
};

export const getTrainingStats = async (): Promise<TrainingStats> => {
  const response = await fetch(API_ENDPOINTS.trainingStats);
  const data = await response.json();
  if (!response.ok) throw new Error(data.message || 'Failed to get stats');
  return data.stats;
};

// ========================================
// AI FEATURES
// ========================================

export const explainPage = async (documentId: string, pageNumber: number): Promise<string> => {
  const response = await fetch(`${API_ENDPOINTS.trainingDocuments}/${documentId}/explain`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ pageNumber })
  });
  const data = await response.json();
  if (!response.ok) throw new Error(data.message || 'Failed to explain page');
  return data.explanation;
};

export const generateFlashcards = async (
  documentId: string,
  pageNumber: number,
  type: 'explanation' | 'keyTerms' | 'qa' | 'all' = 'all'
): Promise<FlashcardContent> => {
  const response = await fetch(`${API_ENDPOINTS.trainingDocuments}/${documentId}/flashcards`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ pageNumber, type })
  });
  const data = await response.json();
  if (!response.ok) throw new Error(data.message || 'Failed to generate flashcards');
  return data.flashcards;
};

export const generateQuiz = async (documentId: string, pageNumber: number): Promise<QuizContent> => {
  const response = await fetch(`${API_ENDPOINTS.trainingDocuments}/${documentId}/quiz`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ pageNumber })
  });
  const data = await response.json();
  if (!response.ok) throw new Error(data.message || 'Failed to generate quiz');
  return data.quiz;
};

export const generateAudio = async (documentId: string, pageNumber: number): Promise<Blob> => {
  const response = await fetch(`${API_ENDPOINTS.trainingDocuments}/${documentId}/audio`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ pageNumber })
  });
  if (!response.ok) {
    const data = await response.json();
    throw new Error(data.message || 'Failed to generate audio');
  }
  return response.blob();
};

// ========================================
// ADMIN ENDPOINTS
// ========================================

// Organizations
export const adminGetOrganizations = async (): Promise<TrainingOrganization[]> => {
  const response = await fetch(API_ENDPOINTS.trainingAdminOrganizations, {
    headers: authHeaders()
  });
  const data = await response.json();
  if (!response.ok) throw new Error(data.message || 'Failed to get organizations');
  return data.organizations;
};

export const adminCreateOrganization = async (
  name: string,
  description?: string,
  logoUrl?: string
): Promise<TrainingOrganization> => {
  const response = await fetch(API_ENDPOINTS.trainingAdminOrganizations, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...authHeaders() },
    body: JSON.stringify({ name, description, logoUrl })
  });
  const data = await response.json();
  if (!response.ok) throw new Error(data.message || 'Failed to create organization');
  return data.organization;
};

export const adminUpdateOrganization = async (
  id: string,
  updates: Partial<{ name: string; description: string; logoUrl: string; isActive: boolean }>
): Promise<TrainingOrganization> => {
  const response = await fetch(`${API_ENDPOINTS.trainingAdminOrganizations}/${id}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json', ...authHeaders() },
    body: JSON.stringify(updates)
  });
  const data = await response.json();
  if (!response.ok) throw new Error(data.message || 'Failed to update organization');
  return data.organization;
};

export const adminDeleteOrganization = async (id: string): Promise<void> => {
  const response = await fetch(`${API_ENDPOINTS.trainingAdminOrganizations}/${id}`, {
    method: 'DELETE',
    headers: authHeaders()
  });
  const data = await response.json();
  if (!response.ok) throw new Error(data.message || 'Failed to delete organization');
};

// Courses
export const adminGetCourses = async (): Promise<TrainingCourse[]> => {
  const response = await fetch(API_ENDPOINTS.trainingAdminCourses, {
    headers: authHeaders()
  });
  const data = await response.json();
  if (!response.ok) throw new Error(data.message || 'Failed to get courses');
  return data.courses;
};

export const adminCreateCourse = async (
  organizationId: string,
  name: string,
  fullName: string,
  description?: string,
  thumbnailUrl?: string
): Promise<TrainingCourse> => {
  const response = await fetch(API_ENDPOINTS.trainingAdminCourses, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...authHeaders() },
    body: JSON.stringify({ organizationId, name, fullName, description, thumbnailUrl })
  });
  const data = await response.json();
  if (!response.ok) throw new Error(data.message || 'Failed to create course');
  return data.course;
};

export const adminUpdateCourse = async (
  id: string,
  updates: Partial<{ name: string; fullName: string; description: string; thumbnailUrl: string; isActive: boolean }>
): Promise<TrainingCourse> => {
  const response = await fetch(`${API_ENDPOINTS.trainingAdminCourses}/${id}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json', ...authHeaders() },
    body: JSON.stringify(updates)
  });
  const data = await response.json();
  if (!response.ok) throw new Error(data.message || 'Failed to update course');
  return data.course;
};

export const adminDeleteCourse = async (id: string): Promise<void> => {
  const response = await fetch(`${API_ENDPOINTS.trainingAdminCourses}/${id}`, {
    method: 'DELETE',
    headers: authHeaders()
  });
  const data = await response.json();
  if (!response.ok) throw new Error(data.message || 'Failed to delete course');
};

// Documents
export const adminUploadDocument = async (
  courseId: string,
  file: File,
  description?: string
): Promise<TrainingDocument> => {
  const formData = new FormData();
  formData.append('file', file);
  formData.append('courseId', courseId);
  if (description) formData.append('description', description);

  const response = await fetch(API_ENDPOINTS.trainingAdminDocuments, {
    method: 'POST',
    headers: authHeaders(),
    body: formData
  });
  const data = await response.json();
  if (!response.ok) throw new Error(data.message || 'Failed to upload document');
  return data.document;
};

export const adminUpdateDocument = async (
  id: string,
  updates: Partial<{ description: string; isActive: boolean }>
): Promise<TrainingDocument> => {
  const response = await fetch(`${API_ENDPOINTS.trainingAdminDocuments}/${id}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json', ...authHeaders() },
    body: JSON.stringify(updates)
  });
  const data = await response.json();
  if (!response.ok) throw new Error(data.message || 'Failed to update document');
  return data.document;
};

export const adminDeleteDocument = async (id: string): Promise<void> => {
  const response = await fetch(`${API_ENDPOINTS.trainingAdminDocuments}/${id}`, {
    method: 'DELETE',
    headers: authHeaders()
  });
  const data = await response.json();
  if (!response.ok) throw new Error(data.message || 'Failed to delete document');
};

// Export all as trainingService
export const trainingService = {
  // Public
  getOrganizations,
  getOrganizationById,
  getCoursesByOrganization,
  getAllCourses,
  getCourseById,
  getDocumentsByCourse,
  getDocumentById,
  getDocumentFileUrl,
  getTrainingStats,
  // AI Features
  explainPage,
  generateFlashcards,
  generateQuiz,
  generateAudio,
  // Admin
  adminGetOrganizations,
  adminCreateOrganization,
  adminUpdateOrganization,
  adminDeleteOrganization,
  adminGetCourses,
  adminCreateCourse,
  adminUpdateCourse,
  adminDeleteCourse,
  adminUploadDocument,
  adminUpdateDocument,
  adminDeleteDocument
};

export default trainingService;

// API Configuration for different environments
const getApiBaseUrl = (): string => {
    // Check if we're in production
    if (process.env.NODE_ENV === 'production') {
      // Use relative URL when frontend and backend are served from same domain (unified server)
      // This works because backend serves the frontend in production
      return process.env.REACT_APP_API_URL || '/api';
    }
    
    // Development environment - point to separate backend server
    return 'http://localhost:3001/api';
  };
  
  export const API_BASE_URL = getApiBaseUrl();
  
  // API endpoints
  export const API_ENDPOINTS = {
    upload: `${API_BASE_URL}/upload`,
    search: `${API_BASE_URL}/search`,
    searchRecent: `${API_BASE_URL}/search/recent`,
    // Blazing fast search endpoints (new - 95% faster!)
    blazingSearch: `${API_BASE_URL}/blazing/search`,
    blazingStats: `${API_BASE_URL}/blazing/stats`,
    blazingCacheInvalidate: `${API_BASE_URL}/blazing/cache/invalidate`,
    blazingPrewarm: `${API_BASE_URL}/blazing/prewarm`,
    documents: `${API_BASE_URL}/documents`,
    documentsStats: `${API_BASE_URL}/documents/stats`,
    health: `${API_BASE_URL}/health`,
    baseChat: `${API_BASE_URL}/chat`,
    baseAdmin: `${API_BASE_URL}/admin`,
    baseGraph: `${API_BASE_URL}/graph`,
    // Training module endpoints
    training: `${API_BASE_URL}/training`,
    trainingOrganizations: `${API_BASE_URL}/training/organizations`,
    trainingCourses: `${API_BASE_URL}/training/courses`,
    trainingDocuments: `${API_BASE_URL}/training/documents`,
    trainingStats: `${API_BASE_URL}/training/stats`,
    // Training admin endpoints
    trainingAdminOrganizations: `${API_BASE_URL}/training/admin/organizations`,
    trainingAdminCourses: `${API_BASE_URL}/training/admin/courses`,
    trainingAdminDocuments: `${API_BASE_URL}/training/admin/documents`
  };
  
  // Helper function for making API requests with error handling
  export const apiRequest = async (url: string, options: RequestInit = {}) => {
    const defaultOptions: RequestInit = {
      headers: {
        'Content-Type': 'application/json',
        ...options.headers,
      },
      ...options,
    };
  
    try {
      const response = await fetch(url, defaultOptions);
      
      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(errorData.message || `HTTP error! status: ${response.status}`);
      }
      
      return await response.json();
    } catch (error) {
      console.error('API request failed:', error);
      throw error;
    }
  };
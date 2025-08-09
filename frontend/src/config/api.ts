// API Configuration for different environments
const getApiBaseUrl = (): string => {
    // Check if we're in production
    if (process.env.NODE_ENV === 'production') {
      // Use env if provided; otherwise default to Render backend URL
      return process.env.REACT_APP_API_URL || 'https://knowledge-base-backend-ynyk.onrender.com/api';
    }
    
    // Development environment
    return 'http://localhost:3001/api';
  };
  
  export const API_BASE_URL = getApiBaseUrl();
  
  // API endpoints
  export const API_ENDPOINTS = {
    upload: `${API_BASE_URL}/upload`,
    search: `${API_BASE_URL}/search`,
    searchRecent: `${API_BASE_URL}/search/recent`,
    documents: `${API_BASE_URL}/documents`,
    documentsStats: `${API_BASE_URL}/documents/stats`,
    health: `${API_BASE_URL}/health`,
    baseChat: `${API_BASE_URL}/chat`,
    baseAdmin: `${API_BASE_URL}/admin`,
    baseGraph: `${API_BASE_URL}/graph`
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
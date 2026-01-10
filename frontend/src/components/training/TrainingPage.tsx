import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Building2,
  GraduationCap,
  FileText,
  ChevronRight,
  ChevronDown,
  BookOpen,
  Loader2,
  AlertCircle
} from 'lucide-react';
import {
  getOrganizations,
  getCoursesByOrganization,
  getDocumentsByCourse,
  TrainingOrganization,
  TrainingCourse,
  TrainingDocument
} from '../../services/trainingService';
import DocumentViewer from './DocumentViewer';

export function TrainingPage() {
  const [organizations, setOrganizations] = useState<TrainingOrganization[]>([]);
  const [expandedOrgs, setExpandedOrgs] = useState<Set<string>>(new Set());
  const [coursesByOrg, setCoursesByOrg] = useState<Record<string, TrainingCourse[]>>({});
  const [expandedCourses, setExpandedCourses] = useState<Set<string>>(new Set());
  const [documentsByCourse, setDocumentsByCourse] = useState<Record<string, TrainingDocument[]>>({});
  const [selectedDocument, setSelectedDocument] = useState<TrainingDocument | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [loadingOrgs, setLoadingOrgs] = useState<Set<string>>(new Set());
  const [loadingCourses, setLoadingCourses] = useState<Set<string>>(new Set());

  // Load organizations on mount
  useEffect(() => {
    loadOrganizations();
  }, []);

  const loadOrganizations = async () => {
    try {
      setLoading(true);
      const orgs = await getOrganizations();
      setOrganizations(orgs);
      setError(null);
    } catch (err: any) {
      setError(err.message || 'Failed to load organizations');
    } finally {
      setLoading(false);
    }
  };

  const toggleOrganization = async (orgId: string) => {
    const newExpanded = new Set(expandedOrgs);
    if (newExpanded.has(orgId)) {
      newExpanded.delete(orgId);
    } else {
      newExpanded.add(orgId);
      // Load courses if not already loaded
      if (!coursesByOrg[orgId]) {
        try {
          setLoadingOrgs(prev => new Set(prev).add(orgId));
          const courses = await getCoursesByOrganization(orgId);
          setCoursesByOrg(prev => ({ ...prev, [orgId]: courses }));
        } catch (err) {
          console.error('Failed to load courses:', err);
        } finally {
          setLoadingOrgs(prev => {
            const next = new Set(prev);
            next.delete(orgId);
            return next;
          });
        }
      }
    }
    setExpandedOrgs(newExpanded);
  };

  const toggleCourse = async (courseId: string) => {
    const newExpanded = new Set(expandedCourses);
    if (newExpanded.has(courseId)) {
      newExpanded.delete(courseId);
    } else {
      newExpanded.add(courseId);
      // Load documents if not already loaded
      if (!documentsByCourse[courseId]) {
        try {
          setLoadingCourses(prev => new Set(prev).add(courseId));
          const docs = await getDocumentsByCourse(courseId);
          setDocumentsByCourse(prev => ({ ...prev, [courseId]: docs }));
        } catch (err) {
          console.error('Failed to load documents:', err);
        } finally {
          setLoadingCourses(prev => {
            const next = new Set(prev);
            next.delete(courseId);
            return next;
          });
        }
      }
    }
    setExpandedCourses(newExpanded);
  };

  const selectDocument = (doc: TrainingDocument) => {
    setSelectedDocument(doc);
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-96">
        <Loader2 className="h-8 w-8 animate-spin text-primary-500" />
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex flex-col items-center justify-center h-96 text-center">
        <AlertCircle className="h-12 w-12 text-red-500 mb-4" />
        <p className="text-red-600 dark:text-red-400">{error}</p>
        <button
          onClick={loadOrganizations}
          className="mt-4 px-4 py-2 bg-primary-500 text-white rounded-lg hover:bg-primary-600"
        >
          Retry
        </button>
      </div>
    );
  }

  return (
    <div className="flex h-[calc(100vh-180px)] gap-0">
      {/* Sidebar Navigation - Fixed left */}
      <div className="w-64 flex-shrink-0 bg-white dark:bg-secondary-800 border-r border-secondary-200 dark:border-secondary-700 overflow-hidden">
        <div className="p-4 border-b border-secondary-200 dark:border-secondary-700">
          <h2 className="text-lg font-semibold text-secondary-900 dark:text-secondary-100 flex items-center gap-2">
            <BookOpen className="h-5 w-5 text-primary-500" />
            Training Materials
          </h2>
        </div>

        <div className="overflow-y-auto h-[calc(100%-65px)] p-2">
          {organizations.length === 0 ? (
            <div className="text-center py-8 text-secondary-500">
              <Building2 className="h-12 w-12 mx-auto mb-3 opacity-50" />
              <p>No training materials available</p>
            </div>
          ) : (
            <div className="space-y-1">
              {organizations.map((org) => (
                <div key={org.id}>
                  {/* Organization Item */}
                  <button
                    onClick={() => toggleOrganization(org.id)}
                    className="w-full flex items-center gap-2 px-3 py-2 rounded-lg text-left hover:bg-secondary-100 dark:hover:bg-secondary-700 transition-colors"
                  >
                    {loadingOrgs.has(org.id) ? (
                      <Loader2 className="h-4 w-4 animate-spin text-primary-500" />
                    ) : expandedOrgs.has(org.id) ? (
                      <ChevronDown className="h-4 w-4 text-secondary-500" />
                    ) : (
                      <ChevronRight className="h-4 w-4 text-secondary-500" />
                    )}
                    <Building2 className="h-4 w-4 text-emerald-500" />
                    <span className="font-medium text-secondary-900 dark:text-secondary-100 flex-1">
                      {org.name}
                    </span>
                    <span className="text-xs text-secondary-500 bg-secondary-100 dark:bg-secondary-700 px-2 py-0.5 rounded-full">
                      {org.courseCount}
                    </span>
                  </button>

                  {/* Courses under Organization */}
                  <AnimatePresence>
                    {expandedOrgs.has(org.id) && (
                      <motion.div
                        initial={{ height: 0, opacity: 0 }}
                        animate={{ height: 'auto', opacity: 1 }}
                        exit={{ height: 0, opacity: 0 }}
                        transition={{ duration: 0.2 }}
                        className="ml-4 pl-4 border-l border-secondary-200 dark:border-secondary-700"
                      >
                        {coursesByOrg[org.id]?.map((course) => (
                          <div key={course.id}>
                            {/* Course Item */}
                            <button
                              onClick={() => toggleCourse(course.id)}
                              className="w-full flex items-center gap-2 px-3 py-2 rounded-lg text-left hover:bg-secondary-100 dark:hover:bg-secondary-700 transition-colors"
                            >
                              {loadingCourses.has(course.id) ? (
                                <Loader2 className="h-4 w-4 animate-spin text-primary-500" />
                              ) : expandedCourses.has(course.id) ? (
                                <ChevronDown className="h-4 w-4 text-secondary-500" />
                              ) : (
                                <ChevronRight className="h-4 w-4 text-secondary-500" />
                              )}
                              <GraduationCap className="h-4 w-4 text-primary-500" />
                              <div className="flex-1 min-w-0">
                                <span className="font-medium text-secondary-800 dark:text-secondary-200 block truncate">
                                  {course.name}
                                </span>
                                <span className="text-xs text-secondary-500 truncate block">
                                  {course.fullName}
                                </span>
                              </div>
                              <span className="text-xs text-secondary-500 bg-secondary-100 dark:bg-secondary-700 px-2 py-0.5 rounded-full flex-shrink-0">
                                {course.documentCount}
                              </span>
                            </button>

                            {/* Documents under Course */}
                            <AnimatePresence>
                              {expandedCourses.has(course.id) && (
                                <motion.div
                                  initial={{ height: 0, opacity: 0 }}
                                  animate={{ height: 'auto', opacity: 1 }}
                                  exit={{ height: 0, opacity: 0 }}
                                  transition={{ duration: 0.2 }}
                                  className="ml-4 pl-4 border-l border-secondary-200 dark:border-secondary-700"
                                >
                                  {documentsByCourse[course.id]?.map((doc) => (
                                    <button
                                      key={doc.id}
                                      onClick={() => selectDocument(doc)}
                                      className={`w-full flex items-center gap-2 px-3 py-2 rounded-lg text-left transition-colors ${
                                        selectedDocument?.id === doc.id
                                          ? 'bg-primary-100 dark:bg-primary-900/30 text-primary-700 dark:text-primary-300'
                                          : 'hover:bg-secondary-100 dark:hover:bg-secondary-700'
                                      }`}
                                    >
                                      <FileText className="h-4 w-4 text-red-500" />
                                      <div className="flex-1 min-w-0">
                                        <span className="text-sm text-secondary-800 dark:text-secondary-200 block truncate">
                                          {doc.originalName}
                                        </span>
                                        <span className="text-xs text-secondary-500">
                                          {doc.pageCount} pages
                                        </span>
                                      </div>
                                    </button>
                                  ))}
                                  {documentsByCourse[course.id]?.length === 0 && (
                                    <div className="px-3 py-2 text-sm text-secondary-500">
                                      No documents yet
                                    </div>
                                  )}
                                </motion.div>
                              )}
                            </AnimatePresence>
                          </div>
                        ))}
                        {coursesByOrg[org.id]?.length === 0 && (
                          <div className="px-3 py-2 text-sm text-secondary-500">
                            No courses yet
                          </div>
                        )}
                      </motion.div>
                    )}
                  </AnimatePresence>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Main Content - Document Viewer */}
      <div className="flex-1 bg-white dark:bg-secondary-800 overflow-hidden">
        {selectedDocument ? (
          <DocumentViewer document={selectedDocument} />
        ) : (
          <div className="flex flex-col items-center justify-center h-full text-center p-8">
            <BookOpen className="h-16 w-16 text-secondary-300 dark:text-secondary-600 mb-4" />
            <h3 className="text-xl font-semibold text-secondary-700 dark:text-secondary-300 mb-2">
              Select a Document
            </h3>
            <p className="text-secondary-500 max-w-md">
              Choose a training document from the sidebar to start learning. You can view the content, generate explanations, flashcards, quizzes, and audio summaries.
            </p>
          </div>
        )}
      </div>
    </div>
  );
}

export default TrainingPage;

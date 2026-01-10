import React, { useState, useEffect, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Building2,
  GraduationCap,
  FileText,
  Plus,
  Pencil,
  Trash2,
  Upload,
  Loader2,
  AlertCircle,
  CheckCircle,
  X
} from 'lucide-react';
import {
  adminGetOrganizations,
  adminCreateOrganization,
  adminUpdateOrganization,
  adminDeleteOrganization,
  adminGetCourses,
  adminCreateCourse,
  adminUpdateCourse,
  adminDeleteCourse,
  adminUploadDocument,
  adminDeleteDocument,
  getDocumentsByCourse,
  TrainingOrganization,
  TrainingCourse,
  TrainingDocument
} from '../../services/trainingService';

type Tab = 'organizations' | 'courses' | 'documents';

interface FormState {
  type: 'org' | 'course' | 'doc' | null;
  mode: 'create' | 'edit';
  data: any;
}

export function AdminTraining() {
  const [activeTab, setActiveTab] = useState<Tab>('organizations');
  const [organizations, setOrganizations] = useState<TrainingOrganization[]>([]);
  const [courses, setCourses] = useState<TrainingCourse[]>([]);
  const [documents, setDocuments] = useState<TrainingDocument[]>([]);
  const [selectedCourseId, setSelectedCourseId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [formState, setFormState] = useState<FormState>({ type: null, mode: 'create', data: {} });
  const [uploading, setUploading] = useState(false);

  // Load data
  const loadOrganizations = useCallback(async () => {
    try {
      setLoading(true);
      const orgs = await adminGetOrganizations();
      setOrganizations(orgs);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, []);

  const loadCourses = useCallback(async () => {
    try {
      setLoading(true);
      const courseList = await adminGetCourses();
      setCourses(courseList);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, []);

  const loadDocuments = useCallback(async (courseId: string) => {
    try {
      setLoading(true);
      const docs = await getDocumentsByCourse(courseId);
      setDocuments(docs);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (activeTab === 'organizations') {
      loadOrganizations();
    } else if (activeTab === 'courses') {
      loadCourses();
    }
  }, [activeTab, loadOrganizations, loadCourses]);

  useEffect(() => {
    if (selectedCourseId) {
      loadDocuments(selectedCourseId);
    }
  }, [selectedCourseId, loadDocuments]);

  // Clear messages after 3 seconds
  useEffect(() => {
    if (success || error) {
      const timer = setTimeout(() => {
        setSuccess(null);
        setError(null);
      }, 3000);
      return () => clearTimeout(timer);
    }
  }, [success, error]);

  // Organization handlers
  const handleCreateOrg = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      await adminCreateOrganization(
        formState.data.name,
        formState.data.description
      );
      setSuccess('Organization created successfully');
      setFormState({ type: null, mode: 'create', data: {} });
      loadOrganizations();
    } catch (err: any) {
      setError(err.message);
    }
  };

  const handleUpdateOrg = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      await adminUpdateOrganization(formState.data.id, {
        name: formState.data.name,
        description: formState.data.description,
        isActive: formState.data.isActive
      });
      setSuccess('Organization updated successfully');
      setFormState({ type: null, mode: 'create', data: {} });
      loadOrganizations();
    } catch (err: any) {
      setError(err.message);
    }
  };

  const handleDeleteOrg = async (id: string) => {
    if (!window.confirm('Delete this organization? All courses and documents will be deleted.')) return;
    try {
      await adminDeleteOrganization(id);
      setSuccess('Organization deleted');
      loadOrganizations();
    } catch (err: any) {
      setError(err.message);
    }
  };

  // Course handlers
  const handleCreateCourse = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      await adminCreateCourse(
        formState.data.organizationId,
        formState.data.name,
        formState.data.fullName,
        formState.data.description
      );
      setSuccess('Course created successfully');
      setFormState({ type: null, mode: 'create', data: {} });
      loadCourses();
    } catch (err: any) {
      setError(err.message);
    }
  };

  const handleUpdateCourse = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      await adminUpdateCourse(formState.data.id, {
        name: formState.data.name,
        fullName: formState.data.fullName,
        description: formState.data.description,
        isActive: formState.data.isActive
      });
      setSuccess('Course updated successfully');
      setFormState({ type: null, mode: 'create', data: {} });
      loadCourses();
    } catch (err: any) {
      setError(err.message);
    }
  };

  const handleDeleteCourse = async (id: string) => {
    if (!window.confirm('Delete this course? All documents will be deleted.')) return;
    try {
      await adminDeleteCourse(id);
      setSuccess('Course deleted');
      loadCourses();
    } catch (err: any) {
      setError(err.message);
    }
  };

  // Document handlers
  const handleUploadDocument = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !selectedCourseId) return;

    try {
      setUploading(true);
      await adminUploadDocument(selectedCourseId, file, formState.data.description);
      setSuccess('Document uploaded successfully');
      setFormState({ type: null, mode: 'create', data: {} });
      loadDocuments(selectedCourseId);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setUploading(false);
    }
  };

  const handleDeleteDocument = async (id: string) => {
    if (!window.confirm('Delete this document?')) return;
    try {
      await adminDeleteDocument(id);
      setSuccess('Document deleted');
      if (selectedCourseId) loadDocuments(selectedCourseId);
    } catch (err: any) {
      setError(err.message);
    }
  };

  const tabs = [
    { id: 'organizations' as Tab, label: 'Organizations', icon: Building2 },
    { id: 'courses' as Tab, label: 'Courses', icon: GraduationCap },
    { id: 'documents' as Tab, label: 'Documents', icon: FileText },
  ];

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-secondary-900 dark:text-secondary-100">
            Training Administration
          </h1>
          <p className="text-secondary-600 dark:text-secondary-400 mt-1">
            Manage organizations, courses, and training documents
          </p>
        </div>
      </div>

      {/* Notifications */}
      <AnimatePresence>
        {(success || error) && (
          <motion.div
            initial={{ opacity: 0, y: -10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -10 }}
            className={`p-4 rounded-lg flex items-center gap-3 ${
              success ? 'bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-300' : 'bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-300'
            }`}
          >
            {success ? <CheckCircle className="h-5 w-5" /> : <AlertCircle className="h-5 w-5" />}
            {success || error}
          </motion.div>
        )}
      </AnimatePresence>

      {/* Tabs */}
      <div className="flex border-b border-secondary-200 dark:border-secondary-700">
        {tabs.map((tab) => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id)}
            className={`flex items-center gap-2 px-6 py-3 border-b-2 transition-colors ${
              activeTab === tab.id
                ? 'border-primary-500 text-primary-600 dark:text-primary-400'
                : 'border-transparent text-secondary-500 hover:text-secondary-700 dark:hover:text-secondary-300'
            }`}
          >
            <tab.icon className="h-4 w-4" />
            <span className="font-medium">{tab.label}</span>
          </button>
        ))}
      </div>

      {/* Content */}
      <div className="bg-white dark:bg-secondary-800 rounded-xl border border-secondary-200 dark:border-secondary-700 p-6">
        {loading ? (
          <div className="flex items-center justify-center py-12">
            <Loader2 className="h-8 w-8 animate-spin text-primary-500" />
          </div>
        ) : (
          <>
            {/* Organizations Tab */}
            {activeTab === 'organizations' && (
              <div className="space-y-6">
                <div className="flex justify-between items-center">
                  <h2 className="text-lg font-semibold text-secondary-900 dark:text-secondary-100">
                    Organizations ({organizations.length})
                  </h2>
                  <button
                    onClick={() => setFormState({ type: 'org', mode: 'create', data: {} })}
                    className="flex items-center gap-2 px-4 py-2 bg-primary-500 hover:bg-primary-600 text-white rounded-lg"
                  >
                    <Plus className="h-4 w-4" />
                    Add Organization
                  </button>
                </div>

                {/* Organization Form */}
                {formState.type === 'org' && (
                  <motion.form
                    initial={{ opacity: 0, height: 0 }}
                    animate={{ opacity: 1, height: 'auto' }}
                    className="bg-secondary-50 dark:bg-secondary-900 p-4 rounded-lg space-y-4"
                    onSubmit={formState.mode === 'create' ? handleCreateOrg : handleUpdateOrg}
                  >
                    <div className="flex items-center justify-between">
                      <h3 className="font-medium">{formState.mode === 'create' ? 'New Organization' : 'Edit Organization'}</h3>
                      <button type="button" onClick={() => setFormState({ type: null, mode: 'create', data: {} })}>
                        <X className="h-4 w-4" />
                      </button>
                    </div>
                    <div className="grid grid-cols-2 gap-4">
                      <div>
                        <label className="block text-sm font-medium mb-1">Name *</label>
                        <input
                          type="text"
                          required
                          value={formState.data.name || ''}
                          onChange={(e) => setFormState(prev => ({ ...prev, data: { ...prev.data, name: e.target.value } }))}
                          className="w-full px-3 py-2 rounded-lg border border-secondary-300 dark:border-secondary-600 bg-white dark:bg-secondary-800"
                          placeholder="e.g., SSM"
                        />
                      </div>
                      <div>
                        <label className="block text-sm font-medium mb-1">Description</label>
                        <input
                          type="text"
                          value={formState.data.description || ''}
                          onChange={(e) => setFormState(prev => ({ ...prev, data: { ...prev.data, description: e.target.value } }))}
                          className="w-full px-3 py-2 rounded-lg border border-secondary-300 dark:border-secondary-600 bg-white dark:bg-secondary-800"
                          placeholder="Optional description"
                        />
                      </div>
                    </div>
                    {formState.mode === 'edit' && (
                      <label className="flex items-center gap-2">
                        <input
                          type="checkbox"
                          checked={formState.data.isActive ?? true}
                          onChange={(e) => setFormState(prev => ({ ...prev, data: { ...prev.data, isActive: e.target.checked } }))}
                        />
                        <span className="text-sm">Active</span>
                      </label>
                    )}
                    <button type="submit" className="px-4 py-2 bg-primary-500 hover:bg-primary-600 text-white rounded-lg">
                      {formState.mode === 'create' ? 'Create' : 'Update'}
                    </button>
                  </motion.form>
                )}

                {/* Organizations List */}
                <div className="space-y-2">
                  {organizations.map((org) => (
                    <div
                      key={org.id}
                      className="flex items-center justify-between p-4 rounded-lg border border-secondary-200 dark:border-secondary-700 hover:bg-secondary-50 dark:hover:bg-secondary-700/50"
                    >
                      <div className="flex items-center gap-3">
                        <Building2 className="h-5 w-5 text-emerald-500" />
                        <div>
                          <h3 className="font-medium text-secondary-900 dark:text-secondary-100">{org.name}</h3>
                          <p className="text-sm text-secondary-500">{org.description || 'No description'}</p>
                        </div>
                        {!org.isActive && (
                          <span className="text-xs bg-secondary-200 dark:bg-secondary-700 px-2 py-1 rounded">Inactive</span>
                        )}
                      </div>
                      <div className="flex items-center gap-2">
                        <span className="text-sm text-secondary-500">{org.courseCount} courses</span>
                        <button
                          onClick={() => setFormState({ type: 'org', mode: 'edit', data: org })}
                          className="p-2 rounded hover:bg-secondary-200 dark:hover:bg-secondary-600"
                        >
                          <Pencil className="h-4 w-4" />
                        </button>
                        <button
                          onClick={() => handleDeleteOrg(org.id)}
                          className="p-2 rounded hover:bg-red-100 dark:hover:bg-red-900/30 text-red-500"
                        >
                          <Trash2 className="h-4 w-4" />
                        </button>
                      </div>
                    </div>
                  ))}
                  {organizations.length === 0 && (
                    <p className="text-center text-secondary-500 py-8">No organizations yet. Create one to get started.</p>
                  )}
                </div>
              </div>
            )}

            {/* Courses Tab */}
            {activeTab === 'courses' && (
              <div className="space-y-6">
                <div className="flex justify-between items-center">
                  <h2 className="text-lg font-semibold text-secondary-900 dark:text-secondary-100">
                    Courses ({courses.length})
                  </h2>
                  <button
                    onClick={() => setFormState({ type: 'course', mode: 'create', data: {} })}
                    className="flex items-center gap-2 px-4 py-2 bg-primary-500 hover:bg-primary-600 text-white rounded-lg"
                  >
                    <Plus className="h-4 w-4" />
                    Add Course
                  </button>
                </div>

                {/* Course Form */}
                {formState.type === 'course' && (
                  <motion.form
                    initial={{ opacity: 0, height: 0 }}
                    animate={{ opacity: 1, height: 'auto' }}
                    className="bg-secondary-50 dark:bg-secondary-900 p-4 rounded-lg space-y-4"
                    onSubmit={formState.mode === 'create' ? handleCreateCourse : handleUpdateCourse}
                  >
                    <div className="flex items-center justify-between">
                      <h3 className="font-medium">{formState.mode === 'create' ? 'New Course' : 'Edit Course'}</h3>
                      <button type="button" onClick={() => setFormState({ type: null, mode: 'create', data: {} })}>
                        <X className="h-4 w-4" />
                      </button>
                    </div>
                    <div className="grid grid-cols-2 gap-4">
                      {formState.mode === 'create' && (
                        <div>
                          <label className="block text-sm font-medium mb-1">Organization *</label>
                          <select
                            required
                            value={formState.data.organizationId || ''}
                            onChange={(e) => setFormState(prev => ({ ...prev, data: { ...prev.data, organizationId: e.target.value } }))}
                            className="w-full px-3 py-2 rounded-lg border border-secondary-300 dark:border-secondary-600 bg-white dark:bg-secondary-800"
                          >
                            <option value="">Select organization</option>
                            {organizations.map(org => (
                              <option key={org.id} value={org.id}>{org.name}</option>
                            ))}
                          </select>
                        </div>
                      )}
                      <div>
                        <label className="block text-sm font-medium mb-1">Short Name *</label>
                        <input
                          type="text"
                          required
                          value={formState.data.name || ''}
                          onChange={(e) => setFormState(prev => ({ ...prev, data: { ...prev.data, name: e.target.value } }))}
                          className="w-full px-3 py-2 rounded-lg border border-secondary-300 dark:border-secondary-600 bg-white dark:bg-secondary-800"
                          placeholder="e.g., MBA"
                        />
                      </div>
                      <div>
                        <label className="block text-sm font-medium mb-1">Full Name *</label>
                        <input
                          type="text"
                          required
                          value={formState.data.fullName || ''}
                          onChange={(e) => setFormState(prev => ({ ...prev, data: { ...prev.data, fullName: e.target.value } }))}
                          className="w-full px-3 py-2 rounded-lg border border-secondary-300 dark:border-secondary-600 bg-white dark:bg-secondary-800"
                          placeholder="e.g., Master of Business Administration"
                        />
                      </div>
                      <div className="col-span-2">
                        <label className="block text-sm font-medium mb-1">Description</label>
                        <input
                          type="text"
                          value={formState.data.description || ''}
                          onChange={(e) => setFormState(prev => ({ ...prev, data: { ...prev.data, description: e.target.value } }))}
                          className="w-full px-3 py-2 rounded-lg border border-secondary-300 dark:border-secondary-600 bg-white dark:bg-secondary-800"
                          placeholder="Optional description"
                        />
                      </div>
                    </div>
                    {formState.mode === 'edit' && (
                      <label className="flex items-center gap-2">
                        <input
                          type="checkbox"
                          checked={formState.data.isActive ?? true}
                          onChange={(e) => setFormState(prev => ({ ...prev, data: { ...prev.data, isActive: e.target.checked } }))}
                        />
                        <span className="text-sm">Active</span>
                      </label>
                    )}
                    <button type="submit" className="px-4 py-2 bg-primary-500 hover:bg-primary-600 text-white rounded-lg">
                      {formState.mode === 'create' ? 'Create' : 'Update'}
                    </button>
                  </motion.form>
                )}

                {/* Courses List */}
                <div className="space-y-2">
                  {courses.map((course) => {
                    const org = organizations.find(o => o.id === course.organizationId);
                    return (
                      <div
                        key={course.id}
                        className="flex items-center justify-between p-4 rounded-lg border border-secondary-200 dark:border-secondary-700 hover:bg-secondary-50 dark:hover:bg-secondary-700/50"
                      >
                        <div className="flex items-center gap-3">
                          <GraduationCap className="h-5 w-5 text-primary-500" />
                          <div>
                            <h3 className="font-medium text-secondary-900 dark:text-secondary-100">
                              {org?.name} - {course.name}
                            </h3>
                            <p className="text-sm text-secondary-500">{course.fullName}</p>
                          </div>
                          {!course.isActive && (
                            <span className="text-xs bg-secondary-200 dark:bg-secondary-700 px-2 py-1 rounded">Inactive</span>
                          )}
                        </div>
                        <div className="flex items-center gap-2">
                          <span className="text-sm text-secondary-500">{course.documentCount} docs</span>
                          <button
                            onClick={() => setFormState({ type: 'course', mode: 'edit', data: course })}
                            className="p-2 rounded hover:bg-secondary-200 dark:hover:bg-secondary-600"
                          >
                            <Pencil className="h-4 w-4" />
                          </button>
                          <button
                            onClick={() => handleDeleteCourse(course.id)}
                            className="p-2 rounded hover:bg-red-100 dark:hover:bg-red-900/30 text-red-500"
                          >
                            <Trash2 className="h-4 w-4" />
                          </button>
                        </div>
                      </div>
                    );
                  })}
                  {courses.length === 0 && (
                    <p className="text-center text-secondary-500 py-8">No courses yet. Create one to get started.</p>
                  )}
                </div>
              </div>
            )}

            {/* Documents Tab */}
            {activeTab === 'documents' && (
              <div className="space-y-6">
                <div className="flex justify-between items-center">
                  <h2 className="text-lg font-semibold text-secondary-900 dark:text-secondary-100">
                    Documents
                  </h2>
                  <select
                    value={selectedCourseId || ''}
                    onChange={(e) => setSelectedCourseId(e.target.value || null)}
                    className="px-3 py-2 rounded-lg border border-secondary-300 dark:border-secondary-600 bg-white dark:bg-secondary-800"
                  >
                    <option value="">Select a course</option>
                    {courses.map(course => {
                      const org = organizations.find(o => o.id === course.organizationId);
                      return (
                        <option key={course.id} value={course.id}>
                          {org?.name} - {course.name}
                        </option>
                      );
                    })}
                  </select>
                </div>

                {selectedCourseId ? (
                  <>
                    {/* Upload Form */}
                    <div className="bg-secondary-50 dark:bg-secondary-900 p-4 rounded-lg">
                      <h3 className="font-medium mb-4">Upload Document</h3>
                      <div className="flex items-center gap-4">
                        <label className="flex-1">
                          <div className={`border-2 border-dashed border-secondary-300 dark:border-secondary-600 rounded-lg p-6 text-center cursor-pointer hover:border-primary-500 ${uploading ? 'opacity-50' : ''}`}>
                            {uploading ? (
                              <Loader2 className="h-8 w-8 mx-auto animate-spin text-primary-500" />
                            ) : (
                              <>
                                <Upload className="h-8 w-8 mx-auto text-secondary-400" />
                                <p className="mt-2 text-sm text-secondary-600">Click to upload PDF</p>
                              </>
                            )}
                          </div>
                          <input
                            type="file"
                            accept=".pdf"
                            onChange={handleUploadDocument}
                            disabled={uploading}
                            className="hidden"
                          />
                        </label>
                      </div>
                    </div>

                    {/* Documents List */}
                    <div className="space-y-2">
                      {documents.map((doc) => (
                        <div
                          key={doc.id}
                          className="flex items-center justify-between p-4 rounded-lg border border-secondary-200 dark:border-secondary-700 hover:bg-secondary-50 dark:hover:bg-secondary-700/50"
                        >
                          <div className="flex items-center gap-3">
                            <FileText className="h-5 w-5 text-red-500" />
                            <div>
                              <h3 className="font-medium text-secondary-900 dark:text-secondary-100">{doc.originalName}</h3>
                              <p className="text-sm text-secondary-500">
                                {doc.pageCount} pages • {(doc.fileSize / 1024 / 1024).toFixed(2)} MB
                              </p>
                            </div>
                            {!doc.isActive && (
                              <span className="text-xs bg-secondary-200 dark:bg-secondary-700 px-2 py-1 rounded">Inactive</span>
                            )}
                          </div>
                          <div className="flex items-center gap-2">
                            <button
                              onClick={() => handleDeleteDocument(doc.id)}
                              className="p-2 rounded hover:bg-red-100 dark:hover:bg-red-900/30 text-red-500"
                            >
                              <Trash2 className="h-4 w-4" />
                            </button>
                          </div>
                        </div>
                      ))}
                      {documents.length === 0 && (
                        <p className="text-center text-secondary-500 py-8">No documents in this course. Upload one to get started.</p>
                      )}
                    </div>
                  </>
                ) : (
                  <p className="text-center text-secondary-500 py-8">Select a course to manage its documents.</p>
                )}
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}

export default AdminTraining;

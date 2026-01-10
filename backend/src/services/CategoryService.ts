import OpenAI from 'openai';
import { v4 as uuidv4 } from 'uuid';
import { CategoryModel, DocumentModel, ICategory } from '../models/index';
import { GptService } from './GptService';

export interface CategorySuggestion {
  category: string;
  confidence: number;
  isNew: boolean;
  description?: string;
}

export interface DiscoveredCategory {
  name: string;
  description: string;
  keywords: string[];
  documentIds: string[];
}

export class CategoryService {
  private static openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

  /**
   * Get all active categories
   */
  static async getAllCategories(): Promise<ICategory[]> {
    return CategoryModel.find({ isActive: true }).sort({ documentCount: -1 }).exec();
  }

  /**
   * Get category by name
   */
  static async getCategoryByName(name: string): Promise<ICategory | null> {
    return CategoryModel.findOne({ name: name.toLowerCase(), isActive: true }).exec();
  }

  /**
   * Discover categories from existing documents using AI clustering
   * This analyzes all documents and groups them into natural categories
   */
  static async discoverCategories(): Promise<DiscoveredCategory[]> {
    console.log('🔍 Starting category discovery from existing documents...');

    // Get all documents with their summaries and topics
    const documents = await DocumentModel.find({}, {
      id: 1,
      originalName: 1,
      summary: 1,
      topics: 1,
      content: 1
    }).exec();

    if (documents.length === 0) {
      console.log('No documents found for category discovery');
      return [];
    }

    console.log(`📚 Analyzing ${documents.length} documents for category patterns...`);

    // Prepare document summaries for AI analysis
    const docSummaries = documents.map(doc => ({
      id: doc.id,
      name: doc.originalName,
      summary: doc.summary?.slice(0, 500) || doc.content?.slice(0, 500) || '',
      topics: doc.topics || []
    }));

    // Use GPT to discover natural category groupings
    const prompt = `You are an expert at organizing knowledge bases. Analyze these documents and discover natural categories/topics they belong to.

DOCUMENTS TO ANALYZE:
${docSummaries.map((d, i) => `
[${i + 1}] "${d.name}"
Summary: ${d.summary}
Topics: ${d.topics.join(', ') || 'none'}
`).join('\n')}

TASK:
1. Identify 3-10 natural categories that these documents fall into
2. Categories should be specific and meaningful (not generic like "documents" or "files")
3. Look for domain-specific patterns (company names, project names, topics, subjects)
4. Each document should clearly fit into one primary category

IMPORTANT GUIDELINES:
- Create categories based on SUBJECT MATTER, not document type
- If you see multiple documents about the same company, organization, or topic, group them
- Be specific: "SSM Registration" is better than "Government"
- Include any acronyms or abbreviations you see frequently

OUTPUT FORMAT (JSON only, no markdown):
{
  "categories": [
    {
      "name": "Category Name",
      "description": "What this category contains",
      "keywords": ["keyword1", "keyword2", "keyword3"],
      "documentIndices": [1, 2, 5]
    }
  ]
}

Return ONLY valid JSON, no explanations.`;

    try {
      const response = await this.openai.chat.completions.create({
        model: 'gpt-4o-mini', // Using faster model for discovery
        max_tokens: 2000,
        temperature: 0.3,
        messages: [{ role: 'user', content: prompt }]
      });

      const raw = response.choices[0]?.message?.content || '{}';
      const jsonStr = this.extractJson(raw);
      const parsed = JSON.parse(jsonStr);

      if (!parsed.categories || !Array.isArray(parsed.categories)) {
        throw new Error('Invalid response format');
      }

      // Map discovered categories to our format
      const discovered: DiscoveredCategory[] = parsed.categories.map((cat: any) => ({
        name: cat.name,
        description: cat.description || '',
        keywords: cat.keywords || [],
        documentIds: (cat.documentIndices || [])
          .filter((idx: number) => idx >= 1 && idx <= docSummaries.length)
          .map((idx: number) => docSummaries[idx - 1].id)
      }));

      console.log(`✅ Discovered ${discovered.length} categories`);
      return discovered;

    } catch (error) {
      console.error('Error discovering categories:', error);
      return [];
    }
  }

  /**
   * Save discovered categories to database and assign documents to them
   */
  static async saveDiscoveredCategories(categories: DiscoveredCategory[]): Promise<void> {
    console.log(`💾 Saving ${categories.length} categories to database...`);

    for (const cat of categories) {
      const categoryId = `cat_${uuidv4().slice(0, 8)}`;
      const normalizedName = cat.name.toLowerCase();

      // Check if category already exists
      const existing = await CategoryModel.findOne({ name: normalizedName }).exec();

      if (existing) {
        // Update existing category
        await CategoryModel.findOneAndUpdate(
          { name: normalizedName },
          {
            $set: {
              description: cat.description,
              keywords: cat.keywords,
              documentCount: cat.documentIds.length,
              sampleDocuments: cat.documentIds.slice(0, 5),
              updatedAt: new Date()
            }
          }
        ).exec();
      } else {
        // Create new category
        const embedding = await this.generateCategoryEmbedding(cat);

        await CategoryModel.create({
          id: categoryId,
          name: normalizedName,
          description: cat.description,
          keywords: cat.keywords,
          documentCount: cat.documentIds.length,
          sampleDocuments: cat.documentIds.slice(0, 5),
          embedding,
          createdAt: new Date(),
          updatedAt: new Date(),
          isActive: true
        });
      }

      // Update documents with their category
      for (const docId of cat.documentIds) {
        await DocumentModel.findOneAndUpdate(
          { id: docId },
          { $set: { category: normalizedName } }
        ).exec();
      }

      console.log(`  ✓ Category "${cat.name}" saved with ${cat.documentIds.length} documents`);
    }

    console.log('✅ All categories saved successfully');
  }

  /**
   * Generate embedding for a category (for semantic matching)
   */
  private static async generateCategoryEmbedding(category: DiscoveredCategory): Promise<number[]> {
    const text = `${category.name}. ${category.description}. Keywords: ${category.keywords.join(', ')}`;
    return GptService.generateEmbedding(text);
  }

  /**
   * Suggest a category for new document content
   * Returns existing category or suggests a new one
   */
  static async suggestCategory(content: string, originalName: string): Promise<CategorySuggestion> {
    const categories = await this.getAllCategories();
    const categoryNames = categories.map(c => c.name);

    // If no categories exist, suggest based on content analysis
    if (categories.length === 0) {
      return this.suggestNewCategory(content, originalName);
    }

    // First, try semantic matching with category embeddings
    const semanticMatch = await this.findSemanticMatch(content, categories);
    if (semanticMatch && semanticMatch.confidence > 0.7) {
      return {
        category: semanticMatch.category,
        confidence: semanticMatch.confidence,
        isNew: false
      };
    }

    // Use LLM to classify into existing categories or suggest new one
    const textSample = content.slice(0, 8000);
    const prompt = `You are classifying a document into a knowledge base category.

DOCUMENT:
Name: ${originalName}
Content (first 8000 chars):
${textSample}

EXISTING CATEGORIES:
${categoryNames.map((name, i) => {
  const cat = categories[i];
  return `- ${name}: ${cat.description} (keywords: ${cat.keywords?.slice(0, 5).join(', ') || 'none'})`;
}).join('\n')}

TASK:
1. Determine if this document fits into one of the existing categories
2. If it clearly fits an existing category, return that category
3. If it doesn't fit well (< 60% confidence), suggest a NEW category name

OUTPUT FORMAT (JSON only):
{
  "category": "category name (existing or new)",
  "confidence": 0.85,
  "isNew": false,
  "description": "Only include if isNew is true - describe what this new category would contain"
}

Return ONLY valid JSON.`;

    try {
      const response = await this.openai.chat.completions.create({
        model: 'gpt-4o-mini',
        max_tokens: 300,
        temperature: 0.2,
        messages: [{ role: 'user', content: prompt }]
      });

      const raw = response.choices[0]?.message?.content || '{}';
      const parsed = JSON.parse(this.extractJson(raw));

      return {
        category: (parsed.category || 'general').toLowerCase(),
        confidence: parsed.confidence || 0.5,
        isNew: parsed.isNew || false,
        description: parsed.description
      };
    } catch (error) {
      console.error('Error suggesting category:', error);
      return {
        category: 'general',
        confidence: 0.3,
        isNew: true,
        description: 'Uncategorized documents'
      };
    }
  }

  /**
   * Find semantic match using embeddings
   */
  private static async findSemanticMatch(
    content: string,
    categories: ICategory[]
  ): Promise<{ category: string; confidence: number } | null> {
    try {
      const contentSample = content.slice(0, 2000);
      const contentEmbedding = await GptService.generateEmbedding(contentSample);

      let bestMatch: { category: string; confidence: number } | null = null;
      let bestScore = 0;

      for (const cat of categories) {
        if (!cat.embedding || cat.embedding.length === 0) continue;

        const similarity = this.cosineSimilarity(contentEmbedding, cat.embedding);
        if (similarity > bestScore) {
          bestScore = similarity;
          bestMatch = { category: cat.name, confidence: similarity };
        }
      }

      return bestMatch;
    } catch (error) {
      console.error('Error in semantic matching:', error);
      return null;
    }
  }

  /**
   * Suggest a new category for content when no categories exist
   */
  private static async suggestNewCategory(content: string, originalName: string): Promise<CategorySuggestion> {
    const textSample = content.slice(0, 8000);

    const prompt = `Analyze this document and suggest a category name for it.

DOCUMENT:
Name: ${originalName}
Content:
${textSample}

GUIDELINES:
- Category should be specific and meaningful (e.g., "SSM Registration", "Financial Reports", "Project Documentation")
- Use domain-specific terms when applicable
- Keep category name concise (1-4 words)

OUTPUT FORMAT (JSON only):
{
  "category": "suggested category name",
  "confidence": 0.8,
  "description": "What documents in this category would contain"
}

Return ONLY valid JSON.`;

    try {
      const response = await this.openai.chat.completions.create({
        model: 'gpt-4o-mini',
        max_tokens: 200,
        temperature: 0.3,
        messages: [{ role: 'user', content: prompt }]
      });

      const raw = response.choices[0]?.message?.content || '{}';
      const parsed = JSON.parse(this.extractJson(raw));

      return {
        category: (parsed.category || 'general').toLowerCase(),
        confidence: parsed.confidence || 0.7,
        isNew: true,
        description: parsed.description
      };
    } catch {
      return {
        category: 'general',
        confidence: 0.3,
        isNew: true,
        description: 'General documents'
      };
    }
  }

  /**
   * Create a new category
   */
  static async createCategory(
    name: string,
    description: string,
    keywords: string[] = []
  ): Promise<ICategory> {
    const normalizedName = name.toLowerCase();

    // Check if exists
    const existing = await CategoryModel.findOne({ name: normalizedName }).exec();
    if (existing) {
      return existing;
    }

    // Generate embedding
    const embedding = await GptService.generateEmbedding(
      `${name}. ${description}. Keywords: ${keywords.join(', ')}`
    );

    const category = await CategoryModel.create({
      id: `cat_${uuidv4().slice(0, 8)}`,
      name: normalizedName,
      description,
      keywords,
      documentCount: 0,
      sampleDocuments: [],
      embedding,
      createdAt: new Date(),
      updatedAt: new Date(),
      isActive: true
    });

    console.log(`✅ Created new category: ${name}`);
    return category;
  }

  /**
   * Assign document to category and update counts
   */
  static async assignDocumentToCategory(documentId: string, categoryName: string): Promise<void> {
    const normalizedName = categoryName.toLowerCase();

    // Update document
    await DocumentModel.findOneAndUpdate(
      { id: documentId },
      { $set: { category: normalizedName } }
    ).exec();

    // Update category document count
    await this.updateCategoryCounts();
  }

  /**
   * Update document counts for all categories
   */
  static async updateCategoryCounts(): Promise<void> {
    const categories = await CategoryModel.find({ isActive: true }).exec();

    for (const cat of categories) {
      const count = await DocumentModel.countDocuments({ category: cat.name }).exec();
      const sampleDocs = await DocumentModel.find({ category: cat.name }, { id: 1 })
        .limit(5)
        .exec();

      await CategoryModel.findOneAndUpdate(
        { id: cat.id },
        {
          $set: {
            documentCount: count,
            sampleDocuments: sampleDocs.map(d => d.id),
            updatedAt: new Date()
          }
        }
      ).exec();
    }
  }

  /**
   * Get documents by category
   */
  static async getDocumentsByCategory(categoryName: string): Promise<string[]> {
    const docs = await DocumentModel.find(
      { category: categoryName.toLowerCase() },
      { id: 1 }
    ).exec();
    return docs.map(d => d.id);
  }

  /**
   * Cosine similarity helper
   */
  private static cosineSimilarity(a: number[], b: number[]): number {
    if (a.length !== b.length) return 0;

    let dotProduct = 0;
    let normA = 0;
    let normB = 0;

    for (let i = 0; i < a.length; i++) {
      dotProduct += a[i] * b[i];
      normA += a[i] * a[i];
      normB += b[i] * b[i];
    }

    normA = Math.sqrt(normA);
    normB = Math.sqrt(normB);

    if (normA === 0 || normB === 0) return 0;
    return dotProduct / (normA * normB);
  }

  /**
   * Extract JSON from potentially wrapped response
   */
  private static extractJson(s: string): string {
    const start = s.indexOf('{');
    const end = s.lastIndexOf('}');
    return start >= 0 && end >= start ? s.slice(start, end + 1) : '{}';
  }
}

import nlp from 'compromise';
import OpenAI from 'openai';
import { GraphService } from './GraphService';

export interface Entity {
  type: string;
  text: string;
  value?: string;
  start?: number;
  end?: number;
}

export class NerService {
  private static openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
  static extractQuick(text: string): Entity[] {
    const entities: Entity[] = [];
    const addMatches = (re: RegExp, type: string) => {
      let match;
      while ((match = re.exec(text)) !== null) {
        entities.push({ type, text: match[0], start: match.index, end: match.index + match[0].length });
      }
    };
    // Dates (YYYY-MM-DD, DD/MM/YYYY, Month DD, YYYY)
    addMatches(/\b\d{4}-\d{2}-\d{2}\b/g, 'DATE');
    addMatches(/\b\d{1,2}[\/.-]\d{1,2}[\/.-]\d{2,4}\b/g, 'DATE');
    addMatches(/\b(?:Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Sept|Oct|Nov|Dec)[a-z]*\s+\d{1,2},?\s+\d{4}\b/gi, 'DATE');
    // Money
    addMatches(/[₹$€£]\s?\d{1,3}(?:[,\s]\d{3})*(?:\.\d+)?/g, 'MONEY');
    addMatches(/\b\d+(?:,\d{3})*(?:\.\d+)?\s?(?:USD|EUR|INR|GBP|AUD|CAD)\b/gi, 'MONEY');
    // Email/Phone
    addMatches(/[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g, 'EMAIL');
    addMatches(/\+?\d[\d\s().-]{7,}\d/g, 'PHONE');
    // ORG heuristic: capitalized words ending with org suffixes
    addMatches(/\b[A-Z][A-Za-z0-9&\-.]*(?:\s+[A-Z][A-Za-z0-9&\-.]*)*\s+(?:Inc\.|LLC|Ltd\.|Pvt\.?\s?Ltd\.|LLP|Corporation|Company|Co\.)\b/g, 'ORG');
    // PERSON heuristic: First Last (two capitalized words)
    addMatches(/\b[A-Z][a-z]+\s+[A-Z][a-z]+\b/g, 'PERSON');
    return entities;
  }

  static async extractLLM(text: string, documentName: string): Promise<Entity[]> {
    const excerpt = text.slice(0, 12000);
    const prompt = `You are an expert Named Entity Recognition (NER) system with deep expertise in extracting structured entities from unstructured text. Your task is to identify and extract all relevant entities with high precision and recall.

========================================
DOCUMENT TO ANALYZE
========================================
Document Name: ${documentName}
Content Length: ${excerpt.length} characters
Content:

${excerpt}

========================================
ENTITY TYPES TO EXTRACT
========================================

1. PERSON - Individual names
   - Full names (e.g., "John Smith", "Dr. Sarah Johnson")
   - Titles with names (e.g., "Mr. Robert Brown", "Prof. Emily Chen")
   - Professional designations (e.g., "CEO John Doe", "Attorney Jane Smith")
   - Multiple name formats (Western, Eastern, etc.)

2. ORG - Organizations, companies, institutions
   - Company names with suffixes (e.g., "Microsoft Corporation", "Acme Inc.", "ABC Ltd.")
   - Government entities (e.g., "Internal Revenue Service", "Department of Justice")
   - Educational institutions (e.g., "Stanford University", "MIT")
   - Non-profits and associations (e.g., "Red Cross", "WHO")

3. DATE - All date/time references
   - Formatted dates (e.g., "2024-01-15", "January 15, 2024", "15/01/2024")
   - Relative dates (e.g., "last month", "next year", "Q1 2024")
   - Date ranges (e.g., "January 1 - March 31, 2024")
   - Partial dates (e.g., "March 2024", "2024")

4. MONEY - Monetary amounts and financial values
   - Currency symbols (e.g., "$1,234.56", "€500", "£1,000", "₹10,000")
   - Written amounts (e.g., "1000 USD", "500 EUR", "Rs. 5000")
   - Financial terms with amounts (e.g., "salary of $75,000", "rent: $2,000/month")

5. ADDRESS - Physical locations and addresses
   - Street addresses (e.g., "123 Main St, Apt 4B, New York, NY 10001")
   - City, state, country combinations
   - Postal codes, ZIP codes
   - Building names and landmarks

6. CONTRACT_PARTY - Parties involved in agreements/contracts
   - Named parties in legal documents (e.g., "Landlord: XYZ Corp", "Tenant: John Doe")
   - Signatories and their roles
   - Legal entity names in contract context

7. ID_NUMBER - Identification numbers and codes
   - Social Security Numbers (e.g., "123-45-6789")
   - Tax IDs (e.g., "EIN: 12-3456789")
   - Account numbers (e.g., "Account #: 1234567890")
   - Reference numbers, invoice numbers, order IDs
   - License numbers, permit numbers

========================================
EXTRACTION RULES
========================================

ACCURACY RULES:
1. Extract ONLY entities explicitly present in the text
2. Do NOT infer or generate entities not in the text
3. Preserve exact text as it appears (including formatting, capitalization)
4. For ambiguous cases, prefer the most specific entity type

COMPLETENESS RULES:
1. Extract ALL instances of each entity type (not just the first occurrence)
2. If an entity appears multiple times, include each occurrence
3. Extract entities from all parts of the document (headers, body, footers, tables)

QUALITY RULES:
1. Avoid extracting common words that aren't actually entities (e.g., "May" as a month vs. modal verb)
2. For PERSON, prefer names with titles or context over isolated capitalized words
3. For ORG, include full organization names with suffixes when present
4. For DATE, extract complete date expressions (don't split "January 15, 2024" into parts)
5. For MONEY, include currency symbol/code with the amount
6. For ADDRESS, extract complete addresses when possible (not just city or street)

DISAMBIGUATION RULES:
- "May" followed by a number → DATE, otherwise likely not an entity
- Capitalized words at sentence start → check context before marking as PERSON/ORG
- Numbers alone → only extract if clearly ID_NUMBER or MONEY (with context)
- Common words (e.g., "President", "Director") → only extract if part of a name or title

========================================
OUTPUT FORMAT
========================================
Return ONLY a valid JSON array of entities.
Each entity object must have exactly these fields:
{
  "type": "entity_type_from_list_above",
  "text": "exact text as it appears in document"
}

Example format:
[
  {"type": "PERSON", "text": "Dr. John Smith"},
  {"type": "ORG", "text": "Microsoft Corporation"},
  {"type": "DATE", "text": "January 15, 2024"},
  {"type": "MONEY", "text": "$1,234.56"},
  {"type": "ADDRESS", "text": "123 Main St, New York, NY 10001"},
  {"type": "ID_NUMBER", "text": "Invoice #: INV-2024-001"}
]

CRITICAL REQUIREMENTS:
- Return ONLY the JSON array, no explanations or markdown
- Each "type" must be one of: PERSON, ORG, DATE, MONEY, ADDRESS, CONTRACT_PARTY, ID_NUMBER
- Each "text" must be the exact string from the document
- Include ALL relevant entities found (aim for high recall)
- Maintain high precision (avoid false positives)
- If no entities found, return empty array: []

EXTRACTED ENTITIES:`;
    try {
      const response = await this.openai.chat.completions.create({
        model: 'gpt-5',
        max_completion_tokens: 500,
        temperature: 1,
        messages: [{ role: 'user', content: prompt }]
      });
      const raw = response.choices[0]?.message?.content || '[]';
      const jsonStart = raw.indexOf('[');
      const jsonEnd = raw.lastIndexOf(']');
      const parsed = JSON.parse(jsonStart >= 0 ? raw.slice(jsonStart, jsonEnd + 1) : '[]');
      return Array.isArray(parsed) ? parsed : [];
    } catch {
      return [];
    }
  }

  static async upsertGraphFromEntities(docId: string, docLabel: string, entities: Entity[]) {
    const docNodeId = await GraphService.upsertNode('DOCUMENT', docLabel, docId);
    for (const e of entities) {
      const nodeId = await GraphService.upsertNode(e.type, e.text, `${e.type}:${e.text}`);
      await GraphService.upsertEdge(docNodeId, nodeId, 'MENTIONS', 0.9, { docId: docId });
    }
  }
}



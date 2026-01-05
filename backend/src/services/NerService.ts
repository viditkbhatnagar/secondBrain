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
    const prompt = `Extract key entities from the text. Return JSON array where each item is {"type": string, "text": string}. Focus on PERSON, ORG, DATE, MONEY, ADDRESS, CONTRACT_PARTY, ID_NUMBER.
Document: ${documentName}
Text:\n${excerpt}`;
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



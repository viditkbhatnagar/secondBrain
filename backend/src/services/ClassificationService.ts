import nlp from 'compromise';
import OpenAI from 'openai';

export interface ClassificationResult {
  label: string;
  confidence: number;
  candidates?: Array<{ label: string; confidence: number }>;
}

export class ClassificationService {
  private static openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
  /**
   * Heuristic + LLM-backed zero-shot classifier.
   * Reads first N characters (~first 3-4 pages) and classifies into dynamic labels.
   */
  static async classifyDocument(content: string, originalName: string): Promise<ClassificationResult> {
    const text = (content || '').slice(0, 16000); // ~ first 3-4 pages by chars

    // Heuristic pass (fast path)
    const heur = this.heuristicClassification(text, originalName);

    // LLM zero-shot refinement
    const labels = [
      'resume/cv', 'rental agreement', 'lease contract', 'government document',
      'invoice', 'receipt', 'legal document', 'research paper', 'presentation notes',
      'blog/article', 'report', 'medical record', 'bank statement', 'tax document', 'other'
    ];
    const prompt = `You are a precise document classifier. Given the following text excerpt, classify the document into one of these labels and provide a confidence (0-1) and 3 candidate alternatives with confidences.

Labels: ${labels.join(', ')}
Rules:
- Use content strongly; filename hints are secondary.
- Return strict JSON: { "label": string, "confidence": number, "candidates": Array<{"label": string, "confidence": number}> }
Document name: ${originalName}
Excerpt:\n${text}`;

    try {
      const response = await this.openai.chat.completions.create({
        model: 'gpt-5',
        max_completion_tokens: 250,
        temperature: 1,
        messages: [{ role: 'user', content: prompt }]
      });
      const raw = response.choices[0]?.message?.content || '';
      const parsed = JSON.parse(this.extractJson(raw));
      const final: ClassificationResult = {
        label: parsed.label || heur.label,
        confidence: Math.max(Number(parsed.confidence) || 0, heur.confidence),
        candidates: Array.isArray(parsed.candidates) ? parsed.candidates : heur.candidates
      };
      return final;
    } catch {
      return heur; // fallback
    }
  }

  static extractJson(s: string): string {
    const start = s.indexOf('{');
    const end = s.lastIndexOf('}');
    return start >= 0 && end >= start ? s.slice(start, end + 1) : '{}';
  }

  static heuristicClassification(text: string, originalName: string): ClassificationResult {
    const lower = text.toLowerCase();
    const name = originalName.toLowerCase();
    const candidates: Array<{ label: string; confidence: number }> = [];

    const push = (label: string, conf: number) => candidates.push({ label, confidence: conf });

    if (/curriculum vitae|summary|skills|experience|education|linkedin|github/.test(lower) || /resume|cv/.test(name)) {
      push('resume/cv', 0.7);
    }
    if (/lease|rent|tenant|landlord|premises|security deposit/.test(lower) || /rent|lease/.test(name)) {
      push('rental agreement', 0.6);
    }
    if (/government|ministry|department|act|regulation|notification|gazette/.test(lower)) {
      push('government document', 0.55);
    }
    if (/invoice|bill to|amount due|subtotal|balance due/.test(lower)) {
      push('invoice', 0.55);
    }
    if (/bank|statement|account number|transaction/.test(lower)) {
      push('bank statement', 0.5);
    }
    if (/tax|assessment|irs|income tax|return|gst|vat/.test(lower)) {
      push('tax document', 0.55);
    }
    if (/plaintiff|defendant|hereby|whereas|attorney|jurisdiction/.test(lower)) {
      push('legal document', 0.6);
    }
    if (/abstract|introduction|references|methodology|conclusion|doi/.test(lower)) {
      push('research paper', 0.6);
    }

    // default
    if (candidates.length === 0) push('other', 0.3);

    // pick top
    candidates.sort((a, b) => b.confidence - a.confidence);
    const top = candidates[0];
    return { label: top.label, confidence: top.confidence, candidates: candidates.slice(0, 3) };
  }
}



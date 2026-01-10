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
    const prompt = `You are an expert document classifier with deep expertise in analyzing document structure, content patterns, and domain-specific terminology. Your task is to accurately classify a document based on its content.

========================================
DOCUMENT TO CLASSIFY
========================================
Document Name: ${originalName}
Content Length: ${text.length} characters
Content Excerpt (first ~16,000 characters):

${text}

========================================
CLASSIFICATION LABELS
========================================
${labels.join(', ')}

========================================
CLASSIFICATION STRATEGY
========================================

1. CONTENT ANALYSIS (PRIMARY - 70% weight):
   - Identify key terminology, phrases, and domain-specific language
   - Analyze document structure (sections, headings, formatting patterns)
   - Look for definitive indicators:
     * Legal docs: legal terminology, clauses, "whereas", "hereby", contract structure
     * Financial docs: financial terms, amounts, account numbers, transaction details
     * Medical docs: medical terminology, diagnosis, treatment, patient information
     * Research papers: abstract, methodology, references, citations, DOI
     * Resumes/CVs: skills, experience, education, professional summary
   - Identify document purpose and target audience
   - Note any unique characteristics specific to document types

2. FILENAME HINTS (SECONDARY - 30% weight):
   - Consider filename as supporting evidence only
   - Do NOT override strong content signals with weak filename hints
   - Use filename to break ties between similar content patterns

3. CONFIDENCE CALIBRATION:
   - HIGH (0.8-1.0): Strong, definitive indicators present; document type is clear
   - MEDIUM (0.5-0.79): Multiple indicators present but some ambiguity exists
   - LOW (0.3-0.49): Weak or conflicting indicators; classification is uncertain
   - VERY LOW (0.0-0.29): Content doesn't match any category well

4. CANDIDATE GENERATION:
   - Identify the top 3 most likely classifications
   - Assign confidence scores based on strength of evidence for each
   - Ensure candidates are ranked by confidence (highest first)
   - Total confidence across all candidates should not exceed 1.5

========================================
CLASSIFICATION DECISION RULES
========================================

MUST classify as "resume/cv" if:
- Contains "curriculum vitae", "resume", "professional summary"
- Has sections: Skills, Experience, Education, Contact
- Lists job titles with dates and responsibilities

MUST classify as "legal document" if:
- Contains legal clauses, "party of the first part", "whereas", "hereby"
- Has signature blocks, witness lines, notarization
- Uses formal legal language and structure

MUST classify as "rental agreement" / "lease contract" if:
- Mentions landlord, tenant, rent amount, lease term
- Contains property address, security deposit, lease conditions
- Has rental-specific clauses and terms

MUST classify as "research paper" if:
- Has abstract, introduction, methodology, results, conclusion
- Contains academic citations, references, DOI
- Uses formal academic writing style

MUST classify as "invoice" / "receipt" if:
- Contains billing details, itemized charges, total amount due
- Has invoice number, date, payment terms
- Shows buyer and seller information

MUST classify as "bank statement" if:
- Shows account number, transaction history, balance
- Lists deposits, withdrawals, dates
- Has bank branding or financial institution information

MUST classify as "medical record" if:
- Contains patient information, diagnosis, treatment plans
- Has medical terminology, prescriptions, test results
- Shows healthcare provider information

MUST classify as "other" if:
- Content doesn't strongly match any specific category
- Document is general-purpose (notes, general text, etc.)
- Multiple classifications are equally weak

========================================
OUTPUT FORMAT
========================================
Return ONLY valid JSON in this exact structure:
{
  "label": "selected_label_from_list",
  "confidence": 0.XX,
  "candidates": [
    {"label": "first_candidate", "confidence": 0.XX},
    {"label": "second_candidate", "confidence": 0.XX},
    {"label": "third_candidate", "confidence": 0.XX}
  ]
}

CRITICAL REQUIREMENTS:
- "label" must be exactly one of the provided labels
- "confidence" must be a number between 0 and 1
- "candidates" must contain exactly 3 items
- All candidate labels must be from the provided labels list
- Candidates should be ranked by confidence (descending)
- Do NOT include explanations, markdown, or any text outside the JSON

CLASSIFICATION RESULT:`;

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



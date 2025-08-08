// Type declarations for packages without official types

declare module 'pdf-parse' {
    interface PDFData {
      numpages: number;
      numrender: number;
      info: any;
      metadata: any;
      text: string;
      version: string;
    }
  
    interface PDFParseOptions {
      pagerender?: (pageData: any) => string;
      max?: number;
      version?: string;
    }
  
    function pdfParse(buffer: Buffer, options?: PDFParseOptions): Promise<PDFData>;
    export = pdfParse;
  }

// Type declarations for optional ESM libraries
declare module '@xenova/transformers' {
  export const pipeline: any;
}
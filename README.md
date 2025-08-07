# Personal Knowledge Base with AI Search

A full-stack application that allows you to upload documents (PDF, DOCX, TXT, MD) and search through them using AI-powered natural language queries.

## Features

- 📄 **Document Upload**: Support for PDF, DOCX, TXT, and Markdown files
- 🔍 **AI-Powered Search**: Ask questions in natural language and get intelligent answers
- 🧠 **Smart Chunking**: Automatically breaks documents into searchable chunks
- 📊 **Document Management**: View, organize, and delete your uploaded documents
- 🎯 **Relevance Scoring**: Shows confidence levels and source relevance
- ⚡ **Fast Vector Search**: Efficient similarity search using embeddings

## Tech Stack

**Frontend:**
- React 18 with TypeScript
- Tailwind CSS for styling
- React Dropzone for file uploads
- Lucide React for icons

**Backend:**
- Node.js with Express and TypeScript
- Claude API for question answering
- OpenAI API for embeddings generation
- In-memory vector storage (easily replaceable with Pinecone/Chroma)
- PDF.js and Mammoth for document processing

## Prerequisites

- Node.js 16+ installed
- Anthropic API key (Claude)
- OpenAI API key (for embeddings)

## Quick Start

### 1. Clone and Set Up Project Structure

Create the following directory structure:

```
personal-knowledge-base/
├── frontend/
├── backend/
├── .env.example
├── .gitignore
└── README.md
```

### 2. Backend Setup

```bash
cd backend
npm init -y
npm install express cors dotenv multer pdf-parse mammoth @anthropic-ai/sdk openai chromadb pg bcryptjs jsonwebtoken uuid fs-extra
npm install -D @types/express @types/cors @types/multer @types/node @types/pg @types/bcryptjs @types/jsonwebtoken @types/uuid @types/fs-extra typescript ts-node-dev jest @types/jest
```

Create your `.env` file:
```bash
cp ../.env.example .env
```

Add your API keys to `.env`:
```
ANTHROPIC_API_KEY=your_anthropic_api_key_here
OPENAI_API_KEY=your_openai_api_key_here
PORT=3001
NODE_ENV=development
```

### 3. Frontend Setup

```bash
cd ../frontend
npx create-react-app . --template typescript
npm install tailwindcss autoprefixer postcss @tailwindcss/typography axios react-dropzone pdfjs-dist mammoth lucide-react
npm install -D @types/pdfjs-dist
```

Initialize Tailwind:
```bash
npx tailwindcss init -p
```

### 4. Add All the Code Files

Copy all the provided code into the respective files according to the file structure.

### 5. Start the Application

Terminal 1 (Backend):
```bash
cd backend
npm run dev
```

Terminal 2 (Frontend):
```bash
cd frontend
npm start
```

The application will be available at:
- Frontend: http://localhost:3000
- Backend: http://localhost:3001

## Usage

1. **Upload Documents**: Go to the Upload tab and drag & drop your PDF, DOCX, TXT, or MD files
2. **Search**: Use the Search tab to ask questions about your documents in natural language
3. **Manage**: View and manage your uploaded documents in the Library tab

## Example Queries

- "What are the main findings in the research papers?"
- "Summarize the key points about machine learning"
- "What does the document say about data privacy?"
- "Find information about project timelines"
- "What are the recommendations mentioned?"

## Production Deployment

For production use, consider:

1. **Database**: Replace the in-memory storage with PostgreSQL or MongoDB
2. **Vector Store**: Use Pinecone, Chroma, or Weaviate for production vector storage
3. **File Storage**: Use AWS S3 or similar for file storage
4. **Authentication**: Add user authentication and authorization
5. **Rate Limiting**: Implement API rate limiting
6. **Monitoring**: Add logging and monitoring
7. **HTTPS**: Use HTTPS in production

## Environment Variables

```env
# Required
ANTHROPIC_API_KEY=your_anthropic_api_key_here
OPENAI_API_KEY=your_openai_api_key_here

# Optional
PORT=3001
NODE_ENV=development
MAX_FILE_SIZE=52428800  # 50MB
UPLOAD_DIR=./uploads

# Production options
DATABASE_URL=postgresql://...
PINECONE_API_KEY=your_pinecone_key
CHROMA_HOST=localhost
CHROMA_PORT=8000
```

## API Endpoints

- `POST /api/upload` - Upload and process documents
- `POST /api/search` - Search through documents
- `GET /api/documents` - Get all documents
- `GET /api/documents/:id` - Get specific document
- `DELETE /api/documents/:id` - Delete document
- `GET /api/documents/stats` - Get statistics
- `GET /api/health` - Health check

## Contributing

1. Fork the repository
2. Create a feature branch
3. Make your changes
4. Add tests if needed
5. Submit a pull request

## License

MIT License - see LICENSE file for details
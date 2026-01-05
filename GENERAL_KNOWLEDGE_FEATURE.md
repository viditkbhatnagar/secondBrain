# General Knowledge Fallback Feature

## Overview
This document describes the General Knowledge Fallback feature that allows the chatbot to answer questions not present in your knowledge base using OpenAI directly.

## How It Works

### Automatic Fallback Triggers
The system automatically switches to OpenAI general knowledge in two scenarios:

1. **No Documents Found** (0 chunks)
   - When the search returns no relevant documents from your knowledge base
   - System message: "No relevant documents found - Using general knowledge"

2. **Low Confidence** (< 30%)
   - When the confidence score of the answer based on your documents is below 30%
   - System message: "Low confidence (X%) - Using general knowledge instead"

### Configuration

#### Token Limits
- **Max Tokens**: 8,000 (increased from 1,500)
- **Purpose**: Provides very detailed, comprehensive responses
- **Cost**: Not a concern - prioritizes quality over cost

#### Confidence Threshold
- **Threshold**: 30%
- **Location**: `backend/src/routes/search.ts` line 770
- **Adjustable**: Change `CONFIDENCE_THRESHOLD` constant to adjust sensitivity

### System Prompt
The AI is instructed to:
- Provide VERY DETAILED and THOROUGH responses
- Cover topics from multiple angles and perspectives
- Include relevant examples, explanations, and context
- Break down complex topics into understandable parts
- Be comprehensive without holding back information

### Visual Indicators

#### Frontend Display
When a response uses general knowledge, it shows:
- **Badge**: "✨ General Knowledge"
- **Helper Text**: "Not found in your documents"
- **No Sources**: Sources accordion is hidden for general knowledge responses

#### Backend Metadata
Responses include metadata:
```javascript
{
  isGeneralKnowledge: true,
  fallbackReason: 'no_documents' | 'low_confidence',
  originalConfidence: 25,  // Only for low_confidence fallback
  confidence: 70           // Fixed confidence for general knowledge
}
```

## Implementation Details

### Backend Changes

#### 1. Enhanced Agent Stream Endpoint
**File**: `backend/src/routes/search.ts`

- Added confidence threshold check (30%)
- Streams responses directly from OpenAI when triggered
- Logs fallback reason in metadata
- Tracks analytics with `isGeneralKnowledge` flag

#### 2. OpenAI Service Enhancements
**File**: `backend/src/services/OpenAIService.ts`

- Increased `max_completion_tokens` from 1,500 → 8,000
- Enhanced system prompts for detailed responses
- Supports conversation history (last 6 messages)
- Streaming support for real-time responses

### Frontend Changes

#### 1. Type Definitions
**File**: `frontend/src/components/chat/types.ts`

Added `isGeneralKnowledge` field to `ChatMessage` interface

#### 2. Chat Page Component
**File**: `frontend/src/components/chat/ChatPage.tsx`

- Extracts `isGeneralKnowledge` from response metadata
- Passes flag to message display component
- Logs general knowledge status in console

#### 3. Message Bubble Component
**File**: `frontend/src/components/chat/MessageBubble.tsx`

- Displays "General Knowledge" badge with sparkles icon
- Shows helper text "Not found in your documents"
- Hides sources accordion for general knowledge responses
- Uses `info` variant badge styling

## Usage Examples

### Example 1: No Documents Found
```
User: "What is the capital of France?"
System: No relevant documents found - Using general knowledge
AI: [Detailed response about Paris]
Badge: ✨ General Knowledge
```

### Example 2: Low Confidence
```
User: "Explain quantum computing"
System: Searches documents, finds low relevance (confidence: 18%)
System: Low confidence (18%) - Using general knowledge instead
AI: [Comprehensive explanation of quantum computing]
Badge: ✨ General Knowledge
```

### Example 3: High Confidence (uses documents)
```
User: "What is covered in Module 2?"
System: Searches documents, finds high relevance (confidence: 85%)
AI: [Answer based on your documents]
Shows: Sources accordion with 3 documents
```

## Analytics & Tracking

All general knowledge responses are tracked with:
- Query text
- Original confidence (if applicable)
- Fallback reason
- Thread ID
- Session ID
- Timestamp

## Configuration Options

### Adjust Confidence Threshold
```typescript
// backend/src/routes/search.ts (line ~770)
const CONFIDENCE_THRESHOLD = 30; // Change this value (0-100)
```

Lower values = Less likely to fallback
Higher values = More likely to use general knowledge

### Adjust Response Length
```typescript
// backend/src/services/OpenAIService.ts
max_completion_tokens: 8000 // Increase for longer responses
```

### Adjust Model
```typescript
// backend/src/services/OpenAIService.ts (line 22)
private static model = 'gpt-5'; // Change model here
```

## Benefits

1. **Never Says "I Don't Know"**: Always provides helpful responses
2. **Seamless Experience**: Users don't need to know where info comes from
3. **Clear Transparency**: Visual indicators show when using general knowledge
4. **Detailed Responses**: 8,000 tokens allows comprehensive answers
5. **Context Aware**: Maintains conversation history in fallback mode
6. **Analytics Ready**: Tracks all fallback events for monitoring

## Testing

### Test Low Confidence Fallback
Ask questions unrelated to your documents:
- "What is photosynthesis?"
- "Explain the theory of relativity"
- "What is machine learning?"

### Test Document-Based Responses
Ask questions directly about your uploaded documents:
- "What topics are covered in my documents?"
- "Summarize the key findings"
- "What methodology is described?"

## Future Enhancements

Possible improvements:
- [ ] Allow users to toggle general knowledge on/off
- [ ] Show both document-based AND general knowledge answers
- [ ] Adjustable confidence threshold per user
- [ ] Hybrid responses combining both sources
- [ ] Cost tracking and limits for general knowledge
- [ ] A/B testing different confidence thresholds


import { z } from "zod";

// Define the static discovery tool schema using Zod
export const DiscoverToolsInputSchema = z.object({
  server_uuid: z.string().uuid().optional().describe("Specific server UUID (optional, omit for all)"),
  force_refresh: z.boolean().optional().default(false).describe("Force refresh bypassing cache"),
}).describe("Triggers tool discovery for configured MCP servers in the Pluggedin App.");

// Define the schema for asking questions to the knowledge base
export const AskKnowledgeBaseInputSchema = z.object({
  query: z.string()
    .min(1, "Query cannot be empty")
    .max(1000, "Query too long")
    .describe("Question to ask the knowledge base")
}).describe("Ask questions and get AI-generated answers from your knowledge base. Returns JSON with answer, sources, and metadata.");

// Input schema for send notification validation
export const SendNotificationInputSchema = z.object({
  title: z.string().optional()
    .describe("Optional notification title. If not provided, system uses localized default"),
  message: z.string().min(1, "Message cannot be empty")
    .describe("The notification message content"),
  severity: z.enum(["INFO", "SUCCESS", "WARNING", "ALERT"]).default("INFO")
    .describe("Severity level: INFO (default), SUCCESS, WARNING, or ALERT"),
  link: z.string().url().optional()
    .describe("Optional URL link associated with notification"),
  email: z.boolean().default(false)
    .describe("Whether to also send notification via email (default: false)"),
});

// Input schema for list notifications validation
export const ListNotificationsInputSchema = z.object({
  limit: z.number().int().min(1).max(100).default(20)
    .describe("Maximum number of notifications to return (1-100, default: 20)"),
  unreadOnly: z.boolean().default(false)
    .describe("Filter to show only unread notifications (default: false)"),
  severity: z.enum(["INFO", "SUCCESS", "WARNING", "ALERT"]).optional()
    .describe("Filter by severity level: INFO, SUCCESS, WARNING, or ALERT (optional)"),
});

// Input schema for mark notification done validation
export const MarkNotificationDoneInputSchema = z.object({
  notificationId: z.string().min(1, "Notification ID cannot be empty")
    .describe("The unique ID of the notification to mark as done"),
});

// Input schema for delete notification validation
export const DeleteNotificationInputSchema = z.object({
  notificationId: z.string().min(1, "Notification ID cannot be empty")
    .describe("The unique ID of the notification to delete"),
});

// Input schema for create document validation
export const CreateDocumentInputSchema = z.object({
  title: z.string()
    .min(1, "Title is required")
    .max(255, "Title too long")
    .describe("Document title"),
  content: z.string()
    .min(1, "Content is required")
    .describe("Document content"),
  format: z.enum(["md", "txt", "json", "html"])
    .default("md")
    .describe("Format: md (Markdown), txt (plain text), json, or html"),
  tags: z.array(z.string())
    .max(20, "Maximum 20 tags allowed")
    .optional()
    .describe("Tags for categorization"),
  category: z.enum(["report", "analysis", "documentation", "guide", "research", "code", "other"])
    .default("other")
    .describe("Document category"),
  metadata: z.object({
    model: z.object({
      name: z.string()
        .describe("AI model name"),
      provider: z.string()
        .describe("Model provider"),
      version: z.string()
        .optional()
        .describe("Model version"),
    }).describe("AI model info for attribution"),
    context: z.string()
      .optional()
      .describe("Creation context"),
    visibility: z.enum(["private", "workspace", "public"])
      .default("private")
      .describe("Visibility: private (only you), workspace (team), public (everyone)"),
    prompt: z.string()
      .optional()
      .describe("User prompt that triggered creation"),
    conversationContext: z.array(z.string())
      .optional()
      .describe("Previous conversation messages for context"),
    sourceDocuments: z.array(z.string())
      .optional()
      .describe("UUIDs of referenced documents"),
    generationParams: z.object({
      temperature: z.number()
        .min(0)
        .max(2)
        .optional()
        .describe("Temperature (0-2)"),
      maxTokens: z.number()
        .positive()
        .optional()
        .describe("Max tokens"),
      topP: z.number()
        .min(0)
        .max(1)
        .optional()
        .describe("Top-p (0-1)"),
    })
    .optional()
    .describe("Generation parameters"),
  }).describe("Metadata for attribution and tracking"),
}).describe("Create and save an AI-generated document to the user's library with full metadata tracking");

// Input schema for list documents validation
export const ListDocumentsInputSchema = z.object({
  filters: z.object({
    source: z.enum(["all", "upload", "ai_generated", "api"]).default("all")
      .describe("Filter by document source: all, upload, ai_generated, or api"),
    modelName: z.string().optional()
      .describe("Filter by AI model name (optional)"),
    modelProvider: z.string().optional()
      .describe("Filter by model provider, e.g., 'anthropic', 'openai' (optional)"),
    dateFrom: z.string().datetime().optional()
      .describe("Filter documents created after this date (ISO 8601 format)"),
    dateTo: z.string().datetime().optional()
      .describe("Filter documents created before this date (ISO 8601 format)"),
    tags: z.array(z.string()).optional()
      .describe("Filter by document tags (optional)"),
    category: z.enum(["report", "analysis", "documentation", "guide", "research", "code", "other"]).optional()
      .describe("Filter by document category (optional)"),
    searchQuery: z.string().optional()
      .describe("Text search query to filter documents (optional)"),
  }).optional()
    .describe("Optional filters to apply when listing documents"),
  sort: z.enum(["date_desc", "date_asc", "title", "size"]).default("date_desc")
    .describe("Sort order: date_desc (newest first), date_asc (oldest first), title (alphabetical), or size"),
  limit: z.number().int().min(1).max(100).default(20)
    .describe("Maximum number of documents to return (1-100, default: 20)"),
  offset: z.number().int().min(0).default(0)
    .describe("Number of documents to skip for pagination (default: 0)"),
});

// Define the search documents input schema using Zod
export const SearchDocumentsInputSchema = z.object({
  query: z.string().min(1).max(500)
    .describe("Search query text to find documents (1-500 characters)"),
  filters: z.object({
    modelName: z.string().optional()
      .describe("Filter by AI model name (optional)"),
    modelProvider: z.string().optional()
      .describe("Filter by model provider, e.g., 'anthropic', 'openai' (optional)"),
    dateFrom: z.string().datetime().optional()
      .describe("Filter documents created after this date (ISO 8601 format)"),
    dateTo: z.string().datetime().optional()
      .describe("Filter documents created before this date (ISO 8601 format)"),
    tags: z.array(z.string()).optional()
      .describe("Filter by document tags (optional)"),
    source: z.enum(["all", "upload", "ai_generated", "api"]).default("all")
      .describe("Filter by document source: all, upload, ai_generated, or api"),
  }).optional()
    .describe("Optional filters to refine search results"),
  limit: z.number().int().min(1).max(50).default(10)
    .describe("Maximum number of search results to return (1-50, default: 10)"),
});

// Define the get document input schema using Zod
export const GetDocumentInputSchema = z.object({
  documentId: z.string().uuid()
    .describe("Unique document identifier (UUID format)"),
  includeContent: z.boolean().default(false)
    .describe("Include full document content in response (default: false)"),
  includeVersions: z.boolean().default(false)
    .describe("Include document version history (default: false)"),
});

// Define the update document input schema using Zod
export const UpdateDocumentInputSchema = z.object({
  documentId: z.string()
    .uuid()
    .describe("Document UUID"),
  operation: z.enum(["replace", "append", "prepend"])
    .describe("Operation: replace (overwrite), append (add to end), prepend (add to start)"),
  content: z.string()
    .min(1, "Content is required")
    .describe("New content"),
  metadata: z.object({
    tags: z.array(z.string())
      .optional()
      .describe("Updated tags"),
    changeSummary: z.string()
      .optional()
      .describe("Change summary"),
    updateReason: z.string()
      .optional()
      .describe("Update reason"),
    changesFromPrompt: z.string()
      .optional()
      .describe("User prompt that triggered update"),
    model: z.object({
      name: z.string()
        .describe("AI model name"),
      provider: z.string()
        .describe("Model provider"),
      version: z.string()
        .optional()
        .describe("Model version"),
    }).describe("AI model info for attribution"),
  })
  .optional()
  .describe("Update metadata"),
}).describe("Update or append to an existing AI-generated document with version tracking");
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
  title: z.string().optional(),
  message: z.string().min(1, "Message cannot be empty"),
  severity: z.enum(["INFO", "SUCCESS", "WARNING", "ALERT"]).default("INFO"),
  link: z.string().url().optional(),
  email: z.boolean().default(false),
});

// Input schema for list notifications validation
export const ListNotificationsInputSchema = z.object({
  limit: z.number().int().min(1).max(100).default(20),
  unreadOnly: z.boolean().default(false),
  severity: z.enum(["INFO", "SUCCESS", "WARNING", "ALERT"]).optional(),
});

// Input schema for mark notification done validation
export const MarkNotificationDoneInputSchema = z.object({
  notificationId: z.string().min(1, "Notification ID cannot be empty"),
});

// Input schema for delete notification validation
export const DeleteNotificationInputSchema = z.object({
  notificationId: z.string().min(1, "Notification ID cannot be empty"),
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
    source: z.enum(["all", "upload", "ai_generated", "api"]).default("all"),
    modelName: z.string().optional(),
    modelProvider: z.string().optional(),
    dateFrom: z.string().datetime().optional(),
    dateTo: z.string().datetime().optional(),
    tags: z.array(z.string()).optional(),
    category: z.enum(["report", "analysis", "documentation", "guide", "research", "code", "other"]).optional(),
    searchQuery: z.string().optional(),
  }).optional(),
  sort: z.enum(["date_desc", "date_asc", "title", "size"]).default("date_desc"),
  limit: z.number().int().min(1).max(100).default(20),
  offset: z.number().int().min(0).default(0),
});

// Define the search documents input schema using Zod
export const SearchDocumentsInputSchema = z.object({
  query: z.string().min(1).max(500),
  filters: z.object({
    modelName: z.string().optional(),
    modelProvider: z.string().optional(),
    dateFrom: z.string().datetime().optional(),
    dateTo: z.string().datetime().optional(),
    tags: z.array(z.string()).optional(),
    source: z.enum(["all", "upload", "ai_generated", "api"]).default("all"),
  }).optional(),
  limit: z.number().int().min(1).max(50).default(10),
});

// Define the get document input schema using Zod
export const GetDocumentInputSchema = z.object({
  documentId: z.string().uuid(),
  includeContent: z.boolean().default(false),
  includeVersions: z.boolean().default(false),
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
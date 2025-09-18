import { z } from "zod";

// Define the static discovery tool schema using Zod
export const DiscoverToolsInputSchema = z.object({
  server_uuid: z.string().uuid().optional().describe("Optional UUID of a specific server to discover. If omitted, attempts to discover all."),
  force_refresh: z.boolean().optional().default(false).describe("Set to true to bypass cache and force a fresh discovery. Defaults to false."),
}).describe("Triggers tool discovery for configured MCP servers in the Pluggedin App.");

// Define the schema for asking questions to the knowledge base
export const AskKnowledgeBaseInputSchema = z.object({
  query: z.string()
    .min(1, "Query cannot be empty")
    .max(1000, "Query too long")
    .describe("Your question or query to get AI-generated answers from the knowledge base.")
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
    .describe("Document title - concise, descriptive name for the document"),
  content: z.string()
    .min(1, "Content is required")
    .describe("Document content in the specified format (markdown, plain text, JSON, or HTML)"),
  format: z.enum(["md", "txt", "json", "html"])
    .default("md")
    .describe("Document format: 'md' for Markdown (default), 'txt' for plain text, 'json' for JSON data, 'html' for HTML markup"),
  tags: z.array(z.string())
    .max(20, "Maximum 20 tags allowed")
    .optional()
    .describe("Optional tags for categorization and search (e.g., ['api-docs', 'typescript', 'tutorial'])"),
  category: z.enum(["report", "analysis", "documentation", "guide", "research", "code", "other"])
    .default("other")
    .describe("Document category: 'report' for reports/summaries, 'analysis' for data analysis, 'documentation' for technical docs, 'guide' for how-to guides, 'research' for research papers, 'code' for code snippets, 'other' for miscellaneous"),
  metadata: z.object({
    model: z.object({
      name: z.string()
        .describe("AI model name (e.g., 'claude-3-opus', 'gpt-4', 'gemini-pro')"),
      provider: z.string()
        .describe("Model provider (e.g., 'anthropic', 'openai', 'google')"),
      version: z.string()
        .optional()
        .describe("Optional model version (e.g., '20240229', '1.5')"),
    }).describe("AI model information for attribution"),
    context: z.string()
      .optional()
      .describe("Optional context about how/why this document was created"),
    visibility: z.enum(["private", "workspace", "public"])
      .default("private")
      .describe("Document visibility: 'private' (only you), 'workspace' (your team), 'public' (everyone)"),
    prompt: z.string()
      .optional()
      .describe("The user prompt/question that triggered this document creation"),
    conversationContext: z.array(z.string())
      .optional()
      .describe("Previous conversation messages that provide context for this document (array of message strings)"),
    sourceDocuments: z.array(z.string())
      .optional()
      .describe("UUIDs of existing documents used as references or sources for this document"),
    generationParams: z.object({
      temperature: z.number()
        .min(0)
        .max(2)
        .optional()
        .describe("Model temperature setting (0.0-2.0, lower = more focused, higher = more creative)"),
      maxTokens: z.number()
        .positive()
        .optional()
        .describe("Maximum tokens for generation"),
      topP: z.number()
        .min(0)
        .max(1)
        .optional()
        .describe("Top-p sampling value (0.0-1.0, nucleus sampling parameter)"),
    })
    .optional()
    .describe("Optional generation parameters used by the AI model"),
  }).describe("Required metadata for AI-generated document attribution and tracking"),
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
    .describe("UUID of the document to update"),
  operation: z.enum(["replace", "append", "prepend"])
    .describe("Update operation: 'replace' to overwrite content, 'append' to add at end, 'prepend' to add at beginning"),
  content: z.string()
    .min(1, "Content is required")
    .describe("New content to add or replace existing content with"),
  metadata: z.object({
    tags: z.array(z.string())
      .optional()
      .describe("Updated tags for the document"),
    changeSummary: z.string()
      .optional()
      .describe("Brief summary of what changed in this update"),
    updateReason: z.string()
      .optional()
      .describe("Why this update was made (e.g., 'Added error handling', 'Updated API endpoints')"),
    changesFromPrompt: z.string()
      .optional()
      .describe("The user prompt that triggered this update"),
    model: z.object({
      name: z.string()
        .describe("AI model name performing the update"),
      provider: z.string()
        .describe("Model provider (e.g., 'anthropic', 'openai')"),
      version: z.string()
        .optional()
        .describe("Optional model version"),
    }).describe("AI model information for update attribution"),
  })
  .optional()
  .describe("Optional metadata about the update and model attribution"),
}).describe("Update or append to an existing AI-generated document with version tracking");
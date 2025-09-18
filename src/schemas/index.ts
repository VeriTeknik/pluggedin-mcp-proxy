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
  title: z.string().min(1).max(255),
  content: z.string().min(1),
  format: z.enum(["md", "txt", "json", "html"]).default("md"),
  tags: z.array(z.string()).max(20).optional(),
  category: z.enum(["report", "analysis", "documentation", "guide", "research", "code", "other"]).default("other"),
  metadata: z.object({
    model: z.object({
      name: z.string(),
      provider: z.string(),
      version: z.string().optional(),
    }),
    context: z.string().optional(),
    visibility: z.enum(["private", "workspace", "public"]).default("private"),
    prompt: z.string().optional().describe("The prompt that triggered document creation"),
    conversationContext: z.array(z.string()).optional().describe("Previous messages in the conversation"),
    sourceDocuments: z.array(z.string()).optional().describe("IDs of documents used as references"),
    generationParams: z.object({
      temperature: z.number().optional(),
      maxTokens: z.number().optional(),
      topP: z.number().optional(),
    }).optional(),
  }),
});

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
  documentId: z.string().uuid(),
  operation: z.enum(["replace", "append", "prepend"]),
  content: z.string().min(1),
  metadata: z.object({
    tags: z.array(z.string()).optional(),
    changeSummary: z.string().optional(),
    updateReason: z.string().optional().describe("Why this update was made"),
    changesFromPrompt: z.string().optional().describe("The prompt that triggered this update"),
    model: z.object({
      name: z.string(),
      provider: z.string(),
      version: z.string().optional(),
    }),
  }).optional(),
});
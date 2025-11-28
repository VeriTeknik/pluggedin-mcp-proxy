import { Tool } from "@modelcontextprotocol/sdk/types.js";
import { zodToJsonSchema } from 'zod-to-json-schema';
import {
  DiscoverToolsInputSchema,
  AskKnowledgeBaseInputSchema,
  SendNotificationInputSchema,
  ListNotificationsInputSchema,
  MarkNotificationDoneInputSchema,
  DeleteNotificationInputSchema,
  CreateDocumentInputSchema,
  ListDocumentsInputSchema,
  SearchDocumentsInputSchema,
  GetDocumentInputSchema,
  UpdateDocumentInputSchema,
  ClipboardSetInputSchema,
  ClipboardGetInputSchema,
  ClipboardDeleteInputSchema,
  ClipboardListInputSchema,
  ClipboardPushInputSchema,
  ClipboardPopInputSchema
} from '../schemas/index.js';

// Define the setup tool that works without API key
export const setupStaticTool: Tool = {
  name: "pluggedin_setup",
  description: "Get started with Plugged.in MCP - shows setup instructions and API key configuration (no API key required)",
  inputSchema: {
    type: "object",
    properties: {
      topic: {
        type: "string",
        enum: ["getting_started", "api_key", "configuration", "troubleshooting"],
        description: "Specific setup topic to learn about. Options: getting_started (default), api_key, configuration, troubleshooting",
        default: "getting_started"
      }
    }
  },
  annotations: {
    readOnlyHint: true,
    destructiveHint: false,
    idempotentHint: true
  }
};

// Define the static discovery tool structure
export const discoverToolsStaticTool: Tool = {
  name: "pluggedin_discover_tools",
  description: "Triggers discovery of tools (and resources/templates) for configured MCP servers in the Pluggedin App (partial functionality without API key).",
  inputSchema: zodToJsonSchema(DiscoverToolsInputSchema) as any,
  annotations: {
    readOnlyHint: true,
    destructiveHint: false,
    idempotentHint: false
  }
};

// Define the static tool for asking questions to the knowledge base
const askKnowledgeBaseSchema = zodToJsonSchema(AskKnowledgeBaseInputSchema) as any;
askKnowledgeBaseSchema.examples = [{
  query: "What are the main features of our product?"
}, {
  query: "How do I configure authentication?"
}];

export const askKnowledgeBaseStaticTool: Tool = {
  name: "pluggedin_ask_knowledge_base",
  description: "Ask questions and get AI-generated answers from your knowledge base. Returns structured JSON with answer, document sources, and metadata. For finding specific documents, use pluggedin_search_documents instead.",
  inputSchema: askKnowledgeBaseSchema,
  annotations: {
    readOnlyHint: true,
    destructiveHint: false,
    idempotentHint: false
  }
};

// Define the static tool for sending custom notifications
const sendNotificationSchema = zodToJsonSchema(SendNotificationInputSchema) as any;
sendNotificationSchema.examples = [{
  message: "Deployment completed successfully",
  severity: "SUCCESS"
}, {
  title: "Alert",
  message: "High CPU usage detected",
  severity: "WARNING",
  email: true
}];

export const sendNotificationStaticTool: Tool = {
  name: "pluggedin_send_notification",
  description: "Send custom notifications through the Plugged.in system with optional email delivery. You can provide a custom title or let the system use a localized default.",
  inputSchema: sendNotificationSchema,
  annotations: {
    readOnlyHint: false,
    destructiveHint: false,
    idempotentHint: false
  }
};

// Define the static tool for listing notifications
export const listNotificationsStaticTool: Tool = {
  name: "pluggedin_list_notifications",
  description: "List notifications from the Plugged.in system with optional filters for unread only and result limit",
  inputSchema: zodToJsonSchema(ListNotificationsInputSchema) as any,
  annotations: {
    readOnlyHint: true,
    destructiveHint: false,
    idempotentHint: true
  }
};

// Define the static tool for marking notifications as done
export const markNotificationDoneStaticTool: Tool = {
  name: "pluggedin_mark_notification_done",
  description: "Mark a notification as done in the Plugged.in system",
  inputSchema: zodToJsonSchema(MarkNotificationDoneInputSchema) as any,
  annotations: {
    readOnlyHint: false,
    destructiveHint: false,
    idempotentHint: true
  }
};

// Define the static tool for deleting notifications
export const deleteNotificationStaticTool: Tool = {
  name: "pluggedin_delete_notification",
  description: "Delete a notification from the Plugged.in system",
  inputSchema: zodToJsonSchema(DeleteNotificationInputSchema) as any,
  annotations: {
    readOnlyHint: false,
    destructiveHint: true,
    idempotentHint: true
  }
};

// Define the static tool for creating AI-generated documents
const createDocumentSchema = zodToJsonSchema(CreateDocumentInputSchema) as any;
// Add examples to help MCP Inspector display proper values
if (createDocumentSchema.properties?.metadata?.properties?.model) {
  createDocumentSchema.properties.metadata.properties.model.examples = [{
    name: "claude-3-opus",
    provider: "anthropic",
    version: "20240229"
  }];
}

export const createDocumentStaticTool: Tool = {
  name: "pluggedin_create_document",
  description: "Create and save AI-generated documents to the user's library in Plugged.in (requires API key)",
  inputSchema: createDocumentSchema,
  annotations: {
    readOnlyHint: false,
    destructiveHint: false,
    idempotentHint: false
  }
};

// Define the static tool for listing documents
export const listDocumentsStaticTool: Tool = {
  name: "pluggedin_list_documents",
  description: "List documents with filtering options from the user's library (requires API key)",
  inputSchema: zodToJsonSchema(ListDocumentsInputSchema) as any,
  annotations: {
    readOnlyHint: true,
    destructiveHint: false,
    idempotentHint: true
  }
};

// Define the static tool for searching documents
const searchDocumentsSchema = zodToJsonSchema(SearchDocumentsInputSchema) as any;
searchDocumentsSchema.examples = [{
  query: "API documentation",
  limit: 10
}, {
  query: "authentication guide",
  filters: {
    tags: ["tutorial", "security"],
    source: "ai_generated"
  },
  limit: 5
}];

export const searchDocumentsStaticTool: Tool = {
  name: "pluggedin_search_documents",
  description: "Search for specific documents in your library. Returns document metadata (ID, title, snippet). To retrieve full content, use pluggedin_get_document with the returned document ID.",
  inputSchema: searchDocumentsSchema,
  annotations: {
    readOnlyHint: true,
    destructiveHint: false,
    idempotentHint: true
  }
};

// Define the static tool for getting a document
const getDocumentSchema = zodToJsonSchema(GetDocumentInputSchema) as any;
getDocumentSchema.examples = [{
  documentId: "550e8400-e29b-41d4-a716-446655440000",
  includeContent: true
}, {
  documentId: "123e4567-e89b-12d3-a456-426614174000",
  includeContent: true,
  includeVersions: true
}];

export const getDocumentStaticTool: Tool = {
  name: "pluggedin_get_document",
  description: "Retrieve a specific document's full content by ID. Use this after pluggedin_search_documents to get the complete content of documents you found. Set includeContent=true to get the full text.",
  inputSchema: getDocumentSchema,
  annotations: {
    readOnlyHint: true,
    destructiveHint: false,
    idempotentHint: true
  }
};

// Define the static tool for updating a document
const updateDocumentSchema = zodToJsonSchema(UpdateDocumentInputSchema) as any;
// Add examples to help MCP Inspector display proper values
if (updateDocumentSchema.properties?.metadata?.properties?.model) {
  updateDocumentSchema.properties.metadata.properties.model.examples = [{
    name: "claude-3-opus",
    provider: "anthropic",
    version: "20240229"
  }];
}

export const updateDocumentStaticTool: Tool = {
  name: "pluggedin_update_document",
  description: "Update or append to an existing AI-generated document (requires API key)",
  inputSchema: updateDocumentSchema,
  annotations: {
    readOnlyHint: false,
    destructiveHint: false,
    idempotentHint: false
  }
};

// ===== Clipboard Tools =====

// Define the static tool for setting clipboard entries
const clipboardSetSchema = zodToJsonSchema(ClipboardSetInputSchema) as any;
clipboardSetSchema.examples = [{
  name: "customer_context",
  value: '{"name": "John Doe", "account_id": "12345"}',
  contentType: "application/json"
}, {
  idx: 0,
  value: "First pipeline step result",
  createdByTool: "data_processor"
}];

export const clipboardSetStaticTool: Tool = {
  name: "pluggedin_clipboard_set",
  description: "Set a clipboard entry by name (semantic key) or index (array-like). Named entries are upserted; indexed entries fail if index exists. Max 256KB per entry.",
  inputSchema: clipboardSetSchema,
  annotations: {
    readOnlyHint: false,
    destructiveHint: false,
    idempotentHint: false
  }
};

// Define the static tool for getting clipboard entries
const clipboardGetSchema = zodToJsonSchema(ClipboardGetInputSchema) as any;
clipboardGetSchema.examples = [{
  name: "customer_context"
}, {
  idx: 0
}, {
  limit: 10,
  offset: 0
}];

export const clipboardGetStaticTool: Tool = {
  name: "pluggedin_clipboard_get",
  description: "Get clipboard entries. Specify name or idx for a single entry, or omit both to list all entries with pagination.",
  inputSchema: clipboardGetSchema,
  annotations: {
    readOnlyHint: true,
    destructiveHint: false,
    idempotentHint: true
  }
};

// Define the static tool for deleting clipboard entries
const clipboardDeleteSchema = zodToJsonSchema(ClipboardDeleteInputSchema) as any;
clipboardDeleteSchema.examples = [{
  name: "customer_context"
}, {
  idx: 0
}, {
  clearAll: true
}];

export const clipboardDeleteStaticTool: Tool = {
  name: "pluggedin_clipboard_delete",
  description: "Delete clipboard entries by name, index, or clear all entries.",
  inputSchema: clipboardDeleteSchema,
  annotations: {
    readOnlyHint: false,
    destructiveHint: true,
    idempotentHint: true
  }
};

// Define the static tool for listing clipboard entries (metadata only)
export const clipboardListStaticTool: Tool = {
  name: "pluggedin_clipboard_list",
  description: "List all clipboard entries with metadata. Image values are truncated to first 1000 chars for preview.",
  inputSchema: zodToJsonSchema(ClipboardListInputSchema) as any,
  annotations: {
    readOnlyHint: true,
    destructiveHint: false,
    idempotentHint: true
  }
};

// Define the static tool for pushing to clipboard (auto-increment index)
const clipboardPushSchema = zodToJsonSchema(ClipboardPushInputSchema) as any;
clipboardPushSchema.examples = [{
  value: "Pipeline step 1 result",
  createdByTool: "data_processor"
}, {
  value: "iVBORw0KGgoAAAANS...",
  contentType: "image/png",
  encoding: "base64"
}];

export const clipboardPushStaticTool: Tool = {
  name: "pluggedin_clipboard_push",
  description: "Push a value to the indexed clipboard with auto-incrementing index. Useful for building ordered pipelines or stack-like operations.",
  inputSchema: clipboardPushSchema,
  annotations: {
    readOnlyHint: false,
    destructiveHint: false,
    idempotentHint: false
  }
};

// Define the static tool for popping from clipboard (LIFO)
export const clipboardPopStaticTool: Tool = {
  name: "pluggedin_clipboard_pop",
  description: "Pop the highest-indexed entry from the clipboard (LIFO behavior). Returns the entry value and removes it.",
  inputSchema: zodToJsonSchema(ClipboardPopInputSchema) as any,
  annotations: {
    readOnlyHint: false,
    destructiveHint: true,
    idempotentHint: false
  }
};

// Note: staticTools array removed - individual tools are imported directly where needed
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
  UpdateDocumentInputSchema
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
  }
};

// Define the static discovery tool structure
export const discoverToolsStaticTool: Tool = {
  name: "pluggedin_discover_tools",
  description: "Triggers discovery of tools (and resources/templates) for configured MCP servers in the Pluggedin App (partial functionality without API key).",
  inputSchema: zodToJsonSchema(DiscoverToolsInputSchema) as any,
};

// Define the static tool for asking questions to the knowledge base
export const askKnowledgeBaseStaticTool: Tool = {
  name: "pluggedin_ask_knowledge_base",
  description: "Ask questions and get AI-generated answers from your knowledge base. Returns structured JSON with answer, document sources, and metadata. For finding specific documents, use pluggedin_search_documents instead.",
  inputSchema: zodToJsonSchema(AskKnowledgeBaseInputSchema) as any,
};

// Define the static tool for sending custom notifications
export const sendNotificationStaticTool: Tool = {
  name: "pluggedin_send_notification",
  description: "Send custom notifications through the Plugged.in system with optional email delivery (requires API key).",
  inputSchema: {
    type: "object",
    properties: {
      title: {
        type: "string",
        description: "Optional notification title. If not provided, a localized default will be used. Consider generating a descriptive title based on the message content."
      },
      message: {
        type: "string",
        description: "The notification message content"
      },
      severity: {
        type: "string",
        enum: ["INFO", "SUCCESS", "WARNING", "ALERT"],
        description: "The severity level of the notification (defaults to INFO)",
        default: "INFO"
      },
      link: {
        type: "string",
        description: "Optional link for the notification"
      },
      email: {
        type: "boolean",
        description: "Whether to send an email notification (defaults to false)",
        default: false
      }
    },
    required: ["message"]
  }
};

// Define the static tool for listing notifications
export const listNotificationsStaticTool: Tool = {
  name: "pluggedin_list_notifications",
  description: "List notifications with filtering options (requires API key)",
  inputSchema: {
    type: "object",
    properties: {
      limit: {
        type: "integer",
        description: "Maximum number of notifications to return (1-100)",
        minimum: 1,
        maximum: 100,
        default: 20
      },
      unreadOnly: {
        type: "boolean",
        description: "Only return unread notifications",
        default: false
      },
      severity: {
        type: "string",
        enum: ["INFO", "SUCCESS", "WARNING", "ALERT"],
        description: "Filter by severity level"
      }
    }
  }
};

// Define the static tool for marking notifications as done
export const markNotificationDoneStaticTool: Tool = {
  name: "pluggedin_mark_notification_done",
  description: "Mark a notification as done (requires API key)",
  inputSchema: {
    type: "object",
    properties: {
      notificationId: {
        type: "string",
        description: "The ID of the notification to mark as done"
      }
    },
    required: ["notificationId"]
  }
};

// Define the static tool for deleting notifications
export const deleteNotificationStaticTool: Tool = {
  name: "pluggedin_delete_notification",
  description: "Delete a notification (requires API key)",
  inputSchema: {
    type: "object",
    properties: {
      notificationId: {
        type: "string",
        description: "The ID of the notification to delete"
      }
    },
    required: ["notificationId"]
  }
};

// Define the static tool for creating AI-generated documents
export const createDocumentStaticTool: Tool = {
  name: "pluggedin_create_document",
  description: "Create and save AI-generated documents to the user's library in Plugged.in (requires API key)",
  inputSchema: zodToJsonSchema(CreateDocumentInputSchema) as any,
};

// Define the static tool for listing documents
export const listDocumentsStaticTool: Tool = {
  name: "pluggedin_list_documents",
  description: "List documents with filtering options from the user's library (requires API key)",
  inputSchema: zodToJsonSchema(ListDocumentsInputSchema) as any,
};

// Define the static tool for searching documents
export const searchDocumentsStaticTool: Tool = {
  name: "pluggedin_search_documents",
  description: "Search for specific documents in your library. Returns document metadata (ID, title, snippet). To retrieve full content, use pluggedin_get_document with the returned document ID.",
  inputSchema: zodToJsonSchema(SearchDocumentsInputSchema) as any,
};

// Define the static tool for getting a document
export const getDocumentStaticTool: Tool = {
  name: "pluggedin_get_document",
  description: "Retrieve a specific document's full content by ID. Use this after pluggedin_search_documents to get the complete content of documents you found. Set includeContent=true to get the full text.",
  inputSchema: zodToJsonSchema(GetDocumentInputSchema) as any,
};

// Define the static tool for updating a document
export const updateDocumentStaticTool: Tool = {
  name: "pluggedin_update_document",
  description: "Update or append to an existing AI-generated document (requires API key)",
  inputSchema: zodToJsonSchema(UpdateDocumentInputSchema) as any,
};

// Export all static tools as an array for easy registration
export const staticTools: Tool[] = [
  setupStaticTool,
  discoverToolsStaticTool,
  askKnowledgeBaseStaticTool,
  sendNotificationStaticTool,
  listNotificationsStaticTool,
  markNotificationDoneStaticTool,
  deleteNotificationStaticTool,
  createDocumentStaticTool,
  listDocumentsStaticTool,
  searchDocumentsStaticTool,
  getDocumentStaticTool,
  updateDocumentStaticTool
];
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
  inputSchema: {
    type: "object",
    properties: {
      title: {
        type: "string",
        description: "Document title",
        minLength: 1,
        maxLength: 255
      },
      content: {
        type: "string",
        description: "Document content in markdown, text, json, or html format",
        minLength: 1
      },
      format: {
        type: "string",
        enum: ["md", "txt", "json", "html"],
        description: "Document format",
        default: "md"
      },
      tags: {
        type: "array",
        items: { type: "string" },
        description: "Tags for categorization",
        maxItems: 20
      },
      category: {
        type: "string",
        enum: ["report", "analysis", "documentation", "guide", "research", "code", "other"],
        description: "Document category",
        default: "other"
      },
      metadata: {
        type: "object",
        properties: {
          model: {
            type: "object",
            properties: {
              name: {
                type: "string",
                description: "Model name"
              },
              provider: {
                type: "string",
                description: "Model provider"
              },
              version: {
                type: "string",
                description: "Model version"
              }
            },
            required: ["name", "provider"]
          },
          context: {
            type: "string",
            description: "Optional context about the document creation"
          },
          visibility: {
            type: "string",
            enum: ["private", "workspace", "public"],
            description: "Document visibility",
            default: "private"
          },
          prompt: {
            type: "string",
            description: "The prompt that triggered document creation"
          },
          conversationContext: {
            type: "array",
            items: { type: "string" },
            description: "Previous messages in the conversation"
          },
          sourceDocuments: {
            type: "array",
            items: { type: "string" },
            description: "IDs of documents used as references"
          },
          generationParams: {
            type: "object",
            properties: {
              temperature: { type: "number", description: "Temperature setting" },
              maxTokens: { type: "number", description: "Maximum tokens" },
              topP: { type: "number", description: "Top P setting" }
            },
            description: "Model generation parameters"
          }
        },
        required: ["model"]
      }
    },
    required: ["title", "content", "metadata"]
  }
};

// Define the static tool for listing documents
export const listDocumentsStaticTool: Tool = {
  name: "pluggedin_list_documents",
  description: "List documents with filtering options from the user's library (requires API key)",
  inputSchema: {
    type: "object",
    properties: {
      filters: {
        type: "object",
        properties: {
          source: {
            type: "string",
            enum: ["all", "upload", "ai_generated", "api"],
            description: "Filter by document source",
            default: "all"
          },
          modelName: {
            type: "string",
            description: "Filter by AI model name"
          },
          modelProvider: {
            type: "string",
            description: "Filter by AI model provider"
          },
          dateFrom: {
            type: "string",
            format: "date-time",
            description: "Filter documents created after this date"
          },
          dateTo: {
            type: "string",
            format: "date-time",
            description: "Filter documents created before this date"
          },
          tags: {
            type: "array",
            items: { type: "string" },
            description: "Filter by tags"
          },
          category: {
            type: "string",
            enum: ["report", "analysis", "documentation", "guide", "research", "code", "other"],
            description: "Filter by category"
          },
          searchQuery: {
            type: "string",
            description: "Search in document titles and descriptions"
          }
        }
      },
      sort: {
        type: "string",
        enum: ["date_desc", "date_asc", "title", "size"],
        description: "Sort order",
        default: "date_desc"
      },
      limit: {
        type: "integer",
        minimum: 1,
        maximum: 100,
        description: "Maximum number of documents to return",
        default: 20
      },
      offset: {
        type: "integer",
        minimum: 0,
        description: "Number of documents to skip",
        default: 0
      }
    }
  }
};

// Define the static tool for searching documents
export const searchDocumentsStaticTool: Tool = {
  name: "pluggedin_search_documents",
  description: "Search for specific documents in your library. Returns document metadata (ID, title, snippet). To retrieve full content, use pluggedin_get_document with the returned document ID.",
  inputSchema: {
    type: "object",
    properties: {
      query: {
        type: "string",
        description: "Search query",
        minLength: 1,
        maxLength: 500
      },
      filters: {
        type: "object",
        properties: {
          modelName: {
            type: "string",
            description: "Filter by AI model name"
          },
          modelProvider: {
            type: "string",
            description: "Filter by AI model provider"
          },
          dateFrom: {
            type: "string",
            format: "date-time",
            description: "Filter documents created after this date"
          },
          dateTo: {
            type: "string",
            format: "date-time",
            description: "Filter documents created before this date"
          },
          tags: {
            type: "array",
            items: { type: "string" },
            description: "Filter by tags"
          },
          source: {
            type: "string",
            enum: ["all", "upload", "ai_generated", "api"],
            description: "Filter by document source",
            default: "all"
          }
        }
      },
      limit: {
        type: "integer",
        minimum: 1,
        maximum: 50,
        default: 10,
        description: "Maximum number of results (default: 10, max: 50)"
      }
    },
    required: ["query"]
  }
};

// Define the static tool for getting a document
export const getDocumentStaticTool: Tool = {
  name: "pluggedin_get_document",
  description: "Retrieve a specific document's full content by ID. Use this after pluggedin_search_documents to get the complete content of documents you found. Set includeContent=true to get the full text.",
  inputSchema: {
    type: "object",
    properties: {
      documentId: {
        type: "string",
        description: "Document UUID"
      },
      includeContent: {
        type: "boolean",
        description: "Include the full document content",
        default: false
      },
      includeVersions: {
        type: "boolean",
        description: "Include version history",
        default: false
      }
    },
    required: ["documentId"]
  }
};

// Define the static tool for updating a document
export const updateDocumentStaticTool: Tool = {
  name: "pluggedin_update_document",
  description: "Update or append to an existing AI-generated document (requires API key)",
  inputSchema: {
    type: "object",
    properties: {
      documentId: {
        type: "string",
        description: "Document UUID"
      },
      operation: {
        type: "string",
        enum: ["replace", "append", "prepend"],
        description: "Update operation type"
      },
      content: {
        type: "string",
        description: "New content"
      },
      metadata: {
        type: "object",
        properties: {
          tags: {
            type: "array",
            items: { type: "string" },
            description: "Updated tags"
          },
          changeSummary: {
            type: "string",
            description: "Summary of changes"
          },
          updateReason: {
            type: "string",
            description: "Why this update was made"
          },
          changesFromPrompt: {
            type: "string",
            description: "The prompt that triggered this update"
          },
          model: {
            type: "object",
            properties: {
              name: {
                type: "string",
                description: "Model name"
              },
              provider: {
                type: "string",
                description: "Model provider"
              },
              version: {
                type: "string",
                description: "Model version"
              }
            },
            required: ["name", "provider"]
          }
        }
      }
    },
    required: ["documentId", "operation", "content"]
  }
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
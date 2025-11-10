/**
 * Resource registry and definitions
 */

import { SETUP_MARKDOWN } from './templates.js';

export interface ResourceDef {
  uri: string;
  mimeType: string;
  name: string;
  description: string;
  requiresAuth: boolean;
  getContent: () => string;
}

export const RESOURCE_REGISTRY: ResourceDef[] = [
  {
    uri: 'pluggedin://setup',
    mimeType: 'text/markdown',
    name: 'Plugged.in Setup Guide',
    description: 'Getting started with Plugged.in MCP - setup instructions and API key configuration',
    requiresAuth: false,
    getContent: () => SETUP_MARKDOWN,
  },
  {
    uri: 'pluggedin://documents',
    mimeType: 'application/json',
    name: 'Document Library',
    description: 'Access to your Plugged.in document library with RAG capabilities',
    requiresAuth: true,
    getContent: () =>
      JSON.stringify(
        {
          message: 'Use pluggedin_list_documents or pluggedin_search_documents tools to access your document library',
          available_tools: [
            'pluggedin_list_documents',
            'pluggedin_search_documents',
            'pluggedin_get_document',
            'pluggedin_create_document',
            'pluggedin_update_document',
          ],
        },
        null,
        2
      ),
  },
  {
    uri: 'pluggedin://notifications',
    mimeType: 'application/json',
    name: 'Notifications',
    description: 'Your Plugged.in notifications and activity feed',
    requiresAuth: true,
    getContent: () =>
      JSON.stringify(
        {
          message: 'Use notification tools to access your activity feed',
          available_tools: [
            'pluggedin_list_notifications',
            'pluggedin_send_notification',
            'pluggedin_mark_notification_done',
            'pluggedin_delete_notification',
          ],
        },
        null,
        2
      ),
  },
  {
    uri: 'pluggedin://mcp-servers',
    mimeType: 'application/json',
    name: 'MCP Servers',
    description: 'Your configured MCP servers and their capabilities',
    requiresAuth: true,
    getContent: () =>
      JSON.stringify(
        {
          message: 'Use pluggedin_discover_tools to discover available MCP servers and their capabilities',
          available_tools: ['pluggedin_discover_tools'],
        },
        null,
        2
      ),
  },
];

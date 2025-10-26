# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [1.10.5] - 2025-01-25

### Fixed
- **Critical: Fixed "stream is not readable" error in Streamable HTTP transport** (Fixes #32)
  - Added `req.body` parameter to `transport.handleRequest()` calls
  - Properly handles Express JSON middleware body parsing
  - Resolves HTTP 400 parse errors when clients connect via Streamable HTTP
- **MCP Best Practices: Graceful degradation for discovery methods**
  - `list_prompts` returns static prompts when API key not configured
  - `list_resources` returns empty array when API key not configured
  - `list_resource_templates` returns empty array when API key not configured
  - `list_tools` already supported graceful degradation (unchanged)
  - Follows MCP specification for discovery without authentication

### Added
- New `inspector:http` npm script for testing Streamable HTTP transport with Inspector
- Automated script to launch server + inspector for HTTP transport testing

### Changed
- Discovery methods no longer throw errors when API credentials are missing
- Improved user experience for clients without API configuration

## [1.10.3] - 2025-01-18

### Added
- **Enhanced RAG Tool with Metadata Support**
  - Optional `includeMetadata` parameter for `pluggedin_ask_knowledge_base` tool
  - Returns document sources and IDs when metadata requested
  - Formatted response with source attribution
  - Maintains backward compatibility with plain text responses

### Changed
- Updated ask knowledge base handler to format sources when available
- Enhanced schema with optional metadata parameter

### Fixed
- Improved error handling for RAG queries
- Better formatting of source documents in responses

## [1.4.0] - 2025-01-26

### Added
- **OAuth Token Management**: Seamless OAuth authentication handling for Streamable HTTP MCP servers
  - Automatic token retrieval from plugged.in App v2.7.0
  - Secure token storage and refresh mechanisms
  - No client-side authentication needed anymore
- **Enhanced Notification System**: Bidirectional notification support
  - Send notifications to plugged.in App
  - Receive notifications from MCP servers
  - Mark notifications as read/unread
  - Delete notifications programmatically
- **Trending Analytics**: Real-time activity tracking
  - Every tool call is logged and tracked
  - Contributes to trending server calculations in plugged.in App
  - Usage metrics and popularity insights
- **Registry Integration**: Full support for Registry v2 features
  - Automatic server discovery from registry
  - Installation tracking and metrics
  - Community server support

### Changed
- Updated integration with plugged.in App v2.7.0 Registry v2 features
- Enhanced security with OAuth token management
- Improved notification system architecture

### Performance
- Optimized OAuth token handling for better performance
- Enhanced notification delivery mechanisms
- Improved registry integration efficiency

## [1.3.2] - 2025-01-26

### Fixed
- **Critical Session Management Bug for Prompts**
  - Fixed "Session could not be established" error when using prompts from MCP Inspector
  - Prompt handler now uses fresh server configuration from `getMcpServers()` like tools do
  - Resolved issue where prompt resolution used stale/incomplete server parameters from resolve API
  - Ensures consistent session key generation between tools and prompts
  - Tools and prompts now use identical session establishment flow

### Changed
- Simplified prompt resolution to only fetch server UUID from resolve API
- Unified session establishment logic across all MCP capabilities (tools, prompts, resources)

## [1.3.1] - 2025-01-03

### Changed
- Updated to support package management integration from pluggedin-app
- Enhanced logging for package installation debugging

## [1.3.0] - 2025-01-26

### Added
- **Smart Discovery Tool Caching**
  - Instant tool discovery responses with intelligent cache-first approach
  - Background refresh mechanism for cache updates
  - Memory-efficient caching with automatic cleanup
  - Force refresh capability for explicit cache invalidation
- **Enhanced Security for Client Deployment**
  - Lightweight security utils optimized for client-side deployment
  - Removed port blocking for legitimate MCP server ports (3306, 5432, etc.)
  - Simplified SSRF protection focused on cloud metadata endpoints
  - Client-appropriate rate limiting with reduced overhead

### Changed
- **Discovery Tool Performance**
  - Discovery tool now provides instant responses from cache
  - Background discovery processes update cache without blocking responses
  - Reduced memory footprint for Docker container deployments
  - Optimized for client-side and lightweight proxy scenarios
- **Security Model Refinement**
  - Adapted security measures for client deployment context
  - Removed heavyweight server-side security features
  - Maintained essential protections while reducing complexity
  - Increased request size limits appropriate for MCP usage (50MB)

### Fixed
- Removed blocking of legitimate database ports for local MCP servers
- Fixed TypeScript linter errors in security utilities
- Eliminated over-engineered server-side security features
- Improved error handling for client deployment scenarios

### Performance
- **Instant discovery responses** through smart caching
- **Reduced memory usage** for containerized deployments
- **Lightweight architecture** suitable for client-side proxy usage
- **Fast startup times** with minimal resource requirements

### Breaking Changes
- Discovery tool behavior changed to cache-first approach
- Some security validations relaxed for client deployment compatibility

## [1.2.6] - 2025-01-26

### Added
- Enhanced notification tool with optional title parameter support
- Improved send notification tool schema with better documentation

### Changed
- Updated API base URL logic in utils.ts for better flexibility
- Enhanced debug logging utilities throughout the codebase
- Improved API handling and error messages

### Fixed
- Version consistency in package.json

## [1.2.5] - 2025-01-25

### Changed
- Updated dependency management documentation from pnpm to npm
- Improved README with npm-based commands for inspector scripts

## [1.2.4] - 2025-01-25

### Fixed
- Fixed Smithery tool discovery by removing default API base URL fallback
- Moved rate limiting to only apply after authentication check
- Static tools are now immediately available without API key for Smithery compatibility
- Resolved "Request timed out" error during Smithery tool scanning

### Changed
- API base URL now returns undefined if not explicitly configured
- Tool listing prioritizes static tools for unauthenticated requests
- Smithery configuration updated to use stdio transport instead of streamable-http
- Added PLUGGEDIN_API_BASE_URL to Smithery config schema

## [1.2.3] - 2025-01-25

### Changed
- Complete removal of pnpm dependencies and references
- Updated all documentation to use npm commands
- Cleaned up .dockerignore file

### Removed
- Removed pnpm-lock.yaml file
- Removed pnpm references from documentation

## [1.2.2] - 2025-01-25

### Changed
- Switched from pnpm to npm for dependency management
- Updated Dockerfile to use `npm ci` instead of `pnpm install`
- Updated .dockerignore to exclude pnpm-lock.yaml and include package-lock.json

### Fixed
- Resolved "pnpm-lock.yaml is not up to date" error during Docker builds
- Fixed dependency version mismatches in lockfile

## [1.2.1] - 2025-01-25

### Fixed
- Removed smithery.yaml from .dockerignore to fix Docker build issues on Smithery platform
- Resolved "smithery.yaml not found" error during Docker image creation

## [1.2.0] - 2025-01-25

### Added
- **Enhanced Security Validations**
  - Comprehensive URL validation with SSRF protection blocking private IPs and dangerous ports
  - Command allowlisting for STDIO servers (node, npx, python, python3, uv, uvx, uvenv)
  - Header validation and sanitization for Streamable HTTP connections
  - Protection against header injection attacks with RFC 7230 compliance
- **Lazy Authentication Support**
  - Tool discovery without API keys for better Smithery compatibility
  - Authentication only required for actual tool/resource invocations
  - Improved compatibility with MCP clients that expect unauthenticated discovery
- **Production Optimizations**
  - Multi-stage Docker builds for minimal container footprint
  - Excluded test files and dev dependencies from production images
  - Optimized for resource-constrained environments

### Changed
- Improved session management and cleanup in Streamable HTTP mode
- Better error handling for transport lifecycle events
- Enhanced TypeScript types for security validators
- Updated documentation with comprehensive security best practices
- Refined Smithery configuration for HTTP transport mode

### Fixed
- Memory management issues in long-running sessions
- Proper cleanup of transports on error conditions
- Session handling edge cases in stateless mode
- Smithery YAML configuration for proper HTTP transport

### Security
- Added comprehensive input validation for all user-provided data
- Implemented SSRF protection for URL-based connections
- Added header injection prevention with size limits
- Command injection protection through strict allowlisting

## [1.1.0] - 2025-01-21

### Added
- **Streamable HTTP Transport Support**: The proxy can now connect to downstream MCP servers that use the Streamable HTTP transport protocol
- **HTTP Server Mode**: The proxy itself can run as an HTTP server instead of STDIO, enabling:
  - Web-based access from browsers and HTTP clients
  - Remote connections over the network
  - Stateless mode for scalable deployments
  - Session-based stateful mode for efficient multi-request operations
- **Authentication for HTTP Mode**: Optional Bearer token authentication for Streamable HTTP endpoints
- **Health Check Endpoint**: `/health` endpoint for monitoring when running in HTTP mode
- **CORS Support**: Built-in CORS headers for browser compatibility
- **Session Management**: Session-based connection management with `mcp-session-id` header

### Changed
- Updated `@modelcontextprotocol/sdk` from ^1.5.0 to ^1.13.0
- Enhanced server type support to include STREAMABLE_HTTP in addition to STDIO and SSE
- Improved TypeScript types for server parameters

### Technical Details
- Added Express.js (v5.1.0) for HTTP server functionality
- New CLI options: `--transport`, `--port`, `--stateless`, `--require-api-auth`
- Default HTTP port: 12006
- Supports both stateless (new transport per request) and stateful (session-based) modes

## [1.0.0] - 2025-01-01

### Major Features
- **Real-Time Notification System**: Track all MCP activities with comprehensive notification support
- **RAG Integration**: Support for document-enhanced queries through the plugged.in App
- **Inspector Scripts**: New automated testing tools for debugging and development
- **Health Monitoring**: Built-in ping endpoint for connection monitoring

### Security Enhancements
- **Input Validation**: Industry-standard validation and sanitization for all inputs
- **URL Security**: Enhanced URL validation with SSRF protection
- **Environment Security**: Secure parsing of environment variables with dotenv
- **Error Sanitization**: Prevents information disclosure in error responses

### Bug Fixes
- Fixed JSON-RPC protocol interference (stdout vs stderr separation)
- Resolved localhost URL validation for development environments
- Fixed API key handling in inspector scripts
- Improved connection stability and memory management

### Developer Tools
- New inspector scripts for automated testing
- Improved error messages and debugging capabilities
- Structured logging with proper stderr usage
- Enhanced TypeScript type safety

## [0.5.12] - 2024-12-15

### Changed
- Initial public release
- Core proxy functionality for aggregating MCP servers
- Support for STDIO and SSE transports
- Integration with plugged.in App
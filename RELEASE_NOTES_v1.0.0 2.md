# Release Notes - v1.0.0

Released: June 19, 2025

## 🎉 Overview

We're excited to announce the release of plugged.in MCP Proxy v1.0.0! This major update brings significant enhancements including notification support, RAG integration capabilities, enhanced security measures, and improved debugging tools.

## ✨ New Features

### 🔔 MCP Activity Notifications
- **Real-time Activity Logging**: Track all MCP operations (tool calls, resource reads, prompt executions)
- **Notification Integration**: Send activity logs to plugged.in App for centralized monitoring
- **Configurable Logging**: Control notification behavior through API configuration
- **Performance Monitoring**: Track response times and success rates

### 📚 RAG Query Support
- **Document Context Integration**: Support for RAG-enhanced queries through plugged.in App
- **System Prompt Enhancement**: Automatically inject document context into system prompts
- **Seamless Integration**: Works transparently with all MCP clients

### 🔧 Inspector Scripts
- **Automated Testing**: New inspector scripts for testing MCP proxy functionality
- **Simple & Advanced Modes**: Choose between quick tests or comprehensive capability checks
- **Environment Detection**: Automatically detect and use appropriate API settings
- **Cross-Platform Support**: Shell script for Unix-like systems, JavaScript for Node.js environments

### 📡 Ping Support
- **Health Checks**: Built-in ping endpoint for monitoring proxy health
- **Keep-Alive**: Prevents timeout issues with long-running connections
- **Status Reporting**: Returns proxy version and connection status

## 🔒 Security Enhancements

### Input Validation & Sanitization
- **URL Validation**: Enhanced URL validation to prevent SSRF attacks
- **API Key Security**: Improved API key handling and validation
- **Environment Variable Safety**: Secure parsing of environment variables
- **Request Sanitization**: All incoming requests are validated and sanitized

### Security Utilities
- **Dedicated Security Module**: New `security-utils.ts` for centralized security functions
- **Rate Limiting Ready**: Infrastructure for rate limiting (implementation pending)
- **Audit Logging**: Enhanced logging for security monitoring
- **Error Message Sanitization**: Prevent information disclosure in error responses

## 🎨 Improvements

### Better Error Handling
- **Graceful Degradation**: Continue operation even if some servers fail
- **Detailed Error Messages**: More informative error responses for debugging
- **Retry Logic**: Automatic retry for transient failures
- **Timeout Management**: Configurable timeouts for all operations

### Performance Optimizations
- **Concurrent Operations**: Parallel processing of multiple server requests
- **Caching Improvements**: Better caching of server capabilities
- **Reduced Memory Usage**: Optimized data structures for large deployments
- **Faster Startup**: Streamlined initialization process

### Developer Experience
- **Enhanced Logging**: Structured logging with proper stderr usage
- **Debug Mode**: Verbose logging for troubleshooting
- **TypeScript Improvements**: Better type safety and code organization
- **Documentation Updates**: Comprehensive README and inline documentation

## 🐛 Bug Fixes

- **Fixed stdout Interference**: All logging now uses stderr to prevent JSON-RPC protocol issues
- **Localhost URL Validation**: Allow localhost URLs for development environments
- **API Key Handling**: Fixed sanitization breaking valid API keys
- **Environment Variable Loading**: Proper handling of quotes and special characters
- **Connection Stability**: Resolved WebSocket connection drops
- **Memory Leaks**: Fixed memory leaks in long-running sessions

## 🔄 API Changes

### New Features
- `notification_capability` in server configurations
- Support for `system_prompt` in RAG queries
- Enhanced error response format with structured details

### Internal Changes
- Modularized codebase with separate security and notification modules
- Improved TypeScript interfaces for better type safety
- Enhanced client connection handling

## 🔧 Technical Details

### Dependencies
- Updated `@modelcontextprotocol/sdk` for latest MCP support
- Added security and validation utilities
- Enhanced error handling libraries

### Breaking Changes
None - This is the first stable release

## 📦 Installation & Upgrade

### New Installation
```bash
npx -y @pluggedin/mcp-proxy@latest --pluggedin-api-key YOUR_API_KEY
```

### Upgrading from Previous Versions
Simply update your configuration to use the latest version:
```json
{
  "mcpServers": {
    "pluggedin": {
      "command": "npx",
      "args": ["-y", "@pluggedin/mcp-proxy@1.0.0"],
      "env": {
        "PLUGGEDIN_API_KEY": "YOUR_API_KEY"
      }
    }
  }
}
```

## 🚀 What's Next

- Rate limiting implementation
- Enhanced caching strategies
- WebSocket connection pooling
- Advanced monitoring and analytics

## 🙏 Acknowledgments

Special thanks to all contributors and users who provided feedback and bug reports. This release wouldn't have been possible without your support.

## 📚 Documentation

- [Security Guidelines](./SECURITY.md)
- [Inspector Scripts Documentation](./scripts/README.md)
- [MCP Activity Notifications](./docs/mcp-activity-notifications.md)

## 🔗 Related Updates

- **pluggedin-app v2.1.0**: Updated web app with notification center and RAG support
- See [App Release Notes](https://github.com/VeriTeknik/pluggedin-app/releases/tag/v2.1.0)

---

For questions or issues, please visit our [GitHub Issues](https://github.com/VeriTeknik/pluggedin-mcp/issues) page.
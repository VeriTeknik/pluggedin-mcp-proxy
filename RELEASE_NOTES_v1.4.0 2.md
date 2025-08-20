# Release Notes: v1.4.0 - Registry v2 Support & Enhanced OAuth Integration

## 🎉 Overview

We're excited to announce the release of plugged.in MCP Proxy v1.4.0! This release brings full support for the Registry v2 features from plugged.in App v2.7.0, including OAuth token management, bidirectional notifications, and trending analytics.

## 🚀 Major Features

### 1. OAuth Token Management
- **Seamless Authentication**: OAuth tokens are now automatically retrieved from plugged.in App v2.7.0
- **No Client-Side Auth**: No need for client-side authentication setup - all handled by the proxy
- **Secure Token Storage**: Tokens are securely stored and refreshed automatically
- **State-of-the-Art Encryption**: All OAuth tokens protected with AES-256-GCM encryption
- **Multiple Provider Support**: Works with GitHub, Linear, and custom OAuth providers

### 2. Enhanced Notification System
- **Bidirectional Support**: Send and receive notifications seamlessly
- **Send Notifications**: Push notifications to plugged.in App from MCP servers
- **Receive Notifications**: Get notifications from the app in real-time
- **Mark as Read/Unread**: Programmatically manage notification status
- **Delete Notifications**: Remove notifications through the proxy
- **Email Integration**: Optional email delivery for important notifications

### 3. Trending Analytics
- **Real-time Activity Tracking**: Every tool call is logged and tracked
- **Trending Calculations**: Contributes to trending server calculations in plugged.in App
- **Usage Metrics**: Detailed usage statistics and popularity insights
- **Community Insights**: Discover what tools and servers are popular
- **Installation Tracking**: Monitor server installations and usage patterns

### 4. Registry Integration
- **Full Registry v2 Support**: Complete integration with the new registry features
- **Automatic Discovery**: Servers are automatically discovered from the registry
- **Installation Tracking**: Track server installations and metrics
- **Community Server Support**: Access to community-contributed servers
- **Server Claiming**: Support for server ownership verification

## 🔧 Technical Improvements

### OAuth Integration
- Automatic token retrieval from plugged.in App APIs
- Secure token storage with refresh mechanisms
- Error handling for token expiration and refresh failures
- Support for multiple OAuth providers simultaneously

### Notification Architecture
- Bidirectional notification flow
- Real-time notification delivery
- Notification state management
- Email integration for critical notifications

### Analytics & Tracking
- Tool call logging for trending calculations
- Usage metrics collection
- Performance monitoring
- Community engagement tracking

## 📊 Compatibility

### plugged.in App Integration
This release is designed to work seamlessly with plugged.in App v2.7.0 and its Registry v2 features:
- OAuth token management
- Trending server calculations
- Bidirectional notifications
- Registry integration

### MCP Client Support
Fully compatible with all MCP clients:
- Claude Desktop
- Cline
- Cursor
- Any MCP-compatible client

## 🔄 Migration Guide

### Upgrading from v1.3.x

1. **Update the package**:
   ```bash
   npx -y @pluggedin/mcp-proxy@1.4.0 --pluggedin-api-key YOUR_API_KEY
   ```

2. **Update your Claude Desktop configuration**:
   ```json
   {
     "mcpServers": {
       "pluggedin": {
         "command": "npx",
         "args": ["-y", "@pluggedin/mcp-proxy@1.4.0"],
         "env": {
           "PLUGGEDIN_API_KEY": "YOUR_API_KEY"
         }
       }
     }
   }
   ```

3. **No configuration changes needed**: OAuth and notifications work automatically!

### New Features Available Immediately
- OAuth authentication for Streamable HTTP servers
- Enhanced notification system
- Trending analytics tracking
- Registry integration

## 🆕 New Tools & Capabilities

### Enhanced Built-in Tools
- **`pluggedin_send_notification`**: Now supports bidirectional notifications
- **`pluggedin_discover_tools`**: Enhanced with registry integration
- **`pluggedin_rag_query`**: Improved with trending data

### OAuth-Enabled Servers
- Automatic OAuth token management for compatible servers
- No manual token configuration required
- Seamless authentication flow

## 🔐 Security Enhancements

### OAuth Security
- Secure token storage with encryption
- Automatic token refresh mechanisms
- Protection against token exposure
- Secure communication with OAuth providers

### Notification Security
- Validated notification payloads
- Secure notification delivery
- Protection against notification spam
- Authenticated notification sources

## 📈 Performance Improvements

### OAuth Performance
- Optimized token retrieval and storage
- Efficient refresh mechanisms
- Reduced authentication overhead
- Better error handling

### Notification Performance
- Fast notification delivery
- Efficient bidirectional communication
- Optimized message queuing
- Reduced latency

### Analytics Performance
- Efficient activity tracking
- Optimized data collection
- Minimal performance impact
- Real-time processing

## 🐛 Bug Fixes

- Improved OAuth token handling edge cases
- Enhanced notification delivery reliability
- Better error handling for registry integration
- Fixed compatibility issues with various MCP clients

## 🌟 What's Next

We're already working on exciting features for future releases:
- Advanced analytics dashboard
- Custom notification templates
- Enhanced OAuth provider support
- Improved caching mechanisms

## 🙏 Get Involved

If you find the plugged.in MCP Proxy useful:
- ⭐ Star our repository on [GitHub](https://github.com/VeriTeknik/pluggedin-mcp)
- 🐛 Report issues or suggest features
- 🤝 Contribute to the project
- 📢 Share with the MCP community

## 📝 Links & Resources

- [plugged.in App v2.7.0 Release](https://github.com/VeriTeknik/pluggedin-app/releases/tag/v2.7.0)
- [MCP Specification](https://modelcontextprotocol.io/)
- [Claude Desktop Documentation](https://docs.anthropic.com/claude/docs/claude-desktop)
- [Project GitHub Repository](https://github.com/VeriTeknik/pluggedin-mcp)

---

Thank you for being part of the plugged.in ecosystem! This release represents a significant step forward in making MCP servers more accessible and powerful for developers worldwide.

For detailed technical information, see the [CHANGELOG.md](./CHANGELOG.md) and [README.md](./README.md).
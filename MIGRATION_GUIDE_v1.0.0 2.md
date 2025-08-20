# Migration Guide: Pre-release to v1.0.0

This guide helps you upgrade your plugged.in MCP Proxy from pre-release versions to the stable v1.0.0.

## Overview

Version 1.0.0 is our first stable release, bringing together all the features developed during the pre-release phase with enhanced security, notifications, and developer tools.

## What's New in v1.0.0

- **Notification Support**: Real-time activity tracking
- **RAG Integration**: Document context in AI interactions
- **Enhanced Security**: Improved validation and sanitization
- **Developer Tools**: New inspector scripts for testing
- **Better Debugging**: Structured logging and error messages

## Upgrade Steps

### 1. Update Your Configuration

#### Claude Desktop / Cline

Update your MCP server configuration to use v1.0.0:

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

#### Cursor / Command Line

```bash
npx -y @pluggedin/mcp-proxy@1.0.0 --pluggedin-api-key YOUR_API_KEY
```

### 2. Restart Your MCP Client

After updating the configuration:
- **Claude Desktop**: Restart the application
- **Cline**: Reload the VS Code window
- **Cursor**: Restart Cursor

### 3. Verify the Upgrade

1. Check that the proxy connects successfully
2. Test existing tools and resources
3. Verify new features in the plugged.in App:
   - Check notification center for MCP activities
   - Test RAG queries if you have documents uploaded

## New Features to Explore

### Notifications

Once upgraded, all MCP activities will be logged to the plugged.in App:
1. Navigate to the Notifications page in plugged.in App
2. See real-time updates for tool calls, resource reads, and prompts
3. Configure notification preferences in your profile settings

### RAG Support

If you're using the document library feature:
1. Upload documents through the plugged.in App
2. Enable RAG in the playground settings
3. Your MCP interactions will automatically include document context

### Inspector Scripts

Test your setup with the new inspector tools:

```bash
# Clone the repository
git clone https://github.com/VeriTeknik/pluggedin-mcp.git
cd pluggedin-mcp

# Install dependencies
npm install

# Run the inspector
npm run inspector
```

## Configuration Options

### Environment Variables (Optional)

No new environment variables are required. Existing configurations remain valid:

```bash
PLUGGEDIN_API_KEY=your_api_key
PLUGGEDIN_API_BASE_URL=https://plugged.in  # or your self-hosted URL
```

### Feature Flags

New features are automatically enabled. No configuration needed unless you want to customize behavior through the plugged.in App settings.

## Troubleshooting

### Issue: Notifications not appearing

**Solution**: Ensure your profile has the notification capability enabled:
1. Go to plugged.in App Settings
2. Check your profile capabilities
3. Enable "Notifications" if not already enabled

### Issue: Connection errors after upgrade

**Solution**: Clear any cached versions:
```bash
# Clear npx cache
npx clear-npx-cache
rm -rf ~/.npm/_npx

# Try again with explicit version
npx @pluggedin/mcp-proxy@1.0.0 --pluggedin-api-key YOUR_API_KEY
```

### Issue: Old version still running

**Solution**: Ensure you've updated all configuration files:
1. Check Claude Desktop config at:
   - macOS: `~/Library/Application Support/Claude/claude_desktop_config.json`
   - Windows: `%APPDATA%\Claude\claude_desktop_config.json`
2. Restart the application completely

## Rollback Procedure

If you need to rollback to a previous version:

1. Update your configuration to use a specific pre-release version:
```json
{
  "mcpServers": {
    "pluggedin": {
      "command": "npx",
      "args": ["-y", "@pluggedin/mcp-proxy@0.5.10"],
      "env": {
        "PLUGGEDIN_API_KEY": "YOUR_API_KEY"
      }
    }
  }
}
```

2. Restart your MCP client

Note: You'll lose access to the new features introduced in v1.0.0.

## Performance Considerations

Version 1.0.0 includes performance improvements:
- Faster startup time
- Reduced memory usage
- Better handling of concurrent requests

No action required - these improvements are automatic.

## Security Notes

This version includes security enhancements that are transparent to users:
- Improved input validation
- Better error handling
- Enhanced logging for debugging

These changes improve security without affecting normal usage.

## Need Help?

- 📖 [Documentation](https://github.com/VeriTeknik/pluggedin-mcp)
- 🐛 [Report Issues](https://github.com/VeriTeknik/pluggedin-mcp/issues)
- 💬 [Community Support](https://github.com/VeriTeknik/pluggedin-mcp/discussions)

---

Thank you for using plugged.in MCP Proxy!
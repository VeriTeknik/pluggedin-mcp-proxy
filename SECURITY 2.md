# Security Improvements for PluggedinMCP

This document outlines the security improvements implemented to address vulnerabilities identified in PR #13.

## 1. Command Injection Prevention

### Vulnerable Areas Fixed:
- **inspector-auto.js** and **inspector-simple.js**: Replaced `exec()` with `execFile()` to prevent command injection
- **client.ts**: Added command validation and argument sanitization before passing to `StdioClientTransport`

### Implemented Controls:
- Command validation: Only allows alphanumeric characters, hyphens, underscores, dots, and forward slashes
- Argument sanitization: Removes shell metacharacters (`;`, `&`, `|`, `` ` ``, `$`, `(`, `)`, `<`, `>`, `\`)
- Uses `execFile()` instead of `exec()` for browser launching

## 2. Environment Variable Security

### Vulnerable Areas Fixed:
- **inspector scripts**: Replaced manual .env parsing with secure parser
- **index.ts**: Added validation for command-line arguments before setting environment variables
- **utils.ts**: Added validation for environment variable names and values

### Implemented Controls:
- Proper .env file parsing that handles quotes and edge cases
- Environment variable name validation (alphanumeric + underscore only)
- Value sanitization to remove null bytes and newlines
- Validation of API keys and URLs before use

## 3. Token and Authentication Security

### Vulnerable Areas Fixed:
- **inspector-auto.js**: Strengthened token regex pattern
- **utils.ts**: Added bearer token validation

### Implemented Controls:
- Token regex now requires 32-64 hex characters (case-insensitive)
- Bearer token validation: 32-256 characters of alphanumeric, hyphen, underscore, or dot
- API key format validation before use

## 4. Additional Security Enhancements

### Input Validation
- URL validation to prevent SSRF attacks (blocks localhost and private IPs)
- Command and argument allowlisting for spawned processes
- Sanitization of all user inputs

### Error Handling
- Sanitized error messages to prevent information disclosure
- Only HTTP status codes exposed in error responses
- Full errors logged internally for debugging

### Rate Limiting
- Tool calls: 60 requests per minute
- API calls: 100 requests per minute
- Prevents DoS attacks

### New Security Utility Module
Created `security-utils.ts` with:
- Token validation functions
- URL validation with SSRF protection
- Command argument sanitization
- Environment variable validation
- Rate limiting implementation
- Error message sanitization

## Usage

All security features are automatically applied. No configuration changes needed.

### For Developers:
1. Use `validateBearerToken()` for any new token inputs
2. Use `validateUrl()` for any URL inputs
3. Use `sanitizeCommandArgs()` for any command arguments
4. Use `sanitizeErrorMessage()` for error responses
5. Apply rate limiters to new endpoints

## Testing Security

To verify the security improvements:

1. **Command Injection Test**:
   ```bash
   # Should fail - command injection attempt
   PLUGGEDIN_API_KEY='test; rm -rf /' npm run inspector
   ```

2. **Token Validation Test**:
   ```bash
   # Should fail - invalid token format
   PLUGGEDIN_API_KEY='short' npm run inspector
   ```

3. **URL Validation Test**:
   ```bash
   # Should fail - localhost URL
   PLUGGEDIN_API_BASE_URL='http://localhost:8080' npm run inspector
   ```

## Security Best Practices

1. Never disable input validation
2. Always use the security utility functions for new features
3. Log security events for monitoring
4. Keep dependencies updated
5. Review all user inputs before processing
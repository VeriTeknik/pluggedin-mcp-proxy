# Monitoring and Observability Guide

## Overview

This guide provides comprehensive monitoring and observability recommendations for the plugged.in MCP Proxy Server in production environments.

## Table of Contents

- [Metrics to Monitor](#metrics-to-monitor)
- [Logging Best Practices](#logging-best-practices)
- [Health Checks](#health-checks)
- [Alerting Recommendations](#alerting-recommendations)
- [Performance Monitoring](#performance-monitoring)
- [Integration Examples](#integration-examples)

## Metrics to Monitor

### Core Application Metrics

#### Request Metrics
- **Total Requests**: Count of all incoming MCP requests
- **Request Rate**: Requests per second/minute
- **Request Latency**: P50, P95, P99 response times
- **Error Rate**: Percentage of failed requests
- **Status Codes**: Distribution of HTTP status codes (for HTTP transport)

#### Tool Execution Metrics
- **Tool Call Count**: Number of tool invocations per tool
- **Tool Success Rate**: Percentage of successful tool calls
- **Tool Execution Time**: Average and percentile execution times
- **Discovery Cache Hits**: Efficiency of the discovery caching system
- **RAG Query Performance**: Query latency and result quality metrics

#### Resource Utilization
- **CPU Usage**: Percentage utilization over time
- **Memory Usage**: Heap size, RSS, and garbage collection metrics
- **Event Loop Lag**: Node.js event loop delay
- **Active Connections**: Number of concurrent MCP connections
- **Session Count**: Active sessions (for HTTP transport)

### External Integration Metrics

#### Downstream MCP Servers
- **Server Availability**: Health status of connected MCP servers
- **Server Response Time**: Latency to downstream servers
- **Server Error Rate**: Errors from downstream servers
- **Connection Pool**: Active/idle connections per server

#### plugged.in App API
- **API Call Rate**: Requests to plugged.in APIs
- **API Response Time**: Latency for API calls
- **API Error Rate**: Failed API requests
- **Token Refresh Events**: OAuth token refresh attempts

## Logging Best Practices

### Log Levels

Use appropriate log levels for different scenarios:

```typescript
// ERROR: System failures requiring immediate attention
logger.error('Failed to connect to downstream MCP server', {
  server: serverName,
  error: error.message,
  stack: error.stack
});

// WARN: Degraded performance or recoverable errors
logger.warn('Discovery cache miss, triggering background refresh', {
  serverUuid: uuid,
  cacheAge: ageMs
});

// INFO: Important state changes and business events
logger.info('Tool called successfully', {
  toolName: tool,
  duration: durationMs,
  userId: userId
});

// DEBUG: Detailed troubleshooting information
logger.debug('Processing MCP request', {
  method: request.method,
  params: request.params
});
```

### Structured Logging Format

Use JSON structured logging for easier parsing:

```json
{
  "timestamp": "2025-11-04T04:18:00.000Z",
  "level": "info",
  "message": "Tool execution completed",
  "context": {
    "toolName": "pluggedin_rag_query",
    "duration": 245,
    "success": true,
    "userId": "user-123",
    "sessionId": "sess-456"
  },
  "service": "pluggedin-mcp-proxy",
  "version": "1.9.0"
}
```

### Log Aggregation

Recommended log aggregation tools:
- **ELK Stack** (Elasticsearch, Logstash, Kibana)
- **Grafana Loki**
- **Datadog**
- **CloudWatch Logs** (AWS)
- **Google Cloud Logging** (GCP)

## Health Checks

### Endpoint Configuration

Implement comprehensive health checks:

```typescript
// Basic liveness probe
GET /health
Response: { "status": "ok", "uptime": 12345 }

// Detailed readiness probe
GET /health/ready
Response: {
  "status": "ready",
  "checks": {
    "api": { "status": "ok", "latency": 45 },
    "downstreamServers": { "status": "ok", "count": 5 },
    "cache": { "status": "ok", "hitRate": 0.85 }
  }
}
```

### Kubernetes Probes Example

```yaml
apiVersion: v1
kind: Pod
metadata:
  name: pluggedin-mcp-proxy
spec:
  containers:
  - name: proxy
    image: pluggedin-mcp-proxy:latest
    livenessProbe:
      httpGet:
        path: /health
        port: 12006
      initialDelaySeconds: 30
      periodSeconds: 10
      timeoutSeconds: 5
      failureThreshold: 3
    readinessProbe:
      httpGet:
        path: /health/ready
        port: 12006
      initialDelaySeconds: 10
      periodSeconds: 5
      timeoutSeconds: 3
      failureThreshold: 2
```

## Alerting Recommendations

### Critical Alerts (Page Immediately)

1. **Service Down**
   - Condition: Health check failures > 3 consecutive attempts
   - Action: Immediate investigation required

2. **High Error Rate**
   - Condition: Error rate > 5% for 5 minutes
   - Action: Check logs and downstream dependencies

3. **Memory Leak**
   - Condition: Memory usage increasing consistently for 30 minutes
   - Action: Investigate memory leaks, consider restart

### Warning Alerts (Review During Business Hours)

1. **Elevated Latency**
   - Condition: P95 latency > 1000ms for 10 minutes
   - Action: Review performance metrics

2. **Discovery Cache Performance**
   - Condition: Cache hit rate < 70% for 15 minutes
   - Action: Review cache configuration

3. **Downstream Server Issues**
   - Condition: Any downstream server error rate > 10%
   - Action: Investigate specific server health

### Alert Channels

```yaml
# Example: Prometheus AlertManager configuration
groups:
- name: pluggedin-mcp
  interval: 30s
  rules:
  - alert: HighErrorRate
    expr: rate(mcp_errors_total[5m]) > 0.05
    for: 5m
    labels:
      severity: critical
    annotations:
      summary: "High error rate detected"
      description: "Error rate is {{ $value }} (threshold: 0.05)"

  - alert: HighLatency
    expr: histogram_quantile(0.95, rate(mcp_request_duration_seconds_bucket[5m])) > 1
    for: 10m
    labels:
      severity: warning
    annotations:
      summary: "High request latency"
      description: "P95 latency is {{ $value }}s"
```

## Performance Monitoring

### Key Performance Indicators (KPIs)

1. **Availability**: Target 99.9% uptime
2. **Response Time**: P95 < 500ms for tool calls
3. **Throughput**: Support 100 requests/second minimum
4. **Error Budget**: < 0.1% error rate

### Performance Optimization Tips

#### Discovery Caching
```typescript
// Leverage force_refresh wisely
const tools = await pluggedin_discover_tools({
  force_refresh: false // Use cached data when possible
});
```

#### Connection Pooling
```typescript
// Configure appropriate pool sizes
const poolConfig = {
  maxConnections: 10,
  minConnections: 2,
  idleTimeout: 30000
};
```

#### Rate Limiting
```typescript
// Implement rate limiting to prevent abuse
const rateLimits = {
  toolCalls: { limit: 60, window: '1m' },
  apiCalls: { limit: 100, window: '1m' }
};
```

## Integration Examples

### Prometheus Metrics Export

```typescript
import { register, Counter, Histogram } from 'prom-client';

// Define metrics
const requestCounter = new Counter({
  name: 'mcp_requests_total',
  help: 'Total MCP requests',
  labelNames: ['method', 'status']
});

const requestDuration = new Histogram({
  name: 'mcp_request_duration_seconds',
  help: 'Request duration in seconds',
  labelNames: ['method'],
  buckets: [0.1, 0.5, 1, 2, 5]
});

// Expose metrics endpoint
app.get('/metrics', async (req, res) => {
  res.set('Content-Type', register.contentType);
  res.end(await register.metrics());
});
```

### OpenTelemetry Integration

```typescript
import { trace, context } from '@opentelemetry/api';
import { NodeTracerProvider } from '@opentelemetry/sdk-trace-node';

// Initialize tracer
const provider = new NodeTracerProvider();
provider.register();

const tracer = trace.getTracer('pluggedin-mcp-proxy');

// Trace tool execution
async function executeToolWithTracing(toolName: string, params: any) {
  const span = tracer.startSpan('tool.execute', {
    attributes: {
      'tool.name': toolName,
      'tool.params': JSON.stringify(params)
    }
  });

  try {
    const result = await executeTool(toolName, params);
    span.setStatus({ code: SpanStatusCode.OK });
    return result;
  } catch (error) {
    span.setStatus({ 
      code: SpanStatusCode.ERROR,
      message: error.message 
    });
    throw error;
  } finally {
    span.end();
  }
}
```

### Grafana Dashboard Configuration

```json
{
  "dashboard": {
    "title": "plugged.in MCP Proxy",
    "panels": [
      {
        "title": "Request Rate",
        "targets": [{
          "expr": "rate(mcp_requests_total[5m])"
        }]
      },
      {
        "title": "Error Rate",
        "targets": [{
          "expr": "rate(mcp_errors_total[5m]) / rate(mcp_requests_total[5m])"
        }]
      },
      {
        "title": "P95 Latency",
        "targets": [{
          "expr": "histogram_quantile(0.95, rate(mcp_request_duration_seconds_bucket[5m]))"
        }]
      }
    ]
  }
}
```

## Best Practices Summary

1. ✅ **Always use structured logging** for easier analysis
2. ✅ **Implement comprehensive health checks** for orchestration
3. ✅ **Set up proactive alerts** before issues become critical
4. ✅ **Monitor downstream dependencies** including MCP servers and APIs
5. ✅ **Track business metrics** (tool usage, user activity) alongside technical metrics
6. ✅ **Regularly review and tune** alerting thresholds based on actual traffic
7. ✅ **Document your monitoring setup** and runbooks for on-call teams
8. ✅ **Test your alerts** to ensure they fire correctly
9. ✅ **Implement distributed tracing** for complex request flows
10. ✅ **Use dashboards** to visualize system health at a glance

## Additional Resources

- [Node.js Performance Best Practices](https://nodejs.org/en/docs/guides/simple-profiling/)
- [Prometheus Documentation](https://prometheus.io/docs/)
- [OpenTelemetry JavaScript](https://opentelemetry.io/docs/instrumentation/js/)
- [The Twelve-Factor App - Logs](https://12factor.net/logs)
- [SRE Book - Monitoring Distributed Systems](https://sre.google/sre-book/monitoring-distributed-systems/)

## Contributing

If you have suggestions for improving monitoring and observability, please:
1. Open an issue describing your use case
2. Submit a PR with your proposed changes to this guide
3. Share your monitoring setup in discussions

---

*Last updated: November 4, 2025*
*Version: 1.0.0*

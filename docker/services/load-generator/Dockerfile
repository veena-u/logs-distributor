FROM node:18-alpine

WORKDIR /app

# Install curl for HTTP requests
RUN apk add --no-cache curl

# Create load generator script
COPY <<EOF load-generator.js
const http = require('http');
const https = require('https');
const { URL } = require('url');

const targetUrl = process.env.TARGET_URL || 'http://localhost:8080';
const requestsPerSecond = parseInt(process.env.REQUESTS_PER_SECOND) || 10;
const duration = parseInt(process.env.DURATION) || 60; // seconds
const rampUpTime = parseInt(process.env.RAMP_UP_TIME) || 10; // seconds
const messagesPerPacket = parseInt(process.env.MESSAGES_PER_PACKET) || 5;

class LoadGenerator {
  constructor(targetUrl, rps, duration, rampUp, messagesPerPacket) {
    this.targetUrl = new URL(targetUrl);
    this.targetRps = rps;
    this.duration = duration;
    this.rampUpTime = rampUp;
    this.messagesPerPacket = messagesPerPacket;
    this.startTime = Date.now();
    this.stats = {
      totalRequests: 0,
      successfulRequests: 0,
      failedRequests: 0,
      responseTimeSum: 0,
      minResponseTime: Infinity,
      maxResponseTime: 0,
      statusCodes: {},
      errors: {}
    };
    
    this.isRunning = false;
    this.currentRps = 0;
  }

  generateLogPacket() {
    const messageCount = Math.floor(Math.random() * this.messagesPerPacket) + 1;
    const messages = [];
    
    const logLevels = ['DEBUG', 'INFO', 'WARN', 'ERROR', 'FATAL'];
    const sources = ['auth-service', 'user-service', 'payment-service', 'notification-service', 'api-gateway'];
    const sampleMessages = [
      'User login successful',
      'Payment processed successfully',
      'Database connection established',
      'Cache miss - fetching from database',
      'API rate limit exceeded',
      'Authentication token expired',
      'File upload completed',
      'Email notification sent',
      'User session created',
      'Transaction committed successfully'
    ];
    
    for (let i = 0; i < messageCount; i++) {
      const timestamp = new Date().toISOString();
      const level = logLevels[Math.floor(Math.random() * logLevels.length)];
      const source = sources[Math.floor(Math.random() * sources.length)];
      const message = sampleMessages[Math.floor(Math.random() * sampleMessages.length)];
      
      messages.push({
        id: \`msg-\${Date.now()}-\${i}-\${Math.random().toString(36).substr(2, 9)}\`,
        timestamp: timestamp,
        level: level,
        source: source,
        message: \`\${message} - \${timestamp}\`,
        metadata: {
          userId: Math.floor(Math.random() * 10000),
          sessionId: \`session-\${Math.random().toString(36).substr(2, 9)}\`,
          ip: \`192.168.\${Math.floor(Math.random() * 255)}.\${Math.floor(Math.random() * 255)}\`,
          userAgent: 'LoadGenerator/1.0',
          requestId: \`req-\${Math.random().toString(36).substr(2, 9)}\`,
          correlationId: \`corr-\${Math.random().toString(36).substr(2, 9)}\`
        }
      });
    }
    
    return {
      id: \`packet-\${Date.now()}-\${Math.random().toString(36).substr(2, 9)}\`,
      agentId: \`load-generator-\${process.pid}\`,
      timestamp: new Date().toISOString(),
      messages: messages
    };
  }

  async sendRequest() {
    const startTime = Date.now();
    const data = JSON.stringify(this.generateLogPacket());
    
    return new Promise((resolve) => {
      const options = {
        hostname: this.targetUrl.hostname,
        port: this.targetUrl.port || (this.targetUrl.protocol === 'https:' ? 443 : 80),
        path: '/logs',
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Content-Length': Buffer.byteLength(data),
          'User-Agent': 'LoadGenerator/1.0'
        }
      };

      const httpModule = this.targetUrl.protocol === 'https:' ? https : http;
      const req = httpModule.request(options, (res) => {
        const responseTime = Date.now() - startTime;
        const statusCode = res.statusCode;
        
        // Read response body
        let responseData = '';
        res.on('data', (chunk) => {
          responseData += chunk;
        });
        
        res.on('end', () => {
          this.updateStats(statusCode < 400, responseTime, statusCode);
          resolve();
        });
      });

      req.on('error', (error) => {
        const responseTime = Date.now() - startTime;
        this.updateStats(false, responseTime, 0, error.message);
        resolve();
      });

      req.setTimeout(10000, () => {
        req.destroy();
        const responseTime = Date.now() - startTime;
        this.updateStats(false, responseTime, 0, 'Request timeout');
        resolve();
      });

      req.write(data);
      req.end();
    });
  }

  updateStats(success, responseTime, statusCode, error) {
    this.stats.totalRequests++;
    this.stats.responseTimeSum += responseTime;
    
    if (success) {
      this.stats.successfulRequests++;
    } else {
      this.stats.failedRequests++;
    }
    
    this.stats.minResponseTime = Math.min(this.stats.minResponseTime, responseTime);
    this.stats.maxResponseTime = Math.max(this.stats.maxResponseTime, responseTime);
    
    if (statusCode > 0) {
      this.stats.statusCodes[statusCode] = (this.stats.statusCodes[statusCode] || 0) + 1;
    }
    
    if (error) {
      this.stats.errors[error] = (this.stats.errors[error] || 0) + 1;
    }
  }

  calculateCurrentRps() {
    const elapsedSeconds = (Date.now() - this.startTime) / 1000;
    if (elapsedSeconds < this.rampUpTime) {
      // Ramp up phase
      return Math.floor((elapsedSeconds / this.rampUpTime) * this.targetRps);
    } else {
      // Steady state
      return this.targetRps;
    }
  }

  printStats() {
    const elapsedSeconds = (Date.now() - this.startTime) / 1000;
    const avgResponseTime = this.stats.totalRequests > 0 ? 
      this.stats.responseTimeSum / this.stats.totalRequests : 0;
    const actualRps = this.stats.totalRequests / elapsedSeconds;
    const successRate = this.stats.totalRequests > 0 ? 
      (this.stats.successfulRequests / this.stats.totalRequests) * 100 : 0;
    
    console.log(\`\\n=== Load Generator Statistics ===\`);
    console.log(\`Elapsed Time: \${elapsedSeconds.toFixed(1)}s\`);
    console.log(\`Target RPS: \${this.targetRps}, Current RPS: \${this.currentRps}, Actual RPS: \${actualRps.toFixed(1)}\`);
    console.log(\`Total Requests: \${this.stats.totalRequests}\`);
    console.log(\`Successful: \${this.stats.successfulRequests} (\${successRate.toFixed(1)}%)\`);
    console.log(\`Failed: \${this.stats.failedRequests}\`);
    console.log(\`Avg Response Time: \${avgResponseTime.toFixed(1)}ms\`);
    console.log(\`Min Response Time: \${this.stats.minResponseTime === Infinity ? 0 : this.stats.minResponseTime}ms\`);
    console.log(\`Max Response Time: \${this.stats.maxResponseTime}ms\`);
    
    if (Object.keys(this.stats.statusCodes).length > 0) {
      console.log(\`Status Codes:\`);
      Object.entries(this.stats.statusCodes).forEach(([code, count]) => {
        console.log(\`  \${code}: \${count}\`);
      });
    }
    
    if (Object.keys(this.stats.errors).length > 0) {
      console.log(\`Errors:\`);
      Object.entries(this.stats.errors).forEach(([error, count]) => {
        console.log(\`  \${error}: \${count}\`);
      });
    }
  }

  async run() {
    console.log(\`Starting load generator...\`);
    console.log(\`Target: \${this.targetUrl.href}\`);
    console.log(\`Target RPS: \${this.targetRps}\`);
    console.log(\`Duration: \${this.duration}s\`);
    console.log(\`Ramp-up Time: \${this.rampUpTime}s\`);
    console.log(\`Messages per Packet: \${this.messagesPerPacket}\`);
    
    this.isRunning = true;
    this.startTime = Date.now();
    
    // Statistics reporting interval
    const statsInterval = setInterval(() => {
      this.printStats();
    }, 10000); // Print stats every 10 seconds
    
    // Request sending loop
    const requestLoop = setInterval(async () => {
      if (!this.isRunning) {
        clearInterval(requestLoop);
        return;
      }
      
      this.currentRps = this.calculateCurrentRps();
      
      if (this.currentRps > 0) {
        const batchSize = Math.min(this.currentRps, 10); // Send in batches of up to 10
        const promises = [];
        
        for (let i = 0; i < batchSize; i++) {
          promises.push(this.sendRequest());
        }
        
        await Promise.all(promises);
      }
    }, 1000); // Run every second
    
    // Stop after duration
    setTimeout(() => {
      this.isRunning = false;
      clearInterval(requestLoop);
      clearInterval(statsInterval);
      
      console.log(\`\\n=== Load Test Completed ===\`);
      this.printStats();
    }, this.duration * 1000);
  }
}

// Start the load generator
const loadGen = new LoadGenerator(
  targetUrl,
  requestsPerSecond,
  duration,
  rampUpTime,
  messagesPerPacket
);

loadGen.run().catch(console.error);
EOF

# Create non-root user
RUN addgroup -g 1001 -S nodejs && \
    adduser -S nodejs -u 1001

RUN chown -R nodejs:nodejs /app
USER nodejs

CMD ["node", "load-generator.js"] 
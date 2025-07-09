const express = require('express');
const app = express();

const port = process.env.PORT || 8081;
const analyzerId = process.env.ANALYZER_ID || 'analyzer-unknown';
const weight = parseFloat(process.env.WEIGHT) || 1.0;
const errorRate = parseFloat(process.env.ERROR_RATE) || 0.02;

let requestCount = 0;
let successCount = 0;
let errorCount = 0;
let totalProcessingTime = 0;

app.use(express.json({ limit: '10mb' }));

// Health endpoint
app.get('/health', (req, res) => {
  res.json({
    status: 'healthy',
    analyzer: analyzerId,
    weight: weight,
    requestCount: requestCount,
    successCount: successCount,
    errorCount: errorCount,
    errorRate: requestCount > 0 ? (errorCount / requestCount) * 100 : 0,
    avgProcessingTime: requestCount > 0 ? totalProcessingTime / requestCount : 0,
    timestamp: new Date().toISOString(),
    uptime: process.uptime()
  });
});

// Analyze endpoint - main processing endpoint
app.post('/analyze', (req, res) => {
  requestCount++;
  
  const startTime = Date.now();
  
  // Validate request
  if (!req.body || !req.body.message) {
    errorCount++;
    return res.status(400).json({
      error: 'Invalid request - message is required',
      analyzer: analyzerId,
      timestamp: new Date().toISOString()
    });
  }
  
  // Simulate processing time (10-200ms)
  const processingTime = Math.random() * 190 + 10;
  
  setTimeout(() => {
    // Simulate occasional errors based on error rate
    if (Math.random() < errorRate) {
      errorCount++;
      return res.status(500).json({
        error: 'Analysis processing failed',
        analyzer: analyzerId,
        messageId: req.body.id || 'unknown',
        timestamp: new Date().toISOString()
      });
    }
    
    // Successful processing
    successCount++;
    const actualProcessingTime = Date.now() - startTime;
    totalProcessingTime += actualProcessingTime;
    
    res.json({
      success: true,
      analyzer: analyzerId,
      messageId: req.body.id || 'unknown',
      level: req.body.level || 'INFO',
      source: req.body.source || 'unknown',
      processedMessage: req.body.message,
      processingTime: actualProcessingTime,
      timestamp: new Date().toISOString(),
      metadata: {
        weight: weight,
        requestCount: requestCount,
        ...req.body.metadata
      }
    });
  }, processingTime);
});

// Stats endpoint
app.get('/stats', (req, res) => {
  res.json({
    analyzer: analyzerId,
    weight: weight,
    requestCount: requestCount,
    successCount: successCount,
    errorCount: errorCount,
    errorRate: requestCount > 0 ? (errorCount / requestCount) * 100 : 0,
    avgProcessingTime: requestCount > 0 ? totalProcessingTime / requestCount : 0,
    uptime: process.uptime(),
    memoryUsage: process.memoryUsage(),
    timestamp: new Date().toISOString()
  });
});

// Graceful shutdown
process.on('SIGTERM', () => {
  console.log(`Analyzer ${analyzerId} received SIGTERM, shutting down gracefully...`);
  process.exit(0);
});

process.on('SIGINT', () => {
  console.log(`Analyzer ${analyzerId} received SIGINT, shutting down gracefully...`);
  process.exit(0);
});

app.listen(port, '0.0.0.0', () => {
  console.log(`Analyzer ${analyzerId} listening on port ${port}`);
  console.log(`Weight: ${weight}, Error Rate: ${errorRate * 100}%`);
}); 
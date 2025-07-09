const LogsDistributorServer = require('./web-server');
const { Analyzer } = require('./data-models');

/**
 * Main application entry point
 */
async function main() {
  try {
    // Configuration from environment variables
    const config = {
      port: process.env.PORT || 8080,
      workers: process.env.WORKERS || require('os').cpus().length,
      distributor: {
        maxQueueSize: parseInt(process.env.MAX_QUEUE_SIZE) || 10000,
        batchSize: parseInt(process.env.BATCH_SIZE) || 100,
        processingInterval: parseInt(process.env.PROCESSING_INTERVAL) || 10
      },
      healthChecker: {
        checkInterval: parseInt(process.env.HEALTH_CHECK_INTERVAL) || 30000,
        timeout: parseInt(process.env.HEALTH_CHECK_TIMEOUT) || 5000,
        failureThreshold: parseInt(process.env.FAILURE_THRESHOLD) || 3
      }
    };

    // Create and start server
    const server = new LogsDistributorServer(config);
    
    // Initialize analyzers from environment
    const analyzersConfig = process.env.ANALYZERS || 
      'analyzer-1:http://localhost:8081:0.4,analyzer-2:http://localhost:8082:0.3,analyzer-3:http://localhost:8083:0.3';
    
    // Parse analyzer configuration
    const analyzerConfigs = analyzersConfig.split(',').map(config => {
      const parts = config.split(':');
      const id = parts[0];
      const weight = parseFloat(parts[parts.length - 1]) || 1.0;
      const endpoint = parts.slice(1, -1).join(':');
      return { id, endpoint, weight };
    });

    // Add analyzers to distributor
    analyzerConfigs.forEach(config => {
      const analyzer = new Analyzer(config.id, config.endpoint, config.weight);
      server.distributor.addAnalyzer(analyzer);
      console.log(`Added analyzer: ${config.id} (${config.endpoint}) with weight ${config.weight}`);
    });

    // Start the server
    await server.start();
    
    console.log('Logs Distributor Server started successfully');
    console.log(`Configuration: ${JSON.stringify(config, null, 2)}`);
    
  } catch (error) {
    console.error('Failed to start server:', error);
    process.exit(1);
  }
}

// Start the application
if (require.main === module) {
  main();
}

module.exports = { main };
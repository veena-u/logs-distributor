const express = require('express');
const cluster = require('cluster');
const os = require('os');
const { LogPacket, LogMessage, Analyzer } = require('./data-models');
const WeightedDistributor = require('./weighted-distributor');
const HealthChecker = require('./health-checker');

/**
 * Multi-threaded web server for log packet ingestion
 */
class LogsDistributorServer {
  constructor(options = {}) {
    this.port = options.port || 8080;
    this.workers = options.workers || os.cpus().length;
    this.app = express();
    this.distributor = new WeightedDistributor(options.distributor || {});
    this.healthChecker = new HealthChecker(this.distributor, options.healthChecker || {});
    
    this.setupMiddleware();
    this.setupRoutes();
    this.setupEventHandlers();
  }

  /**
   * Sets up Express middleware
   */
  setupMiddleware() {
    this.app.use(express.json({ limit: '10mb' }));
    this.app.use(express.urlencoded({ extended: true }));
    
    // Request logging middleware
    this.app.use((req, res, next) => {
      const start = Date.now();
      
      res.on('finish', () => {
        const duration = Date.now() - start;
        console.log(`${req.method} ${req.path} - ${res.statusCode} - ${duration}ms`);
      });
      
      next();
    });

    // Error handling middleware
    this.app.use((err, req, res, next) => {
      console.error('Server error:', err);
      res.status(500).json({
        error: 'Internal server error',
        message: err.message
      });
    });
  }

  /**
   * Sets up API routes
   */
  setupRoutes() {
    // Health endpoints
    this.app.get('/health', (req, res) => {
      res.json({
        status: 'healthy',
        timestamp: new Date().toISOString(),
        uptime: process.uptime()
      });
    });

    this.app.get('/ready', (req, res) => {
      const healthyAnalyzers = this.distributor.getHealthyAnalyzers();
      const isReady = healthyAnalyzers.length > 0;
      
      res.status(isReady ? 200 : 503).json({
        ready: isReady,
        healthyAnalyzers: healthyAnalyzers.length,
        totalAnalyzers: this.distributor.analyzers.size
      });
    });

    // Statistics endpoint
    this.app.get('/stats', (req, res) => {
      res.json({
        distributor: this.distributor.getStats(),
        healthChecker: this.healthChecker.getStats(),
        server: {
          pid: process.pid,
          uptime: process.uptime(),
          memoryUsage: process.memoryUsage()
        }
      });
    });

    // Log packet ingestion endpoint
    this.app.post('/logs', async (req, res) => {
      try {
        const packet = this.parseLogPacket(req.body);
        
        if (!packet.isValid()) {
          return res.status(400).json({
            error: 'Invalid log packet',
            packetId: packet.id
          });
        }

        // Extract messages as strings for distribution
        const messages = packet.messages.map(msg => JSON.stringify(msg.toJSON()));
        
        await this.distributor.distributePacket(messages);
        
        res.json({
          success: true,
          packetId: packet.id,
          messageCount: messages.length,
          timestamp: new Date().toISOString()
        });
        
      } catch (error) {
        console.error('Log ingestion error:', error);
        
        if (error.message.includes('Queue full')) {
          return res.status(429).json({
            error: 'Service temporarily unavailable',
            message: 'Queue full - applying backpressure'
          });
        }
        
        res.status(500).json({
          error: 'Failed to process log packet',
          message: error.message
        });
      }
    });

    // Analyzer management endpoints
    this.app.get('/analyzers', (req, res) => {
      res.json(this.distributor.getAnalyzersStatus());
    });

    this.app.post('/analyzers', (req, res) => {
      try {
        const { id, endpoint, weight } = req.body;
        
        if (!id || !endpoint) {
          return res.status(400).json({
            error: 'Missing required fields: id, endpoint'
          });
        }
        
        const analyzer = new Analyzer(id, endpoint, weight || 1.0);
        this.distributor.addAnalyzer(analyzer);
        
        res.json({
          success: true,
          analyzer: analyzer.toJSON()
        });
        
      } catch (error) {
        res.status(500).json({
          error: 'Failed to add analyzer',
          message: error.message
        });
      }
    });

    this.app.delete('/analyzers/:id', (req, res) => {
      try {
        const analyzerId = req.params.id;
        this.distributor.removeAnalyzer(analyzerId);
        
        res.json({
          success: true,
          message: `Analyzer ${analyzerId} removed`
        });
        
      } catch (error) {
        res.status(500).json({
          error: 'Failed to remove analyzer',
          message: error.message
        });
      }
    });

    // Manual health check trigger
    this.app.post('/analyzers/:id/health', async (req, res) => {
      try {
        const analyzerId = req.params.id;
        await this.healthChecker.triggerHealthCheck(analyzerId);
        
        res.json({
          success: true,
          message: `Health check triggered for ${analyzerId}`
        });
        
      } catch (error) {
        res.status(500).json({
          error: 'Failed to trigger health check',
          message: error.message
        });
      }
    });
  }

  /**
   * Sets up event handlers
   */
  setupEventHandlers() {
    // Distributor events
    this.distributor.on('analyzerAdded', (analyzer) => {
      console.log(`Analyzer added: ${analyzer.id}`);
    });

    this.distributor.on('analyzerRemoved', (analyzer) => {
      console.log(`Analyzer removed: ${analyzer.id}`);
    });

    this.distributor.on('analyzerHealthChanged', (analyzer) => {
      console.log(`Analyzer ${analyzer.id} health changed to: ${analyzer.healthy}`);
    });

    this.distributor.on('error', (error) => {
      console.error('Distributor error:', error);
    });

    // Health checker events
    this.healthChecker.on('healthCheckFailed', (event) => {
      console.warn(`Health check failed for ${event.analyzerId}: ${event.error}`);
    });

    // Graceful shutdown
    process.on('SIGINT', () => {
      console.log('Received SIGINT, shutting down gracefully...');
      this.shutdown();
    });

    process.on('SIGTERM', () => {
      console.log('Received SIGTERM, shutting down gracefully...');
      this.shutdown();
    });
  }

  /**
   * Parses and validates log packet from request body
   * @param {Object} body - Request body
   * @returns {LogPacket} Parsed log packet
   */
  parseLogPacket(body) {
    if (body.id && body.agentId && body.messages) {
      // Full LogPacket format
      return LogPacket.fromJSON(body);
    } else if (Array.isArray(body)) {
      // Simple array of messages
      const messages = body.map(msg => {
        if (typeof msg === 'string') {
          return new LogMessage('INFO', 'unknown', msg);
        } else {
          return LogMessage.fromJSON(msg);
        }
      });
      return new LogPacket('unknown-agent', messages);
    } else {
      throw new Error('Invalid log packet format');
    }
  }

  /**
   * Starts the server
   */
  async start() {
    if (cluster.isMaster) {
      console.log(`Master ${process.pid} is running`);
      
      // Fork workers
      for (let i = 0; i < this.workers; i++) {
        cluster.fork();
      }
      
      cluster.on('exit', (worker, code, signal) => {
        console.log(`Worker ${worker.process.pid} died`);
        cluster.fork();
      });
      
    } else {
      // Worker process
      this.server = this.app.listen(this.port, () => {
        console.log(`Worker ${process.pid} listening on port ${this.port}`);
      });
    }
  }

  /**
   * Shuts down the server gracefully
   */
  async shutdown() {
    console.log('Shutting down server...');
    
    if (this.server) {
      this.server.close(() => {
        console.log('Server closed');
      });
    }
    
    this.healthChecker.stop();
    process.exit(0);
  }
}

module.exports = LogsDistributorServer;
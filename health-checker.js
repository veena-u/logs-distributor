const EventEmitter = require('events');
const axios = require('axios');

/**
 * Health checker for monitoring analyzer availability
 */
class HealthChecker extends EventEmitter {
  constructor(distributor, options = {}) {
    super();
    
    this.distributor = distributor;
    this.checkInterval = options.checkInterval || 30000; // 30 seconds
    this.timeout = options.timeout || 5000; // 5 seconds
    this.failureThreshold = options.failureThreshold || 3;
    this.successThreshold = options.successThreshold || 3;
    
    // HTTP client for health checks
    this.httpClient = axios.create({
      timeout: this.timeout,
      maxRedirects: 0,
      validateStatus: (status) => status >= 200 && status < 300,
      headers: {
        'User-Agent': 'logs-distributor-health-checker/1.0.0'
      }
    });
    
    this.isRunning = false;
    this.intervalId = null;
    
    // Start health checking
    this.start();
  }

  /**
   * Starts health checking
   */
  start() {
    if (this.isRunning) {
      return;
    }
    
    this.isRunning = true;
    this.intervalId = setInterval(() => {
      this.checkAllAnalyzers();
    }, this.checkInterval);
    
    this.emit('started');
  }

  /**
   * Stops health checking
   */
  stop() {
    if (!this.isRunning) {
      return;
    }
    
    this.isRunning = false;
    if (this.intervalId) {
      clearInterval(this.intervalId);
      this.intervalId = null;
    }
    
    this.emit('stopped');
  }

  /**
   * Checks health of all analyzers
   */
  async checkAllAnalyzers() {
    const analyzers = this.distributor.getAnalyzersStatus();
    
    const promises = analyzers.map(analyzer => 
      this.checkAnalyzerHealth(analyzer.id, analyzer.endpoint)
    );
    
    await Promise.allSettled(promises);
  }

  /**
   * Checks health of a specific analyzer
   * @param {string} analyzerId - Analyzer ID
   * @param {string} endpoint - Analyzer endpoint
   */
  async checkAnalyzerHealth(analyzerId, endpoint) {
    const startTime = Date.now();
    
    try {
      const isHealthy = await this.performHealthCheck(endpoint);
      const responseTime = Date.now() - startTime;
      
      this.distributor.updateAnalyzerHealth(analyzerId, isHealthy, responseTime);
      
      this.emit('healthCheckCompleted', {
        analyzerId,
        endpoint,
        healthy: isHealthy,
        responseTime
      });
      
    } catch (error) {
      const responseTime = Date.now() - startTime;
      
      this.distributor.updateAnalyzerHealth(analyzerId, false, responseTime);
      
      this.emit('healthCheckFailed', {
        analyzerId,
        endpoint,
        error: error.message,
        responseTime
      });
    }
  }

  /**
   * Performs the health check
   * @param {string} endpoint - Analyzer endpoint
   * @returns {Promise<boolean>} Health status
   */
  async performHealthCheck(endpoint) {
    try {
      // Construct health check URL
      const healthUrl = `${endpoint.replace(/\/$/, '')}/health`;
      
      // Make HTTP request to health endpoint
      const response = await this.httpClient.get(healthUrl);
      
      // Check if response indicates healthy status
      return response.status >= 200 && response.status < 300;
      
    } catch (error) {
      if (error.code === 'ECONNREFUSED') {
        throw new Error(`Connection refused to ${endpoint}`);
      } else if (error.code === 'ECONNRESET') {
        throw new Error(`Connection reset by ${endpoint}`);
      } else if (error.code === 'ENOTFOUND') {
        throw new Error(`Host not found: ${endpoint}`);
      } else if (error.code === 'ETIMEDOUT') {
        throw new Error(`Health check timeout for ${endpoint}`);
      } else if (error.response) {
        throw new Error(`Health check failed with status ${error.response.status}: ${error.response.statusText}`);
      } else {
        throw new Error(`Health check failed: ${error.message}`);
      }
    }
  }

  /**
   * Manually triggers health check for specific analyzer
   * @param {string} analyzerId - Analyzer ID
   */
  async triggerHealthCheck(analyzerId) {
    const analyzer = this.distributor.analyzers.get(analyzerId);
    if (!analyzer) {
      throw new Error(`Analyzer ${analyzerId} not found`);
    }
    
    await this.checkAnalyzerHealth(analyzerId, analyzer.endpoint);
  }

  /**
   * Gets health check statistics
   * @returns {Object} Health check stats
   */
  getStats() {
    return {
      isRunning: this.isRunning,
      checkInterval: this.checkInterval,
      timeout: this.timeout,
      failureThreshold: this.failureThreshold,
      successThreshold: this.successThreshold
    };
  }
}

module.exports = HealthChecker;
const EventEmitter = require('events');
const axios = require('axios');
const { Analyzer } = require('./data-models');

/**
 * High-throughput, thread-safe weighted distributor for log packets
 */
class WeightedDistributor extends EventEmitter {
  constructor(options = {}) {
    super();
    
    // Configuration
    this.maxQueueSize = options.maxQueueSize || 10000;
    this.batchSize = options.batchSize || 100;
    this.processingInterval = options.processingInterval || 10; // ms
    
    // HTTP client with connection pooling
    this.httpClient = axios.create({
      timeout: options.timeout || 5000,
      maxRedirects: 0,
      validateStatus: (status) => status < 500, // Don't throw for 4xx errors
      headers: {
        'Content-Type': 'application/json',
        'User-Agent': 'logs-distributor/1.0.0'
      }
    });
    
    // Configure connection pooling
    this.httpClient.defaults.httpAgent = require('http').Agent({
      keepAlive: true,
      maxSockets: 50,
      maxFreeSockets: 10,
      timeout: 60000,
      freeSocketTimeout: 30000
    });
    
    this.httpClient.defaults.httpsAgent = require('https').Agent({
      keepAlive: true,
      maxSockets: 50,
      maxFreeSockets: 10,
      timeout: 60000,
      freeSocketTimeout: 30000
    });
    
    // State
    this.analyzers = new Map();
    this.packetQueue = [];
    this.roundRobinCounter = 0;
    this.isProcessing = false;
    this.stats = {
      packetsReceived: 0,
      packetsProcessed: 0,
      packetsDropped: 0,
      errors: 0,
      totalLatency: 0,
      avgLatency: 0
    };
    
    // Start processing queue
    this.startProcessing();
  }

  /**
   * Adds or updates an analyzer
   * @param {Analyzer} analyzer - Analyzer to add/update
   */
  addAnalyzer(analyzer) {
    if (!(analyzer instanceof Analyzer)) {
      throw new Error('Invalid analyzer provided');
    }
    
    this.analyzers.set(analyzer.id, analyzer);
    this.emit('analyzerAdded', analyzer);
  }

  /**
   * Removes an analyzer
   * @param {string} analyzerId - ID of analyzer to remove
   */
  removeAnalyzer(analyzerId) {
    const analyzer = this.analyzers.get(analyzerId);
    if (analyzer) {
      this.analyzers.delete(analyzerId);
      this.emit('analyzerRemoved', analyzer);
    }
  }

  /**
   * Updates analyzer health status
   * @param {string} analyzerId - Analyzer ID
   * @param {boolean} healthy - Health status
   * @param {number} responseTime - Response time in ms
   */
  updateAnalyzerHealth(analyzerId, healthy, responseTime = 0) {
    const analyzer = this.analyzers.get(analyzerId);
    if (analyzer) {
      analyzer.updateHealth(healthy, responseTime);
      this.emit('analyzerHealthChanged', analyzer);
    }
  }

  /**
   * Gets all healthy analyzers
   * @returns {Analyzer[]} Array of healthy analyzers
   */
  getHealthyAnalyzers() {
    return Array.from(this.analyzers.values()).filter(a => a.healthy);
  }

  /**
   * Calculates total weight of healthy analyzers
   * @returns {number} Total weight
   */
  getTotalWeight() {
    return this.getHealthyAnalyzers().reduce((sum, analyzer) => sum + analyzer.weight, 0);
  }

  /**
   * Selects an analyzer using weighted random selection
   * @returns {Analyzer|null} Selected analyzer or null if none available
   */
  selectAnalyzer() {
    const healthyAnalyzers = this.getHealthyAnalyzers();
    
    if (healthyAnalyzers.length === 0) {
      return null;
    }
    
    if (healthyAnalyzers.length === 1) {
      return healthyAnalyzers[0];
    }
    
    const totalWeight = this.getTotalWeight();
    if (totalWeight === 0) {
      return null;
    }
    
    // Weighted random selection
    const random = Math.random() * totalWeight;
    let cumulativeWeight = 0;
    
    for (const analyzer of healthyAnalyzers) {
      cumulativeWeight += analyzer.weight;
      if (random <= cumulativeWeight) {
        return analyzer;
      }
    }
    
    // Fallback to last analyzer (shouldn't happen)
    return healthyAnalyzers[healthyAnalyzers.length - 1];
  }

  /**
   * Distributes a single log message to an analyzer
   * @param {string} logMessage - Log message to distribute
   * @returns {Promise<boolean>} Success status
   */
  async distribute(logMessage) {
    const analyzer = this.selectAnalyzer();
    if (!analyzer) {
      this.stats.errors++;
      throw new Error('No healthy analyzers available');
    }
    
    try {
      // Simulate analyzer call (replace with actual RPC call)
      await this.sendToAnalyzer(analyzer, logMessage);
      return true;
    } catch (error) {
      this.stats.errors++;
      this.updateAnalyzerHealth(analyzer.id, false);
      throw error;
    }
  }

  /**
   * Distributes a log packet (array of messages)
   * @param {string[]} logPacket - Array of log messages
   * @returns {Promise<void>}
   */
  async distributePacket(logPacket) {
    if (!Array.isArray(logPacket)) {
      throw new Error('Log packet must be an array');
    }
    
    const startTime = Date.now();
    this.stats.packetsReceived++;
    
    // Apply backpressure if queue is full
    if (this.packetQueue.length >= this.maxQueueSize) {
      this.stats.packetsDropped++;
      throw new Error('Queue full - applying backpressure');
    }
    
    // Add to queue for processing
    this.packetQueue.push({
      id: `packet-${Date.now()}-${Math.random()}`,
      messages: logPacket,
      timestamp: startTime
    });
    
    return Promise.resolve();
  }

  /**
   * Processes queued packets in batches
   */
  async processQueue() {
    if (this.isProcessing || this.packetQueue.length === 0) {
      return;
    }
    
    this.isProcessing = true;
    
    try {
      // Process packets in batches
      const batch = this.packetQueue.splice(0, this.batchSize);
      
      for (const packet of batch) {
        await this.processPacket(packet);
      }
    } catch (error) {
      this.emit('error', error);
    } finally {
      this.isProcessing = false;
    }
  }

  /**
   * Processes a single packet
   * @param {Object} packet - Packet to process
   */
  async processPacket(packet) {
    try {
      const promises = packet.messages.map(message => 
        this.distribute(message).catch(error => {
          // Log error but don't fail entire packet
          this.emit('messageError', { message, error });
        })
      );
      
      await Promise.all(promises);
      
      // Update stats
      const latency = Date.now() - packet.timestamp;
      this.stats.packetsProcessed++;
      this.stats.totalLatency += latency;
      this.stats.avgLatency = this.stats.totalLatency / this.stats.packetsProcessed;
      
      this.emit('packetProcessed', { packet, latency });
    } catch (error) {
      this.stats.errors++;
      this.emit('packetError', { packet, error });
    }
  }

  /**
   * Sends message to analyzer (RPC implementation)
   * @param {Analyzer} analyzer - Target analyzer
   * @param {string} message - Message to send
   * @returns {Promise<void>}
   */
  async sendToAnalyzer(analyzer, message) {
    const startTime = Date.now();
    
    try {
      // Parse the message to get the log data
      let logData;
      try {
        logData = JSON.parse(message);
      } catch (error) {
        throw new Error(`Invalid message format: ${error.message}`);
      }
      
      // Construct analyzer endpoint URL
      const analyzerUrl = `${analyzer.endpoint.replace(/\/$/, '')}/analyze`;
      
      // Make HTTP request to analyzer
      const response = await this.httpClient.post(analyzerUrl, {
        id: logData.id,
        timestamp: logData.timestamp,
        level: logData.level,
        source: logData.source,
        message: logData.message,
        metadata: logData.metadata || {}
      });
      
      const responseTime = Date.now() - startTime;
      
      // Check if request was successful
      if (response.status >= 200 && response.status < 300) {
        this.updateAnalyzerHealth(analyzer.id, true, responseTime);
        this.emit('messageDelivered', {
          analyzerId: analyzer.id,
          messageId: logData.id,
          responseTime
        });
      } else {
        throw new Error(`Analyzer returned status ${response.status}: ${response.statusText}`);
      }
      
    } catch (error) {
      const responseTime = Date.now() - startTime;
      this.updateAnalyzerHealth(analyzer.id, false, responseTime);
      
      this.emit('messageDeliveryFailed', {
        analyzerId: analyzer.id,
        error: error.message,
        responseTime
      });
      
      throw new Error(`Failed to send to analyzer ${analyzer.id}: ${error.message}`);
    }
  }

  /**
   * Starts the queue processing loop
   */
  startProcessing() {
    setInterval(() => {
      this.processQueue();
    }, this.processingInterval);
  }

  /**
   * Gets current statistics
   * @returns {Object} Current stats
   */
  getStats() {
    return {
      ...this.stats,
      queueSize: this.packetQueue.length,
      analyzersTotal: this.analyzers.size,
      analyzersHealthy: this.getHealthyAnalyzers().length,
      totalWeight: this.getTotalWeight()
    };
  }

  /**
   * Gets all analyzers status
   * @returns {Object[]} Array of analyzer status
   */
  getAnalyzersStatus() {
    return Array.from(this.analyzers.values()).map(analyzer => analyzer.toJSON());
  }
}

module.exports = WeightedDistributor;
/**
 * QUESTION 1: distribute(logMessage: string)
 * 
 * Implementation of weighted distribution for single log messages
 */

/**
 * Distributes a single log message to analyzers based on weights
 * @param {string} logMessage - The log message to distribute
 * @param {Array} analyzers - Array of analyzer objects with analyze() method
 * @param {Array<number>} weights - Array of weights corresponding to analyzers
 */
function distribute(logMessage, analyzers, weights) {
    // Input validation
    if (!analyzers || !weights || analyzers.length !== weights.length) {
      throw new Error('Analyzers and weights arrays must have the same length');
    }
    
    if (analyzers.length === 0) {
      throw new Error('No analyzers available');
    }
    
    // Calculate total weight
    const totalWeight = weights.reduce((sum, weight) => sum + weight, 0);
    
    if (totalWeight <= 0) {
      throw new Error('Total weight must be positive');
    }
    
    // Weighted random selection
    const random = Math.random() * totalWeight;
    let cumulativeWeight = 0;
    
    for (let i = 0; i < analyzers.length; i++) {
      cumulativeWeight += weights[i];
      if (random <= cumulativeWeight) {
        analyzers[i].analyze(logMessage);
        return i; // Return index of selected analyzer for testing
      }
    }
  }
  
  /**
   * FOLLOW-UP FOR QUESTION 1:
   * Trace: 
   * Given: analyzers = [A1, A2, A3], weights = [0.4, 0.3, 0.3]
   * Total weight = 1.0
   * 
   * Example execution:
   * 1. random = 0.65 (random value between 0 and 1.0)
   * 2. i=0: cumulativeWeight = 0.4, random (0.65) > 0.4, continue
   * 3. i=1: cumulativeWeight = 0.7, random (0.65) <= 0.7, select A2
   * 4. Call analyzers[1].analyze(logMessage)
   * 
   * Distribution over many calls:
   * - A1 selected when random is in the range [0, 0.4) → 40% of the time
   * - A2 selected when random is in the range [0.4, 0.7) → 30% of the time  
   * - A3 selected when random is in the range [0.7, 1.0] → 30% of the time
   * 
   * TIME COMPLEXITY: O(n) where n is number of analyzers
   * SPACE COMPLEXITY: O(1) 
   * 
   * - Weights don't need to sum to 1.0 - they're normalized by total weight
   * - Examples: [1, 2, 3] works same as [0.167, 0.333, 0.5]
   */
  
  /**
   * QUESTION 2: distribute(logPacket: string[])
   * 
   * Distributor class that handles packets of log messages
   */
  class Distributor {
    constructor(analyzers, weights) {
      this.analyzers = analyzers || [];
      this.weights = weights || [];
      this.stats = {
        totalPackets: 0,
        totalMessages: 0,
        analyzerCounts: new Array(analyzers.length).fill(0)
      };
      
      // Validate configuration
      if (this.analyzers.length !== this.weights.length) {
        throw new Error('Analyzers and weights must have same length');
      }
    }
  
    /**
     * Distributes a packet of log messages
     * @param {string[]} logPacket - Array of log messages
     */
    async distribute(logPacket) {
      if (!Array.isArray(logPacket)) {
        throw new Error('logPacket must be an array');
      }
      
      this.stats.totalPackets++;
      this.stats.totalMessages += logPacket.length;
      
      // Distribute each message in the packet
      for (const message of logPacket) {
        try {
          const selectedIndex = await this.distributeSingleMessage(message);
          this.stats.analyzerCounts[selectedIndex]++;
        } catch (error) {
          console.error('Failed to distribute message:', error);
          // Continue with other messages even if one fails
        }
      }
    }
  
    /**
     * Internal method to distribute a single message
     * @param {string} message - Single log message
     * @returns {number} Index of selected analyzer
     */
    async distributeSingleMessage(message) {
      const selectedIndex = this.selectAnalyzer();
      await this.callAnalyzer(selectedIndex, message);
      return selectedIndex;
    }

    /**
     * Select analyzer using weighted distribution
     * @returns {number} Index of selected analyzer
     */
    selectAnalyzer() {
      const totalWeight = this.weights.reduce((sum, weight) => sum + weight, 0);
      
      if (totalWeight <= 0) {
        throw new Error('Total weight must be positive');
      }
      
      const random = Math.random() * totalWeight;
      let cumulativeWeight = 0;
      
      for (let i = 0; i < this.analyzers.length; i++) {
        cumulativeWeight += this.weights[i];
        if (random <= cumulativeWeight) {
          return i;
        }
      }
      
      return this.analyzers.length - 1; // fallback to last analyzer
    }

    /**
     * Call analyzer with message
     * @param {number} index - Analyzer index
     * @param {string} message - Message to process
     */
    async callAnalyzer(index, message) {
      if (this.analyzers[index] && typeof this.analyzers[index].analyze === 'function') {
        await this.analyzers[index].analyze(message);
      } else {
        // For testing/simulation purposes
        return Promise.resolve();
      }
    }
  
    /**
     * Gets distribution statistics
     * @returns {Object} Statistics object
     */
    getStats() {
      return {
        ...this.stats,
        analyzerDistribution: this.stats.analyzerCounts.map((count, index) => ({
          analyzer: index,
          count: count,
          percentage: this.stats.totalMessages > 0 
            ? (count / this.stats.totalMessages * 100).toFixed(2) + '%'
            : '0%'
        }))
      };
    }
  
    /**
     * Updates analyzer configuration
     * @param {Array} newAnalyzers - New analyzers array
     * @param {Array<number>} newWeights - New weights array
     */
    updateConfiguration(newAnalyzers, newWeights) {
      if (newAnalyzers.length !== newWeights.length) {
        throw new Error('Analyzers and weights must have same length');
      }
      
      this.analyzers = newAnalyzers;
      this.weights = newWeights;
      
      // Reset stats for new configuration
      this.stats.analyzerCounts = new Array(newAnalyzers.length).fill(0);
    }
  }
  
  /**
   * FOLLOW UP FOR QUESTION 2:
   * 
   * Given: logPacket = ["msg1", "msg2", "msg3"]
   * 
   * Execution:
   * 1. Validate logPacket is array 
   * 2. Update stats: totalPackets += 1, totalMessages += 3
   * 3. For each message in packet:
   *    - await distributeSingleMessage("msg1") -> selectAnalyzer() -> callAnalyzer() -> async call
   *    - await distributeSingleMessage("msg2") -> selectAnalyzer() -> callAnalyzer() -> async call
   *    - await distributeSingleMessage("msg3") -> selectAnalyzer() -> callAnalyzer() -> async call
   * 4. Update analyzerCounts for each selection
   * 
   * PROS:
   * - Encapsulates configuration (analyzers/weights) in class
   * - Provides statistics tracking
   * - Handles packets efficiently with async processing
   * - Error isolation - one failed message doesn't stop others
   * - Consistent async interface for extensibility
   * 
   * CONS:
   * - Async overhead for simple operations
   * - Memory usage grows with statistics
   * - No batching optimization for same analyzer
   */
  
    /**
   * QUESTION 3: Analyzer Failure Handling
   * 
   * Fault-tolerant distributor that extends the base async distributor
   * to handle analyzer failures and automatic recovery with thread-safe operations
   */
  class FaultTolerantDistributor extends Distributor {
    constructor(analyzers, weights, options = {}) {
      super(analyzers, weights);
      
      this.failureThreshold = options.failureThreshold || 3;
      this.recoveryThreshold = options.recoveryThreshold || 3;
      this.healthCheckInterval = options.healthCheckInterval || 30000;
      
      // Track analyzer health with thread-safe state
      this.failureCounts = new Array(analyzers.length).fill(0);
      this.successCounts = new Array(analyzers.length).fill(0);
      this.healthy = new Array(analyzers.length).fill(true);
      
      // Add mutex locks for thread safety
      this.stateLocks = new Array(analyzers.length).fill(null).map(() => new AsyncLock());
      
      this.startHealthChecking();
    }

    /**
     * Override selectAnalyzer to only choose healthy analyzers
     */
    selectAnalyzer() {
      const healthyIndices = this.getHealthyAnalyzers();
      
      if (healthyIndices.length === 0) {
        throw new Error('No healthy analyzers available');
      }
      
      // Use weighted selection logic, but only on healthy analyzers
      const healthyWeights = healthyIndices.map(i => this.weights[i]);
      const totalWeight = healthyWeights.reduce((sum, w) => sum + w, 0);
      
      if (totalWeight <= 0) {
        return healthyIndices[Math.floor(Math.random() * healthyIndices.length)];
      }
      
      const random = Math.random() * totalWeight;
      let cumulativeWeight = 0;
      
      for (let i = 0; i < healthyIndices.length; i++) {
        cumulativeWeight += healthyWeights[i];
        if (random <= cumulativeWeight) {
          return healthyIndices[i];
        }
      }
      
      return healthyIndices[healthyIndices.length - 1];
    }

    /**
     * Override callAnalyzer to add failure tracking with thread safety
     */
    async callAnalyzer(index, message) {
      try {
        if (this.analyzers[index] && typeof this.analyzers[index].analyze === 'function') {
          await this.analyzers[index].analyze(message);
        } else {
          // Simulate analyzer call with potential failure for testing
          await new Promise((resolve, reject) => {
            setTimeout(() => {
              if (Math.random() < 0.1) { // 10% failure rate for simulation
                reject(new Error(`Analyzer ${index} failed to process message`));
              } else {
                resolve();
              }
            }, 50 + Math.random() * 100);
          });
        }
        
        await this.recordSuccess(index);
      } catch (error) {
        await this.recordFailure(index, error);
        throw new Error(`Analyzer ${index} failed to process message: ${error.message}`);
      }
    }

    /**
     * Get indices of healthy analyzers (thread-safe read)
     */
    getHealthyAnalyzers() {
      // Create a snapshot to avoid race conditions during iteration
      const healthySnapshot = [...this.healthy];
      return healthySnapshot
        .map((isHealthy, index) => isHealthy ? index : -1)
        .filter(index => index >= 0);
    }

    /**
     * Override distribute to check for healthy analyzers upfront
     */
    async distribute(logPacket) {
      if (!Array.isArray(logPacket)) {
        throw new Error('logPacket must be an array');
      }
      
      if (this.getHealthyAnalyzers().length === 0) {
        throw new Error('No healthy analyzers available');
      }
      
      // Call parent distribute method
      await super.distribute(logPacket);
    }

    /**
     * Thread-safe record successful analyzer call
     */
    async recordSuccess(index) {
      await this.stateLocks[index].acquire(async () => {
        // Atomic operations within lock
        this.successCounts[index]++;
        this.failureCounts[index] = 0;
        
        // Check for recovery
        if (!this.healthy[index] && this.successCounts[index] >= this.recoveryThreshold) {
          this.healthy[index] = true;
          console.log(`Analyzer ${index} recovered`);
        }
      });
    }

    /**
     * Thread-safe record failed analyzer call
     */
    async recordFailure(index, error) {
      await this.stateLocks[index].acquire(async () => {
        // Atomic operations within lock
        this.failureCounts[index]++;
        this.successCounts[index] = 0;
        
        // Mark as unhealthy if failure threshold exceeded
        if (this.healthy[index] && this.failureCounts[index] >= this.failureThreshold) {
          this.healthy[index] = false;
          console.log(`Analyzer ${index} marked as unhealthy after ${this.failureCounts[index]} failures`);
        }
      });
    }

    /**
     * Start periodic health checking
     */
    startHealthChecking() {
      setInterval(() => {
        this.performHealthChecks();
      }, this.healthCheckInterval);
    }

    /**
     * Perform health checks on all analyzers
     */
    async performHealthChecks() {
      const promises = this.analyzers.map((analyzer, index) => 
        this.performSingleHealthCheck(index)
      );
      
      await Promise.allSettled(promises);
    }

    /**
     * Perform health check on single analyzer
     */
    async performSingleHealthCheck(index) {
      try {
        // Simulate health check
        await new Promise((resolve, reject) => {
          setTimeout(() => {
            if (Math.random() < 0.2) { // 20% health check failure rate
              reject(new Error('Health check failed'));
            } else {
              resolve();
            }
          }, 100);
        });
        
        await this.recordSuccess(index);
      } catch (error) {
        await this.recordFailure(index, error);
      }
    }

    /**
     * Get statistics including health status
     */
    getStats() {
      const baseStats = super.getStats();
      
      // Create snapshots to avoid race conditions
      const healthySnapshot = [...this.healthy];
      const failureSnapshot = [...this.failureCounts];
      const successSnapshot = [...this.successCounts];
      
      const healthyCount = healthySnapshot.filter(h => h).length;
      
      return {
        ...baseStats,
        analyzersHealthy: healthyCount,
        analyzersUnhealthy: this.analyzers.length - healthyCount,
        analyzerHealth: healthySnapshot.map((healthy, index) => ({
          index,
          healthy,
          failures: failureSnapshot[index],
          successes: successSnapshot[index]
        }))
      };
    }
  }

  /**
   *  AsyncLock implementation for thread safety
   */
  class AsyncLock {
    constructor() {
      this.locked = false;
      this.queue = [];
    }

    async acquire(fn) {
      return new Promise((resolve, reject) => {
        this.queue.push({ fn, resolve, reject });
        this.processQueue();
      });
    }

    async processQueue() {
      if (this.locked || this.queue.length === 0) {
        return;
      }

      this.locked = true;
      const { fn, resolve, reject } = this.queue.shift();

      try {
        const result = await fn();
        resolve(result);
      } catch (error) {
        reject(error);
      } finally {
        this.locked = false;
        // Process next item in queue
        setImmediate(() => this.processQueue());
      }
    }
  }
  
  /**
   * FOLLOW UP FOR QUESTION 3:
   * 
   * - Extends existing Distributor class
   * - Non-blocking async, thread-safe operations
   * 
   * ANALYZER HEALTH ADJUSTMENTS:
   * - Marks analyzers as unhealthy after 3 consecutive failures
   * - Automatically recovers analyzers after 3 consecutive successes
   * - Only routes traffic to healthy analyzers using weighted distribution
   * - Periodic health checks every 30 seconds
   * 
   * TRADEOFFS:
   * 
   * PROS:
   * + Automatically recovers analyzers without manual intervention
   * + Minimal memory overhead
   * + Works with existing code from Question 1 and 2
   * 
   * CONS:
   * - Health checks may add network/CPU overhead
   * - Basic failure detection (no circuit breaker patterns)
   * - Memory overhead for tracking health state
   */

// Export classes for testing
module.exports = {
  distribute,
  Distributor,
  FaultTolerantDistributor
};
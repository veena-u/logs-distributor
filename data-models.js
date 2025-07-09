const { v4: uuid } = require('uuid');

/**
 * LogLevel enumeration for structured logging
 */
const LogLevel = {
  DEBUG: 'DEBUG',
  INFO: 'INFO',
  WARN: 'WARN',
  ERROR: 'ERROR',
  FATAL: 'FATAL'
};

/**
 * Represents a structured log message with metadata
 */
class LogMessage {
  constructor(level, source, message, metadata = {}) {
    this.id = uuid();
    this.timestamp = new Date().toISOString();
    this.level = level;
    this.source = source;
    this.message = message;
    this.metadata = metadata;
  }

  /**
   * Validates the log message structure
   * @returns {boolean} True if valid
   */
  isValid() {
    return this.id && 
           this.timestamp && 
           Object.values(LogLevel).includes(this.level) &&
           this.source && 
           this.message;
  }

  /**
   * Creates LogMessage from JSON
   * @param {Object} json - JSON representation
   * @returns {LogMessage} New LogMessage instance
   */
  static fromJSON(json) {
    const msg = new LogMessage(json.level, json.source, json.message, json.metadata);
    msg.id = json.id || msg.id;
    msg.timestamp = json.timestamp || msg.timestamp;
    return msg;
  }

  /**
   * Converts to JSON for serialization
   * @returns {Object} JSON representation
   */
  toJSON() {
    return {
      id: this.id,
      timestamp: this.timestamp,
      level: this.level,
      source: this.source,
      message: this.message,
      metadata: this.metadata
    };
  }
}

/**
 * Groups multiple LogMessage instances into a single network payload
 */
class LogPacket {
  constructor(agentId, messages = []) {
    this.id = uuid();
    this.agentId = agentId;
    this.timestamp = new Date().toISOString();
    this.messages = messages.map(msg => 
      msg instanceof LogMessage ? msg : LogMessage.fromJSON(msg)
    );
  }

  /**
   * Adds a message to the packet
   * @param {LogMessage} message - Message to add
   */
  addMessage(message) {
    if (message instanceof LogMessage && message.isValid()) {
      this.messages.push(message);
    } else {
      throw new Error('Invalid LogMessage provided');
    }
  }

  /**
   * Validates the packet structure
   * @returns {boolean} True if valid
   */
  isValid() {
    return this.id && 
           this.agentId && 
           this.timestamp && 
           Array.isArray(this.messages) &&
           this.messages.every(msg => msg.isValid());
  }

  /**
   * Creates LogPacket from JSON
   * @param {Object} json - JSON representation
   * @returns {LogPacket} New LogPacket instance
   */
  static fromJSON(json) {
    const packet = new LogPacket(json.agentId, json.messages);
    packet.id = json.id || packet.id;
    packet.timestamp = json.timestamp || packet.timestamp;
    return packet;
  }

  /**
   * Converts to JSON for serialization
   * @returns {Object} JSON representation
   */
  toJSON() {
    return {
      id: this.id,
      agentId: this.agentId,
      timestamp: this.timestamp,
      messages: this.messages.map(msg => msg.toJSON())
    };
  }
}

/**
 * Represents an analyzer with configurable load balancing and health monitoring
 */
class Analyzer {
  constructor(id, endpoint, weight = 1.0) {
    this.id = id;
    this.endpoint = endpoint;
    this.weight = weight;
    this.healthy = true;
    this.lastSeen = new Date().toISOString();
    this.consecutiveFailures = 0;
    this.consecutiveSuccesses = 0;
    this.totalChecks = 0;
    this.totalFailures = 0;
    this.lastResponseTime = 0;
  }

  /**
   * Updates health status based on check result
   * @param {boolean} success - Whether the health check succeeded
   * @param {number} responseTime - Response time in milliseconds
   */
  updateHealth(success, responseTime = 0) {
    this.totalChecks++;
    this.lastResponseTime = responseTime;
    
    if (success) {
      this.consecutiveSuccesses++;
      this.consecutiveFailures = 0;
      this.lastSeen = new Date().toISOString();
      
      // Require 3 consecutive successes to mark as healthy
      if (this.consecutiveSuccesses >= 3) {
        this.healthy = true;
      }
    } else {
      this.totalFailures++;
      this.consecutiveFailures++;
      this.consecutiveSuccesses = 0;
      
      // Mark as unhealthy after 3 consecutive failures
      if (this.consecutiveFailures >= 3) {
        this.healthy = false;
      }
    }
  }

  /**
   * Gets failure rate as percentage
   * @returns {number} Failure rate (0-100)
   */
  getFailureRate() {
    if (this.totalChecks === 0) return 0;
    return (this.totalFailures / this.totalChecks) * 100;
  }

  /**
   * Converts to JSON for serialization
   * @returns {Object} JSON representation
   */
  toJSON() {
    return {
      id: this.id,
      endpoint: this.endpoint,
      weight: this.weight,
      healthy: this.healthy,
      lastSeen: this.lastSeen,
      consecutiveFailures: this.consecutiveFailures,
      consecutiveSuccesses: this.consecutiveSuccesses,
      totalChecks: this.totalChecks,
      totalFailures: this.totalFailures,
      lastResponseTime: this.lastResponseTime,
      failureRate: this.getFailureRate()
    };
  }
}

module.exports = {
  LogLevel,
  LogMessage,
  LogPacket,
  Analyzer
};
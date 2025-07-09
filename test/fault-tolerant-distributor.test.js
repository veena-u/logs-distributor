// This tests coding-questions.js file
const { FaultTolerantDistributor } = require('../coding-questions');

describe('FaultTolerantDistributor', () => {
  let distributor;
  let mockAnalyzers;
  let originalSetInterval;

  beforeEach(() => {
    // Mock analyzers with analyze method
    mockAnalyzers = [
      { name: 'analyzer-1', analyze: jest.fn() },
      { name: 'analyzer-2', analyze: jest.fn() },
      { name: 'analyzer-3', analyze: jest.fn() }
    ];

    // Mock Math.random for deterministic behavior
    jest.spyOn(Math, 'random').mockReturnValue(0.5);

    // Mock setInterval to prevent health checks during tests
    originalSetInterval = global.setInterval;
    global.setInterval = jest.fn();

    // Create distributor with mocked analyzers
    distributor = new FaultTolerantDistributor(mockAnalyzers, [0.4, 0.3, 0.3], {
      failureThreshold: 3,
      recoveryThreshold: 3,
      healthCheckInterval: 100
    });
  });

  afterEach(() => {
    // Restore original setInterval
    global.setInterval = originalSetInterval;
    jest.restoreAllMocks();
  });

  describe('Initialization', () => {
    test('should initialize with all analyzers healthy', () => {
      expect(distributor.healthy).toEqual([true, true, true]);
      expect(distributor.failureCounts).toEqual([0, 0, 0]);
      expect(distributor.successCounts).toEqual([0, 0, 0]);
    });

    test('should inherit from Distributor', () => {
      expect(distributor.analyzers).toBe(mockAnalyzers);
      expect(distributor.weights).toEqual([0.4, 0.3, 0.3]);
    });
  });

  describe('Healthy Analyzer Selection', () => {
    test('should return all analyzers when all are healthy', () => {
      const healthy = distributor.getHealthyAnalyzers();
      expect(healthy).toEqual([0, 1, 2]);
    });

    test('should exclude unhealthy analyzers', () => {
      distributor.healthy[1] = false;
      const healthy = distributor.getHealthyAnalyzers();
      expect(healthy).toEqual([0, 2]);
    });

    test('should return empty array when no analyzers are healthy', () => {
      distributor.healthy = [false, false, false];
      const healthy = distributor.getHealthyAnalyzers();
      expect(healthy).toEqual([]);
    });
  });

  describe('Analyzer Selection', () => {
    test('should select analyzer from healthy ones only', () => {
      distributor.healthy[1] = false;
      
      const selected = distributor.selectAnalyzer();
      expect([0, 2]).toContain(selected);
    });

    test('should throw error when no healthy analyzers', () => {
      distributor.healthy = [false, false, false];
      expect(() => distributor.selectAnalyzer()).toThrow('No healthy analyzers available');
    });
  });

  describe('Failure Detection', () => {
    test('should mark analyzer as unhealthy after failure threshold', async () => {
      await distributor.recordFailure(0, new Error('Test failure'));
      await distributor.recordFailure(0, new Error('Test failure'));
      await distributor.recordFailure(0, new Error('Test failure'));
      
      expect(distributor.healthy[0]).toBe(false);
      expect(distributor.failureCounts[0]).toBe(3);
    });

    test('should not mark analyzer as unhealthy before threshold', async () => {
      await distributor.recordFailure(0, new Error('Test failure'));
      await distributor.recordFailure(0, new Error('Test failure'));
      
      expect(distributor.healthy[0]).toBe(true);
      expect(distributor.failureCounts[0]).toBe(2);
    });

    test('should reset success count on failure', async () => {
      distributor.successCounts[0] = 2;
      await distributor.recordFailure(0, new Error('Test failure'));
      
      expect(distributor.successCounts[0]).toBe(0);
      expect(distributor.failureCounts[0]).toBe(1);
    });
  });

  describe('Recovery', () => {
    test('should recover analyzer after success threshold', async () => {
      distributor.healthy[0] = false;
      distributor.failureCounts[0] = 3;
      
      await distributor.recordSuccess(0);
      await distributor.recordSuccess(0);
      await distributor.recordSuccess(0);
      
      expect(distributor.healthy[0]).toBe(true);
      expect(distributor.successCounts[0]).toBe(3);
      expect(distributor.failureCounts[0]).toBe(0);
    });

    test('should not recover analyzer before threshold', async () => {
      distributor.healthy[0] = false;
      distributor.failureCounts[0] = 3;
      
      await distributor.recordSuccess(0);
      await distributor.recordSuccess(0);
      
      expect(distributor.healthy[0]).toBe(false);
      expect(distributor.successCounts[0]).toBe(2);
    });

    test('should reset failure count on success', async () => {
      distributor.failureCounts[0] = 2;
      await distributor.recordSuccess(0);
      
      expect(distributor.failureCounts[0]).toBe(0);
      expect(distributor.successCounts[0]).toBe(1);
    });
  });

  describe('Distribution with Failures', () => {
    test('should distribute successfully when analyzers are healthy', async () => {
      mockAnalyzers[0].analyze.mockResolvedValue();
      mockAnalyzers[1].analyze.mockResolvedValue();
      mockAnalyzers[2].analyze.mockResolvedValue();
      
      await distributor.distribute(['message1', 'message2']);
      
      const totalCalls = mockAnalyzers[0].analyze.mock.calls.length + 
                         mockAnalyzers[1].analyze.mock.calls.length + 
                         mockAnalyzers[2].analyze.mock.calls.length;
      expect(totalCalls).toBe(2);
    });

    test('should throw error when no healthy analyzers', async () => {
      distributor.healthy = [false, false, false];
      
      await expect(distributor.distribute(['message1'])).rejects.toThrow('No healthy analyzers available');
    });
  });

  describe('Statistics', () => {
    test('should include health statistics', () => {
      distributor.healthy[1] = false;
      
      const stats = distributor.getStats();
      
      expect(stats.analyzersHealthy).toBe(2);
      expect(stats.analyzersUnhealthy).toBe(1);
      expect(stats.analyzerHealth).toHaveLength(3);
      expect(stats.analyzerHealth[0]).toEqual({
        index: 0,
        healthy: true,
        failures: 0,
        successes: 0
      });
      expect(stats.analyzerHealth[1]).toEqual({
        index: 1,
        healthy: false,
        failures: 0,
        successes: 0
      });
    });

    test('should inherit base statistics from parent class', () => {
      const stats = distributor.getStats();
      
      expect(stats).toHaveProperty('totalPackets');
      expect(stats).toHaveProperty('totalMessages');
      expect(stats).toHaveProperty('analyzerDistribution');
    });
  });

  describe('Integration Test', () => {
    test('should handle failure and recovery cycle', async () => {
      mockAnalyzers[0].analyze
        .mockRejectedValueOnce(new Error('Failure 1'))
        .mockRejectedValueOnce(new Error('Failure 2'))
        .mockRejectedValueOnce(new Error('Failure 3'))
        .mockResolvedValueOnce()
        .mockResolvedValueOnce()
        .mockResolvedValueOnce();
      
      const selectSpy = jest.spyOn(distributor, 'selectAnalyzer');
      selectSpy.mockReturnValue(0);
      
      // Cause 3 failures
      try { await distributor.distributeSingleMessage('msg1'); } catch (e) {}
      try { await distributor.distributeSingleMessage('msg2'); } catch (e) {}
      try { await distributor.distributeSingleMessage('msg3'); } catch (e) {}
      
      expect(distributor.healthy[0]).toBe(false);
      expect(distributor.failureCounts[0]).toBe(3);
      
      // Recovery
      await distributor.distributeSingleMessage('msg4');
      await distributor.distributeSingleMessage('msg5');
      await distributor.distributeSingleMessage('msg6');
      
      expect(distributor.healthy[0]).toBe(true);
      expect(distributor.successCounts[0]).toBe(3);
      
      selectSpy.mockRestore();
    });
  });
}); 
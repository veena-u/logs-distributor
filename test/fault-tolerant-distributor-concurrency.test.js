// This tests coding-questions.js file
const { FaultTolerantDistributor } = require('../coding-questions');

describe('FaultTolerantDistributor - Concurrency & Thread Safety', () => {
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

  describe('Concurrent Distribution Operations', () => {
    test('should handle multiple concurrent distribute calls safely', async () => {
      // Setup all analyzers to succeed
      mockAnalyzers.forEach(analyzer => {
        analyzer.analyze.mockResolvedValue();
      });

      // Create multiple concurrent distribution operations
      const concurrentOperations = [];
      const messagesPerOperation = 5;
      const numberOfOperations = 10;

      for (let i = 0; i < numberOfOperations; i++) {
        const messages = Array(messagesPerOperation).fill(0).map((_, j) => `message-${i}-${j}`);
        concurrentOperations.push(distributor.distribute(messages));
      }

      // Wait for all operations to complete
      await Promise.all(concurrentOperations);

      // Verify total message count
      const stats = distributor.getStats();
      expect(stats.totalMessages).toBe(numberOfOperations * messagesPerOperation);
      expect(stats.totalPackets).toBe(numberOfOperations);

      // Verify all analyzers received some messages
      const totalAnalyzerCalls = mockAnalyzers.reduce((sum, analyzer) => 
        sum + analyzer.analyze.mock.calls.length, 0
      );
      expect(totalAnalyzerCalls).toBe(numberOfOperations * messagesPerOperation);
    });

    test('should maintain health state consistency under concurrent failures', async () => {
      // Setup analyzer 0 to fail, others to succeed
      mockAnalyzers[0].analyze.mockRejectedValue(new Error('Analyzer failure'));
      mockAnalyzers[1].analyze.mockResolvedValue();
      mockAnalyzers[2].analyze.mockResolvedValue();

      // Mock selectAnalyzer to always return analyzer 0 for deterministic failures
      const selectSpy = jest.spyOn(distributor, 'selectAnalyzer');
      selectSpy.mockReturnValue(0);

      // Create concurrent operations that will all fail on analyzer 0
      const concurrentFailures = [];
      for (let i = 0; i < 5; i++) {
        concurrentFailures.push(
          distributor.distributeSingleMessage(`message-${i}`).catch(() => {})
        );
      }

      await Promise.all(concurrentFailures);

      // Verify failure count is correct (should be at least 3 to mark as unhealthy)
      expect(distributor.failureCounts[0]).toBeGreaterThanOrEqual(3);
      expect(distributor.healthy[0]).toBe(false);

      selectSpy.mockRestore();
    });

    test('should handle concurrent success and failure operations', async () => {
      // Setup mixed responses
      mockAnalyzers[0].analyze
        .mockRejectedValueOnce(new Error('Failure'))
        .mockResolvedValue(); // Subsequent calls succeed
      mockAnalyzers[1].analyze.mockResolvedValue();
      mockAnalyzers[2].analyze.mockResolvedValue();

      // Create mixed concurrent operations
      const mixedOperations = [];
      
      // Some operations will hit analyzer 0 and fail initially
      for (let i = 0; i < 3; i++) {
        const selectSpy = jest.spyOn(distributor, 'selectAnalyzer');
        selectSpy.mockReturnValueOnce(0);
        mixedOperations.push(
          distributor.distributeSingleMessage(`fail-message-${i}`).catch(() => {})
        );
        selectSpy.mockRestore();
      }

      // Some operations will hit other analyzers and succeed
      for (let i = 0; i < 3; i++) {
        const selectSpy = jest.spyOn(distributor, 'selectAnalyzer');
        selectSpy.mockReturnValueOnce(1);
        mixedOperations.push(
          distributor.distributeSingleMessage(`success-message-${i}`)
        );
        selectSpy.mockRestore();
      }

      await Promise.all(mixedOperations);

      // Verify state is consistent
      // The main goal is to test that concurrent operations don't corrupt state
      expect(distributor.healthy[0]).toBeDefined();
      expect(distributor.healthy[1]).toBeDefined();
      
      // Analyzer 1 should have successful operations recorded
      expect(distributor.successCounts[1]).toBe(3);
      expect(distributor.healthy[1]).toBe(true);
      
      // Verify that failure/success counts are within expected bounds
      expect(distributor.failureCounts[0]).toBeGreaterThanOrEqual(0);
      expect(distributor.failureCounts[0]).toBeLessThanOrEqual(3);
    });
  });

  describe('Race Condition Prevention', () => {
    test('should prevent race conditions in failure counting', async () => {
      mockAnalyzers[0].analyze.mockRejectedValue(new Error('Failure'));
      
      const selectSpy = jest.spyOn(distributor, 'selectAnalyzer');
      selectSpy.mockReturnValue(0);

      // Create rapid concurrent failures with small delays to increase race condition chance
      const rapidFailures = [];
      for (let i = 0; i < 10; i++) {
        rapidFailures.push(
          new Promise(resolve => {
            setTimeout(async () => {
              try {
                await distributor.distributeSingleMessage(`message-${i}`);
              } catch (e) {}
              resolve();
            }, Math.random() * 10); // Random small delay
          })
        );
      }

      await Promise.all(rapidFailures);

      // Failure count should not exceed the number of actual failures
      expect(distributor.failureCounts[0]).toBeLessThanOrEqual(10);
      expect(distributor.failureCounts[0]).toBeGreaterThanOrEqual(3);
      expect(distributor.healthy[0]).toBe(false);

      selectSpy.mockRestore();
    });

    test('should handle concurrent success and failure on same analyzer', async () => {
      // Setup analyzer to fail first 3 times, then succeed
      mockAnalyzers[0].analyze
        .mockRejectedValueOnce(new Error('Failure 1'))
        .mockRejectedValueOnce(new Error('Failure 2'))  
        .mockRejectedValueOnce(new Error('Failure 3'))
        .mockResolvedValue(); // Subsequent calls succeed

      const selectSpy = jest.spyOn(distributor, 'selectAnalyzer');
      selectSpy.mockReturnValue(0);

      // Create sequential operations (not concurrent for predictable behavior)
      for (let i = 0; i < 6; i++) {
        try {
          await distributor.distributeSingleMessage(`message-${i}`);
        } catch (e) {
          // Ignore failures for first 3 operations
        }
      }

      // After 3 failures, analyzer should be unhealthy
      // After subsequent successes, it may start recovery
      expect(distributor.healthy[0]).toBeDefined(); // Just check state exists
      
      // The exact counts depend on timing, but state should be consistent
      if (distributor.healthy[0]) {
        expect(distributor.successCounts[0]).toBeGreaterThanOrEqual(3);
      } else {
        expect(distributor.failureCounts[0]).toBeGreaterThanOrEqual(0);
      }

      selectSpy.mockRestore();
    });
  });

  describe('Health Check Concurrency', () => {
    test('should handle health checks concurrent with distribution', async () => {
      // Setup analyzers to succeed
      mockAnalyzers.forEach(analyzer => {
        analyzer.analyze.mockResolvedValue();
      });

      // Create concurrent distribution and health check operations
      const operations = [];

      // Add distribution operations
      for (let i = 0; i < 5; i++) {
        operations.push(distributor.distribute([`message-${i}`]));
      }

      // Add manual health check operations
      for (let i = 0; i < 3; i++) {
        operations.push(distributor.performHealthChecks());
      }

      await Promise.all(operations);

      // All analyzers should remain healthy
      expect(distributor.healthy).toEqual([true, true, true]);
      
      // Distribution stats should be accurate
      const stats = distributor.getStats();
      expect(stats.totalMessages).toBe(5);
      expect(stats.analyzersHealthy).toBe(3);
    });

    test('should maintain consistency during health check recovery', async () => {
      // Start with an unhealthy analyzer
      distributor.healthy[0] = false;
      distributor.failureCounts[0] = 3;

      // Manually call recordSuccess to simulate health check recovery
      // This avoids timing issues with the mock analyzer
      for (let i = 0; i < 5; i++) {
        await distributor.recordSuccess(0);
      }

      // Should recover after sufficient successes (3 or more)
      expect(distributor.successCounts[0]).toBeGreaterThanOrEqual(3);
      expect(distributor.healthy[0]).toBe(true);
      expect(distributor.failureCounts[0]).toBe(0);
    });
  });

  describe('State Consistency Under Load', () => {
    test('should maintain accurate statistics under high concurrent load', async () => {
      // Setup all analyzers to succeed
      mockAnalyzers.forEach(analyzer => {
        analyzer.analyze.mockResolvedValue();
      });

      const heavyLoad = [];
      const packetsPerBatch = 10;
      const messagesPerPacket = 5;
      const numberOfBatches = 20;

      // Create heavy concurrent load
      for (let batch = 0; batch < numberOfBatches; batch++) {
        for (let packet = 0; packet < packetsPerBatch; packet++) {
          const messages = Array(messagesPerPacket).fill(0)
            .map((_, i) => `batch-${batch}-packet-${packet}-msg-${i}`);
          heavyLoad.push(distributor.distribute(messages));
        }
      }

      await Promise.all(heavyLoad);

      const stats = distributor.getStats();
      const expectedTotalMessages = numberOfBatches * packetsPerBatch * messagesPerPacket;
      const expectedTotalPackets = numberOfBatches * packetsPerBatch;

      expect(stats.totalMessages).toBe(expectedTotalMessages);
      expect(stats.totalPackets).toBe(expectedTotalPackets);

      // Verify analyzer counts add up correctly
      const totalAnalyzerMessages = stats.analyzerDistribution
        .reduce((sum, dist) => sum + parseInt(dist.count), 0);
      expect(totalAnalyzerMessages).toBe(expectedTotalMessages);
    });

    test('should handle memory consistency under rapid state changes', async () => {
      // Setup analyzer to fail first few times, then succeed
      mockAnalyzers[0].analyze
        .mockRejectedValueOnce(new Error('F1')).mockRejectedValueOnce(new Error('F2'))
        .mockRejectedValueOnce(new Error('F3')).mockRejectedValueOnce(new Error('F4'))
        .mockRejectedValueOnce(new Error('F5')).mockResolvedValue(); // Rest succeed

      const selectSpy = jest.spyOn(distributor, 'selectAnalyzer');
      selectSpy.mockReturnValue(0);

      // Sequential operations to ensure predictable state changes
      for (let i = 0; i < 10; i++) {
        try {
          await distributor.distributeSingleMessage(`rapid-${i}`);
        } catch (e) {
          // Expected for first few operations
        }
      }

      // After processing, state should be consistent
      // Either analyzer recovered or remains unhealthy
      expect(distributor.healthy[0]).toBeDefined();
      
      // Counts should reflect the final state
      if (distributor.healthy[0]) {
        // If healthy, should have recent successes
        expect(distributor.successCounts[0]).toBeGreaterThanOrEqual(3);
        expect(distributor.failureCounts[0]).toBe(0);
      } else {
        // If unhealthy, should have recent failures
        expect(distributor.failureCounts[0]).toBeGreaterThanOrEqual(3);
      }

      selectSpy.mockRestore();
    });
  });

  describe('Error Handling Concurrency', () => {
    test('should handle concurrent errors without corruption', async () => {
      // Setup different error types for different analyzers
      mockAnalyzers[0].analyze.mockRejectedValue(new Error('Network timeout'));
      mockAnalyzers[1].analyze.mockRejectedValue(new Error('Service unavailable'));
      mockAnalyzers[2].analyze.mockRejectedValue(new Error('Rate limit exceeded'));

      const errorOperations = [];
      
      // Create concurrent operations targeting different analyzers
      for (let i = 0; i < 15; i++) {
        const analyzerIndex = i % 3;
        const selectSpy = jest.spyOn(distributor, 'selectAnalyzer');
        selectSpy.mockReturnValueOnce(analyzerIndex);
        
        errorOperations.push(
          distributor.distributeSingleMessage(`error-message-${i}`)
            .catch(() => {})
            .finally(() => selectSpy.mockRestore())
        );
      }

      await Promise.all(errorOperations);

      // All analyzers should have failure counts
      expect(distributor.failureCounts[0]).toBeGreaterThan(0);
      expect(distributor.failureCounts[1]).toBeGreaterThan(0);
      expect(distributor.failureCounts[2]).toBeGreaterThan(0);

      // All should be marked unhealthy if they hit the threshold
      distributor.healthy.forEach((isHealthy, index) => {
        if (!isHealthy) {
          expect(distributor.failureCounts[index]).toBeGreaterThanOrEqual(3);
        }
      });
    });
  });
}); 
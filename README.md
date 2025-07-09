# Logs Distributor System

A high-throughput, fault-tolerant logs distributor with weighted load balancing and real-time monitoring.

## Prerequisites

- Docker & Docker Compose
- Node.js 18+ (for local development)
- curl (for testing)

## Quick Start

### 1. Clone and Setup

```bash
git clone <repository-url>
cd logs-distributor
```

### 2. Start the Complete System

Choose one of the following options:

```bash
# Navigate to docker directory
cd docker

# Option 1: Basic system (distributor + 3 analyzers) - API only on port 8080
docker-compose up -d

# Option 2: With monitoring dashboard - API on port 8080 + Web UI on port 3000
docker-compose --profile monitoring up -d

# Option 3: With load testing - includes load generator service
docker-compose --profile testing up -d

# Option 4: Everything (monitoring + testing)
docker-compose --profile monitoring --profile testing up -d
```

### 3. Verify System is Running

```bash
# Check all services (from docker directory)
cd docker && docker-compose ps

# Check distributor health
curl http://localhost:8080/health

# Check analyzer statuses
curl http://localhost:8080/analyzers

# Open monitoring dashboard
open http://localhost:3000
```

## Testing the System

### Basic Functionality Test

```bash
# Send a test log packet
curl -X POST http://localhost:8080/logs \
  -H "Content-Type: application/json" \
  -d '{
    "id": "message-1",
    "agentId": "agent-1",
    "messages": [
      {
        "level": "INFO",
        "source": "my-service",
        "message": "Log message",
        "metadata": {"key": "value"}
      }
    ]
  }'
```

### Load Testing

```bash
# Run built-in load generator (from docker directory)
cd docker && docker-compose --profile testing up load-generator
```

## Fault Tolerance Demonstration

### Scenario 1: Bring Down an Analyzer

```bash
# 1. Check initial state
curl http://localhost:8080/analyzers

# 2. Start load testing (from docker directory)
cd docker && docker-compose --profile testing up -d load-generator

# 3. Kill analyzer-1 (highest weight)
docker-compose stop analyzer-1

# 4. Check that analyzer-1 is marked as unhealthy
curl http://localhost:8080/analyzers

# 5. Restart analyzer-1
docker-compose start analyzer-1
```

### Scenario 2: Simulate High Load Backpressure

```bash
# 1. Start with high load (from docker directory)
cd docker && docker-compose --profile testing up -d load-generator

# 2. Kill all analyzers except one
docker-compose stop analyzer-1 analyzer-2

# 3. Watch the system apply backpressure (429 errors)
curl http://localhost:8080/stats

# 4. Restart analyzers
docker-compose start analyzer-1 analyzer-2
```

### Scenario 3: Circuit Breaker Testing

```bash
# Navigate to docker directory first
cd docker

# 1. Watch an analyzer fail health checks
docker-compose logs -f analyzer-1

# 2. Kill analyzer-1 completely
docker-compose rm -f analyzer-1

# 3. Watch health checker mark it as unhealthy after 3 failures
curl http://localhost:8080/analyzers

# 4. Bring it back
docker-compose up -d analyzer-1

# 5. Watch it recover after 3 successful health checks
```

### API Endpoints

#### Main Distributor API (Port 8080)
```bash
# System health
curl http://localhost:8080/health

# Readiness check
curl http://localhost:8080/ready

# Detailed statistics
curl http://localhost:8080/stats

# Analyzer management
curl http://localhost:8080/analyzers
```

#### Monitoring Dashboard (Port 3000)
```bash
# Web interface (open in browser)
open http://localhost:3000

# Dashboard health check
curl http://localhost:3000/health

# API endpoints for dashboard data
curl http://localhost:3000/api/stats
curl http://localhost:3000/api/analyzers
```
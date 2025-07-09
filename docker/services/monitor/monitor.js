const express = require('express');
const http = require('http');
const { URL } = require('url');

const app = express();
const port = process.env.PORT || 3000;
const distributorUrl = process.env.DISTRIBUTOR_URL || 'http://localhost:8080';
const refreshInterval = parseInt(process.env.REFRESH_INTERVAL) || 2000;

let distributorStats = {};
let analyzerStats = [];

// Fetch statistics from distributor
async function fetchStats() {
  try {
    const statsUrl = new URL('/stats', distributorUrl);
    const analyzersUrl = new URL('/analyzers', distributorUrl);
    
    const [statsResponse, analyzersResponse] = await Promise.all([
      fetch(statsUrl.href),
      fetch(analyzersUrl.href)
    ]);
    
    if (statsResponse.ok && analyzersResponse.ok) {
      distributorStats = await statsResponse.json();
      analyzerStats = await analyzersResponse.json();
    }
  } catch (error) {
    console.error('Failed to fetch stats:', error.message);
  }
}

// Simple fetch polyfill for Node.js
function fetch(url) {
  return new Promise((resolve, reject) => {
    const urlObj = new URL(url);
    const options = {
      hostname: urlObj.hostname,
      port: urlObj.port || 80,
      path: urlObj.pathname + urlObj.search,
      method: 'GET'
    };
    
    const req = http.request(options, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        resolve({
          ok: res.statusCode >= 200 && res.statusCode < 300,
          status: res.statusCode,
          json: () => Promise.resolve(JSON.parse(data))
        });
      });
    });
    
    req.on('error', reject);
    req.setTimeout(5000, () => {
      req.destroy();
      reject(new Error('Request timeout'));
    });
    
    req.end();
  });
}

// Serve static HTML dashboard
app.get('/', (req, res) => {
  const html = `
<!DOCTYPE html>
<html>
<head>
    <title>Logs Distributor Monitor</title>
    <style>
        body { font-family: Arial, sans-serif; margin: 20px; background-color: #f5f5f5; }
        .container { max-width: 1200px; margin: 0 auto; }
        .header { background: #2c3e50; color: white; padding: 20px; border-radius: 8px; margin-bottom: 20px; }
        .stats-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(300px, 1fr)); gap: 20px; }
        .card { background: white; border-radius: 8px; padding: 20px; box-shadow: 0 2px 4px rgba(0,0,0,0.1); }
        .card h3 { margin-top: 0; color: #2c3e50; border-bottom: 2px solid #3498db; padding-bottom: 10px; }
        .metric { display: flex; justify-content: space-between; margin: 10px 0; }
        .metric-label { font-weight: bold; }
        .metric-value { color: #27ae60; }
        .analyzer { margin: 10px 0; padding: 10px; border-radius: 4px; }
        .analyzer.healthy { background-color: #d4edda; border: 1px solid #c3e6cb; }
        .analyzer.unhealthy { background-color: #f8d7da; border: 1px solid #f5c6cb; }
        .analyzer-header { display: flex; justify-content: space-between; align-items: center; font-weight: bold; }
        .status { padding: 2px 8px; border-radius: 4px; color: white; font-size: 12px; }
        .status.healthy { background-color: #28a745; }
        .status.unhealthy { background-color: #dc3545; }
        .progress-bar { width: 100%; height: 20px; background-color: #e9ecef; border-radius: 10px; overflow: hidden; margin: 5px 0; }
        .progress-fill { height: 100%; background-color: #007bff; transition: width 0.3s ease; }
        .refresh-info { text-align: center; margin: 20px 0; color: #6c757d; }
        .last-updated { font-size: 12px; color: #6c757d; }
    </style>
</head>
<body>
    <div class="container">
        <div class="header">
            <h1>Logs Distributor Monitor</h1>
            <div class="last-updated">Last Updated: <span id="lastUpdated">-</span></div>
        </div>
        
        <div class="stats-grid">
            <div class="card">
                <h3>Distributor Statistics</h3>
                <div class="metric">
                    <span class="metric-label">Packets Received:</span>
                    <span class="metric-value" id="packetsReceived">0</span>
                </div>
                <div class="metric">
                    <span class="metric-label">Packets Processed:</span>
                    <span class="metric-value" id="packetsProcessed">0</span>
                </div>
                <div class="metric">
                    <span class="metric-label">Packets Dropped:</span>
                    <span class="metric-value" id="packetsDropped">0</span>
                </div>
                <div class="metric">
                    <span class="metric-label">Errors:</span>
                    <span class="metric-value" id="errors">0</span>
                </div>
                <div class="metric">
                    <span class="metric-label">Average Latency:</span>
                    <span class="metric-value" id="avgLatency">0 ms</span>
                </div>
                <div class="metric">
                    <span class="metric-label">Queue Size:</span>
                    <span class="metric-value" id="queueSize">0</span>
                </div>
            </div>
            
            <div class="card">
                <h3>Analyzers Status</h3>
                <div id="analyzersContainer">
                    <p>Loading analyzers...</p>
                </div>
            </div>
            
            <div class="card">
                <h3>System Health</h3>
                <div class="metric">
                    <span class="metric-label">Healthy Analyzers:</span>
                    <span class="metric-value" id="healthyCount">0</span>
                </div>
                <div class="metric">
                    <span class="metric-label">Total Analyzers:</span>
                    <span class="metric-value" id="totalCount">0</span>
                </div>
                <div class="metric">
                    <span class="metric-label">Success Rate:</span>
                    <span class="metric-value" id="successRate">0%</span>
                </div>
                <div class="metric">
                    <span class="metric-label">Uptime:</span>
                    <span class="metric-value" id="uptime">0s</span>
                </div>
            </div>
        </div>
        
        <div class="refresh-info">
            <p>Auto-refreshing every ` + (refreshInterval/1000) + ` seconds</p>
            <button onclick="fetchData()">Refresh Now</button>
        </div>
    </div>

    <script>
        const REFRESH_INTERVAL = ` + refreshInterval + `;
        
        async function fetchData() {
            try {
                const [statsResponse, analyzersResponse] = await Promise.all([
                    fetch('/api/stats'),
                    fetch('/api/analyzers')
                ]);
                
                if (statsResponse.ok && analyzersResponse.ok) {
                    const stats = await statsResponse.json();
                    const analyzers = await analyzersResponse.json();
                    
                    updateStats(stats);
                    updateAnalyzers(analyzers);
                    
                    document.getElementById('lastUpdated').textContent = new Date().toLocaleTimeString();
                }
            } catch (error) {
                console.error('Failed to fetch data:', error);
            }
        }
        
        function updateStats(stats) {
            const distributor = stats.distributor || {};
            const server = stats.server || {};
            
            document.getElementById('packetsReceived').textContent = distributor.packetsReceived || 0;
            document.getElementById('packetsProcessed').textContent = distributor.packetsProcessed || 0;
            document.getElementById('packetsDropped').textContent = distributor.packetsDropped || 0;
            document.getElementById('errors').textContent = distributor.errors || 0;
            document.getElementById('avgLatency').textContent = (distributor.avgLatency || 0).toFixed(1) + ' ms';
            document.getElementById('queueSize').textContent = distributor.queueSize || 0;
            document.getElementById('uptime').textContent = (server.uptime || 0).toFixed(1) + 's';
        }
        
        function updateAnalyzers(analyzers) {
            const container = document.getElementById('analyzersContainer');
            const healthy = analyzers.filter(a => a.healthy).length;
            const total = analyzers.length;
            
            document.getElementById('healthyCount').textContent = healthy;
            document.getElementById('totalCount').textContent = total;
            document.getElementById('successRate').textContent = (total > 0 ? ((healthy / total) * 100).toFixed(1) : 0) + '%';
            
            container.innerHTML = analyzers.map(analyzer => 
                '<div class="analyzer ' + (analyzer.healthy ? 'healthy' : 'unhealthy') + '">' +
                    '<div class="analyzer-header">' +
                        '<span>' + analyzer.id + '</span>' +
                        '<span class="status ' + (analyzer.healthy ? 'healthy' : 'unhealthy') + '">' +
                            (analyzer.healthy ? 'HEALTHY' : 'UNHEALTHY') +
                        '</span>' +
                    '</div>' +
                    '<div style="font-size: 12px; margin-top: 5px;">' +
                        '<div>Endpoint: ' + analyzer.endpoint + '</div>' +
                        '<div>Weight: ' + analyzer.weight + '</div>' +
                        '<div>Last Response: ' + analyzer.lastResponseTime + 'ms</div>' +
                        '<div>Failure Rate: ' + analyzer.failureRate.toFixed(1) + '%</div>' +
                        '<div>Consecutive Failures: ' + analyzer.consecutiveFailures + '</div>' +
                    '</div>' +
                '</div>'
            ).join('');
        }
        
        // Initial fetch
        fetchData();
        
        // Auto-refresh
        setInterval(fetchData, REFRESH_INTERVAL);
    </script>
</body>
</html>`;
  res.send(html);
});

// API endpoints
app.get('/api/stats', (req, res) => {
  res.json(distributorStats);
});

app.get('/api/analyzers', (req, res) => {
  res.json(analyzerStats);
});

// Health check
app.get('/health', (req, res) => {
  res.json({ 
    status: 'healthy', 
    timestamp: new Date().toISOString(),
    uptime: process.uptime()
  });
});

// Start fetching stats
setInterval(fetchStats, refreshInterval);
fetchStats(); // Initial fetch

app.listen(port, '0.0.0.0', () => {
  console.log('Monitor dashboard listening on port ' + port);
  console.log('Monitoring distributor at: ' + distributorUrl);
  console.log('Refresh interval: ' + refreshInterval + 'ms');
}); 
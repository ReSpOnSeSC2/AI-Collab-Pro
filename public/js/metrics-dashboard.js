/**
 * Metrics Dashboard JavaScript
 * Handles data fetching, chart rendering, and UI updates
 */

class MetricsDashboard {
    constructor() {
        this.currentTimeRange = 'week';
        this.charts = {};
        this.data = null;
        
        this.init();
    }

    async init() {
        // Skip auth check if we're in settings page (already authenticated)
        if (!document.querySelector('#metrics-tab')) {
            // Only check auth for standalone page
            if (typeof checkAuthStatus === 'function') {
                const isAuthenticated = await checkAuthStatus();
                if (!isAuthenticated) {
                    window.location.href = '/login.html?redirect=/metrics-dashboard.html';
                    return;
                }
            }
        }

        // Initialize event listeners
        this.initEventListeners();
        
        // Load initial data
        await this.loadDashboardData();
    }

    initEventListeners() {
        // Time range selector
        document.querySelectorAll('.time-range-btn').forEach(btn => {
            btn.addEventListener('click', (e) => {
                // Update active state
                document.querySelectorAll('.time-range-btn').forEach(b => b.classList.remove('active'));
                e.target.classList.add('active');
                
                // Load new data
                this.currentTimeRange = e.target.dataset.range;
                this.loadDashboardData();
            });
        });
    }

    async loadDashboardData() {
        this.showLoading(true);
        
        try {
            // Fetch dashboard data
            const dashboardResponse = await fetch(`/api/metrics/dashboard?timeRange=${this.currentTimeRange}`, {
                credentials: 'include'
            });
            
            if (!dashboardResponse.ok) {
                throw new Error('Failed to fetch dashboard data');
            }
            
            const dashboardData = await dashboardResponse.json();
            this.data = dashboardData.data;
            
            // Fetch additional data
            const [leaderboardData, optimizationData, chemistryData, trendsData] = await Promise.all([
                this.fetchLeaderboard(),
                this.fetchOptimizationSuggestions(),
                this.fetchTeamChemistry(),
                this.fetchQualityTrends()
            ]);
            
            // Update UI
            this.updateSummaryCards();
            this.updateCharts(trendsData, leaderboardData, chemistryData);
            this.updateOptimizationSuggestions(optimizationData);
            this.updateCollaborationAnalysis();
            
        } catch (error) {
            console.error('Error loading dashboard data:', error);
            this.showError('Failed to load metrics data. Please try again.');
        } finally {
            this.showLoading(false);
        }
    }

    async fetchLeaderboard() {
        const response = await fetch('/api/metrics/leaderboard?period=weekly&limit=10', {
            credentials: 'include'
        });
        const data = await response.json();
        return data.data;
    }

    async fetchOptimizationSuggestions() {
        const response = await fetch('/api/metrics/cost-optimization', {
            credentials: 'include'
        });
        const data = await response.json();
        return data.data;
    }

    async fetchTeamChemistry() {
        const response = await fetch(`/api/metrics/team-chemistry?timeRange=${this.currentTimeRange}`, {
            credentials: 'include'
        });
        const data = await response.json();
        return data.data;
    }

    async fetchQualityTrends() {
        const response = await fetch(`/api/metrics/quality-trends?timeRange=${this.currentTimeRange}&groupBy=day`, {
            credentials: 'include'
        });
        const data = await response.json();
        return data.data;
    }

    updateSummaryCards() {
        const stats = this.data.stats;
        
        const elements = {
            'total-collaborations': stats.totalCollaborations,
            'avg-quality-score': `${stats.avgQualityScore}%`,
            'total-cost': `$${stats.totalCost}`,
            'avg-duration': `${stats.avgDuration}s`
        };
        
        for (const [id, value] of Object.entries(elements)) {
            const element = document.getElementById(id);
            if (element) {
                element.textContent = value;
            }
        }
    }

    updateCharts(trendsData, leaderboardData, chemistryData) {
        // Quality Trends Chart
        this.createQualityTrendsChart(trendsData);
        
        // Model Leaderboard
        this.updateLeaderboard(leaderboardData);
        
        // Cost vs Quality Chart
        this.createCostQualityChart();
        
        // Team Chemistry Chart
        this.createTeamChemistryChart(chemistryData);
    }

    createQualityTrendsChart(trendsData) {
        const canvas = document.getElementById('quality-trends-chart');
        if (!canvas) return;
        const ctx = canvas.getContext('2d');
        
        // Destroy existing chart if it exists
        if (this.charts.qualityTrends) {
            this.charts.qualityTrends.destroy();
        }
        
        const labels = trendsData.trends.map(t => {
            const date = new Date(t.date);
            return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
        });
        
        const datasets = [{
            label: 'Overall Quality',
            data: trendsData.trends.map(t => t.avgQuality),
            borderColor: '#4F46E5',
            backgroundColor: 'rgba(79, 70, 229, 0.1)',
            tension: 0.4
        }];
        
        // Add collaboration type trends
        const collabTypes = ['parallel', 'sequential', 'voting', 'critique'];
        const colors = ['#10B981', '#F59E0B', '#EF4444', '#8B5CF6'];
        
        collabTypes.forEach((type, index) => {
            const data = trendsData.trends.map(t => t.byType[type]?.avgQuality || null);
            if (data.some(d => d !== null)) {
                datasets.push({
                    label: type.charAt(0).toUpperCase() + type.slice(1),
                    data: data,
                    borderColor: colors[index],
                    backgroundColor: colors[index] + '20',
                    tension: 0.4,
                    hidden: true
                });
            }
        });
        
        this.charts.qualityTrends = new Chart(ctx, {
            type: 'line',
            data: { labels, datasets },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                plugins: {
                    legend: {
                        position: 'bottom'
                    },
                    tooltip: {
                        mode: 'index',
                        intersect: false
                    }
                },
                scales: {
                    y: {
                        beginAtZero: true,
                        max: 100,
                        ticks: {
                            callback: function(value) {
                                return value + '%';
                            }
                        }
                    }
                }
            }
        });
    }

    updateLeaderboard(leaderboardData) {
        const container = document.getElementById('model-leaderboard');
        if (!container) return;
        container.innerHTML = '';
        
        leaderboardData.forEach((item, index) => {
            const rankClass = index === 0 ? 'gold' : index === 1 ? 'silver' : index === 2 ? 'bronze' : '';
            
            const itemElement = document.createElement('div');
            itemElement.className = 'leaderboard-item';
            itemElement.innerHTML = `
                <div class="leaderboard-rank ${rankClass}">#${index + 1}</div>
                <div class="leaderboard-model">
                    <div class="model-name">${item.model}</div>
                    <div class="model-provider">${item.provider}</div>
                </div>
                <div class="leaderboard-score">
                    <div class="score-value">${Math.round(item.metrics.avgQualityScore)}</div>
                    <div class="score-label">Quality Score</div>
                </div>
            `;
            container.appendChild(itemElement);
        });
    }

    createCostQualityChart() {
        const canvas = document.getElementById('cost-quality-chart');
        if (!canvas) return;
        const ctx = canvas.getContext('2d');
        
        if (this.charts.costQuality) {
            this.charts.costQuality.destroy();
        }
        
        // Prepare data from metrics
        const modelData = {};
        
        this.data.metrics.forEach(metric => {
            metric.modelMetrics.forEach(model => {
                const key = `${model.provider}:${model.model}`;
                if (!modelData[key]) {
                    modelData[key] = {
                        totalCost: 0,
                        totalQuality: 0,
                        count: 0
                    };
                }
                modelData[key].totalCost += model.cost;
                modelData[key].totalQuality += model.qualityScore;
                modelData[key].count += 1;
            });
        });
        
        const scatterData = Object.entries(modelData).map(([key, data]) => ({
            x: data.totalCost / data.count,
            y: data.totalQuality / data.count,
            label: key
        }));
        
        this.charts.costQuality = new Chart(ctx, {
            type: 'scatter',
            data: {
                datasets: [{
                    label: 'Models',
                    data: scatterData,
                    backgroundColor: '#4F46E5',
                    pointRadius: 8,
                    pointHoverRadius: 10
                }]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                plugins: {
                    tooltip: {
                        callbacks: {
                            label: function(context) {
                                const point = context.raw;
                                return [
                                    point.label,
                                    `Cost: $${point.x.toFixed(4)}`,
                                    `Quality: ${Math.round(point.y)}%`
                                ];
                            }
                        }
                    }
                },
                scales: {
                    x: {
                        title: {
                            display: true,
                            text: 'Average Cost ($)'
                        }
                    },
                    y: {
                        title: {
                            display: true,
                            text: 'Average Quality Score (%)'
                        },
                        beginAtZero: true,
                        max: 100
                    }
                }
            }
        });
    }

    createTeamChemistryChart(chemistryData) {
        const canvas = document.getElementById('teamChemistryChart');
        if (!canvas) return;
        const ctx = canvas.getContext('2d');
        
        if (this.charts.teamChemistry) {
            this.charts.teamChemistry.destroy();
        }
        
        // Get top 5 teams by synergy
        const topTeams = chemistryData.teamAnalysis.slice(0, 5);
        
        const labels = topTeams.map(team => 
            team.models.map(m => m.split(':')[1]).join(' + ')
        );
        
        this.charts.teamChemistry = new Chart(ctx, {
            type: 'radar',
            data: {
                labels: ['Consensus', 'Diversity', 'Synergy'],
                datasets: topTeams.map((team, index) => ({
                    label: labels[index],
                    data: [team.avgConsensus, team.avgDiversity, team.avgSynergy],
                    borderColor: `hsl(${index * 72}, 70%, 50%)`,
                    backgroundColor: `hsla(${index * 72}, 70%, 50%, 0.2)`,
                    pointBackgroundColor: `hsl(${index * 72}, 70%, 50%)`,
                    pointBorderColor: '#fff',
                    pointHoverBackgroundColor: '#fff',
                    pointHoverBorderColor: `hsl(${index * 72}, 70%, 50%)`
                }))
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                plugins: {
                    legend: {
                        position: 'bottom'
                    }
                },
                scales: {
                    r: {
                        beginAtZero: true,
                        max: 100,
                        ticks: {
                            callback: function(value) {
                                return value + '%';
                            }
                        }
                    }
                }
            }
        });
    }

    updateOptimizationSuggestions(optimizationData) {
        const container = document.getElementById('optimization-suggestions');
        if (!container) return;
        container.innerHTML = '';
        
        if (!optimizationData.suggestions || optimizationData.suggestions.length === 0) {
            container.innerHTML = '<p class="no-suggestions">No optimization suggestions at this time. Keep collaborating!</p>';
            return;
        }
        
        optimizationData.suggestions.forEach(suggestion => {
            const card = document.createElement('div');
            card.className = `suggestion-card ${suggestion.priority}-priority`;
            
            card.innerHTML = `
                <div class="suggestion-header">
                    <span class="suggestion-type">${this.formatSuggestionType(suggestion.type)}</span>
                    <span class="suggestion-priority priority-${suggestion.priority}">${suggestion.priority.toUpperCase()}</span>
                </div>
                <div class="suggestion-message">${suggestion.message}</div>
                ${suggestion.potentialSavings ? `<div class="suggestion-savings">Potential savings: $${suggestion.potentialSavings}</div>` : ''}
            `;
            
            container.appendChild(card);
        });
    }

    updateCollaborationAnalysis() {
        const typeStats = {};
        
        // Calculate stats by collaboration type
        this.data.metrics.forEach(metric => {
            if (!typeStats[metric.collaborationType]) {
                typeStats[metric.collaborationType] = {
                    count: 0,
                    totalQuality: 0
                };
            }
            typeStats[metric.collaborationType].count++;
            typeStats[metric.collaborationType].totalQuality += metric.overallQualityScore;
        });
        
        // Update UI
        ['parallel', 'sequential', 'voting', 'critique'].forEach(type => {
            const stats = typeStats[type] || { count: 0, totalQuality: 0 };
            const countEl = document.getElementById(`${type}-count`);
            const qualityEl = document.getElementById(`${type}-quality`);
            if (countEl) countEl.textContent = stats.count;
            if (qualityEl) qualityEl.textContent = 
                stats.count > 0 ? `${Math.round(stats.totalQuality / stats.count)}%` : '0%';
        });
    }

    formatSuggestionType(type) {
        const typeMap = {
            'model_switch': 'Model Optimization',
            'collaboration_type': 'Collaboration Strategy',
            'cost_alert': 'Cost Alert',
            'performance': 'Performance Improvement'
        };
        return typeMap[type] || type;
    }

    showLoading(show) {
        const overlay = document.getElementById('loading-overlay');
        if (!overlay) {
            // Create a simple loading indicator if overlay doesn't exist
            if (show) {
                console.log('Loading metrics data...');
            }
            return;
        }
        if (show) {
            overlay.classList.remove('hidden');
        } else {
            overlay.classList.add('hidden');
        }
    }

    showError(message) {
        // You could implement a toast notification here
        alert(message);
    }
}

// Initialize Metrics Dashboard
function initializeMetricsDashboard() {
    if (!window.metricsDashboard) {
        window.metricsDashboard = new MetricsDashboard();
    }
}

// For standalone page, initialize on DOM ready
if (window.location.pathname.includes('metrics-dashboard.html')) {
    document.addEventListener('DOMContentLoaded', initializeMetricsDashboard);
}

// Export for settings page
window.initializeMetricsDashboard = initializeMetricsDashboard;
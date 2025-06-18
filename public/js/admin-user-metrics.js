// Admin User Metrics
(function() {
    let charts = {};
    let currentMetric = 'quality';
    let metricsData = null;

    // Initialize
    document.addEventListener('DOMContentLoaded', function() {
        initializeFilters();
        initializeCharts();
        initializeTabs();
        loadMetricsData();
        
        // Refresh data every minute
        setInterval(loadMetricsData, 60000);
    });

    // Initialize Filters
    function initializeFilters() {
        const filters = ['time-range-filter', 'tier-filter', 'mode-filter'];
        filters.forEach(filterId => {
            document.getElementById(filterId).addEventListener('change', loadMetricsData);
        });
    }

    // Load Metrics Data
    async function loadMetricsData() {
        try {
            const timeRange = document.getElementById('time-range-filter').value;
            const tier = document.getElementById('tier-filter').value;
            const mode = document.getElementById('mode-filter').value;

            const params = new URLSearchParams({
                timeRange,
                tier,
                mode
            });

            const response = await fetch(`/api/admin/user-metrics?${params}`);
            if (!response.ok) throw new Error('Failed to load metrics data');
            
            metricsData = await response.json();
            updateAllCharts();
            updateTopUsers();
            updateActivityHeatmap();
            updateUserTable();
        } catch (error) {
            console.error('Error loading metrics data:', error);
            showError('Failed to load metrics data');
        }
    }

    // Initialize Charts
    function initializeCharts() {
        // Average Quality Score Chart
        charts.avgQuality = new Chart(document.getElementById('avgQualityChart'), {
            type: 'line',
            data: {
                labels: [],
                datasets: [{
                    label: 'Average Quality Score',
                    data: [],
                    borderColor: '#5D5FEF',
                    backgroundColor: 'rgba(93, 95, 239, 0.1)',
                    tension: 0.4
                }]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                plugins: {
                    legend: { display: false }
                },
                scales: {
                    y: {
                        beginAtZero: true,
                        max: 100
                    }
                }
            }
        });

        // User Engagement Chart
        charts.engagement = new Chart(document.getElementById('engagementChart'), {
            type: 'bar',
            data: {
                labels: ['Daily Active', 'Weekly Active', 'Monthly Active'],
                datasets: [{
                    label: 'Users',
                    data: [],
                    backgroundColor: ['#4CAF50', '#2196F3', '#FF9800']
                }]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                plugins: {
                    legend: { display: false }
                }
            }
        });

        // Cost Efficiency Chart
        charts.costEfficiency = new Chart(document.getElementById('costEfficiencyChart'), {
            type: 'scatter',
            data: {
                datasets: [{
                    label: 'Users',
                    data: [],
                    backgroundColor: 'rgba(255, 99, 132, 0.5)'
                }]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                scales: {
                    x: {
                        title: {
                            display: true,
                            text: 'Total Cost ($)'
                        }
                    },
                    y: {
                        title: {
                            display: true,
                            text: 'Quality Score'
                        }
                    }
                }
            }
        });

        // Model Combination Chart
        charts.modelCombination = new Chart(document.getElementById('modelCombinationChart'), {
            type: 'bubble',
            data: {
                datasets: []
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                scales: {
                    x: {
                        title: {
                            display: true,
                            text: 'Usage Count'
                        }
                    },
                    y: {
                        title: {
                            display: true,
                            text: 'Average Quality Score'
                        }
                    }
                }
            }
        });
    }

    // Update All Charts
    function updateAllCharts() {
        if (!metricsData) return;

        // Update Average Quality Chart
        charts.avgQuality.data.labels = metricsData.qualityTrend.labels;
        charts.avgQuality.data.datasets[0].data = metricsData.qualityTrend.data;
        charts.avgQuality.update();

        // Update Engagement Chart
        charts.engagement.data.datasets[0].data = [
            metricsData.engagement.daily,
            metricsData.engagement.weekly,
            metricsData.engagement.monthly
        ];
        charts.engagement.update();

        // Update Cost Efficiency Chart
        charts.costEfficiency.data.datasets[0].data = metricsData.users.map(user => ({
            x: user.totalCost,
            y: user.avgQuality
        }));
        charts.costEfficiency.update();

        // Update Model Combination Chart
        const modelCombinations = processModelCombinations(metricsData.modelCombinations);
        charts.modelCombination.data.datasets = modelCombinations;
        charts.modelCombination.update();
    }

    // Process Model Combinations
    function processModelCombinations(combinations) {
        return combinations.map((combo, index) => ({
            label: combo.models.join(' + '),
            data: [{
                x: combo.usageCount,
                y: combo.avgQuality,
                r: Math.sqrt(combo.usageCount) * 3
            }],
            backgroundColor: `hsla(${index * 30}, 70%, 50%, 0.5)`
        }));
    }

    // Initialize Tabs
    function initializeTabs() {
        document.querySelectorAll('.tab-btn').forEach(btn => {
            btn.addEventListener('click', function() {
                document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
                btn.classList.add('active');
                currentMetric = btn.dataset.metric;
                updateTopUsers();
            });
        });
    }

    // Update Top Users
    function updateTopUsers() {
        if (!metricsData) return;

        const list = document.getElementById('top-users-list');
        list.innerHTML = '';

        let sortedUsers = [...metricsData.users];
        
        switch(currentMetric) {
            case 'quality':
                sortedUsers.sort((a, b) => b.avgQuality - a.avgQuality);
                break;
            case 'usage':
                sortedUsers.sort((a, b) => b.collaborationCount - a.collaborationCount);
                break;
            case 'efficiency':
                sortedUsers.sort((a, b) => (b.avgQuality / b.totalCost) - (a.avgQuality / a.totalCost));
                break;
        }

        sortedUsers.slice(0, 10).forEach((user, index) => {
            const li = document.createElement('li');
            li.className = 'top-user-item';
            
            let metricValue;
            switch(currentMetric) {
                case 'quality':
                    metricValue = `${user.avgQuality.toFixed(1)}/100`;
                    break;
                case 'usage':
                    metricValue = `${user.collaborationCount} collaborations`;
                    break;
                case 'efficiency':
                    metricValue = `${(user.avgQuality / user.totalCost).toFixed(2)} pts/$`;
                    break;
            }
            
            li.innerHTML = `
                <div style="display: flex; align-items: center;">
                    <div class="user-rank rank-${index < 3 ? index + 1 : 'other'}">${index + 1}</div>
                    <div>
                        <div style="font-weight: 500;">${user.name}</div>
                        <div style="font-size: 12px; color: var(--text-secondary);">${user.email}</div>
                    </div>
                </div>
                <div style="font-weight: 600;">${metricValue}</div>
            `;
            
            list.appendChild(li);
        });
    }

    // Update Activity Heatmap
    function updateActivityHeatmap() {
        if (!metricsData || !metricsData.activityHeatmap) return;

        const heatmap = document.getElementById('activity-heatmap');
        heatmap.innerHTML = '';

        metricsData.activityHeatmap.forEach(week => {
            week.forEach(day => {
                const cell = document.createElement('div');
                cell.className = `heatmap-cell level-${getActivityLevel(day.count)}`;
                cell.title = `${day.date}: ${day.count} collaborations`;
                heatmap.appendChild(cell);
            });
        });
    }

    // Get Activity Level
    function getActivityLevel(count) {
        if (count === 0) return 0;
        if (count <= 5) return 1;
        if (count <= 10) return 2;
        if (count <= 20) return 3;
        return 4;
    }

    // Update User Table
    function updateUserTable() {
        if (!metricsData) return;

        const tbody = document.getElementById('user-metrics-table');
        tbody.innerHTML = '';

        metricsData.users.forEach(user => {
            const row = document.createElement('tr');
            
            const favoriteModels = user.favoriteModels.slice(0, 3).join(', ');
            const costPerQuality = user.totalCost > 0 ? (user.totalCost / user.avgQuality).toFixed(3) : '0';
            
            row.innerHTML = `
                <td>
                    <div style="display: flex; align-items: center;">
                        <img src="${user.picture || '/img/default-avatar.png'}" 
                             alt="${user.name}" 
                             style="width: 32px; height: 32px; border-radius: 50%; margin-right: 10px;">
                        <div>
                            <div style="font-weight: 500;">${user.name}</div>
                            <div style="font-size: 12px; color: var(--text-secondary);">${user.email}</div>
                        </div>
                    </div>
                </td>
                <td>${user.collaborationCount}</td>
                <td>${user.avgQuality.toFixed(1)}</td>
                <td>$${user.totalCost.toFixed(2)}</td>
                <td>$${costPerQuality}</td>
                <td>${user.favoriteMode || 'N/A'}</td>
                <td>${favoriteModels || 'N/A'}</td>
                <td>
                    <button class="btn btn-sm btn-outline" onclick="viewUserMetrics('${user.email}')">
                        <i class="fas fa-chart-line"></i> Details
                    </button>
                </td>
            `;
            
            tbody.appendChild(row);
        });
    }

    // View User Metrics
    window.viewUserMetrics = function(email) {
        // Open user-specific metrics in a modal or new page
        window.location.href = `/admin-users.html?user=${email}&tab=metrics`;
    };

    // Export Metrics Report
    window.exportMetricsReport = async function() {
        try {
            const timeRange = document.getElementById('time-range-filter').value;
            const params = new URLSearchParams({ timeRange });
            
            const response = await fetch(`/api/admin/export-metrics-report?${params}`);
            if (!response.ok) throw new Error('Failed to export report');
            
            const blob = await response.blob();
            const url = window.URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = `user-metrics-report-${new Date().toISOString().split('T')[0]}.csv`;
            document.body.appendChild(a);
            a.click();
            window.URL.revokeObjectURL(url);
            document.body.removeChild(a);
            
            showSuccess('Report exported successfully');
        } catch (error) {
            console.error('Error exporting report:', error);
            showError('Failed to export report');
        }
    };

    // Utility Functions
    function showError(message) {
        console.error(message);
        // Implement toast notification
    }

    function showSuccess(message) {
        console.log(message);
        // Implement toast notification
    }
})();
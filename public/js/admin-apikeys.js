// Admin API Keys Management
(function() {
    let allUsers = [];
    let providerChart = null;

    // Initialize
    document.addEventListener('DOMContentLoaded', function() {
        loadAPIKeysData();
        initializeSearch();
        initializeCharts();
        
        // Refresh data every 30 seconds
        setInterval(loadAPIKeysData, 30000);
    });

    // Load API Keys Data
    async function loadAPIKeysData() {
        try {
            const response = await fetch('/api/admin/api-keys-overview');
            if (!response.ok) throw new Error('Failed to load API keys data');
            
            const data = await response.json();
            updateOverviewCards(data.overview);
            updateUsersTable(data.users);
            updateProviderChart(data.providerStats);
            allUsers = data.users;
        } catch (error) {
            console.error('Error loading API keys data:', error);
            showError('Failed to load API keys data');
        }
    }

    // Update Overview Cards
    function updateOverviewCards(overview) {
        document.getElementById('total-users-with-keys').textContent = overview.totalUsersWithKeys || 0;
        document.getElementById('total-active-keys').textContent = overview.totalActiveKeys || 0;
        document.getElementById('total-api-requests').textContent = formatNumber(overview.totalRequests || 0);
        document.getElementById('total-api-cost').textContent = '$' + (overview.totalCost || 0).toFixed(2);
    }

    // Update Users Table
    function updateUsersTable(users) {
        const tbody = document.getElementById('users-api-keys-table');
        tbody.innerHTML = '';

        users.forEach(user => {
            const row = document.createElement('tr');
            
            // Calculate provider badges (using provider status, not actual keys)
            const providerBadges = Object.entries(user.providers || {})
                .filter(([_, isActive]) => isActive)
                .map(([provider, _]) => 
                    `<span class="provider-badge provider-${provider}">${provider}</span>`
                ).join('');

            row.innerHTML = `
                <td>
                    <div class="user-info">
                        <img src="${user.picture || '/img/default-avatar.png'}" alt="${user.name}" class="user-avatar">
                        <div>
                            <div class="user-name">${user.name}</div>
                            <div class="user-email">${user.email}</div>
                        </div>
                    </div>
                </td>
                <td>${providerBadges || '<span class="text-muted">No keys</span>'}</td>
                <td>${formatNumber(user.totalRequests || 0)}</td>
                <td>$${(user.totalCost || 0).toFixed(2)}</td>
                <td>${formatDate(user.lastApiActivity)}</td>
                <td>
                    <span class="status-badge ${user.hasActiveKeys ? 'status-active' : 'status-inactive'}">
                        ${user.hasActiveKeys ? 'Active' : 'Inactive'}
                    </span>
                </td>
                <td>
                    <button class="btn btn-sm btn-outline" onclick="viewUserDetails('${user.email}')">
                        <i class="fas fa-eye"></i> View
                    </button>
                </td>
            `;
            
            tbody.appendChild(row);
        });
    }

    // Initialize Search
    function initializeSearch() {
        const searchInput = document.getElementById('user-search');
        searchInput.addEventListener('input', function(e) {
            const searchTerm = e.target.value.toLowerCase();
            filterUsers(searchTerm);
        });
    }

    // Filter Users
    function filterUsers(searchTerm) {
        const filteredUsers = allUsers.filter(user => 
            user.name.toLowerCase().includes(searchTerm) ||
            user.email.toLowerCase().includes(searchTerm)
        );
        updateUsersTable(filteredUsers);
    }

    // Initialize Charts
    function initializeCharts() {
        const ctx = document.getElementById('providerDistributionChart').getContext('2d');
        providerChart = new Chart(ctx, {
            type: 'doughnut',
            data: {
                labels: [],
                datasets: [{
                    data: [],
                    backgroundColor: [
                        '#74aa9c', // OpenAI
                        '#d97757', // Anthropic
                        '#4285f4', // Google
                        '#6366f1', // DeepSeek
                        '#1da1f2', // Grok
                        '#8b5cf6'  // Llama
                    ]
                }]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                plugins: {
                    legend: {
                        position: 'right'
                    }
                }
            }
        });
    }

    // Update Provider Chart
    function updateProviderChart(providerStats) {
        if (!providerChart) return;

        const labels = Object.keys(providerStats);
        const data = Object.values(providerStats);

        providerChart.data.labels = labels;
        providerChart.data.datasets[0].data = data;
        providerChart.update();
    }

    // View User Details
    window.viewUserDetails = function(email) {
        // Navigate to user details with API keys tab selected
        window.location.href = `/admin-users.html?user=${email}&tab=apikeys`;
    };

    // Export Provider Report
    window.exportProviderReport = async function() {
        try {
            const response = await fetch('/api/admin/export-provider-report');
            if (!response.ok) throw new Error('Failed to export report');
            
            const blob = await response.blob();
            const url = window.URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = `provider-usage-report-${new Date().toISOString().split('T')[0]}.csv`;
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
    function formatNumber(num) {
        if (num >= 1000000) return (num / 1000000).toFixed(1) + 'M';
        if (num >= 1000) return (num / 1000).toFixed(1) + 'K';
        return num.toString();
    }

    function formatDate(dateString) {
        if (!dateString) return 'Never';
        const date = new Date(dateString);
        const now = new Date();
        const diff = now - date;
        
        if (diff < 60000) return 'Just now';
        if (diff < 3600000) return Math.floor(diff / 60000) + ' min ago';
        if (diff < 86400000) return Math.floor(diff / 3600000) + ' hours ago';
        if (diff < 604800000) return Math.floor(diff / 86400000) + ' days ago';
        
        return date.toLocaleDateString();
    }

    function showError(message) {
        // You can implement a toast notification here
        console.error(message);
    }

    function showSuccess(message) {
        // You can implement a toast notification here
        console.log(message);
    }
})();
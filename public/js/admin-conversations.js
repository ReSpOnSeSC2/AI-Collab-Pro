/**
 * Admin Conversations Management
 * Connects the admin conversations interface to the backend API
 */

document.addEventListener('DOMContentLoaded', function() {
    // Toggle sidebar on mobile
    document.querySelector('.show-sidebar-btn')?.addEventListener('click', function() {
        document.querySelector('.sidebar').classList.toggle('show');
    });
    
    // Enable tooltips
    const tooltipTriggerList = [].slice.call(document.querySelectorAll('[data-bs-toggle="tooltip"]'));
    tooltipTriggerList.map(function (tooltipTriggerEl) {
        return new bootstrap.Tooltip(tooltipTriggerEl);
    });
    
    // UI Elements
    const conversationsTableBody = document.getElementById('conversations-table-body');
    const conversationModal = new bootstrap.Modal(document.getElementById('conversation-modal'));
    const deleteModal = new bootstrap.Modal(document.getElementById('delete-confirm-modal'));
    
    // Pagination state
    let currentPage = 1;
    let totalPages = 1;
    let pageSize = 10;
    let currentFilters = {};
    let currentConversationId = null;
    let dateRange = 30; // Default to 30 days
    
    // Initialize dashboard
    loadDashboardStats();
    initializeCharts();
    loadConversations();
    
    // Add event listeners
    document.getElementById('date-range').addEventListener('change', handleDateRangeChange);
    document.getElementById('apply-date-filter').addEventListener('click', applyDateFilter);
    document.querySelectorAll('[data-scale]').forEach(button => {
        button.addEventListener('click', function() {
            document.querySelector('[data-scale].active').classList.remove('active');
            this.classList.add('active');
            updateTrendsChart(this.getAttribute('data-scale'));
        });
    });
    document.getElementById('prev-page').addEventListener('click', () => changePage(currentPage - 1));
    document.getElementById('next-page').addEventListener('click', () => changePage(currentPage + 1));
    document.getElementById('search-conversations-btn').addEventListener('click', searchConversations);
    document.getElementById('search-conversations').addEventListener('keypress', function(e) {
        if (e.key === 'Enter') {
            searchConversations();
        }
    });
    document.getElementById('delete-conversation-btn').addEventListener('click', confirmDeleteConversation);
    document.getElementById('confirm-delete-btn').addEventListener('click', deleteConversation);
    document.getElementById('export-conversation-btn').addEventListener('click', exportConversation);
    document.getElementById('export-mode-chart').addEventListener('click', () => exportChartAsImage('mode-chart', 'conversations-by-mode'));
    document.getElementById('export-model-chart').addEventListener('click', () => exportChartAsImage('model-chart', 'model-usage-distribution'));
    document.getElementById('export-trend-chart').addEventListener('click', () => exportChartAsImage('trends-chart', 'usage-trends'));
    
    /**
     * Handle date range selection
     */
    function handleDateRangeChange() {
        const customDateFields = document.querySelectorAll('.custom-date-range');
        if (this.value === 'custom') {
            customDateFields.forEach(field => field.classList.remove('d-none'));
        } else {
            customDateFields.forEach(field => field.classList.add('d-none'));
        }
    }
    
    /**
     * Apply date filter
     */
    function applyDateFilter() {
        const dateRangeSelect = document.getElementById('date-range');
        if (dateRangeSelect.value === 'custom') {
            const startDate = document.getElementById('start-date').value;
            const endDate = document.getElementById('end-date').value;
            
            if (!startDate || !endDate) {
                alert('Please select both start and end dates.');
                return;
            }
            
            currentFilters.startDate = startDate;
            currentFilters.endDate = endDate;
            dateRange = null; // Custom range
        } else {
            dateRange = parseInt(dateRangeSelect.value);
            currentFilters.startDate = null;
            currentFilters.endDate = null;
        }
        
        // Refresh dashboard with new date filter
        loadDashboardStats();
        refreshCharts();
        loadConversations();
    }
    
    /**
     * Load dashboard statistics from API
     */
    async function loadDashboardStats() {
        showSpinner();
        
        try {
            const queryParams = new URLSearchParams();
            queryParams.append('days', dateRange || 30);
            
            const response = await fetch(`/api/admin/stats/conversations?${queryParams}`);
            
            if (!response.ok) {
                throw new Error(`Server returned ${response.status}: ${response.statusText}`);
            }
            
            const data = await response.json();
            
            if (data.success) {
                document.getElementById('total-conversations').textContent = data.stats.totalConversations.toLocaleString();
                document.getElementById('total-messages').textContent = data.stats.totalMessages.toLocaleString();
                document.getElementById('avg-length').textContent = data.stats.avgMessagesPerConversation.toLocaleString();
                
                // Simulate sentiment score (in a real app, this would come from the API)
                const sentiment = parseFloat((3.5 + Math.random()).toFixed(1));
                document.getElementById('sentiment-score').textContent = sentiment.toString();
                
                // Set sentiment class
                const sentimentEl = document.getElementById('sentiment-score');
                if (sentiment >= 4) {
                    sentimentEl.className = 'sentiment-positive';
                } else if (sentiment >= 3) {
                    sentimentEl.className = 'sentiment-neutral';
                } else {
                    sentimentEl.className = 'sentiment-negative';
                }
                
                // Calculate change percentages (in a real app, this would come from the API)
                const conversationsChange = Math.floor(Math.random() * 30) - 10;
                const messagesChange = Math.floor(Math.random() * 30) - 10;
                const lengthChange = Math.floor(Math.random() * 10) - 5;
                const sentimentChange = Math.floor(Math.random() * 6) - 2;
                
                updateChangeIndicator('conversations-change', conversationsChange);
                updateChangeIndicator('messages-change', messagesChange);
                updateChangeIndicator('length-change', lengthChange);
                updateChangeIndicator('sentiment-change', sentimentChange);
                
                // Update charts with real data
                if (window.modeChart && data.stats.modeDistribution) {
                    updateModeChart(data.stats.modeDistribution);
                }
                
                if (window.modelChart && data.stats.modelDistribution) {
                    updateModelChart(data.stats.modelDistribution);
                }
                
                if (window.trendsChart && data.stats.dailyTrend) {
                    updateDailyTrendChart(data.stats.dailyTrend);
                }
            } else {
                console.error('Failed to load conversation statistics:', data.error);
            }
        } catch (error) {
            console.error('Error loading dashboard stats:', error);
        } finally {
            hideSpinner();
        }
    }
    
    /**
     * Update change indicator with arrow and color
     */
    function updateChangeIndicator(elementId, changeValue) {
        const element = document.getElementById(elementId);
        if (changeValue > 0) {
            element.innerHTML = `<i class="bi bi-arrow-up-short"></i> ${changeValue}%`;
            element.className = 'text-success';
        } else if (changeValue < 0) {
            element.innerHTML = `<i class="bi bi-arrow-down-short"></i> ${Math.abs(changeValue)}%`;
            element.className = 'text-danger';
        } else {
            element.innerHTML = `0%`;
            element.className = 'text-muted';
        }
    }
    
    /**
     * Initialize charts with default data
     */
    function initializeCharts() {
        // Mode Distribution Chart
        const modeCtx = document.getElementById('mode-chart').getContext('2d');
        window.modeChart = new Chart(modeCtx, {
            type: 'bar',
            data: {
                labels: ['Individual', 'Collaborative', 'Debate', 'Critique', 'Expert Panel'],
                datasets: [{
                    label: 'Number of Conversations',
                    data: [0, 0, 0, 0, 0], // Start with empty data
                    backgroundColor: [
                        'rgba(54, 162, 235, 0.7)',
                        'rgba(255, 99, 132, 0.7)',
                        'rgba(255, 206, 86, 0.7)',
                        'rgba(75, 192, 192, 0.7)',
                        'rgba(153, 102, 255, 0.7)'
                    ],
                    borderColor: [
                        'rgba(54, 162, 235, 1)',
                        'rgba(255, 99, 132, 1)',
                        'rgba(255, 206, 86, 1)',
                        'rgba(75, 192, 192, 1)',
                        'rgba(153, 102, 255, 1)'
                    ],
                    borderWidth: 1
                }]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                plugins: {
                    legend: {
                        display: false
                    },
                    title: {
                        display: true,
                        text: 'Conversations by Mode'
                    }
                },
                scales: {
                    y: {
                        beginAtZero: true,
                        title: {
                            display: true,
                            text: 'Number of Conversations'
                        }
                    }
                }
            }
        });
        
        // Model Usage Distribution Chart
        const modelCtx = document.getElementById('model-chart').getContext('2d');
        window.modelChart = new Chart(modelCtx, {
            type: 'doughnut',
            data: {
                labels: ['Claude', 'Gemini', 'ChatGPT', 'Grok', 'Llama', 'DeepSeek'],
                datasets: [{
                    data: [0, 0, 0, 0, 0, 0], // Start with empty data
                    backgroundColor: [
                        '#9b59b6',
                        '#3498db',
                        '#2ecc71',
                        '#e67e22',
                        '#e74c3c',
                        '#34495e'
                    ],
                    borderWidth: 1
                }]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                plugins: {
                    legend: {
                        position: 'right'
                    },
                    title: {
                        display: true,
                        text: 'Model Usage Distribution'
                    }
                }
            }
        });
        
        // Usage Trends Chart
        const trendsCtx = document.getElementById('trends-chart').getContext('2d');
        
        // Generate empty data for last 30 days
        const dates = [];
        const now = new Date();
        for (let i = 29; i >= 0; i--) {
            const date = new Date(now);
            date.setDate(now.getDate() - i);
            dates.push(date.toLocaleDateString(undefined, { month: 'short', day: 'numeric' }));
        }
        
        window.trendsChart = new Chart(trendsCtx, {
            type: 'line',
            data: {
                labels: dates,
                datasets: [
                    {
                        label: 'Conversations',
                        data: Array(30).fill(0), // Start with empty data
                        borderColor: 'rgba(54, 162, 235, 1)',
                        backgroundColor: 'rgba(54, 162, 235, 0.2)',
                        fill: true,
                        tension: 0.3
                    },
                    {
                        label: 'Messages',
                        data: Array(30).fill(0), // Start with empty data
                        borderColor: 'rgba(255, 99, 132, 1)',
                        backgroundColor: 'rgba(255, 99, 132, 0.2)',
                        fill: true,
                        tension: 0.3
                    }
                ]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                plugins: {
                    title: {
                        display: true,
                        text: 'Usage Trends (Last 30 Days)'
                    }
                },
                scales: {
                    y: {
                        beginAtZero: true,
                        title: {
                            display: true,
                            text: 'Count'
                        }
                    }
                }
            }
        });
        
        // Placeholder data for other charts (topic and query charts)
        const topicsCtx = document.getElementById('topics-chart').getContext('2d');
        window.topicsChart = new Chart(topicsCtx, {
            type: 'bar',
            data: {
                labels: ['Programming', 'AI/ML', 'Business', 'Writing', 'Education', 'Science', 'Math', 'Other'],
                datasets: [{
                    label: 'Conversations',
                    data: [628, 542, 354, 320, 298, 246, 215, 653],
                    backgroundColor: 'rgba(54, 162, 235, 0.7)',
                    borderColor: 'rgba(54, 162, 235, 1)',
                    borderWidth: 1
                }]
            },
            options: {
                indexAxis: 'y',
                responsive: true,
                maintainAspectRatio: false,
                plugins: {
                    legend: {
                        display: false
                    },
                    title: {
                        display: true,
                        text: 'Popular Topics'
                    }
                }
            }
        });
        
        const queryCtx = document.getElementById('query-chart').getContext('2d');
        window.queryChart = new Chart(queryCtx, {
            type: 'pie',
            data: {
                labels: ['Information', 'Code Generation', 'Creative Writing', 'Problem Solving', 'Brainstorming', 'Summarization'],
                datasets: [{
                    data: [35, 25, 15, 10, 10, 5],
                    backgroundColor: [
                        'rgba(54, 162, 235, 0.7)',
                        'rgba(255, 99, 132, 0.7)',
                        'rgba(255, 206, 86, 0.7)',
                        'rgba(75, 192, 192, 0.7)',
                        'rgba(153, 102, 255, 0.7)',
                        'rgba(255, 159, 64, 0.7)'
                    ],
                    borderWidth: 1
                }]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                plugins: {
                    title: {
                        display: true,
                        text: 'Query Types'
                    }
                }
            }
        });
    }
    
    /**
     * Update mode chart with data from API
     */
    function updateModeChart(modeData) {
        // Check if we have data
        if (!modeData || modeData.length === 0) return;
        
        // Create a mapping of all possible modes
        const modes = {
            'Individual': 0,
            'Collaborative': 0,
            'Debate': 0,
            'Critique': 0,
            'Expert Panel': 0
        };
        
        // Update with actual data
        modeData.forEach(item => {
            if (modes[item.mode] !== undefined) {
                modes[item.mode] = item.count;
            }
        });
        
        // Update chart
        window.modeChart.data.datasets[0].data = Object.values(modes);
        window.modeChart.data.labels = Object.keys(modes);
        window.modeChart.update();
    }
    
    /**
     * Update model chart with data from API
     */
    function updateModelChart(modelData) {
        // Check if we have data
        if (!modelData || modelData.length === 0) return;
        
        const labels = [];
        const data = [];
        
        // Sort by count descending
        modelData.sort((a, b) => b.count - a.count);
        
        // Get top 6 models (or all if less than 6)
        const topModels = modelData.slice(0, 6);
        
        // Extract labels and data
        topModels.forEach(item => {
            // Capitalize model name
            labels.push(item.model.charAt(0).toUpperCase() + item.model.slice(1));
            data.push(item.count);
        });
        
        // Update chart
        window.modelChart.data.labels = labels;
        window.modelChart.data.datasets[0].data = data;
        window.modelChart.update();
    }
    
    /**
     * Update daily trend chart with data from API
     */
    function updateDailyTrendChart(trendData) {
        // Check if we have data
        if (!trendData || trendData.length === 0) return;
        
        const labels = [];
        const conversationData = [];
        
        // Extract labels and conversation data
        trendData.forEach(item => {
            labels.push(item.date);
            conversationData.push(item.count);
        });
        
        // Generate messages data (2-10x conversations for each day)
        const messageData = conversationData.map(count => count * (2 + Math.floor(Math.random() * 8)));
        
        // Update chart
        window.trendsChart.data.labels = labels;
        window.trendsChart.data.datasets[0].data = conversationData;
        window.trendsChart.data.datasets[1].data = messageData;
        window.trendsChart.update();
        
        // Update title based on current date range
        window.trendsChart.options.plugins.title.text = `Usage Trends (Last ${labels.length} Days)`;
        window.trendsChart.update();
    }
    
    /**
     * Update trends chart based on selected time scale
     */
    function updateTrendsChart(scale) {
        // In a real application, this would fetch new data from the API
        // For demo, generate random data
        let labels, conversationData, messageData, titleText;
        
        if (scale === 'daily') {
            // Generate dates for the past 30 days
            labels = [];
            const now = new Date();
            for (let i = 29; i >= 0; i--) {
                const date = new Date(now);
                date.setDate(now.getDate() - i);
                labels.push(date.toLocaleDateString(undefined, { month: 'short', day: 'numeric' }));
            }
            
            conversationData = generateRandomData(30, 80, 150);
            messageData = conversationData.map(count => count * (2 + Math.floor(Math.random() * 8)));
            titleText = 'Usage Trends (Last 30 Days)';
        } else if (scale === 'weekly') {
            // Generate weeks for the past 12 weeks
            labels = [];
            for (let i = 11; i >= 0; i--) {
                labels.push(`Week ${12 - i}`);
            }
            
            conversationData = generateRandomData(12, 500, 900);
            messageData = conversationData.map(count => count * (2 + Math.floor(Math.random() * 8)));
            titleText = 'Usage Trends (Last 12 Weeks)';
        } else if (scale === 'monthly') {
            // Use last 12 months
            labels = ['Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec', 'Jan', 'Feb', 'Mar', 'Apr', 'May'];
            
            conversationData = generateRandomData(12, 1800, 3000);
            messageData = conversationData.map(count => count * (2 + Math.floor(Math.random() * 8)));
            titleText = 'Usage Trends (Last 12 Months)';
        }
        
        // Update chart data
        window.trendsChart.data.labels = labels;
        window.trendsChart.data.datasets[0].data = conversationData;
        window.trendsChart.data.datasets[1].data = messageData;
        window.trendsChart.options.plugins.title.text = titleText;
        window.trendsChart.update();
    }
    
    /**
     * Refresh all charts with new data
     */
    function refreshCharts() {
        // In a real application, this would fetch new data from the API
        // For now, we'll use loadDashboardStats to update the main charts
        loadDashboardStats();
        
        // Update topic and query charts with random data
        window.topicsChart.data.datasets[0].data = generateRandomData(8, 200, 700);
        window.topicsChart.update();
        
        window.queryChart.data.datasets[0].data = [
            getRandomInt(30, 40),
            getRandomInt(20, 30),
            getRandomInt(10, 20),
            getRandomInt(8, 12),
            getRandomInt(8, 12),
            getRandomInt(3, 7)
        ];
        window.queryChart.update();
    }
    
    /**
     * Load conversations from API with pagination and filtering
     */
    async function loadConversations() {
        showSpinner();
        
        try {
            // Build query parameters
            const queryParams = new URLSearchParams();
            queryParams.append('page', currentPage);
            queryParams.append('limit', pageSize);
            
            // Add filters if any
            if (currentFilters.search) {
                queryParams.append('search', currentFilters.search);
            }
            
            if (currentFilters.model) {
                queryParams.append('model', currentFilters.model);
            }
            
            if (currentFilters.mode) {
                queryParams.append('mode', currentFilters.mode);
            }
            
            if (currentFilters.startDate) {
                queryParams.append('startDate', currentFilters.startDate);
            }
            
            if (currentFilters.endDate) {
                queryParams.append('endDate', currentFilters.endDate);
            }
            
            // Make API request
            const response = await fetch(`/api/admin/conversations?${queryParams}`);
            
            if (!response.ok) {
                throw new Error(`Server returned ${response.status}: ${response.statusText}`);
            }
            
            const data = await response.json();
            
            if (data.success) {
                renderConversations(data.conversations);
                
                // Update pagination
                totalPages = data.pagination.totalPages;
                currentPage = data.pagination.page;
                updatePagination(data.pagination.totalCount);
            } else {
                console.error('Failed to load conversations:', data.error);
            }
        } catch (error) {
            console.error('Error loading conversations:', error);
            conversationsTableBody.innerHTML = `
                <tr>
                    <td colspan="8" class="text-center py-4 text-danger">
                        <i class="bi bi-exclamation-triangle me-2"></i> Error loading conversations: ${error.message}
                    </td>
                </tr>
            `;
        } finally {
            hideSpinner();
        }
    }
    
    /**
     * Render conversations to the table
     */
    function renderConversations(conversations) {
        conversationsTableBody.innerHTML = '';
        
        if (conversations.length === 0) {
            const emptyRow = document.createElement('tr');
            emptyRow.innerHTML = `
                <td colspan="8" class="text-center py-4 text-muted">
                    <i class="bi bi-search me-2"></i> No conversations found
                </td>
            `;
            conversationsTableBody.appendChild(emptyRow);
            return;
        }
        
        conversations.forEach(conv => {
            const row = document.createElement('tr');
            row.className = 'conversation-item';
            row.setAttribute('data-conversation-id', conv.id);
            
            // Format model badges
            let modelBadges = '';
            conv.models.forEach(model => {
                const modelName = model.charAt(0).toUpperCase() + model.slice(1);
                modelBadges += `<span class="model-badge badge-${model.toLowerCase()}">${modelName}</span> `;
            });
            
            // Format start time
            const startTime = new Date(conv.createdAt);
            const formattedStartTime = startTime.toLocaleString(undefined, {
                month: 'short',
                day: 'numeric',
                hour: '2-digit',
                minute: '2-digit'
            });
            
            // Format duration
            let duration = 0;
            if (conv.lastMessageAt) {
                duration = new Date(conv.lastMessageAt) - startTime;
            }
            
            const durationMinutes = duration / 60000; // Convert ms to minutes
            let formattedDuration;
            if (durationMinutes < 1) {
                formattedDuration = `${Math.round(durationMinutes * 60)}s`;
            } else if (durationMinutes >= 60) {
                const hours = Math.floor(durationMinutes / 60);
                const mins = Math.round(durationMinutes % 60);
                formattedDuration = `${hours}h ${mins}m`;
            } else {
                formattedDuration = `${Math.round(durationMinutes)}m`;
            }
            
            // Format sentiment icon (random for now)
            const sentiment = Math.round(Math.random() * 2) + 3; // Random 3-5
            let sentimentIcon, sentimentClass;
            if (sentiment >= 4) {
                sentimentIcon = 'bi-emoji-smile-fill';
                sentimentClass = 'sentiment-positive';
            } else if (sentiment >= 3) {
                sentimentIcon = 'bi-emoji-neutral-fill';
                sentimentClass = 'sentiment-neutral';
            } else {
                sentimentIcon = 'bi-emoji-frown-fill';
                sentimentClass = 'sentiment-negative';
            }
            
            row.innerHTML = `
                <td>
                    <div>${conv.user ? conv.user.name : 'Unknown User'}</div>
                    <div class="small text-muted">${conv.user ? conv.user.email : ''}</div>
                </td>
                <td>${modelBadges}</td>
                <td>${conv.mode}</td>
                <td>${conv.messageCount || 0}</td>
                <td>${formattedStartTime}</td>
                <td>${formattedDuration}</td>
                <td>
                    <i class="bi ${sentimentIcon} ${sentimentClass}" title="Sentiment: ${sentiment}/5"></i>
                </td>
                <td class="text-end">
                    <button class="btn btn-sm btn-outline-primary view-conversation-btn" data-conversation-id="${conv.id}">
                        <i class="bi bi-eye"></i>
                    </button>
                </td>
            `;
            
            conversationsTableBody.appendChild(row);
        });
        
        // Add event listeners to conversation rows and view buttons
        document.querySelectorAll('.conversation-item').forEach(row => {
            row.addEventListener('click', function() {
                const sessionId = this.getAttribute('data-conversation-id');
                openConversationModal(sessionId);
            });
        });
        
        document.querySelectorAll('.view-conversation-btn').forEach(button => {
            button.addEventListener('click', function(e) {
                e.stopPropagation(); // Prevent row click
                const sessionId = this.getAttribute('data-conversation-id');
                openConversationModal(sessionId);
            });
        });
    }
    
    /**
     * Update pagination UI
     */
    function updatePagination(totalItems) {
        document.getElementById('pagination-info').textContent = `Page ${currentPage} of ${totalPages}`;
        document.getElementById('prev-page').disabled = currentPage <= 1;
        document.getElementById('next-page').disabled = currentPage >= totalPages;
        document.getElementById('conversations-count').textContent = `Showing ${totalItems || 0} conversations`;
    }
    
    /**
     * Change page
     */
    function changePage(page) {
        currentPage = page;
        loadConversations();
    }
    
    /**
     * Search conversations
     */
    function searchConversations() {
        const searchTerm = document.getElementById('search-conversations').value;
        currentFilters.search = searchTerm;
        currentPage = 1;
        loadConversations();
    }
    
    /**
     * Open conversation modal to view details
     */
    async function openConversationModal(conversationId) {
        showSpinner();
        currentConversationId = conversationId;
        
        try {
            const response = await fetch(`/api/admin/conversations/${conversationId}`);
            
            if (!response.ok) {
                throw new Error(`Server returned ${response.status}: ${response.statusText}`);
            }
            
            const data = await response.json();
            
            if (data.success) {
                const conversation = data.conversation;
                
                // Set conversation details
                document.getElementById('detail-user').textContent = conversation.user ? 
                    `${conversation.user.name} (${conversation.user.email})` : 'Unknown User';
                document.getElementById('detail-session-id').textContent = conversation.id;
                document.getElementById('detail-start-time').textContent = new Date(conversation.createdAt).toLocaleString();
                document.getElementById('detail-models').textContent = conversation.models.join(', ');
                document.getElementById('detail-mode').textContent = conversation.mode;
                document.getElementById('detail-message-count').textContent = conversation.messages.length;
                
                // Set conversation messages
                const messageContainer = document.getElementById('message-container');
                messageContainer.innerHTML = '';
                
                if (conversation.messages && conversation.messages.length > 0) {
                    conversation.messages.forEach(message => {
                        const messageDiv = document.createElement('div');
                        messageDiv.className = message.role === 'user' ? 'user-message' : 'ai-message';
                        
                        const timestamp = new Date(message.timestamp || message.createdAt).toLocaleTimeString();
                        
                        messageDiv.innerHTML = `
                            <div>${message.content}</div>
                            <div class="message-meta">
                                <span>${message.role === 'user' ? 
                                    (conversation.user ? conversation.user.name : 'User') : 
                                    (message.model || 'AI')}</span> | 
                                <span>${timestamp}</span>
                            </div>
                        `;
                        
                        messageContainer.appendChild(messageDiv);
                    });
                } else {
                    messageContainer.innerHTML = `
                        <div class="text-center text-muted py-4">
                            <i class="bi bi-chat-square"></i> No messages in this conversation
                        </div>
                    `;
                }
                
                conversationModal.show();
            } else {
                console.error('Failed to load conversation details:', data.error);
                alert('Failed to load conversation details: ' + data.error);
            }
        } catch (error) {
            console.error('Error loading conversation details:', error);
            alert('Error loading conversation details: ' + error.message);
        } finally {
            hideSpinner();
        }
    }
    
    /**
     * Confirm conversation deletion
     */
    function confirmDeleteConversation() {
        conversationModal.hide();
        deleteModal.show();
    }
    
    /**
     * Delete conversation
     */
    async function deleteConversation() {
        if (!currentConversationId) return;
        
        showSpinner();
        
        try {
            const response = await fetch(`/api/admin/conversations/${currentConversationId}`, {
                method: 'DELETE'
            });
            
            if (!response.ok) {
                const errorData = await response.json();
                throw new Error(errorData.error || `Server returned ${response.status}: ${response.statusText}`);
            }
            
            const data = await response.json();
            
            if (data.success) {
                // Refresh the list and stats
                loadConversations();
                loadDashboardStats();
                deleteModal.hide();
                
                // Show success message
                alert('Conversation deleted successfully.');
            } else {
                console.error('Failed to delete conversation:', data.error);
                alert('Failed to delete conversation: ' + data.error);
            }
        } catch (error) {
            console.error('Error deleting conversation:', error);
            alert('Error deleting conversation: ' + error.message);
        } finally {
            hideSpinner();
        }
    }
    
    /**
     * Export conversation to file
     */
    async function exportConversation() {
        if (!currentConversationId) return;
        
        showSpinner();
        
        try {
            const response = await fetch(`/api/admin/conversations/${currentConversationId}`);
            
            if (!response.ok) {
                throw new Error(`Server returned ${response.status}: ${response.statusText}`);
            }
            
            const data = await response.json();
            
            if (data.success) {
                const conversation = data.conversation;
                
                // Create export content
                let exportContent = `Conversation ID: ${conversation.id}\n`;
                exportContent += `User: ${conversation.user ? `${conversation.user.name} (${conversation.user.email})` : 'Unknown User'}\n`;
                exportContent += `Started: ${new Date(conversation.createdAt).toLocaleString()}\n`;
                exportContent += `Models: ${conversation.models.join(', ')}\n`;
                exportContent += `Mode: ${conversation.mode}\n\n`;
                exportContent += `--- Messages ---\n\n`;
                
                if (conversation.messages && conversation.messages.length > 0) {
                    conversation.messages.forEach(message => {
                        const sender = message.role === 'user' ? 
                            (conversation.user ? conversation.user.name : 'User') : 
                            (message.model || 'AI');
                        const time = new Date(message.timestamp || message.createdAt).toLocaleTimeString();
                        exportContent += `[${time}] ${sender}:\n${message.content}\n\n`;
                    });
                } else {
                    exportContent += 'No messages in this conversation.\n';
                }
                
                // Create and download the file
                const blob = new Blob([exportContent], { type: 'text/plain;charset=utf-8;' });
                const link = document.createElement('a');
                const url = URL.createObjectURL(blob);
                
                link.setAttribute('href', url);
                link.setAttribute('download', `conversation_${currentConversationId}.txt`);
                link.style.display = 'none';
                
                document.body.appendChild(link);
                link.click();
                document.body.removeChild(link);
            } else {
                console.error('Failed to export conversation:', data.error);
                alert('Failed to export conversation: ' + data.error);
            }
        } catch (error) {
            console.error('Error exporting conversation:', error);
            alert('Error exporting conversation: ' + error.message);
        } finally {
            hideSpinner();
        }
    }
    
    /**
     * Export chart as image
     */
    function exportChartAsImage(chartId, filename) {
        const canvas = document.getElementById(chartId);
        const link = document.createElement('a');
        link.download = `${filename}.png`;
        link.href = canvas.toDataURL('image/png');
        link.click();
    }
    
    /**
     * Utility: Generate random data for charts
     */
    function generateRandomData(count, min, max) {
        return Array.from({ length: count }, () => getRandomInt(min, max));
    }
    
    /**
     * Utility: Get random integer between min and max
     */
    function getRandomInt(min, max) {
        return Math.floor(Math.random() * (max - min + 1)) + min;
    }
    
    /**
     * Show loading spinner
     */
    function showSpinner() {
        document.getElementById('loading-spinner').classList.remove('d-none');
    }
    
    /**
     * Hide loading spinner
     */
    function hideSpinner() {
        document.getElementById('loading-spinner').classList.add('d-none');
    }
});
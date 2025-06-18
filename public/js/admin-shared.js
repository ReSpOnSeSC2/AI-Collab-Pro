// AI-Collab Admin Dashboard - Shared JavaScript
class AdminDashboard {
  constructor() {
    this.apiBase = '/api/admin';
    this.currentUser = null;
    this.init();
  }

  async init() {
    // For demo purposes, skip auth check
    // In production, uncomment this:
    // await this.checkAuth();
    
    this.setupSidebar();
    this.setupEventListeners();
    this.loadCurrentPage();
  }

  async checkAuth() {
    try {
      const response = await fetch('/api/auth/me');
      if (!response.ok) {
        window.location.href = '/login.html';
        return;
      }
      this.currentUser = await response.json();
      if (!this.currentUser.isAdmin) {
        alert('Admin access required');
        window.location.href = '/';
        return;
      }
    } catch (error) {
      console.error('Auth check failed:', error);
      // For demo, just log the error
      // window.location.href = '/login.html';
    }
  }

  setupSidebar() {
    const currentPath = window.location.pathname;
    const navItems = document.querySelectorAll('.admin-nav-item');
    
    navItems.forEach(item => {
      if (item.getAttribute('href') === currentPath) {
        item.classList.add('active');
      }
    });

    // Mobile menu toggle
    const menuToggle = document.querySelector('.admin-menu-toggle');
    const sidebar = document.querySelector('.admin-sidebar');
    
    if (menuToggle) {
      menuToggle.addEventListener('click', () => {
        sidebar.classList.toggle('active');
      });
    }
  }

  setupEventListeners() {
    // Logout functionality
    const logoutBtn = document.getElementById('admin-logout');
    if (logoutBtn) {
      logoutBtn.addEventListener('click', async (e) => {
        e.preventDefault();
        await this.logout();
      });
    }

    // Search functionality
    const searchInput = document.getElementById('admin-search');
    if (searchInput) {
      searchInput.addEventListener('input', (e) => {
        this.handleSearch(e.target.value);
      });
    }
  }

  async logout() {
    try {
      await fetch('/api/auth/logout', { method: 'POST' });
      window.location.href = '/login.html';
    } catch (error) {
      console.error('Logout failed:', error);
      // For demo, just redirect
      window.location.href = '/login.html';
    }
  }

  loadCurrentPage() {
    const path = window.location.pathname;
    const page = path.split('/').pop().replace('.html', '');
    
    // Load page-specific data with demo data
    switch(page) {
      case 'admin-dashboard':
        if (typeof this.loadDashboardData === 'function') {
          this.loadDashboardData();
        }
        break;
      case 'admin-users':
        if (typeof this.loadUsersData === 'function') {
          this.loadUsersData();
        }
        break;
      case 'admin-conversations':
        if (typeof this.loadConversationsData === 'function') {
          this.loadConversationsData();
        }
        break;
      case 'admin-settings':
        if (typeof this.loadSettingsData === 'function') {
          this.loadSettingsData();
        }
        break;
      case 'admin-analytics':
        if (typeof this.loadAnalyticsData === 'function') {
          this.loadAnalyticsData();
        }
        break;
      case 'admin-activity':
        if (typeof this.loadActivityData === 'function') {
          this.loadActivityData();
        }
        break;
      case 'admin-feedback':
        if (typeof this.loadFeedbackData === 'function') {
          this.loadFeedbackData();
        }
        break;
    }
  }

  // Utility functions
  async apiRequest(endpoint, options = {}) {
    try {
      const response = await fetch(`${this.apiBase}${endpoint}`, {
        ...options,
        headers: {
          'Content-Type': 'application/json',
          ...options.headers
        }
      });
      
      if (!response.ok) {
        throw new Error(`API request failed: ${response.statusText}`);
      }
      
      return response.json();
    } catch (error) {
      console.error('API Request Error:', error);
      // Re-throw the error instead of returning demo data
      throw error;
    }
  }

  getDemoData(endpoint) {
    // NO MOCK DATA - Always return empty/zero values
    if (endpoint.includes('/stats')) {
      return {
        totalUsers: 0,
        userGrowth: 0,
        activeConversations: 0,
        conversationGrowth: 0,
        apiCallsToday: 0,
        apiCallsChange: 0,
        monthlyRevenue: 0,
        revenueGrowth: 0
      };
    }
    
    if (endpoint.includes('/charts')) {
      return {
        usage: {
          labels: [],
          data: []
        },
        models: {
          labels: [],
          data: []
        }
      };
    }
    
    if (endpoint.includes('/activity/recent')) {
      return []; // Empty array - no mock activity
    }
    
    if (endpoint.includes('/system-health')) {
      return {
        uptime: '0d 0h 0m',
        memoryUsage: 0,
        cpuUsage: 0,
        avgResponseTime: 0
      };
    }
    
    // Default empty response
    return {};
  }

  formatDate(date) {
    return new Date(date).toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    });
  }

  formatCurrency(amount) {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD'
    }).format(amount);
  }

  formatNumber(num) {
    return new Intl.NumberFormat('en-US').format(num);
  }

  formatRelativeTime(date) {
    const rtf = new Intl.RelativeTimeFormat('en', { numeric: 'auto' });
    const diff = (new Date(date) - new Date()) / 1000; // in seconds
    
    if (Math.abs(diff) < 60) return 'just now';
    if (Math.abs(diff) < 3600) return rtf.format(Math.round(diff / 60), 'minute');
    if (Math.abs(diff) < 86400) return rtf.format(Math.round(diff / 3600), 'hour');
    if (Math.abs(diff) < 2592000) return rtf.format(Math.round(diff / 86400), 'day');
    return rtf.format(Math.round(diff / 2592000), 'month');
  }

  truncateText(text, maxLength) {
    if (text.length <= maxLength) return text;
    return text.substring(0, maxLength) + '...';
  }

  showAlert(message, type = 'info') {
    const alertContainer = document.getElementById('alert-container');
    if (!alertContainer) return;

    const alert = document.createElement('div');
    alert.className = `admin-alert admin-alert-${type}`;
    alert.innerHTML = `
      <i class="fas fa-${type === 'success' ? 'check-circle' : type === 'danger' ? 'exclamation-circle' : 'info-circle'}"></i>
      <span>${message}</span>
    `;

    alertContainer.appendChild(alert);
    
    setTimeout(() => {
      alert.remove();
    }, 5000);
  }

  showLoading(containerId) {
    const container = containerId ? document.getElementById(containerId) : document.body;
    if (container) {
      const loading = document.createElement('div');
      loading.className = 'admin-loading';
      loading.innerHTML = '<div class="admin-spinner"></div>';
      container.appendChild(loading);
    }
  }

  hideLoading(containerId) {
    const container = containerId ? document.getElementById(containerId) : document.body;
    if (container) {
      container.querySelector('.admin-loading')?.remove();
    }
  }

  // Chart utilities
  getChartOptions(type = 'line') {
    const isDark = document.body.classList.contains('dark-mode');
    
    return {
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: {
          display: type !== 'line',
          position: 'bottom',
          labels: {
            color: isDark ? '#e5e7eb' : '#6b7280',
            font: {
              family: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif'
            }
          }
        },
        tooltip: {
          backgroundColor: isDark ? '#1f2937' : '#ffffff',
          titleColor: isDark ? '#f3f4f6' : '#1f2937',
          bodyColor: isDark ? '#e5e7eb' : '#6b7280',
          borderColor: isDark ? '#374151' : '#e5e7eb',
          borderWidth: 1
        }
      },
      scales: type === 'line' || type === 'bar' ? {
        x: {
          grid: {
            color: isDark ? '#374151' : '#f3f4f6'
          },
          ticks: {
            color: isDark ? '#9ca3af' : '#6b7280'
          }
        },
        y: {
          grid: {
            color: isDark ? '#374151' : '#f3f4f6'
          },
          ticks: {
            color: isDark ? '#9ca3af' : '#6b7280'
          }
        }
      } : {}
    };
  }

  // Data table utilities
  createDataTable(containerId, columns, data, options = {}) {
    const container = document.getElementById(containerId);
    if (!container) return;

    const table = document.createElement('table');
    table.className = 'admin-table';

    // Create header
    const thead = document.createElement('thead');
    const headerRow = document.createElement('tr');
    columns.forEach(col => {
      const th = document.createElement('th');
      th.textContent = col.label;
      if (col.sortable) {
        th.style.cursor = 'pointer';
        th.addEventListener('click', () => this.sortTable(table, col.key));
      }
      headerRow.appendChild(th);
    });
    thead.appendChild(headerRow);
    table.appendChild(thead);

    // Create body
    const tbody = document.createElement('tbody');
    this.renderTableRows(tbody, columns, data, options);
    table.appendChild(tbody);

    container.innerHTML = '';
    container.appendChild(table);

    // Add pagination if needed
    if (options.pagination && data.length > options.pageSize) {
      this.addPagination(container, data, options);
    }
  }

  renderTableRows(tbody, columns, data, options) {
    const start = options.currentPage ? (options.currentPage - 1) * options.pageSize : 0;
    const end = options.pageSize ? start + options.pageSize : data.length;
    const pageData = data.slice(start, end);

    tbody.innerHTML = '';
    pageData.forEach(row => {
      const tr = document.createElement('tr');
      columns.forEach(col => {
        const td = document.createElement('td');
        if (col.render) {
          td.innerHTML = col.render(row[col.key], row);
        } else {
          td.textContent = row[col.key] || '';
        }
        tr.appendChild(td);
      });
      tbody.appendChild(tr);
    });
  }

  sortTable(table, key) {
    const tbody = table.querySelector('tbody');
    const rows = Array.from(tbody.querySelectorAll('tr'));
    
    rows.sort((a, b) => {
      const aVal = a.querySelector(`td:nth-child(${key})`).textContent;
      const bVal = b.querySelector(`td:nth-child(${key})`).textContent;
      return aVal.localeCompare(bVal);
    });

    tbody.innerHTML = '';
    rows.forEach(row => tbody.appendChild(row));
  }

  addPagination(container, data, options) {
    const totalPages = Math.ceil(data.length / options.pageSize);
    const currentPage = options.currentPage || 1;

    const pagination = document.createElement('div');
    pagination.className = 'admin-pagination';
    pagination.innerHTML = `
      <button class="admin-btn admin-btn-sm admin-btn-outline" ${currentPage === 1 ? 'disabled' : ''}>
        Previous
      </button>
      <span class="admin-pagination-info">
        Page ${currentPage} of ${totalPages}
      </span>
      <button class="admin-btn admin-btn-sm admin-btn-outline" ${currentPage === totalPages ? 'disabled' : ''}>
        Next
      </button>
    `;

    container.appendChild(pagination);
  }

  // Export functionality
  exportData(data, filename, format = 'csv') {
    if (format === 'csv') {
      this.exportCSV(data, filename);
    } else if (format === 'json') {
      this.exportJSON(data, filename);
    }
  }

  exportCSV(data, filename) {
    if (!data.length) return;

    const headers = Object.keys(data[0]);
    const csv = [
      headers.join(','),
      ...data.map(row => 
        headers.map(header => 
          JSON.stringify(row[header] || '')
        ).join(',')
      )
    ].join('\n');

    this.downloadFile(csv, `${filename}.csv`, 'text/csv');
  }

  exportJSON(data, filename) {
    const json = JSON.stringify(data, null, 2);
    this.downloadFile(json, `${filename}.json`, 'application/json');
  }

  downloadFile(content, filename, type) {
    const blob = new Blob([content], { type });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    a.click();
    URL.revokeObjectURL(url);
  }

  // WebSocket for real-time updates
  connectWebSocket() {
    try {
      const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
      this.ws = new WebSocket(`${protocol}//${window.location.host}/admin-ws`);

      this.ws.onmessage = (event) => {
        const data = JSON.parse(event.data);
        this.handleRealtimeUpdate(data);
      };

      this.ws.onerror = (error) => {
        console.error('WebSocket error:', error);
      };

      this.ws.onclose = () => {
        setTimeout(() => this.connectWebSocket(), 5000);
      };
    } catch (error) {
      console.error('WebSocket connection failed:', error);
    }
  }

  handleRealtimeUpdate(data) {
    // Override in page-specific scripts
    console.log('Realtime update:', data);
  }

  destroy() {
    if (this.ws) {
      this.ws.close();
    }
  }
}

// Initialize when DOM is ready
document.addEventListener('DOMContentLoaded', () => {
  window.adminDashboard = new AdminDashboard();
});
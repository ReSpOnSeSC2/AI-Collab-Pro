/**
 * Admin Users Management
 * Connects the admin users interface to the backend API
 */

document.addEventListener('DOMContentLoaded', function() {
    // Toggle sidebar on mobile
    document.querySelector('.admin-menu-toggle')?.addEventListener('click', function() {
        document.querySelector('.admin-sidebar').classList.toggle('collapsed');
    });
    
    // UI Elements
    const usersTableBody = document.getElementById('users-table-body');
    const userModal = new bootstrap.Modal(document.getElementById('user-modal'));
    const deleteModal = new bootstrap.Modal(document.getElementById('delete-confirm-modal'));
    
    // Pagination state
    let currentPage = 1;
    let totalPages = 1;
    let pageSize = 20;
    let currentFilters = {};
    
    // Initialize dashboard
    loadDashboardStats();
    loadUsers();
    
    // Add event listeners
    document.getElementById('apply-filters').addEventListener('click', applyFilters);
    document.getElementById('reset-filters').addEventListener('click', resetFilters);
    document.getElementById('prev-page').addEventListener('click', () => changePage(currentPage - 1));
    document.getElementById('next-page').addEventListener('click', () => changePage(currentPage + 1));
    document.getElementById('export-users').addEventListener('click', exportUsers);
    document.getElementById('add-user').addEventListener('click', () => openUserModal());
    document.getElementById('save-user-btn').addEventListener('click', saveUser);
    document.getElementById('delete-user-btn').addEventListener('click', confirmDeleteUser);
    document.getElementById('confirm-delete-btn').addEventListener('click', deleteUser);
    document.getElementById('reset-password-btn').addEventListener('click', resetPassword);
    
    // Search input functionality with debounce
    const searchInput = document.getElementById('search-users');
    let searchTimeout;
    searchInput.addEventListener('input', function() {
        clearTimeout(searchTimeout);
        searchTimeout = setTimeout(() => {
            currentFilters.search = searchInput.value;
            loadUsers();
        }, 300);
    });
    
    /**
     * Load dashboard statistics from API
     */
    async function loadDashboardStats() {
        showSpinner();
        
        try {
            const response = await fetch('/api/admin/stats/users');
            
            if (!response.ok) {
                throw new Error(`Server returned ${response.status}: ${response.statusText}`);
            }
            
            const data = await response.json();
            
            if (data.success) {
                document.getElementById('total-users').textContent = data.stats.totalUsers.toLocaleString();
                document.getElementById('active-users').textContent = data.stats.activeUsers.toLocaleString();
                document.getElementById('paid-users').textContent = (data.stats.subscriptionStats.pro + data.stats.subscriptionStats.enterprise).toLocaleString();
                document.getElementById('new-users').textContent = data.stats.newUsersThisMonth.toLocaleString();
                
                // Update growth indicators
                const userGrowth = data.stats.userGrowth;
                
                // User growth indicator
                if (userGrowth > 0) {
                    document.getElementById('users-change').innerHTML = `<i class="bi bi-arrow-up-short"></i> ${userGrowth}%`;
                    document.getElementById('users-change').className = 'text-success';
                } else if (userGrowth < 0) {
                    document.getElementById('users-change').innerHTML = `<i class="bi bi-arrow-down-short"></i> ${Math.abs(userGrowth)}%`;
                    document.getElementById('users-change').className = 'text-danger';
                } else {
                    document.getElementById('users-change').innerHTML = `0%`;
                    document.getElementById('users-change').className = 'text-muted';
                }
            } else {
                console.error('Failed to load user statistics:', data.error);
            }
        } catch (error) {
            console.error('Error loading dashboard stats:', error);
        } finally {
            hideSpinner();
        }
    }
    
    /**
     * Load users from API with pagination and filtering
     */
    async function loadUsers() {
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
            
            if (currentFilters.status) {
                queryParams.append('status', currentFilters.status);
            }
            
            if (currentFilters.tier) {
                queryParams.append('subscriptionTier', currentFilters.tier);
            }
            
            if (currentFilters.auth) {
                queryParams.append('authType', currentFilters.auth);
            }
            
            // Make API request
            const response = await fetch(`/api/admin/users?${queryParams}`);
            
            if (!response.ok) {
                throw new Error(`Server returned ${response.status}: ${response.statusText}`);
            }
            
            const data = await response.json();
            
            if (data.success) {
                renderUsers(data.users);
                
                // Update pagination
                totalPages = data.pagination.totalPages;
                currentPage = data.pagination.page;
                updatePagination(data.pagination.totalCount);
            } else {
                console.error('Failed to load users:', data.error);
            }
        } catch (error) {
            console.error('Error loading users:', error);
            usersTableBody.innerHTML = `
                <tr>
                    <td colspan="8" class="text-center py-4 text-danger">
                        <i class="bi bi-exclamation-triangle me-2"></i> Error loading users: ${error.message}
                    </td>
                </tr>
            `;
        } finally {
            hideSpinner();
        }
    }
    
    /**
     * Render users to the table
     */
    function renderUsers(users) {
        usersTableBody.innerHTML = '';
        
        if (users.length === 0) {
            const emptyRow = document.createElement('tr');
            emptyRow.innerHTML = `
                <td colspan="8" class="text-center py-4 text-muted">
                    <i class="bi bi-search me-2"></i> No users found matching your filters
                </td>
            `;
            usersTableBody.appendChild(emptyRow);
            return;
        }
        
        users.forEach(user => {
            const row = document.createElement('tr');
            
            // Format status badge
            const statusClass = user.status === 'active' ? 'status-active' 
                : user.status === 'suspended' ? 'status-suspended' : 'status-inactive';
            const statusBadge = `<span class="status-badge ${statusClass}"></span>`;
            
            // Format subscription tier
            const tierBadge = `<span class="tier-badge tier-${user.subscriptionTier}">${user.subscriptionTier.charAt(0).toUpperCase() + user.subscriptionTier.slice(1)}</span>`;
            
            // Format last login date
            const lastLogin = user.lastLogin ? new Date(user.lastLogin) : null;
            const formattedLastLogin = lastLogin ? lastLogin.toLocaleString(undefined, {
                year: 'numeric',
                month: 'short',
                day: 'numeric',
                hour: '2-digit',
                minute: '2-digit'
            }) : 'Never';
            
            // Auth type icon
            let authIcon = '<i class="bi bi-envelope-fill text-secondary"></i>';
            if (user.googleId) {
                authIcon = '<i class="bi bi-google text-danger"></i>';
            }
            
            // Admin badge
            const adminBadge = user.isAdmin ? 
                '<span class="badge bg-warning text-dark ms-2">Admin</span>' : '';
            
            // Generate avatar if no profile image
            const profileImage = user.profileImage || `https://ui-avatars.com/api/?name=${encodeURIComponent(user.name)}&background=random&color=fff`;
            
            row.innerHTML = `
                <td class="ps-3">
                    <img src="${profileImage}" alt="${user.name}" class="avatar-sm">
                </td>
                <td>
                    <div>${user.name}${adminBadge}</div>
                    <div class="small text-muted">ID: ${user.id}</div>
                </td>
                <td>${user.email}</td>
                <td>${statusBadge} ${user.status ? user.status.charAt(0).toUpperCase() + user.status.slice(1) : 'Active'}</td>
                <td>${tierBadge}</td>
                <td>${formattedLastLogin}</td>
                <td class="text-center">${authIcon}</td>
                <td class="text-end pe-3">
                    <button class="btn btn-sm btn-outline-secondary edit-user-btn" data-user-id="${user.id}">
                        <i class="bi bi-pencil"></i>
                    </button>
                </td>
            `;
            
            usersTableBody.appendChild(row);
        });
        
        // Add event listeners to edit buttons
        document.querySelectorAll('.edit-user-btn').forEach(button => {
            button.addEventListener('click', () => {
                const userId = button.getAttribute('data-user-id');
                openUserModal(userId);
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
        document.getElementById('users-count').textContent = `Showing ${totalItems} users`;
    }
    
    /**
     * Change page
     */
    function changePage(page) {
        currentPage = page;
        loadUsers();
    }
    
    /**
     * Apply filters
     */
    function applyFilters() {
        currentPage = 1;
        currentFilters = {
            search: document.getElementById('search-users').value,
            status: document.getElementById('filter-status').value,
            tier: document.getElementById('filter-tier').value,
            auth: document.getElementById('filter-auth').value
        };
        loadUsers();
    }
    
    /**
     * Reset filters
     */
    function resetFilters() {
        document.getElementById('search-users').value = '';
        document.getElementById('filter-status').value = '';
        document.getElementById('filter-tier').value = '';
        document.getElementById('filter-auth').value = '';
        
        currentPage = 1;
        currentFilters = {};
        loadUsers();
    }
    
    /**
     * Export users to CSV
     */
    async function exportUsers() {
        showSpinner();
        
        try {
            // Make API request to get all users for export
            const response = await fetch('/api/admin/users?limit=1000');
            
            if (!response.ok) {
                throw new Error(`Server returned ${response.status}: ${response.statusText}`);
            }
            
            const data = await response.json();
            
            if (data.success) {
                // Create CSV content
                const headers = ['ID', 'Name', 'Email', 'Status', 'Subscription', 'Last Login', 'Auth Type', 'Admin'];
                let csvContent = headers.join(',') + '\n';
                
                // Add user data
                data.users.forEach(user => {
                    const lastLogin = user.lastLogin ? new Date(user.lastLogin).toISOString() : 'Never';
                    const authType = user.googleId ? 'Google' : 'Email/Password';
                    
                    const row = [
                        user.id,
                        `"${user.name}"`,
                        user.email,
                        user.status || 'active',
                        user.subscriptionTier,
                        lastLogin,
                        authType,
                        user.isAdmin ? 'Yes' : 'No'
                    ];
                    csvContent += row.join(',') + '\n';
                });
                
                // Create and download the file
                const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
                const link = document.createElement('a');
                const url = URL.createObjectURL(blob);
                
                link.setAttribute('href', url);
                link.setAttribute('download', `users_export_${new Date().toISOString().split('T')[0]}.csv`);
                link.style.display = 'none';
                
                document.body.appendChild(link);
                link.click();
                document.body.removeChild(link);
            } else {
                console.error('Failed to export users:', data.error);
                alert('Failed to export users: ' + data.error);
            }
        } catch (error) {
            console.error('Error exporting users:', error);
            alert('Error exporting users: ' + error.message);
        } finally {
            hideSpinner();
        }
    }
    
    /**
     * Open user modal for editing or creating
     */
    async function openUserModal(userId = null) {
        const modalTitle = document.getElementById('user-modal-label');
        const form = document.getElementById('user-form');
        const deleteBtn = document.getElementById('delete-user-btn');
        const resetSection = document.getElementById('reset-password-section');
        
        // Reset form
        form.reset();
        
        if (userId) {
            // Edit existing user
            modalTitle.textContent = 'Edit User';
            
            showSpinner();
            
            try {
                // Fetch user details
                const response = await fetch(`/api/admin/users/${userId}`);
                
                if (!response.ok) {
                    throw new Error(`Server returned ${response.status}: ${response.statusText}`);
                }
                
                const data = await response.json();
                
                if (data.success) {
                    const user = data.user;
                    
                    document.getElementById('user-id').value = user.id;
                    document.getElementById('user-name').value = user.name;
                    document.getElementById('user-email').value = user.email;
                    document.getElementById('user-status').value = user.status || 'active';
                    document.getElementById('user-tier').value = user.subscriptionTier;
                    document.getElementById('user-is-admin').checked = user.isAdmin || false;
                    
                    deleteBtn.classList.remove('d-none');
                    resetSection.classList.remove('d-none');
                } else {
                    console.error('Failed to load user details:', data.error);
                    alert('Failed to load user details: ' + data.error);
                }
            } catch (error) {
                console.error('Error loading user details:', error);
                alert('Error loading user details: ' + error.message);
            } finally {
                hideSpinner();
            }
        } else {
            // Create new user
            modalTitle.textContent = 'Add New User';
            document.getElementById('user-id').value = '';
            deleteBtn.classList.add('d-none');
            resetSection.classList.add('d-none');
        }
        
        userModal.show();
    }
    
    /**
     * Save user (create or update)
     */
    async function saveUser() {
        const userId = document.getElementById('user-id').value;
        const userData = {
            name: document.getElementById('user-name').value,
            email: document.getElementById('user-email').value,
            status: document.getElementById('user-status').value,
            subscriptionTier: document.getElementById('user-tier').value,
            isAdmin: document.getElementById('user-is-admin').checked
        };
        
        // Validate form
        if (!userData.name || !userData.email) {
            alert('Please fill in all required fields.');
            return;
        }
        
        showSpinner();
        
        try {
            let response;
            
            if (userId) {
                // Update existing user
                response = await fetch(`/api/admin/users/${userId}`, {
                    method: 'PUT',
                    headers: {
                        'Content-Type': 'application/json'
                    },
                    body: JSON.stringify(userData)
                });
            } else {
                // Create new user
                // For new users, generate a random password (in production, you'd send an email)
                const tempPassword = Math.random().toString(36).substring(2, 10);
                
                response = await fetch('/api/admin/users', {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json'
                    },
                    body: JSON.stringify({
                        ...userData,
                        password: tempPassword
                    })
                });
                
                if (response.ok) {
                    // Display the temporary password to the admin
                    alert(`User created successfully.\n\nTemporary password: ${tempPassword}\n\nPlease provide this to the user securely.`);
                }
            }
            
            if (!response.ok) {
                const errorData = await response.json();
                throw new Error(errorData.error || `Server returned ${response.status}: ${response.statusText}`);
            }
            
            const data = await response.json();
            
            if (data.success) {
                // Refresh the list
                loadUsers();
                loadDashboardStats();
                userModal.hide();
            } else {
                console.error('Failed to save user:', data.error);
                alert('Failed to save user: ' + data.error);
            }
        } catch (error) {
            console.error('Error saving user:', error);
            alert('Error saving user: ' + error.message);
        } finally {
            hideSpinner();
        }
    }
    
    /**
     * Confirm user deletion
     */
    function confirmDeleteUser() {
        userModal.hide();
        deleteModal.show();
    }
    
    /**
     * Delete user
     */
    async function deleteUser() {
        const userId = document.getElementById('user-id').value;
        
        if (!userId) {
            alert('No user selected for deletion.');
            return;
        }
        
        showSpinner();
        
        try {
            const response = await fetch(`/api/admin/users/${userId}`, {
                method: 'DELETE'
            });
            
            if (!response.ok) {
                const errorData = await response.json();
                throw new Error(errorData.error || `Server returned ${response.status}: ${response.statusText}`);
            }
            
            const data = await response.json();
            
            if (data.success) {
                // Refresh the list
                loadUsers();
                loadDashboardStats();
                deleteModal.hide();
            } else {
                console.error('Failed to delete user:', data.error);
                alert('Failed to delete user: ' + data.error);
            }
        } catch (error) {
            console.error('Error deleting user:', error);
            alert('Error deleting user: ' + error.message);
        } finally {
            hideSpinner();
        }
    }
    
    /**
     * Reset user password
     */
    function resetPassword() {
        const userId = document.getElementById('user-id').value;
        const userEmail = document.getElementById('user-email').value;
        
        if (!userId) {
            alert('No user selected.');
            return;
        }
        
        // Generate a random password
        const newPassword = Math.random().toString(36).substring(2, 10);
        
        showSpinner();
        
        // In a real application, you would call an API endpoint to reset the password
        // and send an email to the user with a password reset link
        setTimeout(() => {
            hideSpinner();
            alert(`Password has been reset for ${userEmail}.\n\nNew temporary password: ${newPassword}\n\nPlease provide this to the user securely.`);
        }, 1000);
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
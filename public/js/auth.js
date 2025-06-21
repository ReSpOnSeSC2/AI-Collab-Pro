/**
 * Enhanced Authentication Handler
 * Handles user registration, login, and Google OAuth integration
 * Version: 1.0.1
 */

// Configuration
// Detect if we're in production and use the appropriate backend URL
const isProduction = window.location.hostname !== 'localhost' && window.location.hostname !== '127.0.0.1';
const BACKEND_URL = isProduction ? 'https://ai-collab-pro.onrender.com' : '';

// Debug logging
console.log('Auth configuration:', {
    hostname: window.location.hostname,
    isProduction,
    BACKEND_URL
});

const API_BASE_URL = `${BACKEND_URL}/api`;

const AUTH_ENDPOINTS = {
    LOGIN: `${API_BASE_URL}/auth/login`,
    SIGNUP: `${API_BASE_URL}/auth/signup`,
    GOOGLE: isProduction 
        ? 'https://ai-collab-pro.onrender.com/api/auth/google' // Always use direct backend URL for OAuth
        : '/api/auth/google', // Local development
    SESSION: `${API_BASE_URL}/auth/session`,
    LOGOUT: `${API_BASE_URL}/auth/logout`
};

// Helper function for redirects
function redirectTo(path) {
    // Always use absolute URLs with origin
    window.location.href = window.location.origin + path;
}

// State
let currentUser = null;
let authInitialized = false;

// CRITICAL: Process OAuth tokens immediately before DOM loads
// This ensures auth.js processes OAuth data before authHandler.js runs
(function checkOAuthTokensImmediately() {
    const urlParams = new URLSearchParams(window.location.search);
    const urlToken = urlParams.get('token');
    const urlUser = urlParams.get('user');
    
    if (urlToken && urlUser) {
        try {
            const userData = JSON.parse(decodeURIComponent(urlUser));
            console.log('🔐 [IMMEDIATE] OAuth token found - processing before DOM load');
            console.log('🔐 [IMMEDIATE] User ID:', userData.id || userData._id);
            
            // Set global variables immediately
            currentUser = userData;
            window.currentAuthUser = userData;
            
            // Store in localStorage immediately
            localStorage.setItem('ai_collab_token', urlToken);
            localStorage.setItem('ai_collab_authenticated', 'true');
            localStorage.setItem('ai_collab_user', JSON.stringify(userData));
            
            console.log('🔐 [IMMEDIATE] OAuth data stored successfully');
        } catch (e) {
            console.error('🔐 [IMMEDIATE] Error processing OAuth token:', e);
        }
    }
})();

// Initialize Auth
let authModuleInitialized = false;
document.addEventListener('DOMContentLoaded', () => {
    if (authModuleInitialized) {
        console.log('Auth module already initialized, skipping...');
        return;
    }
    authModuleInitialized = true;
    
    console.log('Auth module initializing...');
    initializeAuth();
    setupFormHandlers();
    initGoogleAuth();
    handleUrlParams();
});

/**
 * Initialize authentication state
 */
async function initializeAuth() {
    if (authInitialized) return;
    
    // If we already have a currentUser from immediate OAuth processing, use it
    if (currentUser && currentUser.id && !currentUser.id.startsWith('user-')) {
        console.log('🔐 Using OAuth user already processed:', currentUser);
        authInitialized = true;
        
        // Dispatch auth:login event
        document.dispatchEvent(new CustomEvent('auth:login', { 
            detail: currentUser 
        }));
        
        return;
    }
    
    // FIRST: Check URL parameters for OAuth redirect tokens
    const urlParams = new URLSearchParams(window.location.search);
    const urlToken = urlParams.get('token');
    const urlUser = urlParams.get('user');
    
    if (urlToken && urlUser) {
        try {
            const userData = JSON.parse(decodeURIComponent(urlUser));
            console.log('🔐 Found auth token in URL, storing and processing...');
            console.log('  - User ID:', userData.id || userData._id);
            console.log('  - User email:', userData.email);
            console.log('  - Is MongoDB ObjectId:', /^[0-9a-fA-F]{24}$/.test(userData.id || userData._id || ''));
            
            // Store token and user data immediately
            localStorage.setItem('ai_collab_token', urlToken);
            localStorage.setItem('ai_collab_authenticated', 'true');
            localStorage.setItem('ai_collab_user', JSON.stringify(userData));
            if (userData.email) localStorage.setItem('ai_collab_email', userData.email);
            if (userData.name) localStorage.setItem('ai_collab_name', userData.name);
            
            currentUser = userData;
            
            // CRITICAL: Set global variable for authHandler.js to find
            window.currentAuthUser = userData;
            
            // Make sure currentUser is available globally BEFORE cleaning URL
            if (window.AICollabAuth) {
                console.log('🔐 Setting currentUser in window.AICollabAuth');
            }
            
            // Clean URL to remove sensitive data
            const cleanUrl = window.location.pathname;
            window.history.replaceState({}, document.title, cleanUrl);
            
            // Dispatch auth:login event with a small delay to ensure handlers are ready
            setTimeout(() => {
                console.log('🔐 Dispatching auth:login event with user:', currentUser);
                document.dispatchEvent(new CustomEvent('auth:login', { 
                    detail: currentUser 
                }));
            }, 50);
            
            // Mark as initialized and authenticated
            authInitialized = true;
            console.log('✅ OAuth authentication completed successfully');
            return; // Exit early - we're authenticated
        } catch (e) {
            console.error('❌ Error processing OAuth token from URL:', e);
            // Continue with normal auth flow
        }
    }
    
    // Check for the auth page flag to avoid redirect loops
    if (window.IS_AUTH_PAGE) {
        console.log('On authentication page, skipping auth checks');
        authInitialized = true;
        return;
    }
    
    // Check if we have a token in localStorage (for cross-domain auth)
    const storedToken = localStorage.getItem('ai_collab_token');
    const storedUser = localStorage.getItem('ai_collab_user');
    
    if (storedToken && storedUser) {
        try {
            currentUser = JSON.parse(storedUser);
            console.log('Found stored authentication token and user data');
            
            // Still verify with server, but we have local data
        } catch (e) {
            console.error('Error parsing stored user data:', e);
            // Clear invalid data
            localStorage.removeItem('ai_collab_token');
            localStorage.removeItem('ai_collab_user');
        }
    }
    
    // Never redirect from /auth/ paths to prevent loops
    if (window.location.pathname.includes('/auth/')) {
        console.log('On auth endpoint path, skipping auth checks');
        
        // Force redirect to login.html if we ended up at /api/auth/login.html
        if (window.location.pathname.includes('/api/auth/login.html')) {
            console.log('Detected API path in URL, redirecting to correct login page');
            window.location.replace(window.location.origin + '/login.html');
            return;
        }
        
        authInitialized = true;
        return;
    }
    
    try {
        console.log('Checking authentication session...');
        
        // Get token from localStorage for cross-domain auth
        const token = localStorage.getItem('ai_collab_token');
        const headers = {
            'Content-Type': 'application/json'
        };
        
        // Add token to headers if available
        if (token) {
            headers['Authorization'] = `Bearer ${token}`;
        }
        
        const response = await fetch(AUTH_ENDPOINTS.SESSION, {
            method: 'GET',
            credentials: 'include',
            headers
        });
        
        const data = await response.json();
        
        if (data && data.authenticated && data.user) {
            currentUser = data.user;
            console.log('User already authenticated from server:', currentUser.email);
            console.log('  - User ID:', currentUser.id || currentUser._id);
            console.log('  - Is MongoDB ObjectId:', /^[0-9a-fA-F]{24}$/.test(currentUser.id || currentUser._id || ''));
            
            // Store authentication state for future use
            localStorage.setItem('ai_collab_authenticated', 'true');
            if (currentUser.email) localStorage.setItem('ai_collab_email', currentUser.email);
            if (currentUser.name) localStorage.setItem('ai_collab_name', currentUser.name);
            
            // Dispatch auth:login event for authenticated users
            document.dispatchEvent(new CustomEvent('auth:login', { 
                detail: currentUser 
            }));
            
            // If we're on an auth page, redirect to the main app
            if (isAuthPage()) {
                console.log('On auth page with active session, redirecting to main app');
                redirectTo('/hub.html');
            }
        } else {
            console.log('No active session found on server');
            
            // Double-check if we have a token that wasn't sent properly
            const tokenCheck = localStorage.getItem('ai_collab_token');
            if (tokenCheck && currentUser) {
                console.log('Have local token but server check failed - keeping local auth state');
                // Don't clear auth data or redirect - we have valid local auth
                authInitialized = true;
                return;
            }
            
            // Clear any lingering authentication data only if we really have no auth
            localStorage.removeItem('ai_collab_token');
            localStorage.removeItem('ai_collab_authenticated');
            localStorage.removeItem('ai_collab_user');
            localStorage.removeItem('ai_collab_email');
            localStorage.removeItem('ai_collab_name');
            currentUser = null;
            
            // Only redirect to login if on a protected page and not already on an auth page
            if (isProtectedPage() && !isAuthPage()) {
                console.log('On protected page without session, redirecting to login');
                redirectTo('/login.html');
            }
        }
    } catch (error) {
        console.error('Error checking authentication status:', error);
        
        // Clear auth state
        localStorage.removeItem('ai_collab_authenticated');
        localStorage.removeItem('ai_collab_email');
        localStorage.removeItem('ai_collab_name');
        
        // Redirect to login if on a protected page
        if (isProtectedPage() && !isAuthPage()) {
            console.log('Error checking auth, redirecting to login');
            redirectTo('/login.html');
        }
    } finally {
        authInitialized = true;
    }
}

/**
 * Check if current page is an authentication page
 */
function isAuthPage() {
    if (window.IS_AUTH_PAGE) return true;
    
    const path = window.location.pathname;
    // Check for both /login.html and auth/login.html paths
    return path.includes('login.html') || path.includes('signup.html') || path.includes('/auth/');
}

/**
 * Check if current page requires authentication
 */
function isProtectedPage() {
    const path = window.location.pathname;
    const publicPages = ['/index.html', '/login.html', '/signup.html'];
    
    // If path is explicitly public, or is the root, it's not protected
    if (publicPages.some(page => path.includes(page)) || path === '/' || path === '') {
        return false;
    }
    
    // Special case for auth paths
    if (path.includes('/auth/')) {
        return false;
    }
    
    // If we have a valid token in localStorage, consider the user authenticated
    // This prevents redirect loops in cross-domain scenarios
    const hasToken = localStorage.getItem('ai_collab_token');
    const hasUser = localStorage.getItem('ai_collab_user');
    if (hasToken && hasUser) {
        console.log('Have valid local auth token, allowing access to protected page');
        return false; // Don't treat as protected if we have local auth
    }
    
    return true;
}

/**
 * Set up form event handlers
 */
function setupFormHandlers() {
    // Login form
    const loginForm = document.getElementById('login-form');
    if (loginForm) {
        loginForm.addEventListener('submit', handleLogin);
    }
    
    // Signup form
    const signupForm = document.getElementById('signup-form');
    if (signupForm) {
        signupForm.addEventListener('submit', handleSignup);
        
        // Plan selection
        const planOptions = document.querySelectorAll('.plan-option');
        planOptions.forEach(option => {
            option.addEventListener('click', () => {
                // Update visual selection
                planOptions.forEach(p => p.classList.remove('selected'));
                option.classList.add('selected');
                
                // Update hidden input
                const selectedPlan = option.getAttribute('data-plan');
                document.getElementById('selected-plan').value = selectedPlan;
            });
        });
        
        // Password confirmation validation
        const passwordInput = document.getElementById('password');
        const confirmPasswordInput = document.getElementById('confirm-password');
        
        if (passwordInput && confirmPasswordInput) {
            confirmPasswordInput.addEventListener('input', () => {
                if (passwordInput.value !== confirmPasswordInput.value) {
                    confirmPasswordInput.setCustomValidity('Passwords do not match');
                } else {
                    confirmPasswordInput.setCustomValidity('');
                }
            });
        }
    }
}

/**
 * Handle login form submission
 */
async function handleLogin(event) {
    event.preventDefault();
    
    const emailInput = document.getElementById('email');
    const passwordInput = document.getElementById('password');
    const rememberMeInput = document.getElementById('remember-me');
    const loginErrorEl = document.getElementById('login-error');
    
    // Basic validation
    if (!emailInput.value || !passwordInput.value) {
        showFormError(loginErrorEl, 'Please fill in all required fields');
        return;
    }
    
    // Clear previous errors
    hideFormError(loginErrorEl);
    
    try {
        console.log('Submitting login credentials...');
        const response = await fetch(AUTH_ENDPOINTS.LOGIN, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            credentials: 'include',
            body: JSON.stringify({
                email: emailInput.value,
                password: passwordInput.value,
                rememberMe: rememberMeInput?.checked || false
            }),
            // Don't automatically follow redirects
            redirect: 'manual'
        });
        
        console.log('Login response status:', response.status, response.type);
        
        // Check if the server responded with a redirect
        if (response.type === 'opaqueredirect' || (response.status >= 300 && response.status < 400)) {
            console.log('Server responded with redirect, proceeding to index.html');
            // This is likely a successful login that redirects - go to the main app
            
            // Store auth state
            localStorage.setItem('ai_collab_authenticated', 'true');
            
            // Simulate successful login
            document.dispatchEvent(new CustomEvent('auth:login', { 
                detail: { 
                    email: emailInput.value,
                    name: 'User'
                } 
            }));
            
            // Go to main app
            redirectTo('/hub.html');
            return;
        }
        
        try {
            const data = await response.json();
            
            if (response.ok && data.success) {
                console.log('Login successful:', data.user);
                currentUser = data.user;
                
                // Store token and user data for cross-domain auth
                if (data.token) {
                    localStorage.setItem('ai_collab_token', data.token);
                    localStorage.setItem('ai_collab_authenticated', 'true');
                    localStorage.setItem('ai_collab_user', JSON.stringify(data.user));
                }
                
                // Dispatch auth:login event before redirecting
                document.dispatchEvent(new CustomEvent('auth:login', { 
                    detail: data.user 
                }));
                
                // Always redirect to hub page with absolute URL
                window.location.href = window.location.origin + '/hub.html';
            } else {
                showFormError(loginErrorEl, data.message || 'Login failed. Please check your credentials.');
            }
        } catch (jsonError) {
            console.error('Error parsing login response:', jsonError);
            // The response wasn't JSON, but might still be successful
            if (response.ok) {
                console.log('Login successful, but response format unexpected');
                redirectTo('/hub.html');
            } else {
                showFormError(loginErrorEl, 'Login failed with an unexpected server response.');
            }
        }
    } catch (error) {
        console.error('Login error:', error);
        showFormError(loginErrorEl, 'An error occurred during login. Please try again later.');
    }
}

/**
 * Handle signup form submission
 */
async function handleSignup(event) {
    event.preventDefault();
    
    const fullnameInput = document.getElementById('fullname');
    const emailInput = document.getElementById('email');
    const passwordInput = document.getElementById('password');
    const confirmPasswordInput = document.getElementById('confirm-password');
    const termsInput = document.getElementById('terms');
    const selectedPlan = document.getElementById('selected-plan').value;
    const signupErrorEl = document.getElementById('signup-error');
    
    // Basic validation
    if (!fullnameInput.value || !emailInput.value || !passwordInput.value) {
        showFormError(signupErrorEl, 'Please fill in all required fields');
        return;
    }
    
    if (passwordInput.value !== confirmPasswordInput.value) {
        showFormError(signupErrorEl, 'Passwords do not match');
        return;
    }
    
    if (!termsInput.checked) {
        showFormError(signupErrorEl, 'You must agree to the Terms of Service');
        return;
    }
    
    // Clear previous errors
    hideFormError(signupErrorEl);
    
    try {
        console.log('Submitting signup data...');
        const response = await fetch(AUTH_ENDPOINTS.SIGNUP, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            credentials: 'include',
            body: JSON.stringify({
                name: fullnameInput.value,
                email: emailInput.value,
                password: passwordInput.value,
                subscriptionPlan: selectedPlan
            }),
            // Don't automatically follow redirects
            redirect: 'manual'
        });
        
        console.log('Signup response status:', response.status, response.type);
        
        // Check if the server responded with a redirect
        if (response.type === 'opaqueredirect' || (response.status >= 300 && response.status < 400)) {
            console.log('Server responded with redirect, handling as successful signup');
            // This is likely a successful signup that redirects
            
            // Store auth state
            localStorage.setItem('ai_collab_authenticated', 'true');
            
            // Create user object from form input
            const user = {
                name: fullnameInput.value,
                email: emailInput.value
            };
            currentUser = user;
            
            // Simulate successful signup
            document.dispatchEvent(new CustomEvent('auth:login', { 
                detail: user
            }));
            
            // Redirect based on plan
            if (selectedPlan === 'pro') {
                redirectTo('/payment.html');
            } else {
                redirectTo('/hub.html');
            }
            return;
        }
        
        try {
            const data = await response.json();
            
            if (response.ok && data.success) {
                console.log('Signup successful:', data.user);
                currentUser = data.user;
                
                // Store token and user data for cross-domain auth
                if (data.token) {
                    localStorage.setItem('ai_collab_token', data.token);
                    localStorage.setItem('ai_collab_authenticated', 'true');
                    localStorage.setItem('ai_collab_user', JSON.stringify(data.user));
                }
                
                // Dispatch auth:login event before redirecting
                document.dispatchEvent(new CustomEvent('auth:login', { 
                    detail: data.user 
                }));
                
                // Redirect based on plan
                if (selectedPlan === 'pro') {
                    window.location.href = window.location.origin + '/payment.html';
                } else {
                    window.location.href = window.location.origin + '/hub.html';
                }
            } else {
                showFormError(signupErrorEl, data.message || 'Registration failed. Please try again.');
            }
        } catch (jsonError) {
            console.error('Error parsing signup response:', jsonError);
            // The response wasn't JSON, but might still be successful
            if (response.ok) {
                console.log('Signup successful, but response format unexpected');
                // Redirect based on plan
                if (selectedPlan === 'pro') {
                    redirectTo('/payment.html');
                } else {
                    redirectTo('/hub.html');
                }
            } else {
                showFormError(signupErrorEl, 'Registration failed with an unexpected server response.');
            }
        }
    } catch (error) {
        console.error('Signup error:', error);
        showFormError(signupErrorEl, 'An error occurred during registration. Please try again later.');
    }
}

/**
 * Initialize Google Sign-In
 */
function initGoogleAuth() {
    // Google Sign-In Button Handlers
    const googleLoginBtn = document.getElementById('google-login-btn');
    if (googleLoginBtn) {
        googleLoginBtn.addEventListener('click', () => {
            handleGoogleAuth('login');
        });
    }
    
    const googleSignupBtn = document.getElementById('google-signup-btn');
    if (googleSignupBtn) {
        googleSignupBtn.addEventListener('click', () => {
            handleGoogleAuth('signup');
        });
    }
}

/**
 * Handle Google Authentication
 */
function handleGoogleAuth(mode) {
    // Store default redirect path and auth mode in localStorage for potential use after auth
    localStorage.setItem('ai_collab_redirect', '/hub.html');
    localStorage.setItem('ai_collab_auth_mode', mode);
    
    // Use the configured Google auth endpoint
    const googleAuthUrl = AUTH_ENDPOINTS.GOOGLE;
    
    console.log('Redirecting for Google auth using Passport.js:', googleAuthUrl);
    console.log('Current location:', window.location.hostname);
    console.log('Is production:', isProduction);
    console.log('Auth endpoints:', AUTH_ENDPOINTS);
    
    // Use direct redirect
    window.location.href = googleAuthUrl;
}

/**
 * Handle URL parameters (for redirects and errors)
 */
function handleUrlParams() {
    const urlParams = new URLSearchParams(window.location.search);
    const authError = urlParams.get('auth_error');
    const plan = urlParams.get('plan');
    const token = urlParams.get('token');
    const user = urlParams.get('user');
    
    // Skip token processing if already handled in initializeAuth
    if (token && user && authInitialized) {
        console.log('Token already processed in initializeAuth, skipping duplicate processing');
        return;
    }
    
    // Handle successful Google auth redirect (backup in case initializeAuth didn't catch it)
    if (token && user && !authInitialized) {
        try {
            const userData = JSON.parse(decodeURIComponent(user));
            console.log('Auth successful, storing token and user data (backup handler)');
            currentUser = userData;
            
            // Store token and user data in localStorage for cross-domain auth
            localStorage.setItem('ai_collab_token', token);
            localStorage.setItem('ai_collab_authenticated', 'true');
            localStorage.setItem('ai_collab_user', JSON.stringify(userData));
            if (userData.email) localStorage.setItem('ai_collab_email', userData.email);
            if (userData.name) localStorage.setItem('ai_collab_name', userData.name);
            
            // Clean URL to remove token
            const cleanUrl = window.location.pathname;
            window.history.replaceState({}, document.title, cleanUrl);
            
            // Dispatch auth:login event
            document.dispatchEvent(new CustomEvent('auth:login', { 
                detail: userData 
            }));
            
            // Stay on current page (hub.html) - don't redirect
            return;
        } catch (e) {
            console.error('Error parsing user data:', e);
        }
    }
    
    // Handle auth errors
    if (authError) {
        const errorEl = document.getElementById(window.location.pathname.includes('login') ? 'login-error' : 'signup-error');
        showFormError(errorEl, decodeURIComponent(authError));
    }
    
    // Handle plan selection
    if (plan && ['free', 'pro', 'enterprise'].includes(plan)) {
        const planOptions = document.querySelectorAll('.plan-option');
        planOptions.forEach(option => {
            if (option.getAttribute('data-plan') === plan) {
                // Simulate click to select the correct plan
                option.click();
            }
        });
    }
}

/**
 * Log the user out
 */
async function logout() {
    try {
        // Clear all authentication state from localStorage
        localStorage.removeItem('ai_collab_token');
        localStorage.removeItem('ai_collab_authenticated');
        localStorage.removeItem('ai_collab_user');
        localStorage.removeItem('ai_collab_email');
        localStorage.removeItem('ai_collab_name');
        
        // Reset current user
        currentUser = null;
        
        // Try to call the server logout endpoint
        try {
            const response = await fetch(AUTH_ENDPOINTS.LOGOUT, {
                method: 'POST',
                credentials: 'include',
                headers: getAuthHeaders()
            });
            console.log('Server logout response:', response.status);
        } catch (serverError) {
            // Silently continue if server logout fails
            console.log('Server logout request failed, continuing with client logout');
        }
        
        // Dispatch logout event
        document.dispatchEvent(new CustomEvent('auth:logout'));
        
        // Always redirect to login page regardless of response
        redirectTo('/login.html');
    } catch (error) {
        console.error('Client-side logout error:', error);
        // Still redirect even if there's an error
        redirectTo('/login.html');
    }
}

/**
 * Display form errors
 */
function showFormError(errorElement, message) {
    if (errorElement) {
        errorElement.textContent = message;
        errorElement.style.display = 'block';
    } else {
        console.error('Error element not found');
    }
}

/**
 * Clear form errors
 */
function hideFormError(errorElement) {
    if (errorElement) {
        errorElement.style.display = 'none';
    }
}

/**
 * Handle Google One Tap Sign-In response
 * This function is called by the Google One Tap Sign-In API
 */
function handleGoogleOneTapResponse(response) {
    console.log('Google One Tap response:', response);
    
    // Extract the credential
    const credential = response.credential;
    const context = document.getElementById('g_id_onload')?.getAttribute('data-context') || 'signin';
    
    // Send the credential to our backend
    fetch(AUTH_ENDPOINTS.GOOGLE, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json'
        },
        credentials: 'include',
        body: JSON.stringify({
            credential,
            mode: context
        })
    })
    .then(response => response.json())
    .then(data => {
        if (data.success) {
            console.log('Google authentication successful:', data.user);
            currentUser = data.user;
            
            // Dispatch auth:login event before redirecting
            document.dispatchEvent(new CustomEvent('auth:login', { 
                detail: data.user 
            }));
            
            redirectTo('/hub.html');
        } else {
            console.error('Google authentication failed:', data.message);
            const errorEl = document.getElementById(context === 'signup' ? 'signup-error' : 'login-error');
            showFormError(errorEl, data.message || 'Google authentication failed. Please try again.');
        }
    })
    .catch(error => {
        console.error('Google authentication error:', error);
        const errorEl = document.getElementById(context === 'signup' ? 'signup-error' : 'login-error');
        showFormError(errorEl, 'An error occurred during Google authentication. Please try again later.');
    });
}

/**
 * Get authentication headers for API requests
 */
function getAuthHeaders() {
    const token = localStorage.getItem('ai_collab_token');
    const headers = {
        'Content-Type': 'application/json'
    };
    
    if (token) {
        headers['Authorization'] = `Bearer ${token}`;
    }
    
    return headers;
}

// Export auth methods for global use
window.AICollabAuth = {
    logout,
    getCurrentUser: () => {
        // Also check localStorage if currentUser is not set
        if (!currentUser) {
            const storedUser = localStorage.getItem('ai_collab_user');
            if (storedUser) {
                try {
                    currentUser = JSON.parse(storedUser);
                    console.log('🔐 Retrieved user from localStorage in getCurrentUser');
                } catch (e) {
                    console.error('Error parsing stored user in getCurrentUser:', e);
                }
            }
        }
        return currentUser;
    },
    isAuthenticated: () => !!currentUser || !!localStorage.getItem('ai_collab_token'),
    getAuthHeaders, // Export for use in other modules
    // Expose initializeAuth for manual re-initialization if needed
    reinitialize: initializeAuth
};

// Make the Google One Tap handler available globally
window.handleGoogleOneTapResponse = handleGoogleOneTapResponse;
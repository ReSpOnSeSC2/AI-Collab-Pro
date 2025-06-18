/**
 * Enhanced Authentication Handler
 * Handles user registration, login, and Google OAuth integration
 * Version: 1.0.1
 */

// Configuration
// Detect if we're in production and use the appropriate backend URL
const isProduction = window.location.hostname !== 'localhost' && window.location.hostname !== '127.0.0.1';
const BACKEND_URL = isProduction ? 'https://ai-collab-pro.onrender.com' : '';
const API_BASE_URL = `${BACKEND_URL}/api`;

const AUTH_ENDPOINTS = {
    LOGIN: `${API_BASE_URL}/auth/login`,
    SIGNUP: `${API_BASE_URL}/auth/signup`,
    GOOGLE: `${API_BASE_URL}/auth/google`, // Direct to Passport.js Google auth
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

// Initialize Auth
document.addEventListener('DOMContentLoaded', () => {
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
    
    // Check for the auth page flag to avoid redirect loops
    if (window.IS_AUTH_PAGE) {
        console.log('On authentication page, skipping auth checks');
        authInitialized = true;
        return;
    }
    
    // Session-based authentication is preferred over localStorage
    // But we'll keep localStorage as a fallback for compatibility
    if (localStorage.getItem('ai_collab_authenticated') === 'true') {
        console.log('Found stored authentication state in localStorage, but will verify with server');
        // We'll continue with the server check, but won't redirect immediately
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
        const response = await fetch(AUTH_ENDPOINTS.SESSION, {
            method: 'GET',
            credentials: 'include',
            headers: {
                'Content-Type': 'application/json'
            }
        });
        
        const data = await response.json();
        
        if (data && data.authenticated && data.user) {
            currentUser = data.user;
            console.log('User already authenticated from server:', currentUser.email);
            
            // Store authentication state for future use
            localStorage.setItem('ai_collab_authenticated', 'true');
            if (currentUser.email) localStorage.setItem('ai_collab_email', currentUser.email);
            if (currentUser.name) localStorage.setItem('ai_collab_name', currentUser.name);
            
            // If we're on an auth page, redirect to the main app
            if (isAuthPage()) {
                console.log('On auth page with active session, redirecting to main app');
                redirectTo('/hub.html');
            }
        } else {
            console.log('No active session found on server');
            
            // Clear any lingering authentication data
            localStorage.removeItem('ai_collab_authenticated');
            localStorage.removeItem('ai_collab_email');
            localStorage.removeItem('ai_collab_name');
            
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
    
    // Handle successful Google auth redirect
    if (token && user) {
        try {
            const userData = JSON.parse(decodeURIComponent(user));
            console.log('Auth successful, user:', userData);
            currentUser = userData;
            
            // Dispatch auth:login event before redirecting
            document.dispatchEvent(new CustomEvent('auth:login', { 
                detail: userData 
            }));
            
            // Always redirect to hub.html
            redirectTo('/hub.html');
            return; // Exit early since we're redirecting
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
        localStorage.removeItem('ai_collab_authenticated');
        localStorage.removeItem('ai_collab_email');
        localStorage.removeItem('ai_collab_name');
        
        // Reset current user
        currentUser = null;
        
        // Try to call the server logout endpoint
        try {
            const response = await fetch(AUTH_ENDPOINTS.LOGOUT, {
                method: 'POST',
                credentials: 'include'
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

// Export auth methods for global use
window.AICollabAuth = {
    logout,
    getCurrentUser: () => currentUser,
    isAuthenticated: () => !!currentUser
};

// Make the Google One Tap handler available globally
window.handleGoogleOneTapResponse = handleGoogleOneTapResponse;
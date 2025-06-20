/**
 * Frontend Authentication Handler (Refactored Module)
 * Checks authentication status and provides user information.
 * Version: 8.0.0
 */

let currentUser = null;
let authCheckComplete = false;
let authCheckPromise = null;

/**
 * Initializes the authentication check process.
 */
export function initialize() {
    console.log("Auth Handler: Initializing...");
    
    // CRITICAL: Check multiple sources for OAuth user to avoid race conditions
    
    // 1. Check global variable set immediately by auth.js OAuth processing
    if (window.currentAuthUser && window.currentAuthUser.id && !window.currentAuthUser.id.startsWith('user-')) {
        const authUser = window.currentAuthUser;
        console.log("Auth Handler: ✅ Found OAuth user in window.currentAuthUser:", authUser);
        
        currentUser = {
            id: authUser.id || authUser._id,
            _id: authUser._id || authUser.id,
            name: authUser.name || 'Authenticated User',
            email: authUser.email,
            image: authUser.image,
            subscriptionTier: authUser.subscriptionTier || 'free',
            apiKeysConfigured: authUser.apiKeysConfigured || {}
        };
        
        console.log("Auth Handler: Using OAuth user with ID:", currentUser.id);
        authCheckComplete = true;
        authCheckPromise = Promise.resolve();
        
        // Dispatch events
        setTimeout(() => {
            dispatchLogin(currentUser);
            dispatchAuthChecked(true);
        }, 100);
        
        return authCheckPromise;
    }
    
    // 2. Check if auth.js already processed OAuth through AICollabAuth
    if (window.AICollabAuth && window.AICollabAuth.getCurrentUser()) {
        const authUser = window.AICollabAuth.getCurrentUser();
        console.log("Auth Handler: ✅ Detected user from auth.js:", authUser);
        
        // Use the OAuth user instead of creating temporary
        currentUser = {
            id: authUser.id || authUser._id,
            _id: authUser._id || authUser.id,
            name: authUser.name || 'Authenticated User',
            email: authUser.email,
            image: authUser.image,
            subscriptionTier: authUser.subscriptionTier || 'free',
            apiKeysConfigured: authUser.apiKeysConfigured || {}
        };
        
        console.log("Auth Handler: Using OAuth user with ID:", currentUser.id);
        authCheckComplete = true;
        authCheckPromise = Promise.resolve();
        
        // Dispatch events
        setTimeout(() => {
            dispatchLogin(currentUser);
            dispatchAuthChecked(true);
        }, 100);
        
        return authCheckPromise;
    }
    
    // 2. Check localStorage as backup (in case auth.js stored but hasn't set window.AICollabAuth yet)
    const storedToken = localStorage.getItem('ai_collab_token');
    const storedUser = localStorage.getItem('ai_collab_user');
    
    if (storedToken && storedUser) {
        try {
            const userData = JSON.parse(storedUser);
            console.log("Auth Handler: ✅ Found OAuth user in localStorage:", userData);
            
            currentUser = {
                id: userData.id || userData._id,
                _id: userData._id || userData.id,
                name: userData.name || 'Authenticated User',
                email: userData.email,
                image: userData.image,
                subscriptionTier: userData.subscriptionTier || 'free',
                apiKeysConfigured: userData.apiKeysConfigured || {}
            };
            
            console.log("Auth Handler: Using localStorage OAuth user with ID:", currentUser.id);
            authCheckComplete = true;
            authCheckPromise = Promise.resolve();
            
            // Dispatch events
            setTimeout(() => {
                dispatchLogin(currentUser);
                dispatchAuthChecked(true);
            }, 100);
            
            return authCheckPromise;
        } catch (e) {
            console.error("Auth Handler: Error parsing stored user data:", e);
        }
    }
    
    // 3. Check URL parameters directly as another backup
    const urlParams = new URLSearchParams(window.location.search);
    const urlToken = urlParams.get('token');
    const urlUser = urlParams.get('user');
    
    if (urlToken && urlUser) {
        console.log("Auth Handler: ⏳ OAuth token in URL, waiting for auth.js to process...");
        // Give auth.js a bit more time to process
        authCheckPromise = new Promise((resolve) => {
            setTimeout(() => {
                // Re-check after delay
                if (window.AICollabAuth && window.AICollabAuth.getCurrentUser()) {
                    const authUser = window.AICollabAuth.getCurrentUser();
                    console.log("Auth Handler: ✅ auth.js processed OAuth user:", authUser);
                    
                    currentUser = {
                        id: authUser.id || authUser._id,
                        _id: authUser._id || authUser.id,
                        name: authUser.name || 'Authenticated User',
                        email: authUser.email,
                        image: authUser.image,
                        subscriptionTier: authUser.subscriptionTier || 'free',
                        apiKeysConfigured: authUser.apiKeysConfigured || {}
                    };
                    
                    authCheckComplete = true;
                    dispatchLogin(currentUser);
                    dispatchAuthChecked(true);
                    resolve();
                } else {
                    // Fall back to normal auth check
                    checkAuthStatus().then(resolve);
                }
            }, 500); // Wait 500ms for auth.js to complete
        });
        return authCheckPromise;
    }
    
    if (!authCheckPromise) {
        authCheckPromise = checkAuthStatus();
    }
    return authCheckPromise;
}

/**
 * Checks the user's authentication status by querying the backend.
 * Dispatches 'auth:login' or 'auth:checked' events.
 */
async function checkAuthStatus() {
    if (authCheckComplete) {
        console.log("Auth Handler: Auth check already completed.");
        // Re-dispatch events if needed, or just resolve
        dispatchAuthChecked(!!currentUser);
        if (currentUser) {
            dispatchLogin(currentUser);
        }
        return;
    }

    console.log("Auth Handler: Checking authentication status...");
    
    // FIRST: Check URL parameters for OAuth redirect tokens
    const urlParams = new URLSearchParams(window.location.search);
    const urlToken = urlParams.get('token');
    const urlUser = urlParams.get('user');
    
    if (urlToken && urlUser) {
        console.log('Auth Handler: OAuth token detected in URL, waiting for auth.js to process...');
        // Give auth.js time to process the OAuth data
        await new Promise(resolve => setTimeout(resolve, 500));
        
        // Check if auth.js processed it
        if (window.AICollabAuth && window.AICollabAuth.getCurrentUser()) {
            const authUser = window.AICollabAuth.getCurrentUser();
            console.log("Auth Handler: Using OAuth user from auth.js:", authUser);
            currentUser = {
                id: authUser.id || authUser._id,
                _id: authUser._id || authUser.id,
                name: authUser.name || 'Authenticated User',
                email: authUser.email,
                image: authUser.image,
                subscriptionTier: authUser.subscriptionTier || 'free',
                apiKeysConfigured: authUser.apiKeysConfigured || {}
            };
            dispatchLogin(currentUser);
            authCheckComplete = true;
            dispatchAuthChecked(true);
            authCheckPromise = Promise.resolve();
            return;
        }
        
        // Fallback: process OAuth data ourselves
        try {
            const userData = JSON.parse(decodeURIComponent(urlUser));
            console.log('Auth Handler: Processing OAuth token directly...');
            currentUser = {
                id: userData.id || userData._id, // Use MongoDB ObjectId
                _id: userData._id || userData.id,
                name: userData.name || 'Authenticated User',
                email: userData.email,
                image: userData.image,
                subscriptionTier: userData.subscriptionTier || 'free',
                apiKeysConfigured: userData.apiKeysConfigured || {}
            };
            console.log("Auth Handler: OAuth user authenticated:", currentUser.id);
            console.log("Auth Handler: API keys configured:", currentUser.apiKeysConfigured);
            dispatchLogin(currentUser);
            authCheckComplete = true;
            dispatchAuthChecked(true);
            authCheckPromise = Promise.resolve();
            return; // Exit early - we're authenticated via OAuth
        } catch (e) {
            console.error('Auth Handler: Error processing OAuth token from URL:', e);
            // Continue with normal auth flow
        }
    }
    
    // SECOND: Check localStorage for stored auth data
    const storedUser = localStorage.getItem('ai_collab_user');
    const storedToken = localStorage.getItem('ai_collab_token');
    
    if (storedUser && storedToken) {
        try {
            const userData = JSON.parse(storedUser);
            console.log('Auth Handler: Found stored user data in localStorage');
            currentUser = {
                id: userData.id || userData._id,
                _id: userData._id || userData.id,
                name: userData.name || 'Authenticated User',
                email: userData.email,
                image: userData.image,
                subscriptionTier: userData.subscriptionTier || 'free',
                apiKeysConfigured: userData.apiKeysConfigured || {}
            };
            console.log("Auth Handler: Using stored user:", currentUser.id);
            dispatchLogin(currentUser);
            authCheckComplete = true;
            dispatchAuthChecked(true);
            authCheckPromise = Promise.resolve();
            return;
        } catch (e) {
            console.error('Auth Handler: Error parsing stored user data:', e);
            // Continue with session check
        }
    }
    
    try {
        // Use ConnectionManager or wsPathHelper if available for URL construction
        const sessionUrl = '/api/auth/session'; // Keep it simple for standalone
        console.log("Auth Handler: Fetching session from:", sessionUrl);

        const response = await fetch(sessionUrl);
        const data = await response.json();

        if (data && data.user && data.user.id) { // Check for user and id
            currentUser = {
                id: data.user.id,
                _id: data.user._id || data.user.id, // Include MongoDB ID
                name: data.user.name || 'Authenticated User',
                email: data.user.email, // Optional
                image: data.user.image, // Optional
                subscriptionTier: data.user.subscriptionTier || 'free', // Default tier if missing
                apiKeysConfigured: data.user.apiKeysConfigured || {} // API key status
            };
            console.log("Auth Handler: User authenticated from session:", currentUser.id);
            console.log("Auth Handler: API keys configured:", currentUser.apiKeysConfigured);
            dispatchLogin(currentUser);
        } else {
            // Before creating temporary user, double-check for OAuth data
            const finalCheckToken = localStorage.getItem('ai_collab_token');
            const finalCheckUser = localStorage.getItem('ai_collab_user');
            
            if (finalCheckToken && finalCheckUser) {
                try {
                    const userData = JSON.parse(finalCheckUser);
                    console.log("Auth Handler: ✅ Last-chance OAuth user found in localStorage:", userData);
                    
                    currentUser = {
                        id: userData.id || userData._id,
                        _id: userData._id || userData.id,
                        name: userData.name || 'Authenticated User',
                        email: userData.email,
                        image: userData.image,
                        subscriptionTier: userData.subscriptionTier || 'free',
                        apiKeysConfigured: userData.apiKeysConfigured || {}
                    };
                    
                    console.log("Auth Handler: Using last-chance OAuth user with ID:", currentUser.id);
                    dispatchLogin(currentUser);
                    return; // Exit without creating temporary user
                } catch (e) {
                    console.error("Auth Handler: Error parsing final check user data:", e);
                }
            }
            
            // Only create temporary user if absolutely no OAuth data found
            console.warn("Auth Handler: ⚠️ No OAuth data found, creating temporary user");
            const userId = `user-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`;
            currentUser = {
                id: userId,
                name: 'Local User',
                subscriptionTier: 'enterprise' // Grant full access in standalone
            };
            console.log("Auth Handler: Using default local user:", currentUser.id);
            dispatchLogin(currentUser); // Dispatch login even for default user
        }
    } catch (error) {
        console.error('Auth Handler: Error checking authentication status:', error);
        // Fallback to default user on error
        const userId = `user-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`;
        currentUser = {
            id: userId,
            name: 'Local User (Error)',
            subscriptionTier: 'enterprise'
        };
        console.log("Auth Handler: Using fallback local user after error:", currentUser.id);
        dispatchLogin(currentUser);
    } finally {
        authCheckComplete = true;
        dispatchAuthChecked(!!currentUser); // Pass true as we always have a user (real or default)
        authCheckPromise = Promise.resolve(); // Resolve the promise
    }
}

/**
 * Dispatches the 'auth:login' event.
 * @param {object} user - The user object.
 */
function dispatchLogin(user) {
    try {
        document.dispatchEvent(new CustomEvent('auth:login', { detail: user }));
    } catch (e) {
        console.error("Error dispatching auth:login event:", e);
    }
}

/**
 * Dispatches the 'auth:checked' event.
 * @param {boolean} isAuthenticated - Whether a user (real or default) is considered authenticated.
 */
function dispatchAuthChecked(isAuthenticated) {
     try {
        document.dispatchEvent(new CustomEvent('auth:checked', {
            detail: { isAuthenticated }
        }));
    } catch (e) {
        console.error("Error dispatching auth:checked event:", e);
    }
}

/**
 * Checks if the user is considered authenticated (always true in this refactor).
 * @returns {boolean} True.
 */
export function isAuthenticated() {
    // In this refactored standalone version, we always consider a user "authenticated"
    // either via a real session or the default local user profile.
    return true;
}

/**
 * Gets the current user object (real or default).
 * Waits for the initial auth check if it hasn't completed.
 * @returns {Promise<object>} A promise that resolves with the user object.
 */
export async function getCurrentUser() {
    if (!authCheckComplete && authCheckPromise) {
        await authCheckPromise; // Wait for the initial check to finish
    }
    if (!currentUser) {
        // This should ideally not happen after initialize() runs, but as a fallback:
        console.warn("Auth Handler: getCurrentUser called before initialization or after error, creating temporary user.");
        return { id: `temp-${Date.now()}`, name: 'Temporary User', subscriptionTier: 'enterprise' };
    }
    return currentUser;
}

/**
 * Gets the current user ID.
 * Waits for the initial auth check if it hasn't completed.
 * @returns {Promise<string|null>} A promise that resolves with the user ID or null.
 */
export async function getUserId() {
    const user = await getCurrentUser();
    return user?.id || null;
}
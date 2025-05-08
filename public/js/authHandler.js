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
    try {
        // Use ConnectionManager or wsPathHelper if available for URL construction
        const sessionUrl = '/api/auth/session'; // Keep it simple for standalone
        console.log("Auth Handler: Fetching session from:", sessionUrl);

        const response = await fetch(sessionUrl);
        const data = await response.json();

        if (data && data.user && data.user.id) { // Check for user and id
            currentUser = {
                id: data.user.id,
                name: data.user.name || 'Authenticated User',
                email: data.user.email, // Optional
                image: data.user.image, // Optional
                subscriptionTier: data.user.subscriptionTier || 'free' // Default tier if missing
            };
            console.log("Auth Handler: User authenticated from session:", currentUser.id);
            dispatchLogin(currentUser);
        } else {
            // Simulate a default "logged in" user for standalone mode
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
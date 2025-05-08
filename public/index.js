// Simple redirect to enforce authentication
window.addEventListener('DOMContentLoaded', () => {
    // Check if we should redirect to landing page for non-authenticated users
    // The auth.js will handle redirection to login if needed
    const checkAuth = async () => {
        // First check if we have a stored auth state from localStorage
        if (localStorage.getItem('ai_collab_authenticated') === 'true') {
            console.log("Found stored authentication state, skipping server check");
            return; // User is authenticated via localStorage, don't redirect
        }

        try {
            const response = await fetch('/api/auth/session', {
                method: 'GET',
                credentials: 'include',
                headers: {
                    'Content-Type': 'application/json'
                }
            });
            
            // If response fails, don't immediately redirect - auth.js might handle the auth
            const data = await response.json();
            
            if (!data || !data.authenticated) {
                console.log("No server-side authentication found");
                
                // Before redirecting, check if auth.js has set up authentication
                if (window.AICollabAuth && window.AICollabAuth.isAuthenticated()) {
                    console.log("Local authentication found, allowing access");
                    return;
                }
                
                // Only redirect if no authentication found anywhere
                window.location.href = 'login.html';
            }
        } catch (error) {
            console.error('Error checking authentication:', error);
            
            // Before redirecting on error, check if auth.js has set up authentication
            if (window.AICollabAuth && window.AICollabAuth.isAuthenticated()) {
                console.log("Local authentication found despite API error, allowing access");
                return;
            }
            
            // Redirect to login page on error only if no local auth
            window.location.href = 'login.html';
        }
    };
    
    // Delay auth check slightly to allow auth.js to initialize
    setTimeout(checkAuth, 100);
});
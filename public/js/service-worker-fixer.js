/**
 * Service Worker Unregister Helper
 * This script attempts to unregister any existing service workers that might be causing WebSocket issues
 */

// Self-executing function to avoid polluting global namespace
(function() {
    // Check if service workers are supported in this browser
    if ('serviceWorker' in navigator) {
        console.log('Service Workers supported - checking for active workers');
        
        // Get all service worker registrations
        navigator.serviceWorker.getRegistrations()
            .then(registrations => {
                if (registrations.length === 0) {
                    console.log('No service workers found to unregister');
                    return;
                }
                
                console.log(`Found ${registrations.length} service worker(s) - attempting to unregister`);
                
                // Unregister each service worker
                const unregisterPromises = registrations.map(registration => {
                    console.log(`Unregistering service worker for scope: ${registration.scope}`);
                    return registration.unregister()
                        .then(success => {
                            if (success) {
                                console.log(`Successfully unregistered service worker for scope: ${registration.scope}`);
                            } else {
                                console.warn(`Failed to unregister service worker for scope: ${registration.scope}`);
                            }
                            return success;
                        });
                });
                
                // Wait for all unregistration attempts to complete
                return Promise.all(unregisterPromises);
            })
            .then(results => {
                const successCount = results.filter(Boolean).length;
                console.log(`Service worker cleanup complete: ${successCount} worker(s) unregistered`);
                
                if (successCount > 0) {
                    // If any workers were unregistered, refresh the page to ensure clean state
                    console.log('Reloading page for a clean start...');
                    // Use a session storage flag to prevent reload loops
                    if (!sessionStorage.getItem('serviceWorkerCleanupPerformed')) {
                        sessionStorage.setItem('serviceWorkerCleanupPerformed', 'true');
                        window.location.reload();
                    }
                }
            })
            .catch(error => {
                console.error('Error during service worker cleanup:', error);
            });
    } else {
        console.log('Service Workers not supported in this browser');
    }
})();

// Fix for error handling in fetch requests
window.addEventListener('unhandledrejection', function(event) {
    if (event.reason && 
        event.reason.message && 
        event.reason.message.includes('message channel closed')) {
        
        console.warn('Caught unhandled message channel closed rejection. This is a known issue and being mitigated.');
        
        // Prevent the error from showing in console
        event.preventDefault();
        
        // If it's coming from a specific source (like the service worker), we could add more handling
        if (event.reason.stack && event.reason.stack.includes('chrome-extension')) {
            console.log('Error appears to be from a Chrome extension service worker - suppressing');
        }
    }
});
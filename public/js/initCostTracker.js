/**
 * Initialize Cost Tracker
 * This script initializes the cost tracker after all dependencies are loaded
 */

document.addEventListener('DOMContentLoaded', function() {
    // Wait a bit to ensure connection manager is ready
    setTimeout(function() {
        if (window.CostTracker) {
            console.log('Initializing Cost Tracker...');
            window.CostTracker.init();
        } else {
            console.error('Cost Tracker module not found');
        }
    }, 1000);
});
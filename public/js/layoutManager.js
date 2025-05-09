/**
 * Layout Manager
 * Handles fetching and injecting global header/footer partials.
 * Version: 8.0.0
 */

/**
 * Fetches and injects an HTML partial into a target element.
 * @param {string} partialUrl - The URL of the HTML partial file.
 * @param {string} targetSelector - The CSS selector of the target element to inject into.
 * @param {'replace' | 'prepend' | 'append'} mode - How to inject the content.
 */
async function injectPartial(partialUrl, targetSelector, mode = 'replace') {
    const targetElement = document.querySelector(targetSelector);
    if (!targetElement) {
        console.error(`LayoutManager: Target element "${targetSelector}" not found for partial "${partialUrl}".`);
        return;
    }

    try {
        const response = await fetch(partialUrl + `?v=${Date.now()}`); // Cache bust
        if (!response.ok) {
            throw new Error(`HTTP error ${response.status} fetching partial: ${partialUrl}`);
        }
        const html = await response.text();

        switch (mode) {
            case 'replace':
                targetElement.innerHTML = html;
                break;
            case 'prepend':
                targetElement.insertAdjacentHTML('afterbegin', html);
                break;
            case 'append':
                targetElement.insertAdjacentHTML('beforeend', html);
                break;
            default:
                targetElement.innerHTML = html; // Default to replace
        }
        console.log(`LayoutManager: Injected "${partialUrl}" into "${targetSelector}".`);

        // Re-run theme toggle listener setup if header was injected
        if (partialUrl.includes('_header.html')) {
            setupThemeToggle(); // Ensure listener is attached after injection
            updateThemeToggleIcon(); // Update icon state based on current theme
        }

    } catch (error) {
        console.error(`LayoutManager: Failed to load or inject partial "${partialUrl}":`, error);
        targetElement.innerHTML = `<div class="alert alert-danger m-3">Error loading layout component: ${partialUrl}.</div>`;
    }
}

/**
 * Sets up the theme toggle button - now just updates icons
 * Actual click handling is done by the global event listener
 */
function setupThemeToggle() {
    // We no longer directly attach event listeners to theme toggle buttons
    // Instead we rely on the global event delegation from applySavedTheme.js
    console.log("LayoutManager: Theme toggle setup - using global event handler");
    
    // Update icon state if theme manager is available
    if (window.themeManager && typeof window.themeManager.updateThemeToggleIcon === 'function') {
        window.themeManager.updateThemeToggleIcon();
        console.log("LayoutManager: Updated theme icons using themeManager");
    }
}

/**
 * Updates the theme toggle button icons based on current theme
 */
function updateThemeToggleIcon() {
    const currentTheme = document.documentElement.className.includes('theme-dark') ? 'theme-dark' : 'theme-light';
    const darkIcon = document.querySelector('#theme-toggle-btn .dark-icon');
    const lightIcon = document.querySelector('#theme-toggle-btn .light-icon');
    
    if (darkIcon && lightIcon) {
        if (currentTheme === 'theme-dark') {
            darkIcon.style.display = 'inline-block';
            lightIcon.style.display = 'none';
        } else {
            darkIcon.style.display = 'none';
            lightIcon.style.display = 'inline-block';
        }
    }
}

/**
 * Toggles the light/dark theme.
 */
// Toggle theme function removed - now using the centralized theme manager from applySavedTheme.js

/**
 * Initializes the layout by injecting header and footer.
 */
async function initializeLayout() {
    console.log("LayoutManager: Initializing layout...");
    // Use Promise.all to load concurrently
    await Promise.all([
        injectPartial('/_header.html', '#global-header-placeholder', 'replace'),
        injectPartial('/_footer.html', '#global-footer-placeholder', 'replace')
    ]);
    console.log("LayoutManager: Header and Footer injection complete.");
    // Dispatch an event to signal layout is ready, so main.js can proceed
    document.dispatchEvent(new CustomEvent('layout-ready'));
}

// --- Self-Initialization ---
// Run layout initialization automatically when the script loads.
// This ensures header/footer are present before other scripts might need them.
document.addEventListener('DOMContentLoaded', () => {
    console.log("LayoutManager: DOM loaded, initializing layout...");
    initializeLayout();
});
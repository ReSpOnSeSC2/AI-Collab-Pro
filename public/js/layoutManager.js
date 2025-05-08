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
        }

    } catch (error) {
        console.error(`LayoutManager: Failed to load or inject partial "${partialUrl}":`, error);
        targetElement.innerHTML = `<div class="alert alert-danger m-3">Error loading layout component: ${partialUrl}.</div>`;
    }
}

/**
 * Sets up the theme toggle button listener.
 * Needs to be callable after partial injection.
 */
function setupThemeToggle() {
    const themeToggleBtn = document.getElementById('theme-toggle-btn');
    if (themeToggleBtn && !themeToggleBtn.dataset.listenerAttached) { // Prevent multiple listeners
        themeToggleBtn.addEventListener('click', toggleTheme);
        themeToggleBtn.dataset.listenerAttached = 'true'; // Mark as attached
        console.log("LayoutManager: Theme toggle listener attached.");
    }
}

/**
 * Toggles the light/dark theme.
 */
function toggleTheme() {
    const currentTheme = document.documentElement.className.includes('theme-dark') ? 'theme-dark' : 'theme-light';
    const newTheme = currentTheme === 'theme-dark' ? 'theme-light' : 'theme-dark';
    
    // Apply theme to document element
    document.documentElement.className = newTheme;
    
    // Explicitly remove old theme and add new theme
    if (newTheme === 'theme-dark') {
        document.documentElement.classList.remove('theme-light');
        document.documentElement.classList.add('theme-dark');
    } else {
        document.documentElement.classList.remove('theme-dark');
        document.documentElement.classList.add('theme-light');
    }
    
    // Save to localStorage
    localStorage.setItem('theme', newTheme);
    console.log(`Theme changed to: ${newTheme}`);
    
    // Update highlight.js theme if applicable
    const highlightStyle = document.getElementById('highlight-style');
    if (highlightStyle) {
        highlightStyle.href = newTheme === 'theme-light'
            ? 'https://cdnjs.cloudflare.com/ajax/libs/highlight.js/11.8.0/styles/github.min.css'
            : 'https://cdnjs.cloudflare.com/ajax/libs/highlight.js/11.8.0/styles/github-dark.min.css';
    }
    
    // Make sure the theme toggling is properly reflected in the UI
    // This is especially important for index.html
    const darkIcon = document.querySelector('#theme-toggle-btn .dark-icon');
    const lightIcon = document.querySelector('#theme-toggle-btn .light-icon');
    
    if (darkIcon && lightIcon) {
        if (newTheme === 'theme-dark') {
            darkIcon.style.display = 'inline-block';
            lightIcon.style.display = 'none';
        } else {
            darkIcon.style.display = 'none';
            lightIcon.style.display = 'inline-block';
        }
    }
}

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
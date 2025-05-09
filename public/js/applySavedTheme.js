/**
 * Theme Management for AI Collaboration Hub
 * This standalone script ensures that theme toggle works properly in all pages
 */

// Function to apply the saved theme from localStorage
function applySavedTheme() {
  const savedTheme = localStorage.getItem('theme') || 'theme-dark';
  document.documentElement.className = savedTheme;
  
  // Update highlight.js theme based on selected theme
  const highlightStyle = document.getElementById('highlight-style');
  if (highlightStyle) {
    highlightStyle.href = savedTheme === 'theme-light'
      ? 'https://cdnjs.cloudflare.com/ajax/libs/highlight.js/11.8.0/styles/github.min.css'
      : 'https://cdnjs.cloudflare.com/ajax/libs/highlight.js/11.8.0/styles/github-dark.min.css';
  }
}

// Function to toggle the theme
function toggleTheme() {
  const currentTheme = document.documentElement.className.includes('theme-dark') ? 'theme-dark' : 'theme-light';
  const newTheme = currentTheme === 'theme-dark' ? 'theme-light' : 'theme-dark';
  
  // Apply theme to document element
  document.documentElement.className = newTheme;
  
  // Explicitly remove old theme and add new theme for clarity
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
  
  // Update theme toggle icons
  updateThemeToggleIcon();
}

// Function to update the theme toggle button icons
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

// Apply the saved theme immediately
applySavedTheme();

// Set up a global click handler instead of individual button listeners
// This prevents multiple event listeners from being attached
document.addEventListener('DOMContentLoaded', () => {
  console.log("Theme manager: Initializing global theme management");
  
  // Remove any existing listeners (cleanup)
  document.querySelectorAll('#theme-toggle-btn').forEach(btn => {
    // Clear all listeners by cloning and replacing
    if (btn) {
      const newBtn = btn.cloneNode(true);
      btn.parentNode.replaceChild(newBtn, btn);
    }
  });
  
  // Set up a global event listener that uses event delegation
  document.addEventListener('click', (event) => {
    // Find if the clicked element or any of its parents has the theme-toggle-btn id
    let targetElement = event.target;
    let isThemeToggleBtn = false;
    
    while (targetElement && !isThemeToggleBtn) {
      if (targetElement.id === 'theme-toggle-btn') {
        isThemeToggleBtn = true;
        break;
      }
      targetElement = targetElement.parentElement;
    }
    
    // If theme toggle button was clicked, toggle the theme
    if (isThemeToggleBtn) {
      // Prevent event from bubbling further to avoid multiple handlers
      event.stopPropagation();
      toggleTheme();
    }
  });
  
  console.log("Theme manager: Global theme handler attached");
  
  // Still update icons when the layout is ready
  document.addEventListener('layout-ready', () => {
    console.log("Theme manager: Layout ready, updating theme icons");
    updateThemeToggleIcon();
  });
});

// Expose the theme functions globally
window.themeManager = {
  applySavedTheme,
  toggleTheme,
  updateThemeToggleIcon
};
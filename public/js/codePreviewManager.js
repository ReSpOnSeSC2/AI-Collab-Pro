/**
 * Code Preview Manager for AI Collaboration Hub
 * Handles visual preview of AI-generated code content.
 * Version: 1.0.0
 */

// --- Constants ---
const CSS_CLASSES = {
    ACTIVE: 'active',
    CODE_PREVIEW_OPEN: 'code-preview-open',
};

const SELECTORS = {
    CODE_PREVIEW_MODAL: '#code-preview-modal',
    PREVIEW_TABS: '.preview-tab-btn',
    PREVIEW_PANELS: '.preview-panel',
    VISUAL_PREVIEW: '#visualPreview',
    CODE_VIEW: '#codeView',
    CODE_VIEW_CONTENT: '#codeViewContent',
    PREVIEW_FRAME: '#previewFrame',
    USE_PREVIEW_CONTENT: '#usePreviewContent',
    REGENERATE_PREVIEW_CONTENT: '#regeneratePreviewContent',
    CLOSE_PREVIEW: '#closePreview',
    MODAL_CLOSE: '.modal-close',
};

// --- DOM Element Cache ---
const domCache = {};

/**
 * Initialize the code preview manager.
 * Caches DOM elements and sets up event listeners.
 */
export function initialize() {
    console.log('CodePreviewManager: Initializing...');
    
    // Create the modal if it doesn't exist
    createPreviewModal();
    
    // Cache DOM elements
    cacheDomElements();
    
    // Set up event listeners
    setupEventListeners();
}

/**
 * Create the preview modal if it doesn't exist in the DOM.
 */
function createPreviewModal() {
    if (document.querySelector(SELECTORS.CODE_PREVIEW_MODAL)) {
        return; // Modal already exists
    }
    
    const modalHTML = `
        <div id="code-preview-modal" class="modal code-preview-modal">
            <div class="modal-content preview-modal-content">
                <span class="modal-close">&times;</span>
                <h3>Code Preview</h3>
                
                <div class="preview-tabs">
                    <button class="preview-tab-btn active" data-preview="visual">Visual Preview</button>
                    <button class="preview-tab-btn" data-preview="code">Code View</button>
                </div>
                
                <div class="preview-content">
                    <div id="visualPreview" class="preview-panel active">
                        <iframe id="previewFrame" sandbox="allow-same-origin allow-scripts"></iframe>
                    </div>
                    <div id="codeView" class="preview-panel">
                        <pre id="codeViewContent"><code></code></pre>
                    </div>
                </div>
                
                <div class="preview-actions">
                    <button id="usePreviewContent" class="btn primary">Use This Content</button>
                    <button id="regeneratePreviewContent" class="btn">Regenerate</button>
                    <button id="closePreview" class="btn">Close</button>
                </div>
            </div>
        </div>
    `;
    
    document.body.insertAdjacentHTML('beforeend', modalHTML);
    
    // Add CSS if not already included
    addPreviewStyles();
}

/**
 * Add necessary CSS styles if not already included.
 */
function addPreviewStyles() {
    // Check if styles already exist
    if (document.querySelector('#code-preview-styles')) {
        return;
    }
    
    const styles = `
        <style id="code-preview-styles">
            .code-preview-modal {
                display: none;
                position: fixed;
                z-index: 1000;
                left: 0;
                top: 0;
                width: 100%;
                height: 100%;
                overflow: auto;
                background-color: rgba(0, 0, 0, 0.5);
            }
            
            .code-preview-open {
                display: block;
            }
            
            .preview-modal-content {
                background-color: #fff;
                margin: 5% auto;
                padding: 20px;
                border-radius: 8px;
                width: 90%;
                max-width: 1200px;
                max-height: 90vh;
                overflow-y: auto;
                box-shadow: 0 5px 15px rgba(0, 0, 0, 0.3);
            }
            
            .preview-tabs {
                display: flex;
                border-bottom: 1px solid #ddd;
                margin-bottom: 15px;
            }
            
            .preview-tab-btn {
                padding: 10px 15px;
                background-color: #f5f5f5;
                border: 1px solid #ddd;
                border-bottom: none;
                border-radius: 5px 5px 0 0;
                cursor: pointer;
                margin-right: 5px;
                font-weight: 500;
            }
            
            .preview-tab-btn.active {
                background-color: #fff;
                border-bottom: 1px solid #fff;
                margin-bottom: -1px;
                color: #2196F3;
            }
            
            .preview-content {
                border: 1px solid #ddd;
                border-radius: 0 0 5px 5px;
                padding: 15px;
                margin-bottom: 15px;
                min-height: 400px;
            }
            
            .preview-panel {
                display: none;
                height: 100%;
            }
            
            .preview-panel.active {
                display: block;
                height: 100%;
            }
            
            #previewFrame {
                width: 100%;
                height: 500px;
                border: none;
                background-color: #fff;
            }
            
            #codeView {
                height: 500px;
                overflow: auto;
                background-color: #f5f5f5;
                padding: 10px;
            }
            
            #codeViewContent {
                margin: 0;
                white-space: pre-wrap;
                font-family: monospace;
                font-size: 14px;
                line-height: 1.5;
            }
            
            .preview-actions {
                display: flex;
                justify-content: flex-end;
                gap: 10px;
                margin-top: 15px;
            }
            
            /* For dark mode compatibility */
            [data-theme="dark"] .preview-modal-content {
                background-color: #2d2d2d;
                color: #f0f0f0;
            }
            
            [data-theme="dark"] .preview-tab-btn {
                background-color: #444;
                border-color: #555;
                color: #ddd;
            }
            
            [data-theme="dark"] .preview-tab-btn.active {
                background-color: #2d2d2d;
                border-bottom-color: #2d2d2d;
                color: #2196F3;
            }
            
            [data-theme="dark"] .preview-content {
                border-color: #555;
            }
            
            [data-theme="dark"] #previewFrame {
                background-color: #fff; /* Keep iframe white for content */
                border: 1px solid #444;
            }
            
            [data-theme="dark"] #codeView {
                background-color: #333;
                color: #f0f0f0;
            }
        </style>
    `;
    
    document.head.insertAdjacentHTML('beforeend', styles);
}

/**
 * Cache DOM elements for the preview modal.
 */
function cacheDomElements() {
    for (const key in SELECTORS) {
        try {
            const selector = SELECTORS[key];
            if (!selector) continue;
            
            if (selector.startsWith('.')) {
                domCache[key] = document.querySelectorAll(selector);
            } else if (selector.startsWith('#')) {
                domCache[key] = document.getElementById(selector.substring(1));
            }
        } catch (error) {
            console.error(`CodePreviewManager: Error caching DOM element for key ${key}:`, error);
            domCache[key] = null;
        }
    }
}

/**
 * Set up event listeners for the preview modal.
 */
function setupEventListeners() {
    // Tab switching
    domCache.PREVIEW_TABS?.forEach(tab => {
        tab.addEventListener('click', function() {
            const previewType = this.dataset.preview;
            switchPreviewTab(previewType);
        });
    });
    
    // Close modal buttons
    domCache.CLOSE_PREVIEW?.addEventListener('click', closePreviewModal);
    domCache.MODAL_CLOSE?.forEach(closeBtn => {
        closeBtn.addEventListener('click', closePreviewModal);
    });
    
    // Click outside to close
    domCache.CODE_PREVIEW_MODAL?.addEventListener('click', function(event) {
        if (event.target === this) {
            closePreviewModal();
        }
    });
    
    // Use content button
    domCache.USE_PREVIEW_CONTENT?.addEventListener('click', function() {
        const event = new CustomEvent('use-preview-content', {
            detail: {
                content: currentPreviewContent
            }
        });
        document.dispatchEvent(event);
        closePreviewModal();
    });
    
    // Regenerate button
    domCache.REGENERATE_PREVIEW_CONTENT?.addEventListener('click', function() {
        const event = new CustomEvent('regenerate-preview-content');
        document.dispatchEvent(event);
    });
}

// --- Main functionality ---
let currentPreviewContent = '';
let regenerateCallback = null;

/**
 * Open the preview modal with the given code content.
 * @param {string} codeContent - The code content to preview
 * @param {string} title - Optional title for the preview
 * @param {Function} onRegenerate - Optional callback function to regenerate content
 */
export function showCodePreview(codeContent, title = 'Code Preview', onRegenerate = null) {
    if (!codeContent) {
        console.error('CodePreviewManager: No content provided for preview');
        return;
    }
    
    currentPreviewContent = codeContent;
    regenerateCallback = onRegenerate;
    
    // Set title if provided
    const modalTitle = document.querySelector(`${SELECTORS.CODE_PREVIEW_MODAL} h3`);
    if (modalTitle) {
        modalTitle.textContent = title;
    }
    
    // Update code view
    if (domCache.CODE_VIEW_CONTENT) {
        domCache.CODE_VIEW_CONTENT.textContent = codeContent;
        
        // Highlight code if highlight.js is available
        if (window.hljs) {
            domCache.CODE_VIEW_CONTENT.querySelectorAll('pre code').forEach((block) => {
                hljs.highlightBlock(block);
            });
        }
    }
    
    // Update visual preview (iframe)
    if (domCache.PREVIEW_FRAME) {
        updateIframePreview(codeContent);
    }
    
    // Show the modal
    openPreviewModal();
}

/**
 * Update the iframe with the code content.
 * @param {string} content - The HTML content to display in the iframe
 */
function updateIframePreview(content) {
    const iframe = domCache.PREVIEW_FRAME;
    if (!iframe) return;
    
    try {
        const iframeDoc = iframe.contentDocument || iframe.contentWindow.document;
        
        // Create a clean document with proper structure
        const htmlContent = processContentForPreview(content);
        
        // Write to the iframe
        iframeDoc.open();
        iframeDoc.write(htmlContent);
        iframeDoc.close();
    } catch (error) {
        console.error('CodePreviewManager: Error updating iframe preview:', error);
        
        // Try to display error in iframe
        try {
            const iframeDoc = iframe.contentDocument || iframe.contentWindow.document;
            iframeDoc.open();
            iframeDoc.write(`
                <html>
                <head>
                    <style>
                        body {
                            font-family: system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Oxygen, Ubuntu, Cantarell, 'Open Sans', 'Helvetica Neue', sans-serif;
                            padding: 20px;
                            color: #d32f2f;
                        }
                    </style>
                </head>
                <body>
                    <h3>Preview Error</h3>
                    <p>There was an error generating the preview: ${error.message}</p>
                    <p>This might be due to security restrictions or invalid HTML.</p>
                </body>
                </html>
            `);
            iframeDoc.close();
        } catch (e) {
            console.error('CodePreviewManager: Failed to show error in iframe:', e);
        }
    }
}

/**
 * Process the content for preview by detecting content type and formatting appropriately.
 * @param {string} content - The content to process
 * @returns {string} - Formatted HTML content
 */
function processContentForPreview(content) {
    // Determine if content looks like HTML
    const isHTML = content.trim().startsWith('<') && 
                  (content.includes('</html>') || 
                   content.includes('</body>') || 
                   content.includes('</div>') || 
                   content.includes('</p>'));
    
    // For HTML content
    if (isHTML) {
        // Check if it's a complete HTML document
        if (content.includes('<html') && content.includes('</html>')) {
            return content;
        }
        
        // Check if it has body tags but no html tags
        if (content.includes('<body') && content.includes('</body>') && !content.includes('<html')) {
            return `<!DOCTYPE html><html><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width, initial-scale=1.0"><style>body{font-family:system-ui,-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;line-height:1.5;padding:20px;}</style></head>${content}</html>`;
        }
        
        // It's HTML fragments
        return `<!DOCTYPE html>
            <html>
            <head>
                <meta charset="UTF-8">
                <meta name="viewport" content="width=device-width, initial-scale=1.0">
                <style>
                    body {
                        font-family: system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
                        line-height: 1.5;
                        padding: 20px;
                    }
                    pre {
                        background-color: #f5f5f5;
                        padding: 15px;
                        border-radius: 5px;
                        overflow: auto;
                    }
                    code {
                        font-family: monospace;
                    }
                </style>
            </head>
            <body>
                ${content}
            </body>
            </html>`;
    }
    
    // Check if it's CSS
    if (content.includes('{') && content.includes('}') && 
        (content.includes('margin:') || content.includes('padding:') || 
         content.includes('color:') || content.includes('font-size:'))) {
        
        return `<!DOCTYPE html>
            <html>
            <head>
                <meta charset="UTF-8">
                <meta name="viewport" content="width=device-width, initial-scale=1.0">
                <style>
                    ${content}
                </style>
            </head>
            <body>
                <div class="preview-container">
                    <h1>CSS Preview</h1>
                    <p>This is preview text to show the styling</p>
                    <div class="box">This is a div with the "box" class</div>
                    <button>This is a button</button>
                    <a href="#">This is a link</a>
                    <ul>
                        <li>List item 1</li>
                        <li>List item 2</li>
                        <li>List item 3</li>
                    </ul>
                </div>
            </body>
            </html>`;
    }
    
    // Check if it's JavaScript
    if ((content.includes('function') || content.includes('=>') || content.includes('const ')) && 
        (content.includes('{') && content.includes('}'))) {
        
        return `<!DOCTYPE html>
            <html>
            <head>
                <meta charset="UTF-8">
                <meta name="viewport" content="width=device-width, initial-scale=1.0">
                <style>
                    body {
                        font-family: system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
                        line-height: 1.5;
                        padding: 20px;
                    }
                    #output {
                        background-color: #f5f5f5;
                        padding: 15px;
                        border-radius: 5px;
                        min-height: 100px;
                        margin-top: 20px;
                        white-space: pre-wrap;
                    }
                    button {
                        padding: 8px 16px;
                        background-color: #2196F3;
                        color: white;
                        border: none;
                        border-radius: 4px;
                        cursor: pointer;
                        margin-top: 10px;
                    }
                </style>
            </head>
            <body>
                <h2>JavaScript Preview</h2>
                <p>Click the button to run the JavaScript code.</p>
                <button id="runButton">Run Code</button>
                <div id="output">// Output will appear here</div>
                
                <script>
                // Sandboxed execution with error handling
                function safeEval(code) {
                    try {
                        // Create a safe function from the code
                        const scriptFunction = new Function(code);
                        
                        // Capture console.log output
                        const originalLog = console.log;
                        let output = '';
                        console.log = function(...args) {
                            output += args.map(arg => 
                                typeof arg === 'object' ? JSON.stringify(arg, null, 2) : arg
                            ).join(' ') + '\\n';
                            originalLog.apply(console, args);
                        };
                        
                        // Run the function
                        scriptFunction();
                        
                        // Restore console.log
                        console.log = originalLog;
                        
                        return output || 'Code executed successfully without output.';
                    } catch (error) {
                        return 'Error: ' + error.message;
                    }
                }
                
                // Button click handler
                document.getElementById('runButton').addEventListener('click', function() {
                    const outputElement = document.getElementById('output');
                    outputElement.textContent = '// Running code...';
                    
                    // Slight delay to show "Running..." message
                    setTimeout(() => {
                        const output = safeEval(\`${content.replace(/`/g, '\\`')}\`);
                        outputElement.textContent = output;
                    }, 100);
                });
                </script>
            </body>
            </html>`;
    }
    
    // Default case: treat as plain text/code
    return `<!DOCTYPE html>
        <html>
        <head>
            <meta charset="UTF-8">
            <meta name="viewport" content="width=device-width, initial-scale=1.0">
            <style>
                body {
                    font-family: system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
                    line-height: 1.5;
                    padding: 20px;
                }
                pre {
                    background-color: #f5f5f5;
                    padding: 15px;
                    border-radius: 5px;
                    overflow: auto;
                    white-space: pre-wrap;
                }
                code {
                    font-family: monospace;
                }
            </style>
        </head>
        <body>
            <pre><code>${escapeHtml(content)}</code></pre>
        </body>
        </html>`;
}

/**
 * Helper function to escape HTML characters.
 * @param {string} html - The HTML string to escape
 * @returns {string} - Escaped HTML string
 */
function escapeHtml(html) {
    const div = document.createElement('div');
    div.textContent = html;
    return div.innerHTML;
}

/**
 * Switch between preview tabs.
 * @param {string} tabType - The tab type to switch to ('visual' or 'code')
 */
function switchPreviewTab(tabType) {
    // Update tab buttons
    domCache.PREVIEW_TABS?.forEach(tab => {
        tab.classList.toggle(CSS_CLASSES.ACTIVE, tab.dataset.preview === tabType);
    });
    
    // Update panels
    domCache.PREVIEW_PANELS?.forEach(panel => {
        panel.classList.remove(CSS_CLASSES.ACTIVE);
    });
    
    if (tabType === 'visual' && domCache.VISUAL_PREVIEW) {
        domCache.VISUAL_PREVIEW.classList.add(CSS_CLASSES.ACTIVE);
    } else if (tabType === 'code' && domCache.CODE_VIEW) {
        domCache.CODE_VIEW.classList.add(CSS_CLASSES.ACTIVE);
    }
}

/**
 * Open the preview modal.
 */
function openPreviewModal() {
    if (domCache.CODE_PREVIEW_MODAL) {
        domCache.CODE_PREVIEW_MODAL.classList.add(CSS_CLASSES.CODE_PREVIEW_OPEN);
        document.body.style.overflow = 'hidden'; // Prevent scrolling behind modal
    }
}

/**
 * Close the preview modal.
 */
function closePreviewModal() {
    if (domCache.CODE_PREVIEW_MODAL) {
        domCache.CODE_PREVIEW_MODAL.classList.remove(CSS_CLASSES.CODE_PREVIEW_OPEN);
        document.body.style.overflow = ''; // Restore scrolling
    }
}

// --- Event handling for regeneration ---
document.addEventListener('regenerate-preview-content', function() {
    if (regenerateCallback && typeof regenerateCallback === 'function') {
        regenerateCallback();
    }
});
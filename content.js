// Content script to add "Scrape Post Data" option to LinkedIn post menus

// Wait for page to load
let observer = null;

function getPostUrl(menuButton) {
  // Find the parent post container
  let postContainer = menuButton.closest('[data-urn]');
  
  if (!postContainer) {
    postContainer = menuButton.closest('.feed-shared-update-v2');
  }
  
  if (!postContainer) {
    postContainer = menuButton.closest('article, [role="article"]');
  }
  
  if (!postContainer) {
    // Try to find it by going up the DOM
    let current = menuButton;
    for (let i = 0; i < 10; i++) {
      current = current.parentElement;
      if (!current) break;
      
      if (current.querySelector('[data-urn]') || 
          current.classList.contains('feed-shared-update-v2')) {
        postContainer = current;
        break;
      }
    }
  }
  
  if (!postContainer) {
    return null;
  }

  // Try to find the post URL from various sources
  
  // 1. Check for data-urn attribute
  const urn = postContainer.getAttribute('data-urn');
  if (urn) {
    const urnMatch = urn.match(/activity[:\-](\d+)/);
    if (urnMatch) {
      return `https://www.linkedin.com/feed/update/urn:li:activity:${urnMatch[1]}/`;
    }
  }

  // 2. Look for timestamp link or social details link
  const timestampLink = postContainer.querySelector('a[href*="/feed/update/"], a[href*="activity:"], a.update-components-actor__sub-description a, span.update-components-actor__sub-description a');
  if (timestampLink && timestampLink.href) {
    return timestampLink.href;
  }

  // 3. Look for any link with activity in it
  const activityLink = postContainer.querySelector('a[href*="activity"]');
  if (activityLink) {
    return activityLink.href;
  }

  // 4. Try to extract from any data attribute containing activity ID
  const allElements = postContainer.querySelectorAll('[data-urn], [data-id], [id]');
  for (const el of allElements) {
    const attrs = ['data-urn', 'data-id', 'id'];
    for (const attr of attrs) {
      const val = el.getAttribute(attr);
      if (val && /activity[:\-]?\d+/i.test(val)) {
        const match = val.match(/activity[:\-]?(\d+)/i);
        if (match) {
          return `https://www.linkedin.com/feed/update/urn:li:activity:${match[1]}/`;
        }
      }
    }
  }

  // 5. Last resort: look at the current URL if we're already on a post page
  if (window.location.href.includes('/feed/update/') || window.location.href.includes('activity:')) {
    return window.location.href;
  }

  return null;
}

function addScrapeOption(dropdown, trigger) {
  // Check if we already added the option
  if (dropdown.querySelector('.linkedin-scraper-option')) {
    return;
  }

  // Wait for LinkedIn to populate the menu first
  const checkAndAdd = () => {
    // Look for existing menu items to ensure menu is populated
    const hasContent = dropdown.querySelector('[role="menuitem"], .artdeco-dropdown__item, li');
    
    if (!hasContent) {
      // Menu not yet populated, wait a bit
      setTimeout(checkAndAdd, 50);
      return;
    }

    // Create the new menu item
    const menuItem = document.createElement('li');
    menuItem.className = 'linkedin-scraper-option artdeco-dropdown__item';
    menuItem.setAttribute('role', 'presentation');
    
    const menuButton = document.createElement('div');
    menuButton.className = 'display-flex align-items-center';
    menuButton.setAttribute('role', 'menuitem');
    menuButton.setAttribute('tabindex', '-1');
    menuButton.style.cursor = 'pointer';
    menuButton.style.padding = '12px 16px';
    menuButton.style.minHeight = '40px';
    
    // Add icon
    const icon = document.createElement('span');
    icon.className = 'display-flex mr2';
    icon.style.width = '16px';
    icon.style.height = '16px';
    icon.innerHTML = `
      <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16" width="16" height="16" fill="currentColor">
        <path d="M12 2H4c-1.1 0-2 .9-2 2v8c0 1.1.9 2 2 2h8c1.1 0 2-.9 2-2V4c0-1.1-.9-2-2-2zm-1 9H5c-.55 0-1-.45-1-1s.45-1 1-1h6c.55 0 1 .45 1 1s-.45 1-1 1zm0-3H5c-.55 0-1-.45-1-1s.45-1 1-1h6c.55 0 1 .45 1 1s-.45 1-1 1zm0-3H5c-.55 0-1-.45-1-1s.45-1 1-1h6c.55 0 1 .45 1 1s-.45 1-1 1z"/>
      </svg>
    `;
    
    const text = document.createElement('span');
    text.className = 't-14 t-normal t-black';
    text.style.flex = '1';
    text.textContent = 'Get reactions of this post';
    
    menuButton.appendChild(icon);
    menuButton.appendChild(text);
    menuItem.appendChild(menuButton);

    // Add click handler
    menuButton.addEventListener('click', function(e) {
      e.preventDefault();
      e.stopPropagation();
      
      const postUrl = getPostUrl(trigger);
      
      if (!postUrl) {
        alert('Could not find post URL. Please try clicking the post timestamp first.');
        return;
      }
      
      // Close the dropdown
      trigger.click();
      
      // Show modal for webhook URL
      showWebhookModal(postUrl);
    });

    // Add hover effect
    menuButton.addEventListener('mouseenter', function() {
      menuButton.style.backgroundColor = 'rgba(0, 0, 0, 0.08)';
    });
    menuButton.addEventListener('mouseleave', function() {
      menuButton.style.backgroundColor = 'transparent';
    });

    // Find where to insert
    const menuList = dropdown.querySelector('ul');
    if (menuList) {
      // Insert at the top
      if (menuList.firstChild) {
        menuList.insertBefore(menuItem, menuList.firstChild);
      } else {
        menuList.appendChild(menuItem);
      }
    } else {
      // Create a ul and add our item
      const ul = document.createElement('ul');
      ul.setAttribute('role', 'menu');
      ul.className = 'artdeco-dropdown__content-inner';
      ul.appendChild(menuItem);
      dropdown.appendChild(ul);
    }
    
  };
  
  // Start checking
  checkAndAdd();
}

// Watch for dropdown menus opening
function observeDropdowns() {
  // Track which button opened which dropdown
  let currentTrigger = null;
  
  // Listen for clicks on dropdown triggers
  document.addEventListener('click', (e) => {
    const trigger = e.target.closest('.artdeco-dropdown__trigger');
    if (trigger && trigger.closest('.feed-shared-control-menu')) {
      currentTrigger = trigger;
    }
  }, true);
  
  // Watch for dropdowns appearing/changing
  const dropdownObserver = new MutationObserver((mutations) => {
    mutations.forEach((mutation) => {
      // Check for attribute changes (aria-hidden being set to false)
      if (mutation.type === 'attributes' && mutation.attributeName === 'aria-hidden') {
        const dropdown = mutation.target;
        if (dropdown.classList.contains('artdeco-dropdown__content') && 
            dropdown.getAttribute('aria-hidden') === 'false' &&
            dropdown.closest('.feed-shared-control-menu')) {
          setTimeout(() => addScrapeOption(dropdown, currentTrigger), 100);
        }
      }
      
      // Also check for newly added nodes
      mutation.addedNodes.forEach((node) => {
        if (node.nodeType === 1) {
          // Check if this is a dropdown menu
          if (node.classList && (node.classList.contains('artdeco-dropdown__content') || 
              node.querySelector && node.querySelector('.artdeco-dropdown__content'))) {
            
            const dropdown = node.classList.contains('artdeco-dropdown__content') 
              ? node 
              : node.querySelector('.artdeco-dropdown__content');
            
            if (dropdown && dropdown.getAttribute('aria-hidden') === 'false') {
              // This is an open dropdown, check if it's a post menu
              const isPostMenu = dropdown.closest('.feed-shared-control-menu');
              
              if (isPostMenu && currentTrigger) {
                setTimeout(() => addScrapeOption(dropdown, currentTrigger), 100);
              }
            }
          }
        }
      });
    });
  });

  dropdownObserver.observe(document.body, {
    childList: true,
    subtree: true,
    attributes: true,
    attributeFilter: ['aria-hidden']
  });

  return dropdownObserver;
}

// Initialize when DOM is ready
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', () => {
    observer = observeDropdowns();
  });
} else {
  observer = observeDropdowns();
}

// Listen for messages from background script
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.action === 'runCollector') {
    console.log('Content script: Injecting collector with webhook:', request.webhookUrl);
    
    // Use data attributes to pass configuration (CSP-safe)
    const configElement = document.createElement('div');
    configElement.id = 'li-buddy-config';
    configElement.style.display = 'none';
    configElement.setAttribute('data-webhook-url', request.webhookUrl || '');
    configElement.setAttribute('data-export-mode', request.mode || 'webhook');
    document.body.appendChild(configElement);
    
    console.log('✅ Config injected via data attributes');
    console.log('   Webhook URL:', request.webhookUrl);
    console.log('   Export mode:', request.mode);
    
    // Now inject and run the collector script
    const script = document.createElement('script');
    script.src = chrome.runtime.getURL('scraper.js');
    (document.head || document.documentElement).appendChild(script);
    
    sendResponse({ success: true });
  }
});

// Bridge messages between page script (scraper.js) and background script
window.addEventListener('message', (event) => {
  // Only accept messages from same origin
  if (event.source !== window) return;
  
  if (event.data.type === 'SEND_TO_WEBHOOK') {
    console.log('Content script: Received webhook data from page, forwarding to background...');
    console.log('   Webhook URL from page:', event.data.webhookUrl);
    
    // Forward to background script WITH the webhook URL
    chrome.runtime.sendMessage(
      { 
        action: 'sendToWebhook', 
        data: event.data.data,
        webhookUrl: event.data.webhookUrl // ✅ Pass the webhook URL through!
      },
      (response) => {
        // Send response back to page
        window.postMessage({
          type: 'WEBHOOK_RESPONSE',
          success: response && response.success,
          error: response ? response.error : 'No response'
        }, '*');
      }
    );
  }
  
  if (event.data.type === 'COLLECTION_COMPLETE') {
    console.log('Collection complete, notifying background...');
    // Notify background script to close tab if successful
    chrome.runtime.sendMessage({
      action: 'collectionComplete',
      success: event.data.success,
      count: event.data.count
    });
  }
});

// Show modal to enter webhook URL
function showWebhookModal(postUrl) {
  // Get saved webhook URL
  chrome.runtime.sendMessage({ action: 'getWebhookUrl' }, (response) => {
    const savedWebhookUrl = response.webhookUrl || '';
    
    // Create modal overlay
    const overlay = document.createElement('div');
    overlay.style.cssText = `
      position: fixed;
      top: 0;
      left: 0;
      width: 100%;
      height: 100%;
      background: rgba(0, 0, 0, 0.5);
      display: flex;
      align-items: center;
      justify-content: center;
      z-index: 99999;
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
    `;
    
    // Create modal
    const modal = document.createElement('div');
    modal.style.cssText = `
      background: white;
      border-radius: 8px;
      padding: 24px;
      width: 500px;
      max-width: 90%;
      box-shadow: 0 4px 24px rgba(0, 0, 0, 0.15);
    `;
    
    modal.innerHTML = `
      <div style="margin-bottom: 20px;">
        <h2 style="margin: 0 0 8px 0; font-size: 20px; font-weight: 600; color: #000;">
          Export Options
        </h2>
        <p style="margin: 0; font-size: 14px; color: #666;">
          Choose how you want to export the reaction data
        </p>
      </div>
      
      <div style="margin-bottom: 20px;">
        <label style="display: block; margin-bottom: 8px; font-size: 14px; font-weight: 500; color: #000;">
          Webhook URL (optional)
        </label>
        <input 
          type="text" 
          id="webhook-url-input"
          placeholder="https://hook.eu2.make.com/... (leave empty for CSV only)"
          value="${savedWebhookUrl}"
          style="
            width: 100%;
            padding: 10px 12px;
            border: 1px solid #ddd;
            border-radius: 4px;
            font-size: 14px;
            box-sizing: border-box;
            font-family: monospace;
          "
        />
        <div style="margin-top: 6px; font-size: 12px; color: #666;">
          Leave empty to download as CSV file instead
        </div>
      </div>
      
      <div style="display: flex; justify-content: flex-end; gap: 12px;">
        <button 
          id="webhook-cancel-btn"
          style="
            padding: 10px 20px;
            border: 1px solid #ddd;
            background: white;
            border-radius: 4px;
            font-size: 14px;
            font-weight: 500;
            cursor: pointer;
            color: #666;
          "
        >
          Cancel
        </button>
        <button 
          id="webhook-csv-btn"
          style="
            padding: 10px 20px;
            border: 1px solid #0a66c2;
            background: white;
            color: #0a66c2;
            border-radius: 4px;
            font-size: 14px;
            font-weight: 500;
            cursor: pointer;
          "
        >
          Download CSV
        </button>
        <button 
          id="webhook-start-btn"
          style="
            padding: 10px 20px;
            border: none;
            background: #0a66c2;
            color: white;
            border-radius: 4px;
            font-size: 14px;
            font-weight: 500;
            cursor: pointer;
          "
        >
          Send to Webhook
        </button>
      </div>
    `;
    
    overlay.appendChild(modal);
    document.body.appendChild(overlay);
    
    // Focus input
    const input = document.getElementById('webhook-url-input');
    input.focus();
    input.select();
    
    // Cancel button
    document.getElementById('webhook-cancel-btn').addEventListener('click', () => {
      overlay.remove();
    });
    
    // CSV button - downloads CSV instead
    document.getElementById('webhook-csv-btn').addEventListener('click', () => {
      // Start with CSV mode (no webhook)
      chrome.runtime.sendMessage({
        action: 'openAndCollect',
        url: postUrl,
        webhookUrl: '', // Empty = CSV mode
        mode: 'csv'
      });
      
      overlay.remove();
    });
    
    // Webhook button
    document.getElementById('webhook-start-btn').addEventListener('click', () => {
      const webhookUrl = input.value.trim();
      
      if (!webhookUrl) {
        alert('Please enter a webhook URL or use "Download CSV" button');
        return;
      }
      
      if (!webhookUrl.startsWith('http://') && !webhookUrl.startsWith('https://')) {
        alert('Please enter a valid URL starting with http:// or https://');
        return;
      }
      
      // Save webhook URL
      chrome.runtime.sendMessage({ 
        action: 'saveWebhookUrl', 
        webhookUrl: webhookUrl 
      });
      
      // Start with webhook mode
      chrome.runtime.sendMessage({
        action: 'openAndCollect',
        url: postUrl,
        webhookUrl: webhookUrl,
        mode: 'webhook'
      });
      
      overlay.remove();
    });
    
    // Close on overlay click
    overlay.addEventListener('click', (e) => {
      if (e.target === overlay) {
        overlay.remove();
      }
    });
    
    // Close on Escape key
    const escHandler = (e) => {
      if (e.key === 'Escape') {
        overlay.remove();
        document.removeEventListener('keydown', escHandler);
      }
    };
    document.addEventListener('keydown', escHandler);
  });
}

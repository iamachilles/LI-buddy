// Background service worker

chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.action === 'openAndCollect') {
    const url = request.url;
    const webhookUrl = request.webhookUrl;
    const mode = request.mode; // 'csv' or 'webhook'
    
    console.log('🚀 Opening tab for collection:');
    console.log('   URL:', url);
    console.log('   Mode:', mode);
    console.log('   Webhook URL from modal:', webhookUrl);
    
    // Open the URL in a new tab in the FOREGROUND (active: true) so scripts run properly
    chrome.tabs.create({ url: url, active: true }, (tab) => {
      // Store tab ID for later closing
      const tabId = tab.id;
      
      const listener = (tabIdChanged, changeInfo, tabChanged) => {
        if (tabIdChanged === tabId && changeInfo.status === 'complete') {
          console.log('✅ Tab loaded, injecting collection script...');
          console.log('   Passing webhook URL to content script:', webhookUrl);
          // Tab has finished loading, now inject and run the script
          setTimeout(() => {
            chrome.tabs.sendMessage(tabId, { 
              action: 'runCollector',
              webhookUrl: webhookUrl,
              mode: mode
            }, (response) => {
              if (chrome.runtime.lastError) {
                console.error('❌ Failed to inject script:', chrome.runtime.lastError);
              } else {
                console.log('✅ Collection script injected successfully');
              }
            });
          }, 2000); // Wait 2 seconds for page to fully settle
          
          // Remove the listener
          chrome.tabs.onUpdated.removeListener(listener);
        }
      };
      
      chrome.tabs.onUpdated.addListener(listener);
    });
    sendResponse({ success: true });
    return true;
  }
  
  if (request.action === 'sendToWebhook') {
    // Handle webhook request
    const data = request.data;
    const webhookUrl = request.webhookUrl; // ✅ Use the passed webhook URL, not storage!
    
    console.log('📤 Background: Received data to send to webhook');
    console.log('   Profiles:', data.profiles?.length || 0);
    console.log('   Target webhook URL:', webhookUrl);
    
    if (!webhookUrl) {
      console.error('❌ No webhook URL provided');
      sendResponse({ success: false, error: 'No webhook URL' });
      return;
    }
    
    console.log('🔗 Sending to:', webhookUrl);
    
    fetch(webhookUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(data)
    })
    .then(response => {
      if (response.ok) {
        console.log('✅ Webhook sent successfully!');
        console.log('   Status:', response.status);
        sendResponse({ success: true });
      } else {
        console.error('❌ Webhook failed with status:', response.status);
        sendResponse({ success: false, error: `Status ${response.status}` });
      }
    })
    .catch(error => {
      console.error('❌ Webhook error:', error);
      sendResponse({ success: false, error: error.message });
    });
    
    return true; // Keep message channel open for async response
  }
  
  if (request.action === 'collectionComplete') {
    // Close the tab if successful
    if (request.success && sender.tab) {
      console.log(`✅ Collection successful (${request.count} profiles collected)`);
      console.log('⏳ Closing tab in 2 seconds...');
      setTimeout(() => {
        chrome.tabs.remove(sender.tab.id, () => {
          console.log('✅ Tab closed');
        });
      }, 2000); // Wait 2 seconds before closing so user sees success
    } else if (!request.success && sender.tab) {
      console.log('❌ Collection failed, keeping tab open for debugging');
    }
    sendResponse({ success: true });
    return true;
  }
  
  if (request.action === 'saveWebhookUrl') {
    // Save webhook URL to storage
    chrome.storage.local.set({ webhookUrl: request.webhookUrl }, () => {
      console.log('✅ Webhook URL saved');
      sendResponse({ success: true });
    });
    return true;
  }
  
  if (request.action === 'getWebhookUrl') {
    // Get webhook URL from storage
    chrome.storage.local.get(['webhookUrl'], (result) => {
      sendResponse({ webhookUrl: result.webhookUrl || '' });
    });
    return true;
  }
});

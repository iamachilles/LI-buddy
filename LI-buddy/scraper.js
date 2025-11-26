/* Auto-Collector Script */

async function forceCloseAllModals() {
  console.log('Force closing all modals...');
  const closeSelectors = [
    '[data-test-modal-close-btn]',
    '.artdeco-modal__dismiss',
    'button[aria-label*="Dismiss"]',
    'button[aria-label*="Close"]'
  ];
  for (const selector of closeSelectors) {
    const buttons = document.querySelectorAll(selector);
    for (const btn of buttons) {
      const inModal = btn.closest('[role="dialog"], .artdeco-modal');
      if (btn.offsetParent !== null && inModal) {
        try { btn.click(); await new Promise(r => setTimeout(r, 300)); } catch {}
      }
    }
  }
  for (let i = 0; i < 5; i++) {
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', keyCode: 27, which: 27, bubbles: true, cancelable: true }));
    await new Promise(r => setTimeout(r, 200));
  }
  await new Promise(r => setTimeout(r, 500));
  const modals = document.querySelectorAll('[role="dialog"], .artdeco-modal');
  if (modals.length > 0) {
    modals.forEach(modal => { try { modal.style.display = 'none'; modal.remove(); } catch {} });
  }
  await new Promise(r => setTimeout(r, 800));
  const remainingModals = document.querySelectorAll('[role="dialog"]:not([style*="display: none"])');
  return remainingModals.length === 0;
}

window.STORE = window.STORE instanceof Map ? window.STORE : new Map();
window.NAME_INDEX = window.NAME_INDEX instanceof Map ? window.NAME_INDEX : new Map();
const STORE = window.STORE;
const NAME_INDEX = window.NAME_INDEX;

// Get current user's profile URL to filter it out
function getCurrentUserProfileUrl() {
  // Method 1: Try the "Me" dropdown/profile button in navigation
  const meSelectors = [
    'a.global-nav__primary-link--me',
    'button.global-nav__primary-link--me-menu-trigger img',
    '.global-nav__me-photo',
    '[data-control-name="identity_profile_photo"]'
  ];
  
  for (const sel of meSelectors) {
    const el = document.querySelector(sel);
    if (el) {
      // Try to get href from element or parent
      const link = el.tagName === 'A' ? el : el.closest('a');
      if (link && link.href) {
        const normalized = normalizeProfileUrl(link.href);
        if (normalized && normalized.includes('/in/')) {
          console.log(`  ℹ Detected your profile from nav: ${normalized}`);
          return normalized;
        }
      }
    }
  }
  
  // Method 2: Look for the Me menu button's associated profile link
  const meButton = document.querySelector('button.global-nav__primary-link--me-menu-trigger');
  if (meButton) {
    // When clicked, the Me menu has a "View Profile" link
    // But we can extract from aria-label or nearby elements
    const nav = document.querySelector('.global-nav');
    if (nav) {
      const profileLinks = nav.querySelectorAll('a[href*="/in/"]');
      for (const link of profileLinks) {
        const href = link.getAttribute('href');
        if (href && !href.includes('/detail/') && !href.includes('/recent-activity/')) {
          const normalized = normalizeProfileUrl(href);
          if (normalized) {
            console.log(`  ℹ Detected your profile from nav link: ${normalized}`);
            return normalized;
          }
        }
      }
    }
  }
  
  // Don't log warning - this is not a critical issue
  return null;
}

let CURRENT_USER_URL = null;
let PROFILE_URL_WARNING_SHOWN = false;

// Check if a profile URL belongs to the current user
function isCurrentUser(url) {
  if (!CURRENT_USER_URL) {
    CURRENT_USER_URL = getCurrentUserProfileUrl();
    // Only show warning once
    if (!CURRENT_USER_URL && !PROFILE_URL_WARNING_SHOWN) {
      PROFILE_URL_WARNING_SHOWN = true;
      // Silent - don't show this warning as it doesn't affect functionality
    }
  }
  
  if (!CURRENT_USER_URL || !url) return false;
  
  // Direct URL match
  if (url === CURRENT_USER_URL) return true;
  
  // If we have a viewer ID, check if the URL contains it
  if (CURRENT_USER_URL.startsWith('VIEWER_ID:')) {
    const viewerId = CURRENT_USER_URL.replace('VIEWER_ID:', '');
    return url.includes(viewerId);
  }
  
  return false;
}

if (!window.__silenceLinkedInGraphQL__) {
  window.__silenceLinkedInGraphQL__ = true;
  window.addEventListener('unhandledrejection', (e) => {
    try { if (String(e?.reason || '').includes('GraphQL request failed')) { e.preventDefault(); } } catch(_){}
  }, { once: true });
}

function csvEscape(s) {
  if (s == null) return '';
  const t = String(s).replace(/\r?\n|\r/g, ' ').trim();
  return /[",]/.test(t) ? `"${t.replace(/"/g, '""')}"` : t;
}

function downloadCSV(rows, filename = 'contacts_export.csv') {
  const header = 'url,type,name,headline,degree,postUrl\n';
  const csv = header + rows.map(r => [
    r.url, 
    r.type, 
    r.name || '', 
    r.headline || '', 
    r.degree || '',
    r.postUrl || ''
  ].map(csvEscape).join(',')).join('\n');
  const blob = new Blob([csv], { type: 'text/csv' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a'); a.href = url; a.download = filename;
  document.body.appendChild(a); a.click(); document.body.removeChild(a);
  URL.revokeObjectURL(url);
  console.log(`CSV downloaded (${rows.length} rows).`);
}

function cleanText(s) {
  if (!s) return '';
  return String(s).replace(/\r?\n|\r/g, ' ').replace(/\s{2,}/g, ' ').trim();
}

function jitter(base, variance) {
  return base + Math.floor(Math.random() * variance);
}

function normalizeName(s) {
  if (!s) return '';
  const t = String(s).normalize('NFD').replace(/[\u0300-\u036f]/g, '');
  return t.replace(/\s+/g, ' ').trim().toLowerCase();
}

function pickBetterUrl(a, b) {
  const isVanity = u => u && !/\/in\/ACo/i.test(u);
  if (isVanity(a) && !isVanity(b)) return a || b;
  if (!isVanity(a) && isVanity(b)) return b || a;
  if ((a||'').length && (b||'').length) return a.length <= b.length ? a : b;
  return a || b;
}

function normalizeProfileUrl(href) {
  try {
    const u = new URL(href, location.origin);
    u.search = ''; u.hash = '';
    if (!/^https?:/.test(u.protocol)) return null;
    if (!u.pathname.includes('/in/') && !u.pathname.includes('/pub/')) return null;
    const parts = u.pathname.split('/').filter(Boolean);
    const idx = parts.indexOf('in');
    if (idx >= 0 && parts[idx + 1]) u.pathname = `/in/${parts[idx + 1].replace(/\/+$/, '')}`;
    return u.toString().replace(/\/+$/, '');
  } catch { return null; }
}

function getCanonicalKey(anchor, urlStr) {
  const nodes = [];
  let n = anchor;
  for (let i = 0; n && i < 4; i++) { nodes.push(n); n = n.parentElement; }
  const sniff = (val) => {
    if (!val || typeof val !== 'string') return null;
    let m = val.match(/urn:li:(?:fsd_)?profile(?::|%3A)(ACo[0-9A-Za-z_-]+)/i);
    if (m) return m[1];
    m = val.match(/ACo[0-9A-Za-z_-]{10,}/);
    return m ? m[0] : null;
  };
  for (const node of nodes) {
    if (node.getAttributeNames) {
      for (const attr of node.getAttributeNames()) {
        const id = sniff(node.getAttribute(attr));
        if (id) return id;
      }
    }
    const id = sniff(node.outerHTML);
    if (id) return id;
  }
  try {
    const u = new URL(urlStr);
    const seg = u.pathname.split('/').filter(Boolean);
    return (seg[0] === 'in' && seg[1]) ? seg[1].toLowerCase() : urlStr.toLowerCase();
  } catch { return urlStr.toLowerCase(); }
}

function extractNameHeadlineNear(anchor) {
  const scope = anchor.closest('.artdeco-entity-lockup, .display-flex, .comments-comment-entity, li, div') || anchor.parentElement;
  let name = '';
  let headline = '';
  let degree = '';
  
  // Name extraction - use original simple approach
  const nameSelectors = ['span[dir="ltr"]', '.artdeco-entity-lockup__subtitle ~ span[dir="ltr"]', '.artdeco-entity-lockup__title', 'a[aria-hidden="false"] span[dir="ltr"]', 'a[role="link"] span[dir="ltr"]'];
  for (const sel of nameSelectors) {
    const el = scope.querySelector(sel);
    if (el && el.innerText.trim()) { 
      name = el.innerText.trim(); 
      break; 
    }
  }
  
  // Fallback to anchor text if no name found
  if (!name) {
    const t = (anchor.innerText || '').trim();
    if (t && /\s/.test(t) && t.length <= 80) name = t;
  }
  
  // Clean up duplicate names (e.g., "John Doe John Doe" -> "John Doe")
  if (name) {
    const words = name.split(/\s+/);
    const halfLen = Math.floor(words.length / 2);
    if (words.length >= 4 && words.length % 2 === 0) {
      const firstHalf = words.slice(0, halfLen).join(' ');
      const secondHalf = words.slice(halfLen).join(' ');
      if (firstHalf === secondHalf) {
        name = firstHalf;
      }
    }
  }
  
  // Headline extraction
  const headlineSelectors = ['.artdeco-entity-lockup__subtitle', '.artdeco-entity-lockup__caption', '.t-12.t-black--light', '.t-14.t-black--light', 'span.t-12', 'div[dir="ltr"]'];
  for (const sel of headlineSelectors) {
    const el = scope.querySelector(sel);
    if (el && el.innerText.trim()) { 
      headline = el.innerText.trim(); 
      break; 
    }
  }
  
  // Remove name from headline if it's duplicated
  if (headline && name && headline.toLowerCase().includes(name.toLowerCase())) {
    headline = headline.replace(new RegExp(name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i'), '').trim();
  }
  
  // Degree extraction - from company_followers.js
  const degreeElement = scope.querySelector('.artdeco-entity-lockup__degree');
  if (degreeElement) {
    const text = cleanText(degreeElement.innerText);
    // Extract just the degree part (1st, 2nd, 3rd, 3rd+)
    // Remove bullets, spaces, and keep only the degree
    degree = text.replace(/[·\s•]/g, '');
  }
  
  // Fallback: look for degree in subtitle
  if (!degree) {
    const subtitle = scope.querySelector('.artdeco-entity-lockup__subtitle');
    if (subtitle) {
      const text = cleanText(subtitle.innerText);
      const match = text.match(/[•·]\s*(1st|2nd|3rd|3rd\+)/i);
      if (match) {
        degree = match[1];
      }
    }
  }
  
  return { name, headline, degree };
}

function getReactorsModal() { return document.querySelector('.social-details-reactors-modal'); }

function getReactorsScrollable() {
  const m = getReactorsModal();
  if (!m) return null;
  return m.querySelector('.scaffold-finite-scroll') || m.querySelector('[data-scrollable="true"]') || m.querySelector('[data-view-name*="reactors"]') || m;
}

function findButtonByText(root, patterns=[]) {
  const buttons = root.querySelectorAll('button, a, div[role="button"]');
  for (const b of buttons) {
    const txt = (b.innerText || b.textContent || '').trim().toLowerCase();
    if (!txt) continue;
    for (const p of patterns) {
      if (typeof p === 'string' && txt.includes(p.toLowerCase())) return b;
      if (p instanceof RegExp && p.test(txt)) return b;
    }
  }
  return null;
}

function getReactorsLoadMoreBtn() {
  const root = getReactorsModal() || document;
  return root.querySelector('.scaffold-finite-scroll__load-button') || findButtonByText(root, ['show more', 'load more', 'more results']);
}

function getExpectedReactorsCount() {
  const m = getReactorsModal();
  if (!m) return null;
  const el = Array.from(m.querySelectorAll('*')).find(e => /all\s+\d+/i.test((e.innerText||'').trim()));
  const m2 = el && el.innerText.match(/all\s+(\d+)/i);
  return m2 ? parseInt(m2[1], 10) : null;
}

async function openReactorsModalIfClosed() {
  if (getReactorsModal()) return true;
  const plusN = findButtonByText(document, [/^\+\d+$/]);
  if (plusN) { try { plusN.click(); } catch {} }
  if (!getReactorsModal()) {
    const link = findButtonByText(document, ['others', 'reactions', 'reacted', 'likes']);
    if (link) { try { link.click(); } catch {} }
  }
  if (!getReactorsModal()) {
    const launcher = document.querySelector('[data-control-name*="reactions"], [data-test-reactions-modal-launcher], [aria-label*="reactions"]');
    if (launcher) { try { launcher.click(); } catch {} }
  }
  for (let i=0;i<20;i++){ if (getReactorsModal()) return true; await new Promise(r=>setTimeout(r,150)); }
  return !!getReactorsModal();
}

function upsertPerson(key, url, type, name, headline, degree) {
  const nameKey = normalizeName(name);
  
  // Check if this URL already exists under a different key
  let existingUrlKey = null;
  STORE.forEach((value, storeKey) => {
    if (value.url === url && storeKey !== key) {
      existingUrlKey = storeKey;
    }
  });
  
  // If URL exists under different key, use that key instead
  if (existingUrlKey) {
    key = existingUrlKey;
  }
  
  if (!STORE.has(key)) STORE.set(key, { url: url || '', types: new Set(), name: name || '', headline: headline || '', degree: degree || '' });
  const obj = STORE.get(key);
  obj.types.add(type);
  obj.url = pickBetterUrl(obj.url, url);
  if (!obj.name && name) obj.name = name;
  if (!obj.headline && headline) obj.headline = headline;
  if (!obj.degree && degree) obj.degree = degree;
  if (nameKey && NAME_INDEX.has(nameKey)) {
    const existingKey = NAME_INDEX.get(nameKey);
    if (existingKey !== key && STORE.has(existingKey)) {
      const cur = STORE.get(key);
      const prev = STORE.get(existingKey);
      const preferKeyA = (a, b) => {
        const va = !/\/in\/ACo/i.test((a.url||'')); const vb = !/\/in\/ACo/i.test((b.url||''));
        if (va !== vb) return va;
        const score = r => (r.name?1:0) + (r.headline?1:0);
        return score(a) >= score(b);
      };
      const keepKey = preferKeyA(cur, prev) ? key : existingKey;
      const dropKey = keepKey === key ? existingKey : key;
      const keep = STORE.get(keepKey);
      const drop = STORE.get(dropKey);
      keep.url = pickBetterUrl(keep.url, drop.url);
      if (!keep.name && drop.name) keep.name = drop.name;
      if (!keep.headline && drop.headline) keep.headline = drop.headline;
      if (!keep.degree && drop.degree) keep.degree = drop.degree;
      drop.types.forEach(t => keep.types.add(t));
      STORE.delete(dropKey);
      NAME_INDEX.set(nameKey, keepKey);
      
      // Update the key variable to reflect the kept key
      if (key === dropKey) {
        key = keepKey;
      }
      return;
    }
  }
  if (nameKey && !NAME_INDEX.has(nameKey)) {
    NAME_INDEX.set(nameKey, key);
  }
}

function harvestVisibleReactors() {
  const scope = getReactorsModal() || document;
  const anchors = scope.querySelectorAll('a[href^="https://www.linkedin.com/in"], a[href^="/in/"], a[href^="https://www.linkedin.com/pub"]');
  let added = 0;
  let degreeCount = 0;
  let skippedSelf = 0;
  anchors.forEach(a => {
    const url = normalizeProfileUrl(a.href);
    if (!url) return;
    
    // Skip current user's own profile
    if (isCurrentUser(url)) {
      skippedSelf++;
      return;
    }
    
    const key = getCanonicalKey(a, url);
    const { name, headline, degree } = extractNameHeadlineNear(a);
    if (degree) degreeCount++;
    const before = STORE.size;
    upsertPerson(key, url, 'reactor', name, headline, degree);
    if (STORE.size > before) added++;
  });
  if (added > 0 && degreeCount > 0) {
    console.log(`  Extracted ${degreeCount} degrees from ${added} new reactors`);
  }
  if (skippedSelf > 0) {
    console.log(`  ℹ Skipped your own profile`);
  }
  return added;
}

function jitter(ms, spread=400){ return ms + Math.floor(Math.random()*spread); }

function expandReactorsFully(onDone, tries=0, stable=0, lastH=0, unchanged=0, lastCount=0) {
  const MAX_TRIES = 250;
  const MAX_STABLE = 8;
  const MAX_PROFILES = 2000;
  const expected = getExpectedReactorsCount();
  const newly = harvestVisibleReactors();
  const currentCount = countType('reactor');
  const totalProfiles = STORE.size;
  
  // Stop if we've hit the 2000 profile limit
  if (totalProfiles >= MAX_PROFILES) {
    console.log(`  Reached safety limit: ${totalProfiles} profiles collected`);
    return setTimeout(onDone, jitter(800,300));
  }
  
  // Early exit for very small posts (less than 20 expected)
  if (expected && expected < 20 && currentCount >= expected) {
    console.log(`  Small post complete: ${currentCount}/${expected}`);
    return setTimeout(onDone, jitter(500,200));
  }
  
  const scrollable = getReactorsScrollable();
  const btn = getReactorsLoadMoreBtn();
  if (btn && btn.offsetParent !== null) {
    try { btn.click(); console.log(`  [${tries}] Load more | Reactors: ${currentCount}${expected ? `/${expected}` : ''}`); } catch {}
  }
  if (scrollable) {
    scrollable.scrollTop = scrollable.scrollHeight;
    setTimeout(() => {
      if (scrollable) {
        scrollable.scrollTop = scrollable.scrollHeight - 100;
        setTimeout(() => { if (scrollable) scrollable.scrollTop = scrollable.scrollHeight; }, 100);
      }
    }, 200);
    const h = scrollable.scrollHeight;
    stable = (h === lastH) ? (stable + 1) : 0;
    lastH = h;
  }
  unchanged = (newly === 0 && currentCount === lastCount) ? (unchanged + 1) : 0;
  if (expected && currentCount >= expected) {
    console.log(`  Reached expected: ${currentCount}/${expected}`);
    return setTimeout(onDone, jitter(800,300));
  }
  
  // Adaptive timeout - faster for small posts
  const baseTimeout = expected && expected < 50 ? 600 : 900;
  const variance = expected && expected < 50 ? 300 : 600;
  
  setTimeout(() => {
    const stillBtn = !!(getReactorsLoadMoreBtn() && getReactorsLoadMoreBtn().offsetParent !== null);
    const canScroll = !!getReactorsScrollable();
    const stop = (stable >= MAX_STABLE && unchanged >= 5) || tries >= MAX_TRIES;
    if ((!stop) && (stillBtn || canScroll)) {
      expandReactorsFully(onDone, tries+1, stable, lastH, unchanged, currentCount);
    } else {
      console.log(`  Stopped: tries=${tries}, stable=${stable}, unchanged=${unchanged}`);
      if (expected) console.log(`  Collected ${currentCount}/${expected} (${Math.round(currentCount/expected*100)}%)`);
      setTimeout(onDone, jitter(800,300));
    }
  }, jitter(baseTimeout, variance));
}

function getLoadMoreCommentsButton() {
  const cands = Array.from(document.querySelectorAll('button, a, div[role="button"], span[role="button"]'));
  return cands.find(b => {
    const t = (b.innerText || b.textContent || '').trim().toLowerCase();
    return /load more comments|view more comments|see more comments|show more comments|more comments|load previous comments|view previous comments/.test(t);
  }) || null;
}

function expandCommentsFully(onDone, tries=0, lastCount=0) {
  const MAX_TRIES = 100;
  const MAX_PROFILES = 2000;
  
  // Check if we've hit the profile limit
  if (STORE.size >= MAX_PROFILES) {
    console.log(`  Reached safety limit: ${STORE.size} profiles collected`);
    return setTimeout(onDone, jitter(1000,400));
  }
  
  // Count current comments
  const currentItems = document.querySelectorAll('.comments-comment-entity, [data-test-comment], .comments-comment-item, article.comments-comment-item').length;
  
  const btn = getLoadMoreCommentsButton();
  if (btn && btn.offsetParent !== null && tries < MAX_TRIES) {
    try { 
      btn.click(); 
      console.log(`  [${tries}] Load more comments... (${currentItems} visible)`); 
    } catch {}
    
    // Check if we're making progress
    const unchanged = (currentItems === lastCount);
    
    // Adaptive timeout - faster for small comment sections
    const baseTimeout = currentItems < 20 ? 800 : 1500;
    const variance = currentItems < 20 ? 400 : 800;
    
    // Continue expanding with adaptive delays
    setTimeout(() => expandCommentsFully(onDone, tries+1, currentItems), jitter(baseTimeout, variance));
  } else {
    // No button found or max tries - check if there are hidden "Previous comments" buttons
    const prevBtn = Array.from(document.querySelectorAll('button, span[role="button"]')).find(b => 
      (b.innerText || '').toLowerCase().includes('previous')
    );
    
    if (prevBtn && tries < MAX_TRIES) {
      try {
        prevBtn.click();
        console.log(`  [${tries}] Loading previous comments...`);
        setTimeout(() => expandCommentsFully(onDone, tries+1, currentItems), jitter(1000, 500));
        return;
      } catch {}
    }
    
    console.log(`  Stopped after ${tries} tries (${currentItems} comments visible)`);
    setTimeout(onDone, jitter(1000,400));
  }
}

function collectCommenters() {
  // Much broader selector to catch ALL comment types
  const items = document.querySelectorAll(
    '.comments-comment-entity, ' +
    '[data-test-comment], ' +
    '.comments-comment-item, ' +
    '.comments-comment-item-content-body, ' +
    'article.comments-comment-item, ' +
    '.comments-comment-item--actor, ' +
    'div[data-id*="comment"], ' +
    'li[data-id*="comment"]'
  );
  let added = 0;
  let skipped = 0;
  const processedUrls = new Set(); // Prevent duplicates
  
  console.log(`  🔍 Found ${items.length} comment items on page`);
  
  items.forEach(item => {
    // Skip if inside modals
    if (item.closest('.social-details-reactors-modal')) return;
    if (item.closest('.social-details-social-activity-modal')) return;
    
    // Find ALL profile links in this comment
    const links = item.querySelectorAll('a[href^="https://www.linkedin.com/in"], a[href^="/in/"], a[href^="https://www.linkedin.com/pub"]');
    
    if (links.length === 0) {
      skipped++;
      return;
    }
    
    // Use the first link (usually the commenter)
    const a = links[0];
    const url = normalizeProfileUrl(a.href);
    if (!url || processedUrls.has(url)) return;
    
    // Skip current user's own profile
    if (isCurrentUser(url)) return;
    
    processedUrls.add(url);
    const key = getCanonicalKey(a, url);
    
    // Try multiple strategies to get name
    let name = '';
    const nameSelectors = [
      '.comments-comment-meta__description-title',
      '.comments-post-meta__name',
      '.comments-comment-meta__profile-link',
      'a[href*="/in/"] span[aria-hidden="true"]',
      '.comments-comment-item__main-content a span',
      'span.hoverable-link-text'
    ];
    for (const sel of nameSelectors) {
      const el = item.querySelector(sel);
      if (el && el.innerText.trim()) {
        name = cleanText(el.innerText);
        break;
      }
    }
    if (!name) name = cleanText(a.innerText);
    if (!name) {
      console.log(`  ⚠️  Skipping comment - no name found for: ${url}`);
      skipped++;
      return; // Skip if we can't get a name
    }
    
    // Try multiple strategies to get headline
    let headline = '';
    const headlineSelectors = [
      '.comments-comment-meta__description-subtitle',
      '.comments-post-meta__headline',
      '.comments-comment-meta__description',
      '.t-12.t-black--light',
      '.t-14.t-black--light'
    ];
    for (const sel of headlineSelectors) {
      const el = item.querySelector(sel);
      if (el && el.innerText.trim()) {
        headline = cleanText(el.innerText);
        break;
      }
    }
    
    // Try to get connection degree - improved extraction
    let degree = '';
    
    // 1. First try the standard degree element
    const degreeElement = item.querySelector('.artdeco-entity-lockup__degree');
    if (degreeElement) {
      degree = cleanText(degreeElement.innerText).replace(/[·\s•]/g, '');
    }
    
    // 2. Try looking in the subtitle/description area
    if (!degree) {
      const descriptionEl = item.querySelector('.comments-comment-meta__description-subtitle, .comments-post-meta__headline');
      if (descriptionEl) {
        const text = cleanText(descriptionEl.innerText);
        const match = text.match(/[•·]?\s*(1st|2nd|3rd|3rd\+)/i);
        if (match) {
          degree = match[1];
        }
      }
    }
    
    // 3. Search all text content for degree markers
    if (!degree) {
      const allText = item.innerText || '';
      const match = allText.match(/[•·]\s*(1st|2nd|3rd|3rd\+)/i);
      if (match) {
        degree = match[1];
      }
    }
    
    const before = STORE.size;
    upsertPerson(key, url, 'commenter', name, headline, degree);
    if (STORE.size > before) added++;
  });
  
  console.log(`  ✅ Collected ${added} new commenters (${processedUrls.size} comment profiles found, ${skipped} skipped)`);
  console.log(`  📊 Total unique people in STORE: ${STORE.size}`);
  return added;
}

function getRepostsModal() {
  const modals = document.querySelectorAll('[role="dialog"], .artdeco-modal, [data-test-modal]');
  for (const modal of modals) {
    const text = (modal.innerText || '').toLowerCase();
    if (text.includes('repost') || text.includes('shared this')) return modal;
  }
  const repostModal = document.querySelector('.social-details-social-activity-modal, [data-test-modal-id*="repost"]');
  if (repostModal) return repostModal;
  const anyModal = document.querySelector('[role="dialog"]:not(.social-details-reactors-modal)');
  if (anyModal) {
    const hasProfiles = anyModal.querySelectorAll('a[href*="/in/"]').length > 0;
    if (hasProfiles) return anyModal;
  }
  return null;
}

function getRepostsScrollable() {
  const m = getRepostsModal();
  if (!m) return null;
  return m.querySelector('.scaffold-finite-scroll') || m.querySelector('[data-scrollable="true"]') || m.querySelector('.artdeco-modal__content') || m;
}

function getRepostsLoadMoreBtn() {
  const root = getRepostsModal() || document;
  return root.querySelector('.scaffold-finite-scroll__load-button') || findButtonByText(root, ['show more', 'load more', 'more results']);
}

function getRepostCountElement() {
  const repostBtn = document.querySelector('button.social-details-social-counts__btn[aria-label*="repost"]');
  if (repostBtn) return repostBtn;
  const socialCountBtns = document.querySelectorAll('.social-details-social-counts__item button, .social-details-social-counts__count-value button');
  for (const btn of socialCountBtns) {
    const text = (btn.innerText || btn.textContent || '').trim();
    if (/\d+\s+repost/i.test(text)) return btn;
  }
  const socialCounts = document.querySelectorAll('.social-details-social-counts__item, button, a, span');
  for (const el of socialCounts) {
    const text = (el.innerText || el.textContent || '').trim();
    if (/\d+\s+repost/i.test(text)) return el;
  }
  return null;
}

async function openRepostsModalIfClosed() {
  if (getRepostsModal()) return true;
  
  // Quick check - if there's no repost button at all, skip this section
  const repostBtn = getRepostCountElement();
  if (!repostBtn) {
    console.log('  No reposts found on this post, skipping...');
    return false;
  }
  
  await forceCloseAllModals();
  await new Promise(r => setTimeout(r, 1000));
  
  if (repostBtn) {
    try {
      repostBtn.scrollIntoView({ behavior: 'smooth', block: 'center' });
      await new Promise(r => setTimeout(r, 800));
      repostBtn.click();
      
      // Reduced wait time - only try for 15 iterations (3.75 seconds)
      for (let i = 0; i < 15; i++) {
        await new Promise(r => setTimeout(r, 250));
        if (getRepostsModal()) return true;
      }
    } catch (e) {}
  }
  
  console.log('  Could not open reposts modal after 3.75s, skipping...');
  return false;
}

function collectRepostersFromModal() {
  const modal = getRepostsModal();
  if (!modal) return 0;
  let added = 0;
  const profileLinks = modal.querySelectorAll('a[href*="/in/"], a[href*="/pub/"]');
  const processedUrls = new Set();
  profileLinks.forEach((a) => {
    if (a.closest('.social-details-reactors-modal')) return;
    const text = (a.innerText || '').trim().toLowerCase();
    if (text.includes('dismiss') || text.includes('close') || !text) return;
    const url = normalizeProfileUrl(a.href);
    if (!url || processedUrls.has(url)) return;
    
    // Skip current user's own profile
    if (isCurrentUser(url)) return;
    
    processedUrls.add(url);
    const key = getCanonicalKey(a, url);
    const { name, headline, degree } = extractNameHeadlineNear(a);
    if (!name || name.length < 2) return;
    const before = STORE.size;
    upsertPerson(key, url, 'reposter', name, headline, degree);
    if (STORE.size > before) added++;
  });
  return added;
}

function expandRepostsFully(onDone, tries=0, stable=0, lastH=0, lastCount=0) {
  const MAX_TRIES = 100; // Restored from original
  const MAX_STABLE = 6; // Restored from original
  const MAX_PROFILES = 2000;
  
  // Check if we've hit the profile limit
  if (STORE.size >= MAX_PROFILES) {
    console.log(`  Reached safety limit: ${STORE.size} profiles collected`);
    return setTimeout(onDone, jitter(800,300));
  }
  
  const newly = collectRepostersFromModal();
  const currentCount = countType('reposter');
  
  // Track stability - only exit if we've tried enough times
  if (currentCount === lastCount) {
    stable++;
  } else {
    stable = 0;
  }
  
  const scrollable = getRepostsScrollable();
  const btn = getRepostsLoadMoreBtn();
  
  if (btn && btn.offsetParent !== null) {
    try { 
      btn.click(); 
      console.log(`  [${tries}] Load more | Reposters: ${currentCount}`); 
    } catch {}
  }
  
  if (scrollable) {
    scrollable.scrollTop = scrollable.scrollHeight;
    setTimeout(() => {
      if (scrollable) {
        scrollable.scrollTop = scrollable.scrollHeight - 100;
        setTimeout(() => { if (scrollable) scrollable.scrollTop = scrollable.scrollHeight; }, 100);
      }
    }, 200);
    const h = scrollable.scrollHeight;
    if (h === lastH) stable++;
    lastH = h;
  }
  
  setTimeout(() => {
    const stillBtn = !!(getRepostsLoadMoreBtn() && getRepostsLoadMoreBtn().offsetParent !== null);
    const canScroll = !!getRepostsScrollable();
    const stop = stable >= MAX_STABLE || tries >= MAX_TRIES;
    
    if ((!stop) && (stillBtn || canScroll)) {
      expandRepostsFully(onDone, tries+1, stable, lastH, currentCount);
    } else {
      console.log(`  Stopped: tries=${tries}, stable=${stable}`);
      console.log(`  Collected ${currentCount} reposters`);
      setTimeout(onDone, jitter(800,300));
    }
  }, jitter(1000, 600));
}

function countType(t) {
  let c = 0;
  STORE.forEach(v => { if (v.types.has(t)) c++; });
  return c;
}

function formatTypeLabel(types) {
  const arr = Array.from(types).sort();
  if (arr.length === 3) return 'all';
  if (arr.length === 2) {
    if (arr.includes('reactor') && arr.includes('commenter')) return 'reactor+commenter';
    if (arr.includes('reactor') && arr.includes('reposter')) return 'reactor+reposter';
    if (arr.includes('commenter') && arr.includes('reposter')) return 'commenter+reposter';
  }
  return arr[0];
}

// Global function to update status (will be set by run())
let updateStatus = (status) => {
  const statusEl = document.getElementById('li-buddy-status');
  if (statusEl) statusEl.textContent = status;
};

function finalizeAndExport() {
  setTimeout(() => {
    updateStatus('Final sweep...');
    console.log(''); console.log('FINAL COLLECTION SWEEP'); console.log('='.repeat(50));
    const finalReactors = harvestVisibleReactors();
    console.log(`  Final reactors: +${finalReactors}`);
    const finalCommenters = collectCommenters();
    console.log(`  Final commenters: +${finalCommenters}`);
    if (getRepostsModal()) {
      const finalReposters = collectRepostersFromModal();
      console.log(`  Final reposters: +${finalReposters}`);
    }
    
    const currentPostUrl = window.location.href;
    const rows = [];
    STORE.forEach(({ url, types, name, headline, degree }) => {
      rows.push({ 
        url, 
        type: formatTypeLabel(types), 
        name, 
        headline, 
        degree: degree || '',
        postUrl: currentPostUrl  // Add post URL to each row
      });
    });
    rows.sort((a,b)=>a.url.localeCompare(b.url));
    
    // Limit to 2000 profiles
    const LIMITED_COUNT = 2000;
    let limitedRows = rows;
    let wasLimited = false;
    if (rows.length > LIMITED_COUNT) {
      limitedRows = rows.slice(0, LIMITED_COUNT);
      wasLimited = true;
    }
    
    const stats = { reactors: countType('reactor'), commenters: countType('commenter'), reposters: countType('reposter'), total: rows.length, exported: limitedRows.length };
    console.log(''); console.log('='.repeat(50)); console.log('EXTRACTION COMPLETE'); console.log('='.repeat(50));
    console.log(`   Reactors:   ${stats.reactors}`);
    console.log(`   Commenters: ${stats.commenters}`);
    console.log(`   Reposters:  ${stats.reposters}`);
    console.log(`   ---------------------`);
    console.log(`   TOTAL:      ${stats.total}`);
    if (wasLimited) {
      console.log(`   EXPORTED:   ${stats.exported} (limited to ${LIMITED_COUNT})`);
      console.log(`   Note: Collection stopped at ${LIMITED_COUNT} profiles for safety`);
    }
    console.log('='.repeat(50)); console.log('');
    
    // Read config from data attributes (CSP-safe method)
    const configElement = document.getElementById('li-buddy-config');
    const webhookUrl = configElement ? configElement.getAttribute('data-webhook-url') : '';
    const exportMode = configElement ? configElement.getAttribute('data-export-mode') : 'webhook';
    
    console.log(`✅ Configuration read from DOM:`);
    console.log(`   Webhook URL: ${webhookUrl || '(none)'}`);
    console.log(`   Export mode: ${exportMode}`);
    
    if (exportMode === 'csv' || !webhookUrl) {
      // CSV mode - just download and close
      updateStatus('Downloading CSV...');
      console.log('📥 Downloading CSV...');
      downloadCSV(limitedRows);
      
      // Notify completion
      window.postMessage({ 
        type: 'COLLECTION_COMPLETE', 
        success: true,
        count: limitedRows.length 
      }, '*');
    } else {
      // Webhook mode - send data
      updateStatus('Sending to webhook...');
      const webhookData = {
        postUrl: currentPostUrl,
        scrapedAt: new Date().toISOString(),
        totalCount: limitedRows.length,
        stats: {
          reactors: stats.reactors,
          commenters: stats.commenters,
          reposters: stats.reposters
        },
        profiles: limitedRows
      };
      
      console.log(`📤 Sending ${limitedRows.length} profiles to webhook...`);
      console.log(`🔗 Target webhook: ${webhookUrl}`);
      
      // Send to content script via postMessage WITH the webhook URL
      window.postMessage({ 
        type: 'SEND_TO_WEBHOOK', 
        data: webhookData,
        webhookUrl: webhookUrl // Use the webhookUrl variable from config element
      }, '*');
      
      // Wait for response via postMessage
      const responseHandler = (event) => {
        if (event.data.type === 'WEBHOOK_RESPONSE') {
          window.removeEventListener('message', responseHandler);
          if (event.data.success) {
            updateStatus('✅ Complete!');
            console.log('✅ Data sent to webhook successfully!');
            // Notify to close tab
            window.postMessage({ 
              type: 'COLLECTION_COMPLETE', 
              success: true,
              count: limitedRows.length 
            }, '*');
          } else {
            updateStatus('⚠️ Webhook failed - CSV backup');
            console.log('❌ Webhook failed:', event.data.error);
            console.log('📥 Downloading CSV as backup...');
            downloadCSV(limitedRows);
            // Notify failure - keep tab open
            window.postMessage({ 
              type: 'COLLECTION_COMPLETE', 
              success: false 
            }, '*');
          }
        }
      };
      window.addEventListener('message', responseHandler);
      
      // Fallback timeout - give webhook 30 seconds to respond
      setTimeout(() => {
        window.removeEventListener('message', responseHandler);
        console.log('⚠️ Webhook timeout - no response after 30s');
      }, 30000);
    }
  }, 3000);
}

(async function run() {
  // Create floating console window to display logs
  const consoleWindow = document.createElement('div');
  consoleWindow.id = 'li-buddy-console';
  consoleWindow.style.cssText = `
    position: fixed;
    top: 20px;
    right: 20px;
    width: 450px;
    max-height: 600px;
    background: #1e1e1e;
    color: #d4d4d4;
    border-radius: 8px;
    box-shadow: 0 8px 32px rgba(0,0,0,0.4);
    z-index: 999999;
    font-family: 'Consolas', 'Monaco', 'Courier New', monospace;
    font-size: 12px;
    overflow: hidden;
    display: flex;
    flex-direction: column;
  `;
  
  const header = document.createElement('div');
  header.style.cssText = `
    background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
    color: white;
    padding: 12px 16px;
    font-weight: 600;
    display: flex;
    justify-content: space-between;
    align-items: center;
    font-size: 13px;
  `;
  header.innerHTML = `
    <span>🚀 LI Buddy Console</span>
    <span id="li-buddy-status" style="font-size: 11px; opacity: 0.9;">Starting...</span>
  `;
  
  const logsContainer = document.createElement('div');
  logsContainer.id = 'li-buddy-logs';
  logsContainer.style.cssText = `
    flex: 1;
    overflow-y: auto;
    padding: 12px;
    line-height: 1.5;
    max-height: 550px;
  `;
  
  consoleWindow.appendChild(header);
  consoleWindow.appendChild(logsContainer);
  document.body.appendChild(consoleWindow);
  
  // Custom logging function
  const logToWindow = (message, type = 'info') => {
    const logLine = document.createElement('div');
    logLine.style.marginBottom = '4px';
    logLine.style.wordWrap = 'break-word';
    
    let color = '#d4d4d4';
    let prefix = '';
    if (type === 'success') {
      color = '#4ec9b0';
      prefix = '✅ ';
    } else if (type === 'error') {
      color = '#f48771';
      prefix = '❌ ';
    } else if (type === 'warning') {
      color = '#dcdcaa';
      prefix = '⚠️  ';
    } else if (type === 'stage') {
      color = '#569cd6';
      prefix = '📍 ';
    } else if (type === 'count') {
      color = '#4ec9b0';
      prefix = '📊 ';
    }
    
    logLine.style.color = color;
    logLine.textContent = prefix + message;
    logsContainer.appendChild(logLine);
    logsContainer.scrollTop = logsContainer.scrollHeight;
  };
  
  // Override console.log for this script
  const originalLog = console.log;
  const originalWarn = console.warn;
  const originalError = console.error;
  
  console.log = function(...args) {
    const message = args.join(' ');
    if (message.includes('='.repeat(50))) {
      logToWindow('━'.repeat(50), 'info');
    } else if (message.includes('✅')) {
      logToWindow(message.replace('✅', '').trim(), 'success');
    } else if (message.includes('❌')) {
      logToWindow(message.replace('❌', '').trim(), 'error');
    } else if (message.includes('⚠')) {
      logToWindow(message.replace('⚠️', '').replace('⚠', '').trim(), 'warning');
    } else if (message.includes('STAGE') || message.includes('COLLECTION') || message.includes('COMPLETE')) {
      logToWindow(message, 'stage');
    } else if (message.match(/\d+\/\d+/) || message.includes('Total') || message.includes('Reactors:') || message.includes('Commenters:')) {
      logToWindow(message, 'count');
    } else if (message.trim()) {
      logToWindow(message, 'info');
    }
    originalLog.apply(console, args);
  };
  
  console.warn = function(...args) {
    logToWindow(args.join(' '), 'warning');
    originalWarn.apply(console, args);
  };
  
  console.error = function(...args) {
    logToWindow(args.join(' '), 'error');
    originalError.apply(console, args);
  };
  
  logToWindow('Collection process starting...', 'stage');
  updateStatus('Initializing...');
  
  console.log(''); console.log('='.repeat(50)); console.log('COLLECTION PROCESS STARTING'); console.log('='.repeat(50));
  console.log('Collecting engagement data...');
  console.log('Please do NOT close this tab!'); console.log('='.repeat(50)); console.log('');
  
  updateStatus('Stage 1: Reactions');
  console.log('STAGE 1: REACTIONS'); console.log('='.repeat(50));
  const openedReactors = await openReactorsModalIfClosed();
  if (!openedReactors) console.warn('Could not open reactors modal');
  expandReactorsFully(async () => {
    const reactorCount = countType('reactor');
    console.log(''); console.log(`STAGE 1 COMPLETE: ${reactorCount} reactors`); console.log('');
    await forceCloseAllModals();
    await new Promise(r => setTimeout(r, 1500));
    updateStatus('Stage 2: Comments');
    console.log('STAGE 2: COMMENTS'); console.log('='.repeat(50));
    const commentersBefore = countType('commenter'); // Count BEFORE expansion
    expandCommentsFully(async () => {
      const collected = collectCommenters(); // Collect after expansion
      const commentersAfter = countType('commenter');
      console.log(''); console.log(`STAGE 2 COMPLETE: ${commentersAfter} commenters`); console.log('');
      await forceCloseAllModals();
      await new Promise(r => setTimeout(r, 1500));
      updateStatus('Stage 3: Reposts');
      console.log('STAGE 3: REPOSTS'); console.log('='.repeat(50));
      const openedReposts = await openRepostsModalIfClosed();
      if (!openedReposts) {
        console.log('Could not open reposts modal. Skipping...');
        finalizeAndExport();
        return;
      }
      await new Promise(r => setTimeout(r, 1500));
      expandRepostsFully(async () => {
        const repostsAfter = countType('reposter');
        console.log(''); console.log(`STAGE 3 COMPLETE: ${repostsAfter} reposters`); console.log('');
        await forceCloseAllModals();
        await new Promise(r => setTimeout(r, 1000));
        console.log('📍 Calling finalizeAndExport...');
        finalizeAndExport();
      });
    });
  });
})();


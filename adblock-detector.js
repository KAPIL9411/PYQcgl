/**
 * Ad Blocker Detection Script
 * Detects if user is using ad blocker and blocks access to the site
 */

(function() {
  'use strict';

  let adBlockDetected = false;
  let checkCount = 0;
  const MAX_CHECKS = 3;

  // Method 1: Check if AdSense script loaded
  function checkAdSenseScript() {
    return new Promise((resolve) => {
      setTimeout(() => {
        if (typeof window.adsbygoogle === 'undefined') {
          resolve(true); // Ad blocker detected
        } else {
          resolve(false);
        }
      }, 1000);
    });
  }

  // Method 2: Create a bait element
  function checkBaitElement() {
    return new Promise((resolve) => {
      const bait = document.createElement('div');
      bait.className = 'ad ads adsbox doubleclick ad-placement ad-placeholder adbadge BannerAd';
      bait.style.cssText = 'width: 1px !important; height: 1px !important; position: absolute !important; left: -10000px !important; top: -1000px !important;';
      document.body.appendChild(bait);

      setTimeout(() => {
        const detected = bait.offsetHeight === 0 || bait.offsetWidth === 0 || 
                        window.getComputedStyle(bait).display === 'none' ||
                        window.getComputedStyle(bait).visibility === 'hidden';
        document.body.removeChild(bait);
        resolve(detected);
      }, 100);
    });
  }

  // Method 3: Check for common ad blocker properties
  function checkAdBlockerProperties() {
    // Check for common ad blocker extensions
    const adBlockerIndicators = [
      'webkit-masked-url',
      '__firefox__',
      '__chrome__'
    ];

    // Check if fetch is being intercepted (common in ad blockers)
    if (window.fetch && window.fetch.toString().includes('native')) {
      return false;
    }

    // Check for ad blocker specific properties
    if (window.canRunAds === false || window.isAdBlockActive === true) {
      return true;
    }

    return false;
  }

  // Method 4: Try to fetch a common ad script
  function checkAdScriptFetch() {
    return new Promise((resolve) => {
      fetch('https://pagead2.googlesyndication.com/pagead/js/adsbygoogle.js', {
        method: 'HEAD',
        mode: 'no-cors',
        cache: 'no-cache'
      })
      .then(() => resolve(false))
      .catch(() => resolve(true));
    });
  }

  // Show ad blocker warning overlay
  function showAdBlockWarning() {
    // Prevent multiple overlays
    if (document.getElementById('adblock-overlay')) return;

    const overlay = document.createElement('div');
    overlay.id = 'adblock-overlay';
    overlay.style.cssText = `
      position: fixed;
      top: 0;
      left: 0;
      right: 0;
      bottom: 0;
      background: rgba(0, 0, 0, 0.95);
      z-index: 999999;
      display: flex;
      align-items: center;
      justify-content: center;
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
    `;

    overlay.innerHTML = `
      <div style="
        background: white;
        border-radius: 16px;
        padding: 40px;
        max-width: 500px;
        margin: 20px;
        text-align: center;
        box-shadow: 0 20px 60px rgba(0,0,0,0.3);
      ">
        <div style="
          width: 80px;
          height: 80px;
          margin: 0 auto 24px;
          background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
          border-radius: 50%;
          display: flex;
          align-items: center;
          justify-content: center;
          font-size: 40px;
        ">
          🚫
        </div>
        
        <h2 style="
          margin: 0 0 16px;
          font-size: 24px;
          font-weight: 600;
          color: #1a202c;
        ">
          Ad Blocker Detected
        </h2>
        
        <p style="
          margin: 0 0 24px;
          font-size: 16px;
          line-height: 1.6;
          color: #4a5568;
        ">
          We've detected that you're using an ad blocker or Brave browser with shields enabled. 
          This site is free and supported by advertisements.
        </p>
        
        <div style="
          background: #f7fafc;
          border-radius: 12px;
          padding: 20px;
          margin-bottom: 24px;
          text-align: left;
        ">
          <p style="
            margin: 0 0 12px;
            font-size: 14px;
            font-weight: 600;
            color: #2d3748;
          ">
            To continue using SSC CGL PYQ Practice:
          </p>
          <ol style="
            margin: 0;
            padding-left: 20px;
            font-size: 14px;
            line-height: 1.8;
            color: #4a5568;
          ">
            <li>Disable your ad blocker for this site</li>
            <li>If using Brave browser, turn off Shields</li>
            <li>Refresh the page</li>
          </ol>
        </div>

        <button id="adblock-refresh-btn" style="
          background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
          color: white;
          border: none;
          border-radius: 10px;
          padding: 14px 32px;
          font-size: 16px;
          font-weight: 600;
          cursor: pointer;
          transition: transform 0.2s;
          width: 100%;
        " onmouseover="this.style.transform='translateY(-2px)'" onmouseout="this.style.transform='translateY(0)'">
          I've Disabled Ad Blocker - Refresh
        </button>

        <p style="
          margin: 20px 0 0;
          font-size: 13px;
          color: #718096;
        ">
          Thank you for supporting free education! 🙏
        </p>
      </div>
    `;

    document.body.appendChild(overlay);

    // Add refresh button functionality
    document.getElementById('adblock-refresh-btn').addEventListener('click', () => {
      window.location.reload();
    });

    // Prevent scrolling
    document.body.style.overflow = 'hidden';

    // Hide main content
    const app = document.getElementById('app');
    if (app) app.style.display = 'none';
  }

  // Main detection function
  async function detectAdBlocker() {
    checkCount++;

    try {
      // Run multiple detection methods
      const [
        adSenseBlocked,
        baitBlocked,
        propertyCheck,
        scriptFetchBlocked
      ] = await Promise.all([
        checkAdSenseScript(),
        checkBaitElement(),
        Promise.resolve(checkAdBlockerProperties()),
        checkAdScriptFetch()
      ]);

      // If any method detects ad blocker
      if (adSenseBlocked || baitBlocked || propertyCheck || scriptFetchBlocked) {
        adBlockDetected = true;
        console.warn('Ad blocker detected');
        showAdBlockWarning();
        return true;
      }

      return false;
    } catch (error) {
      console.error('Error detecting ad blocker:', error);
      // If there's an error, assume no ad blocker to avoid false positives
      return false;
    }
  }

  // Run detection after page load
  function init() {
    // Wait for DOM to be ready
    if (document.readyState === 'loading') {
      document.addEventListener('DOMContentLoaded', runDetection);
    } else {
      runDetection();
    }
  }

  function runDetection() {
    // Initial check after 1 second
    setTimeout(() => {
      detectAdBlocker().then(detected => {
        if (!detected && checkCount < MAX_CHECKS) {
          // Recheck after 3 seconds if not detected
          setTimeout(runDetection, 3000);
        }
      });
    }, 1000);
  }

  // Periodic checks every 30 seconds
  setInterval(() => {
    if (!adBlockDetected) {
      detectAdBlocker();
    }
  }, 30000);

  // Check when user returns to tab
  document.addEventListener('visibilitychange', () => {
    if (!document.hidden && !adBlockDetected) {
      setTimeout(detectAdBlocker, 500);
    }
  });

  // Initialize
  init();

  // Expose detection status (optional)
  window.adBlockStatus = {
    isDetected: () => adBlockDetected
  };
})();

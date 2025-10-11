/**
 * Enhanced Page Scraper for Chrome Extension
 * Extracts structured data from web pages for AI processing
 * Includes fallback mechanisms and comprehensive logging
 */

function quickScrape() {
    try {
        // =============================================
        // HELPER FUNCTIONS
        // =============================================
        
        /**
         * Clean and normalize text content
         * @param {string} text - Raw text to clean
         * @returns {string} Cleaned text
         */
        const cleanText = (text) => {
            return text
                .replace(/\s+/g, ' ')
                .replace(/[\r\n\t]/g, ' ')
                .trim();
        };

        /**
         * Remove duplicate items from array
         * @param {Array} array - Array to deduplicate
         * @param {string} key - Optional key for object comparison
         * @returns {Array} Deduplicated array
         */
        const removeDuplicates = (array, key = null) => {
            const seen = new Set();
            return array.filter(item => {
                const value = key ? item[key] : item;
                if (seen.has(value)) return false;
                seen.add(value);
                return true;
            });
        };

        /**
         * Filter out boilerplate and meaningless content
         * @param {Array} texts - Array of text strings
         * @param {number} minLength - Minimum text length
         * @returns {Array} Filtered meaningful content
         */
        const filterMeaningfulContent = (texts, minLength = 20) => {
            const boilerplateWords = [
                'cookie', 'privacy', 'terms', 'conditions', 'copyright',
                'all rights reserved', 'login', 'sign up', 'subscribe'
            ];
            
            return texts.filter(text => {
                if (text.length < minLength) return false;
                
                const lowerText = text.toLowerCase();
                return !boilerplateWords.some(word => lowerText.includes(word));
            });
        };

        /**
         * Extract meta tags from document head
         * @returns {Object} Key-value pairs of meta data
         */
        const extractMetaData = () => {
            const metas = Array.from(document.querySelectorAll('meta'));
            const metaData = {};
            
            metas.forEach(meta => {
                const name = meta.getAttribute('name') || meta.getAttribute('property');
                const content = meta.getAttribute('content');
                if (name && content) {
                    metaData[name] = cleanText(content);
                }
            });
            
            return metaData;
        };

        /**
         * Extract visible images with alt text
         * @returns {Array} Array of image objects
         */
        const extractImages = () => {
            return Array.from(document.querySelectorAll('img'))
                .filter(img => img.offsetParent !== null && img.src)
                .slice(0, 20)
                .map(img => ({
                    src: img.src,
                    alt: cleanText(img.alt || ''),
                    title: cleanText(img.title || '')
                }));
        };

        // =============================================
        // MAIN SCRAPING LOGIC
        // =============================================

        // Extract page title
        const title = cleanText(document.title);
        
        // Extract headings with hierarchy information
        const headings = Array.from(document.querySelectorAll("h1, h2, h3, h4, h5, h6"))
            .map(h => ({
                level: h.tagName.toLowerCase(),
                text: cleanText(h.innerText)
            }))
            .filter(h => h.text.length > 0);

        // Extract and filter paragraphs
        let paras = Array.from(document.querySelectorAll("p"))
            .map(p => cleanText(p.innerText))
            .filter(Boolean);
        
        paras = filterMeaningfulContent(paras);
        paras = removeDuplicates(paras).slice(0, 30);

        // Extract links with contextual information
        const links = Array.from(document.querySelectorAll("a"))
            .filter(a => a.offsetParent !== null && a.href && a.innerText.trim().length > 1)
            .slice(0, 150)
            .map(a => ({
                text: cleanText(a.innerText),
                href: a.href,
                isExternal: !a.href.startsWith(window.location.origin),
                isNavigation: a.closest('nav, header, footer') !== null
            }));
        
        const uniqueLinks = removeDuplicates(links, 'href').slice(0, 100);

        // =============================================
        // STRUCTURE FINAL DATA OBJECT
        // =============================================

        const data = {
            // Basic info (maintaining original structure for compatibility)
            title,
            headings: headings.map(h => h.text),
            paras,
            links: uniqueLinks.map(link => ({ text: link.text, href: link.href })),
            
            // Enhanced fields for advanced processing
            enhanced: {
                meta: extractMetaData(),
                images: extractImages(),
                headingHierarchy: headings,
                linkAnalysis: {
                    total: uniqueLinks.length,
                    internal: uniqueLinks.filter(link => !link.isExternal).length,
                    external: uniqueLinks.filter(link => link.isExternal).length,
                    navigation: uniqueLinks.filter(link => link.isNavigation).length
                },
                contentStats: {
                    totalParagraphs: paras.length,
                    totalHeadings: headings.length,
                    meaningfulContent: paras.length > 5 && headings.length > 2
                }
            }
        };

        // =============================================
        // PRODUCTION LOGGING
        // =============================================
        
        console.log("[Enhanced Scraper ✅] Successfully collected structured page data:", {
            title: data.title,
            paragraphs: data.paras.length,
            headings: data.headings.length,
            links: data.links.length,
            images: data.enhanced.images.length,
            metaTags: Object.keys(data.enhanced.meta).length
        });

        return data;

    } catch (err) {
        // =============================================
        // ERROR HANDLING & FALLBACK MECHANISM
        // =============================================
        
        console.error("[Enhanced Scraper ❌ Error]:", err);
        
        // Fallback to basic scraping for production reliability
        try {
            console.log("[Enhanced Scraper 🔄] Attempting fallback scraping...");
            
            const title = document.title;
            
            const headings = Array.from(document.querySelectorAll("h1, h2, h3"))
                .map(h => h.innerText.trim())
                .filter(Boolean);

            const paras = Array.from(document.querySelectorAll("p"))
                .slice(0, 30)
                .map(p => p.innerText.trim())
                .filter(Boolean);

            const links = Array.from(document.querySelectorAll("a"))
                .filter(a => a.offsetParent !== null && a.href && a.innerText.trim().length > 2)
                .slice(0, 100)
                .map(a => ({
                    text: a.innerText.trim(),
                    href: a.href
                }));

            console.log("[Enhanced Scraper ✅] Fallback scraping completed successfully");
            
            return { title, headings, paras, links };
            
        } catch (fallbackErr) {
            console.error("[Enhanced Scraper ❌] Fallback scraping also failed:", fallbackErr);
            return {};
        }
    }
}

// =============================================
// CHROME EXTENSION MESSAGE LISTENER
// =============================================

/**
 * Listener for messages from popup.js
 * Handles SCRAPE_PAGE requests and returns structured data
 */
chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
    if (msg.type === "SCRAPE_PAGE") {
        console.log("[Scraper 📨] Received SCRAPE_PAGE request from popup");
        
        try {
            const data = quickScrape();
            console.log("[Scraper ✅] Sending successful response with scraped data");
            sendResponse({ ok: true, data });
        } catch (err) {
            console.error("[Scraper ❌] Failed to scrape page:", err);
            sendResponse({ ok: false, error: err.message });
        }
    }
    
    // Keep message channel open for async response
    return true;
});
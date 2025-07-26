const crypto = require('crypto');
const { Buffer } = require('buffer');

/**
 * WhatsApp Helper Utilities
 * Collection of helper functions for WhatsApp operations
 */
class WAHelper {
    constructor() {
        // JID patterns
        this.jidPatterns = {
            user: /^(\d+)@s\.whatsapp\.net$/,
            group: /^(\d+)-(\d+)@g\.us$/,
            broadcast: /^(\d+)@broadcast$/,
            status: /status@broadcast$/
        };

        // Phone number patterns
        this.phonePatterns = {
            international: /^\+\d{1,15}$/,
            local: /^\d{10,15}$/
        };
    }

    // JID utilities
    isValidJid(jid) {
        if (!jid || typeof jid !== 'string') return false;
        
        return Object.values(this.jidPatterns).some(pattern => pattern.test(jid));
    }

    isUserJid(jid) {
        return this.jidPatterns.user.test(jid);
    }

    isGroupJid(jid) {
        return this.jidPatterns.group.test(jid);
    }

    isBroadcastJid(jid) {
        return this.jidPatterns.broadcast.test(jid);
    }

    isStatusJid(jid) {
        return this.jidPatterns.status.test(jid);
    }

    // Extract phone number from JID
    extractPhoneNumber(jid) {
        if (!jid) return null;
        
        const userMatch = jid.match(this.jidPatterns.user);
        if (userMatch) {
            return userMatch[1];
        }
        
        return null;
    }

    // Create JID from phone number
    createUserJid(phoneNumber) {
        const cleanNumber = this.cleanPhoneNumber(phoneNumber);
        if (!cleanNumber) return null;
        
        return `${cleanNumber}@s.whatsapp.net`;
    }

    // Create group JID
    createGroupJid(groupId, timestamp = null) {
        const ts = timestamp || Date.now();
        return `${groupId}-${ts}@g.us`;
    }

    // Phone number utilities
    cleanPhoneNumber(phoneNumber) {
        if (!phoneNumber) return null;
        
        // Remove all non-digit characters except +
        let cleaned = phoneNumber.replace(/[^\d+]/g, '');
        
        // Remove leading + if present
        if (cleaned.startsWith('+')) {
            cleaned = cleaned.substring(1);
        }
        
        // Validate length
        if (cleaned.length < 10 || cleaned.length > 15) {
            return null;
        }
        
        return cleaned;
    }

    formatPhoneNumber(phoneNumber, format = 'international') {
        const cleaned = this.cleanPhoneNumber(phoneNumber);
        if (!cleaned) return null;
        
        switch (format) {
            case 'international':
                return `+${cleaned}`;
            case 'local':
                return cleaned;
            case 'display':
                // Format for display (e.g., +1 234 567 8900)
                if (cleaned.length === 10) {
                    return `+1 ${cleaned.substring(0, 3)} ${cleaned.substring(3, 6)} ${cleaned.substring(6)}`;
                } else if (cleaned.length === 11 && cleaned.startsWith('1')) {
                    return `+${cleaned.substring(0, 1)} ${cleaned.substring(1, 4)} ${cleaned.substring(4, 7)} ${cleaned.substring(7)}`;
                }
                return `+${cleaned}`;
            default:
                return cleaned;
        }
    }

    isValidPhoneNumber(phoneNumber) {
        const cleaned = this.cleanPhoneNumber(phoneNumber);
        return cleaned !== null;
    }

    // Message utilities
    generateMessageId() {
        const timestamp = Date.now().toString(36);
        const random = crypto.randomBytes(8).toString('hex');
        return `${timestamp}${random}`.toUpperCase();
    }

    generateMessageTag() {
        return Math.floor(Math.random() * 1000000).toString();
    }

    // Time utilities
    getTimestamp() {
        return Math.floor(Date.now() / 1000);
    }

    formatTimestamp(timestamp, format = 'iso') {
        const date = new Date(timestamp * 1000);
        
        switch (format) {
            case 'iso':
                return date.toISOString();
            case 'locale':
                return date.toLocaleString();
            case 'date':
                return date.toDateString();
            case 'time':
                return date.toTimeString();
            default:
                return date.toString();
        }
    }

    // Base64 utilities
    toBase64(data) {
        if (Buffer.isBuffer(data)) {
            return data.toString('base64');
        } else if (typeof data === 'string') {
            return Buffer.from(data, 'utf8').toString('base64');
        } else {
            return Buffer.from(JSON.stringify(data)).toString('base64');
        }
    }

    fromBase64(base64String, encoding = 'utf8') {
        try {
            const buffer = Buffer.from(base64String, 'base64');
            if (encoding === 'buffer') {
                return buffer;
            }
            return buffer.toString(encoding);
        } catch (error) {
            return null;
        }
    }

    // URL utilities
    isValidUrl(url) {
        try {
            new URL(url);
            return true;
        } catch {
            return false;
        }
    }

    extractUrls(text) {
        const urlRegex = /(https?:\/\/[^\s]+)/g;
        return text.match(urlRegex) || [];
    }

    // File utilities
    getFileExtension(filename) {
        if (!filename || typeof filename !== 'string') return null;
        
        const lastDot = filename.lastIndexOf('.');
        if (lastDot === -1) return null;
        
        return filename.substring(lastDot + 1).toLowerCase();
    }

    getMimeType(extension) {
        const mimeTypes = {
            // Images
            'jpg': 'image/jpeg',
            'jpeg': 'image/jpeg',
            'png': 'image/png',
            'gif': 'image/gif',
            'webp': 'image/webp',
            'svg': 'image/svg+xml',
            
            // Videos
            'mp4': 'video/mp4',
            'avi': 'video/x-msvideo',
            'mov': 'video/quicktime',
            'mkv': 'video/x-matroska',
            'webm': 'video/webm',
            
            // Audio
            'mp3': 'audio/mpeg',
            'wav': 'audio/wav',
            'ogg': 'audio/ogg',
            'aac': 'audio/aac',
            'm4a': 'audio/mp4',
            
            // Documents
            'pdf': 'application/pdf',
            'doc': 'application/msword',
            'docx': 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
            'xls': 'application/vnd.ms-excel',
            'xlsx': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
            'ppt': 'application/vnd.ms-powerpoint',
            'pptx': 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
            'txt': 'text/plain',
            'csv': 'text/csv',
            'json': 'application/json',
            'xml': 'application/xml',
            'zip': 'application/zip',
            'rar': 'application/x-rar-compressed'
        };
        
        return mimeTypes[extension.toLowerCase()] || 'application/octet-stream';
    }

    // String utilities
    truncateString(str, maxLength, suffix = '...') {
        if (!str || str.length <= maxLength) return str;
        return str.substring(0, maxLength - suffix.length) + suffix;
    }

    escapeHtml(text) {
        const htmlEscapes = {
            '&': '&amp;',
            '<': '&lt;',
            '>': '&gt;',
            '"': '&quot;',
            "'": '&#x27;'
        };
        
        return text.replace(/[&<>"']/g, match => htmlEscapes[match]);
    }

    unescapeHtml(html) {
        const htmlUnescapes = {
            '&amp;': '&',
            '&lt;': '<',
            '&gt;': '>',
            '&quot;': '"',
            '&#x27;': "'"
        };
        
        return html.replace(/&(amp|lt|gt|quot|#x27);/g, match => htmlUnescapes[match]);
    }

    // Array utilities
    chunk(array, size) {
        const chunks = [];
        for (let i = 0; i < array.length; i += size) {
            chunks.push(array.slice(i, i + size));
        }
        return chunks;
    }

    unique(array) {
        return [...new Set(array)];
    }

    // Object utilities
    deepClone(obj) {
        if (obj === null || typeof obj !== 'object') return obj;
        if (obj instanceof Date) return new Date(obj.getTime());
        if (obj instanceof Array) return obj.map(item => this.deepClone(item));
        if (typeof obj === 'object') {
            const cloned = {};
            Object.keys(obj).forEach(key => {
                cloned[key] = this.deepClone(obj[key]);
            });
            return cloned;
        }
    }

    isEmpty(obj) {
        if (obj === null || obj === undefined) return true;
        if (typeof obj === 'string' || Array.isArray(obj)) return obj.length === 0;
        if (typeof obj === 'object') return Object.keys(obj).length === 0;
        return false;
    }

    // Validation utilities
    isEmail(email) {
        const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
        return emailRegex.test(email);
    }

    isNumeric(value) {
        return !isNaN(value) && !isNaN(parseFloat(value));
    }

    isAlphanumeric(str) {
        const alphanumericRegex = /^[a-zA-Z0-9]+$/;
        return alphanumericRegex.test(str);
    }

    // Hash utilities
    generateHash(data, algorithm = 'sha256') {
        const hash = crypto.createHash(algorithm);
        hash.update(data);
        return hash.digest('hex');
    }

    generateRandomString(length = 32, charset = 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789') {
        let result = '';
        for (let i = 0; i < length; i++) {
            result += charset.charAt(Math.floor(Math.random() * charset.length));
        }
        return result;
    }

    // Retry utilities
    async retry(fn, options = {}) {
        const {
            retries = 3,
            delay = 1000,
            backoff = 2,
            onRetry = null
        } = options;

        let lastError;
        
        for (let attempt = 0; attempt <= retries; attempt++) {
            try {
                return await fn();
            } catch (error) {
                lastError = error;
                
                if (attempt === retries) {
                    throw error;
                }
                
                if (onRetry) {
                    onRetry(error, attempt + 1);
                }
                
                const waitTime = delay * Math.pow(backoff, attempt);
                await this.sleep(waitTime);
            }
        }
        
        throw lastError;
    }

    sleep(ms) {
        return new Promise(resolve => setTimeout(resolve, ms));
    }

    // Debounce and throttle
    debounce(func, delay) {
        let timeoutId;
        return function (...args) {
            clearTimeout(timeoutId);
            timeoutId = setTimeout(() => func.apply(this, args), delay);
        };
    }

    throttle(func, limit) {
        let inThrottle;
        return function (...args) {
            if (!inThrottle) {
                func.apply(this, args);
                inThrottle = true;
                setTimeout(() => inThrottle = false, limit);
            }
        };
    }

    // Rate limiting
    createRateLimiter(maxRequests, windowMs) {
        const requests = new Map();
        
        return (key) => {
            const now = Date.now();
            const windowStart = now - windowMs;
            
            // Clean old entries
            for (const [reqKey, timestamps] of requests.entries()) {
                requests.set(reqKey, timestamps.filter(ts => ts > windowStart));
                if (requests.get(reqKey).length === 0) {
                    requests.delete(reqKey);
                }
            }
            
            // Check current key
            const keyRequests = requests.get(key) || [];
            const recentRequests = keyRequests.filter(ts => ts > windowStart);
            
            if (recentRequests.length >= maxRequests) {
                return false; // Rate limited
            }
            
            recentRequests.push(now);
            requests.set(key, recentRequests);
            return true; // Allowed
        };
    }
}

module.exports = WAHelper;
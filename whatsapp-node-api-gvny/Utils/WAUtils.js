const crypto = require('crypto');
const { Buffer } = require('buffer');

class WAUtils {
    constructor() {
        this.phoneRegex = /^[\+]?[1-9][\d]{0,15}$/;
        this.jidRegex = /^[\d\+\-]+@[sg]\.whatsapp\.net$/;
        this.groupJidRegex = /^[\d\+\-]+@g\.us$/;
        this.broadcastJidRegex = /^[\d\+\-]+@broadcast$/;
        this.statusJidRegex = /^status@broadcast$/;
    }
    
    // JID utilities
    normalizeJid(jid) {
        if (!jid) return null;
        
        // Remove any whitespace
        jid = jid.trim();
        
        // If it's already a JID, return as is
        if (this.isValidJid(jid)) {
            return jid;
        }
        
        // If it's a phone number, convert to JID
        if (this.isValidPhoneNumber(jid)) {
            const cleanPhone = this.cleanPhoneNumber(jid);
            return `${cleanPhone}@s.whatsapp.net`;
        }
        
        return null;
    }
    
    isValidJid(jid) {
        if (!jid || typeof jid !== 'string') return false;
        return this.jidRegex.test(jid) || this.groupJidRegex.test(jid) || 
               this.broadcastJidRegex.test(jid) || this.statusJidRegex.test(jid);
    }
    
    isGroupJid(jid) {
        if (!jid) return false;
        return this.groupJidRegex.test(jid);
    }
    
    isBroadcastJid(jid) {
        if (!jid) return false;
        return this.broadcastJidRegex.test(jid);
    }
    
    isStatusJid(jid) {
        if (!jid) return false;
        return this.statusJidRegex.test(jid);
    }
    
    extractPhoneFromJid(jid) {
        if (!jid) return null;
        const match = jid.match(/^([\d\+\-]+)@/);
        return match ? match[1] : null;
    }
    
    // Phone number utilities
    isValidPhoneNumber(phone) {
        if (!phone || typeof phone !== 'string') return false;
        const cleaned = this.cleanPhoneNumber(phone);
        return this.phoneRegex.test(cleaned);
    }
    
    cleanPhoneNumber(phone) {
        if (!phone) return '';
        return phone.replace(/[^\d\+]/g, '');
    }
    
    formatPhoneNumber(phone, format = 'international') {
        const cleaned = this.cleanPhoneNumber(phone);
        
        switch (format) {
            case 'international':
                return cleaned.startsWith('+') ? cleaned : `+${cleaned}`;
            case 'national':
                return cleaned.replace(/^\+/, '');
            case 'e164':
                return cleaned.startsWith('+') ? cleaned : `+${cleaned}`;
            default:
                return cleaned;
        }
    }
    
    // Message utilities
    generateMessageId() {
        const timestamp = Date.now();
        const random = crypto.randomBytes(8).toString('hex').toUpperCase();
        return `3EB0${random}${timestamp.toString(16).toUpperCase()}`;
    }
    
    parseMessageKey(key) {
        if (!key) return null;
        
        return {
            remoteJid: key.remoteJid,
            fromMe: key.fromMe || false,
            id: key.id,
            participant: key.participant || null
        };
    }
    
    createMessageKey(remoteJid, id, fromMe = true, participant = null) {
        const key = {
            remoteJid: this.normalizeJid(remoteJid),
            fromMe,
            id: id || this.generateMessageId()
        };
        
        if (participant) {
            key.participant = this.normalizeJid(participant);
        }
        
        return key;
    }
    
    // Time utilities
    unixTimestamp() {
        return Math.floor(Date.now() / 1000);
    }
    
    unixTimestampMs() {
        return Date.now();
    }
    
    formatTimestamp(timestamp, format = 'iso') {
        const date = new Date(timestamp * 1000);
        
        switch (format) {
            case 'iso':
                return date.toISOString();
            case 'unix':
                return Math.floor(date.getTime() / 1000);
            case 'ms':
                return date.getTime();
            case 'readable':
                return date.toLocaleString();
            default:
                return date.toString();
        }
    }
    
    // Buffer utilities
    bufferToHex(buffer) {
        return Buffer.from(buffer).toString('hex');
    }
    
    hexToBuffer(hex) {
        return Buffer.from(hex, 'hex');
    }
    
    bufferToBase64(buffer) {
        return Buffer.from(buffer).toString('base64');
    }
    
    base64ToBuffer(base64) {
        return Buffer.from(base64, 'base64');
    }
    
    bufferToString(buffer, encoding = 'utf8') {
        return Buffer.from(buffer).toString(encoding);
    }
    
    stringToBuffer(string, encoding = 'utf8') {
        return Buffer.from(string, encoding);
    }
    
    // Crypto utilities
    generateRandomBytes(length = 16) {
        return crypto.randomBytes(length);
    }
    
    generateRandomString(length = 16, charset = 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789') {
        let result = '';
        for (let i = 0; i < length; i++) {
            result += charset.charAt(Math.floor(Math.random() * charset.length));
        }
        return result;
    }
    
    hash(data, algorithm = 'sha256') {
        return crypto.createHash(algorithm).update(data).digest();
    }
    
    hmac(data, key, algorithm = 'sha256') {
        return crypto.createHmac(algorithm, key).update(data).digest();
    }
    
    // Validation utilities
    isValidEmail(email) {
        const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
        return emailRegex.test(email);
    }
    
    isValidUrl(url) {
        try {
            new URL(url);
            return true;
        } catch {
            return false;
        }
    }
    
    sanitizeString(str, maxLength = 1000) {
        if (!str || typeof str !== 'string') return '';
        
        // Remove control characters and limit length
        return str.replace(/[\x00-\x1F\x7F]/g, '').substring(0, maxLength);
    }
    
    // Array utilities
    chunk(array, size) {
        const chunks = [];
        for (let i = 0; i < array.length; i += size) {
            chunks.push(array.slice(i, i + size));
        }
        return chunks;
    }
    
    shuffle(array) {
        const shuffled = [...array];
        for (let i = shuffled.length - 1; i > 0; i--) {
            const j = Math.floor(Math.random() * (i + 1));
            [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
        }
        return shuffled;
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
            for (const key in obj) {
                if (obj.hasOwnProperty(key)) {
                    cloned[key] = this.deepClone(obj[key]);
                }
            }
            return cloned;
        }
        return obj;
    }
    
    mergeDeep(target, source) {
        const output = { ...target };
        
        for (const key in source) {
            if (source.hasOwnProperty(key)) {
                if (this.isObject(source[key]) && this.isObject(target[key])) {
                    output[key] = this.mergeDeep(target[key], source[key]);
                } else {
                    output[key] = source[key];
                }
            }
        }
        
        return output;
    }
    
    isObject(item) {
        return item && typeof item === 'object' && !Array.isArray(item);
    }
    
    // String utilities
    capitalize(str) {
        if (!str) return '';
        return str.charAt(0).toUpperCase() + str.slice(1).toLowerCase();
    }
    
    camelCase(str) {
        return str.replace(/[-_\s]+(.)?/g, (_, char) => char ? char.toUpperCase() : '');
    }
    
    kebabCase(str) {
        return str.replace(/([a-z])([A-Z])/g, '$1-$2').toLowerCase();
    }
    
    snakeCase(str) {
        return str.replace(/([a-z])([A-Z])/g, '$1_$2').toLowerCase();
    }
    
    // File utilities
    getFileExtension(filename) {
        if (!filename) return '';
        const parts = filename.split('.');
        return parts.length > 1 ? parts.pop().toLowerCase() : '';
    }
    
    getMimeType(extension) {
        const mimeTypes = {
            'jpg': 'image/jpeg',
            'jpeg': 'image/jpeg',
            'png': 'image/png',
            'gif': 'image/gif',
            'webp': 'image/webp',
            'mp4': 'video/mp4',
            'avi': 'video/avi',
            'mov': 'video/quicktime',
            'mp3': 'audio/mpeg',
            'wav': 'audio/wav',
            'ogg': 'audio/ogg',
            'pdf': 'application/pdf',
            'doc': 'application/msword',
            'docx': 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
            'txt': 'text/plain',
            'json': 'application/json',
            'xml': 'application/xml',
            'zip': 'application/zip',
            'rar': 'application/x-rar-compressed'
        };
        
        return mimeTypes[extension.toLowerCase()] || 'application/octet-stream';
    }
    
    formatFileSize(bytes) {
        if (bytes === 0) return '0 Bytes';
        
        const k = 1024;
        const sizes = ['Bytes', 'KB', 'MB', 'GB', 'TB'];
        const i = Math.floor(Math.log(bytes) / Math.log(k));
        
        return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
    }
    
    // Retry utilities
    async retry(fn, maxAttempts = 3, delay = 1000, backoff = 2) {
        let lastError;
        
        for (let attempt = 1; attempt <= maxAttempts; attempt++) {
            try {
                return await fn();
            } catch (error) {
                lastError = error;
                
                if (attempt === maxAttempts) {
                    throw lastError;
                }
                
                await this.sleep(delay * Math.pow(backoff, attempt - 1));
            }
        }
    }
    
    sleep(ms) {
        return new Promise(resolve => setTimeout(resolve, ms));
    }
    
    // Rate limiting utilities
    createRateLimiter(maxRequests, windowMs) {
        const requests = new Map();
        
        return {
            isAllowed: (key) => {
                const now = Date.now();
                const windowStart = now - windowMs;
                
                if (!requests.has(key)) {
                    requests.set(key, []);
                }
                
                const keyRequests = requests.get(key);
                
                // Remove old requests
                while (keyRequests.length > 0 && keyRequests[0] < windowStart) {
                    keyRequests.shift();
                }
                
                if (keyRequests.length >= maxRequests) {
                    return false;
                }
                
                keyRequests.push(now);
                return true;
            },
            reset: (key) => {
                if (key) {
                    requests.delete(key);
                } else {
                    requests.clear();
                }
            }
        };
    }
    
    // Debounce and throttle utilities
    debounce(func, wait) {
        let timeout;
        return function executedFunction(...args) {
            const later = () => {
                clearTimeout(timeout);
                func(...args);
            };
            clearTimeout(timeout);
            timeout = setTimeout(later, wait);
        };
    }
    
    throttle(func, limit) {
        let inThrottle;
        return function(...args) {
            if (!inThrottle) {
                func.apply(this, args);
                inThrottle = true;
                setTimeout(() => inThrottle = false, limit);
            }
        };
    }
    
    // Error utilities
    createError(message, code, data = null) {
        const error = new Error(message);
        error.code = code;
        if (data) error.data = data;
        return error;
    }
    
    isRetryableError(error) {
        const retryableCodes = [
            'ECONNRESET',
            'ECONNREFUSED',
            'ETIMEDOUT',
            'ENOTFOUND',
            'EHOSTUNREACH',
            'ENETUNREACH',
            'EAI_AGAIN'
        ];
        
        return retryableCodes.includes(error.code) || 
               error.message.includes('timeout') ||
               error.message.includes('network');
    }
    
    // Performance utilities
    benchmark(fn, iterations = 1000) {
        const start = process.hrtime.bigint();
        
        for (let i = 0; i < iterations; i++) {
            fn();
        }
        
        const end = process.hrtime.bigint();
        const totalNs = Number(end - start);
        const avgNs = totalNs / iterations;
        
        return {
            total: totalNs / 1000000, // ms
            average: avgNs / 1000000, // ms
            iterations
        };
    }
    
    // Memory utilities
    getMemoryUsage() {
        const usage = process.memoryUsage();
        return {
            rss: this.formatFileSize(usage.rss),
            heapTotal: this.formatFileSize(usage.heapTotal),
            heapUsed: this.formatFileSize(usage.heapUsed),
            external: this.formatFileSize(usage.external),
            arrayBuffers: this.formatFileSize(usage.arrayBuffers)
        };
    }
    
    // Environment utilities
    isNode() {
        return typeof process !== 'undefined' && process.versions && process.versions.node;
    }
    
    isBrowser() {
        return typeof window !== 'undefined';
    }
    
    getEnvironment() {
        if (this.isNode()) return 'node';
        if (this.isBrowser()) return 'browser';
        return 'unknown';
    }
}

module.exports = WAUtils;
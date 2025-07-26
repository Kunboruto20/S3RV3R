const crypto = require('crypto');

/**
 * WhatsApp QR Code Handler
 * Manages QR code generation, validation, and lifecycle
 */
class WAQRCode {
    constructor(options = {}) {
        this.options = {
            timeout: 60000, // 1 minute
            maxRetries: 5,
            keySize: 32,
            ...options
        };
        
        this.currentQR = null;
        this.qrHistory = [];
        this.retryCount = 0;
    }

    /**
     * Generate a new QR code
     */
    async generateQR(keyHandler = null) {
        try {
            const timestamp = Date.now();
            const ref = this.generateRef();
            const publicKey = keyHandler ? keyHandler.getPublicKey() : this.generateTempPublicKey();
            const identityKey = keyHandler ? keyHandler.getIdentityKeyPair().publicKey : this.generateTempIdentityKey();
            const advId = timestamp;
            
            this.currentQR = {
                ref,
                publicKey: publicKey.toString('base64'),
                identityKey: identityKey.toString('base64'),
                advId,
                timestamp,
                expires: timestamp + this.options.timeout,
                scanned: false,
                used: false,
                id: crypto.randomUUID()
            };
            
            this.qrHistory.push({ ...this.currentQR });
            
            return this.currentQR;
        } catch (error) {
            throw new Error(`Failed to generate QR code: ${error.message}`);
        }
    }

    /**
     * Generate QR reference string
     */
    generateRef() {
        return crypto.randomBytes(16).toString('base64');
    }

    /**
     * Generate temporary public key (if no key handler provided)
     */
    generateTempPublicKey() {
        return crypto.randomBytes(32);
    }

    /**
     * Generate temporary identity key (if no key handler provided)
     */
    generateTempIdentityKey() {
        return crypto.randomBytes(32);
    }

    /**
     * Get current QR code data
     */
    getCurrentQR() {
        if (!this.currentQR) {
            return null;
        }
        
        // Check if expired
        if (Date.now() > this.currentQR.expires) {
            this.currentQR = null;
            return null;
        }
        
        return { ...this.currentQR };
    }

    /**
     * Create QR string for encoding
     */
    createQRString(qrData = null) {
        const qr = qrData || this.currentQR;
        if (!qr) {
            throw new Error('No QR code data available');
        }
        
        return `${qr.ref},${qr.publicKey},${qr.identityKey},${qr.advId}`;
    }

    /**
     * Parse QR string
     */
    parseQRString(qrString) {
        try {
            const parts = qrString.split(',');
            if (parts.length < 4) {
                return { valid: false, error: 'Invalid QR format' };
            }
            
            const [ref, publicKey, identityKey, advId] = parts;
            
            // Basic validation
            if (!ref || !publicKey || !identityKey || !advId) {
                return { valid: false, error: 'Missing QR components' };
            }
            
            // Validate base64 encoding
            try {
                Buffer.from(publicKey, 'base64');
                Buffer.from(identityKey, 'base64');
            } catch (error) {
                return { valid: false, error: 'Invalid base64 encoding' };
            }
            
            return {
                valid: true,
                ref,
                publicKey,
                identityKey,
                advId: parseInt(advId) || Date.now()
            };
        } catch (error) {
            return { valid: false, error: error.message };
        }
    }

    /**
     * Validate QR code
     */
    validateQR(qrString) {
        const parsed = this.parseQRString(qrString);
        if (!parsed.valid) {
            return parsed;
        }
        
        // Additional validation
        if (parsed.publicKey.length < 40) { // Base64 encoded 32 bytes should be longer
            return { valid: false, error: 'Invalid public key length' };
        }
        
        if (parsed.identityKey.length < 40) {
            return { valid: false, error: 'Invalid identity key length' };
        }
        
        // Check timestamp validity (not too old, not in future)
        const now = Date.now();
        const qrTime = parsed.advId;
        const maxAge = 5 * 60 * 1000; // 5 minutes
        
        if (qrTime > now + 60000) { // 1 minute in future tolerance
            return { valid: false, error: 'QR code timestamp in future' };
        }
        
        if (now - qrTime > maxAge) {
            return { valid: false, error: 'QR code too old' };
        }
        
        return parsed;
    }

    /**
     * Mark QR as scanned
     */
    markAsScanned() {
        if (this.currentQR) {
            this.currentQR.scanned = true;
            this.currentQR.scannedAt = Date.now();
            return true;
        }
        return false;
    }

    /**
     * Mark QR as used
     */
    markAsUsed() {
        if (this.currentQR) {
            this.currentQR.used = true;
            this.currentQR.usedAt = Date.now();
            return true;
        }
        return false;
    }

    /**
     * Check if QR is expired
     */
    isExpired() {
        if (!this.currentQR) {
            return true;
        }
        return Date.now() > this.currentQR.expires;
    }

    /**
     * Get time remaining
     */
    getTimeRemaining() {
        if (!this.currentQR || this.isExpired()) {
            return 0;
        }
        return Math.max(0, this.currentQR.expires - Date.now());
    }

    /**
     * Refresh QR code (generate new one)
     */
    async refreshQR(keyHandler = null) {
        this.retryCount++;
        
        if (this.retryCount > this.options.maxRetries) {
            throw new Error('Maximum QR refresh attempts exceeded');
        }
        
        return await this.generateQR(keyHandler);
    }

    /**
     * Reset retry count
     */
    resetRetryCount() {
        this.retryCount = 0;
    }

    /**
     * Get QR statistics
     */
    getStatistics() {
        const total = this.qrHistory.length;
        const scanned = this.qrHistory.filter(qr => qr.scanned).length;
        const used = this.qrHistory.filter(qr => qr.used).length;
        const expired = this.qrHistory.filter(qr => Date.now() > qr.expires && !qr.used).length;
        
        return {
            total,
            scanned,
            used,
            expired,
            current: this.currentQR ? 1 : 0,
            retryCount: this.retryCount,
            successRate: total > 0 ? (used / total * 100).toFixed(2) + '%' : '0%'
        };
    }

    /**
     * Get QR history
     */
    getHistory(limit = 10) {
        return this.qrHistory
            .slice(-limit)
            .map(qr => ({
                id: qr.id,
                ref: qr.ref,
                timestamp: qr.timestamp,
                expires: qr.expires,
                scanned: qr.scanned,
                used: qr.used,
                scannedAt: qr.scannedAt,
                usedAt: qr.usedAt
            }));
    }

    /**
     * Clear QR history
     */
    clearHistory() {
        const count = this.qrHistory.length;
        this.qrHistory = [];
        return count;
    }

    /**
     * Get QR state
     */
    getState() {
        return {
            hasCurrentQR: !!this.currentQR,
            isExpired: this.isExpired(),
            timeRemaining: this.getTimeRemaining(),
            retryCount: this.retryCount,
            maxRetries: this.options.maxRetries,
            canRetry: this.retryCount < this.options.maxRetries,
            currentQR: this.currentQR ? {
                id: this.currentQR.id,
                ref: this.currentQR.ref,
                timestamp: this.currentQR.timestamp,
                expires: this.currentQR.expires,
                scanned: this.currentQR.scanned,
                used: this.currentQR.used
            } : null
        };
    }

    /**
     * Create QR data for display
     */
    createDisplayData() {
        const qr = this.getCurrentQR();
        if (!qr) {
            return null;
        }
        
        return {
            qrString: this.createQRString(qr),
            ref: qr.ref,
            timestamp: qr.timestamp,
            expires: qr.expires,
            timeRemaining: this.getTimeRemaining(),
            formattedTimeRemaining: this.formatTimeRemaining(this.getTimeRemaining())
        };
    }

    /**
     * Format time remaining for display
     */
    formatTimeRemaining(ms) {
        if (ms <= 0) {
            return 'Expired';
        }
        
        const seconds = Math.floor(ms / 1000);
        const minutes = Math.floor(seconds / 60);
        const remainingSeconds = seconds % 60;
        
        if (minutes > 0) {
            return `${minutes}:${remainingSeconds.toString().padStart(2, '0')}`;
        } else {
            return `${remainingSeconds}s`;
        }
    }

    /**
     * Cleanup expired QR codes from history
     */
    cleanupHistory() {
        const now = Date.now();
        const maxAge = 24 * 60 * 60 * 1000; // 24 hours
        
        const initialCount = this.qrHistory.length;
        this.qrHistory = this.qrHistory.filter(qr => 
            now - qr.timestamp < maxAge
        );
        
        return initialCount - this.qrHistory.length;
    }
}

module.exports = WAQRCode;
const crypto = require('crypto');

/**
 * WhatsApp Pairing Code Handler
 * Manages pairing code generation and validation for authentication
 */
class WAPairingCode {
    constructor(options = {}) {
        this.options = {
            codeLength: 8,
            expiryTime: 5 * 60 * 1000, // 5 minutes
            allowedChars: 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789',
            ...options
        };
        
        this.activeCodes = new Map();
        this.codeHistory = [];
    }

    /**
     * Generate a new pairing code
     */
    async generatePairingCode(phoneNumber = null) {
        try {
            const code = this.generateCode();
            const timestamp = Date.now();
            const expiresAt = timestamp + this.options.expiryTime;
            
            const pairingData = {
                code,
                phoneNumber,
                generated: timestamp,
                expires: expiresAt,
                used: false,
                attempts: 0,
                id: crypto.randomUUID()
            };
            
            this.activeCodes.set(code, pairingData);
            this.codeHistory.push({ ...pairingData });
            
            // Clean up expired codes
            this.cleanupExpiredCodes();
            
            return pairingData;
        } catch (error) {
            throw new Error(`Failed to generate pairing code: ${error.message}`);
        }
    }

    /**
     * Generate random code string
     */
    generateCode() {
        let code = '';
        const chars = this.options.allowedChars;
        
        for (let i = 0; i < this.options.codeLength; i++) {
            const randomIndex = crypto.randomInt(0, chars.length);
            code += chars[randomIndex];
        }
        
        return code;
    }

    /**
     * Validate a pairing code
     */
    validatePairingCode(code) {
        try {
            if (!code || typeof code !== 'string') {
                return { valid: false, error: 'Invalid code format' };
            }

            const normalizedCode = code.toUpperCase().replace(/\s/g, '');
            const pairingData = this.activeCodes.get(normalizedCode);
            
            if (!pairingData) {
                return { valid: false, error: 'Code not found' };
            }
            
            // Check if expired
            if (Date.now() > pairingData.expires) {
                this.activeCodes.delete(normalizedCode);
                return { valid: false, error: 'Code expired' };
            }
            
            // Check if already used
            if (pairingData.used) {
                return { valid: false, error: 'Code already used' };
            }
            
            // Increment attempts
            pairingData.attempts++;
            
            return {
                valid: true,
                code: normalizedCode,
                id: pairingData.id,
                phoneNumber: pairingData.phoneNumber,
                generated: pairingData.generated,
                expires: pairingData.expires,
                attempts: pairingData.attempts
            };
        } catch (error) {
            return { valid: false, error: error.message };
        }
    }

    /**
     * Mark pairing code as used
     */
    markCodeAsUsed(code) {
        const normalizedCode = code.toUpperCase().replace(/\s/g, '');
        const pairingData = this.activeCodes.get(normalizedCode);
        
        if (pairingData) {
            pairingData.used = true;
            pairingData.usedAt = Date.now();
            return true;
        }
        
        return false;
    }

    /**
     * Revoke a pairing code
     */
    revokePairingCode(code) {
        const normalizedCode = code.toUpperCase().replace(/\s/g, '');
        return this.activeCodes.delete(normalizedCode);
    }

    /**
     * Clean up expired codes
     */
    cleanupExpiredCodes() {
        const now = Date.now();
        const expiredCodes = [];
        
        for (const [code, data] of this.activeCodes.entries()) {
            if (now > data.expires) {
                expiredCodes.push(code);
            }
        }
        
        expiredCodes.forEach(code => {
            this.activeCodes.delete(code);
        });
        
        return expiredCodes.length;
    }

    /**
     * Get active codes count
     */
    getActiveCodesCount() {
        this.cleanupExpiredCodes();
        return this.activeCodes.size;
    }

    /**
     * Get code information
     */
    getCodeInfo(code) {
        const normalizedCode = code.toUpperCase().replace(/\s/g, '');
        const pairingData = this.activeCodes.get(normalizedCode);
        
        if (!pairingData) {
            return null;
        }
        
        return {
            code: normalizedCode,
            id: pairingData.id,
            phoneNumber: pairingData.phoneNumber,
            generated: pairingData.generated,
            expires: pairingData.expires,
            used: pairingData.used,
            attempts: pairingData.attempts,
            timeRemaining: Math.max(0, pairingData.expires - Date.now()),
            isExpired: Date.now() > pairingData.expires
        };
    }

    /**
     * Get all active codes (for admin purposes)
     */
    getAllActiveCodes() {
        this.cleanupExpiredCodes();
        const codes = [];
        
        for (const [code, data] of this.activeCodes.entries()) {
            codes.push({
                code,
                id: data.id,
                phoneNumber: data.phoneNumber,
                generated: data.generated,
                expires: data.expires,
                used: data.used,
                attempts: data.attempts,
                timeRemaining: Math.max(0, data.expires - Date.now())
            });
        }
        
        return codes;
    }

    /**
     * Get pairing code statistics
     */
    getStatistics() {
        this.cleanupExpiredCodes();
        
        const total = this.codeHistory.length;
        const active = this.activeCodes.size;
        const used = this.codeHistory.filter(c => c.used).length;
        const expired = this.codeHistory.filter(c => Date.now() > c.expires && !c.used).length;
        
        return {
            total,
            active,
            used,
            expired,
            successRate: total > 0 ? (used / total * 100).toFixed(2) + '%' : '0%'
        };
    }

    /**
     * Clear all codes
     */
    clearAllCodes() {
        const count = this.activeCodes.size;
        this.activeCodes.clear();
        return count;
    }

    /**
     * Format code for display
     */
    formatCodeForDisplay(code) {
        if (!code || code.length !== this.options.codeLength) {
            return code;
        }
        
        // Format as XXXX-XXXX for 8 character codes
        if (this.options.codeLength === 8) {
            return `${code.slice(0, 4)}-${code.slice(4)}`;
        }
        
        return code;
    }

    /**
     * Generate QR-compatible pairing data
     */
    generateQRPairingData(code) {
        const pairingData = this.activeCodes.get(code);
        if (!pairingData) {
            throw new Error('Pairing code not found');
        }
        
        return {
            type: 'pairing',
            code: code,
            id: pairingData.id,
            expires: pairingData.expires,
            timestamp: Date.now()
        };
    }
}

module.exports = WAPairingCode;
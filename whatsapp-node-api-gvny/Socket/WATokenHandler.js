const crypto = require('crypto');

/**
 * WhatsApp Token Handler
 * Manages authentication tokens and session tokens
 */
class WATokenHandler {
    constructor(options = {}) {
        this.options = {
            tokenExpiry: 24 * 60 * 60 * 1000, // 24 hours
            refreshThreshold: 2 * 60 * 60 * 1000, // 2 hours before expiry
            ...options
        };
        
        this.tokens = new Map();
        this.refreshTokens = new Map();
    }

    /**
     * Generate access token
     */
    generateAccessToken(userId, sessionId, payload = {}) {
        const timestamp = Date.now();
        const expiresAt = timestamp + this.options.tokenExpiry;
        
        const tokenData = {
            userId,
            sessionId,
            timestamp,
            expiresAt,
            ...payload
        };
        
        const token = this.encodeToken(tokenData);
        this.tokens.set(token, tokenData);
        
        return {
            accessToken: token,
            expiresAt,
            expiresIn: this.options.tokenExpiry
        };
    }

    /**
     * Generate refresh token
     */
    generateRefreshToken(userId, sessionId) {
        const timestamp = Date.now();
        const refreshToken = crypto.randomBytes(32).toString('base64');
        
        const tokenData = {
            userId,
            sessionId,
            timestamp,
            type: 'refresh'
        };
        
        this.refreshTokens.set(refreshToken, tokenData);
        
        return refreshToken;
    }

    /**
     * Encode token data
     */
    encodeToken(data) {
        const payload = Buffer.from(JSON.stringify(data)).toString('base64');
        const signature = crypto.createHmac('sha256', 'token_secret').update(payload).digest('base64');
        
        return `${payload}.${signature}`;
    }

    /**
     * Decode and verify token
     */
    decodeToken(token) {
        try {
            const [payload, signature] = token.split('.');
            if (!payload || !signature) {
                return { valid: false, error: 'Invalid token format' };
            }
            
            // Verify signature
            const expectedSignature = crypto.createHmac('sha256', 'token_secret').update(payload).digest('base64');
            if (signature !== expectedSignature) {
                return { valid: false, error: 'Invalid token signature' };
            }
            
            // Decode payload
            const data = JSON.parse(Buffer.from(payload, 'base64').toString());
            
            // Check expiry
            if (Date.now() > data.expiresAt) {
                return { valid: false, error: 'Token expired' };
            }
            
            return { valid: true, data };
        } catch (error) {
            return { valid: false, error: error.message };
        }
    }

    /**
     * Validate access token
     */
    validateAccessToken(token) {
        const decoded = this.decodeToken(token);
        if (!decoded.valid) {
            return decoded;
        }
        
        const tokenData = this.tokens.get(token);
        if (!tokenData) {
            return { valid: false, error: 'Token not found' };
        }
        
        return { valid: true, data: decoded.data };
    }

    /**
     * Refresh access token
     */
    refreshAccessToken(refreshToken) {
        const tokenData = this.refreshTokens.get(refreshToken);
        if (!tokenData) {
            return { valid: false, error: 'Invalid refresh token' };
        }
        
        // Generate new access token
        const newToken = this.generateAccessToken(tokenData.userId, tokenData.sessionId);
        
        return {
            valid: true,
            ...newToken
        };
    }

    /**
     * Revoke token
     */
    revokeToken(token) {
        return this.tokens.delete(token);
    }

    /**
     * Revoke refresh token
     */
    revokeRefreshToken(refreshToken) {
        return this.refreshTokens.delete(refreshToken);
    }

    /**
     * Check if token needs refresh
     */
    needsRefresh(token) {
        const decoded = this.decodeToken(token);
        if (!decoded.valid) {
            return true;
        }
        
        const timeUntilExpiry = decoded.data.expiresAt - Date.now();
        return timeUntilExpiry < this.options.refreshThreshold;
    }

    /**
     * Get token statistics
     */
    getStatistics() {
        return {
            activeTokens: this.tokens.size,
            refreshTokens: this.refreshTokens.size,
            tokenExpiry: this.options.tokenExpiry,
            refreshThreshold: this.options.refreshThreshold
        };
    }

    /**
     * Cleanup expired tokens
     */
    cleanupExpiredTokens() {
        const now = Date.now();
        let cleanedCount = 0;
        
        for (const [token, data] of this.tokens.entries()) {
            if (now > data.expiresAt) {
                this.tokens.delete(token);
                cleanedCount++;
            }
        }
        
        return cleanedCount;
    }
}

module.exports = WATokenHandler;
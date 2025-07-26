const crypto = require('crypto');

/**
 * WhatsApp Authentication Validator
 * Handles validation of authentication credentials and tokens
 */
class WAAuthValidator {
    constructor(options = {}) {
        this.options = {
            tokenExpiry: options.tokenExpiry || 3600000, // 1 hour
            maxLoginAttempts: options.maxLoginAttempts || 5,
            lockoutDuration: options.lockoutDuration || 900000, // 15 minutes
            enableBruteForceProtection: options.enableBruteForceProtection !== false,
            ...options
        };

        // Tracking failed attempts
        this.failedAttempts = new Map();
        this.lockedAccounts = new Map();
    }

    // Validate credentials format
    validateCredentials(credentials) {
        const errors = [];

        if (!credentials) {
            errors.push('Credentials are required');
            return { valid: false, errors };
        }

        // Check required fields
        if (!credentials.noiseKey) {
            errors.push('Noise key is required');
        } else if (!this.isValidKey(credentials.noiseKey)) {
            errors.push('Invalid noise key format');
        }

        if (!credentials.signedIdentityKey) {
            errors.push('Signed identity key is required');
        } else if (!this.isValidSignedKey(credentials.signedIdentityKey)) {
            errors.push('Invalid signed identity key format');
        }

        if (!credentials.signedPreKey) {
            errors.push('Signed pre key is required');
        } else if (!this.isValidSignedKey(credentials.signedPreKey)) {
            errors.push('Invalid signed pre key format');
        }

        if (!credentials.registrationId) {
            errors.push('Registration ID is required');
        } else if (!this.isValidRegistrationId(credentials.registrationId)) {
            errors.push('Invalid registration ID');
        }

        if (!credentials.advSecretKey) {
            errors.push('Advertisement secret key is required');
        } else if (!this.isValidKey(credentials.advSecretKey)) {
            errors.push('Invalid advertisement secret key format');
        }

        return {
            valid: errors.length === 0,
            errors: errors
        };
    }

    // Validate key format
    isValidKey(key) {
        if (!key || typeof key !== 'string') return false;
        
        // Check if it's a valid base64 string
        try {
            const buffer = Buffer.from(key, 'base64');
            return buffer.length === 32; // Expected key length
        } catch {
            return false;
        }
    }

    // Validate signed key format
    isValidSignedKey(signedKey) {
        if (!signedKey || typeof signedKey !== 'object') return false;

        return (
            signedKey.keyPair &&
            signedKey.signature &&
            signedKey.keyId &&
            this.isValidKey(signedKey.keyPair.private) &&
            this.isValidKey(signedKey.keyPair.public) &&
            typeof signedKey.signature === 'string' &&
            typeof signedKey.keyId === 'number'
        );
    }

    // Validate registration ID
    isValidRegistrationId(registrationId) {
        return (
            typeof registrationId === 'number' &&
            registrationId > 0 &&
            registrationId <= 16777215 // Max 24-bit value
        );
    }

    // Validate session token
    validateSessionToken(token) {
        if (!token || typeof token !== 'string') {
            return { valid: false, error: 'Invalid token format' };
        }

        try {
            // Decode token (assuming it's base64 encoded JSON)
            const decoded = JSON.parse(Buffer.from(token, 'base64').toString());

            if (!decoded.userId || !decoded.sessionId || !decoded.timestamp || !decoded.signature) {
                return { valid: false, error: 'Token missing required fields' };
            }

            // Check if token is expired
            const now = Date.now();
            if (now - decoded.timestamp > this.options.tokenExpiry) {
                return { valid: false, error: 'Token expired' };
            }

            // Verify signature (simplified)
            const expectedSignature = this.generateTokenSignature(decoded.userId, decoded.sessionId, decoded.timestamp);
            if (decoded.signature !== expectedSignature) {
                return { valid: false, error: 'Invalid token signature' };
            }

            return {
                valid: true,
                userId: decoded.userId,
                sessionId: decoded.sessionId,
                timestamp: decoded.timestamp
            };
        } catch (error) {
            return { valid: false, error: 'Token parsing failed' };
        }
    }

    // Generate token signature
    generateTokenSignature(userId, sessionId, timestamp) {
        const data = `${userId}:${sessionId}:${timestamp}`;
        return crypto.createHash('sha256').update(data).digest('hex');
    }

    // Validate QR code data
    validateQRCode(qrData) {
        if (!qrData || typeof qrData !== 'string') {
            return { valid: false, error: 'Invalid QR code format' };
        }

        try {
            // QR code should be comma-separated values
            const parts = qrData.split(',');
            if (parts.length !== 4) {
                return { valid: false, error: 'QR code should have 4 parts' };
            }

            const [ref, publicKey, identityKey, advId] = parts;

            if (!ref || !publicKey || !identityKey || !advId) {
                return { valid: false, error: 'QR code missing required parts' };
            }

            // Validate base64 encoding
            try {
                Buffer.from(publicKey, 'base64');
                Buffer.from(identityKey, 'base64');
            } catch {
                return { valid: false, error: 'Invalid base64 encoding in QR code' };
            }

            return {
                valid: true,
                ref: ref,
                publicKey: publicKey,
                identityKey: identityKey,
                advId: advId
            };
        } catch (error) {
            return { valid: false, error: 'QR code parsing failed' };
        }
    }

    // Validate pairing code
    validatePairingCode(code) {
        if (!code || typeof code !== 'string') {
            return { valid: false, error: 'Invalid pairing code format' };
        }

        // Pairing code should be 8 characters, alphanumeric
        const pairingRegex = /^[A-Z0-9]{8}$/;
        if (!pairingRegex.test(code)) {
            return { valid: false, error: 'Pairing code should be 8 alphanumeric characters' };
        }

        return { valid: true, code: code };
    }

    // Brute force protection
    checkBruteForce(identifier) {
        if (!this.options.enableBruteForceProtection) {
            return { allowed: true };
        }

        const now = Date.now();

        // Check if account is locked
        if (this.lockedAccounts.has(identifier)) {
            const lockTime = this.lockedAccounts.get(identifier);
            if (now - lockTime < this.options.lockoutDuration) {
                const remainingTime = Math.ceil((this.options.lockoutDuration - (now - lockTime)) / 1000);
                return {
                    allowed: false,
                    error: `Account locked. Try again in ${remainingTime} seconds`
                };
            } else {
                // Lock expired, remove it
                this.lockedAccounts.delete(identifier);
                this.failedAttempts.delete(identifier);
            }
        }

        return { allowed: true };
    }

    // Record failed attempt
    recordFailedAttempt(identifier) {
        if (!this.options.enableBruteForceProtection) return;

        const now = Date.now();
        const attempts = this.failedAttempts.get(identifier) || [];
        
        // Add new attempt
        attempts.push(now);
        
        // Remove attempts older than lockout duration
        const validAttempts = attempts.filter(time => now - time < this.options.lockoutDuration);
        
        this.failedAttempts.set(identifier, validAttempts);

        // Check if max attempts reached
        if (validAttempts.length >= this.options.maxLoginAttempts) {
            this.lockedAccounts.set(identifier, now);
        }
    }

    // Clear failed attempts on successful login
    clearFailedAttempts(identifier) {
        this.failedAttempts.delete(identifier);
        this.lockedAccounts.delete(identifier);
    }

    // Validate phone number for registration
    validatePhoneNumber(phoneNumber) {
        if (!phoneNumber || typeof phoneNumber !== 'string') {
            return { valid: false, error: 'Phone number is required' };
        }

        // Remove all non-digit characters except +
        let cleaned = phoneNumber.replace(/[^\d+]/g, '');

        // Remove leading + if present
        if (cleaned.startsWith('+')) {
            cleaned = cleaned.substring(1);
        }

        // Validate length (7-15 digits as per E.164)
        if (cleaned.length < 7 || cleaned.length > 15) {
            return { valid: false, error: 'Phone number must be 7-15 digits' };
        }

        // Check if it's all digits
        if (!/^\d+$/.test(cleaned)) {
            return { valid: false, error: 'Phone number must contain only digits' };
        }

        return {
            valid: true,
            phoneNumber: cleaned,
            formatted: `+${cleaned}`
        };
    }

    // Validate verification code
    validateVerificationCode(code) {
        if (!code || typeof code !== 'string') {
            return { valid: false, error: 'Verification code is required' };
        }

        // Remove any non-digit characters
        const cleaned = code.replace(/\D/g, '');

        // Verification code should be 6 digits
        if (cleaned.length !== 6) {
            return { valid: false, error: 'Verification code must be 6 digits' };
        }

        return { valid: true, code: cleaned };
    }

    // Validate device info
    validateDeviceInfo(deviceInfo) {
        const errors = [];

        if (!deviceInfo) {
            errors.push('Device info is required');
            return { valid: false, errors };
        }

        if (!deviceInfo.platform || typeof deviceInfo.platform !== 'string') {
            errors.push('Device platform is required');
        }

        if (!deviceInfo.version || typeof deviceInfo.version !== 'string') {
            errors.push('Device version is required');
        }

        if (!deviceInfo.manufacturer || typeof deviceInfo.manufacturer !== 'string') {
            errors.push('Device manufacturer is required');
        }

        if (!deviceInfo.model || typeof deviceInfo.model !== 'string') {
            errors.push('Device model is required');
        }

        return {
            valid: errors.length === 0,
            errors: errors
        };
    }

    // Generate secure session token
    generateSessionToken(userId, sessionId) {
        const timestamp = Date.now();
        const signature = this.generateTokenSignature(userId, sessionId, timestamp);

        const tokenData = {
            userId: userId,
            sessionId: sessionId,
            timestamp: timestamp,
            signature: signature
        };

        return Buffer.from(JSON.stringify(tokenData)).toString('base64');
    }

    // Validate authentication state
    validateAuthState(authState) {
        const errors = [];

        if (!authState) {
            errors.push('Auth state is required');
            return { valid: false, errors };
        }

        if (!authState.creds) {
            errors.push('Credentials are missing from auth state');
        } else {
            const credsValidation = this.validateCredentials(authState.creds);
            if (!credsValidation.valid) {
                errors.push(...credsValidation.errors);
            }
        }

        if (!authState.keys) {
            errors.push('Keys are missing from auth state');
        }

        return {
            valid: errors.length === 0,
            errors: errors
        };
    }

    // Clean up expired data
    cleanup() {
        const now = Date.now();

        // Clean up expired failed attempts
        for (const [identifier, attempts] of this.failedAttempts.entries()) {
            const validAttempts = attempts.filter(time => now - time < this.options.lockoutDuration);
            if (validAttempts.length === 0) {
                this.failedAttempts.delete(identifier);
            } else {
                this.failedAttempts.set(identifier, validAttempts);
            }
        }

        // Clean up expired locks
        for (const [identifier, lockTime] of this.lockedAccounts.entries()) {
            if (now - lockTime >= this.options.lockoutDuration) {
                this.lockedAccounts.delete(identifier);
            }
        }
    }

    // Get validation statistics
    getStats() {
        return {
            failedAttempts: this.failedAttempts.size,
            lockedAccounts: this.lockedAccounts.size,
            options: this.options
        };
    }
}

module.exports = WAAuthValidator;
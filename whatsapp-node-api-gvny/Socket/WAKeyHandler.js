const crypto = require('crypto');
const { Buffer } = require('buffer');

/**
 * WhatsApp Key Handler
 * Manages cryptographic keys for WhatsApp protocol
 */
class WAKeyHandler {
    constructor(options = {}) {
        this.options = {
            keySize: 32,
            preKeyCount: 100,
            signedPreKeyLifetime: 7 * 24 * 60 * 60 * 1000, // 7 days
            ...options
        };
        
        this.identityKeyPair = null;
        this.signedPreKey = null;
        this.preKeys = new Map();
        this.registrationId = null;
        this.isInitialized = false;
    }

    /**
     * Initialize key handler
     */
    async initialize() {
        try {
            this.generateIdentityKeyPair();
            this.generateRegistrationId();
            this.generateSignedPreKey();
            this.generatePreKeys();
            this.isInitialized = true;
            return true;
        } catch (error) {
            throw new Error(`Failed to initialize key handler: ${error.message}`);
        }
    }

    /**
     * Generate identity key pair
     */
    generateIdentityKeyPair() {
        const privateKey = crypto.randomBytes(32);
        const publicKey = this.generatePublicKey(privateKey);
        
        this.identityKeyPair = {
            privateKey,
            publicKey
        };
        
        return this.identityKeyPair;
    }

    /**
     * Generate public key from private key
     */
    generatePublicKey(privateKey) {
        // Simplified implementation - use proper curve25519 in production
        return crypto.createHmac('sha256', privateKey)
            .update('curve25519_base_point')
            .digest();
    }

    /**
     * Generate registration ID
     */
    generateRegistrationId() {
        this.registrationId = crypto.randomInt(1, 16383); // 14-bit number
        return this.registrationId;
    }

    /**
     * Generate signed pre key
     */
    generateSignedPreKey() {
        const keyId = crypto.randomInt(1, 0xFFFFFF);
        const privateKey = crypto.randomBytes(32);
        const publicKey = this.generatePublicKey(privateKey);
        
        // Sign the public key with identity private key
        const signature = this.signKey(publicKey, this.identityKeyPair.privateKey);
        
        this.signedPreKey = {
            keyId,
            privateKey,
            publicKey,
            signature,
            timestamp: Date.now()
        };
        
        return this.signedPreKey;
    }

    /**
     * Generate pre keys
     */
    generatePreKeys() {
        this.preKeys.clear();
        
        for (let i = 0; i < this.options.preKeyCount; i++) {
            const keyId = crypto.randomInt(1, 0xFFFFFF);
            const privateKey = crypto.randomBytes(32);
            const publicKey = this.generatePublicKey(privateKey);
            
            this.preKeys.set(keyId, {
                keyId,
                privateKey,
                publicKey
            });
        }
        
        return Array.from(this.preKeys.values());
    }

    /**
     * Sign a key with private key
     */
    signKey(keyToSign, privateKey) {
        return crypto.createHmac('sha256', privateKey)
            .update(keyToSign)
            .digest();
    }

    /**
     * Verify key signature
     */
    verifyKeySignature(key, signature, publicKey) {
        const expectedSignature = crypto.createHmac('sha256', publicKey)
            .update(key)
            .digest();
        
        return crypto.timingSafeEqual(signature, expectedSignature);
    }

    /**
     * Get identity key pair
     */
    getIdentityKeyPair() {
        if (!this.identityKeyPair) {
            throw new Error('Identity key pair not generated');
        }
        return this.identityKeyPair;
    }

    /**
     * Get signed pre key
     */
    getSignedPreKey() {
        if (!this.signedPreKey) {
            throw new Error('Signed pre key not generated');
        }
        return this.signedPreKey;
    }

    /**
     * Get pre key by ID
     */
    getPreKey(keyId) {
        return this.preKeys.get(keyId);
    }

    /**
     * Get all pre keys
     */
    getAllPreKeys() {
        return Array.from(this.preKeys.values());
    }

    /**
     * Remove pre key
     */
    removePreKey(keyId) {
        return this.preKeys.delete(keyId);
    }

    /**
     * Get registration ID
     */
    getRegistrationId() {
        if (!this.registrationId) {
            throw new Error('Registration ID not generated');
        }
        return this.registrationId;
    }

    /**
     * Generate key bundle for registration
     */
    generateKeyBundle() {
        if (!this.isInitialized) {
            throw new Error('Key handler not initialized');
        }
        
        const preKeyList = Array.from(this.preKeys.values())
            .slice(0, 10) // Send first 10 pre keys
            .map(preKey => ({
                keyId: preKey.keyId,
                publicKey: preKey.publicKey.toString('base64')
            }));
        
        return {
            registrationId: this.registrationId,
            identityKey: this.identityKeyPair.publicKey.toString('base64'),
            signedPreKey: {
                keyId: this.signedPreKey.keyId,
                publicKey: this.signedPreKey.publicKey.toString('base64'),
                signature: this.signedPreKey.signature.toString('base64')
            },
            preKeys: preKeyList
        };
    }

    /**
     * Refresh signed pre key if expired
     */
    refreshSignedPreKeyIfNeeded() {
        if (!this.signedPreKey) {
            return this.generateSignedPreKey();
        }
        
        const age = Date.now() - this.signedPreKey.timestamp;
        if (age > this.options.signedPreKeyLifetime) {
            return this.generateSignedPreKey();
        }
        
        return this.signedPreKey;
    }

    /**
     * Generate additional pre keys
     */
    generateAdditionalPreKeys(count = 50) {
        const newPreKeys = [];
        
        for (let i = 0; i < count; i++) {
            const keyId = crypto.randomInt(1, 0xFFFFFF);
            // Ensure unique key ID
            if (this.preKeys.has(keyId)) {
                i--;
                continue;
            }
            
            const privateKey = crypto.randomBytes(32);
            const publicKey = this.generatePublicKey(privateKey);
            
            const preKey = {
                keyId,
                privateKey,
                publicKey
            };
            
            this.preKeys.set(keyId, preKey);
            newPreKeys.push(preKey);
        }
        
        return newPreKeys;
    }

    /**
     * Export keys for storage
     */
    exportKeys() {
        if (!this.isInitialized) {
            throw new Error('Key handler not initialized');
        }
        
        return {
            identityKeyPair: {
                privateKey: this.identityKeyPair.privateKey.toString('base64'),
                publicKey: this.identityKeyPair.publicKey.toString('base64')
            },
            signedPreKey: {
                keyId: this.signedPreKey.keyId,
                privateKey: this.signedPreKey.privateKey.toString('base64'),
                publicKey: this.signedPreKey.publicKey.toString('base64'),
                signature: this.signedPreKey.signature.toString('base64'),
                timestamp: this.signedPreKey.timestamp
            },
            preKeys: Array.from(this.preKeys.entries()).map(([keyId, preKey]) => ({
                keyId,
                privateKey: preKey.privateKey.toString('base64'),
                publicKey: preKey.publicKey.toString('base64')
            })),
            registrationId: this.registrationId
        };
    }

    /**
     * Import keys from storage
     */
    importKeys(keyData) {
        try {
            this.identityKeyPair = {
                privateKey: Buffer.from(keyData.identityKeyPair.privateKey, 'base64'),
                publicKey: Buffer.from(keyData.identityKeyPair.publicKey, 'base64')
            };
            
            this.signedPreKey = {
                keyId: keyData.signedPreKey.keyId,
                privateKey: Buffer.from(keyData.signedPreKey.privateKey, 'base64'),
                publicKey: Buffer.from(keyData.signedPreKey.publicKey, 'base64'),
                signature: Buffer.from(keyData.signedPreKey.signature, 'base64'),
                timestamp: keyData.signedPreKey.timestamp
            };
            
            this.preKeys.clear();
            keyData.preKeys.forEach(preKey => {
                this.preKeys.set(preKey.keyId, {
                    keyId: preKey.keyId,
                    privateKey: Buffer.from(preKey.privateKey, 'base64'),
                    publicKey: Buffer.from(preKey.publicKey, 'base64')
                });
            });
            
            this.registrationId = keyData.registrationId;
            this.isInitialized = true;
            
            return true;
        } catch (error) {
            throw new Error(`Failed to import keys: ${error.message}`);
        }
    }

    /**
     * Get key handler statistics
     */
    getStats() {
        return {
            isInitialized: this.isInitialized,
            hasIdentityKeyPair: !!this.identityKeyPair,
            hasSignedPreKey: !!this.signedPreKey,
            preKeyCount: this.preKeys.size,
            registrationId: this.registrationId,
            signedPreKeyAge: this.signedPreKey ? Date.now() - this.signedPreKey.timestamp : 0
        };
    }
}

module.exports = WAKeyHandler;
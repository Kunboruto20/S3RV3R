const crypto = require('crypto');
const { Buffer } = require('buffer');

class WAKeyHelper {
    constructor() {
        this.keyCache = new Map();
        this.maxCacheSize = 1000;
        this.keyExpirationTime = 24 * 60 * 60 * 1000; // 24 hours
    }
    
    // Generate identity key pair
    async generateIdentityKeyPair() {
        try {
            const keyPair = crypto.generateKeyPairSync('x25519');
            
            const privateKey = keyPair.privateKey.export({ 
                type: 'pkcs8', 
                format: 'der' 
            });
            
            const publicKey = keyPair.publicKey.export({ 
                type: 'spki', 
                format: 'der' 
            });
            
            return {
                privKey: privateKey,
                pubKey: publicKey
            };
        } catch (error) {
            throw new Error(`Identity key pair generation failed: ${error.message}`);
        }
    }
    
    // Generate registration ID
    generateRegistrationId() {
        return crypto.randomInt(1, 16384);
    }
    
    // Generate pre-keys
    async generatePreKeys(startId, count) {
        const preKeys = [];
        
        for (let i = 0; i < count; i++) {
            const keyId = startId + i;
            const keyPair = await this.generateKeyPair();
            
            preKeys.push({
                keyId,
                keyPair
            });
        }
        
        return preKeys;
    }
    
    // Generate signed pre-key
    async generateSignedPreKey(identityKeyPair, keyId) {
        try {
            const keyPair = await this.generateKeyPair();
            
            // Create signature
            const signature = this.signKey(keyPair.pubKey, identityKeyPair.privKey);
            
            return {
                keyId,
                keyPair,
                signature
            };
        } catch (error) {
            throw new Error(`Signed pre-key generation failed: ${error.message}`);
        }
    }
    
    // Generate basic key pair
    async generateKeyPair() {
        try {
            const keyPair = crypto.generateKeyPairSync('x25519');
            
            const privateKey = keyPair.privateKey.export({ 
                type: 'pkcs8', 
                format: 'der' 
            });
            
            const publicKey = keyPair.publicKey.export({ 
                type: 'spki', 
                format: 'der' 
            });
            
            return {
                privKey: privateKey,
                pubKey: publicKey
            };
        } catch (error) {
            throw new Error(`Key pair generation failed: ${error.message}`);
        }
    }
    
    // Generate sender key
    generateSenderKey() {
        return crypto.randomBytes(32);
    }
    
    // Generate sender key ID
    generateSenderKeyId() {
        return crypto.randomInt(0, 2147483647);
    }
    
    // Generate chain key
    generateChainKey() {
        return crypto.randomBytes(32);
    }
    
    // Generate message key
    generateMessageKey() {
        return crypto.randomBytes(32);
    }
    
    // Generate root key
    generateRootKey() {
        return crypto.randomBytes(32);
    }
    
    // Generate session ID
    generateSessionId() {
        return crypto.randomBytes(16).toString('hex');
    }
    
    // Generate device ID
    generateDeviceId() {
        return crypto.randomInt(1, 2147483647);
    }
    
    // Sign key with identity key
    signKey(publicKey, identityPrivateKey) {
        try {
            const privateKeyObj = crypto.createPrivateKey({
                key: identityPrivateKey,
                type: 'pkcs8',
                format: 'der'
            });
            
            const signature = crypto.sign('sha256', publicKey, privateKeyObj);
            return signature;
        } catch (error) {
            throw new Error(`Key signing failed: ${error.message}`);
        }
    }
    
    // Verify key signature
    verifyKeySignature(publicKey, signature, identityPublicKey) {
        try {
            const publicKeyObj = crypto.createPublicKey({
                key: identityPublicKey,
                type: 'spki',
                format: 'der'
            });
            
            return crypto.verify('sha256', publicKey, publicKeyObj, signature);
        } catch (error) {
            return false;
        }
    }
    
    // Derive shared secret
    deriveSharedSecret(privateKey, publicKey) {
        try {
            const privKeyObj = crypto.createPrivateKey({
                key: privateKey,
                type: 'pkcs8',
                format: 'der'
            });
            
            const pubKeyObj = crypto.createPublicKey({
                key: publicKey,
                type: 'spki',
                format: 'der'
            });
            
            return crypto.diffieHellman({
                privateKey: privKeyObj,
                publicKey: pubKeyObj
            });
        } catch (error) {
            throw new Error(`Shared secret derivation failed: ${error.message}`);
        }
    }
    
    // HKDF key derivation
    hkdf(inputKeyMaterial, salt, info, length) {
        try {
            // HKDF Extract
            const prk = crypto.createHmac('sha256', salt).update(inputKeyMaterial).digest();
            
            // HKDF Expand
            const hashLength = 32; // SHA-256 output length
            const n = Math.ceil(length / hashLength);
            
            let t = Buffer.alloc(0);
            let okm = Buffer.alloc(0);
            
            for (let i = 1; i <= n; i++) {
                const hmac = crypto.createHmac('sha256', prk);
                hmac.update(t);
                hmac.update(info);
                hmac.update(Buffer.from([i]));
                t = hmac.digest();
                okm = Buffer.concat([okm, t]);
            }
            
            return okm.slice(0, length);
        } catch (error) {
            throw new Error(`HKDF derivation failed: ${error.message}`);
        }
    }
    
    // Derive encryption keys
    deriveEncryptionKeys(sharedSecret, salt) {
        const info = Buffer.from('WhatsApp Encryption Keys');
        const derivedKeys = this.hkdf(sharedSecret, salt, info, 96); // 32 + 32 + 32
        
        return {
            encryptionKey: derivedKeys.slice(0, 32),
            macKey: derivedKeys.slice(32, 64),
            iv: derivedKeys.slice(64, 96)
        };
    }
    
    // Derive message keys
    deriveMessageKeys(chainKey) {
        const messageKeyInfo = Buffer.from('WhatsApp Message Keys');
        const messageKey = this.hkdf(chainKey, Buffer.alloc(32), messageKeyInfo, 80);
        
        return {
            cipherKey: messageKey.slice(0, 32),
            macKey: messageKey.slice(32, 64),
            iv: messageKey.slice(64, 80)
        };
    }
    
    // Derive next chain key
    deriveNextChainKey(chainKey) {
        const nextChainInfo = Buffer.from('WhatsApp Chain Key');
        return this.hkdf(chainKey, Buffer.alloc(32), nextChainInfo, 32);
    }
    
    // Generate media key
    generateMediaKey() {
        return crypto.randomBytes(32);
    }
    
    // Derive media keys
    deriveMediaKeys(mediaKey) {
        const encInfo = Buffer.from('WhatsApp Media Keys');
        const macInfo = Buffer.from('WhatsApp Media MAC');
        const ivInfo = Buffer.from('WhatsApp Media IV');
        
        return {
            cipherKey: this.hkdf(mediaKey, Buffer.alloc(32), encInfo, 32),
            macKey: this.hkdf(mediaKey, Buffer.alloc(32), macInfo, 32),
            iv: this.hkdf(mediaKey, Buffer.alloc(32), ivInfo, 16)
        };
    }
    
    // Generate noise keys
    generateNoiseKeys() {
        return {
            staticKeyPair: this.generateKeyPair(),
            ephemeralKeyPair: this.generateKeyPair()
        };
    }
    
    // Generate handshake hash
    generateHandshakeHash(data) {
        return crypto.createHash('sha256').update(data).digest();
    }
    
    // Generate key fingerprint
    generateKeyFingerprint(publicKey) {
        return crypto.createHash('sha256').update(publicKey).digest().slice(0, 8);
    }
    
    // Validate key format
    validateKeyFormat(key, keyType = 'public') {
        try {
            if (keyType === 'public') {
                crypto.createPublicKey({
                    key,
                    type: 'spki',
                    format: 'der'
                });
            } else if (keyType === 'private') {
                crypto.createPrivateKey({
                    key,
                    type: 'pkcs8',
                    format: 'der'
                });
            }
            return true;
        } catch (error) {
            return false;
        }
    }
    
    // Key serialization
    serializePublicKey(publicKey) {
        return publicKey.toString('base64');
    }
    
    deserializePublicKey(serializedKey) {
        return Buffer.from(serializedKey, 'base64');
    }
    
    serializePrivateKey(privateKey) {
        return privateKey.toString('base64');
    }
    
    deserializePrivateKey(serializedKey) {
        return Buffer.from(serializedKey, 'base64');
    }
    
    // Key comparison
    compareKeys(key1, key2) {
        if (!Buffer.isBuffer(key1)) key1 = Buffer.from(key1);
        if (!Buffer.isBuffer(key2)) key2 = Buffer.from(key2);
        
        return key1.equals(key2);
    }
    
    // Key caching
    cacheKey(keyId, key, expirationTime = null) {
        const expiration = expirationTime || Date.now() + this.keyExpirationTime;
        
        this.keyCache.set(keyId, {
            key,
            expiration
        });
        
        // Cleanup old entries if cache is full
        if (this.keyCache.size > this.maxCacheSize) {
            this.cleanupKeyCache();
        }
    }
    
    getCachedKey(keyId) {
        const cached = this.keyCache.get(keyId);
        
        if (!cached) {
            return null;
        }
        
        if (Date.now() > cached.expiration) {
            this.keyCache.delete(keyId);
            return null;
        }
        
        return cached.key;
    }
    
    cleanupKeyCache() {
        const now = Date.now();
        const toDelete = [];
        
        for (const [keyId, cached] of this.keyCache) {
            if (now > cached.expiration) {
                toDelete.push(keyId);
            }
        }
        
        toDelete.forEach(keyId => this.keyCache.delete(keyId));
        
        // If still too large, remove oldest entries
        if (this.keyCache.size > this.maxCacheSize) {
            const entries = Array.from(this.keyCache.entries());
            entries.sort((a, b) => a[1].expiration - b[1].expiration);
            
            const toRemove = entries.slice(0, this.keyCache.size - this.maxCacheSize);
            toRemove.forEach(([keyId]) => this.keyCache.delete(keyId));
        }
    }
    
    // Key rotation utilities
    shouldRotateKey(keyTimestamp, rotationInterval = 7 * 24 * 60 * 60 * 1000) {
        return Date.now() - keyTimestamp > rotationInterval;
    }
    
    generateKeyRotationSchedule(keys, rotationInterval = 7 * 24 * 60 * 60 * 1000) {
        const schedule = [];
        const now = Date.now();
        
        keys.forEach(key => {
            const nextRotation = key.timestamp + rotationInterval;
            if (nextRotation > now) {
                schedule.push({
                    keyId: key.id,
                    rotationTime: nextRotation
                });
            }
        });
        
        return schedule.sort((a, b) => a.rotationTime - b.rotationTime);
    }
    
    // Key validation
    validateKeyStrength(keyPair) {
        // Basic validation - in real implementation, this would be more comprehensive
        return keyPair.privKey.length >= 32 && keyPair.pubKey.length >= 32;
    }
    
    // Generate key bundle
    async generateKeyBundle(identityKeyPair, registrationId, deviceId) {
        const preKeys = await this.generatePreKeys(1, 100);
        const signedPreKey = await this.generateSignedPreKey(identityKeyPair, 1);
        
        return {
            registrationId,
            deviceId,
            identityKey: identityKeyPair.pubKey,
            preKeys: preKeys.map(pk => ({
                keyId: pk.keyId,
                publicKey: pk.keyPair.pubKey
            })),
            signedPreKey: {
                keyId: signedPreKey.keyId,
                publicKey: signedPreKey.keyPair.pubKey,
                signature: signedPreKey.signature
            }
        };
    }
    
    // Key backup and restore
    exportKeys(keys) {
        const exported = {};
        
        for (const [keyId, keyData] of Object.entries(keys)) {
            exported[keyId] = {
                ...keyData,
                privateKey: keyData.privateKey ? this.serializePrivateKey(keyData.privateKey) : null,
                publicKey: keyData.publicKey ? this.serializePublicKey(keyData.publicKey) : null
            };
        }
        
        return JSON.stringify(exported);
    }
    
    importKeys(exportedKeys) {
        const keys = JSON.parse(exportedKeys);
        const imported = {};
        
        for (const [keyId, keyData] of Object.entries(keys)) {
            imported[keyId] = {
                ...keyData,
                privateKey: keyData.privateKey ? this.deserializePrivateKey(keyData.privateKey) : null,
                publicKey: keyData.publicKey ? this.deserializePublicKey(keyData.publicKey) : null
            };
        }
        
        return imported;
    }
    
    // Utility methods
    generateRandomBytes(length) {
        return crypto.randomBytes(length);
    }
    
    generateSecureRandom(min, max) {
        return crypto.randomInt(min, max);
    }
    
    constantTimeCompare(a, b) {
        if (a.length !== b.length) {
            return false;
        }
        return crypto.timingSafeEqual(a, b);
    }
    
    // Key statistics
    getKeyStats() {
        return {
            cacheSize: this.keyCache.size,
            maxCacheSize: this.maxCacheSize,
            keyExpirationTime: this.keyExpirationTime
        };
    }
    
    // Cleanup
    cleanup() {
        this.keyCache.clear();
    }
}

module.exports = WAKeyHelper;
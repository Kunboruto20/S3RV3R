const crypto = require('crypto');
const { EventEmitter } = require('events');

class WAEncryption extends EventEmitter {
    constructor(options = {}) {
        super();
        this.options = options;
        
        // Encryption keys and counters
        this.encKey = null;
        this.macKey = null;
        this.writeCounter = 0;
        this.readCounter = 0;
        
        // Key derivation settings
        this.keyLength = 32;
        this.macLength = 8;
        this.ivLength = 16;
        
        // Cipher settings
        this.cipherAlgorithm = 'aes-256-cbc';
        this.hashAlgorithm = 'sha256';
        this.hmacAlgorithm = 'sha256';
        
        this.setupEncryption();
    }
    
    setupEncryption() {
        this.keyDerivationCache = new Map();
        this.encryptionCache = new Map();
        this.decryptionCache = new Map();
        
        // Initialize crypto constants
        this.constants = {
            HKDF_INFO_ENC: Buffer.from('WhatsApp Payload Encryption'),
            HKDF_INFO_MAC: Buffer.from('WhatsApp Payload Authentication'),
            HKDF_INFO_IV: Buffer.from('WhatsApp Payload IV'),
            NOISE_PROTOCOL: 'Noise_XX_25519_AESGCM_SHA256',
            WA_VERSION: [2, 2147, 10],
            PLATFORM: 'web'
        };
    }
    
    setKeys(encKey, macKey) {
        this.encKey = Buffer.isBuffer(encKey) ? encKey : Buffer.from(encKey);
        this.macKey = Buffer.isBuffer(macKey) ? macKey : Buffer.from(macKey);
        
        this.emit('keys.updated', { encKey: this.encKey, macKey: this.macKey });
    }
    
    deriveKeys(masterSecret, salt, info, length = 32) {
        const cacheKey = `${masterSecret.toString('hex')}-${salt.toString('hex')}-${info.toString('hex')}-${length}`;
        
        if (this.keyDerivationCache.has(cacheKey)) {
            return this.keyDerivationCache.get(cacheKey);
        }
        
        const derived = this.hkdf(masterSecret, salt, info, length);
        this.keyDerivationCache.set(cacheKey, derived);
        
        return derived;
    }
    
    hkdf(ikm, salt, info, length) {
        // HKDF Extract
        const prk = crypto.createHmac(this.hmacAlgorithm, salt).update(ikm).digest();
        
        // HKDF Expand
        const hashLength = crypto.createHash(this.hashAlgorithm).digest().length;
        const n = Math.ceil(length / hashLength);
        
        let t = Buffer.alloc(0);
        let okm = Buffer.alloc(0);
        
        for (let i = 1; i <= n; i++) {
            const hmac = crypto.createHmac(this.hmacAlgorithm, prk);
            hmac.update(t);
            hmac.update(info);
            hmac.update(Buffer.from([i]));
            t = hmac.digest();
            okm = Buffer.concat([okm, t]);
        }
        
        return okm.slice(0, length);
    }
    
    encrypt(plaintext, useCounter = true) {
        if (!this.encKey || !this.macKey) {
            throw new Error('Encryption keys not set');
        }
        
        const plaintextBuffer = Buffer.isBuffer(plaintext) ? plaintext : Buffer.from(plaintext);
        
        // Generate IV
        const iv = useCounter ? this.generateCounterIV() : crypto.randomBytes(this.ivLength);
        
        // Encrypt
        const cipher = crypto.createCipheriv(this.cipherAlgorithm, this.encKey, iv);
        let encrypted = cipher.update(plaintextBuffer);
        encrypted = Buffer.concat([encrypted, cipher.final()]);
        
        // Calculate MAC
        const macData = Buffer.concat([iv, encrypted]);
        const mac = this.calculateHMAC(macData, this.macKey).slice(0, this.macLength);
        
        // Increment counter
        if (useCounter) {
            this.writeCounter++;
        }
        
        return Buffer.concat([mac, iv, encrypted]);
    }
    
    decrypt(ciphertext, useCounter = true) {
        if (!this.encKey || !this.macKey) {
            throw new Error('Encryption keys not set');
        }
        
        const ciphertextBuffer = Buffer.isBuffer(ciphertext) ? ciphertext : Buffer.from(ciphertext);
        
        if (ciphertextBuffer.length < this.macLength + this.ivLength) {
            throw new Error('Ciphertext too short');
        }
        
        // Extract components
        const mac = ciphertextBuffer.slice(0, this.macLength);
        const iv = ciphertextBuffer.slice(this.macLength, this.macLength + this.ivLength);
        const encrypted = ciphertextBuffer.slice(this.macLength + this.ivLength);
        
        // Verify MAC
        const macData = Buffer.concat([iv, encrypted]);
        const expectedMac = this.calculateHMAC(macData, this.macKey).slice(0, this.macLength);
        
        if (!crypto.timingSafeEqual(mac, expectedMac)) {
            throw new Error('MAC verification failed');
        }
        
        // Decrypt
        const decipher = crypto.createDecipheriv(this.cipherAlgorithm, this.encKey, iv);
        let decrypted = decipher.update(encrypted);
        decrypted = Buffer.concat([decrypted, decipher.final()]);
        
        // Increment counter
        if (useCounter) {
            this.readCounter++;
        }
        
        return decrypted;
    }
    
    generateCounterIV() {
        const iv = Buffer.alloc(this.ivLength);
        iv.writeUInt32BE(this.writeCounter, this.ivLength - 4);
        return iv;
    }
    
    calculateHMAC(data, key) {
        return crypto.createHmac(this.hmacAlgorithm, key).update(data).digest();
    }
    
    generateKeyPair() {
        const keyPair = crypto.generateKeyPairSync('x25519');
        
        return {
            private: keyPair.privateKey.export({ type: 'pkcs8', format: 'der' }),
            public: keyPair.publicKey.export({ type: 'spki', format: 'der' })
        };
    }
    
    generateSharedSecret(privateKey, publicKey) {
        const privKey = crypto.createPrivateKey({
            key: privateKey,
            type: 'pkcs8',
            format: 'der'
        });
        
        const pubKey = crypto.createPublicKey({
            key: publicKey,
            type: 'spki',
            format: 'der'
        });
        
        return crypto.diffieHellman({
            privateKey: privKey,
            publicKey: pubKey
        });
    }
    
    hash(data, algorithm = null) {
        const hashAlg = algorithm || this.hashAlgorithm;
        return crypto.createHash(hashAlg).update(data).digest();
    }
    
    randomBytes(length) {
        return crypto.randomBytes(length);
    }
    
    sign(data, privateKey) {
        const sign = crypto.createSign('SHA256');
        sign.update(data);
        return sign.sign(privateKey);
    }
    
    verify(data, signature, publicKey) {
        const verify = crypto.createVerify('SHA256');
        verify.update(data);
        return verify.verify(publicKey, signature);
    }
    
    encryptAESGCM(plaintext, key, iv, additionalData = null) {
        const cipher = crypto.createCipherGCM('aes-256-gcm', key, iv);
        
        if (additionalData) {
            cipher.setAAD(additionalData);
        }
        
        let encrypted = cipher.update(plaintext);
        encrypted = Buffer.concat([encrypted, cipher.final()]);
        
        const authTag = cipher.getAuthTag();
        
        return { encrypted, authTag };
    }
    
    decryptAESGCM(ciphertext, key, iv, authTag, additionalData = null) {
        const decipher = crypto.createDecipherGCM('aes-256-gcm', key, iv);
        decipher.setAuthTag(authTag);
        
        if (additionalData) {
            decipher.setAAD(additionalData);
        }
        
        let decrypted = decipher.update(ciphertext);
        decrypted = Buffer.concat([decrypted, decipher.final()]);
        
        return decrypted;
    }
    
    pbkdf2(password, salt, iterations, keyLength, digest = 'sha256') {
        return crypto.pbkdf2Sync(password, salt, iterations, keyLength, digest);
    }
    
    scrypt(password, salt, keyLength, options = {}) {
        const defaultOptions = { N: 16384, r: 8, p: 1, ...options };
        return crypto.scryptSync(password, salt, keyLength, defaultOptions);
    }
    
    generateNonce(length = 12) {
        return crypto.randomBytes(length);
    }
    
    constantTimeCompare(a, b) {
        if (a.length !== b.length) {
            return false;
        }
        return crypto.timingSafeEqual(a, b);
    }
    
    encryptChaCha20Poly1305(plaintext, key, nonce, additionalData = null) {
        const cipher = crypto.createCipher('chacha20-poly1305', key);
        cipher.setAutoPadding(false);
        
        if (additionalData) {
            cipher.setAAD(additionalData);
        }
        
        let encrypted = cipher.update(plaintext);
        encrypted = Buffer.concat([encrypted, cipher.final()]);
        
        const authTag = cipher.getAuthTag();
        
        return { encrypted, authTag };
    }
    
    decryptChaCha20Poly1305(ciphertext, key, nonce, authTag, additionalData = null) {
        const decipher = crypto.createDecipher('chacha20-poly1305', key);
        decipher.setAuthTag(authTag);
        
        if (additionalData) {
            decipher.setAAD(additionalData);
        }
        
        let decrypted = decipher.update(ciphertext);
        decrypted = Buffer.concat([decrypted, decipher.final()]);
        
        return decrypted;
    }
    
    deriveMediaKeys(mediaKey) {
        const iv = this.deriveKeys(mediaKey, Buffer.alloc(32), this.constants.HKDF_INFO_IV, 16);
        const cipherKey = this.deriveKeys(mediaKey, Buffer.alloc(32), this.constants.HKDF_INFO_ENC, 32);
        const macKey = this.deriveKeys(mediaKey, Buffer.alloc(32), this.constants.HKDF_INFO_MAC, 32);
        
        return { iv, cipherKey, macKey };
    }
    
    encryptMedia(media, mediaKey) {
        const { iv, cipherKey, macKey } = this.deriveMediaKeys(mediaKey);
        
        const cipher = crypto.createCipheriv('aes-256-cbc', cipherKey, iv);
        let encrypted = cipher.update(media);
        encrypted = Buffer.concat([encrypted, cipher.final()]);
        
        const mac = this.calculateHMAC(Buffer.concat([iv, encrypted]), macKey);
        
        return Buffer.concat([encrypted, mac.slice(0, 10)]);
    }
    
    decryptMedia(encryptedMedia, mediaKey) {
        const { iv, cipherKey, macKey } = this.deriveMediaKeys(mediaKey);
        
        const encrypted = encryptedMedia.slice(0, -10);
        const mac = encryptedMedia.slice(-10);
        
        const expectedMac = this.calculateHMAC(Buffer.concat([iv, encrypted]), macKey).slice(0, 10);
        
        if (!crypto.timingSafeEqual(mac, expectedMac)) {
            throw new Error('Media MAC verification failed');
        }
        
        const decipher = crypto.createDecipheriv('aes-256-cbc', cipherKey, iv);
        let decrypted = decipher.update(encrypted);
        decrypted = Buffer.concat([decrypted, decipher.final()]);
        
        return decrypted;
    }
    
    resetCounters() {
        this.writeCounter = 0;
        this.readCounter = 0;
        this.emit('counters.reset');
    }
    
    getCounters() {
        return {
            write: this.writeCounter,
            read: this.readCounter
        };
    }
    
    clearCache() {
        this.keyDerivationCache.clear();
        this.encryptionCache.clear();
        this.decryptionCache.clear();
        this.emit('cache.cleared');
    }
    
    getStats() {
        return {
            counters: this.getCounters(),
            cacheSize: {
                keyDerivation: this.keyDerivationCache.size,
                encryption: this.encryptionCache.size,
                decryption: this.decryptionCache.size
            },
            hasKeys: !!(this.encKey && this.macKey)
        };
    }
    
    cleanup() {
        this.clearCache();
        this.encKey = null;
        this.macKey = null;
        this.resetCounters();
        this.removeAllListeners();
    }
}

module.exports = WAEncryption;
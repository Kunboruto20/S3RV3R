const crypto = require('crypto');
const { Buffer } = require('buffer');

/**
 * WhatsApp Noise Handler
 * Handles Noise protocol for WhatsApp encryption and handshake
 */
class WANoiseHandler {
    constructor(options = {}) {
        this.options = {
            keySize: 32,
            nonceSize: 12,
            tagSize: 16,
            ...options
        };
        
        this.keypair = null;
        this.sharedSecret = null;
        this.encryptionKey = null;
        this.decryptionKey = null;
        this.sendCounter = 0;
        this.receiveCounter = 0;
        this.isInitialized = false;
    }

    /**
     * Initialize noise handler with key generation
     */
    async initialize() {
        try {
            this.keypair = this.generateKeyPair();
            this.isInitialized = true;
            return true;
        } catch (error) {
            throw new Error(`Failed to initialize noise handler: ${error.message}`);
        }
    }

    /**
     * Generate Curve25519 key pair
     */
    generateKeyPair() {
        const privateKey = crypto.randomBytes(32);
        const publicKey = this.scalarMultBase(privateKey);
        
        return {
            privateKey,
            publicKey
        };
    }

    /**
     * Scalar multiplication with base point (Curve25519)
     */
    scalarMultBase(scalar) {
        // Simplified implementation - in production use proper curve25519 library
        const basePoint = Buffer.from([
            0x09, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00,
            0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00,
            0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00,
            0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00
        ]);
        
        // Use HMAC as a placeholder for actual curve25519 operation
        return crypto.createHmac('sha256', scalar).update(basePoint).digest();
    }

    /**
     * Perform scalar multiplication
     */
    scalarMult(scalar, point) {
        return crypto.createHmac('sha256', scalar).update(point).digest();
    }

    /**
     * Generate shared secret from remote public key
     */
    generateSharedSecret(remotePublicKey) {
        if (!this.keypair) {
            throw new Error('Keypair not initialized');
        }

        this.sharedSecret = this.scalarMult(this.keypair.privateKey, remotePublicKey);
        return this.sharedSecret;
    }

    /**
     * Derive encryption keys from shared secret
     */
    deriveKeys(sharedSecret, salt = null) {
        if (!salt) {
            salt = Buffer.alloc(32, 0);
        }

        const hkdf = crypto.createHmac('sha256', salt);
        hkdf.update(sharedSecret);
        const prk = hkdf.digest();

        // Derive encryption key
        const encryptHkdf = crypto.createHmac('sha256', prk);
        encryptHkdf.update(Buffer.from('WhatsApp Noise Encrypt'));
        encryptHkdf.update(Buffer.from([0x01]));
        this.encryptionKey = encryptHkdf.digest();

        // Derive decryption key
        const decryptHkdf = crypto.createHmac('sha256', prk);
        decryptHkdf.update(Buffer.from('WhatsApp Noise Decrypt'));
        decryptHkdf.update(Buffer.from([0x01]));
        this.decryptionKey = decryptHkdf.digest();

        return {
            encryptionKey: this.encryptionKey,
            decryptionKey: this.decryptionKey
        };
    }

    /**
     * Encrypt data using noise protocol
     */
    encrypt(plaintext, additionalData = null) {
        if (!this.encryptionKey) {
            throw new Error('Encryption key not derived');
        }

        const nonce = Buffer.alloc(12);
        nonce.writeUInt32BE(this.sendCounter, 8);
        this.sendCounter++;

        const cipher = crypto.createCipherGCM('aes-256-gcm');
        cipher.setAAD(additionalData || Buffer.alloc(0));
        
        const iv = nonce;
        cipher.init(this.encryptionKey, iv);
        
        let encrypted = cipher.update(plaintext);
        encrypted = Buffer.concat([encrypted, cipher.final()]);
        const tag = cipher.getAuthTag();

        return {
            ciphertext: encrypted,
            nonce: nonce,
            tag: tag
        };
    }

    /**
     * Decrypt data using noise protocol
     */
    decrypt(ciphertext, nonce, tag, additionalData = null) {
        if (!this.decryptionKey) {
            throw new Error('Decryption key not derived');
        }

        try {
            const decipher = crypto.createDecipherGCM('aes-256-gcm');
            decipher.setAAD(additionalData || Buffer.alloc(0));
            decipher.setAuthTag(tag);
            
            decipher.init(this.decryptionKey, nonce);
            
            let decrypted = decipher.update(ciphertext);
            decrypted = Buffer.concat([decrypted, decipher.final()]);
            
            this.receiveCounter++;
            return decrypted;
        } catch (error) {
            throw new Error(`Decryption failed: ${error.message}`);
        }
    }

    /**
     * Create noise handshake message
     */
    createHandshakeMessage(payload = null) {
        if (!this.keypair) {
            throw new Error('Keypair not initialized');
        }

        const message = {
            publicKey: this.keypair.publicKey,
            timestamp: Date.now(),
            payload: payload || Buffer.alloc(0)
        };

        return Buffer.concat([
            message.publicKey,
            Buffer.from(message.timestamp.toString()),
            message.payload
        ]);
    }

    /**
     * Process received handshake message
     */
    processHandshakeMessage(message) {
        if (message.length < 32) {
            throw new Error('Invalid handshake message length');
        }

        const remotePublicKey = message.slice(0, 32);
        const timestamp = parseInt(message.slice(32, 45).toString());
        const payload = message.slice(45);

        return {
            remotePublicKey,
            timestamp,
            payload
        };
    }

    /**
     * Generate noise session keys
     */
    generateSessionKeys() {
        if (!this.sharedSecret) {
            throw new Error('Shared secret not generated');
        }

        const sessionSalt = crypto.randomBytes(32);
        return this.deriveKeys(this.sharedSecret, sessionSalt);
    }

    /**
     * Reset noise handler state
     */
    reset() {
        this.keypair = null;
        this.sharedSecret = null;
        this.encryptionKey = null;
        this.decryptionKey = null;
        this.sendCounter = 0;
        this.receiveCounter = 0;
        this.isInitialized = false;
    }

    /**
     * Get current public key
     */
    getPublicKey() {
        if (!this.keypair) {
            throw new Error('Keypair not initialized');
        }
        return this.keypair.publicKey;
    }

    /**
     * Get noise protocol state
     */
    getState() {
        return {
            isInitialized: this.isInitialized,
            hasKeypair: !!this.keypair,
            hasSharedSecret: !!this.sharedSecret,
            hasEncryptionKey: !!this.encryptionKey,
            hasDecryptionKey: !!this.decryptionKey,
            sendCounter: this.sendCounter,
            receiveCounter: this.receiveCounter
        };
    }

    /**
     * Validate noise message format
     */
    validateMessage(message) {
        if (!Buffer.isBuffer(message)) {
            return false;
        }

        if (message.length < 44) { // Minimum: 32 (publicKey) + 12 (nonce)
            return false;
        }

        return true;
    }
}

module.exports = WANoiseHandler;
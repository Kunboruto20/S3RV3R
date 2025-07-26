const crypto = require('crypto');
const { Buffer } = require('buffer');

/**
 * WhatsApp Handshake Handler
 * Manages the connection handshake process with WhatsApp servers
 */
class WAHandshake {
    constructor(options = {}) {
        this.options = {
            timeout: 30000,
            maxRetries: 3,
            ...options
        };
        
        this.state = 'idle';
        this.clientHello = null;
        this.serverHello = null;
        this.clientFinish = null;
        this.serverFinish = null;
        this.sharedSecret = null;
        this.sessionKeys = null;
        this.handshakeHash = null;
    }

    /**
     * Initialize handshake
     */
    async initialize() {
        this.state = 'initialized';
        this.handshakeHash = crypto.createHash('sha256');
        return true;
    }

    /**
     * Create client hello message
     */
    createClientHello(keyHandler) {
        try {
            const timestamp = Date.now();
            const publicKey = keyHandler.getPublicKey();
            const clientRandom = crypto.randomBytes(32);
            
            this.clientHello = {
                version: 1,
                timestamp,
                publicKey,
                clientRandom,
                supportedCiphers: ['aes-256-gcm'],
                supportedExtensions: ['noise_protocol']
            };

            // Create binary message
            const message = Buffer.concat([
                Buffer.from([0x01]), // version
                Buffer.alloc(8),     // timestamp placeholder
                publicKey,           // 32 bytes
                clientRandom,        // 32 bytes
                Buffer.from('aes-256-gcm', 'utf8')
            ]);

            // Write timestamp
            message.writeBigUInt64BE(BigInt(timestamp), 1);

            // Update handshake hash
            this.handshakeHash.update(message);
            
            this.state = 'client_hello_sent';
            return message;
        } catch (error) {
            throw new Error(`Failed to create client hello: ${error.message}`);
        }
    }

    /**
     * Process server hello message
     */
    processServerHello(message, noiseHandler) {
        try {
            if (message.length < 73) { // Minimum expected size
                throw new Error('Invalid server hello message length');
            }

            const version = message.readUInt8(0);
            const timestamp = Number(message.readBigUInt64BE(1));
            const serverPublicKey = message.slice(9, 41);
            const serverRandom = message.slice(41, 73);
            const extensions = message.slice(73);

            this.serverHello = {
                version,
                timestamp,
                serverPublicKey,
                serverRandom,
                extensions
            };

            // Update handshake hash
            this.handshakeHash.update(message);

            // Generate shared secret
            this.sharedSecret = noiseHandler.generateSharedSecret(serverPublicKey);
            
            this.state = 'server_hello_received';
            return this.serverHello;
        } catch (error) {
            throw new Error(`Failed to process server hello: ${error.message}`);
        }
    }

    /**
     * Create client finish message
     */
    createClientFinish(credentials) {
        try {
            if (!this.sharedSecret) {
                throw new Error('Shared secret not established');
            }

            // Derive handshake keys
            const handshakeKeys = this.deriveHandshakeKeys();
            
            // Create finish message data
            const finishData = {
                clientId: credentials.getClientId(),
                browserToken: credentials.getBrowserToken(),
                timestamp: Date.now()
            };

            const finishPayload = Buffer.from(JSON.stringify(finishData));
            
            // Encrypt finish message
            const nonce = crypto.randomBytes(12);
            const cipher = crypto.createCipherGCM('aes-256-gcm');
            cipher.init(handshakeKeys.clientWriteKey, nonce);
            
            let encrypted = cipher.update(finishPayload);
            encrypted = Buffer.concat([encrypted, cipher.final()]);
            const authTag = cipher.getAuthTag();

            this.clientFinish = {
                encrypted,
                nonce,
                authTag,
                finishData
            };

            // Create binary message
            const message = Buffer.concat([
                Buffer.from([0x02]), // finish message type
                nonce,               // 12 bytes
                encrypted,           // variable length
                authTag              // 16 bytes
            ]);

            // Update handshake hash
            this.handshakeHash.update(message);
            
            this.state = 'client_finish_sent';
            return message;
        } catch (error) {
            throw new Error(`Failed to create client finish: ${error.message}`);
        }
    }

    /**
     * Process server finish message
     */
    processServerFinish(message) {
        try {
            if (message.length < 29) { // Minimum: 1 + 12 + 0 + 16
                throw new Error('Invalid server finish message length');
            }

            const messageType = message.readUInt8(0);
            if (messageType !== 0x03) {
                throw new Error('Invalid server finish message type');
            }

            const nonce = message.slice(1, 13);
            const authTag = message.slice(-16);
            const encrypted = message.slice(13, -16);

            // Derive handshake keys if not already done
            if (!this.sessionKeys) {
                this.sessionKeys = this.deriveHandshakeKeys();
            }

            // Decrypt server finish
            const decipher = crypto.createDecipherGCM('aes-256-gcm');
            decipher.setAuthTag(authTag);
            decipher.init(this.sessionKeys.serverWriteKey, nonce);
            
            let decrypted = decipher.update(encrypted);
            decrypted = Buffer.concat([decrypted, decipher.final()]);

            const serverFinishData = JSON.parse(decrypted.toString());

            this.serverFinish = {
                nonce,
                authTag,
                encrypted,
                finishData: serverFinishData
            };

            // Update handshake hash
            this.handshakeHash.update(message);
            
            // Derive final session keys
            this.deriveSessionKeys();
            
            this.state = 'completed';
            return this.serverFinish;
        } catch (error) {
            throw new Error(`Failed to process server finish: ${error.message}`);
        }
    }

    /**
     * Derive handshake keys from shared secret
     */
    deriveHandshakeKeys() {
        if (!this.sharedSecret) {
            throw new Error('Shared secret not established');
        }

        const salt = Buffer.concat([
            this.clientHello.clientRandom,
            this.serverHello.serverRandom
        ]);

        // HKDF Extract
        const prk = crypto.createHmac('sha256', salt).update(this.sharedSecret).digest();

        // HKDF Expand for client write key
        const clientKeyInfo = Buffer.from('client handshake key');
        const clientWriteKey = this.hkdfExpand(prk, clientKeyInfo, 32);

        // HKDF Expand for server write key
        const serverKeyInfo = Buffer.from('server handshake key');
        const serverWriteKey = this.hkdfExpand(prk, serverKeyInfo, 32);

        this.sessionKeys = {
            clientWriteKey,
            serverWriteKey,
            prk
        };

        return this.sessionKeys;
    }

    /**
     * Derive final session keys
     */
    deriveSessionKeys() {
        if (!this.sessionKeys) {
            throw new Error('Handshake keys not derived');
        }

        const handshakeHashDigest = this.handshakeHash.digest();
        
        // Derive application keys
        const clientAppKeyInfo = Buffer.concat([
            Buffer.from('client application key'),
            handshakeHashDigest
        ]);
        const clientAppKey = this.hkdfExpand(this.sessionKeys.prk, clientAppKeyInfo, 32);

        const serverAppKeyInfo = Buffer.concat([
            Buffer.from('server application key'),
            handshakeHashDigest
        ]);
        const serverAppKey = this.hkdfExpand(this.sessionKeys.prk, serverAppKeyInfo, 32);

        this.sessionKeys.clientAppKey = clientAppKey;
        this.sessionKeys.serverAppKey = serverAppKey;
        this.sessionKeys.handshakeHash = handshakeHashDigest;

        return this.sessionKeys;
    }

    /**
     * HKDF Expand function
     */
    hkdfExpand(prk, info, length) {
        const hashLength = 32; // SHA-256 output length
        const n = Math.ceil(length / hashLength);
        let okm = Buffer.alloc(0);
        let t = Buffer.alloc(0);

        for (let i = 1; i <= n; i++) {
            const hmac = crypto.createHmac('sha256', prk);
            hmac.update(t);
            hmac.update(info);
            hmac.update(Buffer.from([i]));
            t = hmac.digest();
            okm = Buffer.concat([okm, t]);
        }

        return okm.slice(0, length);
    }

    /**
     * Verify handshake completion
     */
    isCompleted() {
        return this.state === 'completed' && !!this.sessionKeys;
    }

    /**
     * Get session keys
     */
    getSessionKeys() {
        if (!this.isCompleted()) {
            throw new Error('Handshake not completed');
        }
        return this.sessionKeys;
    }

    /**
     * Get handshake state
     */
    getState() {
        return {
            state: this.state,
            hasClientHello: !!this.clientHello,
            hasServerHello: !!this.serverHello,
            hasClientFinish: !!this.clientFinish,
            hasServerFinish: !!this.serverFinish,
            hasSharedSecret: !!this.sharedSecret,
            hasSessionKeys: !!this.sessionKeys,
            isCompleted: this.isCompleted()
        };
    }

    /**
     * Reset handshake state
     */
    reset() {
        this.state = 'idle';
        this.clientHello = null;
        this.serverHello = null;
        this.clientFinish = null;
        this.serverFinish = null;
        this.sharedSecret = null;
        this.sessionKeys = null;
        this.handshakeHash = null;
    }

    /**
     * Validate handshake message
     */
    validateMessage(message, expectedType) {
        if (!Buffer.isBuffer(message)) {
            return false;
        }

        if (message.length < 1) {
            return false;
        }

        const messageType = message.readUInt8(0);
        return messageType === expectedType;
    }
}

module.exports = WAHandshake;
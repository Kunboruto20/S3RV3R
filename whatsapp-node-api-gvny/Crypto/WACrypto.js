const crypto = require('crypto');
const { Buffer } = require('buffer');
const curve25519 = require('curve25519-js');

/**
 * WhatsApp Cryptographic Functions
 * Handles all encryption, decryption, and key management
 */
class WACrypto {
    constructor() {
        this.algorithms = {
            AES_GCM: 'aes-256-gcm',
            AES_CBC: 'aes-256-cbc',
            HMAC_SHA256: 'sha256',
            SHA256: 'sha256',
            SHA1: 'sha1'
        };
        
        this.keyLengths = {
            AES_256: 32,
            AES_128: 16,
            HMAC_KEY: 32,
            IV: 16,
            SALT: 32
        };
    }

    // Generate random bytes
    randomBytes(length) {
        return crypto.randomBytes(length);
    }

    // Generate Curve25519 key pair
    generateKeyPair() {
        const privateKey = this.randomBytes(32);
        const publicKey = curve25519.generatePublicKey(privateKey);
        
        return {
            privateKey: Buffer.from(privateKey),
            publicKey: Buffer.from(publicKey)
        };
    }

    // Perform ECDH key exchange
    performECDH(privateKey, publicKey) {
        try {
            const sharedSecret = curve25519.sharedKey(privateKey, publicKey);
            return Buffer.from(sharedSecret);
        } catch (error) {
            throw new Error(`ECDH failed: ${error.message}`);
        }
    }

    // HKDF key derivation
    hkdf(inputKeyMaterial, salt, info, length) {
        try {
            // Extract phase
            const hmac1 = crypto.createHmac(this.algorithms.HMAC_SHA256, salt);
            hmac1.update(inputKeyMaterial);
            const prk = hmac1.digest();

            // Expand phase
            let output = Buffer.alloc(0);
            let counter = 1;
            let t = Buffer.alloc(0);

            while (output.length < length) {
                const hmac2 = crypto.createHmac(this.algorithms.HMAC_SHA256, prk);
                hmac2.update(t);
                hmac2.update(info);
                hmac2.update(Buffer.from([counter]));
                t = hmac2.digest();
                output = Buffer.concat([output, t]);
                counter++;
            }

            return output.slice(0, length);
        } catch (error) {
            throw new Error(`HKDF failed: ${error.message}`);
        }
    }

    // AES-GCM encryption
    encryptAESGCM(plaintext, key, iv, additionalData = null) {
        try {
            const cipher = crypto.createCipherGCM(this.algorithms.AES_GCM, key);
            cipher.setIVLength(iv.length);
            cipher.setIV(iv);
            
            if (additionalData) {
                cipher.setAAD(additionalData);
            }

            let encrypted = cipher.update(plaintext);
            cipher.final();
            const authTag = cipher.getAuthTag();

            return {
                ciphertext: encrypted,
                authTag: authTag
            };
        } catch (error) {
            throw new Error(`AES-GCM encryption failed: ${error.message}`);
        }
    }

    // AES-GCM decryption
    decryptAESGCM(ciphertext, key, iv, authTag, additionalData = null) {
        try {
            const decipher = crypto.createDecipherGCM(this.algorithms.AES_GCM, key);
            decipher.setIVLength(iv.length);
            decipher.setIV(iv);
            decipher.setAuthTag(authTag);
            
            if (additionalData) {
                decipher.setAAD(additionalData);
            }

            let decrypted = decipher.update(ciphertext);
            decipher.final();

            return decrypted;
        } catch (error) {
            throw new Error(`AES-GCM decryption failed: ${error.message}`);
        }
    }

    // AES-CBC encryption
    encryptAESCBC(plaintext, key, iv) {
        try {
            const cipher = crypto.createCipher(this.algorithms.AES_CBC, key);
            cipher.setIV(iv);
            
            let encrypted = cipher.update(plaintext);
            encrypted = Buffer.concat([encrypted, cipher.final()]);
            
            return encrypted;
        } catch (error) {
            throw new Error(`AES-CBC encryption failed: ${error.message}`);
        }
    }

    // AES-CBC decryption
    decryptAESCBC(ciphertext, key, iv) {
        try {
            const decipher = crypto.createDecipher(this.algorithms.AES_CBC, key);
            decipher.setIV(iv);
            
            let decrypted = decipher.update(ciphertext);
            decrypted = Buffer.concat([decrypted, decipher.final()]);
            
            return decrypted;
        } catch (error) {
            throw new Error(`AES-CBC decryption failed: ${error.message}`);
        }
    }

    // HMAC-SHA256
    hmacSHA256(data, key) {
        try {
            const hmac = crypto.createHmac(this.algorithms.HMAC_SHA256, key);
            hmac.update(data);
            return hmac.digest();
        } catch (error) {
            throw new Error(`HMAC-SHA256 failed: ${error.message}`);
        }
    }

    // SHA256 hash
    sha256(data) {
        try {
            const hash = crypto.createHash(this.algorithms.SHA256);
            hash.update(data);
            return hash.digest();
        } catch (error) {
            throw new Error(`SHA256 failed: ${error.message}`);
        }
    }

    // SHA1 hash
    sha1(data) {
        try {
            const hash = crypto.createHash(this.algorithms.SHA1);
            hash.update(data);
            return hash.digest();
        } catch (error) {
            throw new Error(`SHA1 failed: ${error.message}`);
        }
    }

    // Generate media keys
    generateMediaKeys(mediaType) {
        const mediaKey = this.randomBytes(32);
        const info = Buffer.from(`WhatsApp ${mediaType} Keys`, 'utf8');
        const salt = Buffer.alloc(32); // Zero salt
        
        const expandedKeys = this.hkdf(mediaKey, salt, info, 112);
        
        return {
            mediaKey: mediaKey,
            iv: expandedKeys.slice(0, 16),
            cipherKey: expandedKeys.slice(16, 48),
            macKey: expandedKeys.slice(48, 80),
            refKey: expandedKeys.slice(80, 112)
        };
    }

    // Encrypt media
    encryptMedia(media, mediaType) {
        try {
            const keys = this.generateMediaKeys(mediaType);
            const encrypted = this.encryptAESCBC(media, keys.cipherKey, keys.iv);
            const mac = this.hmacSHA256(Buffer.concat([keys.iv, encrypted]), keys.macKey);
            
            return {
                ciphertext: encrypted,
                mediaKey: keys.mediaKey,
                iv: keys.iv,
                mac: mac.slice(0, 10), // First 10 bytes
                refKey: keys.refKey
            };
        } catch (error) {
            throw new Error(`Media encryption failed: ${error.message}`);
        }
    }

    // Decrypt media
    decryptMedia(encryptedMedia, mediaKey, mediaType) {
        try {
            const info = Buffer.from(`WhatsApp ${mediaType} Keys`, 'utf8');
            const salt = Buffer.alloc(32); // Zero salt
            
            const expandedKeys = this.hkdf(mediaKey, salt, info, 112);
            const iv = expandedKeys.slice(0, 16);
            const cipherKey = expandedKeys.slice(16, 48);
            const macKey = expandedKeys.slice(48, 80);
            
            // Verify MAC
            const expectedMac = this.hmacSHA256(
                Buffer.concat([iv, encryptedMedia.ciphertext]), 
                macKey
            ).slice(0, 10);
            
            if (!encryptedMedia.mac.equals(expectedMac)) {
                throw new Error('MAC verification failed');
            }
            
            // Decrypt
            const decrypted = this.decryptAESCBC(encryptedMedia.ciphertext, cipherKey, iv);
            return decrypted;
        } catch (error) {
            throw new Error(`Media decryption failed: ${error.message}`);
        }
    }

    // Generate message keys for Signal protocol
    generateMessageKeys(chainKey, messageNumber) {
        try {
            const messageKeyInput = Buffer.concat([
                chainKey,
                Buffer.from([0x01]) // Message key constant
            ]);
            
            const messageKey = this.hmacSHA256(messageKeyInput, chainKey);
            
            const cipherKey = this.hkdf(messageKey, Buffer.alloc(32), Buffer.from('WhatsApp Message Key'), 32);
            const macKey = this.hkdf(messageKey, Buffer.alloc(32), Buffer.from('WhatsApp MAC Key'), 32);
            const iv = this.hkdf(messageKey, Buffer.alloc(32), Buffer.from('WhatsApp IV'), 16);
            
            return {
                cipherKey: cipherKey,
                macKey: macKey,
                iv: iv,
                messageNumber: messageNumber
            };
        } catch (error) {
            throw new Error(`Message key generation failed: ${error.message}`);
        }
    }

    // Advance chain key
    advanceChainKey(chainKey) {
        try {
            const nextChainKeyInput = Buffer.concat([
                chainKey,
                Buffer.from([0x02]) // Chain key constant
            ]);
            
            return this.hmacSHA256(nextChainKeyInput, chainKey);
        } catch (error) {
            throw new Error(`Chain key advancement failed: ${error.message}`);
        }
    }

    // Generate fingerprint for key verification
    generateFingerprint(identityKey, publicKey) {
        try {
            const combined = Buffer.concat([identityKey, publicKey]);
            const hash = this.sha256(combined);
            
            // Convert to displayable fingerprint
            let fingerprint = '';
            for (let i = 0; i < hash.length; i += 2) {
                if (i > 0) fingerprint += ' ';
                fingerprint += hash.slice(i, i + 2).toString('hex').toUpperCase();
            }
            
            return fingerprint;
        } catch (error) {
            throw new Error(`Fingerprint generation failed: ${error.message}`);
        }
    }

    // Constant time buffer comparison
    constantTimeEquals(a, b) {
        if (a.length !== b.length) {
            return false;
        }
        
        let result = 0;
        for (let i = 0; i < a.length; i++) {
            result |= a[i] ^ b[i];
        }
        
        return result === 0;
    }

    // Secure random number generation
    secureRandomInt(min, max) {
        const range = max - min + 1;
        const bytesNeeded = Math.ceil(Math.log2(range) / 8);
        const maxValidValue = Math.floor(256 ** bytesNeeded / range) * range - 1;
        
        let randomValue;
        do {
            const randomBytes = this.randomBytes(bytesNeeded);
            randomValue = 0;
            for (let i = 0; i < bytesNeeded; i++) {
                randomValue = (randomValue << 8) + randomBytes[i];
            }
        } while (randomValue > maxValidValue);
        
        return min + (randomValue % range);
    }
}

module.exports = WACrypto;
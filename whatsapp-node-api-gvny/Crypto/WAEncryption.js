const crypto = require('crypto');
const { Buffer } = require('buffer');

/**
 * WhatsApp Advanced Encryption Handler
 * Handles advanced encryption operations for WhatsApp protocol
 */
class WAEncryption {
    constructor(options = {}) {
        this.options = {
            keyDerivationIterations: options.keyDerivationIterations || 10000,
            saltLength: options.saltLength || 32,
            ivLength: options.ivLength || 16,
            tagLength: options.tagLength || 16,
            ...options
        };

        // Encryption algorithms
        this.algorithms = {
            AES_256_GCM: 'aes-256-gcm',
            AES_256_CBC: 'aes-256-cbc',
            CHACHA20_POLY1305: 'chacha20-poly1305',
            AES_128_GCM: 'aes-128-gcm'
        };

        // Hash algorithms
        this.hashAlgorithms = {
            SHA256: 'sha256',
            SHA512: 'sha512',
            SHA1: 'sha1',
            MD5: 'md5'
        };
    }

    // Advanced key derivation
    deriveKey(password, salt, keyLength = 32, iterations = null) {
        try {
            const iter = iterations || this.options.keyDerivationIterations;
            return crypto.pbkdf2Sync(password, salt, iter, keyLength, 'sha256');
        } catch (error) {
            throw new Error(`Key derivation failed: ${error.message}`);
        }
    }

    // Advanced AES-GCM encryption
    encryptAESGCM(data, key, additionalData = null) {
        try {
            const iv = crypto.randomBytes(this.options.ivLength);
            const cipher = crypto.createCipher(this.algorithms.AES_256_GCM, key);
            
            if (additionalData) {
                cipher.setAAD(additionalData);
            }

            let encrypted = cipher.update(data, 'utf8', 'hex');
            encrypted += cipher.final('hex');
            
            const tag = cipher.getAuthTag();

            return {
                encrypted: encrypted,
                iv: iv.toString('hex'),
                tag: tag.toString('hex'),
                algorithm: this.algorithms.AES_256_GCM
            };
        } catch (error) {
            throw new Error(`AES-GCM encryption failed: ${error.message}`);
        }
    }

    // Advanced AES-GCM decryption
    decryptAESGCM(encryptedData, key, iv, tag, additionalData = null) {
        try {
            const decipher = crypto.createDecipher(this.algorithms.AES_256_GCM, key);
            decipher.setAuthTag(Buffer.from(tag, 'hex'));
            
            if (additionalData) {
                decipher.setAAD(additionalData);
            }

            let decrypted = decipher.update(encryptedData, 'hex', 'utf8');
            decrypted += decipher.final('utf8');
            
            return decrypted;
        } catch (error) {
            throw new Error(`AES-GCM decryption failed: ${error.message}`);
        }
    }

    // ChaCha20-Poly1305 encryption
    encryptChaCha20(data, key) {
        try {
            const iv = crypto.randomBytes(12); // ChaCha20 uses 12-byte nonce
            const cipher = crypto.createCipher(this.algorithms.CHACHA20_POLY1305, key);
            
            let encrypted = cipher.update(data, 'utf8', 'hex');
            encrypted += cipher.final('hex');
            
            const tag = cipher.getAuthTag();

            return {
                encrypted: encrypted,
                iv: iv.toString('hex'),
                tag: tag.toString('hex'),
                algorithm: this.algorithms.CHACHA20_POLY1305
            };
        } catch (error) {
            throw new Error(`ChaCha20 encryption failed: ${error.message}`);
        }
    }

    // ChaCha20-Poly1305 decryption
    decryptChaCha20(encryptedData, key, iv, tag) {
        try {
            const decipher = crypto.createDecipher(this.algorithms.CHACHA20_POLY1305, key);
            decipher.setAuthTag(Buffer.from(tag, 'hex'));

            let decrypted = decipher.update(encryptedData, 'hex', 'utf8');
            decrypted += decipher.final('utf8');
            
            return decrypted;
        } catch (error) {
            throw new Error(`ChaCha20 decryption failed: ${error.message}`);
        }
    }

    // Hybrid encryption (RSA + AES)
    hybridEncrypt(data, publicKey) {
        try {
            // Generate AES key
            const aesKey = crypto.randomBytes(32);
            
            // Encrypt data with AES
            const aesResult = this.encryptAESGCM(data, aesKey);
            
            // Encrypt AES key with RSA
            const encryptedKey = crypto.publicEncrypt({
                key: publicKey,
                padding: crypto.constants.RSA_PKCS1_OAEP_PADDING,
                oaepHash: 'sha256'
            }, aesKey);

            return {
                encryptedData: aesResult,
                encryptedKey: encryptedKey.toString('base64'),
                algorithm: 'hybrid-rsa-aes'
            };
        } catch (error) {
            throw new Error(`Hybrid encryption failed: ${error.message}`);
        }
    }

    // Hybrid decryption (RSA + AES)
    hybridDecrypt(encryptedData, encryptedKey, privateKey) {
        try {
            // Decrypt AES key with RSA
            const aesKey = crypto.privateDecrypt({
                key: privateKey,
                padding: crypto.constants.RSA_PKCS1_OAEP_PADDING,
                oaepHash: 'sha256'
            }, Buffer.from(encryptedKey, 'base64'));

            // Decrypt data with AES
            const decrypted = this.decryptAESGCM(
                encryptedData.encrypted,
                aesKey,
                encryptedData.iv,
                encryptedData.tag
            );

            return decrypted;
        } catch (error) {
            throw new Error(`Hybrid decryption failed: ${error.message}`);
        }
    }

    // Advanced hashing with salt
    hashWithSalt(data, salt = null, algorithm = 'sha256') {
        try {
            const actualSalt = salt || crypto.randomBytes(this.options.saltLength);
            const hash = crypto.createHash(algorithm);
            hash.update(data);
            hash.update(actualSalt);
            
            return {
                hash: hash.digest('hex'),
                salt: actualSalt.toString('hex'),
                algorithm: algorithm
            };
        } catch (error) {
            throw new Error(`Hashing failed: ${error.message}`);
        }
    }

    // HMAC generation
    generateHMAC(data, key, algorithm = 'sha256') {
        try {
            const hmac = crypto.createHmac(algorithm, key);
            hmac.update(data);
            return hmac.digest('hex');
        } catch (error) {
            throw new Error(`HMAC generation failed: ${error.message}`);
        }
    }

    // Verify HMAC
    verifyHMAC(data, key, expectedHmac, algorithm = 'sha256') {
        try {
            const calculatedHmac = this.generateHMAC(data, key, algorithm);
            return crypto.timingSafeEqual(
                Buffer.from(calculatedHmac, 'hex'),
                Buffer.from(expectedHmac, 'hex')
            );
        } catch (error) {
            return false;
        }
    }

    // Digital signature
    sign(data, privateKey, algorithm = 'sha256') {
        try {
            const sign = crypto.createSign(algorithm);
            sign.update(data);
            return sign.sign(privateKey, 'base64');
        } catch (error) {
            throw new Error(`Signing failed: ${error.message}`);
        }
    }

    // Verify digital signature
    verify(data, signature, publicKey, algorithm = 'sha256') {
        try {
            const verify = crypto.createVerify(algorithm);
            verify.update(data);
            return verify.verify(publicKey, signature, 'base64');
        } catch (error) {
            return false;
        }
    }

    // Key stretching
    stretchKey(key, salt, outputLength = 32, iterations = 100000) {
        try {
            return crypto.pbkdf2Sync(key, salt, iterations, outputLength, 'sha256');
        } catch (error) {
            throw new Error(`Key stretching failed: ${error.message}`);
        }
    }

    // Secure random generation
    generateSecureRandom(length = 32) {
        return crypto.randomBytes(length);
    }

    // Generate cryptographically secure UUID
    generateSecureUUID() {
        const bytes = crypto.randomBytes(16);
        bytes[6] = (bytes[6] & 0x0f) | 0x40; // Version 4
        bytes[8] = (bytes[8] & 0x3f) | 0x80; // Variant 10
        
        const hex = bytes.toString('hex');
        return [
            hex.substring(0, 8),
            hex.substring(8, 12),
            hex.substring(12, 16),
            hex.substring(16, 20),
            hex.substring(20, 32)
        ].join('-');
    }

    // Constant-time comparison
    constantTimeCompare(a, b) {
        try {
            const bufferA = Buffer.isBuffer(a) ? a : Buffer.from(a);
            const bufferB = Buffer.isBuffer(b) ? b : Buffer.from(b);
            
            if (bufferA.length !== bufferB.length) {
                return false;
            }
            
            return crypto.timingSafeEqual(bufferA, bufferB);
        } catch (error) {
            return false;
        }
    }

    // Encrypt with multiple layers
    multiLayerEncrypt(data, keys) {
        try {
            let encrypted = data;
            const layers = [];
            
            for (let i = 0; i < keys.length; i++) {
                const result = this.encryptAESGCM(encrypted, keys[i]);
                encrypted = result.encrypted;
                layers.push({
                    layer: i,
                    iv: result.iv,
                    tag: result.tag,
                    algorithm: result.algorithm
                });
            }
            
            return {
                encrypted: encrypted,
                layers: layers
            };
        } catch (error) {
            throw new Error(`Multi-layer encryption failed: ${error.message}`);
        }
    }

    // Decrypt multiple layers
    multiLayerDecrypt(encryptedData, keys, layers) {
        try {
            let decrypted = encryptedData;
            
            // Decrypt in reverse order
            for (let i = layers.length - 1; i >= 0; i--) {
                const layer = layers[i];
                decrypted = this.decryptAESGCM(
                    decrypted,
                    keys[layer.layer],
                    layer.iv,
                    layer.tag
                );
            }
            
            return decrypted;
        } catch (error) {
            throw new Error(`Multi-layer decryption failed: ${error.message}`);
        }
    }
}

module.exports = WAEncryption;
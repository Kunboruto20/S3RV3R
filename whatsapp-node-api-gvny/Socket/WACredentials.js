const crypto = require('crypto');
const fs = require('fs').promises;
const path = require('path');

/**
 * WhatsApp Credentials Handler
 * Manages authentication credentials and session data
 */
class WACredentials {
    constructor(options = {}) {
        this.options = {
            credentialsPath: './wa_credentials',
            autoSave: true,
            encryptCredentials: true,
            ...options
        };
        
        this.credentials = {
            clientId: null,
            serverToken: null,
            clientToken: null,
            encKey: null,
            macKey: null,
            wid: null,
            me: null,
            phone: null,
            platform: 'web',
            browserToken: null,
            secret: null,
            secretBundle: null
        };
        
        this.isLoaded = false;
    }

    /**
     * Initialize credentials
     */
    async initialize() {
        try {
            await this.loadCredentials();
            if (!this.isLoaded) {
                this.generateNewCredentials();
            }
            return true;
        } catch (error) {
            throw new Error(`Failed to initialize credentials: ${error.message}`);
        }
    }

    /**
     * Generate new credentials
     */
    generateNewCredentials() {
        this.credentials = {
            clientId: this.generateClientId(),
            serverToken: null,
            clientToken: this.generateClientToken(),
            encKey: crypto.randomBytes(32),
            macKey: crypto.randomBytes(32),
            wid: null,
            me: null,
            phone: null,
            platform: 'web',
            browserToken: this.generateBrowserToken(),
            secret: crypto.randomBytes(32),
            secretBundle: this.generateSecretBundle()
        };
        
        if (this.options.autoSave) {
            this.saveCredentials();
        }
        
        return this.credentials;
    }

    /**
     * Generate client ID
     */
    generateClientId() {
        const timestamp = Date.now();
        const random = crypto.randomBytes(8).toString('hex');
        return `${timestamp}-${random}`;
    }

    /**
     * Generate client token
     */
    generateClientToken() {
        return crypto.randomBytes(16).toString('base64');
    }

    /**
     * Generate browser token
     */
    generateBrowserToken() {
        const browserData = {
            name: 'Chrome',
            version: '120.0.0.0',
            os: 'Windows',
            timestamp: Date.now()
        };
        
        return Buffer.from(JSON.stringify(browserData)).toString('base64');
    }

    /**
     * Generate secret bundle
     */
    generateSecretBundle() {
        return {
            key: crypto.randomBytes(32),
            iv: crypto.randomBytes(16),
            salt: crypto.randomBytes(32),
            timestamp: Date.now()
        };
    }

    /**
     * Set server token
     */
    setServerToken(token) {
        this.credentials.serverToken = token;
        if (this.options.autoSave) {
            this.saveCredentials();
        }
    }

    /**
     * Set WhatsApp ID
     */
    setWid(wid) {
        this.credentials.wid = wid;
        if (this.options.autoSave) {
            this.saveCredentials();
        }
    }

    /**
     * Set user info
     */
    setMe(userInfo) {
        this.credentials.me = userInfo;
        if (this.options.autoSave) {
            this.saveCredentials();
        }
    }

    /**
     * Set phone number
     */
    setPhone(phone) {
        this.credentials.phone = phone;
        if (this.options.autoSave) {
            this.saveCredentials();
        }
    }

    /**
     * Get credentials
     */
    getCredentials() {
        return { ...this.credentials };
    }

    /**
     * Get client ID
     */
    getClientId() {
        return this.credentials.clientId;
    }

    /**
     * Get encryption key
     */
    getEncKey() {
        return this.credentials.encKey;
    }

    /**
     * Get MAC key
     */
    getMacKey() {
        return this.credentials.macKey;
    }

    /**
     * Get browser token
     */
    getBrowserToken() {
        return this.credentials.browserToken;
    }

    /**
     * Get secret bundle
     */
    getSecretBundle() {
        return this.credentials.secretBundle;
    }

    /**
     * Check if credentials are valid
     */
    isValid() {
        return !!(
            this.credentials.clientId &&
            this.credentials.clientToken &&
            this.credentials.encKey &&
            this.credentials.macKey
        );
    }

    /**
     * Check if authenticated
     */
    isAuthenticated() {
        return !!(
            this.isValid() &&
            this.credentials.serverToken &&
            this.credentials.wid
        );
    }

    /**
     * Encrypt credentials data
     */
    encryptCredentials(data) {
        if (!this.options.encryptCredentials) {
            return JSON.stringify(data);
        }

        const key = crypto.scryptSync('whatsapp_credentials', 'salt', 32);
        const iv = crypto.randomBytes(16);
        const cipher = crypto.createCipherGCM('aes-256-gcm', key, iv);
        
        let encrypted = cipher.update(JSON.stringify(data), 'utf8', 'hex');
        encrypted += cipher.final('hex');
        const authTag = cipher.getAuthTag();

        return JSON.stringify({
            encrypted: encrypted,
            iv: iv.toString('hex'),
            authTag: authTag.toString('hex')
        });
    }

    /**
     * Decrypt credentials data
     */
    decryptCredentials(encryptedData) {
        if (!this.options.encryptCredentials) {
            return JSON.parse(encryptedData);
        }

        try {
            const data = JSON.parse(encryptedData);
            const key = crypto.scryptSync('whatsapp_credentials', 'salt', 32);
            const decipher = crypto.createDecipherGCM('aes-256-gcm', key, Buffer.from(data.iv, 'hex'));
            decipher.setAuthTag(Buffer.from(data.authTag, 'hex'));
            
            let decrypted = decipher.update(data.encrypted, 'hex', 'utf8');
            decrypted += decipher.final('utf8');
            
            return JSON.parse(decrypted);
        } catch (error) {
            throw new Error(`Failed to decrypt credentials: ${error.message}`);
        }
    }

    /**
     * Save credentials to file
     */
    async saveCredentials() {
        try {
            const credentialsDir = path.dirname(this.options.credentialsPath);
            await fs.mkdir(credentialsDir, { recursive: true });
            
            // Convert Buffers to base64 for JSON serialization
            const serializable = {};
            for (const [key, value] of Object.entries(this.credentials)) {
                if (Buffer.isBuffer(value)) {
                    serializable[key] = value.toString('base64');
                } else if (value && typeof value === 'object' && value.key) {
                    // Handle secretBundle
                    serializable[key] = {
                        ...value,
                        key: value.key.toString('base64'),
                        iv: value.iv.toString('base64'),
                        salt: value.salt.toString('base64')
                    };
                } else {
                    serializable[key] = value;
                }
            }
            
            const encryptedData = this.encryptCredentials(serializable);
            await fs.writeFile(this.options.credentialsPath, encryptedData, 'utf8');
            
            return true;
        } catch (error) {
            throw new Error(`Failed to save credentials: ${error.message}`);
        }
    }

    /**
     * Load credentials from file
     */
    async loadCredentials() {
        try {
            const data = await fs.readFile(this.options.credentialsPath, 'utf8');
            const decrypted = this.decryptCredentials(data);
            
            // Convert base64 back to Buffers
            for (const [key, value] of Object.entries(decrypted)) {
                if (typeof value === 'string' && ['encKey', 'macKey', 'secret'].includes(key)) {
                    this.credentials[key] = Buffer.from(value, 'base64');
                } else if (value && typeof value === 'object' && value.key) {
                    // Handle secretBundle
                    this.credentials[key] = {
                        ...value,
                        key: Buffer.from(value.key, 'base64'),
                        iv: Buffer.from(value.iv, 'base64'),
                        salt: Buffer.from(value.salt, 'base64')
                    };
                } else {
                    this.credentials[key] = value;
                }
            }
            
            this.isLoaded = true;
            return true;
        } catch (error) {
            if (error.code === 'ENOENT') {
                // File doesn't exist, not an error
                return false;
            }
            throw new Error(`Failed to load credentials: ${error.message}`);
        }
    }

    /**
     * Clear credentials
     */
    clearCredentials() {
        this.credentials = {
            clientId: null,
            serverToken: null,
            clientToken: null,
            encKey: null,
            macKey: null,
            wid: null,
            me: null,
            phone: null,
            platform: 'web',
            browserToken: null,
            secret: null,
            secretBundle: null
        };
        
        this.isLoaded = false;
    }

    /**
     * Delete credentials file
     */
    async deleteCredentials() {
        try {
            await fs.unlink(this.options.credentialsPath);
            this.clearCredentials();
            return true;
        } catch (error) {
            if (error.code === 'ENOENT') {
                return true; // File doesn't exist, consider it deleted
            }
            throw new Error(`Failed to delete credentials: ${error.message}`);
        }
    }

    /**
     * Get credentials summary
     */
    getSummary() {
        return {
            isLoaded: this.isLoaded,
            isValid: this.isValid(),
            isAuthenticated: this.isAuthenticated(),
            hasClientId: !!this.credentials.clientId,
            hasServerToken: !!this.credentials.serverToken,
            hasWid: !!this.credentials.wid,
            hasPhone: !!this.credentials.phone,
            platform: this.credentials.platform
        };
    }
}

module.exports = WACredentials;
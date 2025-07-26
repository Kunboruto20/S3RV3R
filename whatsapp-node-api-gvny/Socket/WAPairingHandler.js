const { EventEmitter } = require('events');
const crypto = require('crypto');

class WAPairingHandler extends EventEmitter {
    constructor(options = {}) {
        super();
        this.options = {
            pairingCodeLength: options.pairingCodeLength || 8,
            expirationTime: options.expirationTime || 300000, // 5 minutes
            maxRetries: options.maxRetries || 3,
            retryDelay: options.retryDelay || 5000,
            displayInTerminal: options.displayInTerminal !== false,
            ...options
        };
        
        this.currentCode = null;
        this.phoneNumber = null;
        this.expirationTimer = null;
        this.retryCount = 0;
        this.isActive = false;
        this.isPaired = false;
        
        // Pairing state
        this.publicKey = null;
        this.privateKey = null;
        this.clientId = null;
        this.serverRef = null;
        this.pairingData = null;
        
        this.init();
    }
    
    init() {
        this.generateKeys();
        this.clientId = this.generateClientId();
        this.emit('pairing.handler.ready');
    }
    
    generateKeys() {
        const keyPair = crypto.generateKeyPairSync('x25519');
        this.privateKey = keyPair.privateKey.export({ type: 'pkcs8', format: 'der' });
        this.publicKey = keyPair.publicKey.export({ type: 'spki', format: 'der' });
    }
    
    generateClientId() {
        return crypto.randomBytes(16).toString('base64');
    }
    
    validatePhoneNumber(phoneNumber) {
        // Remove all non-digit characters
        const cleaned = phoneNumber.replace(/\D/g, '');
        
        // Check if it's a valid international format
        if (cleaned.length < 10 || cleaned.length > 15) {
            return { valid: false, error: 'Phone number must be between 10-15 digits' };
        }
        
        // Check if it starts with country code
        if (!cleaned.startsWith('1') && !cleaned.startsWith('2') && 
            !cleaned.startsWith('3') && !cleaned.startsWith('4') && 
            !cleaned.startsWith('5') && !cleaned.startsWith('6') && 
            !cleaned.startsWith('7') && !cleaned.startsWith('8') && 
            !cleaned.startsWith('9')) {
            return { valid: false, error: 'Phone number must include country code' };
        }
        
        return { valid: true, cleaned };
    }
    
    async requestPairingCode(phoneNumber) {
        try {
            const validation = this.validatePhoneNumber(phoneNumber);
            if (!validation.valid) {
                throw new Error(validation.error);
            }
            
            this.phoneNumber = validation.cleaned;
            this.retryCount = 0;
            
            // Generate pairing code
            this.currentCode = this.generatePairingCode();
            
            // Create pairing data
            this.pairingData = this.createPairingData();
            
            // Display code if requested
            if (this.options.displayInTerminal) {
                this.displayPairingCode();
            }
            
            this.isActive = true;
            this.startExpirationTimer();
            
            this.emit('pairing.code.generated', {
                code: this.currentCode,
                phoneNumber: this.phoneNumber,
                data: this.pairingData,
                expiresIn: this.options.expirationTime
            });
            
            return {
                code: this.currentCode,
                phoneNumber: this.phoneNumber,
                expiresIn: this.options.expirationTime
            };
            
        } catch (error) {
            this.emit('error', new Error(`Pairing code request failed: ${error.message}`));
            throw error;
        }
    }
    
    generatePairingCode() {
        const chars = '0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ';
        let code = '';
        
        for (let i = 0; i < this.options.pairingCodeLength; i++) {
            code += chars.charAt(Math.floor(Math.random() * chars.length));
        }
        
        return code;
    }
    
    createPairingData() {
        const publicKeyB64 = Buffer.from(this.publicKey).toString('base64');
        
        return {
            phoneNumber: this.phoneNumber,
            code: this.currentCode,
            publicKey: publicKeyB64,
            clientId: this.clientId,
            timestamp: Date.now(),
            version: [2, 2147, 10],
            platform: 'web',
            method: 'pairing_code'
        };
    }
    
    displayPairingCode() {
        console.log('\n=== WhatsApp Pairing Code ===');
        console.log(`Phone: +${this.phoneNumber}`);
        console.log(`Code: ${this.formatPairingCode(this.currentCode)}`);
        console.log(`Expires in: ${Math.floor(this.options.expirationTime / 1000)} seconds`);
        console.log('Enter this code in WhatsApp to connect\n');
    }
    
    formatPairingCode(code) {
        // Format as XXXX-XXXX for better readability
        if (code.length === 8) {
            return `${code.substring(0, 4)}-${code.substring(4)}`;
        }
        return code;
    }
    
    startExpirationTimer() {
        if (this.expirationTimer) {
            clearTimeout(this.expirationTimer);
        }
        
        this.expirationTimer = setTimeout(() => {
            this.handleExpiration();
        }, this.options.expirationTime);
    }
    
    stopExpirationTimer() {
        if (this.expirationTimer) {
            clearTimeout(this.expirationTimer);
            this.expirationTimer = null;
        }
    }
    
    handleExpiration() {
        if (!this.isActive || this.isPaired) {
            return;
        }
        
        this.emit('pairing.code.expired', {
            code: this.currentCode,
            phoneNumber: this.phoneNumber,
            retryCount: this.retryCount
        });
        
        if (this.retryCount < this.options.maxRetries) {
            this.retryPairingCode();
        } else {
            this.emit('pairing.max.retries.reached');
            this.stop();
        }
    }
    
    async retryPairingCode() {
        try {
            this.retryCount++;
            
            await new Promise(resolve => setTimeout(resolve, this.options.retryDelay));
            
            // Generate new code
            this.currentCode = this.generatePairingCode();
            this.pairingData = this.createPairingData();
            
            if (this.options.displayInTerminal) {
                this.displayPairingCode();
            }
            
            this.startExpirationTimer();
            
            this.emit('pairing.code.retry', {
                code: this.currentCode,
                phoneNumber: this.phoneNumber,
                retryCount: this.retryCount,
                expiresIn: this.options.expirationTime
            });
            
        } catch (error) {
            this.emit('error', new Error(`Pairing code retry failed: ${error.message}`));
        }
    }
    
    validatePairingResponse(response) {
        try {
            if (!response || typeof response !== 'object') {
                return { valid: false, error: 'Invalid response format' };
            }
            
            const requiredFields = ['code', 'publicKey', 'privateKey'];
            for (const field of requiredFields) {
                if (!response[field]) {
                    return { valid: false, error: `Missing required field: ${field}` };
                }
            }
            
            // Validate code matches
            if (response.code !== this.currentCode) {
                return { valid: false, error: 'Invalid pairing code' };
            }
            
            // Validate key formats
            try {
                Buffer.from(response.publicKey, 'base64');
                Buffer.from(response.privateKey, 'base64');
            } catch (error) {
                return { valid: false, error: 'Invalid key format' };
            }
            
            return { valid: true };
            
        } catch (error) {
            return { valid: false, error: error.message };
        }
    }
    
    processPairingResponse(response) {
        const validation = this.validatePairingResponse(response);
        
        if (!validation.valid) {
            this.emit('pairing.response.invalid', validation.error);
            return false;
        }
        
        this.isPaired = true;
        this.stop();
        
        this.emit('pairing.success', {
            response,
            pairingData: this.pairingData,
            phoneNumber: this.phoneNumber,
            timestamp: Date.now()
        });
        
        return true;
    }
    
    getPairingInfo() {
        return {
            code: this.currentCode,
            phoneNumber: this.phoneNumber,
            data: this.pairingData,
            isActive: this.isActive,
            isPaired: this.isPaired,
            retryCount: this.retryCount,
            maxRetries: this.options.maxRetries,
            expirationTime: this.options.expirationTime,
            timeRemaining: this.getTimeRemaining()
        };
    }
    
    getTimeRemaining() {
        if (!this.isActive || !this.pairingData) {
            return 0;
        }
        
        const elapsed = Date.now() - this.pairingData.timestamp;
        const remaining = this.options.expirationTime - elapsed;
        
        return Math.max(0, remaining);
    }
    
    getKeys() {
        return {
            publicKey: this.publicKey,
            privateKey: this.privateKey,
            clientId: this.clientId
        };
    }
    
    refreshCode() {
        if (!this.isActive || this.isPaired) {
            return false;
        }
        
        this.stopExpirationTimer();
        this.currentCode = this.generatePairingCode();
        this.pairingData = this.createPairingData();
        
        if (this.options.displayInTerminal) {
            this.displayPairingCode();
        }
        
        this.startExpirationTimer();
        
        this.emit('pairing.code.refreshed', {
            code: this.currentCode,
            phoneNumber: this.phoneNumber,
            expiresIn: this.options.expirationTime
        });
        
        return true;
    }
    
    stop() {
        this.isActive = false;
        this.stopExpirationTimer();
        this.emit('pairing.stopped');
    }
    
    clear() {
        this.currentCode = null;
        this.phoneNumber = null;
        this.pairingData = null;
        this.retryCount = 0;
        this.isPaired = false;
        this.emit('pairing.cleared');
    }
    
    // Utility methods
    formatPhoneNumber(phoneNumber) {
        const cleaned = phoneNumber.replace(/\D/g, '');
        
        // Format based on length
        if (cleaned.length === 10) {
            return `+1${cleaned}`;
        } else if (cleaned.length === 11 && cleaned.startsWith('1')) {
            return `+${cleaned}`;
        } else {
            return `+${cleaned}`;
        }
    }
    
    isCodeExpired() {
        return this.getTimeRemaining() <= 0;
    }
    
    getFormattedTimeRemaining() {
        const remaining = this.getTimeRemaining();
        const minutes = Math.floor(remaining / 60000);
        const seconds = Math.floor((remaining % 60000) / 1000);
        
        return `${minutes}:${seconds.toString().padStart(2, '0')}`;
    }
    
    getPairingStats() {
        return {
            hasCode: !!this.currentCode,
            isActive: this.isActive,
            isPaired: this.isPaired,
            retries: this.retryCount,
            maxRetries: this.options.maxRetries,
            phoneNumber: this.phoneNumber,
            timeRemaining: this.getTimeRemaining(),
            formattedTimeRemaining: this.getFormattedTimeRemaining(),
            expirationTime: this.options.expirationTime
        };
    }
    
    // Event handlers for external integration
    onCodeGenerated(callback) {
        this.on('pairing.code.generated', callback);
    }
    
    onCodeExpired(callback) {
        this.on('pairing.code.expired', callback);
    }
    
    onCodeRetry(callback) {
        this.on('pairing.code.retry', callback);
    }
    
    onPairingSuccess(callback) {
        this.on('pairing.success', callback);
    }
    
    onPairingInvalid(callback) {
        this.on('pairing.response.invalid', callback);
    }
    
    onError(callback) {
        this.on('error', callback);
    }
    
    onStopped(callback) {
        this.on('pairing.stopped', callback);
    }
    
    cleanup() {
        this.stop();
        this.clear();
        
        // Clear keys for security
        this.publicKey = null;
        this.privateKey = null;
        this.clientId = null;
        this.serverRef = null;
        
        this.removeAllListeners();
    }
}

module.exports = WAPairingHandler;
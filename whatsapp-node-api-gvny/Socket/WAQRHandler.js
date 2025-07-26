const QRCode = require('qrcode');
const QRTerminal = require('qrcode-terminal');
const { EventEmitter } = require('events');
const crypto = require('crypto');

class WAQRHandler extends EventEmitter {
    constructor(options = {}) {
        super();
        this.options = {
            displayInTerminal: options.displayInTerminal !== false,
            generateImage: options.generateImage !== false,
            imageOptions: {
                type: 'png',
                quality: 0.92,
                margin: 1,
                color: {
                    dark: '#000000',
                    light: '#FFFFFF'
                },
                width: 256,
                ...options.imageOptions
            },
            terminalOptions: {
                small: true,
                ...options.terminalOptions
            },
            refreshInterval: options.refreshInterval || 20000,
            maxRetries: options.maxRetries || 5,
            ...options
        };
        
        this.currentQR = null;
        this.qrData = null;
        this.qrImage = null;
        this.refreshTimer = null;
        this.retryCount = 0;
        this.isActive = false;
        
        // QR code generation state
        this.publicKey = null;
        this.privateKey = null;
        this.clientId = null;
        this.serverRef = null;
        this.advSecretKey = null;
        
        this.init();
    }
    
    init() {
        this.generateKeys();
        this.clientId = this.generateClientId();
        this.emit('qr.handler.ready');
    }
    
    generateKeys() {
        const keyPair = crypto.generateKeyPairSync('x25519');
        this.privateKey = keyPair.privateKey.export({ type: 'pkcs8', format: 'der' });
        this.publicKey = keyPair.publicKey.export({ type: 'spki', format: 'der' });
        
        // Generate advertising secret key
        this.advSecretKey = crypto.randomBytes(32);
    }
    
    generateClientId() {
        return crypto.randomBytes(16).toString('base64');
    }
    
    async generateQR(serverRef = null) {
        try {
            this.serverRef = serverRef || this.generateServerRef();
            this.retryCount = 0;
            
            // Create QR data
            this.qrData = this.createQRData();
            
            // Generate QR code string
            this.currentQR = this.encodeQRData(this.qrData);
            
            // Generate QR image if requested
            if (this.options.generateImage) {
                this.qrImage = await this.generateQRImage(this.currentQR);
            }
            
            // Display in terminal if requested
            if (this.options.displayInTerminal) {
                this.displayInTerminal(this.currentQR);
            }
            
            this.isActive = true;
            this.startRefreshTimer();
            
            this.emit('qr.generated', {
                qr: this.currentQR,
                image: this.qrImage,
                data: this.qrData
            });
            
            return {
                qr: this.currentQR,
                image: this.qrImage,
                data: this.qrData
            };
            
        } catch (error) {
            this.emit('error', new Error(`QR generation failed: ${error.message}`));
            throw error;
        }
    }
    
    generateServerRef() {
        return crypto.randomBytes(16).toString('base64');
    }
    
    createQRData() {
        const publicKeyB64 = Buffer.from(this.publicKey).toString('base64');
        const advSecretKeyB64 = this.advSecretKey.toString('base64');
        
        return {
            ref: this.serverRef,
            publicKey: publicKeyB64,
            clientId: this.clientId,
            advSecretKey: advSecretKeyB64,
            timestamp: Date.now(),
            version: [2, 2147, 10],
            platform: 'web'
        };
    }
    
    encodeQRData(data) {
        // Create QR string in WhatsApp format
        const qrString = [
            data.ref,
            data.publicKey,
            data.clientId,
            data.advSecretKey
        ].join(',');
        
        return qrString;
    }
    
    async generateQRImage(qrString) {
        try {
            const qrImage = await QRCode.toDataURL(qrString, this.options.imageOptions);
            return qrImage;
        } catch (error) {
            this.emit('error', new Error(`QR image generation failed: ${error.message}`));
            return null;
        }
    }
    
    displayInTerminal(qrString) {
        try {
            console.log('\n=== WhatsApp QR Code ===');
            QRTerminal.generate(qrString, this.options.terminalOptions);
            console.log('\nScan this QR code with WhatsApp to connect');
            console.log('QR Code will refresh automatically\n');
        } catch (error) {
            this.emit('error', new Error(`Terminal display failed: ${error.message}`));
        }
    }
    
    startRefreshTimer() {
        if (this.refreshTimer) {
            clearTimeout(this.refreshTimer);
        }
        
        this.refreshTimer = setTimeout(() => {
            this.refreshQR();
        }, this.options.refreshInterval);
    }
    
    stopRefreshTimer() {
        if (this.refreshTimer) {
            clearTimeout(this.refreshTimer);
            this.refreshTimer = null;
        }
    }
    
    async refreshQR() {
        if (!this.isActive) {
            return;
        }
        
        try {
            if (this.retryCount >= this.options.maxRetries) {
                this.emit('qr.max.retries.reached');
                this.stop();
                return;
            }
            
            this.retryCount++;
            
            // Generate new keys for security
            this.generateKeys();
            
            await this.generateQR(this.serverRef);
            
            this.emit('qr.refreshed', {
                qr: this.currentQR,
                image: this.qrImage,
                data: this.qrData,
                retryCount: this.retryCount
            });
            
        } catch (error) {
            this.emit('error', new Error(`QR refresh failed: ${error.message}`));
            
            if (this.retryCount < this.options.maxRetries) {
                this.startRefreshTimer();
            } else {
                this.stop();
            }
        }
    }
    
    validateQRScan(scanData) {
        try {
            // Validate scan data structure
            if (!scanData || typeof scanData !== 'object') {
                return { valid: false, error: 'Invalid scan data format' };
            }
            
            const requiredFields = ['publicKey', 'privateKey', 'clientId'];
            for (const field of requiredFields) {
                if (!scanData[field]) {
                    return { valid: false, error: `Missing required field: ${field}` };
                }
            }
            
            // Validate key formats
            try {
                Buffer.from(scanData.publicKey, 'base64');
                Buffer.from(scanData.privateKey, 'base64');
            } catch (error) {
                return { valid: false, error: 'Invalid key format' };
            }
            
            return { valid: true };
            
        } catch (error) {
            return { valid: false, error: error.message };
        }
    }
    
    processQRScan(scanData) {
        const validation = this.validateQRScan(scanData);
        
        if (!validation.valid) {
            this.emit('qr.scan.invalid', validation.error);
            return false;
        }
        
        this.stop();
        
        this.emit('qr.scan.success', {
            scanData,
            qrData: this.qrData,
            timestamp: Date.now()
        });
        
        return true;
    }
    
    getQRInfo() {
        return {
            current: this.currentQR,
            image: this.qrImage,
            data: this.qrData,
            isActive: this.isActive,
            retryCount: this.retryCount,
            maxRetries: this.options.maxRetries,
            refreshInterval: this.options.refreshInterval
        };
    }
    
    getKeys() {
        return {
            publicKey: this.publicKey,
            privateKey: this.privateKey,
            clientId: this.clientId,
            advSecretKey: this.advSecretKey
        };
    }
    
    updateOptions(newOptions) {
        this.options = { ...this.options, ...newOptions };
        this.emit('options.updated', this.options);
    }
    
    stop() {
        this.isActive = false;
        this.stopRefreshTimer();
        this.emit('qr.stopped');
    }
    
    restart() {
        this.stop();
        setTimeout(() => {
            this.generateQR();
        }, 1000);
    }
    
    clear() {
        this.currentQR = null;
        this.qrData = null;
        this.qrImage = null;
        this.retryCount = 0;
        this.emit('qr.cleared');
    }
    
    // Utility methods
    async saveQRImage(filePath) {
        if (!this.qrImage) {
            throw new Error('No QR image available');
        }
        
        try {
            const fs = require('fs').promises;
            const base64Data = this.qrImage.replace(/^data:image\/png;base64,/, '');
            await fs.writeFile(filePath, base64Data, 'base64');
            
            this.emit('qr.image.saved', filePath);
            return filePath;
        } catch (error) {
            this.emit('error', new Error(`Failed to save QR image: ${error.message}`));
            throw error;
        }
    }
    
    async generateQRBuffer() {
        if (!this.currentQR) {
            throw new Error('No QR code available');
        }
        
        try {
            const buffer = await QRCode.toBuffer(this.currentQR, this.options.imageOptions);
            return buffer;
        } catch (error) {
            this.emit('error', new Error(`Failed to generate QR buffer: ${error.message}`));
            throw error;
        }
    }
    
    async generateQRSVG() {
        if (!this.currentQR) {
            throw new Error('No QR code available');
        }
        
        try {
            const svg = await QRCode.toString(this.currentQR, { type: 'svg', ...this.options.imageOptions });
            return svg;
        } catch (error) {
            this.emit('error', new Error(`Failed to generate QR SVG: ${error.message}`));
            throw error;
        }
    }
    
    getQRStats() {
        return {
            generated: !!this.currentQR,
            retries: this.retryCount,
            maxRetries: this.options.maxRetries,
            active: this.isActive,
            hasImage: !!this.qrImage,
            lastGenerated: this.qrData?.timestamp,
            refreshInterval: this.options.refreshInterval
        };
    }
    
    // Event handlers for external integration
    onScanSuccess(callback) {
        this.on('qr.scan.success', callback);
    }
    
    onScanInvalid(callback) {
        this.on('qr.scan.invalid', callback);
    }
    
    onGenerated(callback) {
        this.on('qr.generated', callback);
    }
    
    onRefreshed(callback) {
        this.on('qr.refreshed', callback);
    }
    
    onError(callback) {
        this.on('error', callback);
    }
    
    onStopped(callback) {
        this.on('qr.stopped', callback);
    }
    
    cleanup() {
        this.stop();
        this.clear();
        
        // Clear keys for security
        this.publicKey = null;
        this.privateKey = null;
        this.clientId = null;
        this.serverRef = null;
        this.advSecretKey = null;
        
        this.removeAllListeners();
    }
}

module.exports = WAQRHandler;
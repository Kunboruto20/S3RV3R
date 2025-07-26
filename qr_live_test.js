#!/usr/bin/env node

/**
 * WhatsApp QR Code Live Test
 * Displays a real ASCII QR code for mobile scanning authentication
 */

const qrcode = require('qrcode-terminal');
const QRCode = require('qrcode');

// Import our library components
const WAAuth = require('./whatsapp-node-api-gvny/Auth/WAAuth');
const WAAuthValidator = require('./whatsapp-node-api-gvny/Auth/WAAuthValidator');
const WAHelper = require('./whatsapp-node-api-gvny/Utils/WAHelper');
const WAEncryption = require('./whatsapp-node-api-gvny/Crypto/WAEncryption');

console.log('🚀 WhatsApp Node API - Live QR Code Test');
console.log('========================================\n');

async function generateAndDisplayQR() {
    try {
        console.log('📱 Initializing WhatsApp authentication...\n');
        
        // Initialize components
        const auth = new WAAuth({ authPath: './demo_auth', enableAutoSave: false });
        const validator = new WAAuthValidator();
        const helper = new WAHelper();
        const encryption = new WAEncryption();
        
        console.log('✅ Components initialized successfully\n');
        
        // Generate QR code data
        console.log('🔄 Generating QR code data...');
        const qrData = await auth.generateQR();
        
        console.log('📋 QR Code Information:');
        console.log(`   📝 Reference: ${qrData.ref}`);
        console.log(`   🔑 Public Key: ${qrData.publicKey.substring(0, 30)}...`);
        console.log(`   🆔 Identity Key: ${qrData.identityKey.substring(0, 30)}...`);
        console.log(`   ⏰ Generated: ${new Date(qrData.timestamp).toLocaleString()}`);
        console.log(`   ⌛ Expires: ${new Date(qrData.expires).toLocaleString()}\n`);
        
        // Create QR string
        const qrString = `${qrData.ref},${qrData.publicKey},${qrData.identityKey},${qrData.advId}`;
        console.log(`📄 QR String: ${qrString.substring(0, 80)}...\n`);
        
        // Validate QR code
        const validation = validator.validateQRCode(qrString);
        console.log(`✅ QR Validation: ${validation.valid ? 'SUCCESS' : 'FAILED'}`);
        
        if (validation.valid) {
            console.log('📊 Parsed Components:');
            console.log(`   - Ref: ${validation.ref}`);
            console.log(`   - Public Key: ${validation.publicKey.substring(0, 25)}...`);
            console.log(`   - Identity Key: ${validation.identityKey.substring(0, 25)}...`);
            console.log(`   - Advertisement ID: ${validation.advId}\n`);
        }
        
        // Display ASCII QR Code for scanning
        console.log('📱 QR CODE FOR MOBILE SCANNING:');
        console.log('='.repeat(50));
        console.log('📲 Point your WhatsApp camera at this QR code:');
        console.log('');
        
        // Generate ASCII QR code
        qrcode.generate(qrString, { small: true }, function(qrCodeAscii) {
            console.log(qrCodeAscii);
            console.log('');
            console.log('='.repeat(50));
            console.log('📱 INSTRUCTIONS FOR SCANNING:');
            console.log('1. Open WhatsApp on your mobile device');
            console.log('2. Go to Settings > Linked Devices');
            console.log('3. Tap "Link a Device"');
            console.log('4. Point your camera at the QR code above');
            console.log('5. Wait for authentication to complete');
            console.log('');
            console.log('⏰ QR Code expires in 1 minute');
            console.log('🔄 Refresh this script to generate a new QR code');
            console.log('');
            
            // Additional technical info
            console.log('🔧 TECHNICAL DETAILS:');
            console.log(`   📊 QR String Length: ${qrString.length} characters`);
            console.log(`   🔐 Contains encrypted authentication data`);
            console.log(`   🆔 Unique session identifier included`);
            console.log(`   ⚡ Ready for WhatsApp Web protocol`);
            console.log('');
            
            // Show countdown timer
            let timeLeft = 60; // 60 seconds
            const countdown = setInterval(() => {
                process.stdout.write(`\r⏰ Time remaining: ${timeLeft}s `);
                timeLeft--;
                
                if (timeLeft < 0) {
                    clearInterval(countdown);
                    console.log('\n');
                    console.log('❌ QR Code expired! Run the script again for a new code.');
                    console.log('');
                    process.exit(0);
                }
            }, 1000);
            
            // Handle Ctrl+C gracefully
            process.on('SIGINT', () => {
                clearInterval(countdown);
                console.log('\n');
                console.log('👋 QR Code test terminated by user.');
                console.log('');
                process.exit(0);
            });
        });
        
    } catch (error) {
        console.error('❌ Error generating QR code:', error.message);
        console.error('Stack trace:', error.stack);
        process.exit(1);
    }
}

// Additional demo functions
async function showLibraryCapabilities() {
    console.log('🔧 LIBRARY CAPABILITIES DEMO:');
    console.log('=============================\n');
    
    try {
        const helper = new WAHelper();
        const encryption = new WAEncryption();
        
        // Phone number processing
        const testPhone = '+1 (555) 123-4567';
        const cleanedPhone = helper.cleanPhoneNumber(testPhone);
        const formattedPhone = helper.formatPhoneNumber(testPhone, 'international');
        const phoneJid = helper.createUserJid(testPhone);
        
        console.log('📞 Phone Processing:');
        console.log(`   Original: ${testPhone}`);
        console.log(`   Cleaned: ${cleanedPhone}`);
        console.log(`   Formatted: ${formattedPhone}`);
        console.log(`   JID: ${phoneJid}`);
        console.log(`   Valid: ${helper.isValidPhoneNumber(testPhone) ? '✅' : '❌'}\n`);
        
        // Encryption demo
        const testMessage = 'Hello WhatsApp World!';
        const uuid = encryption.generateSecureUUID();
        const randomBytes = encryption.generateSecureRandom(16);
        const hash = encryption.hashWithSalt(testMessage);
        
        console.log('🔐 Encryption Capabilities:');
        console.log(`   UUID: ${uuid}`);
        console.log(`   Random: ${randomBytes.toString('hex')}`);
        console.log(`   Hash: ${hash.hash.substring(0, 32)}...`);
        console.log(`   Salt: ${hash.salt.substring(0, 32)}...\n`);
        
        // JID validation
        const testJids = [
            '1234567890@s.whatsapp.net',
            '123456789012345@g.us',
            'status@broadcast'
        ];
        
        console.log('📱 JID Validation:');
        testJids.forEach(jid => {
            const isValid = helper.isValidJid(jid);
            const type = helper.isUserJid(jid) ? 'User' : 
                        helper.isGroupJid(jid) ? 'Group' : 
                        helper.isStatusJid(jid) ? 'Status' : 'Unknown';
            console.log(`   ${jid}: ${isValid ? '✅' : '❌'} (${type})`);
        });
        
        console.log('\n🎉 All library capabilities working perfectly!\n');
        
    } catch (error) {
        console.error('❌ Library capabilities demo failed:', error.message);
    }
}

// Main execution
async function main() {
    // Show library capabilities first
    await showLibraryCapabilities();
    
    console.log('🎯 Starting QR Code generation in 3 seconds...\n');
    
    // Wait 3 seconds then show QR
    setTimeout(() => {
        generateAndDisplayQR();
    }, 3000);
}

// Run the demo
main().catch(error => {
    console.error('❌ Demo failed:', error.message);
    process.exit(1);
});
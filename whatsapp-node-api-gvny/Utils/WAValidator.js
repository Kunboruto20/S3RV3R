/**
 * WhatsApp Validator Utility
 * Provides validation functions for WhatsApp data types and formats
 */
class WAValidator {
    
    // JID (WhatsApp ID) validation
    static isValidJID(jid) {
        if (!jid || typeof jid !== 'string') return false;
        
        // Basic JID format: number@s.whatsapp.net or number-timestamp@g.us
        const jidRegex = /^[0-9]+(-[0-9]+)?@(s\.whatsapp\.net|g\.us|c\.us)$/;
        return jidRegex.test(jid);
    }

    // Phone number validation
    static isValidPhoneNumber(phone) {
        if (!phone || typeof phone !== 'string') return false;
        
        // Remove all non-digit characters
        const cleaned = phone.replace(/\D/g, '');
        
        // Should be between 7 and 15 digits (international standard)
        return cleaned.length >= 7 && cleaned.length <= 15;
    }

    // Message validation
    static isValidMessage(message) {
        if (!message || typeof message !== 'object') return false;
        
        // Must have at least one message type
        const messageTypes = [
            'conversation', 'imageMessage', 'videoMessage', 'audioMessage',
            'documentMessage', 'locationMessage', 'contactMessage',
            'extendedTextMessage', 'stickerMessage', 'reactionMessage'
        ];
        
        return messageTypes.some(type => message.hasOwnProperty(type));
    }

    // Group JID validation
    static isValidGroupJID(jid) {
        if (!this.isValidJID(jid)) return false;
        return jid.endsWith('@g.us');
    }

    // Individual JID validation
    static isValidIndividualJID(jid) {
        if (!this.isValidJID(jid)) return false;
        return jid.endsWith('@s.whatsapp.net');
    }

    // Media message validation
    static isValidMediaMessage(message) {
        const mediaTypes = ['imageMessage', 'videoMessage', 'audioMessage', 'documentMessage'];
        return mediaTypes.some(type => message.hasOwnProperty(type));
    }

    // URL validation
    static isValidURL(url) {
        if (!url || typeof url !== 'string') return false;
        
        try {
            new URL(url);
            return true;
        } catch {
            return false;
        }
    }

    // Email validation
    static isValidEmail(email) {
        if (!email || typeof email !== 'string') return false;
        
        const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
        return emailRegex.test(email);
    }

    // Sanitize text input
    static sanitizeText(text) {
        if (!text || typeof text !== 'string') return '';
        
        // Remove potentially dangerous characters
        return text.replace(/[<>\"'&]/g, '').trim();
    }

    // Validate message content length
    static isValidMessageLength(content, maxLength = 65536) {
        if (!content || typeof content !== 'string') return false;
        return content.length <= maxLength;
    }

    // Validate file size
    static isValidFileSize(size, maxSize = 100 * 1024 * 1024) { // 100MB default
        return typeof size === 'number' && size > 0 && size <= maxSize;
    }

    // Validate MIME type
    static isValidMimeType(mimeType, allowedTypes = []) {
        if (!mimeType || typeof mimeType !== 'string') return false;
        
        if (allowedTypes.length === 0) {
            // Basic MIME type format validation
            const mimeRegex = /^[a-zA-Z0-9][a-zA-Z0-9!#$&\-\^_]*\/[a-zA-Z0-9][a-zA-Z0-9!#$&\-\^_.]*$/;
            return mimeRegex.test(mimeType);
        }
        
        return allowedTypes.includes(mimeType);
    }

    // Validate coordinates
    static isValidCoordinates(latitude, longitude) {
        const lat = parseFloat(latitude);
        const lng = parseFloat(longitude);
        
        return !isNaN(lat) && !isNaN(lng) && 
               lat >= -90 && lat <= 90 && 
               lng >= -180 && lng <= 180;
    }

    // Validate timestamp
    static isValidTimestamp(timestamp) {
        const ts = parseInt(timestamp);
        return !isNaN(ts) && ts > 0 && ts <= Date.now() / 1000 + 86400; // Allow 1 day in future
    }

    // Validate hex color
    static isValidHexColor(color) {
        if (!color || typeof color !== 'string') return false;
        
        const hexRegex = /^#([A-Fa-f0-9]{6}|[A-Fa-f0-9]{3})$/;
        return hexRegex.test(color);
    }

    // Validate base64 string
    static isValidBase64(str) {
        if (!str || typeof str !== 'string') return false;
        
        try {
            return btoa(atob(str)) === str;
        } catch {
            return false;
        }
    }
}

module.exports = WAValidator;
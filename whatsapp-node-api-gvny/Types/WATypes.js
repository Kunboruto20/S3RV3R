class WATypes {
    static get MessageTypes() {
        return {
            CONVERSATION: 'conversation',
            EXTENDED_TEXT: 'extendedTextMessage',
            IMAGE: 'imageMessage',
            VIDEO: 'videoMessage',
            AUDIO: 'audioMessage',
            DOCUMENT: 'documentMessage',
            STICKER: 'stickerMessage',
            LOCATION: 'locationMessage',
            LIVE_LOCATION: 'liveLocationMessage',
            CONTACT: 'contactMessage',
            CONTACT_ARRAY: 'contactsArrayMessage',
            GROUP_INVITE: 'groupInviteMessage',
            LIST: 'listMessage',
            LIST_RESPONSE: 'listResponseMessage',
            BUTTON: 'buttonsMessage',
            BUTTON_RESPONSE: 'buttonsResponseMessage',
            TEMPLATE: 'templateMessage',
            TEMPLATE_RESPONSE: 'templateButtonReplyMessage',
            HSM: 'highlyStructuredMessage',
            PRODUCT: 'productMessage',
            ORDER: 'orderMessage',
            INVOICE: 'invoiceMessage',
            PAYMENT: 'paymentMessage',
            POLL_CREATION: 'pollCreationMessage',
            POLL_UPDATE: 'pollUpdateMessage',
            REACTION: 'reactionMessage',
            EPHEMERAL: 'ephemeralMessage',
            VIEW_ONCE: 'viewOnceMessage',
            PROTOCOL: 'protocolMessage',
            SENDER_KEY_DISTRIBUTION: 'senderKeyDistributionMessage',
            FAST_RATCHET_KEEPER_STATE: 'fastRatchetKeeperStateMessage',
            SEND_PAYMENT: 'sendPaymentMessage',
            REQUEST_PAYMENT: 'requestPaymentMessage',
            DECLINE_PAYMENT: 'declinePaymentRequestMessage',
            CANCEL_PAYMENT: 'cancelPaymentRequestMessage',
            KEEP_IN_CHAT: 'keepInChatMessage',
            DEVICE_SENT: 'deviceSentMessage',
            DEVICE_SYNC: 'deviceSyncMessage',
            CALL: 'call',
            CHAT: 'chat',
            PROTOCOL_MESSAGE: 'protocolMessage'
        };
    }
    
    static get ChatTypes() {
        return {
            INDIVIDUAL: 'individual',
            GROUP: 'group',
            BROADCAST: 'broadcast',
            STATUS: 'status'
        };
    }
    
    static get PresenceTypes() {
        return {
            UNAVAILABLE: 'unavailable',
            AVAILABLE: 'available',
            COMPOSING: 'composing',
            RECORDING: 'recording',
            PAUSED: 'paused'
        };
    }
    
    static get ConnectionState() {
        return {
            CLOSE: 'close',
            CONNECTING: 'connecting',
            OPEN: 'open'
        };
    }
    
    static get DisconnectReason() {
        return {
            CONNECTION_CLOSED: 'Connection Closed',
            CONNECTION_LOST: 'Connection Lost',
            CONNECTION_REPLACED: 'Connection Replaced',
            TIMED_OUT: 'Timed Out',
            LOGGED_OUT: 'Logged Out',
            BAD_SESSION: 'Bad Session',
            RESTART_REQUIRED: 'Restart Required',
            MULTIDEVICE_MISMATCH: 'Multidevice Mismatch'
        };
    }
    
    static get WAMessageStatus() {
        return {
            PENDING: 0,
            SERVER_ACK: 1,
            DELIVERY_ACK: 2,
            READ: 3,
            PLAYED: 4,
            ERROR: -1
        };
    }
    
    static get MediaType() {
        return {
            IMAGE: 'image',
            VIDEO: 'video',
            AUDIO: 'audio',
            DOCUMENT: 'document',
            STICKER: 'sticker'
        };
    }
    
    static get GroupRole() {
        return {
            MEMBER: 'member',
            ADMIN: 'admin',
            SUPER_ADMIN: 'superadmin'
        };
    }
    
    static get GroupAction() {
        return {
            ADD: 'add',
            REMOVE: 'remove',
            PROMOTE: 'promote',
            DEMOTE: 'demote',
            LEAVE: 'leave',
            CREATE: 'create',
            UPDATE: 'update'
        };
    }
    
    static get CallType() {
        return {
            VOICE: 'voice',
            VIDEO: 'video'
        };
    }
    
    static get CallStatus() {
        return {
            OFFER: 'offer',
            ACCEPT: 'accept',
            REJECT: 'reject',
            TIMEOUT: 'timeout',
            END: 'end'
        };
    }
    
    static get BusinessType() {
        return {
            CATALOG: 'catalog',
            PRODUCT: 'product',
            ORDER: 'order',
            INVOICE: 'invoice',
            COLLECTION: 'collection'
        };
    }
    
    static get PrivacySetting() {
        return {
            LAST_SEEN: 'last_seen',
            PROFILE_PHOTO: 'profile_photo',
            STATUS: 'status',
            READ_RECEIPTS: 'read_receipts',
            GROUPS: 'groups',
            CALLS: 'calls'
        };
    }
    
    static get PrivacyValue() {
        return {
            EVERYONE: 'all',
            CONTACTS: 'contacts',
            NOBODY: 'none'
        };
    }
    
    // Message key structure
    static createMessageKey(remoteJid, id, fromMe = true, participant = null) {
        const key = {
            remoteJid,
            fromMe,
            id
        };
        
        if (participant) {
            key.participant = participant;
        }
        
        return key;
    }
    
    // Contact structure
    static createContact(jid, name = null, pushName = null, profilePicture = null) {
        return {
            id: jid,
            name,
            pushName,
            profilePicture,
            status: null,
            lastSeen: null,
            isBlocked: false,
            isContact: false,
            isBusiness: false,
            businessProfile: null,
            updatedAt: Date.now()
        };
    }
    
    // Chat structure
    static createChat(jid, name = null, type = 'individual') {
        return {
            id: jid,
            name,
            type,
            unreadCount: 0,
            lastMessage: null,
            lastMessageTime: null,
            pinned: false,
            archived: false,
            muted: false,
            muteEndTime: null,
            ephemeralExpiration: null,
            ephemeralSettingTimestamp: null,
            conversationTimestamp: Date.now(),
            createdAt: Date.now(),
            updatedAt: Date.now()
        };
    }
    
    // Group structure
    static createGroup(jid, subject = null, description = null, owner = null) {
        return {
            id: jid,
            subject,
            description,
            owner,
            participants: [],
            admins: [],
            creation: Date.now(),
            restrict: false,
            announce: false,
            size: 0,
            inviteCode: null,
            ephemeralDuration: null,
            profilePicture: null,
            updatedAt: Date.now()
        };
    }
    
    // Group participant structure
    static createGroupParticipant(jid, role = 'member', admin = null) {
        return {
            id: jid,
            role,
            admin,
            joinedAt: Date.now()
        };
    }
    
    // Message structure
    static createMessage(key, message, messageTimestamp = null, status = 0) {
        return {
            key,
            message,
            messageTimestamp: messageTimestamp || Math.floor(Date.now() / 1000),
            status,
            broadcast: false,
            fromMe: key.fromMe,
            id: key.id,
            pushName: null,
            participant: key.participant || null,
            quotedMessage: null,
            reactions: [],
            starred: false,
            updatedAt: Date.now()
        };
    }
    
    // Media message structure
    static createMediaMessage(type, url, mimetype, fileLength, fileName = null, caption = null) {
        const mediaMessage = {
            url,
            mimetype,
            fileLength,
            fileSha256: null,
            fileEncSha256: null,
            mediaKey: null,
            directPath: null,
            mediaKeyTimestamp: Date.now(),
            jpegThumbnail: null
        };
        
        if (fileName) mediaMessage.fileName = fileName;
        if (caption) mediaMessage.caption = caption;
        
        // Type-specific properties
        switch (type) {
            case 'image':
                mediaMessage.width = null;
                mediaMessage.height = null;
                break;
            case 'video':
                mediaMessage.width = null;
                mediaMessage.height = null;
                mediaMessage.seconds = null;
                mediaMessage.gifPlayback = false;
                break;
            case 'audio':
                mediaMessage.seconds = null;
                mediaMessage.ptt = false;
                mediaMessage.waveform = null;
                break;
            case 'document':
                mediaMessage.title = fileName;
                mediaMessage.pageCount = null;
                break;
            case 'sticker':
                mediaMessage.width = null;
                mediaMessage.height = null;
                mediaMessage.isAnimated = false;
                break;
        }
        
        return mediaMessage;
    }
    
    // Location message structure
    static createLocationMessage(latitude, longitude, name = null, address = null, url = null) {
        return {
            degreesLatitude: latitude,
            degreesLongitude: longitude,
            name,
            address,
            url,
            isLive: false,
            accuracyInMeters: null,
            speedInMps: null,
            degreesClockwiseFromMagneticNorth: null,
            comment: null,
            jpegThumbnail: null,
            contextInfo: null
        };
    }
    
    // Contact message structure
    static createContactMessage(displayName, vcard) {
        return {
            displayName,
            vcard
        };
    }
    
    // Button message structure
    static createButtonMessage(text, buttons, headerType = null, header = null, footer = null) {
        return {
            text,
            buttons: buttons.map((btn, index) => ({
                buttonId: btn.id || `btn_${index}`,
                buttonText: {
                    displayText: btn.text
                },
                type: 1
            })),
            headerType: headerType || 1,
            contentText: text,
            footerText: footer || null
        };
    }
    
    // List message structure
    static createListMessage(text, buttonText, sections, title = null, footer = null) {
        return {
            text,
            buttonText,
            sections: sections.map(section => ({
                title: section.title,
                rows: section.rows.map(row => ({
                    title: row.title,
                    description: row.description || null,
                    rowId: row.id
                }))
            })),
            title,
            footerText: footer
        };
    }
    
    // Poll message structure
    static createPollMessage(name, options, selectableCount = 1) {
        return {
            name,
            options: options.map(option => ({
                optionName: option
            })),
            selectableOptionsCount: selectableCount
        };
    }
    
    // Reaction message structure
    static createReactionMessage(text, key) {
        return {
            text,
            key
        };
    }
    
    // Protocol message structure
    static createProtocolMessage(type, key = null) {
        return {
            type,
            key
        };
    }
    
    // Connection update structure
    static createConnectionUpdate(connection, lastDisconnect = null, qr = null, isNewLogin = false) {
        return {
            connection,
            lastDisconnect,
            qr,
            isNewLogin,
            receivedPendingNotifications: false,
            isOnline: connection === 'open'
        };
    }
    
    // Auth state structure
    static createAuthState(creds = null, keys = null) {
        return {
            creds,
            keys
        };
    }
    
    // Presence update structure
    static createPresenceUpdate(id, presences) {
        return {
            id,
            presences
        };
    }
    
    // Call structure
    static createCall(callId, from, to, type, status, timestamp = null) {
        return {
            callId,
            from,
            to,
            type,
            status,
            timestamp: timestamp || Date.now(),
            duration: null,
            isVideo: type === 'video',
            isGroup: false
        };
    }
    
    // Business profile structure
    static createBusinessProfile(jid, name, category, description = null, website = null, email = null) {
        return {
            jid,
            name,
            category,
            description,
            website,
            email,
            address: null,
            latitude: null,
            longitude: null,
            profilePicture: null,
            isVerified: false,
            updatedAt: Date.now()
        };
    }
    
    // Product structure
    static createProduct(id, name, price, currency, description = null, imageUrl = null) {
        return {
            id,
            name,
            price,
            currency,
            description,
            imageUrl,
            availability: 'in_stock',
            category: null,
            retailerId: null,
            url: null,
            isHidden: false,
            updatedAt: Date.now()
        };
    }
    
    // Order structure
    static createOrder(id, products, total, currency, status = 'pending') {
        return {
            id,
            products,
            total,
            currency,
            status,
            createdAt: Date.now(),
            updatedAt: Date.now(),
            customerId: null,
            customerName: null,
            customerPhone: null,
            customerEmail: null,
            shippingAddress: null,
            notes: null
        };
    }
    
    // Label structure
    static createLabel(id, name, color, predefinedId = null) {
        return {
            id,
            name,
            color,
            predefinedId,
            createdAt: Date.now(),
            updatedAt: Date.now()
        };
    }
    
    // Device structure
    static createDevice(id, name, platform, platformVersion, appVersion) {
        return {
            id,
            name,
            platform,
            platformVersion,
            appVersion,
            registeredAt: Date.now(),
            lastSeen: Date.now(),
            isActive: true
        };
    }
    
    // Validation methods
    static isValidJid(jid) {
        if (!jid || typeof jid !== 'string') return false;
        const jidRegex = /^[\d\+\-]+@[sg]\.whatsapp\.net$|^[\d\+\-]+@g\.us$|^status@broadcast$/;
        return jidRegex.test(jid);
    }
    
    static isValidMessageKey(key) {
        return key && 
               typeof key === 'object' && 
               typeof key.remoteJid === 'string' && 
               typeof key.id === 'string' && 
               typeof key.fromMe === 'boolean';
    }
    
    static isValidMessage(message) {
        return message && 
               typeof message === 'object' && 
               this.isValidMessageKey(message.key) && 
               message.message && 
               typeof message.message === 'object';
    }
    
    static isGroupJid(jid) {
        return jid && jid.endsWith('@g.us');
    }
    
    static isBroadcastJid(jid) {
        return jid && jid.endsWith('@broadcast');
    }
    
    static isStatusJid(jid) {
        return jid === 'status@broadcast';
    }
    
    // Utility methods
    static extractJidUser(jid) {
        if (!jid) return null;
        const match = jid.match(/^([\d\+\-]+)@/);
        return match ? match[1] : null;
    }
    
    static normalizeJid(jid) {
        if (!jid) return null;
        
        // If it's already a valid JID, return as is
        if (this.isValidJid(jid)) {
            return jid;
        }
        
        // If it's a phone number, convert to JID
        const phoneRegex = /^[\+]?[1-9][\d]{0,15}$/;
        const cleanPhone = jid.replace(/[^\d\+]/g, '');
        
        if (phoneRegex.test(cleanPhone)) {
            return `${cleanPhone}@s.whatsapp.net`;
        }
        
        return null;
    }
    
    static createMessageId() {
        const timestamp = Date.now();
        const random = Math.random().toString(36).substring(2, 15);
        return `3EB0${random.toUpperCase()}${timestamp.toString(16).toUpperCase()}`;
    }
    
    static getMessageType(message) {
        if (!message || !message.message) return null;
        
        const messageContent = message.message;
        const types = Object.keys(this.MessageTypes);
        
        for (const type of types) {
            if (messageContent[this.MessageTypes[type]]) {
                return this.MessageTypes[type];
            }
        }
        
        return null;
    }
    
    static getMessageContent(message) {
        const messageType = this.getMessageType(message);
        if (!messageType) return null;
        
        return message.message[messageType];
    }
    
    static isMediaMessage(message) {
        const mediaTypes = [
            this.MessageTypes.IMAGE,
            this.MessageTypes.VIDEO,
            this.MessageTypes.AUDIO,
            this.MessageTypes.DOCUMENT,
            this.MessageTypes.STICKER
        ];
        
        const messageType = this.getMessageType(message);
        return mediaTypes.includes(messageType);
    }
    
    static getMediaType(message) {
        const messageType = this.getMessageType(message);
        
        switch (messageType) {
            case this.MessageTypes.IMAGE:
                return this.MediaType.IMAGE;
            case this.MessageTypes.VIDEO:
                return this.MediaType.VIDEO;
            case this.MessageTypes.AUDIO:
                return this.MediaType.AUDIO;
            case this.MessageTypes.DOCUMENT:
                return this.MediaType.DOCUMENT;
            case this.MessageTypes.STICKER:
                return this.MediaType.STICKER;
            default:
                return null;
        }
    }
    
    static createError(message, code, data = null) {
        const error = new Error(message);
        error.code = code;
        if (data) error.data = data;
        return error;
    }
}

module.exports = WATypes;
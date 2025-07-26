const crypto = require('crypto');
const { Buffer } = require('buffer');

class WAMessageHandler {
    constructor(socket) {
        this.socket = socket;
        this.pendingMessages = new Map();
        this.messageQueue = [];
        this.isProcessing = false;
        this.retryCount = new Map();
        this.maxRetries = 3;
        this.retryDelay = 1000;
        
        // Message types
        this.messageTypes = {
            TEXT: 'conversation',
            IMAGE: 'imageMessage',
            VIDEO: 'videoMessage',
            AUDIO: 'audioMessage',
            DOCUMENT: 'documentMessage',
            STICKER: 'stickerMessage',
            LOCATION: 'locationMessage',
            CONTACT: 'contactMessage',
            CONTACT_ARRAY: 'contactsArrayMessage',
            LIVE_LOCATION: 'liveLocationMessage',
            REACTION: 'reactionMessage',
            POLL: 'pollCreationMessage',
            POLL_UPDATE: 'pollUpdateMessage',
            EPHEMERAL: 'ephemeralMessage',
            VIEW_ONCE: 'viewOnceMessage',
            BUTTON_RESPONSE: 'buttonResponseMessage',
            LIST_RESPONSE: 'listResponseMessage',
            TEMPLATE: 'templateMessage',
            INTERACTIVE: 'interactiveMessage',
            PRODUCT: 'productMessage',
            ORDER: 'orderMessage',
            INVOICE: 'invoiceMessage',
            PAYMENT: 'paymentInviteMessage',
            CALL: 'call',
            PROTOCOL: 'protocolMessage'
        };
        
        // Message status
        this.messageStatus = {
            PENDING: 'pending',
            SENT: 'sent',
            DELIVERED: 'delivered',
            READ: 'read',
            FAILED: 'failed',
            DELETED: 'deleted'
        };
    }
    
    async handleIncomingMessage(node) {
        try {
            const messageInfo = this.parseMessageNode(node);
            
            if (!messageInfo) {
                return;
            }
            
            // Store message
            this.storeMessage(messageInfo);
            
            // Send receipt if required
            if (messageInfo.receipt) {
                await this.sendReceipt(messageInfo);
            }
            
            // Emit message event
            this.socket.emit('messages.upsert', {
                messages: [messageInfo],
                type: 'notify'
            });
            
            // Handle specific message types
            await this.handleSpecificMessageType(messageInfo);
            
        } catch (error) {
            this.socket.options.logger.error('Error handling incoming message:', error);
        }
    }
    
    parseMessageNode(node) {
        try {
            const attrs = node.attrs || {};
            const messageId = attrs.id;
            const from = attrs.from;
            const to = attrs.to;
            const timestamp = parseInt(attrs.t) * 1000;
            const type = attrs.type;
            
            if (!messageId || !from) {
                return null;
            }
            
            // Parse message content
            const messageContent = this.parseMessageContent(node);
            
            if (!messageContent) {
                return null;
            }
            
            const messageInfo = {
                key: {
                    id: messageId,
                    remoteJid: from,
                    fromMe: from === this.socket.user?.id,
                    participant: attrs.participant
                },
                message: messageContent,
                messageTimestamp: timestamp,
                status: this.messageStatus.DELIVERED,
                pushName: attrs.notify,
                broadcast: attrs.broadcast === 'true',
                multicast: attrs.multicast === 'true',
                edit: attrs.edit,
                receipt: type !== 'notification'
            };
            
            return messageInfo;
            
        } catch (error) {
            this.socket.options.logger.error('Error parsing message node:', error);
            return null;
        }
    }
    
    parseMessageContent(node) {
        try {
            const content = {};
            
            for (const child of node.content || []) {
                if (typeof child === 'object' && child.tag) {
                    switch (child.tag) {
                        case 'conversation':
                            content.conversation = child.content;
                            break;
                        case 'extendedTextMessage':
                            content.extendedTextMessage = this.parseExtendedTextMessage(child);
                            break;
                        case 'imageMessage':
                        case 'videoMessage':
                        case 'audioMessage':
                        case 'documentMessage':
                        case 'stickerMessage':
                            content[child.tag] = this.parseMediaMessage(child);
                            break;
                        case 'locationMessage':
                            content.locationMessage = this.parseLocationMessage(child);
                            break;
                        case 'contactMessage':
                            content.contactMessage = this.parseContactMessage(child);
                            break;
                        case 'reactionMessage':
                            content.reactionMessage = this.parseReactionMessage(child);
                            break;
                        case 'pollCreationMessage':
                            content.pollCreationMessage = this.parsePollMessage(child);
                            break;
                        case 'protocolMessage':
                            content.protocolMessage = this.parseProtocolMessage(child);
                            break;
                        default:
                            content[child.tag] = child.content || child.attrs;
                    }
                }
            }
            
            return Object.keys(content).length > 0 ? content : null;
            
        } catch (error) {
            this.socket.options.logger.error('Error parsing message content:', error);
            return null;
        }
    }
    
    parseExtendedTextMessage(node) {
        const attrs = node.attrs || {};
        const content = {
            text: node.content,
            matchedText: attrs.matchedText,
            canonicalUrl: attrs.canonicalUrl,
            description: attrs.description,
            title: attrs.title,
            previewType: attrs.previewType
        };
        
        // Parse context info
        if (node.content && Array.isArray(node.content)) {
            for (const child of node.content) {
                if (child.tag === 'contextInfo') {
                    content.contextInfo = this.parseContextInfo(child);
                }
            }
        }
        
        return content;
    }
    
    parseMediaMessage(node) {
        const attrs = node.attrs || {};
        const media = {
            url: attrs.url,
            mimetype: attrs.mimetype,
            fileSha256: attrs.fileSha256,
            fileLength: parseInt(attrs.fileLength) || 0,
            mediaKey: attrs.mediaKey,
            fileEncSha256: attrs.fileEncSha256,
            directPath: attrs.directPath,
            mediaKeyTimestamp: parseInt(attrs.mediaKeyTimestamp) || 0,
            caption: attrs.caption,
            jpegThumbnail: attrs.jpegThumbnail
        };
        
        // Type-specific attributes
        if (node.tag === 'imageMessage') {
            media.width = parseInt(attrs.width) || 0;
            media.height = parseInt(attrs.height) || 0;
        } else if (node.tag === 'videoMessage') {
            media.width = parseInt(attrs.width) || 0;
            media.height = parseInt(attrs.height) || 0;
            media.seconds = parseInt(attrs.seconds) || 0;
            media.gifPlayback = attrs.gifPlayback === 'true';
        } else if (node.tag === 'audioMessage') {
            media.seconds = parseInt(attrs.seconds) || 0;
            media.ptt = attrs.ptt === 'true';
            media.waveform = attrs.waveform;
        } else if (node.tag === 'documentMessage') {
            media.fileName = attrs.fileName;
            media.title = attrs.title;
            media.pageCount = parseInt(attrs.pageCount) || 0;
        }
        
        return media;
    }
    
    parseLocationMessage(node) {
        const attrs = node.attrs || {};
        return {
            degreesLatitude: parseFloat(attrs.degreesLatitude) || 0,
            degreesLongitude: parseFloat(attrs.degreesLongitude) || 0,
            name: attrs.name,
            address: attrs.address,
            url: attrs.url,
            isLive: attrs.isLive === 'true',
            accuracyInMeters: parseInt(attrs.accuracyInMeters) || 0,
            speedInMps: parseFloat(attrs.speedInMps) || 0,
            degreesClockwiseFromMagneticNorth: parseInt(attrs.degreesClockwiseFromMagneticNorth) || 0,
            comment: attrs.comment,
            jpegThumbnail: attrs.jpegThumbnail
        };
    }
    
    parseContactMessage(node) {
        const attrs = node.attrs || {};
        return {
            displayName: attrs.displayName,
            vcard: node.content
        };
    }
    
    parseReactionMessage(node) {
        const attrs = node.attrs || {};
        return {
            key: {
                id: attrs.id,
                remoteJid: attrs.remoteJid,
                fromMe: attrs.fromMe === 'true',
                participant: attrs.participant
            },
            text: attrs.text,
            senderTimestampMs: parseInt(attrs.senderTimestampMs) || 0
        };
    }
    
    parsePollMessage(node) {
        const attrs = node.attrs || {};
        const poll = {
            name: attrs.name,
            selectableCount: parseInt(attrs.selectableCount) || 1,
            options: []
        };
        
        if (node.content && Array.isArray(node.content)) {
            for (const child of node.content) {
                if (child.tag === 'option') {
                    poll.options.push({
                        optionName: child.attrs?.optionName || child.content
                    });
                }
            }
        }
        
        return poll;
    }
    
    parseProtocolMessage(node) {
        const attrs = node.attrs || {};
        return {
            type: attrs.type,
            key: attrs.key ? {
                id: attrs.key.id,
                remoteJid: attrs.key.remoteJid,
                fromMe: attrs.key.fromMe === 'true',
                participant: attrs.key.participant
            } : null
        };
    }
    
    parseContextInfo(node) {
        const attrs = node.attrs || {};
        const contextInfo = {
            stanzaId: attrs.stanzaId,
            participant: attrs.participant,
            quotedMessage: attrs.quotedMessage,
            remoteJid: attrs.remoteJid,
            mentionedJid: attrs.mentionedJid ? attrs.mentionedJid.split(',') : [],
            conversionSource: attrs.conversionSource,
            conversionData: attrs.conversionData,
            conversionDelaySeconds: parseInt(attrs.conversionDelaySeconds) || 0,
            forwardingScore: parseInt(attrs.forwardingScore) || 0,
            isForwarded: attrs.isForwarded === 'true',
            quotedAd: attrs.quotedAd,
            placeholderKey: attrs.placeholderKey,
            expiration: parseInt(attrs.expiration) || 0,
            ephemeralSettingTimestamp: parseInt(attrs.ephemeralSettingTimestamp) || 0,
            ephemeralSharedSecret: attrs.ephemeralSharedSecret
        };
        
        return contextInfo;
    }
    
    async sendMessage(jid, message, options = {}) {
        try {
            const messageId = options.messageId || this.generateMessageId();
            const timestamp = options.timestamp || Date.now();
            
            // Create message node
            const messageNode = await this.createMessageNode(jid, message, {
                ...options,
                messageId,
                timestamp
            });
            
            // Add to pending messages
            this.pendingMessages.set(messageId, {
                jid,
                message,
                options,
                timestamp,
                status: this.messageStatus.PENDING,
                retries: 0
            });
            
            // Send message
            await this.socket.sendNode(messageNode);
            
            // Update status
            this.updateMessageStatus(messageId, this.messageStatus.SENT);
            
            // Return message info
            return {
                key: {
                    id: messageId,
                    remoteJid: jid,
                    fromMe: true
                },
                message,
                messageTimestamp: timestamp,
                status: this.messageStatus.SENT
            };
            
        } catch (error) {
            throw new Error(`Failed to send message: ${error.message}`);
        }
    }
    
    async createMessageNode(jid, message, options = {}) {
        const messageId = options.messageId || this.generateMessageId();
        const timestamp = Math.floor((options.timestamp || Date.now()) / 1000);
        
        const attrs = {
            id: messageId,
            to: jid,
            type: 'chat',
            t: timestamp.toString()
        };
        
        // Add participant for group messages
        if (this.isGroupJid(jid) && options.participant) {
            attrs.participant = options.participant;
        }
        
        // Create message content
        const messageContent = await this.createMessageContent(message, options);
        
        return {
            tag: 'message',
            attrs,
            content: messageContent
        };
    }
    
    async createMessageContent(message, options = {}) {
        const content = [];
        
        if (typeof message === 'string') {
            // Text message
            content.push({
                tag: 'conversation',
                content: message
            });
        } else if (message.text) {
            // Extended text message
            const extendedText = {
                tag: 'extendedTextMessage',
                attrs: {
                    text: message.text
                },
                content: []
            };
            
            if (message.contextInfo) {
                extendedText.content.push({
                    tag: 'contextInfo',
                    attrs: message.contextInfo
                });
            }
            
            content.push(extendedText);
        } else if (message.image) {
            // Image message
            const imageMessage = await this.createMediaMessage('imageMessage', message.image, message);
            content.push(imageMessage);
        } else if (message.video) {
            // Video message
            const videoMessage = await this.createMediaMessage('videoMessage', message.video, message);
            content.push(videoMessage);
        } else if (message.audio) {
            // Audio message
            const audioMessage = await this.createMediaMessage('audioMessage', message.audio, message);
            content.push(audioMessage);
        } else if (message.document) {
            // Document message
            const documentMessage = await this.createMediaMessage('documentMessage', message.document, message);
            content.push(documentMessage);
        } else if (message.sticker) {
            // Sticker message
            const stickerMessage = await this.createMediaMessage('stickerMessage', message.sticker, message);
            content.push(stickerMessage);
        } else if (message.location) {
            // Location message
            content.push({
                tag: 'locationMessage',
                attrs: {
                    degreesLatitude: message.location.latitude,
                    degreesLongitude: message.location.longitude,
                    name: message.location.name || '',
                    address: message.location.address || '',
                    url: message.location.url || '',
                    isLive: message.location.isLive || false,
                    accuracyInMeters: message.location.accuracy || 0,
                    speedInMps: message.location.speed || 0,
                    degreesClockwiseFromMagneticNorth: message.location.bearing || 0,
                    comment: message.location.comment || '',
                    jpegThumbnail: message.location.thumbnail || ''
                }
            });
        } else if (message.contact) {
            // Contact message
            content.push({
                tag: 'contactMessage',
                attrs: {
                    displayName: message.contact.displayName
                },
                content: message.contact.vcard
            });
        } else if (message.reaction) {
            // Reaction message
            content.push({
                tag: 'reactionMessage',
                attrs: {
                    key: message.reaction.key,
                    text: message.reaction.text,
                    senderTimestampMs: Date.now()
                }
            });
        } else if (message.poll) {
            // Poll message
            const pollMessage = {
                tag: 'pollCreationMessage',
                attrs: {
                    name: message.poll.name,
                    selectableCount: message.poll.selectableCount || 1
                },
                content: []
            };
            
            for (const option of message.poll.options || []) {
                pollMessage.content.push({
                    tag: 'option',
                    attrs: {
                        optionName: option.optionName || option
                    }
                });
            }
            
            content.push(pollMessage);
        }
        
        return content;
    }
    
    async createMediaMessage(type, media, options = {}) {
        try {
            // Upload media if needed
            const uploadedMedia = await this.socket.mediaHandler.uploadMedia(media, type);
            
            const mediaMessage = {
                tag: type,
                attrs: {
                    url: uploadedMedia.url,
                    mimetype: uploadedMedia.mimetype,
                    fileSha256: uploadedMedia.fileSha256,
                    fileLength: uploadedMedia.fileLength,
                    mediaKey: uploadedMedia.mediaKey,
                    fileEncSha256: uploadedMedia.fileEncSha256,
                    directPath: uploadedMedia.directPath,
                    mediaKeyTimestamp: uploadedMedia.mediaKeyTimestamp,
                    jpegThumbnail: uploadedMedia.jpegThumbnail
                }
            };
            
            // Add caption if provided
            if (options.caption) {
                mediaMessage.attrs.caption = options.caption;
            }
            
            // Type-specific attributes
            if (type === 'imageMessage' || type === 'videoMessage') {
                if (uploadedMedia.width) mediaMessage.attrs.width = uploadedMedia.width;
                if (uploadedMedia.height) mediaMessage.attrs.height = uploadedMedia.height;
            }
            
            if (type === 'videoMessage' || type === 'audioMessage') {
                if (uploadedMedia.seconds) mediaMessage.attrs.seconds = uploadedMedia.seconds;
            }
            
            if (type === 'videoMessage') {
                mediaMessage.attrs.gifPlayback = options.gifPlayback || false;
            }
            
            if (type === 'audioMessage') {
                mediaMessage.attrs.ptt = options.ptt || false;
                if (uploadedMedia.waveform) mediaMessage.attrs.waveform = uploadedMedia.waveform;
            }
            
            if (type === 'documentMessage') {
                mediaMessage.attrs.fileName = options.fileName || uploadedMedia.fileName;
                mediaMessage.attrs.title = options.title || uploadedMedia.title;
                if (uploadedMedia.pageCount) mediaMessage.attrs.pageCount = uploadedMedia.pageCount;
            }
            
            return mediaMessage;
            
        } catch (error) {
            throw new Error(`Failed to create media message: ${error.message}`);
        }
    }
    
    async handleReceipt(node) {
        try {
            const attrs = node.attrs || {};
            const messageId = attrs.id;
            const type = attrs.type;
            const from = attrs.from;
            const timestamp = parseInt(attrs.t) * 1000;
            
            if (!messageId) return;
            
            // Update message status
            let status;
            switch (type) {
                case 'delivery':
                    status = this.messageStatus.DELIVERED;
                    break;
                case 'read':
                    status = this.messageStatus.READ;
                    break;
                default:
                    return;
            }
            
            this.updateMessageStatus(messageId, status);
            
            // Emit receipt event
            this.socket.emit('message.receipt', {
                key: {
                    id: messageId,
                    remoteJid: from,
                    fromMe: true
                },
                receipt: {
                    readTimestamp: type === 'read' ? timestamp : null,
                    deliveryTimestamp: type === 'delivery' ? timestamp : null
                }
            });
            
        } catch (error) {
            this.socket.options.logger.error('Error handling receipt:', error);
        }
    }
    
    async sendReceipt(messageInfo) {
        try {
            if (!messageInfo.key || !messageInfo.key.remoteJid) return;
            
            const receiptNode = {
                tag: 'receipt',
                attrs: {
                    id: messageInfo.key.id,
                    to: messageInfo.key.remoteJid,
                    type: 'read',
                    t: Math.floor(Date.now() / 1000).toString()
                }
            };
            
            if (messageInfo.key.participant) {
                receiptNode.attrs.participant = messageInfo.key.participant;
            }
            
            await this.socket.sendNode(receiptNode);
            
        } catch (error) {
            this.socket.options.logger.error('Error sending receipt:', error);
        }
    }
    
    async handleSpecificMessageType(messageInfo) {
        try {
            const message = messageInfo.message;
            
            if (message.reactionMessage) {
                // Handle reaction
                this.socket.emit('message.reaction', {
                    key: message.reactionMessage.key,
                    reaction: {
                        text: message.reactionMessage.text,
                        key: messageInfo.key
                    }
                });
            } else if (message.protocolMessage) {
                // Handle protocol message (delete, etc.)
                if (message.protocolMessage.type === 'REVOKE') {
                    this.socket.emit('message.delete', {
                        key: message.protocolMessage.key,
                        deletedBy: messageInfo.key.remoteJid
                    });
                }
            }
            
        } catch (error) {
            this.socket.options.logger.error('Error handling specific message type:', error);
        }
    }
    
    storeMessage(messageInfo) {
        try {
            const messageId = messageInfo.key.id;
            this.socket.messages.set(messageId, messageInfo);
            
            // Store in chat
            const chatId = messageInfo.key.remoteJid;
            if (!this.socket.chats.has(chatId)) {
                this.socket.chats.set(chatId, {
                    id: chatId,
                    messages: new Map(),
                    unreadCount: 0,
                    lastMessageTime: 0
                });
            }
            
            const chat = this.socket.chats.get(chatId);
            chat.messages.set(messageId, messageInfo);
            chat.lastMessageTime = messageInfo.messageTimestamp;
            
            if (!messageInfo.key.fromMe) {
                chat.unreadCount++;
            }
            
        } catch (error) {
            this.socket.options.logger.error('Error storing message:', error);
        }
    }
    
    updateMessageStatus(messageId, status) {
        try {
            if (this.pendingMessages.has(messageId)) {
                const pending = this.pendingMessages.get(messageId);
                pending.status = status;
                
                if (status === this.messageStatus.DELIVERED || status === this.messageStatus.READ) {
                    this.pendingMessages.delete(messageId);
                }
            }
            
            if (this.socket.messages.has(messageId)) {
                const message = this.socket.messages.get(messageId);
                message.status = status;
            }
            
        } catch (error) {
            this.socket.options.logger.error('Error updating message status:', error);
        }
    }
    
    generateMessageId() {
        return crypto.randomBytes(8).toString('hex').toUpperCase();
    }
    
    isGroupJid(jid) {
        return jid && jid.includes('@g.us');
    }
    
    async retryFailedMessages() {
        try {
            for (const [messageId, messageData] of this.pendingMessages) {
                if (messageData.status === this.messageStatus.FAILED && messageData.retries < this.maxRetries) {
                    messageData.retries++;
                    
                    setTimeout(async () => {
                        try {
                            await this.sendMessage(messageData.jid, messageData.message, messageData.options);
                        } catch (error) {
                            this.socket.options.logger.error(`Retry failed for message ${messageId}:`, error);
                        }
                    }, this.retryDelay * messageData.retries);
                }
            }
        } catch (error) {
            this.socket.options.logger.error('Error retrying failed messages:', error);
        }
    }
    
    getMessageHistory(jid, limit = 50, before = null) {
        try {
            const chat = this.socket.chats.get(jid);
            if (!chat) return [];
            
            const messages = Array.from(chat.messages.values())
                .sort((a, b) => b.messageTimestamp - a.messageTimestamp);
            
            if (before) {
                const beforeIndex = messages.findIndex(m => m.key.id === before);
                if (beforeIndex > -1) {
                    return messages.slice(beforeIndex + 1, beforeIndex + 1 + limit);
                }
            }
            
            return messages.slice(0, limit);
            
        } catch (error) {
            this.socket.options.logger.error('Error getting message history:', error);
            return [];
        }
    }
    
    async deleteMessage(messageKey, forEveryone = false) {
        try {
            if (forEveryone) {
                // Send revoke message
                const revokeNode = {
                    tag: 'message',
                    attrs: {
                        id: this.generateMessageId(),
                        to: messageKey.remoteJid,
                        type: 'chat',
                        t: Math.floor(Date.now() / 1000).toString()
                    },
                    content: [{
                        tag: 'protocolMessage',
                        attrs: {
                            type: 'REVOKE',
                            key: messageKey
                        }
                    }]
                };
                
                await this.socket.sendNode(revokeNode);
            }
            
            // Remove from local storage
            this.socket.messages.delete(messageKey.id);
            
            const chat = this.socket.chats.get(messageKey.remoteJid);
            if (chat) {
                chat.messages.delete(messageKey.id);
            }
            
            // Emit delete event
            this.socket.emit('message.delete', {
                key: messageKey,
                forEveryone
            });
            
        } catch (error) {
            throw new Error(`Failed to delete message: ${error.message}`);
        }
    }
}

module.exports = WAMessageHandler;
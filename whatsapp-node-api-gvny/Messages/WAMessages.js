const EventEmitter = require('events');

/**
 * WhatsApp Messages Manager
 * Handles all message operations including sending, receiving, and management
 */
class WAMessages extends EventEmitter {
    constructor(socket, options = {}) {
        super();
        
        this.socket = socket;
        this.options = {
            maxMessages: options.maxMessages || 100000,
            enableMessageHistory: options.enableMessageHistory !== false,
            enableReactions: options.enableReactions !== false,
            enableForwarding: options.enableForwarding !== false,
            enableQuoting: options.enableQuoting !== false,
            messageRetention: options.messageRetention || 2592000000, // 30 days
            ...options
        };

        // Message data
        this.messages = new Map();
        this.messageHistory = [];
        this.reactions = new Map();
        this.forwardedMessages = new Map();
        this.quotedMessages = new Map();
        this.deletedMessages = new Set();

        this.initialize();
    }

    async initialize() {
        try {
            this.setupSocketEventHandlers();
            this.startMessageCleanup();
            this.emit('messages:ready');
        } catch (error) {
            this.emit('messages:error', error);
        }
    }

    // Setup event handlers
    setupSocketEventHandlers() {
        this.socket.on('messages.upsert', (messageUpdate) => {
            this.handleMessagesUpsert(messageUpdate);
        });

        this.socket.on('messages.update', (messageUpdates) => {
            this.handleMessagesUpdate(messageUpdates);
        });

        this.socket.on('messages.delete', (messageDeletes) => {
            this.handleMessagesDelete(messageDeletes);
        });

        this.socket.on('message-receipt.update', (receipts) => {
            this.handleMessageReceipts(receipts);
        });
    }

    // Message Sending
    async sendTextMessage(jid, text, options = {}) {
        try {
            const message = {
                conversation: text
            };

            return await this.sendMessage(jid, message, options);
        } catch (error) {
            this.emit('messages:error', error);
            throw error;
        }
    }

    async sendImageMessage(jid, imageBuffer, caption = '', options = {}) {
        try {
            const message = {
                image: imageBuffer,
                caption: caption
            };

            return await this.sendMessage(jid, message, options);
        } catch (error) {
            this.emit('messages:error', error);
            throw error;
        }
    }

    async sendVideoMessage(jid, videoBuffer, caption = '', options = {}) {
        try {
            const message = {
                video: videoBuffer,
                caption: caption
            };

            return await this.sendMessage(jid, message, options);
        } catch (error) {
            this.emit('messages:error', error);
            throw error;
        }
    }

    async sendAudioMessage(jid, audioBuffer, options = {}) {
        try {
            const message = {
                audio: audioBuffer,
                ptt: options.ptt || false
            };

            return await this.sendMessage(jid, message, options);
        } catch (error) {
            this.emit('messages:error', error);
            throw error;
        }
    }

    async sendDocumentMessage(jid, documentBuffer, fileName, mimeType, options = {}) {
        try {
            const message = {
                document: documentBuffer,
                fileName: fileName,
                mimetype: mimeType
            };

            return await this.sendMessage(jid, message, options);
        } catch (error) {
            this.emit('messages:error', error);
            throw error;
        }
    }

    async sendLocationMessage(jid, latitude, longitude, options = {}) {
        try {
            const message = {
                location: {
                    degreesLatitude: latitude,
                    degreesLongitude: longitude,
                    name: options.name || '',
                    address: options.address || ''
                }
            };

            return await this.sendMessage(jid, message, options);
        } catch (error) {
            this.emit('messages:error', error);
            throw error;
        }
    }

    async sendContactMessage(jid, contactData, options = {}) {
        try {
            const message = {
                contacts: {
                    displayName: contactData.displayName,
                    contacts: [{
                        name: {
                            formattedName: contactData.name,
                            displayName: contactData.displayName
                        },
                        number: contactData.number,
                        waid: contactData.waid
                    }]
                }
            };

            return await this.sendMessage(jid, message, options);
        } catch (error) {
            this.emit('messages:error', error);
            throw error;
        }
    }

    async sendMessage(jid, message, options = {}) {
        try {
            if (this.messages.size >= this.options.maxMessages) {
                await this.cleanupOldMessages();
            }

            const messageId = this.generateMessageId();
            const messageData = {
                key: {
                    id: messageId,
                    remoteJid: jid,
                    fromMe: true
                },
                message: message,
                messageTimestamp: Math.floor(Date.now() / 1000),
                status: 'pending',
                ...options
            };

            // Add quoted message if specified
            if (options.quoted) {
                messageData.message.contextInfo = {
                    stanzaId: options.quoted.key.id,
                    participant: options.quoted.key.remoteJid,
                    quotedMessage: options.quoted.message
                };
            }

            // Send message through socket
            const result = await this.socket.sendMessage(jid, message, options);
            
            if (result) {
                messageData.key.id = result.key.id;
                messageData.status = 'sent';
                
                this.messages.set(result.key.id, messageData);
                
                if (this.options.enableMessageHistory) {
                    this.messageHistory.push({
                        action: 'sent',
                        messageId: result.key.id,
                        timestamp: new Date().toISOString()
                    });
                }

                this.emit('message:sent', messageData);
                return messageData;
            } else {
                throw new Error('Failed to send message');
            }
        } catch (error) {
            this.emit('messages:error', error);
            throw error;
        }
    }

    // Message Management
    async deleteMessage(messageId, deleteForEveryone = false) {
        try {
            const message = this.messages.get(messageId);
            if (!message) {
                throw new Error(`Message ${messageId} not found`);
            }

            if (deleteForEveryone && message.key.fromMe) {
                // Delete for everyone
                await this.socket.sendMessage(message.key.remoteJid, {
                    delete: message.key
                });
            }

            this.deletedMessages.add(messageId);
            this.messages.delete(messageId);
            
            if (this.options.enableMessageHistory) {
                this.messageHistory.push({
                    action: 'deleted',
                    messageId: messageId,
                    deleteForEveryone: deleteForEveryone,
                    timestamp: new Date().toISOString()
                });
            }

            this.emit('message:deleted', { messageId, deleteForEveryone });
            return { success: true, message: 'Message deleted successfully' };
        } catch (error) {
            this.emit('messages:error', error);
            throw error;
        }
    }

    async editMessage(messageId, newContent) {
        try {
            const message = this.messages.get(messageId);
            if (!message) {
                throw new Error(`Message ${messageId} not found`);
            }

            if (!message.key.fromMe) {
                throw new Error('Cannot edit messages from others');
            }

            // Send edit message
            await this.socket.sendMessage(message.key.remoteJid, {
                edit: message.key,
                conversation: newContent
            });

            // Update local message
            message.message.conversation = newContent;
            message.edited = true;
            message.editedTimestamp = Math.floor(Date.now() / 1000);
            
            this.messages.set(messageId, message);
            
            if (this.options.enableMessageHistory) {
                this.messageHistory.push({
                    action: 'edited',
                    messageId: messageId,
                    timestamp: new Date().toISOString()
                });
            }

            this.emit('message:edited', message);
            return message;
        } catch (error) {
            this.emit('messages:error', error);
            throw error;
        }
    }

    // Message Reactions
    async addReaction(messageId, emoji) {
        try {
            if (!this.options.enableReactions) {
                throw new Error('Reactions are disabled');
            }

            const message = this.messages.get(messageId);
            if (!message) {
                throw new Error(`Message ${messageId} not found`);
            }

            // Send reaction
            await this.socket.sendMessage(message.key.remoteJid, {
                react: {
                    text: emoji,
                    key: message.key
                }
            });

            // Store reaction
            if (!this.reactions.has(messageId)) {
                this.reactions.set(messageId, new Map());
            }
            
            const messageReactions = this.reactions.get(messageId);
            const userId = this.socket.user?.id;
            messageReactions.set(userId, {
                emoji: emoji,
                timestamp: new Date().toISOString()
            });

            this.emit('message:reaction:added', { messageId, emoji, userId });
            return { success: true, message: 'Reaction added successfully' };
        } catch (error) {
            this.emit('messages:error', error);
            throw error;
        }
    }

    async removeReaction(messageId) {
        try {
            if (!this.options.enableReactions) {
                throw new Error('Reactions are disabled');
            }

            const message = this.messages.get(messageId);
            if (!message) {
                throw new Error(`Message ${messageId} not found`);
            }

            // Send reaction removal
            await this.socket.sendMessage(message.key.remoteJid, {
                react: {
                    text: '',
                    key: message.key
                }
            });

            // Remove reaction
            const messageReactions = this.reactions.get(messageId);
            const userId = this.socket.user?.id;
            if (messageReactions) {
                messageReactions.delete(userId);
                if (messageReactions.size === 0) {
                    this.reactions.delete(messageId);
                }
            }

            this.emit('message:reaction:removed', { messageId, userId });
            return { success: true, message: 'Reaction removed successfully' };
        } catch (error) {
            this.emit('messages:error', error);
            throw error;
        }
    }

    // Message Forwarding
    async forwardMessage(messageId, targetJids) {
        try {
            if (!this.options.enableForwarding) {
                throw new Error('Forwarding is disabled');
            }

            const message = this.messages.get(messageId);
            if (!message) {
                throw new Error(`Message ${messageId} not found`);
            }

            const forwardedMessages = [];
            
            for (const jid of targetJids) {
                const forwardedMessage = {
                    ...message.message,
                    contextInfo: {
                        ...message.message.contextInfo,
                        isForwarded: true,
                        forwardingScore: (message.message.contextInfo?.forwardingScore || 0) + 1
                    }
                };

                const result = await this.sendMessage(jid, forwardedMessage);
                forwardedMessages.push(result);
                
                // Track forwarded message
                if (!this.forwardedMessages.has(messageId)) {
                    this.forwardedMessages.set(messageId, []);
                }
                this.forwardedMessages.get(messageId).push({
                    targetJid: jid,
                    forwardedMessageId: result.key.id,
                    timestamp: new Date().toISOString()
                });
            }

            this.emit('message:forwarded', { originalMessageId: messageId, forwardedMessages });
            return forwardedMessages;
        } catch (error) {
            this.emit('messages:error', error);
            throw error;
        }
    }

    // Message Search
    searchMessages(query, filters = {}) {
        try {
            let results = Array.from(this.messages.values());

            // Text search
            if (query) {
                const searchTerm = query.toLowerCase();
                results = results.filter(message => {
                    const content = message.message?.conversation || 
                                   message.message?.extendedTextMessage?.text || 
                                   message.message?.imageMessage?.caption || 
                                   message.message?.videoMessage?.caption || '';
                    return content.toLowerCase().includes(searchTerm);
                });
            }

            // Apply filters
            if (filters.jid) {
                results = results.filter(message => message.key.remoteJid === filters.jid);
            }

            if (filters.fromMe !== undefined) {
                results = results.filter(message => message.key.fromMe === filters.fromMe);
            }

            if (filters.messageType) {
                results = results.filter(message => 
                    Object.keys(message.message || {})[0] === filters.messageType
                );
            }

            if (filters.hasMedia !== undefined) {
                results = results.filter(message => {
                    const hasMedia = !!(message.message?.imageMessage || 
                                      message.message?.videoMessage || 
                                      message.message?.audioMessage || 
                                      message.message?.documentMessage);
                    return hasMedia === filters.hasMedia;
                });
            }

            if (filters.startDate) {
                const startTimestamp = new Date(filters.startDate).getTime() / 1000;
                results = results.filter(message => message.messageTimestamp >= startTimestamp);
            }

            if (filters.endDate) {
                const endTimestamp = new Date(filters.endDate).getTime() / 1000;
                results = results.filter(message => message.messageTimestamp <= endTimestamp);
            }

            // Sort results
            if (filters.sortBy) {
                results.sort((a, b) => {
                    switch (filters.sortBy) {
                        case 'timestamp':
                            return filters.sortOrder === 'asc' ? 
                                a.messageTimestamp - b.messageTimestamp :
                                b.messageTimestamp - a.messageTimestamp;
                        default:
                            return 0;
                    }
                });
            }

            // Pagination
            if (filters.limit) {
                const offset = filters.offset || 0;
                results = results.slice(offset, offset + filters.limit);
            }

            return {
                messages: results,
                total: results.length,
                query: query,
                filters: filters
            };
        } catch (error) {
            this.emit('messages:error', error);
            throw error;
        }
    }

    // Message Statistics
    getMessageStatistics(jid = null) {
        try {
            let messages = Array.from(this.messages.values());
            
            if (jid) {
                messages = messages.filter(message => message.key.remoteJid === jid);
            }

            const stats = {
                totalMessages: messages.length,
                sentMessages: messages.filter(m => m.key.fromMe).length,
                receivedMessages: messages.filter(m => !m.key.fromMe).length,
                textMessages: messages.filter(m => m.message?.conversation).length,
                mediaMessages: messages.filter(m => 
                    m.message?.imageMessage || m.message?.videoMessage || 
                    m.message?.audioMessage || m.message?.documentMessage
                ).length,
                deletedMessages: this.deletedMessages.size,
                reactionsCount: Array.from(this.reactions.values()).reduce((sum, reactions) => 
                    sum + reactions.size, 0
                ),
                forwardedCount: this.forwardedMessages.size
            };

            return stats;
        } catch (error) {
            this.emit('messages:error', error);
            throw error;
        }
    }

    // Helper methods
    generateMessageId() {
        return `msg_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    }

    async cleanupOldMessages() {
        try {
            const cutoffTime = Date.now() - this.options.messageRetention;
            const messagesToDelete = [];

            for (const [messageId, message] of this.messages.entries()) {
                const messageTime = message.messageTimestamp * 1000;
                if (messageTime < cutoffTime) {
                    messagesToDelete.push(messageId);
                }
            }

            messagesToDelete.forEach(messageId => {
                this.messages.delete(messageId);
                this.reactions.delete(messageId);
                this.forwardedMessages.delete(messageId);
                this.quotedMessages.delete(messageId);
            });

            this.emit('messages:cleaned', { deleted: messagesToDelete.length });
            return messagesToDelete.length;
        } catch (error) {
            this.emit('messages:error', error);
            throw error;
        }
    }

    startMessageCleanup() {
        setInterval(() => {
            this.cleanupOldMessages();
        }, 3600000); // Run every hour
    }

    // Event handlers
    handleMessagesUpsert(messageUpdate) {
        try {
            messageUpdate.messages.forEach(message => {
                this.messages.set(message.key.id, message);
                
                if (this.options.enableMessageHistory) {
                    this.messageHistory.push({
                        action: message.key.fromMe ? 'sent' : 'received',
                        messageId: message.key.id,
                        timestamp: new Date().toISOString()
                    });
                }

                this.emit('message:received', message);
            });
        } catch (error) {
            this.emit('messages:error', error);
        }
    }

    handleMessagesUpdate(messageUpdates) {
        try {
            messageUpdates.forEach(update => {
                const message = this.messages.get(update.key.id);
                if (message) {
                    Object.assign(message, update);
                    this.messages.set(update.key.id, message);
                    this.emit('message:updated', message);
                }
            });
        } catch (error) {
            this.emit('messages:error', error);
        }
    }

    handleMessagesDelete(messageDeletes) {
        try {
            messageDeletes.forEach(deleteInfo => {
                const messageId = deleteInfo.key.id;
                this.deletedMessages.add(messageId);
                this.messages.delete(messageId);
                
                if (this.options.enableMessageHistory) {
                    this.messageHistory.push({
                        action: 'deleted',
                        messageId: messageId,
                        timestamp: new Date().toISOString()
                    });
                }

                this.emit('message:deleted', deleteInfo);
            });
        } catch (error) {
            this.emit('messages:error', error);
        }
    }

    handleMessageReceipts(receipts) {
        try {
            receipts.forEach(receipt => {
                const message = this.messages.get(receipt.key.id);
                if (message) {
                    if (receipt.receipt.readTimestamp) {
                        message.status = 'read';
                        message.readTimestamp = receipt.receipt.readTimestamp;
                    } else if (receipt.receipt.deliveredTimestamp) {
                        message.status = 'delivered';
                        message.deliveredTimestamp = receipt.receipt.deliveredTimestamp;
                    }
                    
                    this.messages.set(receipt.key.id, message);
                    this.emit('message:receipt', { message, receipt });
                }
            });
        } catch (error) {
            this.emit('messages:error', error);
        }
    }

    // Getters
    getMessage(messageId) {
        return this.messages.get(messageId);
    }

    getMessages(jid = null, limit = 50) {
        let messages = Array.from(this.messages.values());
        
        if (jid) {
            messages = messages.filter(message => message.key.remoteJid === jid);
        }

        return messages
            .sort((a, b) => b.messageTimestamp - a.messageTimestamp)
            .slice(0, limit);
    }

    getMessageReactions(messageId) {
        return this.reactions.get(messageId) || new Map();
    }

    getForwardedMessages(messageId) {
        return this.forwardedMessages.get(messageId) || [];
    }

    getMessageHistory(limit = 100) {
        return this.messageHistory.slice(-limit);
    }

    getDeletedMessages() {
        return Array.from(this.deletedMessages);
    }
}

module.exports = WAMessages;
const EventEmitter = require('events');

/**
 * WhatsApp Message Handler
 * Handles message processing and routing
 */
class WAMessageHandler extends EventEmitter {
    constructor(socket, options = {}) {
        super();
        
        this.socket = socket;
        this.options = {
            enableMessageHandling: options.enableMessageHandling !== false,
            enableAutoReply: options.enableAutoReply || false,
            autoReplyMessage: options.autoReplyMessage || 'Auto-reply: Message received',
            ...options
        };

        this.messageQueue = [];
        this.processing = false;
        
        this.initialize();
    }

    initialize() {
        this.setupEventHandlers();
        this.emit('ready');
    }

    setupEventHandlers() {
        this.socket.on('messages.upsert', (messageUpdate) => {
            this.handleMessagesUpsert(messageUpdate);
        });

        this.socket.on('messages.update', (messageUpdates) => {
            this.handleMessagesUpdate(messageUpdates);
        });

        this.socket.on('message-receipt.update', (receipts) => {
            this.handleReceiptUpdate(receipts);
        });
    }

    async handleMessagesUpsert(messageUpdate) {
        try {
            for (const message of messageUpdate.messages) {
                await this.processMessage(message);
            }
        } catch (error) {
            this.emit('message:error', { messageUpdate, error });
        }
    }

    async handleMessagesUpdate(messageUpdates) {
        try {
            for (const update of messageUpdates) {
                this.emit('message:updated', update);
            }
        } catch (error) {
            this.emit('message:error', { messageUpdates, error });
        }
    }

    async handleReceiptUpdate(receipts) {
        try {
            for (const receipt of receipts) {
                this.emit('message:receipt', receipt);
            }
        } catch (error) {
            this.emit('message:error', { receipts, error });
        }
    }

    async processMessage(message) {
        try {
            // Add to queue
            this.messageQueue.push(message);
            
            // Process queue if not already processing
            if (!this.processing) {
                await this.processQueue();
            }
        } catch (error) {
            this.emit('message:error', { message, error });
        }
    }

    async processQueue() {
        this.processing = true;
        
        try {
            while (this.messageQueue.length > 0) {
                const message = this.messageQueue.shift();
                await this.handleSingleMessage(message);
            }
        } catch (error) {
            this.emit('message:error', { error });
        } finally {
            this.processing = false;
        }
    }

    async handleSingleMessage(message) {
        try {
            // Extract message info
            const messageInfo = this.extractMessageInfo(message);
            
            // Emit message event
            this.emit('message:received', messageInfo);
            
            // Handle auto-reply
            if (this.options.enableAutoReply && !message.key.fromMe) {
                await this.sendAutoReply(message);
            }
            
            // Handle different message types
            await this.handleMessageByType(messageInfo);
            
        } catch (error) {
            this.emit('message:error', { message, error });
        }
    }

    extractMessageInfo(message) {
        return {
            id: message.key.id,
            from: message.key.remoteJid,
            fromMe: message.key.fromMe,
            participant: message.key.participant,
            timestamp: message.messageTimestamp,
            content: message.message,
            messageType: this.getMessageType(message.message),
            pushName: message.pushName,
            broadcast: message.broadcast,
            forwarded: message.message?.contextInfo?.isForwarded || false
        };
    }

    getMessageType(messageContent) {
        if (!messageContent) return 'unknown';
        
        const types = Object.keys(messageContent);
        return types[0] || 'unknown';
    }

    async handleMessageByType(messageInfo) {
        try {
            switch (messageInfo.messageType) {
                case 'conversation':
                case 'extendedTextMessage':
                    await this.handleTextMessage(messageInfo);
                    break;
                case 'imageMessage':
                    await this.handleImageMessage(messageInfo);
                    break;
                case 'videoMessage':
                    await this.handleVideoMessage(messageInfo);
                    break;
                case 'audioMessage':
                    await this.handleAudioMessage(messageInfo);
                    break;
                case 'documentMessage':
                    await this.handleDocumentMessage(messageInfo);
                    break;
                case 'contactMessage':
                    await this.handleContactMessage(messageInfo);
                    break;
                case 'locationMessage':
                    await this.handleLocationMessage(messageInfo);
                    break;
                default:
                    await this.handleUnknownMessage(messageInfo);
            }
        } catch (error) {
            this.emit('message:error', { messageInfo, error });
        }
    }

    async handleTextMessage(messageInfo) {
        this.emit('message:text', messageInfo);
    }

    async handleImageMessage(messageInfo) {
        this.emit('message:image', messageInfo);
    }

    async handleVideoMessage(messageInfo) {
        this.emit('message:video', messageInfo);
    }

    async handleAudioMessage(messageInfo) {
        this.emit('message:audio', messageInfo);
    }

    async handleDocumentMessage(messageInfo) {
        this.emit('message:document', messageInfo);
    }

    async handleContactMessage(messageInfo) {
        this.emit('message:contact', messageInfo);
    }

    async handleLocationMessage(messageInfo) {
        this.emit('message:location', messageInfo);
    }

    async handleUnknownMessage(messageInfo) {
        this.emit('message:unknown', messageInfo);
    }

    async sendAutoReply(originalMessage) {
        try {
            const replyMessage = {
                text: this.options.autoReplyMessage
            };

            await this.socket.sendMessage(originalMessage.key.remoteJid, replyMessage);
            this.emit('message:auto_reply_sent', { 
                to: originalMessage.key.remoteJid, 
                message: replyMessage 
            });
        } catch (error) {
            this.emit('message:error', { originalMessage, error });
        }
    }

    getQueueLength() {
        return this.messageQueue.length;
    }

    isProcessing() {
        return this.processing;
    }

    clearQueue() {
        this.messageQueue = [];
        this.emit('message:queue_cleared');
    }
}

module.exports = WAMessageHandler;
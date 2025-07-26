const protobuf = require('protobufjs');

/**
 * WhatsApp Protocol Buffer Definitions
 * Contains all message types and structures used in WhatsApp Web protocol
 */
class WAProto {
    constructor() {
        this.root = new protobuf.Root();
        this.initializeProtoDefinitions();
    }

    initializeProtoDefinitions() {
        // Message definitions
        this.Message = this.root.define('Message');
        this.WebMessageInfo = this.root.define('WebMessageInfo');
        this.MessageKey = this.root.define('MessageKey');
        this.ContextInfo = this.root.define('ContextInfo');
        
        // Media message types
        this.ImageMessage = this.root.define('ImageMessage');
        this.VideoMessage = this.root.define('VideoMessage');
        this.AudioMessage = this.root.define('AudioMessage');
        this.DocumentMessage = this.root.define('DocumentMessage');
        this.StickerMessage = this.root.define('StickerMessage');
        
        // Interactive message types
        this.ButtonsMessage = this.root.define('ButtonsMessage');
        this.ListMessage = this.root.define('ListMessage');
        this.TemplateMessage = this.root.define('TemplateMessage');
        this.PollCreationMessage = this.root.define('PollCreationMessage');
        
        // Contact and location
        this.ContactMessage = this.root.define('ContactMessage');
        this.LocationMessage = this.root.define('LocationMessage');
        this.LiveLocationMessage = this.root.define('LiveLocationMessage');
        
        // Group messages
        this.GroupInviteMessage = this.root.define('GroupInviteMessage');
        
        // Protocol messages
        this.ProtocolMessage = this.root.define('ProtocolMessage');
        this.ReactionMessage = this.root.define('ReactionMessage');
        
        // Business messages
        this.ProductMessage = this.root.define('ProductMessage');
        this.OrderMessage = this.root.define('OrderMessage');
        this.InvoiceMessage = this.root.define('InvoiceMessage');
        this.PaymentMessage = this.root.define('PaymentMessage');
        
        // Call messages
        this.Call = this.root.define('Call');
        
        // Presence
        this.Presence = this.root.define('Presence');
        
        // Chat states
        this.ChatState = this.root.define('ChatState');
        
        // Sync messages
        this.SyncActionValue = this.root.define('SyncActionValue');
        this.SyncActionData = this.root.define('SyncActionData');
        
        // Device messages
        this.DeviceListMetadata = this.root.define('DeviceListMetadata');
        this.DeviceProps = this.root.define('DeviceProps');
        
        // Newsletter
        this.NewsletterMessage = this.root.define('NewsletterMessage');
        
        // Community
        this.CommunityMessage = this.root.define('CommunityMessage');
        
        // Channel
        this.ChannelMessage = this.root.define('ChannelMessage');
        
        // Status/Story
        this.StatusMessage = this.root.define('StatusMessage');
        
        this.defineMessageStructures();
    }

    defineMessageStructures() {
        // Define MessageKey structure
        this.MessageKey.add(new protobuf.Field('remoteJid', 1, 'string'));
        this.MessageKey.add(new protobuf.Field('fromMe', 2, 'bool'));
        this.MessageKey.add(new protobuf.Field('id', 3, 'string'));
        this.MessageKey.add(new protobuf.Field('participant', 4, 'string'));

        // Define WebMessageInfo structure
        this.WebMessageInfo.add(new protobuf.Field('key', 1, 'MessageKey'));
        this.WebMessageInfo.add(new protobuf.Field('message', 2, 'Message'));
        this.WebMessageInfo.add(new protobuf.Field('messageTimestamp', 3, 'uint64'));
        this.WebMessageInfo.add(new protobuf.Field('status', 4, 'uint32'));
        this.WebMessageInfo.add(new protobuf.Field('participant', 5, 'string'));
        this.WebMessageInfo.add(new protobuf.Field('messageC2STimestamp', 6, 'uint64'));
        this.WebMessageInfo.add(new protobuf.Field('ignore', 16, 'bool'));
        this.WebMessageInfo.add(new protobuf.Field('starred', 17, 'bool'));
        this.WebMessageInfo.add(new protobuf.Field('broadcast', 18, 'bool'));
        this.WebMessageInfo.add(new protobuf.Field('pushName', 19, 'string'));
        this.WebMessageInfo.add(new protobuf.Field('mediaCiphertextSha256', 20, 'bytes'));
        this.WebMessageInfo.add(new protobuf.Field('multicast', 21, 'bool'));
        this.WebMessageInfo.add(new protobuf.Field('urlText', 22, 'bool'));
        this.WebMessageInfo.add(new protobuf.Field('urlNumber', 23, 'bool'));
        this.WebMessageInfo.add(new protobuf.Field('messageStubType', 24, 'uint32'));
        this.WebMessageInfo.add(new protobuf.Field('clearMedia', 25, 'bool'));
        this.WebMessageInfo.add(new protobuf.Field('messageStubParameters', 26, 'string', 'repeated'));
        this.WebMessageInfo.add(new protobuf.Field('duration', 27, 'uint32'));
        this.WebMessageInfo.add(new protobuf.Field('labels', 28, 'string', 'repeated'));
        this.WebMessageInfo.add(new protobuf.Field('paymentInfo', 29, 'PaymentInfo'));
        this.WebMessageInfo.add(new protobuf.Field('finalLiveLocation', 30, 'LiveLocationMessage'));
        this.WebMessageInfo.add(new protobuf.Field('quotedPaymentInfo', 31, 'PaymentInfo'));
        this.WebMessageInfo.add(new protobuf.Field('ephemeralStartTimestamp', 32, 'uint64'));
        this.WebMessageInfo.add(new protobuf.Field('ephemeralDuration', 33, 'uint32'));
        this.WebMessageInfo.add(new protobuf.Field('ephemeralOffToOn', 34, 'bool'));
        this.WebMessageInfo.add(new protobuf.Field('ephemeralOutOfSync', 35, 'bool'));
        this.WebMessageInfo.add(new protobuf.Field('bizPrivacyStatus', 36, 'uint32'));
        this.WebMessageInfo.add(new protobuf.Field('verifiedBizName', 37, 'string'));
        this.WebMessageInfo.add(new protobuf.Field('mediaData', 38, 'MediaData'));
        this.WebMessageInfo.add(new protobuf.Field('photoChange', 39, 'PhotoChange'));
        this.WebMessageInfo.add(new protobuf.Field('userReceipt', 40, 'UserReceipt', 'repeated'));
        this.WebMessageInfo.add(new protobuf.Field('reactions', 41, 'Reaction', 'repeated'));
        this.WebMessageInfo.add(new protobuf.Field('mediaData', 42, 'MediaData'));
        this.WebMessageInfo.add(new protobuf.Field('statusPsa', 44, 'StatusPSA'));
        this.WebMessageInfo.add(new protobuf.Field('pollUpdates', 45, 'PollUpdate', 'repeated'));
        this.WebMessageInfo.add(new protobuf.Field('pollAdditionalMetadata', 46, 'PollAdditionalMetadata'));
    }

    // Encode message
    encodeMessage(messageType, data) {
        try {
            const MessageType = this[messageType];
            if (!MessageType) {
                throw new Error(`Unknown message type: ${messageType}`);
            }
            
            const message = MessageType.create(data);
            return MessageType.encode(message).finish();
        } catch (error) {
            throw new Error(`Failed to encode ${messageType}: ${error.message}`);
        }
    }

    // Decode message
    decodeMessage(messageType, buffer) {
        try {
            const MessageType = this[messageType];
            if (!MessageType) {
                throw new Error(`Unknown message type: ${messageType}`);
            }
            
            return MessageType.decode(buffer);
        } catch (error) {
            throw new Error(`Failed to decode ${messageType}: ${error.message}`);
        }
    }

    // Get message type from buffer
    getMessageType(buffer) {
        try {
            // Try to decode as WebMessageInfo first
            const message = this.WebMessageInfo.decode(buffer);
            if (message.message) {
                // Determine the actual message type
                const messageKeys = Object.keys(message.message);
                return messageKeys.find(key => message.message[key] !== null);
            }
            return 'unknown';
        } catch (error) {
            return 'unknown';
        }
    }

    // Validate message structure
    validateMessage(messageType, data) {
        try {
            const MessageType = this[messageType];
            if (!MessageType) {
                return { valid: false, error: `Unknown message type: ${messageType}` };
            }
            
            const message = MessageType.create(data);
            const error = MessageType.verify(message);
            
            return {
                valid: !error,
                error: error || null
            };
        } catch (error) {
            return {
                valid: false,
                error: error.message
            };
        }
    }
}

module.exports = WAProto;
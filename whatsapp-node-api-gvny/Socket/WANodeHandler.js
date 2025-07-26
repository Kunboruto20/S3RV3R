const { EventEmitter } = require('events');
const WABinary = require('../WABINARY/WABinary');
const WAProto = require('../WABINARY/WAProto');
const WAUtils = require('../Utils/WAUtils');

class WANodeHandler extends EventEmitter {
    constructor(socket, options = {}) {
        super();
        this.socket = socket;
        this.options = options;
        this.binary = new WABinary();
        this.proto = new WAProto();
        this.utils = new WAUtils();
        
        this.nodeCounter = 0;
        this.pendingNodes = new Map();
        this.nodeTimeouts = new Map();
        this.nodeRetries = new Map();
        
        this.maxRetries = options.maxRetries || 3;
        this.nodeTimeout = options.nodeTimeout || 30000;
        
        this.setupNodeHandlers();
    }
    
    setupNodeHandlers() {
        this.nodeHandlers = {
            'iq': this.handleIqNode.bind(this),
            'message': this.handleMessageNode.bind(this),
            'presence': this.handlePresenceNode.bind(this),
            'chatstate': this.handleChatStateNode.bind(this),
            'receipt': this.handleReceiptNode.bind(this),
            'notification': this.handleNotificationNode.bind(this),
            'call': this.handleCallNode.bind(this),
            'ack': this.handleAckNode.bind(this),
            'stream:error': this.handleStreamError.bind(this),
            'success': this.handleSuccessNode.bind(this),
            'failure': this.handleFailureNode.bind(this),
            'challenge': this.handleChallengeNode.bind(this)
        };
    }
    
    generateNodeId() {
        return `${Date.now()}-${++this.nodeCounter}`;
    }
    
    createNode(tag, attrs = {}, content = null) {
        const node = {
            tag,
            attrs: { ...attrs },
            content: content
        };
        
        if (!node.attrs.id && (tag === 'iq' || tag === 'message')) {
            node.attrs.id = this.generateNodeId();
        }
        
        return node;
    }
    
    encodeNode(node) {
        try {
            return this.binary.encodeNode(node);
        } catch (error) {
            this.emit('error', new Error(`Failed to encode node: ${error.message}`));
            return null;
        }
    }
    
    decodeNode(buffer) {
        try {
            return this.binary.decodeNode(buffer);
        } catch (error) {
            this.emit('error', new Error(`Failed to decode node: ${error.message}`));
            return null;
        }
    }
    
    sendNode(node, expectResponse = false) {
        const encoded = this.encodeNode(node);
        if (!encoded) {
            return Promise.reject(new Error('Failed to encode node'));
        }
        
        if (expectResponse && node.attrs.id) {
            return new Promise((resolve, reject) => {
                this.pendingNodes.set(node.attrs.id, { resolve, reject, node });
                
                const timeout = setTimeout(() => {
                    this.handleNodeTimeout(node.attrs.id);
                }, this.nodeTimeout);
                
                this.nodeTimeouts.set(node.attrs.id, timeout);
                this.socket.send(encoded);
            });
        } else {
            this.socket.send(encoded);
            return Promise.resolve();
        }
    }
    
    query(tag, attrs = {}, content = null) {
        const node = this.createNode(tag, attrs, content);
        return this.sendNode(node, true);
    }
    
    handleIncomingNode(buffer) {
        const node = this.decodeNode(buffer);
        if (!node) return;
        
        // Handle response to pending queries
        if (node.attrs.id && this.pendingNodes.has(node.attrs.id)) {
            this.handleNodeResponse(node.attrs.id, node);
            return;
        }
        
        // Route to appropriate handler
        const handler = this.nodeHandlers[node.tag];
        if (handler) {
            handler(node);
        } else {
            this.handleUnknownNode(node);
        }
    }
    
    handleNodeResponse(id, node) {
        const pending = this.pendingNodes.get(id);
        if (!pending) return;
        
        this.clearNodeTimeout(id);
        this.pendingNodes.delete(id);
        this.nodeRetries.delete(id);
        
        if (node.tag === 'iq' && node.attrs.type === 'error') {
            const error = this.parseErrorNode(node);
            pending.reject(error);
        } else {
            pending.resolve(node);
        }
    }
    
    handleNodeTimeout(id) {
        const pending = this.pendingNodes.get(id);
        if (!pending) return;
        
        const retries = this.nodeRetries.get(id) || 0;
        
        if (retries < this.maxRetries) {
            this.nodeRetries.set(id, retries + 1);
            
            // Retry sending the node
            const encoded = this.encodeNode(pending.node);
            if (encoded) {
                this.socket.send(encoded);
                
                const timeout = setTimeout(() => {
                    this.handleNodeTimeout(id);
                }, this.nodeTimeout);
                
                this.nodeTimeouts.set(id, timeout);
            }
        } else {
            this.clearNodeTimeout(id);
            this.pendingNodes.delete(id);
            this.nodeRetries.delete(id);
            
            pending.reject(new Error(`Node timeout after ${this.maxRetries} retries`));
        }
    }
    
    clearNodeTimeout(id) {
        const timeout = this.nodeTimeouts.get(id);
        if (timeout) {
            clearTimeout(timeout);
            this.nodeTimeouts.delete(id);
        }
    }
    
    handleIqNode(node) {
        const { type, from, id } = node.attrs;
        
        switch (type) {
            case 'get':
                this.handleIqGet(node);
                break;
            case 'set':
                this.handleIqSet(node);
                break;
            case 'result':
                this.handleIqResult(node);
                break;
            case 'error':
                this.handleIqError(node);
                break;
            default:
                this.emit('iq.unknown', node);
        }
    }
    
    handleIqGet(node) {
        const { xmlns } = this.getChildAttrs(node, 0) || {};
        
        switch (xmlns) {
            case 'urn:xmpp:ping':
                this.sendPongResponse(node);
                break;
            case 'w:profile:picture':
                this.handleProfilePictureGet(node);
                break;
            case 'w:status':
                this.handleStatusGet(node);
                break;
            default:
                this.sendIqError(node, 'feature-not-implemented');
        }
    }
    
    handleIqSet(node) {
        const { xmlns } = this.getChildAttrs(node, 0) || {};
        
        switch (xmlns) {
            case 'w:profile:picture':
                this.handleProfilePictureSet(node);
                break;
            case 'w:status':
                this.handleStatusSet(node);
                break;
            case 'privacy':
                this.handlePrivacySet(node);
                break;
            default:
                this.sendIqError(node, 'feature-not-implemented');
        }
    }
    
    handleIqResult(node) {
        this.emit('iq.result', node);
    }
    
    handleIqError(node) {
        this.emit('iq.error', node);
    }
    
    handleMessageNode(node) {
        this.emit('message.raw', node);
    }
    
    handlePresenceNode(node) {
        this.emit('presence.raw', node);
    }
    
    handleChatStateNode(node) {
        this.emit('chatstate.raw', node);
    }
    
    handleReceiptNode(node) {
        this.emit('receipt.raw', node);
    }
    
    handleNotificationNode(node) {
        this.emit('notification.raw', node);
    }
    
    handleCallNode(node) {
        this.emit('call.raw', node);
    }
    
    handleAckNode(node) {
        this.emit('ack.raw', node);
    }
    
    handleStreamError(node) {
        const error = this.parseErrorNode(node);
        this.emit('stream.error', error);
    }
    
    handleSuccessNode(node) {
        this.emit('stream.success', node);
    }
    
    handleFailureNode(node) {
        const error = this.parseErrorNode(node);
        this.emit('stream.failure', error);
    }
    
    handleChallengeNode(node) {
        this.emit('stream.challenge', node);
    }
    
    handleUnknownNode(node) {
        this.emit('node.unknown', node);
    }
    
    sendPongResponse(pingNode) {
        const pong = this.createNode('iq', {
            type: 'result',
            id: pingNode.attrs.id,
            to: pingNode.attrs.from
        });
        
        this.sendNode(pong);
    }
    
    sendIqError(originalNode, errorType, errorText = null) {
        const error = this.createNode('iq', {
            type: 'error',
            id: originalNode.attrs.id,
            to: originalNode.attrs.from
        }, [
            this.createNode('error', { type: errorType }, errorText)
        ]);
        
        this.sendNode(error);
    }
    
    parseErrorNode(node) {
        const errorChild = this.getChild(node, 'error');
        if (!errorChild) {
            return new Error('Unknown error');
        }
        
        const type = errorChild.attrs.type || 'unknown';
        const text = errorChild.content || 'No error description';
        
        return new Error(`${type}: ${text}`);
    }
    
    getChild(node, tag) {
        if (!node.content || !Array.isArray(node.content)) return null;
        return node.content.find(child => child.tag === tag);
    }
    
    getChildAttrs(node, index) {
        if (!node.content || !Array.isArray(node.content)) return null;
        const child = node.content[index];
        return child ? child.attrs : null;
    }
    
    getAllChildren(node, tag) {
        if (!node.content || !Array.isArray(node.content)) return [];
        return node.content.filter(child => child.tag === tag);
    }
    
    getChildContent(node, tag) {
        const child = this.getChild(node, tag);
        return child ? child.content : null;
    }
    
    handleProfilePictureGet(node) {
        // Implementation for profile picture get
        this.emit('profile.picture.get', node);
    }
    
    handleProfilePictureSet(node) {
        // Implementation for profile picture set
        this.emit('profile.picture.set', node);
    }
    
    handleStatusGet(node) {
        // Implementation for status get
        this.emit('status.get', node);
    }
    
    handleStatusSet(node) {
        // Implementation for status set
        this.emit('status.set', node);
    }
    
    handlePrivacySet(node) {
        // Implementation for privacy settings
        this.emit('privacy.set', node);
    }
    
    cleanup() {
        // Clear all pending nodes
        for (const [id, pending] of this.pendingNodes) {
            this.clearNodeTimeout(id);
            pending.reject(new Error('Connection closed'));
        }
        
        this.pendingNodes.clear();
        this.nodeTimeouts.clear();
        this.nodeRetries.clear();
        
        this.removeAllListeners();
    }
}

module.exports = WANodeHandler;
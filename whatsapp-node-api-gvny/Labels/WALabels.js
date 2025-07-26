const EventEmitter = require('events');

/**
 * WhatsApp Labels Manager
 * Handles message and chat labels for organization and filtering
 */
class WALabels extends EventEmitter {
    constructor(socket, options = {}) {
        super();
        
        this.socket = socket;
        this.options = {
            maxLabels: options.maxLabels || 100,
            enableColorCoding: options.enableColorCoding !== false,
            enableAutoLabeling: options.enableAutoLabeling || false,
            ...options
        };

        // Label data
        this.labels = new Map();
        this.labeledMessages = new Map();
        this.labeledChats = new Map();
        this.labelRules = new Map();

        this.initialize();
    }

    async initialize() {
        try {
            this.setupSocketEventHandlers();
            await this.loadLabels();
            this.emit('labels:ready');
        } catch (error) {
            this.emit('labels:error', error);
        }
    }

    // Setup event handlers
    setupSocketEventHandlers() {
        this.socket.on('labels.update', (labels) => {
            this.handleLabelsUpdate(labels);
        });

        if (this.options.enableAutoLabeling) {
            this.socket.on('messages.upsert', (messageUpdate) => {
                this.processAutoLabeling(messageUpdate);
            });
        }
    }

    // Label Management
    async createLabel(labelData) {
        try {
            if (this.labels.size >= this.options.maxLabels) {
                throw new Error('Maximum labels limit reached');
            }

            const label = {
                id: labelData.id || this.generateLabelId(),
                name: labelData.name,
                color: labelData.color || this.generateRandomColor(),
                description: labelData.description || '',
                icon: labelData.icon || '🏷️',
                created: new Date().toISOString(),
                updated: new Date().toISOString(),
                messageCount: 0,
                chatCount: 0,
                isSystem: labelData.isSystem || false
            };

            // Send label creation request
            const query = {
                tag: 'iq',
                attrs: {
                    id: this.socket.generateMessageTag(),
                    type: 'set',
                    xmlns: 'w:labels'
                },
                content: [{
                    tag: 'label',
                    attrs: { action: 'create' },
                    content: this.serializeLabel(label)
                }]
            };

            const result = await this.socket.query(query);
            
            if (result.attrs.type === 'result') {
                this.labels.set(label.id, label);
                this.labeledMessages.set(label.id, new Set());
                this.labeledChats.set(label.id, new Set());
                
                this.emit('label:created', label);
                return label;
            } else {
                throw new Error('Failed to create label');
            }
        } catch (error) {
            this.emit('labels:error', error);
            throw error;
        }
    }

    async updateLabel(labelId, updates) {
        try {
            const label = this.labels.get(labelId);
            if (!label) {
                throw new Error(`Label ${labelId} not found`);
            }

            if (label.isSystem) {
                throw new Error('Cannot update system label');
            }

            const updatedLabel = {
                ...label,
                ...updates,
                updated: new Date().toISOString()
            };

            this.labels.set(labelId, updatedLabel);
            this.emit('label:updated', updatedLabel);
            return updatedLabel;
        } catch (error) {
            this.emit('labels:error', error);
            throw error;
        }
    }

    async deleteLabel(labelId) {
        try {
            const label = this.labels.get(labelId);
            if (!label) {
                throw new Error(`Label ${labelId} not found`);
            }

            if (label.isSystem) {
                throw new Error('Cannot delete system label');
            }

            // Remove label from all messages and chats
            const labeledMessages = this.labeledMessages.get(labelId) || new Set();
            const labeledChats = this.labeledChats.get(labelId) || new Set();

            for (const messageId of labeledMessages) {
                await this.removeLabelFromMessage(labelId, messageId);
            }

            for (const chatId of labeledChats) {
                await this.removeLabelFromChat(labelId, chatId);
            }

            this.labels.delete(labelId);
            this.labeledMessages.delete(labelId);
            this.labeledChats.delete(labelId);
            this.labelRules.delete(labelId);
            
            this.emit('label:deleted', { labelId, label });
            return { success: true, message: 'Label deleted successfully' };
        } catch (error) {
            this.emit('labels:error', error);
            throw error;
        }
    }

    // Message Labeling
    async addLabelToMessage(labelId, messageId) {
        try {
            const label = this.labels.get(labelId);
            if (!label) {
                throw new Error(`Label ${labelId} not found`);
            }

            const labeledMessages = this.labeledMessages.get(labelId) || new Set();
            
            if (labeledMessages.has(messageId)) {
                return { success: false, message: 'Message already has this label' };
            }

            labeledMessages.add(messageId);
            this.labeledMessages.set(labelId, labeledMessages);
            
            // Update label message count
            label.messageCount = labeledMessages.size;
            this.labels.set(labelId, label);

            this.emit('message:labeled', { labelId, messageId });
            return { success: true, message: 'Label added to message successfully' };
        } catch (error) {
            this.emit('labels:error', error);
            throw error;
        }
    }

    async removeLabelFromMessage(labelId, messageId) {
        try {
            const label = this.labels.get(labelId);
            if (!label) {
                throw new Error(`Label ${labelId} not found`);
            }

            const labeledMessages = this.labeledMessages.get(labelId) || new Set();
            
            if (!labeledMessages.has(messageId)) {
                return { success: false, message: 'Message does not have this label' };
            }

            labeledMessages.delete(messageId);
            this.labeledMessages.set(labelId, labeledMessages);
            
            // Update label message count
            label.messageCount = labeledMessages.size;
            this.labels.set(labelId, label);

            this.emit('message:unlabeled', { labelId, messageId });
            return { success: true, message: 'Label removed from message successfully' };
        } catch (error) {
            this.emit('labels:error', error);
            throw error;
        }
    }

    // Chat Labeling
    async addLabelToChat(labelId, chatId) {
        try {
            const label = this.labels.get(labelId);
            if (!label) {
                throw new Error(`Label ${labelId} not found`);
            }

            const labeledChats = this.labeledChats.get(labelId) || new Set();
            
            if (labeledChats.has(chatId)) {
                return { success: false, message: 'Chat already has this label' };
            }

            labeledChats.add(chatId);
            this.labeledChats.set(labelId, labeledChats);
            
            // Update label chat count
            label.chatCount = labeledChats.size;
            this.labels.set(labelId, label);

            this.emit('chat:labeled', { labelId, chatId });
            return { success: true, message: 'Label added to chat successfully' };
        } catch (error) {
            this.emit('labels:error', error);
            throw error;
        }
    }

    async removeLabelFromChat(labelId, chatId) {
        try {
            const label = this.labels.get(labelId);
            if (!label) {
                throw new Error(`Label ${labelId} not found`);
            }

            const labeledChats = this.labeledChats.get(labelId) || new Set();
            
            if (!labeledChats.has(chatId)) {
                return { success: false, message: 'Chat does not have this label' };
            }

            labeledChats.delete(chatId);
            this.labeledChats.set(labelId, labeledChats);
            
            // Update label chat count
            label.chatCount = labeledChats.size;
            this.labels.set(labelId, label);

            this.emit('chat:unlabeled', { labelId, chatId });
            return { success: true, message: 'Label removed from chat successfully' };
        } catch (error) {
            this.emit('labels:error', error);
            throw error;
        }
    }

    // Auto-Labeling Rules
    async createLabelingRule(ruleData) {
        try {
            const rule = {
                id: ruleData.id || this.generateRuleId(),
                labelId: ruleData.labelId,
                name: ruleData.name,
                description: ruleData.description || '',
                conditions: ruleData.conditions || [],
                actions: ruleData.actions || [],
                enabled: ruleData.enabled !== false,
                created: new Date().toISOString(),
                lastTriggered: null,
                triggerCount: 0
            };

            // Validate label exists
            if (!this.labels.has(rule.labelId)) {
                throw new Error(`Label ${rule.labelId} not found`);
            }

            this.labelRules.set(rule.id, rule);
            this.emit('label:rule:created', rule);
            return rule;
        } catch (error) {
            this.emit('labels:error', error);
            throw error;
        }
    }

    async updateLabelingRule(ruleId, updates) {
        try {
            const rule = this.labelRules.get(ruleId);
            if (!rule) {
                throw new Error(`Labeling rule ${ruleId} not found`);
            }

            const updatedRule = {
                ...rule,
                ...updates,
                updated: new Date().toISOString()
            };

            this.labelRules.set(ruleId, updatedRule);
            this.emit('label:rule:updated', updatedRule);
            return updatedRule;
        } catch (error) {
            this.emit('labels:error', error);
            throw error;
        }
    }

    async deleteLabelingRule(ruleId) {
        try {
            const rule = this.labelRules.get(ruleId);
            if (!rule) {
                throw new Error(`Labeling rule ${ruleId} not found`);
            }

            this.labelRules.delete(ruleId);
            this.emit('label:rule:deleted', { ruleId, rule });
            return { success: true, message: 'Labeling rule deleted successfully' };
        } catch (error) {
            this.emit('labels:error', error);
            throw error;
        }
    }

    // Auto-Labeling Processing
    async processAutoLabeling(messageUpdate) {
        try {
            for (const message of messageUpdate.messages) {
                for (const rule of this.labelRules.values()) {
                    if (rule.enabled && this.evaluateRule(rule, message)) {
                        await this.applyRuleActions(rule, message);
                        
                        // Update rule statistics
                        rule.lastTriggered = new Date().toISOString();
                        rule.triggerCount++;
                        this.labelRules.set(rule.id, rule);
                    }
                }
            }
        } catch (error) {
            this.emit('labels:error', error);
        }
    }

    evaluateRule(rule, message) {
        try {
            for (const condition of rule.conditions) {
                if (!this.evaluateCondition(condition, message)) {
                    return false;
                }
            }
            return true;
        } catch (error) {
            return false;
        }
    }

    evaluateCondition(condition, message) {
        const { field, operator, value } = condition;
        let messageValue;

        switch (field) {
            case 'content':
                messageValue = message.message?.conversation || 
                              message.message?.extendedTextMessage?.text || '';
                break;
            case 'sender':
                messageValue = message.key?.remoteJid || '';
                break;
            case 'type':
                messageValue = Object.keys(message.message || {})[0] || '';
                break;
            case 'timestamp':
                messageValue = message.messageTimestamp;
                break;
            default:
                return false;
        }

        switch (operator) {
            case 'contains':
                return messageValue.toLowerCase().includes(value.toLowerCase());
            case 'equals':
                return messageValue === value;
            case 'startsWith':
                return messageValue.toLowerCase().startsWith(value.toLowerCase());
            case 'endsWith':
                return messageValue.toLowerCase().endsWith(value.toLowerCase());
            case 'regex':
                return new RegExp(value, 'i').test(messageValue);
            case 'greaterThan':
                return Number(messageValue) > Number(value);
            case 'lessThan':
                return Number(messageValue) < Number(value);
            default:
                return false;
        }
    }

    async applyRuleActions(rule, message) {
        try {
            for (const action of rule.actions) {
                switch (action.type) {
                    case 'addLabel':
                        await this.addLabelToMessage(rule.labelId, message.key.id);
                        break;
                    case 'addChatLabel':
                        await this.addLabelToChat(rule.labelId, message.key.remoteJid);
                        break;
                    default:
                        console.warn(`Unknown rule action type: ${action.type}`);
                }
            }
        } catch (error) {
            console.error('Failed to apply rule actions:', error);
        }
    }

    // Label Search and Filtering
    searchLabels(query, filters = {}) {
        try {
            let results = Array.from(this.labels.values());

            // Text search
            if (query) {
                const searchTerm = query.toLowerCase();
                results = results.filter(label => 
                    label.name.toLowerCase().includes(searchTerm) ||
                    label.description.toLowerCase().includes(searchTerm)
                );
            }

            // Apply filters
            if (filters.color) {
                results = results.filter(label => label.color === filters.color);
            }

            if (filters.isSystem !== undefined) {
                results = results.filter(label => label.isSystem === filters.isSystem);
            }

            if (filters.hasMessages !== undefined) {
                results = results.filter(label => 
                    filters.hasMessages ? label.messageCount > 0 : label.messageCount === 0
                );
            }

            if (filters.hasChats !== undefined) {
                results = results.filter(label => 
                    filters.hasChats ? label.chatCount > 0 : label.chatCount === 0
                );
            }

            // Sort results
            if (filters.sortBy) {
                results.sort((a, b) => {
                    switch (filters.sortBy) {
                        case 'name':
                            return a.name.localeCompare(b.name);
                        case 'messageCount':
                            return b.messageCount - a.messageCount;
                        case 'chatCount':
                            return b.chatCount - a.chatCount;
                        case 'created':
                            return new Date(b.created) - new Date(a.created);
                        default:
                            return 0;
                    }
                });
            }

            return {
                labels: results,
                total: results.length,
                query: query,
                filters: filters
            };
        } catch (error) {
            this.emit('labels:error', error);
            throw error;
        }
    }

    // Helper methods
    serializeLabel(label) {
        return [
            { tag: 'name', attrs: {}, content: label.name },
            { tag: 'color', attrs: {}, content: label.color },
            { tag: 'description', attrs: {}, content: label.description },
            { tag: 'icon', attrs: {}, content: label.icon }
        ];
    }

    generateLabelId() {
        return `label_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    }

    generateRuleId() {
        return `rule_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    }

    generateRandomColor() {
        const colors = [
            '#FF6B35', '#F7931E', '#FFD23F', '#06FFA5', '#118AB2',
            '#073B4C', '#EF476F', '#FFC43D', '#06D6A0', '#1B9AAA',
            '#8B5CF6', '#F59E0B', '#EF4444', '#10B981', '#3B82F6'
        ];
        return colors[Math.floor(Math.random() * colors.length)];
    }

    // Load system labels
    async loadLabels() {
        try {
            // Create default system labels
            const systemLabels = [
                { name: 'Important', color: '#EF4444', icon: '⭐', isSystem: true },
                { name: 'Work', color: '#3B82F6', icon: '💼', isSystem: true },
                { name: 'Personal', color: '#10B981', icon: '👤', isSystem: true },
                { name: 'Urgent', color: '#F59E0B', icon: '🚨', isSystem: true },
                { name: 'Follow Up', color: '#8B5CF6', icon: '📋', isSystem: true }
            ];

            for (const labelData of systemLabels) {
                const labelId = this.generateLabelId();
                const label = {
                    id: labelId,
                    ...labelData,
                    description: `System label: ${labelData.name}`,
                    created: new Date().toISOString(),
                    updated: new Date().toISOString(),
                    messageCount: 0,
                    chatCount: 0
                };

                this.labels.set(labelId, label);
                this.labeledMessages.set(labelId, new Set());
                this.labeledChats.set(labelId, new Set());
            }

            this.emit('labels:system:loaded', systemLabels);
        } catch (error) {
            this.emit('labels:error', error);
        }
    }

    // Event handlers
    handleLabelsUpdate(labels) {
        try {
            labels.forEach(label => {
                this.labels.set(label.id, label);
            });

            this.emit('labels:server:update', labels);
        } catch (error) {
            this.emit('labels:error', error);
        }
    }

    // Getters
    getLabel(labelId) {
        return this.labels.get(labelId);
    }

    getAllLabels() {
        return Array.from(this.labels.values());
    }

    getSystemLabels() {
        return Array.from(this.labels.values()).filter(label => label.isSystem);
    }

    getUserLabels() {
        return Array.from(this.labels.values()).filter(label => !label.isSystem);
    }

    getLabeledMessages(labelId) {
        const labeledMessages = this.labeledMessages.get(labelId) || new Set();
        return Array.from(labeledMessages);
    }

    getLabeledChats(labelId) {
        const labeledChats = this.labeledChats.get(labelId) || new Set();
        return Array.from(labeledChats);
    }

    getMessageLabels(messageId) {
        const messageLabels = [];
        
        for (const [labelId, messages] of this.labeledMessages.entries()) {
            if (messages.has(messageId)) {
                const label = this.labels.get(labelId);
                if (label) {
                    messageLabels.push(label);
                }
            }
        }
        
        return messageLabels;
    }

    getChatLabels(chatId) {
        const chatLabels = [];
        
        for (const [labelId, chats] of this.labeledChats.entries()) {
            if (chats.has(chatId)) {
                const label = this.labels.get(labelId);
                if (label) {
                    chatLabels.push(label);
                }
            }
        }
        
        return chatLabels;
    }

    getLabelingRules() {
        return Array.from(this.labelRules.values());
    }

    getActiveLabelingRules() {
        return Array.from(this.labelRules.values()).filter(rule => rule.enabled);
    }

    getStatistics() {
        const labels = Array.from(this.labels.values());
        const rules = Array.from(this.labelRules.values());

        return {
            totalLabels: labels.length,
            systemLabels: labels.filter(l => l.isSystem).length,
            userLabels: labels.filter(l => !l.isSystem).length,
            totalLabeledMessages: labels.reduce((sum, label) => sum + label.messageCount, 0),
            totalLabeledChats: labels.reduce((sum, label) => sum + label.chatCount, 0),
            totalRules: rules.length,
            activeRules: rules.filter(r => r.enabled).length,
            mostUsedLabel: labels.reduce((max, label) => 
                label.messageCount > (max?.messageCount || 0) ? label : max, null
            )
        };
    }
}

module.exports = WALabels;
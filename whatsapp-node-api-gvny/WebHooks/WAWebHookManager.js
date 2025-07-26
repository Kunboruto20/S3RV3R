const EventEmitter = require('events');
const crypto = require('crypto');

/**
 * WhatsApp WebHook Manager
 * Handles webhook registration, delivery, and management
 */
class WAWebHookManager extends EventEmitter {
    constructor(options = {}) {
        super();
        
        this.options = {
            enableWebHooks: options.enableWebHooks !== false,
            enableSigning: options.enableSigning !== false,
            signingSecret: options.signingSecret || crypto.randomBytes(32).toString('hex'),
            retryAttempts: options.retryAttempts || 3,
            retryDelay: options.retryDelay || 5000,
            timeout: options.timeout || 30000,
            enableQueue: options.enableQueue !== false,
            maxQueueSize: options.maxQueueSize || 1000,
            ...options
        };

        this.webhooks = new Map();
        this.deliveryQueue = [];
        this.deliveryHistory = new Map();
        this.isProcessing = false;

        this.initialize();
    }

    initialize() {
        this.startQueueProcessor();
        this.emit('ready');
    }

    async registerWebHook(url, events, options = {}) {
        try {
            const webhookId = this.generateWebHookId();
            const webhook = {
                id: webhookId,
                url: url,
                events: Array.isArray(events) ? events : [events],
                enabled: options.enabled !== false,
                secret: options.secret || this.generateSecret(),
                headers: options.headers || {},
                retryAttempts: options.retryAttempts || this.options.retryAttempts,
                timeout: options.timeout || this.options.timeout,
                created: new Date().toISOString(),
                lastDelivery: null,
                totalDeliveries: 0,
                successfulDeliveries: 0,
                failedDeliveries: 0
            };

            this.webhooks.set(webhookId, webhook);
            this.emit('webhook.registered', webhook);
            return webhookId;
        } catch (error) {
            throw new Error(`WebHook registration failed: ${error.message}`);
        }
    }

    async unregisterWebHook(webhookId) {
        const webhook = this.webhooks.get(webhookId);
        if (webhook) {
            this.webhooks.delete(webhookId);
            this.emit('webhook.unregistered', webhook);
            return true;
        }
        return false;
    }

    async deliverEvent(eventName, eventData) {
        if (!this.options.enableWebHooks) return;

        const webhooks = Array.from(this.webhooks.values())
            .filter(webhook => webhook.enabled && webhook.events.includes(eventName));

        for (const webhook of webhooks) {
            const delivery = {
                id: this.generateDeliveryId(),
                webhookId: webhook.id,
                eventName: eventName,
                eventData: eventData,
                url: webhook.url,
                headers: webhook.headers,
                secret: webhook.secret,
                attempts: 0,
                maxAttempts: webhook.retryAttempts,
                timeout: webhook.timeout,
                created: new Date().toISOString(),
                status: 'pending'
            };

            if (this.options.enableQueue) {
                this.addToQueue(delivery);
            } else {
                await this.executeDelivery(delivery);
            }
        }
    }

    addToQueue(delivery) {
        if (this.deliveryQueue.length >= this.options.maxQueueSize) {
            this.deliveryQueue.shift(); // Remove oldest
        }
        this.deliveryQueue.push(delivery);
    }

    startQueueProcessor() {
        if (!this.options.enableQueue) return;

        setInterval(async () => {
            if (!this.isProcessing && this.deliveryQueue.length > 0) {
                this.isProcessing = true;
                const delivery = this.deliveryQueue.shift();
                await this.executeDelivery(delivery);
                this.isProcessing = false;
            }
        }, 100);
    }

    async executeDelivery(delivery) {
        try {
            delivery.attempts++;
            delivery.lastAttempt = new Date().toISOString();

            const payload = this.createPayload(delivery);
            const signature = this.signPayload(payload, delivery.secret);

            const headers = {
                'Content-Type': 'application/json',
                'User-Agent': 'WhatsApp-Node-API/1.0',
                'X-Webhook-Signature': signature,
                'X-Webhook-Event': delivery.eventName,
                'X-Webhook-Delivery': delivery.id,
                ...delivery.headers
            };

            const response = await this.makeRequest(delivery.url, payload, headers, delivery.timeout);
            
            if (response.ok) {
                delivery.status = 'delivered';
                delivery.deliveredAt = new Date().toISOString();
                delivery.responseStatus = response.status;
                
                const webhook = this.webhooks.get(delivery.webhookId);
                if (webhook) {
                    webhook.lastDelivery = delivery.deliveredAt;
                    webhook.totalDeliveries++;
                    webhook.successfulDeliveries++;
                }

                this.emit('webhook.delivered', delivery);
            } else {
                throw new Error(`HTTP ${response.status}: ${response.statusText}`);
            }
        } catch (error) {
            delivery.status = 'failed';
            delivery.error = error.message;

            const webhook = this.webhooks.get(delivery.webhookId);
            if (webhook) {
                webhook.totalDeliveries++;
                webhook.failedDeliveries++;
            }

            if (delivery.attempts < delivery.maxAttempts) {
                // Retry with exponential backoff
                const delay = this.options.retryDelay * Math.pow(2, delivery.attempts - 1);
                setTimeout(() => {
                    this.addToQueue(delivery);
                }, delay);
            } else {
                delivery.status = 'exhausted';
                this.emit('webhook.failed', delivery);
            }
        }

        this.deliveryHistory.set(delivery.id, delivery);
    }

    createPayload(delivery) {
        return {
            event: delivery.eventName,
            data: delivery.eventData,
            timestamp: delivery.created,
            webhook_id: delivery.webhookId,
            delivery_id: delivery.id
        };
    }

    signPayload(payload, secret) {
        if (!this.options.enableSigning) return null;
        
        const payloadString = JSON.stringify(payload);
        return crypto
            .createHmac('sha256', secret)
            .update(payloadString)
            .digest('hex');
    }

    async makeRequest(url, payload, headers, timeout) {
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), timeout);

        try {
            const response = await fetch(url, {
                method: 'POST',
                headers: headers,
                body: JSON.stringify(payload),
                signal: controller.signal
            });
            clearTimeout(timeoutId);
            return response;
        } catch (error) {
            clearTimeout(timeoutId);
            throw error;
        }
    }

    generateWebHookId() {
        return `webhook_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    }

    generateDeliveryId() {
        return `delivery_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    }

    generateSecret() {
        return crypto.randomBytes(32).toString('hex');
    }

    getWebHooks() {
        return Array.from(this.webhooks.values());
    }

    getWebHook(webhookId) {
        return this.webhooks.get(webhookId);
    }

    getDeliveryHistory(webhookId = null) {
        const deliveries = Array.from(this.deliveryHistory.values());
        if (webhookId) {
            return deliveries.filter(d => d.webhookId === webhookId);
        }
        return deliveries;
    }

    getStats() {
        const webhooks = Array.from(this.webhooks.values());
        return {
            totalWebHooks: webhooks.length,
            enabledWebHooks: webhooks.filter(w => w.enabled).length,
            queueSize: this.deliveryQueue.length,
            totalDeliveries: webhooks.reduce((sum, w) => sum + w.totalDeliveries, 0),
            successfulDeliveries: webhooks.reduce((sum, w) => sum + w.successfulDeliveries, 0),
            failedDeliveries: webhooks.reduce((sum, w) => sum + w.failedDeliveries, 0)
        };
    }
}

module.exports = WAWebHookManager;
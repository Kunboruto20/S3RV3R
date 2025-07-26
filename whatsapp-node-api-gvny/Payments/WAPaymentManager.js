const EventEmitter = require('events');
const crypto = require('crypto');

/**
 * WhatsApp Payment Manager
 * Handles all payment operations including transactions, invoices, and payment requests
 */
class WAPaymentManager extends EventEmitter {
    constructor(socket, options = {}) {
        super();
        
        this.socket = socket;
        this.options = {
            enablePayments: options.enablePayments !== false,
            defaultCurrency: options.defaultCurrency || 'USD',
            supportedCurrencies: options.supportedCurrencies || ['USD', 'EUR', 'GBP', 'INR', 'BRL'],
            maxTransactionAmount: options.maxTransactionAmount || 10000,
            minTransactionAmount: options.minTransactionAmount || 0.01,
            paymentTimeout: options.paymentTimeout || 300000, // 5 minutes
            enableInvoices: options.enableInvoices !== false,
            enableRecurring: options.enableRecurring || false,
            ...options
        };

        // Payment data stores
        this.transactions = new Map();
        this.invoices = new Map();
        this.paymentMethods = new Map();
        this.recurringPayments = new Map();
        this.paymentRequests = new Map();
        this.refunds = new Map();
        
        // Payment configuration
        this.paymentConfig = {
            merchantId: null,
            merchantName: null,
            merchantCategory: null,
            supportedMethods: ['upi', 'card', 'netbanking', 'wallet'],
            fees: {
                transaction: 0.029, // 2.9%
                fixed: 0.30 // $0.30
            },
            limits: {
                daily: 50000,
                monthly: 200000
            }
        };

        this.initialize();
    }

    async initialize() {
        try {
            await this.loadPaymentConfiguration();
            await this.loadTransactions();
            this.emit('ready');
        } catch (error) {
            this.emit('error', error);
        }
    }

    // Payment Configuration
    async setupPaymentConfiguration(config) {
        try {
            this.paymentConfig = {
                ...this.paymentConfig,
                ...config,
                setupAt: new Date().toISOString()
            };

            // Send payment setup request
            const response = await this.socket.query({
                tag: 'iq',
                attrs: {
                    id: this.socket.generateMessageTag(),
                    type: 'set',
                    xmlns: 'w:pay:config'
                },
                content: [{
                    tag: 'payment_config',
                    attrs: {},
                    content: this.encodePaymentConfig(this.paymentConfig)
                }]
            });

            if (response.attrs.type === 'result') {
                this.emit('payment.config.updated', this.paymentConfig);
                return this.paymentConfig;
            } else {
                throw new Error('Failed to setup payment configuration');
            }
        } catch (error) {
            throw new Error(`Payment configuration failed: ${error.message}`);
        }
    }

    async loadPaymentConfiguration() {
        try {
            const response = await this.socket.query({
                tag: 'iq',
                attrs: {
                    id: this.socket.generateMessageTag(),
                    type: 'get',
                    xmlns: 'w:pay:config'
                },
                content: [{
                    tag: 'payment_config',
                    attrs: {}
                }]
            });

            if (response.content?.[0]) {
                this.paymentConfig = this.decodePaymentConfig(response.content[0]);
                this.emit('payment.config.loaded', this.paymentConfig);
            }
        } catch (error) {
            console.error('Failed to load payment configuration:', error);
        }
    }

    // Payment Requests
    async createPaymentRequest(requestData) {
        try {
            // Validate request data
            this.validatePaymentAmount(requestData.amount, requestData.currency);

            const paymentRequest = {
                id: this.generatePaymentId(),
                recipientJid: requestData.recipientJid,
                amount: requestData.amount,
                currency: requestData.currency || this.options.defaultCurrency,
                description: requestData.description,
                dueDate: requestData.dueDate,
                paymentMethods: requestData.paymentMethods || this.paymentConfig.supportedMethods,
                status: 'pending',
                expiresAt: new Date(Date.now() + this.options.paymentTimeout).toISOString(),
                createdAt: new Date().toISOString(),
                metadata: requestData.metadata || {}
            };

            // Create payment request message
            const message = {
                requestPaymentMessage: {
                    noteMessage: {
                        extendedTextMessage: {
                            text: requestData.description || `Payment request for ${paymentRequest.currency} ${paymentRequest.amount}`
                        }
                    },
                    currencyCodeIso4217: paymentRequest.currency,
                    amount1000: Math.round(paymentRequest.amount * 1000),
                    requestFrom: this.socket.user.id,
                    expiryTimestamp: Math.floor(new Date(paymentRequest.expiresAt).getTime() / 1000)
                }
            };

            // Send payment request
            const result = await this.socket.sendMessage(requestData.recipientJid, message);
            
            paymentRequest.messageKey = result.key;
            this.paymentRequests.set(paymentRequest.id, paymentRequest);
            
            this.emit('payment.request.created', paymentRequest);
            return paymentRequest;
        } catch (error) {
            throw new Error(`Payment request creation failed: ${error.message}`);
        }
    }

    async sendPayment(paymentData) {
        try {
            // Validate payment data
            this.validatePaymentAmount(paymentData.amount, paymentData.currency);

            const payment = {
                id: this.generatePaymentId(),
                recipientJid: paymentData.recipientJid,
                amount: paymentData.amount,
                currency: paymentData.currency || this.options.defaultCurrency,
                description: paymentData.description,
                paymentMethod: paymentData.paymentMethod,
                status: 'processing',
                createdAt: new Date().toISOString(),
                metadata: paymentData.metadata || {}
            };

            // Create payment message
            const message = {
                sendPaymentMessage: {
                    noteMessage: {
                        extendedTextMessage: {
                            text: paymentData.description || `Payment of ${payment.currency} ${payment.amount}`
                        }
                    },
                    requestMessageKey: paymentData.requestMessageKey,
                    background: paymentData.background
                }
            };

            // Send payment
            const result = await this.socket.sendMessage(paymentData.recipientJid, message);
            
            payment.messageKey = result.key;
            this.transactions.set(payment.id, payment);
            
            this.emit('payment.sent', payment);
            return payment;
        } catch (error) {
            throw new Error(`Payment sending failed: ${error.message}`);
        }
    }

    // Invoice Management
    async createInvoice(invoiceData) {
        try {
            const invoice = {
                id: this.generateInvoiceId(),
                customerId: invoiceData.customerId,
                customerJid: invoiceData.customerJid,
                items: invoiceData.items,
                subtotal: this.calculateSubtotal(invoiceData.items),
                tax: invoiceData.tax || 0,
                discount: invoiceData.discount || 0,
                total: 0,
                currency: invoiceData.currency || this.options.defaultCurrency,
                description: invoiceData.description,
                dueDate: invoiceData.dueDate,
                status: 'draft',
                paymentStatus: 'unpaid',
                createdAt: new Date().toISOString(),
                updatedAt: new Date().toISOString(),
                metadata: invoiceData.metadata || {}
            };

            // Calculate total
            invoice.total = invoice.subtotal + invoice.tax - invoice.discount;

            // Validate total amount
            this.validatePaymentAmount(invoice.total, invoice.currency);

            this.invoices.set(invoice.id, invoice);
            this.emit('invoice.created', invoice);
            return invoice;
        } catch (error) {
            throw new Error(`Invoice creation failed: ${error.message}`);
        }
    }

    async sendInvoice(invoiceId, options = {}) {
        try {
            const invoice = this.invoices.get(invoiceId);
            if (!invoice) {
                throw new Error('Invoice not found');
            }

            // Update invoice status
            invoice.status = 'sent';
            invoice.sentAt = new Date().toISOString();
            invoice.updatedAt = new Date().toISOString();

            // Create invoice message
            const message = {
                invoiceMessage: {
                    note: invoice.description,
                    token: invoice.id,
                    attachmentType: 'INVOICE',
                    attachmentMimetype: 'application/pdf',
                    attachmentFilename: `invoice_${invoice.id}.pdf`,
                    attachmentDirectPath: options.attachmentPath,
                    attachmentMediaKey: options.attachmentKey,
                    attachmentFileEncSha256: options.attachmentHash,
                    attachmentFileSha256: options.attachmentSha256,
                    attachmentFileLength: options.attachmentSize
                }
            };

            // Send invoice
            const result = await this.socket.sendMessage(invoice.customerJid, message, options);
            
            invoice.messageKey = result.key;
            this.invoices.set(invoiceId, invoice);
            
            this.emit('invoice.sent', invoice);
            return invoice;
        } catch (error) {
            throw new Error(`Invoice sending failed: ${error.message}`);
        }
    }

    async updateInvoiceStatus(invoiceId, status, paymentStatus = null) {
        try {
            const invoice = this.invoices.get(invoiceId);
            if (!invoice) {
                throw new Error('Invoice not found');
            }

            const updates = {
                status,
                updatedAt: new Date().toISOString()
            };

            if (paymentStatus) {
                updates.paymentStatus = paymentStatus;
                if (paymentStatus === 'paid') {
                    updates.paidAt = new Date().toISOString();
                }
            }

            const updatedInvoice = { ...invoice, ...updates };
            this.invoices.set(invoiceId, updatedInvoice);
            
            this.emit('invoice.updated', updatedInvoice);
            this.emit(`invoice.${status}`, updatedInvoice);
            
            return updatedInvoice;
        } catch (error) {
            throw new Error(`Invoice status update failed: ${error.message}`);
        }
    }

    // Transaction Management
    async processTransaction(transactionData) {
        try {
            const transaction = {
                id: this.generateTransactionId(),
                type: transactionData.type, // 'payment', 'refund', 'fee'
                fromJid: transactionData.fromJid,
                toJid: transactionData.toJid,
                amount: transactionData.amount,
                currency: transactionData.currency,
                description: transactionData.description,
                paymentMethod: transactionData.paymentMethod,
                status: 'processing',
                fees: this.calculateFees(transactionData.amount),
                invoiceId: transactionData.invoiceId,
                orderId: transactionData.orderId,
                createdAt: new Date().toISOString(),
                processedAt: null,
                metadata: transactionData.metadata || {}
            };

            this.transactions.set(transaction.id, transaction);
            
            // Simulate processing (in real implementation, this would interact with payment gateway)
            setTimeout(() => {
                this.completeTransaction(transaction.id, 'completed');
            }, 2000);

            this.emit('transaction.created', transaction);
            return transaction;
        } catch (error) {
            throw new Error(`Transaction processing failed: ${error.message}`);
        }
    }

    async completeTransaction(transactionId, status) {
        try {
            const transaction = this.transactions.get(transactionId);
            if (!transaction) {
                throw new Error('Transaction not found');
            }

            transaction.status = status;
            transaction.processedAt = new Date().toISOString();

            // Update related invoice if exists
            if (transaction.invoiceId && status === 'completed') {
                await this.updateInvoiceStatus(transaction.invoiceId, 'paid', 'paid');
            }

            this.transactions.set(transactionId, transaction);
            this.emit('transaction.completed', transaction);
            
            return transaction;
        } catch (error) {
            throw new Error(`Transaction completion failed: ${error.message}`);
        }
    }

    // Refund Management
    async createRefund(refundData) {
        try {
            const originalTransaction = this.transactions.get(refundData.transactionId);
            if (!originalTransaction) {
                throw new Error('Original transaction not found');
            }

            if (originalTransaction.status !== 'completed') {
                throw new Error('Cannot refund incomplete transaction');
            }

            const refund = {
                id: this.generateRefundId(),
                transactionId: refundData.transactionId,
                amount: refundData.amount || originalTransaction.amount,
                currency: originalTransaction.currency,
                reason: refundData.reason,
                status: 'processing',
                createdAt: new Date().toISOString(),
                processedAt: null,
                metadata: refundData.metadata || {}
            };

            // Validate refund amount
            if (refund.amount > originalTransaction.amount) {
                throw new Error('Refund amount cannot exceed original transaction amount');
            }

            this.refunds.set(refund.id, refund);
            
            // Process refund transaction
            await this.processTransaction({
                type: 'refund',
                fromJid: originalTransaction.toJid,
                toJid: originalTransaction.fromJid,
                amount: refund.amount,
                currency: refund.currency,
                description: `Refund for transaction ${refundData.transactionId}`,
                paymentMethod: originalTransaction.paymentMethod,
                metadata: { refundId: refund.id, originalTransactionId: refundData.transactionId }
            });

            this.emit('refund.created', refund);
            return refund;
        } catch (error) {
            throw new Error(`Refund creation failed: ${error.message}`);
        }
    }

    // Recurring Payments
    async createRecurringPayment(recurringData) {
        try {
            if (!this.options.enableRecurring) {
                throw new Error('Recurring payments are not enabled');
            }

            const recurring = {
                id: this.generateRecurringId(),
                customerJid: recurringData.customerJid,
                amount: recurringData.amount,
                currency: recurringData.currency || this.options.defaultCurrency,
                interval: recurringData.interval, // 'daily', 'weekly', 'monthly', 'yearly'
                description: recurringData.description,
                startDate: recurringData.startDate || new Date().toISOString(),
                endDate: recurringData.endDate,
                status: 'active',
                nextPaymentDate: this.calculateNextPaymentDate(recurringData.startDate, recurringData.interval),
                totalPayments: 0,
                failedPayments: 0,
                createdAt: new Date().toISOString(),
                metadata: recurringData.metadata || {}
            };

            this.recurringPayments.set(recurring.id, recurring);
            this.emit('recurring.created', recurring);
            
            // Schedule first payment
            this.scheduleRecurringPayment(recurring.id);
            
            return recurring;
        } catch (error) {
            throw new Error(`Recurring payment creation failed: ${error.message}`);
        }
    }

    scheduleRecurringPayment(recurringId) {
        const recurring = this.recurringPayments.get(recurringId);
        if (!recurring || recurring.status !== 'active') {
            return;
        }

        const timeUntilNext = new Date(recurring.nextPaymentDate).getTime() - Date.now();
        
        if (timeUntilNext > 0) {
            setTimeout(async () => {
                try {
                    await this.processRecurringPayment(recurringId);
                } catch (error) {
                    this.emit('recurring.error', { recurringId, error });
                }
            }, timeUntilNext);
        }
    }

    async processRecurringPayment(recurringId) {
        try {
            const recurring = this.recurringPayments.get(recurringId);
            if (!recurring) {
                throw new Error('Recurring payment not found');
            }

            // Create payment request
            const paymentRequest = await this.createPaymentRequest({
                recipientJid: recurring.customerJid,
                amount: recurring.amount,
                currency: recurring.currency,
                description: `${recurring.description} - Recurring Payment`,
                metadata: { recurringId: recurring.id }
            });

            // Update recurring payment
            recurring.totalPayments++;
            recurring.nextPaymentDate = this.calculateNextPaymentDate(
                recurring.nextPaymentDate, 
                recurring.interval
            );
            recurring.lastPaymentDate = new Date().toISOString();

            this.recurringPayments.set(recurringId, recurring);
            this.emit('recurring.processed', { recurring, paymentRequest });

            // Schedule next payment
            this.scheduleRecurringPayment(recurringId);
            
        } catch (error) {
            const recurring = this.recurringPayments.get(recurringId);
            if (recurring) {
                recurring.failedPayments++;
                this.recurringPayments.set(recurringId, recurring);
            }
            throw error;
        }
    }

    // Utility Methods
    validatePaymentAmount(amount, currency) {
        if (amount < this.options.minTransactionAmount) {
            throw new Error(`Amount too small. Minimum: ${this.options.minTransactionAmount} ${currency}`);
        }
        
        if (amount > this.options.maxTransactionAmount) {
            throw new Error(`Amount too large. Maximum: ${this.options.maxTransactionAmount} ${currency}`);
        }
        
        if (!this.options.supportedCurrencies.includes(currency)) {
            throw new Error(`Unsupported currency: ${currency}`);
        }
    }

    calculateFees(amount) {
        const transactionFee = amount * this.paymentConfig.fees.transaction;
        const fixedFee = this.paymentConfig.fees.fixed;
        return {
            transaction: transactionFee,
            fixed: fixedFee,
            total: transactionFee + fixedFee
        };
    }

    calculateSubtotal(items) {
        return items.reduce((total, item) => total + (item.price * item.quantity), 0);
    }

    calculateNextPaymentDate(currentDate, interval) {
        const date = new Date(currentDate);
        
        switch (interval) {
            case 'daily':
                date.setDate(date.getDate() + 1);
                break;
            case 'weekly':
                date.setDate(date.getDate() + 7);
                break;
            case 'monthly':
                date.setMonth(date.getMonth() + 1);
                break;
            case 'yearly':
                date.setFullYear(date.getFullYear() + 1);
                break;
            default:
                throw new Error(`Invalid interval: ${interval}`);
        }
        
        return date.toISOString();
    }

    // ID Generators
    generatePaymentId() {
        return `pay_${Date.now()}_${crypto.randomBytes(8).toString('hex')}`;
    }

    generateInvoiceId() {
        return `inv_${Date.now()}_${crypto.randomBytes(8).toString('hex')}`;
    }

    generateTransactionId() {
        return `txn_${Date.now()}_${crypto.randomBytes(8).toString('hex')}`;
    }

    generateRefundId() {
        return `ref_${Date.now()}_${crypto.randomBytes(8).toString('hex')}`;
    }

    generateRecurringId() {
        return `rec_${Date.now()}_${crypto.randomBytes(8).toString('hex')}`;
    }

    // Encoding/Decoding Methods
    encodePaymentConfig(config) {
        return [
            { tag: 'merchant_id', attrs: {}, content: config.merchantId },
            { tag: 'merchant_name', attrs: {}, content: config.merchantName },
            { tag: 'merchant_category', attrs: {}, content: config.merchantCategory },
            { tag: 'supported_methods', attrs: {}, content: JSON.stringify(config.supportedMethods) },
            { tag: 'fees', attrs: {}, content: JSON.stringify(config.fees) },
            { tag: 'limits', attrs: {}, content: JSON.stringify(config.limits) }
        ];
    }

    decodePaymentConfig(node) {
        const config = {};
        if (node.content) {
            for (const child of node.content) {
                if (child.tag && child.content) {
                    if (['supported_methods', 'fees', 'limits'].includes(child.tag)) {
                        config[child.tag] = JSON.parse(child.content);
                    } else {
                        config[child.tag] = child.content;
                    }
                }
            }
        }
        return config;
    }

    async loadTransactions() {
        try {
            const response = await this.socket.query({
                tag: 'iq',
                attrs: {
                    id: this.socket.generateMessageTag(),
                    type: 'get',
                    xmlns: 'w:pay:history'
                },
                content: [{
                    tag: 'transactions',
                    attrs: { limit: '100' }
                }]
            });

            if (response.content) {
                for (const transactionNode of response.content) {
                    if (transactionNode.tag === 'transaction') {
                        const transaction = this.decodeTransaction(transactionNode);
                        this.transactions.set(transaction.id, transaction);
                    }
                }
                this.emit('transactions.loaded', Array.from(this.transactions.values()));
            }
        } catch (error) {
            console.error('Failed to load transactions:', error);
        }
    }

    decodeTransaction(node) {
        const transaction = {};
        if (node.content) {
            for (const child of node.content) {
                if (child.tag && child.content) {
                    if (child.tag === 'fees') {
                        transaction[child.tag] = JSON.parse(child.content);
                    } else if (child.tag === 'amount') {
                        transaction[child.tag] = parseFloat(child.content);
                    } else {
                        transaction[child.tag] = child.content;
                    }
                }
            }
        }
        return transaction;
    }

    // Getters
    getTransactions() {
        return Array.from(this.transactions.values());
    }

    getTransaction(transactionId) {
        return this.transactions.get(transactionId);
    }

    getInvoices() {
        return Array.from(this.invoices.values());
    }

    getInvoice(invoiceId) {
        return this.invoices.get(invoiceId);
    }

    getPaymentRequests() {
        return Array.from(this.paymentRequests.values());
    }

    getPaymentRequest(requestId) {
        return this.paymentRequests.get(requestId);
    }

    getRecurringPayments() {
        return Array.from(this.recurringPayments.values());
    }

    getRecurringPayment(recurringId) {
        return this.recurringPayments.get(recurringId);
    }

    // Statistics
    getPaymentStats() {
        const transactions = Array.from(this.transactions.values());
        const completedTransactions = transactions.filter(t => t.status === 'completed');
        
        return {
            totalTransactions: transactions.length,
            completedTransactions: completedTransactions.length,
            totalVolume: completedTransactions.reduce((sum, t) => sum + t.amount, 0),
            totalFees: completedTransactions.reduce((sum, t) => sum + (t.fees?.total || 0), 0),
            averageTransaction: completedTransactions.length > 0 
                ? completedTransactions.reduce((sum, t) => sum + t.amount, 0) / completedTransactions.length 
                : 0,
            invoices: this.invoices.size,
            recurringPayments: this.recurringPayments.size,
            refunds: this.refunds.size
        };
    }
}

module.exports = WAPaymentManager;
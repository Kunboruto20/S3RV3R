const crypto = require('crypto');

class WABusinessHandler {
    constructor(socket) {
        this.socket = socket;
        this.businessCache = new Map();
        this.catalogCache = new Map();
        this.productCache = new Map();
        this.orderCache = new Map();
        this.collectionCache = new Map();
    }
    
    async getBusinessProfile(jid) {
        try {
            // Check cache first
            if (this.businessCache.has(jid)) {
                return this.businessCache.get(jid);
            }
            
            const businessNode = {
                tag: 'iq',
                attrs: {
                    id: this.generateId(),
                    type: 'get',
                    xmlns: 'w:biz',
                    to: jid
                },
                content: [{
                    tag: 'business_profile'
                }]
            };
            
            const response = await this.socket.query(businessNode);
            
            if (response.attrs?.type === 'error') {
                return null;
            }
            
            const businessProfile = this.parseBusinessProfile(response);
            
            // Cache business profile
            if (businessProfile) {
                this.businessCache.set(jid, businessProfile);
            }
            
            return businessProfile;
            
        } catch (error) {
            this.socket.options.logger.error('Error getting business profile:', error);
            return null;
        }
    }
    
    async getCatalog(jid, limit = 50, after = null) {
        try {
            const catalogNode = {
                tag: 'iq',
                attrs: {
                    id: this.generateId(),
                    type: 'get',
                    xmlns: 'w:biz:catalog',
                    to: jid
                },
                content: [{
                    tag: 'product_catalog',
                    attrs: {
                        limit: limit.toString(),
                        after: after || undefined
                    }
                }]
            };
            
            const response = await this.socket.query(catalogNode);
            
            if (response.attrs?.type === 'error') {
                throw new Error('Failed to get catalog');
            }
            
            const catalog = this.parseCatalog(response);
            
            // Cache catalog
            this.catalogCache.set(jid, catalog);
            
            return catalog;
            
        } catch (error) {
            throw new Error(`Failed to get catalog: ${error.message}`);
        }
    }
    
    async getProduct(jid, productId) {
        try {
            // Check cache first
            const cacheKey = `${jid}_${productId}`;
            if (this.productCache.has(cacheKey)) {
                return this.productCache.get(cacheKey);
            }
            
            const productNode = {
                tag: 'iq',
                attrs: {
                    id: this.generateId(),
                    type: 'get',
                    xmlns: 'w:biz:catalog',
                    to: jid
                },
                content: [{
                    tag: 'product',
                    attrs: {
                        product_id: productId
                    }
                }]
            };
            
            const response = await this.socket.query(productNode);
            
            if (response.attrs?.type === 'error') {
                return null;
            }
            
            const product = this.parseProduct(response);
            
            // Cache product
            if (product) {
                this.productCache.set(cacheKey, product);
            }
            
            return product;
            
        } catch (error) {
            this.socket.options.logger.error('Error getting product:', error);
            return null;
        }
    }
    
    async sendProductMessage(jid, product, options = {}) {
        try {
            const messageId = this.generateId();
            const timestamp = Math.floor(Date.now() / 1000);
            
            const productMessage = {
                tag: 'message',
                attrs: {
                    id: messageId,
                    to: jid,
                    type: 'chat',
                    t: timestamp.toString()
                },
                content: [{
                    tag: 'productMessage',
                    attrs: {
                        product: JSON.stringify({
                            productId: product.id,
                            businessOwnerJid: product.businessOwnerJid,
                            catalogId: product.catalogId,
                            title: product.title,
                            description: product.description,
                            currencyCode: product.currencyCode,
                            priceAmount1000: product.priceAmount1000,
                            retailerId: product.retailerId,
                            url: product.url,
                            productImageCount: product.images?.length || 0,
                            firstImageId: product.images?.[0]?.id || '',
                            salePriceAmount1000: product.salePriceAmount1000 || product.priceAmount1000
                        })
                    },
                    content: options.caption ? [{
                        tag: 'caption',
                        content: options.caption
                    }] : []
                }]
            };
            
            await this.socket.sendNode(productMessage);
            
            return {
                key: {
                    id: messageId,
                    remoteJid: jid,
                    fromMe: true
                },
                message: {
                    productMessage: {
                        product: product,
                        caption: options.caption
                    }
                },
                messageTimestamp: timestamp * 1000,
                status: 'sent'
            };
            
        } catch (error) {
            throw new Error(`Failed to send product message: ${error.message}`);
        }
    }
    
    async sendOrderMessage(jid, order, options = {}) {
        try {
            const messageId = this.generateId();
            const timestamp = Math.floor(Date.now() / 1000);
            
            const orderMessage = {
                tag: 'message',
                attrs: {
                    id: messageId,
                    to: jid,
                    type: 'chat',
                    t: timestamp.toString()
                },
                content: [{
                    tag: 'orderMessage',
                    attrs: {
                        orderId: order.id,
                        thumbnail: order.thumbnail || '',
                        itemCount: order.items?.length || 0,
                        status: order.status || 'inquiry',
                        surface: order.surface || 'catalog',
                        message: order.message || '',
                        orderTitle: order.title || '',
                        sellerJid: order.sellerJid,
                        token: order.token || '',
                        totalAmount1000: order.totalAmount1000 || 0,
                        totalCurrencyCode: order.totalCurrencyCode || 'USD'
                    }
                }]
            };
            
            await this.socket.sendNode(orderMessage);
            
            return {
                key: {
                    id: messageId,
                    remoteJid: jid,
                    fromMe: true
                },
                message: {
                    orderMessage: order
                },
                messageTimestamp: timestamp * 1000,
                status: 'sent'
            };
            
        } catch (error) {
            throw new Error(`Failed to send order message: ${error.message}`);
        }
    }
    
    async sendInvoiceMessage(jid, invoice, options = {}) {
        try {
            const messageId = this.generateId();
            const timestamp = Math.floor(Date.now() / 1000);
            
            const invoiceMessage = {
                tag: 'message',
                attrs: {
                    id: messageId,
                    to: jid,
                    type: 'chat',
                    t: timestamp.toString()
                },
                content: [{
                    tag: 'invoiceMessage',
                    attrs: {
                        note: invoice.note || '',
                        token: invoice.token || '',
                        attachment: invoice.attachment ? JSON.stringify(invoice.attachment) : '',
                        hydratedTemplate: invoice.hydratedTemplate ? JSON.stringify(invoice.hydratedTemplate) : ''
                    }
                }]
            };
            
            await this.socket.sendNode(invoiceMessage);
            
            return {
                key: {
                    id: messageId,
                    remoteJid: jid,
                    fromMe: true
                },
                message: {
                    invoiceMessage: invoice
                },
                messageTimestamp: timestamp * 1000,
                status: 'sent'
            };
            
        } catch (error) {
            throw new Error(`Failed to send invoice message: ${error.message}`);
        }
    }
    
    async createOrder(products, customerInfo, options = {}) {
        try {
            const orderId = this.generateOrderId();
            
            const order = {
                id: orderId,
                items: products.map(product => ({
                    productId: product.id,
                    quantity: product.quantity || 1,
                    itemPrice: product.price,
                    currency: product.currency || 'USD'
                })),
                customerInfo: customerInfo,
                status: 'pending',
                totalAmount1000: products.reduce((total, product) => 
                    total + (product.price * (product.quantity || 1) * 1000), 0),
                totalCurrencyCode: products[0]?.currency || 'USD',
                createdAt: Date.now(),
                ...options
            };
            
            // Cache order
            this.orderCache.set(orderId, order);
            
            return order;
            
        } catch (error) {
            throw new Error(`Failed to create order: ${error.message}`);
        }
    }
    
    async updateOrderStatus(orderId, status, message = '') {
        try {
            if (!this.orderCache.has(orderId)) {
                throw new Error('Order not found');
            }
            
            const order = this.orderCache.get(orderId);
            order.status = status;
            order.statusMessage = message;
            order.updatedAt = Date.now();
            
            // Emit order update event
            this.socket.emit('business.order.update', {
                orderId: orderId,
                status: status,
                message: message,
                order: order
            });
            
            return order;
            
        } catch (error) {
            throw new Error(`Failed to update order status: ${error.message}`);
        }
    }
    
    async getCollections(jid, limit = 20) {
        try {
            const collectionsNode = {
                tag: 'iq',
                attrs: {
                    id: this.generateId(),
                    type: 'get',
                    xmlns: 'w:biz:catalog',
                    to: jid
                },
                content: [{
                    tag: 'collections',
                    attrs: {
                        limit: limit.toString()
                    }
                }]
            };
            
            const response = await this.socket.query(collectionsNode);
            
            if (response.attrs?.type === 'error') {
                throw new Error('Failed to get collections');
            }
            
            const collections = this.parseCollections(response);
            
            // Cache collections
            this.collectionCache.set(jid, collections);
            
            return collections;
            
        } catch (error) {
            throw new Error(`Failed to get collections: ${error.message}`);
        }
    }
    
    parseBusinessProfile(node) {
        try {
            const businessProfile = {
                id: '',
                tag: '',
                description: '',
                category: '',
                email: '',
                website: '',
                address: '',
                verified: false,
                profilePictureUrl: null,
                coverPhoto: null,
                hours: null,
                catalogStatus: 'none'
            };
            
            if (node.content && Array.isArray(node.content)) {
                for (const child of node.content) {
                    if (typeof child === 'object' && child.tag === 'business_profile') {
                        const attrs = child.attrs || {};
                        businessProfile.id = attrs.id || '';
                        businessProfile.verified = attrs.verified === 'true';
                        
                        if (child.content && Array.isArray(child.content)) {
                            for (const profileChild of child.content) {
                                if (typeof profileChild === 'object' && profileChild.tag) {
                                    switch (profileChild.tag) {
                                        case 'tag':
                                            businessProfile.tag = profileChild.content || '';
                                            break;
                                        case 'description':
                                            businessProfile.description = profileChild.content || '';
                                            break;
                                        case 'category':
                                            businessProfile.category = profileChild.content || '';
                                            break;
                                        case 'email':
                                            businessProfile.email = profileChild.content || '';
                                            break;
                                        case 'website':
                                            businessProfile.website = profileChild.content || '';
                                            break;
                                        case 'address':
                                            businessProfile.address = profileChild.content || '';
                                            break;
                                        case 'profile_picture':
                                            businessProfile.profilePictureUrl = profileChild.attrs?.url || null;
                                            break;
                                        case 'cover_photo':
                                            businessProfile.coverPhoto = profileChild.attrs?.url || null;
                                            break;
                                        case 'hours':
                                            businessProfile.hours = this.parseBusinessHours(profileChild);
                                            break;
                                        case 'catalog_status':
                                            businessProfile.catalogStatus = profileChild.content || 'none';
                                            break;
                                    }
                                }
                            }
                        }
                        break;
                    }
                }
            }
            
            return businessProfile;
            
        } catch (error) {
            this.socket.options.logger.error('Error parsing business profile:', error);
            return null;
        }
    }
    
    parseBusinessHours(node) {
        try {
            const hours = {};
            
            if (node.content && Array.isArray(node.content)) {
                for (const dayChild of node.content) {
                    if (typeof dayChild === 'object' && dayChild.tag === 'day') {
                        const day = dayChild.attrs?.name;
                        const openTime = dayChild.attrs?.open_time;
                        const closeTime = dayChild.attrs?.close_time;
                        const closed = dayChild.attrs?.closed === 'true';
                        
                        if (day) {
                            hours[day] = {
                                open: openTime || null,
                                close: closeTime || null,
                                closed: closed
                            };
                        }
                    }
                }
            }
            
            return hours;
            
        } catch (error) {
            return null;
        }
    }
    
    parseCatalog(node) {
        try {
            const catalog = {
                products: [],
                hasMore: false,
                cursor: null
            };
            
            if (node.content && Array.isArray(node.content)) {
                for (const child of node.content) {
                    if (typeof child === 'object' && child.tag === 'product_catalog') {
                        catalog.hasMore = child.attrs?.has_more === 'true';
                        catalog.cursor = child.attrs?.cursor || null;
                        
                        if (child.content && Array.isArray(child.content)) {
                            for (const productChild of child.content) {
                                if (typeof productChild === 'object' && productChild.tag === 'product') {
                                    const product = this.parseProductFromCatalog(productChild);
                                    if (product) {
                                        catalog.products.push(product);
                                    }
                                }
                            }
                        }
                        break;
                    }
                }
            }
            
            return catalog;
            
        } catch (error) {
            this.socket.options.logger.error('Error parsing catalog:', error);
            return { products: [], hasMore: false, cursor: null };
        }
    }
    
    parseProduct(node) {
        try {
            if (node.content && Array.isArray(node.content)) {
                for (const child of node.content) {
                    if (typeof child === 'object' && child.tag === 'product') {
                        return this.parseProductFromCatalog(child);
                    }
                }
            }
            
            return null;
            
        } catch (error) {
            this.socket.options.logger.error('Error parsing product:', error);
            return null;
        }
    }
    
    parseProductFromCatalog(node) {
        try {
            const attrs = node.attrs || {};
            const product = {
                id: attrs.product_id || attrs.id || '',
                businessOwnerJid: attrs.business_owner_jid || '',
                catalogId: attrs.catalog_id || '',
                title: attrs.title || '',
                description: attrs.description || '',
                currencyCode: attrs.currency_code || 'USD',
                priceAmount1000: parseInt(attrs.price_amount_1000) || 0,
                retailerId: attrs.retailer_id || '',
                url: attrs.url || '',
                salePriceAmount1000: parseInt(attrs.sale_price_amount_1000) || 0,
                images: [],
                availability: attrs.availability || 'in_stock',
                condition: attrs.condition || 'new',
                category: attrs.category || ''
            };
            
            // Parse product images
            if (node.content && Array.isArray(node.content)) {
                for (const child of node.content) {
                    if (typeof child === 'object' && child.tag === 'media') {
                        if (child.content && Array.isArray(child.content)) {
                            for (const mediaChild of child.content) {
                                if (typeof mediaChild === 'object' && mediaChild.tag === 'image') {
                                    product.images.push({
                                        id: mediaChild.attrs?.id || '',
                                        url: mediaChild.attrs?.url || '',
                                        type: mediaChild.attrs?.type || 'image'
                                    });
                                }
                            }
                        }
                    }
                }
            }
            
            return product;
            
        } catch (error) {
            this.socket.options.logger.error('Error parsing product from catalog:', error);
            return null;
        }
    }
    
    parseCollections(node) {
        try {
            const collections = [];
            
            if (node.content && Array.isArray(node.content)) {
                for (const child of node.content) {
                    if (typeof child === 'object' && child.tag === 'collections') {
                        if (child.content && Array.isArray(child.content)) {
                            for (const collectionChild of child.content) {
                                if (typeof collectionChild === 'object' && collectionChild.tag === 'collection') {
                                    const collection = {
                                        id: collectionChild.attrs?.id || '',
                                        name: collectionChild.attrs?.name || '',
                                        productCount: parseInt(collectionChild.attrs?.product_count) || 0,
                                        coverImage: collectionChild.attrs?.cover_image || null
                                    };
                                    collections.push(collection);
                                }
                            }
                        }
                        break;
                    }
                }
            }
            
            return collections;
            
        } catch (error) {
            this.socket.options.logger.error('Error parsing collections:', error);
            return [];
        }
    }
    
    generateId() {
        return crypto.randomBytes(8).toString('hex').toUpperCase();
    }
    
    generateOrderId() {
        return `ORDER_${Date.now()}_${crypto.randomBytes(4).toString('hex').toUpperCase()}`;
    }
    
    formatPrice(priceAmount1000, currencyCode = 'USD') {
        const price = priceAmount1000 / 1000;
        return new Intl.NumberFormat('en-US', {
            style: 'currency',
            currency: currencyCode
        }).format(price);
    }
    
    getCachedBusinessProfile(jid) {
        return this.businessCache.get(jid);
    }
    
    getCachedCatalog(jid) {
        return this.catalogCache.get(jid);
    }
    
    getCachedProduct(jid, productId) {
        return this.productCache.get(`${jid}_${productId}`);
    }
    
    getCachedOrder(orderId) {
        return this.orderCache.get(orderId);
    }
    
    getAllOrders() {
        return Array.from(this.orderCache.values());
    }
    
    getOrdersByStatus(status) {
        return Array.from(this.orderCache.values())
            .filter(order => order.status === status);
    }
    
    clearCache() {
        this.businessCache.clear();
        this.catalogCache.clear();
        this.productCache.clear();
        this.orderCache.clear();
        this.collectionCache.clear();
    }
    
    getBusinessStats() {
        const stats = {
            totalBusinessProfiles: this.businessCache.size,
            totalCatalogs: this.catalogCache.size,
            totalProducts: this.productCache.size,
            totalOrders: this.orderCache.size,
            ordersByStatus: {}
        };
        
        // Count orders by status
        for (const order of this.orderCache.values()) {
            if (!stats.ordersByStatus[order.status]) {
                stats.ordersByStatus[order.status] = 0;
            }
            stats.ordersByStatus[order.status]++;
        }
        
        return stats;
    }
}

module.exports = WABusinessHandler;
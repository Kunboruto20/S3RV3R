const EventEmitter = require('events');
const { Buffer } = require('buffer');

/**
 * WhatsApp Business API Handler
 * Manages business accounts, catalogs, and business-specific features
 */
class WABusiness extends EventEmitter {
    constructor(socket, options = {}) {
        super();
        
        this.socket = socket;
        this.options = {
            enableCatalog: options.enableCatalog !== false,
            enableBusinessProfile: options.enableBusinessProfile !== false,
            enableLabels: options.enableLabels !== false,
            maxCatalogItems: options.maxCatalogItems || 1000,
            ...options
        };

        // Business data
        this.businessProfile = null;
        this.catalog = new Map();
        this.collections = new Map();
        this.labels = new Map();
        this.businessHours = null;
        this.awayMessage = null;
    }

    // Initialize business features
    async initialize() {
        try {
            await this.loadBusinessProfile();
            await this.loadCatalog();
            await this.loadLabels();
            await this.loadBusinessHours();
            
            this.emit('business:initialized');
            return true;
        } catch (error) {
            this.emit('business:error', error);
            throw error;
        }
    }

    // Business Profile Management
    async getBusinessProfile() {
        try {
            const query = {
                tag: 'iq',
                attrs: {
                    id: this.socket.generateMessageTag(),
                    type: 'get',
                    xmlns: 'w:biz',
                    to: 's.whatsapp.net'
                },
                content: [{
                    tag: 'business_profile',
                    attrs: {},
                    content: null
                }]
            };

            const result = await this.socket.query(query);
            this.businessProfile = this.parseBusinessProfile(result);
            
            this.emit('business:profile:updated', this.businessProfile);
            return this.businessProfile;
        } catch (error) {
            this.emit('business:error', error);
            throw error;
        }
    }

    async updateBusinessProfile(profileData) {
        try {
            const query = {
                tag: 'iq',
                attrs: {
                    id: this.socket.generateMessageTag(),
                    type: 'set',
                    xmlns: 'w:biz',
                    to: 's.whatsapp.net'
                },
                content: [{
                    tag: 'business_profile',
                    attrs: {},
                    content: this.serializeBusinessProfile(profileData)
                }]
            };

            const result = await this.socket.query(query);
            this.businessProfile = { ...this.businessProfile, ...profileData };
            
            this.emit('business:profile:updated', this.businessProfile);
            return result;
        } catch (error) {
            this.emit('business:error', error);
            throw error;
        }
    }

    // Catalog Management
    async getCatalog(limit = 50, cursor = null) {
        try {
            const query = {
                tag: 'iq',
                attrs: {
                    id: this.socket.generateMessageTag(),
                    type: 'get',
                    xmlns: 'w:biz:catalog',
                    to: 's.whatsapp.net'
                },
                content: [{
                    tag: 'product_catalog',
                    attrs: {
                        limit: limit.toString(),
                        ...(cursor && { cursor })
                    },
                    content: null
                }]
            };

            const result = await this.socket.query(query);
            const products = this.parseCatalogProducts(result);
            
            // Store products in catalog
            products.forEach(product => {
                this.catalog.set(product.id, product);
            });

            this.emit('business:catalog:updated', products);
            return products;
        } catch (error) {
            this.emit('business:error', error);
            throw error;
        }
    }

    async addProduct(productData) {
        try {
            const product = {
                id: productData.id || this.generateProductId(),
                name: productData.name,
                description: productData.description,
                price: productData.price,
                currency: productData.currency || 'USD',
                images: productData.images || [],
                availability: productData.availability || 'in_stock',
                category: productData.category,
                url: productData.url,
                retailer_id: productData.retailer_id,
                ...productData
            };

            const query = {
                tag: 'iq',
                attrs: {
                    id: this.socket.generateMessageTag(),
                    type: 'set',
                    xmlns: 'w:biz:catalog',
                    to: 's.whatsapp.net'
                },
                content: [{
                    tag: 'product',
                    attrs: { action: 'add' },
                    content: this.serializeProduct(product)
                }]
            };

            const result = await this.socket.query(query);
            this.catalog.set(product.id, product);
            
            this.emit('business:product:added', product);
            return product;
        } catch (error) {
            this.emit('business:error', error);
            throw error;
        }
    }

    async updateProduct(productId, updates) {
        try {
            const existingProduct = this.catalog.get(productId);
            if (!existingProduct) {
                throw new Error(`Product ${productId} not found`);
            }

            const updatedProduct = { ...existingProduct, ...updates };

            const query = {
                tag: 'iq',
                attrs: {
                    id: this.socket.generateMessageTag(),
                    type: 'set',
                    xmlns: 'w:biz:catalog',
                    to: 's.whatsapp.net'
                },
                content: [{
                    tag: 'product',
                    attrs: { 
                        action: 'update',
                        id: productId
                    },
                    content: this.serializeProduct(updatedProduct)
                }]
            };

            const result = await this.socket.query(query);
            this.catalog.set(productId, updatedProduct);
            
            this.emit('business:product:updated', updatedProduct);
            return updatedProduct;
        } catch (error) {
            this.emit('business:error', error);
            throw error;
        }
    }

    async deleteProduct(productId) {
        try {
            const query = {
                tag: 'iq',
                attrs: {
                    id: this.socket.generateMessageTag(),
                    type: 'set',
                    xmlns: 'w:biz:catalog',
                    to: 's.whatsapp.net'
                },
                content: [{
                    tag: 'product',
                    attrs: { 
                        action: 'delete',
                        id: productId
                    },
                    content: null
                }]
            };

            const result = await this.socket.query(query);
            this.catalog.delete(productId);
            
            this.emit('business:product:deleted', productId);
            return result;
        } catch (error) {
            this.emit('business:error', error);
            throw error;
        }
    }

    // Collections Management
    async createCollection(collectionData) {
        try {
            const collection = {
                id: collectionData.id || this.generateCollectionId(),
                name: collectionData.name,
                products: collectionData.products || [],
                ...collectionData
            };

            const query = {
                tag: 'iq',
                attrs: {
                    id: this.socket.generateMessageTag(),
                    type: 'set',
                    xmlns: 'w:biz:catalog',
                    to: 's.whatsapp.net'
                },
                content: [{
                    tag: 'collection',
                    attrs: { action: 'add' },
                    content: this.serializeCollection(collection)
                }]
            };

            const result = await this.socket.query(query);
            this.collections.set(collection.id, collection);
            
            this.emit('business:collection:created', collection);
            return collection;
        } catch (error) {
            this.emit('business:error', error);
            throw error;
        }
    }

    // Labels Management
    async getLabels() {
        try {
            const query = {
                tag: 'iq',
                attrs: {
                    id: this.socket.generateMessageTag(),
                    type: 'get',
                    xmlns: 'w:biz:label',
                    to: 's.whatsapp.net'
                },
                content: [{
                    tag: 'labels',
                    attrs: {},
                    content: null
                }]
            };

            const result = await this.socket.query(query);
            const labels = this.parseLabels(result);
            
            labels.forEach(label => {
                this.labels.set(label.id, label);
            });

            this.emit('business:labels:updated', labels);
            return labels;
        } catch (error) {
            this.emit('business:error', error);
            throw error;
        }
    }

    async createLabel(labelData) {
        try {
            const label = {
                id: labelData.id || this.generateLabelId(),
                name: labelData.name,
                color: labelData.color || '#FF6B35',
                ...labelData
            };

            const query = {
                tag: 'iq',
                attrs: {
                    id: this.socket.generateMessageTag(),
                    type: 'set',
                    xmlns: 'w:biz:label',
                    to: 's.whatsapp.net'
                },
                content: [{
                    tag: 'label',
                    attrs: { action: 'add' },
                    content: this.serializeLabel(label)
                }]
            };

            const result = await this.socket.query(query);
            this.labels.set(label.id, label);
            
            this.emit('business:label:created', label);
            return label;
        } catch (error) {
            this.emit('business:error', error);
            throw error;
        }
    }

    // Business Hours Management
    async setBusinessHours(businessHours) {
        try {
            const query = {
                tag: 'iq',
                attrs: {
                    id: this.socket.generateMessageTag(),
                    type: 'set',
                    xmlns: 'w:biz',
                    to: 's.whatsapp.net'
                },
                content: [{
                    tag: 'business_hours',
                    attrs: {},
                    content: this.serializeBusinessHours(businessHours)
                }]
            };

            const result = await this.socket.query(query);
            this.businessHours = businessHours;
            
            this.emit('business:hours:updated', businessHours);
            return result;
        } catch (error) {
            this.emit('business:error', error);
            throw error;
        }
    }

    // Away Message Management
    async setAwayMessage(message) {
        try {
            const query = {
                tag: 'iq',
                attrs: {
                    id: this.socket.generateMessageTag(),
                    type: 'set',
                    xmlns: 'w:biz',
                    to: 's.whatsapp.net'
                },
                content: [{
                    tag: 'away_message',
                    attrs: {},
                    content: [{ tag: 'text', attrs: {}, content: message }]
                }]
            };

            const result = await this.socket.query(query);
            this.awayMessage = message;
            
            this.emit('business:away_message:updated', message);
            return result;
        } catch (error) {
            this.emit('business:error', error);
            throw error;
        }
    }

    // Helper methods
    parseBusinessProfile(result) {
        // Parse business profile from WhatsApp response
        return {
            id: result.attrs?.id,
            name: result.content?.find(c => c.tag === 'name')?.content,
            description: result.content?.find(c => c.tag === 'description')?.content,
            category: result.content?.find(c => c.tag === 'category')?.content,
            email: result.content?.find(c => c.tag === 'email')?.content,
            website: result.content?.find(c => c.tag === 'website')?.content,
            address: result.content?.find(c => c.tag === 'address')?.content
        };
    }

    serializeBusinessProfile(profile) {
        return Object.entries(profile).map(([key, value]) => ({
            tag: key,
            attrs: {},
            content: value
        }));
    }

    parseCatalogProducts(result) {
        const products = [];
        const productNodes = result.content?.filter(c => c.tag === 'product') || [];
        
        productNodes.forEach(node => {
            products.push(this.parseProduct(node));
        });

        return products;
    }

    parseProduct(node) {
        return {
            id: node.attrs?.id,
            name: node.content?.find(c => c.tag === 'name')?.content,
            description: node.content?.find(c => c.tag === 'description')?.content,
            price: parseFloat(node.content?.find(c => c.tag === 'price')?.content || '0'),
            currency: node.content?.find(c => c.tag === 'currency')?.content,
            images: node.content?.filter(c => c.tag === 'image').map(i => i.content) || [],
            availability: node.content?.find(c => c.tag === 'availability')?.content
        };
    }

    serializeProduct(product) {
        return Object.entries(product).map(([key, value]) => {
            if (key === 'images' && Array.isArray(value)) {
                return value.map(img => ({ tag: 'image', attrs: {}, content: img }));
            }
            return { tag: key, attrs: {}, content: value.toString() };
        }).flat();
    }

    generateProductId() {
        return `product_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    }

    generateCollectionId() {
        return `collection_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    }

    generateLabelId() {
        return `label_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    }

    // Load methods
    async loadBusinessProfile() {
        try {
            await this.getBusinessProfile();
        } catch (error) {
            console.warn('Failed to load business profile:', error.message);
        }
    }

    async loadCatalog() {
        try {
            await this.getCatalog();
        } catch (error) {
            console.warn('Failed to load catalog:', error.message);
        }
    }

    async loadLabels() {
        try {
            await this.getLabels();
        } catch (error) {
            console.warn('Failed to load labels:', error.message);
        }
    }

    async loadBusinessHours() {
        // Implementation for loading business hours
    }

    serializeCollection(collection) {
        return [
            { tag: 'name', attrs: {}, content: collection.name },
            ...collection.products.map(productId => ({
                tag: 'product_ref',
                attrs: { id: productId },
                content: null
            }))
        ];
    }

    parseLabels(result) {
        const labels = [];
        const labelNodes = result.content?.filter(c => c.tag === 'label') || [];
        
        labelNodes.forEach(node => {
            labels.push({
                id: node.attrs?.id,
                name: node.content?.find(c => c.tag === 'name')?.content,
                color: node.content?.find(c => c.tag === 'color')?.content
            });
        });

        return labels;
    }

    serializeLabel(label) {
        return [
            { tag: 'name', attrs: {}, content: label.name },
            { tag: 'color', attrs: {}, content: label.color }
        ];
    }

    serializeBusinessHours(hours) {
        return Object.entries(hours).map(([day, schedule]) => ({
            tag: 'day',
            attrs: { name: day },
            content: [
                { tag: 'open', attrs: {}, content: schedule.open },
                { tag: 'close', attrs: {}, content: schedule.close }
            ]
        }));
    }
}

module.exports = WABusiness;
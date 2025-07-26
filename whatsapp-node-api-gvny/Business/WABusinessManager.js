const EventEmitter = require('events');

/**
 * WhatsApp Business Manager
 * Handles all WhatsApp Business features including catalogs, products, orders, and business profiles
 */
class WABusinessManager extends EventEmitter {
    constructor(socket, options = {}) {
        super();
        
        this.socket = socket;
        this.options = {
            enableCatalog: options.enableCatalog !== false,
            enableOrders: options.enableOrders !== false,
            enablePayments: options.enablePayments !== false,
            maxProductsPerCatalog: options.maxProductsPerCatalog || 1000,
            defaultCurrency: options.defaultCurrency || 'USD',
            ...options
        };

        // Business data stores
        this.businessProfile = null;
        this.catalogs = new Map();
        this.products = new Map();
        this.collections = new Map();
        this.orders = new Map();
        this.customers = new Map();
        
        // Business settings
        this.businessSettings = {
            isVerified: false,
            category: null,
            description: null,
            email: null,
            website: null,
            address: null,
            businessHours: null,
            awayMessage: null,
            greetingMessage: null
        };

        this.initialize();
    }

    async initialize() {
        try {
            await this.loadBusinessProfile();
            await this.loadCatalogs();
            this.emit('ready');
        } catch (error) {
            this.emit('error', error);
        }
    }

    // Business Profile Management
    async createBusinessProfile(profileData) {
        try {
            const profile = {
                id: this.socket.user?.id,
                name: profileData.name,
                category: profileData.category,
                description: profileData.description,
                email: profileData.email,
                website: profileData.website,
                address: profileData.address,
                profilePictureUrl: profileData.profilePictureUrl,
                coverPhotoUrl: profileData.coverPhotoUrl,
                businessHours: profileData.businessHours || [],
                isVerified: false,
                verificationStatus: 'pending',
                createdAt: new Date().toISOString(),
                updatedAt: new Date().toISOString()
            };

            // Send business profile creation request
            const response = await this.socket.query({
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
                    content: this.encodeBusinessProfile(profile)
                }]
            });

            if (response.attrs.type === 'result') {
                this.businessProfile = profile;
                this.emit('business.profile.created', profile);
                return profile;
            } else {
                throw new Error('Failed to create business profile');
            }
        } catch (error) {
            throw new Error(`Business profile creation failed: ${error.message}`);
        }
    }

    async updateBusinessProfile(updates) {
        try {
            if (!this.businessProfile) {
                throw new Error('No business profile exists');
            }

            const updatedProfile = {
                ...this.businessProfile,
                ...updates,
                updatedAt: new Date().toISOString()
            };

            // Send update request
            const response = await this.socket.query({
                tag: 'iq',
                attrs: {
                    id: this.socket.generateMessageTag(),
                    type: 'set',
                    xmlns: 'w:biz',
                    to: 's.whatsapp.net'
                },
                content: [{
                    tag: 'business_profile',
                    attrs: { action: 'update' },
                    content: this.encodeBusinessProfile(updatedProfile)
                }]
            });

            if (response.attrs.type === 'result') {
                this.businessProfile = updatedProfile;
                this.emit('business.profile.updated', updatedProfile);
                return updatedProfile;
            } else {
                throw new Error('Failed to update business profile');
            }
        } catch (error) {
            throw new Error(`Business profile update failed: ${error.message}`);
        }
    }

    async loadBusinessProfile() {
        try {
            const response = await this.socket.query({
                tag: 'iq',
                attrs: {
                    id: this.socket.generateMessageTag(),
                    type: 'get',
                    xmlns: 'w:biz',
                    to: 's.whatsapp.net'
                },
                content: [{
                    tag: 'business_profile',
                    attrs: {}
                }]
            });

            if (response.content?.[0]) {
                this.businessProfile = this.decodeBusinessProfile(response.content[0]);
                this.emit('business.profile.loaded', this.businessProfile);
            }
        } catch (error) {
            console.error('Failed to load business profile:', error);
        }
    }

    // Catalog Management
    async createCatalog(catalogData) {
        try {
            const catalog = {
                id: this.generateCatalogId(),
                name: catalogData.name,
                description: catalogData.description,
                isActive: catalogData.isActive !== false,
                products: [],
                collections: [],
                createdAt: new Date().toISOString(),
                updatedAt: new Date().toISOString()
            };

            // Send catalog creation request
            const response = await this.socket.query({
                tag: 'iq',
                attrs: {
                    id: this.socket.generateMessageTag(),
                    type: 'set',
                    xmlns: 'w:biz:catalog'
                },
                content: [{
                    tag: 'catalog',
                    attrs: { action: 'create' },
                    content: this.encodeCatalog(catalog)
                }]
            });

            if (response.attrs.type === 'result') {
                this.catalogs.set(catalog.id, catalog);
                this.emit('catalog.created', catalog);
                return catalog;
            } else {
                throw new Error('Failed to create catalog');
            }
        } catch (error) {
            throw new Error(`Catalog creation failed: ${error.message}`);
        }
    }

    async updateCatalog(catalogId, updates) {
        try {
            const catalog = this.catalogs.get(catalogId);
            if (!catalog) {
                throw new Error('Catalog not found');
            }

            const updatedCatalog = {
                ...catalog,
                ...updates,
                updatedAt: new Date().toISOString()
            };

            // Send update request
            const response = await this.socket.query({
                tag: 'iq',
                attrs: {
                    id: this.socket.generateMessageTag(),
                    type: 'set',
                    xmlns: 'w:biz:catalog'
                },
                content: [{
                    tag: 'catalog',
                    attrs: { action: 'update', id: catalogId },
                    content: this.encodeCatalog(updatedCatalog)
                }]
            });

            if (response.attrs.type === 'result') {
                this.catalogs.set(catalogId, updatedCatalog);
                this.emit('catalog.updated', updatedCatalog);
                return updatedCatalog;
            } else {
                throw new Error('Failed to update catalog');
            }
        } catch (error) {
            throw new Error(`Catalog update failed: ${error.message}`);
        }
    }

    async deleteCatalog(catalogId) {
        try {
            const response = await this.socket.query({
                tag: 'iq',
                attrs: {
                    id: this.socket.generateMessageTag(),
                    type: 'set',
                    xmlns: 'w:biz:catalog'
                },
                content: [{
                    tag: 'catalog',
                    attrs: { action: 'delete', id: catalogId }
                }]
            });

            if (response.attrs.type === 'result') {
                const catalog = this.catalogs.get(catalogId);
                this.catalogs.delete(catalogId);
                this.emit('catalog.deleted', { id: catalogId, catalog });
                return true;
            } else {
                throw new Error('Failed to delete catalog');
            }
        } catch (error) {
            throw new Error(`Catalog deletion failed: ${error.message}`);
        }
    }

    async loadCatalogs() {
        try {
            const response = await this.socket.query({
                tag: 'iq',
                attrs: {
                    id: this.socket.generateMessageTag(),
                    type: 'get',
                    xmlns: 'w:biz:catalog'
                },
                content: [{
                    tag: 'catalogs',
                    attrs: {}
                }]
            });

            if (response.content) {
                for (const catalogNode of response.content) {
                    if (catalogNode.tag === 'catalog') {
                        const catalog = this.decodeCatalog(catalogNode);
                        this.catalogs.set(catalog.id, catalog);
                    }
                }
                this.emit('catalogs.loaded', Array.from(this.catalogs.values()));
            }
        } catch (error) {
            console.error('Failed to load catalogs:', error);
        }
    }

    // Product Management
    async createProduct(productData) {
        try {
            const product = {
                id: this.generateProductId(),
                catalogId: productData.catalogId,
                name: productData.name,
                description: productData.description,
                price: productData.price,
                currency: productData.currency || this.options.defaultCurrency,
                images: productData.images || [],
                category: productData.category,
                sku: productData.sku,
                stockQuantity: productData.stockQuantity,
                isActive: productData.isActive !== false,
                tags: productData.tags || [],
                variants: productData.variants || [],
                createdAt: new Date().toISOString(),
                updatedAt: new Date().toISOString()
            };

            // Validate catalog exists
            const catalog = this.catalogs.get(product.catalogId);
            if (!catalog) {
                throw new Error('Catalog not found');
            }

            // Check product limit
            if (catalog.products.length >= this.options.maxProductsPerCatalog) {
                throw new Error('Maximum products per catalog exceeded');
            }

            // Send product creation request
            const response = await this.socket.query({
                tag: 'iq',
                attrs: {
                    id: this.socket.generateMessageTag(),
                    type: 'set',
                    xmlns: 'w:biz:product'
                },
                content: [{
                    tag: 'product',
                    attrs: { action: 'create' },
                    content: this.encodeProduct(product)
                }]
            });

            if (response.attrs.type === 'result') {
                this.products.set(product.id, product);
                catalog.products.push(product.id);
                this.emit('product.created', product);
                return product;
            } else {
                throw new Error('Failed to create product');
            }
        } catch (error) {
            throw new Error(`Product creation failed: ${error.message}`);
        }
    }

    async updateProduct(productId, updates) {
        try {
            const product = this.products.get(productId);
            if (!product) {
                throw new Error('Product not found');
            }

            const updatedProduct = {
                ...product,
                ...updates,
                updatedAt: new Date().toISOString()
            };

            // Send update request
            const response = await this.socket.query({
                tag: 'iq',
                attrs: {
                    id: this.socket.generateMessageTag(),
                    type: 'set',
                    xmlns: 'w:biz:product'
                },
                content: [{
                    tag: 'product',
                    attrs: { action: 'update', id: productId },
                    content: this.encodeProduct(updatedProduct)
                }]
            });

            if (response.attrs.type === 'result') {
                this.products.set(productId, updatedProduct);
                this.emit('product.updated', updatedProduct);
                return updatedProduct;
            } else {
                throw new Error('Failed to update product');
            }
        } catch (error) {
            throw new Error(`Product update failed: ${error.message}`);
        }
    }

    async deleteProduct(productId) {
        try {
            const product = this.products.get(productId);
            if (!product) {
                throw new Error('Product not found');
            }

            const response = await this.socket.query({
                tag: 'iq',
                attrs: {
                    id: this.socket.generateMessageTag(),
                    type: 'set',
                    xmlns: 'w:biz:product'
                },
                content: [{
                    tag: 'product',
                    attrs: { action: 'delete', id: productId }
                }]
            });

            if (response.attrs.type === 'result') {
                // Remove from catalog
                const catalog = this.catalogs.get(product.catalogId);
                if (catalog) {
                    const index = catalog.products.indexOf(productId);
                    if (index > -1) {
                        catalog.products.splice(index, 1);
                    }
                }

                this.products.delete(productId);
                this.emit('product.deleted', { id: productId, product });
                return true;
            } else {
                throw new Error('Failed to delete product');
            }
        } catch (error) {
            throw new Error(`Product deletion failed: ${error.message}`);
        }
    }

    // Order Management
    async createOrder(orderData) {
        try {
            const order = {
                id: this.generateOrderId(),
                customerId: orderData.customerId,
                items: orderData.items,
                subtotal: this.calculateSubtotal(orderData.items),
                tax: orderData.tax || 0,
                shipping: orderData.shipping || 0,
                total: 0,
                currency: orderData.currency || this.options.defaultCurrency,
                status: 'pending',
                paymentStatus: 'pending',
                shippingAddress: orderData.shippingAddress,
                billingAddress: orderData.billingAddress,
                notes: orderData.notes,
                createdAt: new Date().toISOString(),
                updatedAt: new Date().toISOString()
            };

            // Calculate total
            order.total = order.subtotal + order.tax + order.shipping;

            // Validate products exist
            for (const item of order.items) {
                if (!this.products.has(item.productId)) {
                    throw new Error(`Product not found: ${item.productId}`);
                }
            }

            this.orders.set(order.id, order);
            this.emit('order.created', order);
            return order;
        } catch (error) {
            throw new Error(`Order creation failed: ${error.message}`);
        }
    }

    async updateOrderStatus(orderId, status, paymentStatus = null) {
        try {
            const order = this.orders.get(orderId);
            if (!order) {
                throw new Error('Order not found');
            }

            const updates = {
                status,
                updatedAt: new Date().toISOString()
            };

            if (paymentStatus) {
                updates.paymentStatus = paymentStatus;
            }

            const updatedOrder = { ...order, ...updates };
            this.orders.set(orderId, updatedOrder);
            
            this.emit('order.updated', updatedOrder);
            this.emit(`order.status.${status}`, updatedOrder);
            
            return updatedOrder;
        } catch (error) {
            throw new Error(`Order status update failed: ${error.message}`);
        }
    }

    // Message Templates for Business
    async sendProductMessage(jid, productId, options = {}) {
        try {
            const product = this.products.get(productId);
            if (!product) {
                throw new Error('Product not found');
            }

            const catalog = this.catalogs.get(product.catalogId);
            if (!catalog) {
                throw new Error('Catalog not found');
            }

            const message = {
                productMessage: {
                    product: {
                        productId: product.id,
                        title: product.name,
                        description: product.description,
                        currencyCode: product.currency,
                        priceAmount1000: Math.round(product.price * 1000),
                        retailerId: product.sku,
                        url: options.url,
                        productImageCount: product.images.length,
                        firstImageId: product.images[0]?.id
                    },
                    businessOwnerJid: this.socket.user.id,
                    catalog: {
                        catalogJid: this.socket.user.id,
                        title: catalog.name,
                        description: catalog.description
                    },
                    contextInfo: options.contextInfo
                }
            };

            return await this.socket.sendMessage(jid, message, options);
        } catch (error) {
            throw new Error(`Product message failed: ${error.message}`);
        }
    }

    async sendCatalogMessage(jid, catalogId, options = {}) {
        try {
            const catalog = this.catalogs.get(catalogId);
            if (!catalog) {
                throw new Error('Catalog not found');
            }

            const message = {
                listMessage: {
                    title: options.title || 'Our Catalog',
                    description: options.description || catalog.description,
                    buttonText: options.buttonText || 'View Products',
                    listType: 'PRODUCT_LIST',
                    sections: [{
                        title: catalog.name,
                        rows: catalog.products.slice(0, 10).map(productId => {
                            const product = this.products.get(productId);
                            return {
                                title: product.name,
                                description: product.description,
                                rowId: `product_${product.id}`
                            };
                        })
                    }],
                    contextInfo: options.contextInfo
                }
            };

            return await this.socket.sendMessage(jid, message, options);
        } catch (error) {
            throw new Error(`Catalog message failed: ${error.message}`);
        }
    }

    // Utility Methods
    calculateSubtotal(items) {
        return items.reduce((total, item) => {
            const product = this.products.get(item.productId);
            if (product) {
                return total + (product.price * item.quantity);
            }
            return total;
        }, 0);
    }

    generateCatalogId() {
        return `catalog_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    }

    generateProductId() {
        return `product_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    }

    generateOrderId() {
        return `order_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    }

    // Encoding/Decoding Methods
    encodeBusinessProfile(profile) {
        return [
            { tag: 'name', attrs: {}, content: profile.name },
            { tag: 'category', attrs: {}, content: profile.category },
            { tag: 'description', attrs: {}, content: profile.description },
            { tag: 'email', attrs: {}, content: profile.email },
            { tag: 'website', attrs: {}, content: profile.website },
            { tag: 'address', attrs: {}, content: JSON.stringify(profile.address) }
        ];
    }

    decodeBusinessProfile(node) {
        const profile = {};
        if (node.content) {
            for (const child of node.content) {
                if (child.tag && child.content) {
                    profile[child.tag] = child.content;
                }
            }
        }
        return profile;
    }

    encodeCatalog(catalog) {
        return [
            { tag: 'id', attrs: {}, content: catalog.id },
            { tag: 'name', attrs: {}, content: catalog.name },
            { tag: 'description', attrs: {}, content: catalog.description },
            { tag: 'is_active', attrs: {}, content: catalog.isActive.toString() }
        ];
    }

    decodeCatalog(node) {
        const catalog = { products: [], collections: [] };
        if (node.content) {
            for (const child of node.content) {
                if (child.tag && child.content) {
                    if (child.tag === 'is_active') {
                        catalog[child.tag] = child.content === 'true';
                    } else {
                        catalog[child.tag] = child.content;
                    }
                }
            }
        }
        return catalog;
    }

    encodeProduct(product) {
        return [
            { tag: 'id', attrs: {}, content: product.id },
            { tag: 'catalog_id', attrs: {}, content: product.catalogId },
            { tag: 'name', attrs: {}, content: product.name },
            { tag: 'description', attrs: {}, content: product.description },
            { tag: 'price', attrs: {}, content: product.price.toString() },
            { tag: 'currency', attrs: {}, content: product.currency },
            { tag: 'category', attrs: {}, content: product.category },
            { tag: 'sku', attrs: {}, content: product.sku },
            { tag: 'stock_quantity', attrs: {}, content: product.stockQuantity?.toString() },
            { tag: 'is_active', attrs: {}, content: product.isActive.toString() }
        ];
    }

    // Getters
    getBusinessProfile() {
        return this.businessProfile;
    }

    getCatalogs() {
        return Array.from(this.catalogs.values());
    }

    getCatalog(catalogId) {
        return this.catalogs.get(catalogId);
    }

    getProducts(catalogId = null) {
        if (catalogId) {
            const catalog = this.catalogs.get(catalogId);
            if (catalog) {
                return catalog.products.map(id => this.products.get(id)).filter(p => p);
            }
            return [];
        }
        return Array.from(this.products.values());
    }

    getProduct(productId) {
        return this.products.get(productId);
    }

    getOrders() {
        return Array.from(this.orders.values());
    }

    getOrder(orderId) {
        return this.orders.get(orderId);
    }

    // Statistics
    getBusinessStats() {
        return {
            catalogs: this.catalogs.size,
            products: this.products.size,
            orders: this.orders.size,
            customers: this.customers.size,
            totalRevenue: Array.from(this.orders.values())
                .filter(order => order.paymentStatus === 'completed')
                .reduce((total, order) => total + order.total, 0)
        };
    }
}

module.exports = WABusinessManager;
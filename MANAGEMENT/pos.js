/**
 * POS Page - Authentication & Route Guard
 * Step 1: Auth handling only
 * Full POS functionality in Steps 3-4
 */

// Cart state
let cart = [];
let products = [];
let paymentMethod = 'CASH';
let productRefreshInterval = null; // For auto-refresh

const CURRENCY_CODE = 'KES';
const currencyFormatter = new Intl.NumberFormat('en-KE', {
    style: 'currency',
    currency: CURRENCY_CODE,
    minimumFractionDigits: 2,
    maximumFractionDigits: 2
});

function formatMoney(value) {
    return currencyFormatter.format(Number(value || 0));
}

const UNIT_OPTIONS = {
    FULL: { label: 'Full', factor: 1 },
    HALF: { label: 'Half', factor: 0.5 },
    THREE_QUARTER: { label: 'Three Quarter', factor: 0.75 },
    QUARTER: { label: 'Quarter', factor: 0.25 },
    PIECE: { label: 'Piece', factor: 1 }
};

// Initialize page
document.addEventListener('DOMContentLoaded', async () => {
    try {
        // Check page access (redirects if not authorized)
        checkPageAccess();

        // Ensure we have user data
        await ensureAuth();

        // Load initial data
        await initializePage();

        // Start auto-refresh for products (every 30 seconds)
        startProductAutoRefresh();

    } catch (error) {
        console.error('POS initialization error:', error);
        // If auth error, redirect to login
        if (error.message.includes('Not authenticated') || error.message.includes('Session expired')) {
            window.location.href = '/login.html';
        }
    }
});

/**
 * Start automatic product refresh
 */
function startProductAutoRefresh() {
    // Refresh products every 30 seconds
    productRefreshInterval = setInterval(async () => {
        try {
            await loadProducts();
        } catch (error) {
            console.error('Auto-refresh failed:', error);
        }
    }, 30000); // 30 seconds
}

/**
 * Stop automatic product refresh
 */
function stopProductAutoRefresh() {
    if (productRefreshInterval) {
        clearInterval(productRefreshInterval);
        productRefreshInterval = null;
    }
}

/**
 * Manually refresh products (called by refresh button)
 */
async function refreshProducts() {
    showLoading(true);
    try {
        await loadProducts();
        showToast('success', 'Refreshed', 'Products have been updated');
    } catch (error) {
        console.error('Failed to refresh products:', error);
        showToast('error', 'Error', 'Failed to refresh products');
    } finally {
        showLoading(false);
    }
}

/**
 * Initialize page with user info and products
 */

async function initializePage() {
    const user = UserSession.getUser();
    
    // Update UI with user info
    document.getElementById('cashierName').textContent = `${user.firstName} ${user.lastName}`;
    
    const locationId = UserSession.getLocationId();
    document.getElementById('cashierLocation').textContent = locationId ? `Location: ${locationId}` : 'No location assigned';

    // Load products for this location
    await loadProducts();

    // Load current sales for this location
    await loadCurrentSales();

    // Set up search
    setupSearch();

    // Set up keyboard shortcuts
    setupKeyboardShortcuts();
}

/**
 * Load products from backend
 */
async function loadProducts() {
    const locationId = UserSession.getLocationId();
    
    // If no location assigned, try to use default location or load all products
    if (!locationId) {
        showToast('warning', 'No Location', 'Your account is not assigned to a location. Please contact administrator.');
    }

    showLoading(true);

    try {
        // API returns products for the specific location
        if (locationId) {
            products = await apiJson(`/products/location/${locationId}`);
        } else {
            // Fallback: load all products if no location assigned
            products = await apiJson('/products');
        }
        
        console.log('Products loaded:', products);
        console.log('Number of products:', products.length);
        
        renderProducts(products);
    } catch (error) {
        console.error('Failed to load products:', error);
        showToast('error', 'Error', 'Failed to load products: ' + error.message);
    } finally {
        showLoading(false);
    }
}

/**
 * Render products grid
 */
function renderProducts(productsToRender) {
    const grid = document.getElementById('productsGrid');
    const count = document.getElementById('productCount');
    
    count.textContent = `${productsToRender.length} items`;
    
    if (productsToRender.length === 0) {
        grid.innerHTML = `
            <div style="grid-column: 1/-1; text-align: center; padding: 40px; color: #a0aec0;">
                <i class="fas fa-box-open" style="font-size: 48px; margin-bottom: 16px;"></i>
                <p>No products found</p>
            </div>
        `;
        return;
    }

    console.log('Rendering products:', productsToRender);

    grid.innerHTML = productsToRender.map(p => {
        // Handle both 'id' and 'product_id' (from API)
        const productId = p.id || p.product_id;
        console.log('Product ID:', productId, 'Name:', p.name);
        
        return `
        <div class="pos-product-card" onclick="addToCart('${productId}')">
            <div class="pos-product-name">${p.name}</div>
            <div class="pos-product-sku">${p.sku || ''}</div>
            <div class="pos-product-price">${formatMoney(parseFloat(p.unitPrice || 0))}</div>
            <div class="pos-product-stock ${Number(p.stockQuantity ?? 0) <= 5 ? 'low' : ''}">
                ${Number(p.stockQuantity ?? 0)} in stock
            </div>
        </div>
    `}).join('');
}

/**
 * Set up product search
 */
function setupSearch() {
    const searchInput = document.getElementById('productSearch');
    
    searchInput.addEventListener('input', (e) => {
        const query = e.target.value.toLowerCase().trim();
        
        if (!query) {
            renderProducts(products);
            return;
        }

        const filtered = products.filter(p => 
            p.name.toLowerCase().includes(query) ||
            (p.sku && p.sku.toLowerCase().includes(query)) ||
            (p.barcode && p.barcode.toLowerCase().includes(query))
        );
        
        renderProducts(filtered);
    });

    // Focus search on F1 key
    document.addEventListener('keydown', (e) => {
        if (e.key === 'F1') {
            e.preventDefault();
            searchInput.focus();
        }
    });
}

/**
 * Set up keyboard shortcuts
 */
function setupKeyboardShortcuts() {
    // F1: Focus search
    // F2: New sale (clear cart)
    // ESC: Close modals
    document.addEventListener('keydown', (e) => {
        if (e.key === 'F2') {
            e.preventDefault();
            clearCart();
        }
    });
}

/**
 * Add product to cart
 */
function getAvailableUnits(product) {
    const baseUnitType = (product.baseUnitType || 'PIECE').toUpperCase();
    if (baseUnitType === 'PIECE') {
        return ['PIECE'];
    }
    return ['FULL', 'THREE_QUARTER', 'HALF', 'QUARTER'];
}

function resolveUnitPrice(product, saleUnit) {
    if (saleUnit === 'HALF') {
        return parseFloat(product.priceHalfUnit ?? (parseFloat(product.pricePerBaseUnit ?? product.unitPrice ?? 0) * 0.5));
    }
    if (saleUnit === 'THREE_QUARTER') {
        return parseFloat(product.priceThreeQuarterUnit ?? (parseFloat(product.pricePerBaseUnit ?? product.unitPrice ?? 0) * 0.75));
    }
    if (saleUnit === 'QUARTER') {
        return parseFloat(product.priceQuarterUnit ?? (parseFloat(product.pricePerBaseUnit ?? product.unitPrice ?? 0) * 0.25));
    }
    return parseFloat(product.pricePerBaseUnit ?? product.unitPrice ?? 0);
}

function getDisplayUnitName(product, saleUnit) {
    const normalizedType = String(product.baseUnitType || 'PIECE').toUpperCase();
    const fallbackBaseName = normalizedType === 'WEIGHT'
        ? 'kg'
        : normalizedType === 'VOLUME'
            ? 'litre'
            : 'piece';

    const baseName = product.baseUnitName || fallbackBaseName;

    if (saleUnit === 'HALF') return `1/2 ${baseName}`;
    if (saleUnit === 'THREE_QUARTER') return `3/4 ${baseName}`;
    if (saleUnit === 'QUARTER') return `1/4 ${baseName}`;
    if (saleUnit === 'FULL') return `1 ${baseName}`;
    return baseName;
}

function addToCart(productId) {
    console.log('Adding to cart, productId:', productId, 'Type:', typeof productId);
    console.log('Current cart:', cart);
    
    // Convert productId to string for consistent comparison
    const productIdStr = String(productId);
    
    // Find product - handle both 'id' and 'product_id' (from API), and both string and number IDs
    const product = products.find(p => {
        const pid = String(p.id || p.product_id);
        return pid === productIdStr || p.id === productId || p.product_id === productId;
    });
    
    if (!product) {
        console.error('Product not found:', productId);
        showToast('error', 'Error', 'Product not found');
        return;
    }

    console.log('Found product:', product);

    // Use the correct ID from the product object
    const finalProductId = String(product.id || product.product_id);
    
    // Use stockQuantity if available, otherwise fall back to stock
    const availableStock = Number(product.stockQuantity ?? 0);

    // Find existing item - use string comparison for consistency
    const defaultUnit = getAvailableUnits(product)[0];
    const unitFactor = UNIT_OPTIONS[defaultUnit].factor;
    const existingItem = cart.find(item => String(item.productId) === finalProductId && item.saleUnit === defaultUnit);
    
    console.log('Existing item:', existingItem);
    
    if (existingItem) {
        // Check stock limit in base units
        const currentBaseQty = existingItem.quantity * existingItem.baseQtyFactor;
        const maxQty = availableStock || 0;
        
        if ((currentBaseQty + unitFactor) > maxQty + 1e-9) {
            showToast('warning', 'Stock Limit', `Only ${maxQty} base units available`);
            return;
        }
        
        existingItem.quantity++;
        console.log('Incremented quantity, new qty:', existingItem.quantity);
    } else {
        // Check if out of stock
        if ((availableStock || 0) <= 0) {
            showToast('warning', 'Out of Stock', `${product.name} is out of stock`);
            return;
        }

        if (unitFactor > (availableStock || 0) + 1e-9) {
            showToast('warning', 'Stock Limit', `Not enough stock for selected unit`);
            return;
        }
        
        const normalizedBaseUnitType = String(product.baseUnitType || 'PIECE').toUpperCase();
        const normalizedBaseUnitName = product.baseUnitName || (
            normalizedBaseUnitType === 'WEIGHT'
                ? 'kg'
                : normalizedBaseUnitType === 'VOLUME'
                    ? 'litre'
                    : 'piece'
        );

        cart.push({
            productId: finalProductId,
            name: product.name,
            price: resolveUnitPrice(product, defaultUnit),
            quantity: 1,
            saleUnit: defaultUnit,
            baseQtyFactor: unitFactor,
            baseUnitName: normalizedBaseUnitName,
            baseUnitType: normalizedBaseUnitType,
            maxStock: availableStock || 0
        });
        console.log('Added new item to cart');
    }

    console.log('Cart after add:', cart);
    renderCart();
    updateTotals();
    showToast('success', 'Added', `${product.name} added to cart`);
}

/**
 * Update item quantity
 */
function updateQuantity(productId, change, saleUnit = null) {
    const productIdStr = String(productId);
    const item = cart.find(i => String(i.productId) === productIdStr && (saleUnit ? i.saleUnit === saleUnit : true));
    if (!item) return;

    item.quantity += change;

    // Validate quantity
    if (item.quantity <= 0) {
        const isFractionalBaseType = ['WEIGHT', 'VOLUME'].includes(String(item.baseUnitType || '').toUpperCase());
        if (isFractionalBaseType) {
            // For weighted/volume items, step down to minimum sellable quantity instead of removing
            // Example for FULL (baseQtyFactor=1): 1 -> 0.75 -> 0.5 -> 0.25
            // Example for HALF (baseQtyFactor=0.5): 1 -> 0.5
            const minSellableQty = Math.max(0.25 / (item.baseQtyFactor || 1), 0.25);
            item.quantity = Math.round(minSellableQty * 1000) / 1000;
        } else {
            cart = cart.filter(i => !(String(i.productId) === productIdStr && i.saleUnit === item.saleUnit));
        }
    } else {
        const totalBaseQty = item.quantity * item.baseQtyFactor;
        if (totalBaseQty > item.maxStock + 1e-9) {
            item.quantity = Math.floor((item.maxStock / item.baseQtyFactor) * 1000) / 1000;
            showToast('warning', 'Stock Limit', `Only ${item.maxStock} base units available`);
        }
    }

    renderCart();
    updateTotals();
}

/**
 * Remove item from cart
 */
function removeFromCart(productId, saleUnit = null) {
    const productIdStr = String(productId);
    cart = cart.filter(i => !(String(i.productId) === productIdStr && (saleUnit ? i.saleUnit === saleUnit : true)));
    renderCart();
    updateTotals();
}

/**
 * Clear entire cart
 */
function clearCart() {
    if (cart.length === 0) return;
    
    if (confirm('Clear all items from cart?')) {
        cart = [];
        renderCart();
        updateTotals();
        showToast('info', 'Cart Cleared', 'Cart has been cleared');
    }
}

/**
 * Render cart items
 */
function renderCart() {
    const container = document.getElementById('cartItems');
    const checkoutBtn = document.getElementById('checkoutBtn');
    
    if (cart.length === 0) {
        container.innerHTML = `
            <div class="pos-cart-empty">
                <i class="fas fa-shopping-cart"></i>
                <p>No items in cart</p>
                <p>Search and click products to add</p>
            </div>
        `;
        checkoutBtn.disabled = true;
        updateTotals();
        return;
    }

    container.innerHTML = cart.map(item => `
        <div class="pos-cart-item">
            <div class="pos-cart-item-info">
                <div class="pos-cart-item-name">${item.name}</div>
                <div class="pos-cart-item-price">${formatMoney(item.price)} per ${getDisplayUnitName(item, item.saleUnit)}</div>
            </div>
            <div class="pos-cart-item-qty">
                <button class="pos-cart-qty-btn" onclick="updateQuantity('${item.productId}', -1, '${item.saleUnit}')">
                    <i class="fas fa-minus"></i>
                </button>
                <span class="pos-cart-qty">${item.quantity}</span>
                <button class="pos-cart-qty-btn" onclick="updateQuantity('${item.productId}', 1, '${item.saleUnit}')">
                    <i class="fas fa-plus"></i>
                </button>
            </div>
            <button class="pos-cart-item-remove" onclick="removeFromCart('${item.productId}', '${item.saleUnit}')">
                <i class="fas fa-times"></i>
            </button>
        </div>
    `).join('');

    checkoutBtn.disabled = cart.length === 0;
    updateTotals();
}

/**
 * Update cart totals
 */
function updateTotals() {
    const subtotal = cart.reduce((sum, item) => sum + (item.price * item.quantity), 0);
    const discountPercent = parseFloat(document.getElementById('discountPercent').value) || 0;
    const discount = subtotal * (discountPercent / 100);
    const total = subtotal - discount;
    const tax = 0; // No tax for now

    document.getElementById('cartSubtotal').textContent = formatMoney(subtotal);
    document.getElementById('cartTax').textContent = formatMoney(tax);
    document.getElementById('cartTotal').textContent = formatMoney(total);
    
    // Recalculate change if cash payment is selected
    if (paymentMethod === 'CASH') {
        const amountTendered = parseFloat(document.getElementById('amountTendered').value) || 0;
        const finalTotal = subtotal - discount;
        const change = amountTendered - finalTotal;
        
        const changeElement = document.getElementById('cartChange');
        changeElement.textContent = formatMoney(change);
        
        // Color indication
        if (change < 0) {
            changeElement.style.color = '#f56565';
        } else {
            changeElement.style.color = '#48bb78';
        }
        
        // Update checkout button state - only disable if change is negative AND amount tendered > 0
        const checkoutBtn = document.getElementById('checkoutBtn');
        // Enable checkout if cart has items and either:
        // 1. Amount tendered covers the total, OR
        // 2. Cart is empty (handled elsewhere)
        checkoutBtn.disabled = cart.length === 0 || (change < 0 && amountTendered > 0);
    } else {
        // For non-cash payments, just check if cart has items
        const checkoutBtn = document.getElementById('checkoutBtn');
        checkoutBtn.disabled = cart.length === 0;
    }
}

/**
 * Select payment method
 */
function selectPayment(method) {
    paymentMethod = method;
    document.querySelectorAll('.pos-payment-btn').forEach(btn => {
        btn.classList.toggle('active', btn.dataset.method === method);
    });
    
    // Show/hide amount tendered for CASH payments
    const amountTenderedRow = document.getElementById('amountTenderedRow');
    const changeRow = document.getElementById('changeRow');
    
    if (method === 'CASH') {
        amountTenderedRow.style.display = 'flex';
        changeRow.style.display = 'flex';
        // Auto-fill with current total
        const subtotal = cart.reduce((sum, item) => sum + (item.price * item.quantity), 0);
        const discountPercent = parseFloat(document.getElementById('discountPercent').value) || 0;
        const finalTotal = subtotal - (subtotal * (discountPercent / 100));
        document.getElementById('amountTendered').value = finalTotal.toFixed(2);
        calculateChange();
    } else {
        amountTenderedRow.style.display = 'none';
        changeRow.style.display = 'none';
    }
}

/**
 * Calculate change based on amount tendered
 */
function calculateChange() {
    const subtotal = cart.reduce((sum, item) => sum + (item.price * item.quantity), 0);
    const discountPercent = parseFloat(document.getElementById('discountPercent').value) || 0;
    const total = subtotal - (subtotal * (discountPercent / 100));
    const amountTendered = parseFloat(document.getElementById('amountTendered').value) || 0;
    const change = amountTendered - total;
    
    const changeElement = document.getElementById('cartChange');
    changeElement.textContent = formatMoney(change);
    
    // Color indication
    if (change < 0) {
        changeElement.style.color = '#f56565'; // Red if insufficient
    } else {
        changeElement.style.color = '#48bb78'; // Green if sufficient
    }
    
    // Enable/disable checkout button based on amount tendered
    const checkoutBtn = document.getElementById('checkoutBtn');
    if (paymentMethod === 'CASH') {
        // Only disable if change is negative AND user has entered an amount
        checkoutBtn.disabled = cart.length === 0 || (change < 0 && amountTendered > 0);
    } else {
        checkoutBtn.disabled = cart.length === 0;
    }
}

/**
 * Process checkout - Create sale in backend
 */
async function processCheckout() {
    if (cart.length === 0) {
        showToast('warning', 'Empty Cart', 'Add items to cart first');
        return;
    }

    const locationId = UserSession.getLocationId();
    if (!locationId) {
        showToast('error', 'Error', 'No location assigned. Contact administrator.');
        return;
    }

    // Get discount percentage
    const discountPercent = parseFloat(document.getElementById('discountPercent').value) || 0;

    // Map payment method to API values
    const paymentMethodMap = {
        'CASH': 'CASH',
        'MPESA': 'MOBILE_MONEY',
        'CARD': 'CARD'
    };
    const apiPaymentMethod = paymentMethodMap[paymentMethod];

    // Build items array for API
    const items = cart.map(item => ({
        productId: item.productId,
        quantity: item.quantity,
        saleUnit: item.saleUnit || 'PIECE',
        baseQtyFactor: item.baseQtyFactor || 1
    }));

    // Show loading
    showLoading(true);

    try {
        const response = await apiJson('/sales', {
            method: 'POST',
            body: JSON.stringify({
                items: items,
                paymentMethod: apiPaymentMethod,
                discountPercent: discountPercent
            })
        });

        // Success!
        showToast('success', 'Sale Complete', `Receipt: ${response.receiptNumber || 'N/A'}`);

        // Clear cart after successful sale
        cart = [];
        renderCart();

        // Reset discount
        document.getElementById('discountPercent').value = 0;
        updateTotals();

        // Refresh the current sales list
        await loadCurrentSales();

// Show receipt preview modal
        if (response.id) {
            // Load full sale details for receipt preview
            const fullSale = await apiJson(`/sales/${response.id}`);
            showReceiptModal(fullSale);
        }

        // Immediately refresh products after sale to show reduced stock in POS
        await refreshProducts();

    } catch (error) {
        console.error('Checkout error:', error);
        showToast('error', 'Checkout Failed', error.message || 'Failed to process sale');
    } finally {
        showLoading(false);
    }
}

/**
 * Show loading overlay
 */
function showLoading(show) {
    document.getElementById('loadingOverlay').classList.toggle('show', show);
}

/**
 * Show toast notification
 */
function showToast(type, title, message) {
    const toast = document.getElementById('toast');
    toast.className = `pos-toast ${type} show`;
    toast.innerHTML = `<strong>${title}</strong><br>${message}`;
    
    setTimeout(() => {
        toast.classList.remove('show');
    }, 3000);
}

// Make functions globally available
window.addToCart = addToCart;
window.updateQuantity = updateQuantity;
window.removeFromCart = removeFromCart;
window.clearCart = clearCart;
window.renderCart = renderCart;
window.updateTotals = updateTotals;
window.selectPayment = selectPayment;
window.calculateChange = calculateChange;
window.processCheckout = processCheckout;
window.showToast = showToast;
window.showLoading = showLoading;
window.refreshProducts = refreshProducts;
window.loadCurrentSales = loadCurrentSales;
window.printReceipt = printReceipt;
window.closeReceiptModal = closeReceiptModal;

// Global variables for receipt
let currentSaleReceipt = null;
let currentSales = [];

/**
 * Load current sales for the location
 */
async function loadCurrentSales() {
    const locationId = UserSession.getLocationId();
    if (!locationId) return;

    const panel = document.getElementById('currentSalesPanel');
    const list = document.getElementById('currentSalesList');
    
    panel.style.display = 'block';
    list.innerHTML = '<div class="pos-sale-empty"><i class="fas fa-spinner fa-spin"></i> Loading...</div>';

    try {
        currentSales = await apiJson(`/sales/location/${locationId}?limit=10`);
        
        if (!currentSales || currentSales.length === 0) {
            list.innerHTML = '<div class="pos-sale-empty">No sales today</div>';
            return;
        }

        list.innerHTML = currentSales.map(sale => {
            const date = new Date(sale.createdAt);
            const time = date.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' });
            return `
                <div class="pos-sale-item" onclick="viewSaleReceipt('${sale.id}')">
                    <div class="pos-sale-info">
                        <div class="pos-sale-receipt">${sale.receiptNumber || sale.id.substring(0,8)}</div>
                        <div class="pos-sale-time">${time}</div>
                    </div>
                    <div class="pos-sale-total">${formatMoney(Number(sale.totalAmount))}</div>
                </div>
            `;
        }).join('');
    } catch (error) {
        console.error('Failed to load current sales:', error);
        list.innerHTML = '<div class="pos-sale-empty">Failed to load sales</div>';
    }
}

/**
 * View sale receipt (loads full sale details)
 */
async function viewSaleReceipt(saleId) {
    try {
        const sale = await apiJson(`/sales/${saleId}`);
        showReceiptModal(sale);
    } catch (error) {
        console.error('Failed to load sale:', error);
        showToast('error', 'Error', 'Failed to load sale details');
    }
}

/**
 * Show receipt preview modal
 */
function showReceiptModal(sale) {
    currentSaleReceipt = sale;
    
    // Set header info
    const storeNameEl = document.getElementById('receiptStoreName');
    if (storeNameEl) {
        const branchName = String(sale?.location?.name || UserSession.getUser()?.assignedLocation?.name || 'INSHAR MAIN');
        storeNameEl.textContent = branchName;
    }

    document.getElementById('receiptNumber').textContent = `Receipt: ${sale.receiptNumber || 'N/A'}`;
    document.getElementById('receiptDate').textContent = `Date: ${new Date(sale.createdAt).toLocaleString()}`;
    
    // Build items HTML
    const itemsHtml = sale.items.map(item => `
        <div class="receipt-preview-item">
            <span class="receipt-preview-item-name">${item.product?.name || 'Product'} x${item.quantity} (${item.saleUnit || 'PIECE'})</span>
            <span class="receipt-preview-item-price">${formatMoney(Number(item.totalAmount))}</span>
        </div>
    `).join('');
    document.getElementById('receiptItems').innerHTML = itemsHtml;
    
    // Build totals HTML
    let totalsHtml = `
        <div class="receipt-preview-row">
            <span>Subtotal:</span>
            <span>${formatMoney(Number(sale.subtotal))}</span>
        </div>
    `;
    
    if (Number(sale.taxAmount) > 0) {
        totalsHtml += `
            <div class="receipt-preview-row">
                <span>Tax:</span>
                <span>${formatMoney(Number(sale.taxAmount))}</span>
            </div>
        `;
    }
    
    if (Number(sale.discountAmount) > 0) {
        totalsHtml += `
            <div class="receipt-preview-row">
                <span>Discount:</span>
                <span>-${formatMoney(Number(sale.discountAmount))}</span>
            </div>
        `;
    }
    
    totalsHtml += `
        <div class="receipt-preview-row grand-total">
            <span>TOTAL:</span>
            <span>${formatMoney(Number(sale.totalAmount))}</span>
        </div>
        <div class="receipt-preview-row">
            <span>Payment:</span>
            <span>${sale.paymentMethod}</span>
        </div>
    `;
    document.getElementById('receiptTotals').innerHTML = totalsHtml;
    
    // Show modal
    document.getElementById('receiptModal').classList.add('show');
}

/**
 * Print receipt
 */
function printReceipt() {
    if (!currentSaleReceipt) {
        showToast('error', 'Error', 'No receipt data available');
        return;
    }
    
    const token = Auth.getToken();
    console.log('Printing receipt, token:', token ? 'exists' : 'missing');
    console.log('Sale ID:', currentSaleReceipt.id);
    
    if (!token) {
        showToast('error', 'Error', 'Authentication required. Please log in again.');
        return;
    }
    
    // Open print window with token
    const printWindow = window.open(`${API_BASE}/api/v1/sales/${currentSaleReceipt.id}/receipt?token=${token}`, '_blank');
    
    if (!printWindow) {
        showToast('error', 'Error', 'Popup blocked. Please allow popups for this site.');
    } else {
        closeReceiptModal();
    }
}

/**
 * Close receipt modal
 */
function closeReceiptModal() {
    document.getElementById('receiptModal').classList.remove('show');
    currentSaleReceipt = null;
}

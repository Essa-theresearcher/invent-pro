// Inventory Management System - Frontend Application (Real API Integration)

// Global data stores (loaded from API)
let products = [];
let users = [];
let categories = []; // Will be loaded from API
let locations = [];
let suppliers = [];
let stockRequests = [];
let requestableProducts = [];
let masterProducts = [];
let selectedLocationId = localStorage.getItem('selectedLocationId') || '';
let selectedLocationName = localStorage.getItem('selectedLocationName') || 'All Stores';
let currentUser = null;
const SUPPLIERS_STORAGE_KEY = 'ims_suppliers_v1';
const CURRENCY_CODE = 'KES';
const CURRENCY_SYMBOL = 'KSh';
const currencyFormatter = new Intl.NumberFormat('en-KE', {
    style: 'currency',
    currency: CURRENCY_CODE,
    minimumFractionDigits: 2,
    maximumFractionDigits: 2
});

function formatMoney(value) {
    return currencyFormatter.format(Number(value || 0));
}

// DOM Elements
const menuToggle = document.getElementById('menuToggle');
const sidebar = document.getElementById('sidebar');
const navItems = document.querySelectorAll('.nav-item');
const contentSections = document.querySelectorAll('.content-section');
const modal = document.getElementById('modal');
const modalClose = document.getElementById('modalClose');
const modalTitle = document.getElementById('modalTitle');
const modalBody = document.getElementById('modalBody');
const toastContainer = document.getElementById('toastContainer');

// productRefreshInterval for auto-refresh products/stock (20s)
let productRefreshInterval = null;

function startAutoRefresh() {
    // prevent duplicate intervals
    stopAutoRefresh();

    productRefreshInterval = setInterval(async () => {
        try {
            await loadProducts();
            if (document.querySelector('#dashboard.active, #inventory.active')) {
                loadDashboard();
                loadInventory();
            }
            console.log('Auto-refreshed stock data');
        } catch (error) {
            console.error('Auto-refresh failed:', error);
        }
    }, 20000); // 20 seconds
}

function stopAutoRefresh() {
    if (productRefreshInterval) {
        clearInterval(productRefreshInterval);
        productRefreshInterval = null;
    }
}

// Role-based menu configuration
const MENU_PERMISSIONS = {
    OWNER: ['dashboard', 'categories', 'inventory', 'suppliers', 'users', 'locations', 'stock-requests', 'reports', 'settings'],
    MANAGER: ['dashboard', 'categories', 'inventory', 'suppliers', 'locations', 'stock-requests', 'reports', 'settings'],
    CASHIER: []
};

// Initialize Application
document.addEventListener('DOMContentLoaded', () => {
    // Server handles redirect to login - this is fallback
    if (!Auth.isLoggedIn()) {
        window.location.href = '/login.html';
        return;
    }
    initializeApp();
});

async function initializeApp() {
    // Check page access first
    if (!checkPageAccess()) {
        return;
    }

    try {
        currentUser = await fetchCurrentUser();
    } catch (error) {
        console.error('Failed to fetch current user:', error);
    }

    // Enforce manager location scope at startup
    if (currentUser?.role === 'MANAGER') {
        const managerLocationId = currentUser.assigned_location_id || currentUser.assignedLocationId || '';
        if (managerLocationId && selectedLocationId !== managerLocationId) {
            selectedLocationId = managerLocationId;
            selectedLocationName = currentUser.assignedLocationName || selectedLocationName || 'My Branch';
            localStorage.setItem('selectedLocationId', selectedLocationId);
            localStorage.setItem('selectedLocationName', selectedLocationName);
        }
    }


    // Apply role-based menu visibility
    applyRoleBasedMenu();

    // Setup event listeners and load data
    setupEventListeners();

    // Load data from API
    try {
        await Promise.all([
            loadLocations(),
            loadProducts(),
            loadUsers(),
            loadCategories(),
            loadStockRequests()
        ]);
        setupStoreSelector();
        loadDashboard();
        loadInventory();
        loadSuppliers();
        initializeCharts();
        bindReportButtons();
        startAutoRefresh();
    } catch (error) {
        console.error('Error loading data:', error);
        showToast('error', 'Error', 'Failed to load data from server');
    }
}

/**
 * Apply role-based menu visibility
 */
function applyRoleBasedMenu() {
    const userRole = UserSession.getRole();
    const allowedMenus = MENU_PERMISSIONS[userRole] || [];

    // If user is CASHIER, redirect to POS page
    if (userRole === 'CASHIER') {
        window.location.href = '/pos.html';
        return;
    }

    // Hide menu items based on role
    document.querySelectorAll('.sidebar-nav .nav-item[data-section]').forEach(menuItem => {
        const section = menuItem.dataset.section;
        if (!allowedMenus.includes(section)) {
            menuItem.style.display = 'none';
        }
    });

    // Manager cannot approve/reject stock requests; owner can.
    if (userRole === 'MANAGER') {
        const panel = document.getElementById('managerRequestStockPanel');
        if (panel) panel.style.display = '';
    } else {
        const panel = document.getElementById('managerRequestStockPanel');
        if (panel) panel.style.display = 'none';
    }

    // Update user profile in header
    const user = UserSession.getUser();
    if (user) {
        const userProfile = document.querySelector('.user-profile');
        if (userProfile) {
            const fullName = `${user.firstName || user.email.split('@')[0]} ${user.lastName || ''}`.trim();
            userProfile.innerHTML = `
                <img src="https://ui-avatars.com/api/?name=${encodeURIComponent(fullName)}&background=667eea&color=fff" alt="User">
                <span>${fullName} (${user.role})</span>
                <i class="fas fa-chevron-down"></i>
            `;
        }
    }
}

function setupEventListeners() {
    menuToggle.addEventListener('click', () => {
        sidebar.classList.toggle('active');
    });

    navItems.forEach(item => {
        item.addEventListener('click', (e) => {
            e.preventDefault();
            const section = item.dataset.section;
            navigateToSection(section);
        });
    });

    modalClose.addEventListener('click', closeModal);
    modal.querySelector('.modal-overlay').addEventListener('click', closeModal);

    document.addEventListener('keydown', (e) => {
        if (e.key === 'Escape') closeModal();
    });

    // Logout button handler
    const logoutBtn = document.getElementById('logoutBtn');
    if (logoutBtn) {
        logoutBtn.addEventListener('click', (e) => {
            e.preventDefault();
            logout();
        });
    }
}

async function navigateToSection(sectionId) {
    navItems.forEach(item => {
        item.classList.toggle('active', item.dataset.section === sectionId);
    });

    contentSections.forEach(section => {
        section.classList.toggle('active', section.id === sectionId);
    });

    sidebar.classList.remove('active');

    // Refresh relevant data on tab switch
    if (['inventory', 'dashboard', 'locations', 'stock-requests', 'transfer-history'].includes(sectionId)) {
        try {
            await Promise.all([
                loadProducts(),
                loadStockRequests()
            ]);
            if (sectionId === 'dashboard') loadDashboard();
            if (sectionId === 'inventory') loadInventory();
            if (sectionId === 'locations') await loadLocations();
            if (sectionId === 'stock-requests') await loadStockRequests();
            if (sectionId === 'transfer-history') renderTransferHistory();
        } catch (error) {
            console.error('Tab refresh failed:', error);
        }
    }
}

// ==================== API FUNCTIONS ====================

async function loadProducts() {
    try {
        const role = currentUser?.role || UserSession.getRole();
        let endpoint = '/products';

        // Manager is always location-scoped
        if (role === 'MANAGER') {
            const managerLocationId = currentUser?.assigned_location_id || currentUser?.assignedLocationId || selectedLocationId || '';
            if (managerLocationId) {
                selectedLocationId = managerLocationId;
                localStorage.setItem('selectedLocationId', selectedLocationId);
                endpoint = `/products/location/${managerLocationId}`;
            }
        } else if (selectedLocationId) {
            // Owner: if a specific store is selected, show location-scoped inventory
            endpoint = `/products/location/${selectedLocationId}`;
        } else {
            // Owner + "All Stores": use global catalog endpoint so every active product is visible
            endpoint = '/products';
        }

        const data = await apiJson(endpoint);
        products = Array.isArray(data) ? data : [];

        // Ensure numeric stock fields are normalized for rendering consistency
        products = products.map((p) => ({
            ...p,
            stock: Number(p?.stock ?? 0),
            stockQuantity: p?.stockQuantity != null ? Number(p.stockQuantity) : undefined,
            minStock: Number(p?.minStock ?? 0),
        }));

        renderProducts();
        loadDashboard();
        loadInventory();
        return products;
    } catch (error) {
        console.error('Error loading products:', error);
        products = [];
        renderProducts();
        loadDashboard();
        loadInventory();
        return products;
    }
}

async function loadUsers() {
    try {
        const data = await apiJson('/users');
        const list = Array.isArray(data) ? data : [];
        users = selectedLocationId
            ? list.filter(u => u.assignedLocationId === selectedLocationId)
            : list;
        
        // Load locations for assignment feature
        try {
            const allLocs = await apiJson('/locations');
            window.allLocations = Array.isArray(allLocs) ? allLocs : [];
        } catch (e) {
            window.allLocations = [];
        }
        
        renderUsers();
        return users;
    } catch (error) {
        console.error('Error loading users:', error);
        users = [];
        window.allLocations = [];
        renderUsers();
        return users;
    }
}

async function loadStockRequests() {
    try {
        const statusFilter = document.getElementById('stockRequestStatusFilter');
        const status = statusFilter ? statusFilter.value : '';
        const endpoint = status ? `/sales/stock-requests?status=${encodeURIComponent(status)}` : '/sales/stock-requests';
        const data = await apiJson(endpoint);
        stockRequests = Array.isArray(data) ? data : [];
        await loadRequestableProducts();
        renderStockRequests();
        populateStockRequestProductOptions();
        return stockRequests;
    } catch (error) {
        console.error('Error loading stock requests:', error);
        stockRequests = [];
        await loadRequestableProducts();
        renderStockRequests();
        populateStockRequestProductOptions();
        return stockRequests;
    }
}

async function loadRequestableProducts() {
    try {
        const data = await apiJson('/products');
        requestableProducts = Array.isArray(data) ? data : [];
        masterProducts = requestableProducts;
    } catch (error) {
        console.error('Error loading requestable products:', error);
        requestableProducts = [];
        masterProducts = [];
    }
}

function populateStockRequestProductOptions() {
    const select = document.getElementById('requestProductId');
    if (!select) return;

    const source = (requestableProducts && requestableProducts.length) ? requestableProducts : products;
    const options = ['<option value="">Select product</option>']
        .concat((source || []).map(p => `<option value="${p.id}">${p.name} (${p.sku || 'N/A'})</option>`));

    select.innerHTML = options.join('');
}

async function submitManagerStockRequest(event) {
    event.preventDefault();

    const role = UserSession.getRole();
    if (role !== 'MANAGER') {
        showToast('error', 'Access Denied', 'Only branch manager can request stock.');
        return;
    }

    const productId = document.getElementById('requestProductId')?.value;
    const quantity = Number(document.getElementById('requestQuantity')?.value || 0);
    const note = (document.getElementById('requestNote')?.value || '').trim();

    if (!productId) {
        showToast('warning', 'Validation', 'Please select a product.');
        return;
    }

    if (!Number.isFinite(quantity) || quantity <= 0) {
        showToast('warning', 'Validation', 'Please enter a valid quantity above 0.');
        return;
    }

    try {
        await apiJson('/sales/stock-requests', {
            method: 'POST',
            body: JSON.stringify({
                productId,
                quantity,
                note: note || undefined
            })
        });

        showToast('success', 'Request Submitted', 'Stock request sent to main store for approval.');
        document.getElementById('requestQuantity').value = '';
        document.getElementById('requestNote').value = '';
        await loadStockRequests();
    } catch (error) {
        showToast('error', 'Request Failed', error.message || 'Unable to submit stock request');
    }
}

async function approveStockRequest(id) {
    try {
        await apiJson(`/sales/stock-requests/${id}/approve`, { method: 'PUT' });
        showToast('success', 'Approved', 'Stock request approved successfully.');
        await Promise.all([loadStockRequests(), loadProducts(), loadInventoryDataForStoreSwitch()]);
    } catch (error) {
        if (error?.message?.toLowerCase().includes('already') || error?.message?.toLowerCase().includes('not pending')) {
            showToast('warning', 'Already Processed', error.message);
        } else {
            showToast('error', 'Error', error.message || 'Failed to approve stock request');
        }
    }
}

async function rejectStockRequest(id) {
    const reason = prompt('Reason for rejection (optional):') || '';
    try {
        await apiJson(`/sales/stock-requests/${id}/reject`, {
            method: 'PUT',
            body: JSON.stringify({ reason })
        });
        showToast('success', 'Rejected', 'Stock request rejected.');
        await loadStockRequests();
    } catch (error) {
        showToast('error', 'Error', error.message || 'Failed to reject stock request');
    }
}

function renderStockRequests() {
    const tbody = document.querySelector('#stockRequestsTable tbody');
    if (!tbody) return;

    const role = UserSession.getRole();
    const isOwner = role === 'OWNER';

    if (!stockRequests.length) {
        tbody.innerHTML = `
            <tr>
                <td colspan="9" style="text-align:center; padding: 24px; color: #718096;">
                    No stock requests found
                </td>
            </tr>
        `;
        return;
    }

    const productMap = Object.fromEntries((products || []).map(p => [p.id, p.name]));
    const locationMap = Object.fromEntries((locations || []).map(l => [l.id, l.name]));
    const userMap = Object.fromEntries((users || []).map(u => [u.id, `${u.firstName || ''} ${u.lastName || ''}`.trim() || u.email || u.id]));

    tbody.innerHTML = stockRequests.map(req => {
        const statusClass = req.status === 'APPROVED' ? 'active' : req.status === 'REJECTED' ? 'out-of-stock' : 'low-stock';
        const canAct = isOwner && req.status === 'PENDING';
        return `
            <tr>
                <td>${req.createdAt ? new Date(req.createdAt).toLocaleString() : '-'}</td>
                <td>${productMap[req.productId] || req.productId}</td>
                <td>${locationMap[req.fromLocationId] || req.fromLocationId}</td>
                <td>${locationMap[req.toLocationId] || req.toLocationId}</td>
                <td>${Number(req.quantity).toLocaleString()}</td>
                <td><span class="status-badge ${statusClass}">${req.status}</span></td>
                <td>${userMap[req.requestedBy] || req.requestedBy}</td>
                <td>${req.note || '-'}</td>
                <td>
                    ${canAct ? `
                    <div class="action-btns">
                        <button class="action-btn success" title="Approve" onclick="approveStockRequest('${req.id}')">
                            <i class="fas fa-check"></i>
                        </button>
                        <button class="action-btn delete" title="Reject" onclick="rejectStockRequest('${req.id}')">
                            <i class="fas fa-times"></i>
                        </button>
                    </div>` : '<span style="color:#718096;">-</span>'}
                </td>
            </tr>
        `;
    }).join('');
}

async function loadInventoryDataForStoreSwitch() {
    await Promise.all([loadUsers(), loadCategories()]);
    loadDashboard();
    loadInventory();
}

async function loadLocations() {
    try {
        const data = await apiJson('/locations');
        locations = Array.isArray(data) ? data : [];

        // Recover from stale/invalid persisted selected location id
        if (selectedLocationId && !locations.some(l => l.id === selectedLocationId)) {
            selectedLocationId = '';
            selectedLocationName = 'All Stores';
            localStorage.removeItem('selectedLocationId');
            localStorage.setItem('selectedLocationName', selectedLocationName);
        }

        renderLocations();
        renderStoreSelectorOptions();
        syncActiveStoreBadge();
        return locations;
    } catch (error) {
        console.error('Error loading locations:', error);
        locations = [];
        renderLocations();
        return locations;
    }
}

async function createProduct(productData) {
    try {
        const result = await apiJson('/products', {
            method: 'POST',
            body: JSON.stringify(productData)
        });
        products.push(result);
        renderProducts();
        loadDashboard();
        loadInventory();
        return result;
    } catch (error) {
        throw error;
    }
}

async function updateProduct(id, productData) {
    try {
        const result = await apiJson(`/products/${id}`, {
            method: 'PUT',
            body: JSON.stringify(productData)
        });
        const index = products.findIndex(p => p.id === id);
        if (index !== -1) {
            products[index] = result;
        }
        renderProducts();
        loadDashboard();
        loadInventory();
        return result;
    } catch (error) {
        throw error;
    }
}

async function deleteProduct(id) {
    try {
        // Safe delete: deactivate instead of hard delete
        await apiJson(`/products/${id}/deactivate`, { method: 'PATCH' });
        products = products.filter(p => p.id !== id);
        renderProducts();
        loadDashboard();
        loadInventory();
    } catch (error) {
        throw error;
    }
}

async function createUser(userData) {
    try {
        const result = await apiJson('/users', {
            method: 'POST',
            body: JSON.stringify(userData)
        });
        users.push(result);
        renderUsers();
        return result;
    } catch (error) {
        throw error;
    }
}

async function updateUser(id, userData) {
    try {
        const result = await apiJson(`/users/${id}`, {
            method: 'PUT',
            body: JSON.stringify(userData)
        });
        const index = users.findIndex(u => u.id === id);
        if (index !== -1) {
            users[index] = result;
        }
        renderUsers();
        return result;
    } catch (error) {
        throw error;
    }
}

async function deleteUser(id) {
    try {
        await api(`/users/${id}`, { method: 'DELETE' });
        users = users.filter(u => u.id !== id);
        renderUsers();
    } catch (error) {
        throw error;
    }
}

async function toggleUserStatus(id) {
    const user = users.find(u => u.id === id);
    if (!user) return;
    
    try {
        const endpoint = user.isActive ? 'deactivate' : 'activate';
        await apiJson(`/users/${id}/${endpoint}`, { method: 'PUT' });
        user.isActive = !user.isActive;
        renderUsers();
    } catch (error) {
        throw error;
    }
}

// ==================== CATEGORIES API ====================

async function loadCategories() {
    try {
        const data = await apiJson('/categories');
        categories = data;
        renderCategories();
        return categories;
    } catch (error) {
        console.error('Error loading categories:', error);
        categories = [];
        // If API fails, use default categories
        categories = [
            { id: '1', name: 'Electronics' },
            { id: '2', name: 'Accessories' },
            { id: '3', name: 'Office' },
            { id: '4', name: 'Audio' },
            { id: '5', name: 'Storage' },
            { id: '6', name: 'Networking' }
        ];
        renderCategories();
        return categories;
    }
}

async function createCategory(categoryData) {
    try {
        const result = await apiJson('/categories', {
            method: 'POST',
            body: JSON.stringify(categoryData)
        });
        categories.push(result);
        renderCategories();
        return result;
    } catch (error) {
        throw error;
    }
}

async function deleteCategory(id) {
    try {
        await api(`/categories/${id}`, { method: 'DELETE' });
        categories = categories.filter(c => c.id !== id);
        renderCategories();
    } catch (error) {
        throw error;
    }
}

async function deleteCategoryById(id) {
    const category = categories.find(c => c.id === id);
    if (!category) return;

    if (!confirm(`Remove category "${category.name}"?`)) return;

    try {
        await deleteCategory(id);
        showToast('success', 'Category Removed', `${category.name} removed.`);
        await refreshCurrentProducts();
        await loadCategories();
    } catch (error) {
        showToast('error', 'Error', error.message || 'Failed to remove category');
    }
}

// ==================== RENDER FUNCTIONS ====================

async function loadDashboard() {
    const totalProductsEl = document.getElementById('totalProducts');
    const totalCategoriesEl = document.getElementById('totalCategories');
    const totalStockEl = document.getElementById('totalStock');
    const totalValueEl = document.getElementById('totalValue');
    const recentActivityEl = document.getElementById('recentActivity');
    const lowStockAlertsEl = document.getElementById('lowStockAlerts');
    const lowStockItemsCountEl = document.getElementById('lowStockItemsCount');
    const pendingStockRequestsEl = document.getElementById('pendingStockRequests');
    const recentTransfersReceivedEl = document.getElementById('recentTransfersReceived');
    const todaySalesEl = document.getElementById('todaySales');

    if (!totalStockEl) return;

    const safeProducts = Array.isArray(products) ? products : [];
    const safeCategories = Array.isArray(categories) ? categories : [];
    const safeRequests = Array.isArray(stockRequests) ? stockRequests : [];

    if (totalProductsEl) totalProductsEl.textContent = String(safeProducts.length);
    if (totalCategoriesEl) totalCategoriesEl.textContent = String(safeCategories.length);

    const getEffectiveStock = (p) => {
        const raw = p?.stockQuantity ?? p?.stock ?? 0;
        const parsed = Number(raw);
        return Number.isFinite(parsed) ? parsed : 0;
    };

    const totalStock = safeProducts.reduce((sum, p) => sum + getEffectiveStock(p), 0);
    totalStockEl.textContent = String(totalStock);

    const totalValue = safeProducts.reduce((sum, p) => {
        const unitPrice = Number(p?.unitPrice ?? p?.pricePerBaseUnit ?? 0);
        const safePrice = Number.isFinite(unitPrice) ? unitPrice : 0;
        return sum + (safePrice * getEffectiveStock(p));
    }, 0);

    if (totalValueEl) totalValueEl.textContent = formatMoney(totalValue);

    // Branch-level low stock (includes out-of-stock as "needs attention")
    const lowStockItemsCount = safeProducts.filter(p => {
        const stock = getEffectiveStock(p);
        const minStock = Number(p?.minStock ?? 10);
        return stock <= minStock;
    }).length;
    if (lowStockItemsCountEl) lowStockItemsCountEl.textContent = String(lowStockItemsCount);

    const role = currentUser?.role || UserSession.getRole();
    const managerLocationId = currentUser?.assigned_location_id || currentUser?.assignedLocationId || '';
    const activeLocationId = role === 'MANAGER' ? managerLocationId : (selectedLocationId || '');

    const now = Date.now();
    const sevenDaysAgo = now - (7 * 24 * 60 * 60 * 1000);

    const requestsForScope = safeRequests.filter(req => {
        if (!activeLocationId) return true;
        return req?.toLocationId === activeLocationId;
    });

    const pendingCount = requestsForScope.filter(req => req?.status === 'PENDING').length;
    if (pendingStockRequestsEl) pendingStockRequestsEl.textContent = String(pendingCount);

    const recentTransfersReceived = requestsForScope.filter(req => {
        if (req?.status !== 'APPROVED') return false;
        const createdAt = req?.createdAt ? new Date(req.createdAt).getTime() : 0;
        return Number.isFinite(createdAt) && createdAt >= sevenDaysAgo;
    }).reduce((sum, req) => sum + Number(req?.quantity || 0), 0);

    if (recentTransfersReceivedEl) {
        recentTransfersReceivedEl.textContent = String(recentTransfersReceived);
    }

    // Today's Sales (Branch only when store context is active)
    if (todaySalesEl) {
        try {
            let todaySalesAmount = 0;
            if (activeLocationId) {
                const sales = await apiJson(`/sales/location/${activeLocationId}?limit=200`);
                const list = Array.isArray(sales) ? sales : [];
                const startOfDay = new Date();
                startOfDay.setHours(0, 0, 0, 0);
                const startMs = startOfDay.getTime();

                todaySalesAmount = list
                    .filter(s => {
                        const ts = s?.createdAt ? new Date(s.createdAt).getTime() : 0;
                        return Number.isFinite(ts) && ts >= startMs;
                    })
                    .reduce((sum, s) => sum + Number(s?.totalAmount || 0), 0);
            }
            todaySalesEl.textContent = formatMoney(todaySalesAmount);
        } catch (e) {
            console.error('Failed to load today sales metric:', e);
            todaySalesEl.textContent = formatMoney(0);
        }
    }

    renderTransferHistory(requestsForScope);

    if (recentActivityEl) loadRecentActivity();
    if (lowStockAlertsEl) loadLowStockAlerts();
}

function loadRecentActivity() {
    const container = document.getElementById('recentActivity');
    // For now, show placeholder - could integrate with audit logs API
    container.innerHTML = `
        <div class="activity-item">
            <div class="activity-icon add">
                <i class="fas fa-plus"></i>
            </div>
            <div class="activity-info">
                <h4>System Ready</h4>
                <p>Dashboard loaded successfully</p>
            </div>
        </div>
    `;
}

function loadLowStockAlerts() {
    const container = document.getElementById('lowStockAlerts');
    const lowStockProducts = products.filter(p => p.status === 'low-stock' || p.status === 'out-of-stock').slice(0, 5);

    if (lowStockProducts.length === 0) {
        container.innerHTML = '<p style="color: #718096; padding: 10px;">No low stock items</p>';
        return;
    }

    container.innerHTML = lowStockProducts.map(p => `
        <div class="low-stock-item">
            <div class="low-stock-info">
                <div class="low-stock-img">
                    <i class="fas fa-box"></i>
                </div>
                <div class="low-stock-details">
                    <h4>${p.name}</h4>
                    <p>SKU: ${p.sku} • Stock: ${p.stock || 0}</p>
                </div>
            </div>
            <span class="stock-badge ${p.status === 'low-stock' ? 'low' : 'out'}">
                ${p.status === 'low-stock' ? 'Low Stock' : 'Out of Stock'}
            </span>
        </div>
    `).join('');
}

function renderProducts() {
    // Products tab removed; keep Add Product action alive in Inventory
    const addBtn = document.getElementById('addProductBtn');
    if (addBtn) {
        const isManager = UserSession.getRole() === 'MANAGER';
        if (isManager) {
            addBtn.onclick = () => {
                showToast('info', 'Use Request Stock', 'Branch managers do not create new SKUs. Use Stock Requests to add approved stock to branch inventory.');
                navigateToSection('stock-requests');
            };
        } else {
            addBtn.onclick = () => showProductModal();
        }
    }
}

function formatStatus(status) {
    const statusMap = {
        'in-stock': 'In Stock',
        'low-stock': 'Low Stock',
        'out-of-stock': 'Out of Stock',
        'active': 'Active',
        'inactive': 'Inactive'
    };
    return statusMap[status] || status;
}

function autoCalculateWeightFractions() {
    const typeEl = document.getElementById('productBaseUnitType');
    const basePriceEl = document.getElementById('productPricePerBaseUnit');
    const halfEl = document.getElementById('productHalfPrice');
    const quarterEl = document.getElementById('productQuarterPrice');
    const threeQuarterEl = document.getElementById('productThreeQuarterPrice');
    if (!typeEl || !basePriceEl || !halfEl || !quarterEl || !threeQuarterEl) return;

    const type = (typeEl.value || 'PIECE').toUpperCase();
    const base = parseFloat(basePriceEl.value);
    if (type !== 'WEIGHT' || Number.isNaN(base)) return;

    quarterEl.value = (base * 0.25).toFixed(2);
    halfEl.value = (base * 0.5).toFixed(2);
    threeQuarterEl.value = (base * 0.75).toFixed(2);
}

function toggleProductUnitFields() {
    const typeEl = document.getElementById('productBaseUnitType');
    const halfWrap = document.getElementById('productHalfPriceWrap');
    const quarterWrap = document.getElementById('productQuarterPriceWrap');
    const threeQuarterWrap = document.getElementById('productThreeQuarterPriceWrap');
    const baseNameEl = document.getElementById('productBaseUnitName');
    const halfEl = document.getElementById('productHalfPrice');
    const quarterEl = document.getElementById('productQuarterPrice');
    const threeQuarterEl = document.getElementById('productThreeQuarterPrice');

    if (!typeEl || !halfWrap || !quarterWrap || !threeQuarterWrap || !baseNameEl) return;

    const type = (typeEl.value || 'PIECE').toUpperCase();
    const isPiece = type === 'PIECE';

    halfWrap.style.display = isPiece ? 'none' : '';
    quarterWrap.style.display = isPiece ? 'none' : '';
    threeQuarterWrap.style.display = isPiece ? 'none' : '';

    if (isPiece) {
        baseNameEl.value = 'piece';
    } else if (!baseNameEl.value || baseNameEl.value === 'piece') {
        baseNameEl.value = type === 'WEIGHT' ? 'kg' : 'litre';
    }

    const strictAuto = type === 'WEIGHT';
    if (halfEl) halfEl.readOnly = strictAuto;
    if (quarterEl) quarterEl.readOnly = strictAuto;
    if (threeQuarterEl) threeQuarterEl.readOnly = strictAuto;

    if (strictAuto) autoCalculateWeightFractions();
}

function showProductModal(product = null) {
    modalTitle.textContent = product ? 'Edit Product' : 'Add Product';
    const isManager = UserSession.getRole() === 'MANAGER' && !product;

    const baseUnitType = (product?.baseUnitType || 'PIECE').toUpperCase();
    const baseUnitName = product?.baseUnitName || (baseUnitType === 'WEIGHT' ? 'kg' : baseUnitType === 'VOLUME' ? 'litre' : 'piece');
    
    modalBody.innerHTML = `
        <form id="productForm" class="friendly-form">
            <div class="form-section">
                <h3>Basic Details</h3>
                <p class="form-section-hint">Start with the core identity of your product.</p>
                ${isManager ? `
                <div class="form-group">
                    <label>Use Existing MAIN Product</label>
                    <select id="masterProductSelect" required>
                        <option value="">${(masterProducts || []).length ? 'Select existing product' : 'No products available from MAIN'}</option>
                        ${(masterProducts || []).map(mp => `<option value="${mp.id}">${mp.name} (${mp.sku || 'N/A'})</option>`).join('')}
                    </select>
                    <small id="masterProductHelpText" style="color:#718096;">
                        ${(masterProducts || []).length
                            ? 'Selecting an existing product auto-fills category, units, and prices from MAIN.'
                            : 'MAIN product list is empty/unavailable. Ensure products exist and reload the page.'}
                    </small>
                </div>
                ` : ''}
                <div class="form-group">
                    <label>Product Name</label>
                    <input type="text" id="productName" value="${product ? product.name : ''}" required>
                </div>
                <div class="form-row">
                    <div class="form-group">
                        <label>SKU</label>
                        <input type="text" id="productSku" value="${product ? product.sku : ''}" required>
                    </div>
                    <div class="form-group">
                        <label>Category</label>
                        <select id="productCategory" required>
                            <option value="">Select Category</option>
                            ${categories.map(c => {
                                const categoryName = c.name || c;
                                return `<option value="${categoryName}" ${product && product.category === categoryName ? 'selected' : ''}>${categoryName}</option>`;
                            }).join('')}
                        </select>
                    </div>
                </div>
            </div>

            <div class="form-section">
                <h3>Unit & Pricing</h3>
                <p class="form-section-hint">For Weight items, 1/4, 1/2 and 3/4 prices are auto-calculated.</p>
                <div class="form-row">
                    <div class="form-group">
                        <label>Base Unit Type</label>
                        <select id="productBaseUnitType" required>
                            <option value="PIECE" ${baseUnitType === 'PIECE' ? 'selected' : ''}>Piece</option>
                            <option value="WEIGHT" ${baseUnitType === 'WEIGHT' ? 'selected' : ''}>Weight</option>
                            <option value="VOLUME" ${baseUnitType === 'VOLUME' ? 'selected' : ''}>Volume</option>
                        </select>
                    </div>
                    <div class="form-group">
                        <label>Base Unit Name</label>
                        <input type="text" id="productBaseUnitName" value="${baseUnitName}" placeholder="piece / kg / litre" required>
                    </div>
                </div>

                <div class="form-row">
                    <div class="form-group">
                        <label>Price per Base Unit (KSh)</label>
                        <input type="number" id="productPricePerBaseUnit" value="${product ? (product.pricePerBaseUnit ?? product.unitPrice ?? '') : ''}" step="0.01" required>
                    </div>
                    <div class="form-group">
                        <label>Retail Price (KSh)</label>
                        <input type="number" id="productRetailPrice" value="${product ? (product.retailPrice ?? product.unitPrice ?? '') : ''}" step="0.01">
                    </div>
                </div>

                <div class="form-row">
                    <div class="form-group">
                        <label>Wholesale Price (KSh)</label>
                        <input type="number" id="productWholesalePrice" value="${product ? (product.wholesalePrice ?? '') : ''}" step="0.01">
                    </div>
                    <div class="form-group"></div>
                </div>

                <div class="form-row">
                    <div class="form-group" id="productQuarterPriceWrap">
                        <label>Price for 1/4 Unit (KSh)</label>
                        <input type="number" id="productQuarterPrice" value="${product ? (product.priceQuarterUnit ?? '') : ''}" step="0.01">
                    </div>
                    <div class="form-group" id="productHalfPriceWrap">
                        <label>Price for 1/2 Unit (KSh)</label>
                        <input type="number" id="productHalfPrice" value="${product ? (product.priceHalfUnit ?? '') : ''}" step="0.01">
                    </div>
                </div>

                <div class="form-row">
                    <div class="form-group" id="productThreeQuarterPriceWrap">
                        <label>Price for 3/4 Unit (KSh)</label>
                        <input type="number" id="productThreeQuarterPrice" value="${product ? (product.priceThreeQuarterUnit ?? '') : ''}" step="0.01">
                    </div>
                    <div class="form-group"></div>
                </div>
            </div>

            <div class="form-section">
                <h3>Inventory</h3>
                <p class="form-section-hint">Set your opening quantity and alert threshold.</p>
                <div class="form-row">
                    <div class="form-group">
                        <label>Initial Stock</label>
                        <input type="number" id="productStock" value="${product ? product.stock : ''}" step="0.001" required>
                    </div>
                    <div class="form-group">
                        <label>Minimum Stock Level</label>
                        <input type="number" id="productMinStock" value="${product ? product.minStock : 10}" step="0.001">
                    </div>
                </div>
            </div>

            <div class="modal-actions sticky">
                <button type="button" class="btn btn-outline" onclick="closeModal()">Cancel</button>
                <button type="submit" class="btn btn-primary">
                    <i class="fas fa-save"></i> ${product ? 'Update Product' : 'Add Product'}
                </button>
            </div>
        </form>
    `;

    openModal();

    const typeSelect = document.getElementById('productBaseUnitType');
    if (typeSelect) {
        typeSelect.addEventListener('change', toggleProductUnitFields);
    }
    const basePriceEl = document.getElementById('productPricePerBaseUnit');
    if (basePriceEl) {
        basePriceEl.addEventListener('input', autoCalculateWeightFractions);
    }
    toggleProductUnitFields();

    const masterSelect = document.getElementById('masterProductSelect');
    if (masterSelect) {
        masterSelect.addEventListener('change', () => {
            const selected = (masterProducts || []).find(p => p.id === masterSelect.value);
            if (!selected) return;

            const setValue = (id, value) => {
                const el = document.getElementById(id);
                if (el) el.value = value ?? '';
            };

            setValue('productName', selected.name || '');
            setValue('productSku', selected.sku || '');
            setValue('productCategory', selected.category || '');
            setValue('productBaseUnitType', (selected.baseUnitType || 'PIECE').toUpperCase());
            setValue('productBaseUnitName', selected.baseUnitName || '');
            setValue('productPricePerBaseUnit', selected.pricePerBaseUnit ?? selected.unitPrice ?? '');
            setValue('productRetailPrice', selected.retailPrice ?? selected.unitPrice ?? '');
            setValue('productWholesalePrice', selected.wholesalePrice ?? '');
            setValue('productQuarterPrice', selected.priceQuarterUnit ?? '');
            setValue('productHalfPrice', selected.priceHalfUnit ?? '');
            setValue('productThreeQuarterPrice', selected.priceThreeQuarterUnit ?? '');

            ['productName','productSku','productCategory','productBaseUnitType','productBaseUnitName','productPricePerBaseUnit','productRetailPrice','productWholesalePrice','productQuarterPrice','productHalfPrice','productThreeQuarterPrice']
                .forEach(id => {
                    const el = document.getElementById(id);
                    if (el) el.readOnly = true;
                    if (el && el.tagName === 'SELECT') el.disabled = true;
                });

            toggleProductUnitFields();
        });
    }

    document.getElementById('productForm').addEventListener('submit', async (e) => {
        e.preventDefault();

        if (isManager) {
            const selectedMaster = document.getElementById('masterProductSelect')?.value;
            if (!selectedMaster) {
                showToast('warning', 'Select Product', 'Please select an existing MAIN product first.');
                return;
            }
        }

        await saveProduct(product ? product.id : null);
    });
}

async function saveProduct(productId) {
    const isManagerCreate = UserSession.getRole() === 'MANAGER' && !productId;
    const selectedMasterId = document.getElementById('masterProductSelect')?.value || '';
    if (isManagerCreate && !selectedMasterId) {
        showToast('warning', 'Select Product', 'Please select an existing MAIN product first.');
        return;
    }

    const baseUnitType = (document.getElementById('productBaseUnitType').value || 'PIECE').toUpperCase();
    const rawHalf = document.getElementById('productHalfPrice').value;
    const rawQuarter = document.getElementById('productQuarterPrice').value;
    const rawThreeQuarter = document.getElementById('productThreeQuarterPrice').value;
    const basePrice = parseFloat(document.getElementById('productPricePerBaseUnit').value);

    const productData = {
        name: document.getElementById('productName').value,
        sku: document.getElementById('productSku').value,
        category: document.getElementById('productCategory').value,
        price: basePrice,
        stock: parseFloat(document.getElementById('productStock').value),
        minStock: parseFloat(document.getElementById('productMinStock').value) || 10,
        baseUnitType,
        baseUnitName: document.getElementById('productBaseUnitName').value,
        pricePerBaseUnit: basePrice,
        priceHalfUnit: baseUnitType === 'PIECE' ? null : (baseUnitType === 'WEIGHT' ? parseFloat((basePrice * 0.5).toFixed(2)) : (rawHalf === '' ? null : parseFloat(rawHalf))),
        priceQuarterUnit: baseUnitType === 'PIECE' ? null : (baseUnitType === 'WEIGHT' ? parseFloat((basePrice * 0.25).toFixed(2)) : (rawQuarter === '' ? null : parseFloat(rawQuarter))),
        priceThreeQuarterUnit: baseUnitType === 'PIECE' ? null : (baseUnitType === 'WEIGHT' ? parseFloat((basePrice * 0.75).toFixed(2)) : (rawThreeQuarter === '' ? null : parseFloat(rawThreeQuarter))),
        retailPrice: parseFloat(document.getElementById('productRetailPrice').value) || basePrice,
        wholesalePrice: (document.getElementById('productWholesalePrice').value === '' ? null : parseFloat(document.getElementById('productWholesalePrice').value))
    };

    try {
        if (productId) {
            await updateProduct(productId, productData);
            showToast('success', 'Product Updated', `${productData.name} has been updated.`);
        } else {
            await createProduct(productData);
            showToast('success', 'Product Added', `${productData.name} has been added.`);
        }
        closeModal();
        await refreshCurrentProducts();
    } catch (error) {
        if (error?.message?.toLowerCase().includes('already exists') || error?.message?.toLowerCase().includes('conflict')) {
            showToast('warning', 'Duplicate Product', error.message || 'Product SKU or name already exists.');
        } else {
            showToast('error', 'Error', error.message || 'Failed to save product');
        }
    }
}

function editProduct(id) {
    const product = products.find(p => p.id === id);
    if (product) {
        showProductModal(product);
    }
}

async function deleteProductById(id) {
    const product = products.find(p => p.id === id);
    if (product && confirm(`Delete "${product.name}"?`)) {
        try {
            await deleteProduct(id);
            showToast('success', 'Product Hidden', `${product.name} was deactivated.`);
        } catch (error) {
            showToast('error', 'Error', error.message || 'Failed to delete');
        }
    }
}

// ==================== CATEGORIES ====================

// Render categories (called after loadCategories)
function renderCategories() {
    const container = document.getElementById('categoriesGrid');
    
    // Generate colors and icons dynamically based on category name
    const getCategoryColor = (name) => {
        const colors = {
            'Electronics': '#667eea',
            'Accessories': '#764ba2',
            'Office': '#4facfe',
            'Audio': '#43e97b',
            'Storage': '#f5576c',
            'Networking': '#fa709a'
        };
        return colors[name] || '#' + Math.floor(Math.random()*16777215).toString(16);
    };
    
    const getCategoryIcon = (name) => {
        const icons = {
            'Electronics': 'fa-laptop',
            'Accessories': 'fa-headphones',
            'Office': 'fa-briefcase',
            'Audio': 'fa-music',
            'Storage': 'fa-hdd',
            'Networking': 'fa-wifi'
        };
        return icons[name] || 'fa-box';
    };
    
    container.innerHTML = categories.map(c => {
        const count = products.filter(p => p.category === c.name).length;
        return `
            <div class="category-card">
                <div class="category-card-actions">
                    <button class="action-btn delete" title="Remove Category" onclick="deleteCategoryById('${c.id}')">
                        <i class="fas fa-trash"></i>
                    </button>
                </div>
                <div class="category-icon" style="background: ${getCategoryColor(c.name)};">
                    <i class="fas ${getCategoryIcon(c.name)}"></i>
                </div>
                <h3>${c.name}</h3>
                <p>Manage ${c.name.toLowerCase()} products and inventory</p>
                <div class="category-meta">
                    <span>${count} Products</span>
                </div>
            </div>
        `;
    }).join('');

    // Add event listener for add category button
    const addBtn = document.getElementById('addCategoryBtn');
    if (addBtn) {
        addBtn.onclick = () => showCategoryModal();
    }
}

// Legacy loadCategories function - kept for backward compatibility
// Note: This is now just an alias to the main loadCategories function above
// The async loadCategories is the one that calls the API

// Show modal for adding/editing category
function showCategoryModal(category = null) {
    modalTitle.textContent = category ? 'Edit Category' : 'Add Category';
    
    modalBody.innerHTML = `
        <form id="categoryForm" class="friendly-form">
            <div class="form-section">
                <h3>Category Details</h3>
                <p class="form-section-hint">Keep category names simple so staff can find products quickly.</p>
                <div class="form-group">
                    <label>Category Name</label>
                    <input type="text" id="categoryName" value="${category ? category.name : ''}" required placeholder="e.g., Beverages">
                </div>
                <div class="form-group">
                    <label>Description (Optional)</label>
                    <textarea id="categoryDescription" rows="3" placeholder="Short description for your team">${category ? (category.description || '') : ''}</textarea>
                </div>
            </div>
            <div class="modal-actions sticky">
                <button type="button" class="btn btn-outline" onclick="closeModal()">Cancel</button>
                <button type="submit" class="btn btn-primary">
                    <i class="fas fa-save"></i> ${category ? 'Update Category' : 'Add Category'}
                </button>
            </div>
        </form>
    `;

    openModal();

    document.getElementById('categoryForm').addEventListener('submit', async (e) => {
        e.preventDefault();
        await saveCategory(category ? category.id : null);
    });
}

async function saveCategory(categoryId) {
    const categoryData = {
        name: document.getElementById('categoryName').value,
        description: document.getElementById('categoryDescription').value || undefined
    };

    try {
        await createCategory(categoryData);
        showToast('success', 'Category Added', `${categoryData.name} has been added.`);
        closeModal();
        // Refresh dashboard to update category count
        loadDashboard();
    } catch (error) {
        showToast('error', 'Error', error.message || 'Failed to save category');
    }
}

// Make category functions globally available
window.showCategoryModal = showCategoryModal;
window.saveCategory = saveCategory;
window.deleteCategory = deleteCategory;

// ==================== INVENTORY ====================

function loadInventory() {
    const getEffectiveStock = (p) => Number((p?.stockQuantity ?? p?.stock ?? 0));

    const inStock = products.filter(p => getEffectiveStock(p) > Number(p.minStock || 0)).length;
    const lowStock = products.filter(p => {
        const stock = getEffectiveStock(p);
        const minStock = Number(p.minStock || 0);
        return stock > 0 && stock <= minStock;
    }).length;
    const outOfStock = products.filter(p => getEffectiveStock(p) === 0).length;

    document.getElementById('inStockCount').textContent = inStock;
    document.getElementById('lowStockCount').textContent = lowStock;
    document.getElementById('outOfStockCount').textContent = outOfStock;

    const tbody = document.querySelector('#inventoryTable tbody');

    const getStockStatus = (p) => {
        const stock = getEffectiveStock(p);
        const minStock = Number(p.minStock || 10);
        if (stock === 0) return 'out-of-stock';
        if (stock <= minStock) return 'low-stock';
        return 'in-stock';
    };

    tbody.innerHTML = products.map(p => {
        const status = getStockStatus(p);
        const stock = getEffectiveStock(p);
        const minStock = Number(p.minStock || 10);
        return `
        <tr>
            <td>
                <div class="product-info">
                    <div class="product-img">
                        <i class="fas fa-box"></i>
                    </div>
                    <div>
                        <div class="product-name">${p.name}</div>
                        <div class="product-sku">${p.sku}</div>
                    </div>
                </div>
            </td>
            <td>${p.sku}</td>
            <td>${stock}</td>
            <td>${minStock}</td>
            <td>${minStock * 3}</td>
            <td><span class="status-badge ${status}">${formatStatus(status)}</span></td>
            <td>${p.updatedAt ? new Date(p.updatedAt).toLocaleDateString() : 'N/A'}</td>
            <td>
                <div class="action-btns">
                    <button class="action-btn edit" title="Edit" onclick="editProduct('${p.id}')">
                        <i class="fas fa-edit"></i>
                    </button>
                    <button class="action-btn delete" title="Remove Product" onclick="deleteProductById('${p.id}')">
                        <i class="fas fa-trash"></i>
                    </button>
                    <button class="action-btn refresh" title="Refresh Stock" onclick="refreshCurrentProducts()" style="color: #667eea;">
                        <i class="fas fa-sync-alt"></i>
                    </button>
                </div>
            </td>
        </tr>
    `}).join('');
}

// ==================== SUPPLIERS ====================

function getStoredSuppliers() {
    try {
        const raw = localStorage.getItem(SUPPLIERS_STORAGE_KEY);
        if (!raw) return [];
        const parsed = JSON.parse(raw);
        return Array.isArray(parsed) ? parsed : [];
    } catch (error) {
        console.warn('Failed to parse suppliers from storage:', error);
        return [];
    }
}

function persistSuppliers() {
    localStorage.setItem(SUPPLIERS_STORAGE_KEY, JSON.stringify(suppliers));
}

function buildDefaultSuppliers() {
    return [
        {
            id: 'sup-1',
            name: 'Metro Wholesale',
            contactPerson: 'Amina Yusuf',
            email: 'orders@metrowholesale.com',
            phone: '+234 800 100 1001',
            productsCount: 12,
            status: 'active'
        },
        {
            id: 'sup-2',
            name: 'Fresh Farm Link',
            contactPerson: 'David Obi',
            email: 'sales@freshfarmlink.com',
            phone: '+234 800 100 1002',
            productsCount: 8,
            status: 'active'
        }
    ];
}

function ensureSuppliersSeeded() {
    const stored = getStoredSuppliers();
    if (stored.length > 0) {
        suppliers = stored;
        return;
    }
    suppliers = buildDefaultSuppliers();
    persistSuppliers();
}

function loadSuppliers() {
    ensureSuppliersSeeded();
    renderSuppliers();

    const addBtn = document.getElementById('addSupplierBtn');
    if (addBtn) {
        addBtn.onclick = () => showSupplierModal();
    }

    const supplierSearch = document.getElementById('supplierSearch');
    if (supplierSearch && !supplierSearch.dataset.bound) {
        supplierSearch.addEventListener('input', function () {
            const q = this.value.toLowerCase().trim();
            const filtered = suppliers.filter(s =>
                s.name?.toLowerCase().includes(q) ||
                s.contactPerson?.toLowerCase().includes(q) ||
                s.email?.toLowerCase().includes(q) ||
                s.phone?.toLowerCase().includes(q)
            );
            renderSuppliers(filtered);
        });
        supplierSearch.dataset.bound = 'true';
    }
}

function renderSuppliers(rows = suppliers) {
    const tbody = document.querySelector('#suppliersTable tbody');
    if (!tbody) return;

    if (!rows.length) {
        tbody.innerHTML = `
            <tr>
                <td colspan="7" style="text-align: center; padding: 28px; color: #718096;">
                    <i class="fas fa-truck-loading" style="font-size: 24px; margin-bottom: 10px;"></i>
                    <p>No suppliers found.</p>
                </td>
            </tr>
        `;
        return;
    }

    tbody.innerHTML = rows.map(s => `
        <tr>
            <td>${s.name}</td>
            <td>${s.contactPerson || '-'}</td>
            <td>${s.email || '-'}</td>
            <td>${s.phone || '-'}</td>
            <td>${Number(s.productsCount || 0)}</td>
            <td><span class="status-badge ${s.status === 'active' ? 'in-stock' : 'out-of-stock'}">${s.status === 'active' ? 'Active' : 'Inactive'}</span></td>
            <td>
                <div class="action-btns">
                    <button class="action-btn edit" title="Edit Supplier" onclick="editSupplierById('${s.id}')">
                        <i class="fas fa-edit"></i>
                    </button>
                    <button class="action-btn ${s.status === 'active' ? 'warning' : 'success'}" title="${s.status === 'active' ? 'Deactivate' : 'Activate'}" onclick="toggleSupplierStatus('${s.id}')">
                        <i class="fas ${s.status === 'active' ? 'fa-ban' : 'fa-check'}"></i>
                    </button>
                    <button class="action-btn delete" title="Delete Supplier" onclick="deleteSupplierById('${s.id}')">
                        <i class="fas fa-trash"></i>
                    </button>
                </div>
            </td>
        </tr>
    `).join('');
}

function showSupplierModal(supplier = null) {
    modalTitle.textContent = supplier ? 'Edit Supplier' : 'Add Supplier';

    modalBody.innerHTML = `
        <form id="supplierForm" class="friendly-form">
            <div class="form-section">
                <h3>Supplier Details</h3>
                <p class="form-section-hint">Capture key contact details for purchasing and reorders.</p>
                <div class="form-group">
                    <label>Supplier Name</label>
                    <input type="text" id="supplierName" value="${supplier ? supplier.name : ''}" required placeholder="e.g., Apex Distribution">
                </div>
                <div class="form-row">
                    <div class="form-group">
                        <label>Contact Person</label>
                        <input type="text" id="supplierContactPerson" value="${supplier ? (supplier.contactPerson || '') : ''}" placeholder="e.g., Jane Doe">
                    </div>
                    <div class="form-group">
                        <label>Phone</label>
                        <input type="text" id="supplierPhone" value="${supplier ? (supplier.phone || '') : ''}" placeholder="+234 800 000 0000">
                    </div>
                </div>
                <div class="form-row">
                    <div class="form-group">
                        <label>Email</label>
                        <input type="email" id="supplierEmail" value="${supplier ? (supplier.email || '') : ''}" placeholder="supplier@email.com">
                    </div>
                    <div class="form-group">
                        <label>Products Supplied (Count)</label>
                        <input type="number" id="supplierProductsCount" min="0" value="${supplier ? Number(supplier.productsCount || 0) : 0}">
                    </div>
                </div>
                <div class="form-group">
                    <label>Status</label>
                    <select id="supplierStatus">
                        <option value="active" ${supplier && supplier.status === 'active' ? 'selected' : ''}>Active</option>
                        <option value="inactive" ${supplier && supplier.status === 'inactive' ? 'selected' : ''}>Inactive</option>
                    </select>
                </div>
            </div>
            <div class="modal-actions sticky">
                <button type="button" class="btn btn-outline" onclick="closeModal()">Cancel</button>
                <button type="submit" class="btn btn-primary">
                    <i class="fas fa-save"></i> ${supplier ? 'Update Supplier' : 'Add Supplier'}
                </button>
            </div>
        </form>
    `;

    openModal();

    document.getElementById('supplierForm').addEventListener('submit', (e) => {
        e.preventDefault();
        saveSupplier(supplier ? supplier.id : null);
    });
}

function saveSupplier(supplierId = null) {
    const supplierData = {
        id: supplierId || `sup-${Date.now()}`,
        name: document.getElementById('supplierName').value.trim(),
        contactPerson: document.getElementById('supplierContactPerson').value.trim(),
        phone: document.getElementById('supplierPhone').value.trim(),
        email: document.getElementById('supplierEmail').value.trim(),
        productsCount: parseInt(document.getElementById('supplierProductsCount').value || '0'),
        status: document.getElementById('supplierStatus').value,
    };

    if (!supplierData.name) {
        showToast('error', 'Validation Error', 'Supplier name is required.');
        return;
    }

    if (supplierId) {
        suppliers = suppliers.map(s => s.id === supplierId ? supplierData : s);
        showToast('success', 'Supplier Updated', `${supplierData.name} updated successfully.`);
    } else {
        suppliers.unshift(supplierData);
        showToast('success', 'Supplier Added', `${supplierData.name} added successfully.`);
    }

    persistSuppliers();
    renderSuppliers();
    closeModal();
}

function editSupplierById(id) {
    const supplier = suppliers.find(s => s.id === id);
    if (supplier) showSupplierModal(supplier);
}

function toggleSupplierStatus(id) {
    suppliers = suppliers.map(s => {
        if (s.id !== id) return s;
        return {
            ...s,
            status: s.status === 'active' ? 'inactive' : 'active'
        };
    });
    persistSuppliers();
    renderSuppliers();
    showToast('success', 'Status Updated', 'Supplier status updated.');
}

function deleteSupplierById(id) {
    const supplier = suppliers.find(s => s.id === id);
    if (!supplier) return;
    if (!confirm(`Delete supplier "${supplier.name}"?`)) return;
    suppliers = suppliers.filter(s => s.id !== id);
    persistSuppliers();
    renderSuppliers();
    showToast('success', 'Supplier Deleted', `${supplier.name} removed.`);
}

// ==================== USERS ====================

function setupStoreSelector() {
    const selector = document.getElementById('storeSelector');
    if (!selector || selector.dataset.bound === 'true') {
        renderStoreSelectorOptions();
        syncActiveStoreBadge();
        return;
    }

    selector.addEventListener('change', async (e) => {
        const newLocationId = e.target.value || '';
        const selectedLocation = locations.find(loc => loc.id === newLocationId);

        selectedLocationId = newLocationId;
        selectedLocationName = selectedLocation ? selectedLocation.name : 'All Stores';

        if (selectedLocationId) {
            localStorage.setItem('selectedLocationId', selectedLocationId);
        } else {
            localStorage.removeItem('selectedLocationId');
        }
        localStorage.setItem('selectedLocationName', selectedLocationName);

        syncActiveStoreBadge();

        try {
            await Promise.all([
                loadProducts(),
                loadUsers(),
                loadCategories(),
                loadStockRequests()
            ]);
            loadDashboard();
            loadInventory();
            renderLocations();
            showToast('success', 'Store Switched', `Now viewing: ${selectedLocationName}`);
        } catch (error) {
            console.error('Failed to reload store context:', error);

            // Fallback to all stores if filtered load fails
            selectedLocationId = '';
            selectedLocationName = 'All Stores';
            localStorage.removeItem('selectedLocationId');
            localStorage.setItem('selectedLocationName', selectedLocationName);
            renderStoreSelectorOptions();
            syncActiveStoreBadge();

            try {
                await Promise.all([loadProducts(), loadCategories()]);
                loadDashboard();
                loadInventory();
            } catch (_) {
                // no-op, keep existing error toast below
            }

            showToast('error', 'Error', 'Failed to switch store context');
        }
    });

    selector.dataset.bound = 'true';
    renderStoreSelectorOptions();
    syncActiveStoreBadge();
}

function renderStoreSelectorOptions() {
    const selector = document.getElementById('storeSelector');
    if (!selector) return;

    const optionsHtml = [
        '<option value="">All Stores</option>',
        ...locations.map(loc => `<option value="${loc.id}">${loc.name}</option>`)
    ].join('');

    selector.innerHTML = optionsHtml;
    selector.value = selectedLocationId;
}

function syncActiveStoreBadge() {
    const badge = document.getElementById('activeStoreBadge');
    if (!badge) return;

    const activeLocation = locations.find(loc => loc.id === selectedLocationId);
    const badgeName = activeLocation ? activeLocation.name : (selectedLocationName || 'All Stores');
    badge.textContent = badgeName;
}

function renderLocations() {
    const tbody = document.querySelector('#locationsTable tbody');
    if (!tbody) return;

    if (!locations.length) {
        tbody.innerHTML = `
            <tr>
                <td colspan="4" style="text-align:center; padding: 24px; color: #718096;">
                    No locations found
                </td>
            </tr>
        `;
        return;
    }

    tbody.innerHTML = locations.map(loc => `
        <tr>
            <td>${loc.name || '-'}</td>
            <td>${loc.address || '-'}</td>
            <td>
                <span class="status-badge ${loc.isActive ? 'active' : 'inactive'}">
                    ${loc.isActive ? 'Active' : 'Inactive'}
                </span>
            </td>
            <td>${loc.createdAt ? new Date(loc.createdAt).toLocaleDateString() : 'N/A'}</td>
        </tr>
    `).join('');
}

function renderUsers() {
    const tbody = document.querySelector('#usersTable tbody');
    const locations = window.allLocations || [];
    
    // Create a map for quick location lookup
    const locationMap = {};
    locations.forEach(loc => {
        locationMap[loc.id] = loc.name;
    });
    
    tbody.innerHTML = users.map(u => `
        <tr>
            <td><input type="checkbox"></td>
            <td>
                <div class="product-info">
                    <div class="product-img">
                        <i class="fas fa-user"></i>
                    </div>
                    <div>
                        <div class="product-name">${u.firstName || ''} ${u.lastName || ''}</div>
                        <div class="product-sku">ID: ${u.id?.substring(0, 8)}</div>
                    </div>
                </div>
            </td>
            <td>${u.email}</td>
            <td><span class="status-badge ${getRoleClass(u.role)}">${formatRole(u.role)}</span></td>
            <td>${u.phone || '-'}</td>
            <td>${u.assignedLocationId ? (locationMap[u.assignedLocationId] || 'Unknown') : '-'}</td>
            <td><span class="status-badge ${u.isActive ? 'active' : 'inactive'}">${u.isActive ? 'Active' : 'Inactive'}</span></td>
            <td>${u.createdAt ? new Date(u.createdAt).toLocaleDateString() : 'N/A'}</td>
            <td>
                <div class="action-btns">
                    <button class="action-btn edit" title="Edit" onclick="editUserById('${u.id}')">
                        <i class="fas fa-edit"></i>
                    </button>
                    <button class="action-btn ${u.isActive ? 'warning' : 'success'}" title="${u.isActive ? 'Deactivate' : 'Activate'}" onclick="toggleUserStatusById('${u.id}')">
                        <i class="fas ${u.isActive ? 'fa-ban' : 'fa-check'}"></i>
                    </button>
                    <button class="action-btn delete" title="Delete" onclick="deleteUserById('${u.id}')">
                        <i class="fas fa-trash"></i>
                    </button>
                </div>
            </td>
        </tr>
    `).join('');

    const addBtn = document.getElementById('addUserBtn');
    if (addBtn) {
        addBtn.onclick = () => showUserModal();
    }
}

function getRoleClass(role) {
    const roleClasses = {
        'OWNER': 'in-stock',
        'MANAGER': 'low-stock',
        'CASHIER': 'out-of-stock'
    };
    return roleClasses[role] || '';
}

function formatRole(role) {
    const roleMap = {
        'OWNER': 'Owner',
        'MANAGER': 'Manager',
        'CASHIER': 'Cashier'
    };
    return roleMap[role] || role;
}

function showUserModal(user = null) {
    modalTitle.textContent = user ? 'Edit User' : 'Add User';
    
    const roles = [
        { value: 'OWNER', label: 'Owner' },
        { value: 'MANAGER', label: 'Manager' },
        { value: 'CASHIER', label: 'Cashier' }
    ];
    
    // Get locations for dropdown
    const locations = window.allLocations || [];
    const locationOptions = locations.map(loc => 
        `<option value="${loc.id}" ${user && user.assignedLocationId === loc.id ? 'selected' : ''}>${loc.name}</option>`
    ).join('');
    
    modalBody.innerHTML = `
        <form id="userForm">
            <div class="form-row">
                <div class="form-group">
                    <label>First Name</label>
                    <input type="text" id="userFirstName" value="${user ? user.firstName || '' : ''}" required>
                </div>
                <div class="form-group">
                    <label>Last Name</label>
                    <input type="text" id="userLastName" value="${user ? user.lastName || '' : ''}" required>
                </div>
            </div>
            <div class="form-group">
                <label>Email</label>
                <input type="email" id="userEmail" value="${user ? user.email || '' : ''}" required ${user ? 'disabled' : ''}>
            </div>
            ${!user ? `
            <div class="form-group">
                <label>Password</label>
                <input type="password" id="userPassword" required minlength="6" placeholder="Min 6 characters">
            </div>
            ` : ''}
            <div class="form-row">
                <div class="form-group">
                    <label>Phone</label>
                    <input type="tel" id="userPhone" value="${user && user.phone ? user.phone : ''}" placeholder="+1 555-0000">
                </div>
                <div class="form-group">
                    <label>Role</label>
                    <select id="userRole" required>
                        <option value="">Select Role</option>
                        ${roles.map(r => `<option value="${r.value}" ${user && user.role === r.value ? 'selected' : ''}>${r.label}</option>`).join('')}
                    </select>
                </div>
            </div>
            <div class="form-group">
                <label>Assigned Location</label>
                <select id="userLocation">
                    <option value="">No Location</option>
                    ${locationOptions}
                </select>
            </div>
            ${user ? `
            <div class="form-group">
                <label>Status</label>
                <select id="userStatus">
                    <option value="true" ${user.isActive ? 'selected' : ''}>Active</option>
                    <option value="false" ${!user.isActive ? 'selected' : ''}>Inactive</option>
                </select>
            </div>
            ` : ''}
            <div class="modal-actions">
                <button type="button" class="btn btn-outline" onclick="closeModal()">Cancel</button>
                <button type="submit" class="btn btn-primary">
                    <i class="fas fa-save"></i> ${user ? 'Update User' : 'Add User'}
                </button>
            </div>
        </form>
    `;

    openModal();

    document.getElementById('userForm').addEventListener('submit', async (e) => {
        e.preventDefault();
        await saveUserForm(user ? user.id : null);
    });
}

async function saveUserForm(userId) {
    const userData = {
        firstName: document.getElementById('userFirstName').value,
        lastName: document.getElementById('userLastName').value,
        email: document.getElementById('userEmail').value,
        phone: document.getElementById('userPhone').value || null,
        role: document.getElementById('userRole').value
    };

    const locationId = document.getElementById('userLocation').value;

    try {
        if (userId) {
            userData.isActive = document.getElementById('userStatus').value === 'true';
            await updateUser(userId, userData);
            
            // Assign location if selected
            if (locationId) {
                await apiJson(`/users/${userId}/location`, {
                    method: 'PUT',
                    body: JSON.stringify({ locationId })
                });
            }
            
            showToast('success', 'User Updated', `${userData.firstName} ${userData.lastName} updated.`);
        } else {
            userData.password = document.getElementById('userPassword').value;
            const newUser = await createUser(userData);
            
            // Assign location if selected for new user
            if (locationId && newUser.id) {
                await apiJson(`/users/${newUser.id}/location`, {
                    method: 'PUT',
                    body: JSON.stringify({ locationId })
                });
            }
            
            showToast('success', 'User Added', `${userData.firstName} ${userData.lastName} added.`);
        }
        closeModal();
        // Refresh users list
        loadUsers();
    } catch (error) {
        showToast('error', 'Error', error.message || 'Failed to save user');
    }
}

function editUserById(id) {
    const user = users.find(u => u.id === id);
    if (user) {
        showUserModal(user);
    }
}

async function toggleUserStatusById(id) {
    const user = users.find(u => u.id === id);
    if (!user) return;
    
    const action = user.isActive ? 'deactivate' : 'activate';
    if (confirm(`${action === 'activate' ? 'Activate' : 'Deactivate'} "${user.firstName} ${user.lastName}"?`)) {
        try {
            await toggleUserStatus(id);
            showToast('success', `User ${action}d`, `User has been ${action}d.`);
        } catch (error) {
            showToast('error', 'Error', error.message || 'Failed to update status');
        }
    }
}

async function deleteUserById(id) {
    const user = users.find(u => u.id === id);
    if (user && confirm(`Delete "${user.firstName} ${user.lastName}"? This cannot be undone.`)) {
        try {
            await deleteUser(id);
            showToast('success', 'User Deleted', 'User has been removed.');
        } catch (error) {
            showToast('error', 'Error', error.message || 'Failed to delete');
        }
    }
}

// ==================== CHARTS ====================

function initializeCharts() {
    // Inventory Overview Chart
    const inventoryCtx = document.getElementById('inventoryChart');
    if (inventoryCtx && typeof Chart !== 'undefined') {
        new Chart(inventoryCtx, {
            type: 'line',
            data: {
                labels: ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'],
                datasets: [{
                    label: 'Stock In',
                    data: [65, 78, 90, 81, 95, 110, 105],
                    borderColor: '#43e97b',
                    backgroundColor: 'rgba(67, 233, 123, 0.1)',
                    fill: true,
                    tension: 0.4
                }, {
                    label: 'Stock Out',
                    data: [45, 55, 60, 70, 65, 80, 75],
                    borderColor: '#f5576c',
                    backgroundColor: 'rgba(245, 87, 108, 0.1)',
                    fill: true,
                    tension: 0.4
                }]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                plugins: { legend: { position: 'top' } },
                scales: { y: { beginAtZero: true } }
            }
        });
    }

    // Category Chart
    const categoryCtx = document.getElementById('categoryChart');
    if (categoryCtx && typeof Chart !== 'undefined') {
        const categoryNames = categories.map(c => c.name || c);
        const categoryCounts = categories.map(c => products.filter(p => p.category === (c.name || c)).length);
        const colors = ['#667eea', '#764ba2', '#4facfe', '#43e97b', '#f5576c', '#fa709a'];
        
        new Chart(categoryCtx, {
            type: 'doughnut',
            data: {
                labels: categoryNames,
                datasets: [{
                    data: categoryCounts.length > 0 ? categoryCounts : [1, 1, 1, 1, 1, 1],
                    backgroundColor: colors
                }]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                plugins: { legend: { position: 'bottom' } }
            }
        });
    }
}

// ==================== REFRESH FUNCTIONS ====================

/**
 * Manual refresh for current products/inventory
 */
async function refreshCurrentProducts() {
    try {
        await loadProducts();
        loadDashboard();
        loadInventory();
        showToast('success', 'Refreshed', 'Stock data updated from server');
    } catch (error) {
        console.error('Refresh failed:', error);
        showToast('error', 'Error', 'Failed to refresh data');
    }
}

window.refreshCurrentProducts = refreshCurrentProducts;

// ==================== UTILITIES ====================

function openModal() {
    modal.classList.add('active');
    document.body.style.overflow = 'hidden';
}

function closeModal() {
    modal.classList.remove('active');
    document.body.style.overflow = '';
}

function showToast(type, title, message) {
    const icons = {
        success: 'fa-check-circle',
        error: 'fa-times-circle',
        warning: 'fa-exclamation-triangle',
        info: 'fa-info-circle'
    };

    const toast = document.createElement('div');
    toast.className = `toast ${type}`;
    toast.innerHTML = `
        <i class="fas ${icons[type]}"></i>
        <div class="toast-message">
            <strong>${title}</strong>
            <p>${message}</p>
        </div>
    `;

    toastContainer.appendChild(toast);

    setTimeout(() => {
        toast.style.animation = 'toastSlide 0.3s ease reverse';
        setTimeout(() => toast.remove(), 300);
    }, 4000);
}

// Make functions globally available
window.editProduct = editProduct;
window.deleteProductById = deleteProductById;
window.deleteCategoryById = deleteCategoryById;
window.editUserById = editUserById;
window.toggleUserStatusById = toggleUserStatusById;
window.deleteUserById = deleteUserById;
window.editSupplierById = editSupplierById;
window.toggleSupplierStatus = toggleSupplierStatus;
window.deleteSupplierById = deleteSupplierById;

// Report actions
function getReportDataset(type) {
    const stockRows = products.map(p => {
        const stock = Number(p.stock || p.stockQuantity || 0);
        const unitPrice = Number(p.unitPrice || 0);
        const minStock = Number(p.minStock || 0);
        return {
            name: p.name,
            sku: p.sku,
            category: p.category,
            stock,
            minStock,
            value: stock * unitPrice,
            status: stock === 0 ? 'Out of Stock' : (stock <= minStock ? 'Low Stock' : 'In Stock')
        };
    });

    if (type === 'low-stock') {
        return stockRows.filter(r => r.status !== 'In Stock');
    }
    return stockRows;
}

function exportReportCSV(type, title) {
    const data = getReportDataset(type);
    if (!data.length) {
        showToast('warning', 'No Data', 'No records available for this report.');
        return;
    }

    const headers = ['Name', 'SKU', 'Category', 'Stock', 'Min Stock', 'Status', 'Value'];
    const lines = data.map(r =>
        [r.name, r.sku, r.category, r.stock, r.minStock, r.status, r.value.toFixed(2)]
            .map(v => `"${String(v ?? '').replace(/"/g, '""')}"`)
            .join(',')
    );
    const csv = [headers.join(','), ...lines].join('\n');

    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    const safe = title.toLowerCase().replace(/\s+/g, '-');
    a.href = url;
    a.download = `${safe}-${new Date().toISOString().slice(0, 10)}.csv`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);

    showToast('success', 'Report Ready', `${title} downloaded.`);
}

function printReport(type, title) {
    const data = getReportDataset(type);
    if (!data.length) {
        showToast('warning', 'No Data', 'No records available for this report.');
        return;
    }

    const rows = data.map(r => `
        <tr>
            <td>${r.name}</td>
            <td>${r.sku}</td>
            <td>${r.category || '-'}</td>
            <td>${r.stock}</td>
            <td>${r.minStock}</td>
            <td>${r.status}</td>
            <td>${formatMoney(r.value)}</td>
        </tr>
    `).join('');

    const win = window.open('', '_blank');
    if (!win) {
        showToast('error', 'Popup Blocked', 'Enable popups to print reports.');
        return;
    }

    win.document.write(`
        <html>
            <head>
                <title>${title}</title>
                <style>
                    body { font-family: Arial, sans-serif; padding: 20px; }
                    h2 { margin: 0 0 12px; }
                    table { width: 100%; border-collapse: collapse; font-size: 12px; }
                    th, td { border: 1px solid #ddd; padding: 8px; text-align: left; }
                    th { background: #f5f7fb; }
                </style>
            </head>
            <body>
                <h2>${title} (${CURRENCY_SYMBOL})</h2>
                <p>Date: ${new Date().toLocaleString()}</p>
                <table>
                    <thead>
                        <tr>
                            <th>Name</th><th>SKU</th><th>Category</th><th>Stock</th><th>Min</th><th>Status</th><th>Value</th>
                        </tr>
                    </thead>
                    <tbody>${rows}</tbody>
                </table>
                <script>window.print();</script>
            </body>
        </html>
    `);
    win.document.close();
}

function bindReportButtons() {
    const cards = document.querySelectorAll('#reports .report-card');
    if (!cards.length) return;

    cards.forEach((card, idx) => {
        const btn = card.querySelector('button');
        if (!btn) return;
        btn.onclick = () => {
            if (idx === 0) exportReportCSV('inventory', 'Inventory Summary');
            else if (idx === 2) exportReportCSV('low-stock', 'Low Stock Report');
            else if (idx === 1) printReport('inventory', 'Stock Movement Snapshot');
            else printReport('inventory', 'Supplier Performance Snapshot');
        };
    });
}

document.getElementById('refreshStockRequestsBtn')?.addEventListener('click', loadStockRequests);
document.getElementById('stockRequestStatusFilter')?.addEventListener('change', loadStockRequests);
document.getElementById('createStockRequestForm')?.addEventListener('submit', submitManagerStockRequest);

window.approveStockRequest = approveStockRequest;
window.rejectStockRequest = rejectStockRequest;

function renderTransferHistory(scopedRequests = null) {
    const tbody = document.querySelector('#transferHistoryTable tbody');
    if (!tbody) return;

    const requests = Array.isArray(scopedRequests) ? scopedRequests : (Array.isArray(stockRequests) ? stockRequests : []);
    const approved = requests
        .filter(req => req?.status === 'APPROVED')
        .sort((a, b) => {
            const ad = a?.createdAt ? new Date(a.createdAt).getTime() : 0;
            const bd = b?.createdAt ? new Date(b.createdAt).getTime() : 0;
            return bd - ad;
        });

    if (!approved.length) {
        tbody.innerHTML = `
            <tr>
                <td colspan="6" style="text-align:center; padding: 24px; color: #718096;">
                    No transfers received yet
                </td>
            </tr>
        `;
        return;
    }

    const productMap = Object.fromEntries((products || []).map(p => [p.id, p.name]));
    const locationMap = Object.fromEntries((locations || []).map(l => [l.id, l.name]));

    tbody.innerHTML = approved.slice(0, 50).map(req => `
        <tr>
            <td>${req.createdAt ? new Date(req.createdAt).toLocaleString() : '-'}</td>
            <td>${productMap[req.productId] || req.productId}</td>
            <td>${locationMap[req.fromLocationId] || req.fromLocationId}</td>
            <td>${locationMap[req.toLocationId] || req.toLocationId}</td>
            <td>${Number(req.quantity || 0).toLocaleString()}</td>
            <td><span class="status-badge active">Approved</span></td>
        </tr>
    `).join('');
}

// ==================== SEARCH & FILTERS ====================

document.getElementById('inventorySearch')?.addEventListener('input', function() {
    const query = this.value.toLowerCase();
    const filtered = products.filter(p =>
        p.name?.toLowerCase().includes(query) ||
        p.sku?.toLowerCase().includes(query) ||
        p.category?.toLowerCase().includes(query)
    );
    renderFilteredInventory(filtered);
});

function renderFilteredInventory(filteredProducts) {
    const tbody = document.querySelector('#inventoryTable tbody');
    if (!tbody) return;

    const getStockStatus = (p) => {
        const stock = Number((p?.stockQuantity ?? p?.stock ?? 0));
        const minStock = Number(p.minStock || 10);
        if (stock === 0) return 'out-of-stock';
        if (stock <= minStock) return 'low-stock';
        return 'in-stock';
    };

    tbody.innerHTML = filteredProducts.map(p => {
        const status = getStockStatus(p);
        const stock = Number((p?.stockQuantity ?? p?.stock ?? 0));
        const minStock = Number(p.minStock || 10);
        return `
        <tr>
            <td>
                <div class="product-info">
                    <div class="product-img">
                        <i class="fas fa-box"></i>
                    </div>
                    <div>
                        <div class="product-name">${p.name}</div>
                        <div class="product-sku">${p.sku}</div>
                    </div>
                </div>
            </td>
            <td>${p.sku}</td>
            <td>${stock}</td>
            <td>${minStock}</td>
            <td>${minStock * 3}</td>
            <td><span class="status-badge ${status}">${formatStatus(status)}</span></td>
            <td>${p.updatedAt ? new Date(p.updatedAt).toLocaleDateString() : 'N/A'}</td>
            <td>
                <div class="action-btns">
                    <button class="action-btn edit" title="Edit" onclick="editProduct('${p.id}')">
                        <i class="fas fa-edit"></i>
                    </button>
                    <button class="action-btn delete" title="Remove Product" onclick="deleteProductById('${p.id}')">
                        <i class="fas fa-trash"></i>
                    </button>
                    <button class="action-btn refresh" title="Refresh Stock" onclick="refreshCurrentProducts()" style="color: #667eea;">
                        <i class="fas fa-sync-alt"></i>
                    </button>
                </div>
            </td>
        </tr>
        `;
    }).join('');
}

// Settings navigation
document.querySelectorAll('.settings-nav-item').forEach(item => {
    item.addEventListener('click', (e) => {
        e.preventDefault();
        document.querySelectorAll('.settings-nav-item').forEach(i => i.classList.remove('active'));
        document.querySelectorAll('.settings-panel').forEach(p => p.classList.remove('active'));
        item.classList.add('active');
    });
});


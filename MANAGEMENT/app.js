// Inventory Management System - Frontend Application (Real API Integration)

// Global data stores (loaded from API)
let products = [];
let users = [];
let categories = []; // Will be loaded from API
let suppliers = [];

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

// Role-based menu configuration
const MENU_PERMISSIONS = {
    OWNER: ['dashboard', 'products', 'categories', 'inventory', 'suppliers', 'users', 'reports', 'settings'],
    MANAGER: ['dashboard', 'products', 'categories', 'inventory', 'suppliers', 'reports', 'settings'],
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

    // Apply role-based menu visibility
    applyRoleBasedMenu();

    // Setup event listeners and load data
    setupEventListeners();
    
    // Load data from API
    try {
        await Promise.all([
            loadProducts(),
            loadUsers(),
            loadCategories()
        ]);
        loadDashboard();
        loadInventory();
        loadSuppliers();
        initializeCharts();
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

function navigateToSection(sectionId) {
    navItems.forEach(item => {
        item.classList.toggle('active', item.dataset.section === sectionId);
    });

    contentSections.forEach(section => {
        section.classList.toggle('active', section.id === sectionId);
    });

    sidebar.classList.remove('active');
}

// ==================== API FUNCTIONS ====================

async function loadProducts() {
    try {
        const data = await apiJson('/products');
        products = data;
        renderProducts();
        return products;
    } catch (error) {
        console.error('Error loading products:', error);
        products = [];
        renderProducts();
        return products;
    }
}

async function loadUsers() {
    try {
        const data = await apiJson('/users');
        users = data;
        
        // Load locations for assignment feature
        try {
            window.allLocations = await apiJson('/locations');
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
        await api(`/products/${id}`, { method: 'DELETE' });
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

// ==================== RENDER FUNCTIONS ====================

function loadDashboard() {
    document.getElementById('totalProducts').textContent = products.length;
    document.getElementById('totalCategories').textContent = categories.length;
    
    const totalStock = products.reduce((sum, p) => sum + (p.stock || 0), 0);
    document.getElementById('totalStock').textContent = totalStock.toLocaleString();
    
    const totalValue = products.reduce((sum, p) => sum + ((p.unitPrice || 0) * (p.stock || 0)), 0);
    document.getElementById('totalValue').textContent = '$' + totalValue.toLocaleString(0, 2);

    loadRecentActivity();
    loadLowStockAlerts();
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
    const tbody = document.querySelector('#productsTable tbody');
    
    tbody.innerHTML = products.map(p => `
        <tr>
            <td><input type="checkbox"></td>
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
            <td>${p.category}</td>
            <td>$${(p.unitPrice || 0).toFixed(2)}</td>
            <td>${p.stock || 0}</td>
            <td><span class="status-badge ${p.status || 'in-stock'}">${formatStatus(p.status)}</span></td>
            <td>
                <div class="action-btns">
                    <button class="action-btn edit" title="Edit" onclick="editProduct('${p.id}')">
                        <i class="fas fa-edit"></i>
                    </button>
                    <button class="action-btn delete" title="Delete" onclick="deleteProductById('${p.id}')">
                        <i class="fas fa-trash"></i>
                    </button>
                </div>
            </td>
        </tr>
    `).join('');

    // Update category filter
    const categoryFilter = document.getElementById('categoryFilter');
    categoryFilter.innerHTML = '<option value="">All Categories</option>';
    categories.forEach(c => {
        const categoryName = c.name || c;
        categoryFilter.innerHTML += `<option value="${categoryName}">${categoryName}</option>`;
    });

    // Add event listener for add product button
    const addBtn = document.getElementById('addProductBtn');
    if (addBtn) {
        addBtn.onclick = () => showProductModal();
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

function showProductModal(product = null) {
    modalTitle.textContent = product ? 'Edit Product' : 'Add Product';
    
    modalBody.innerHTML = `
        <form id="productForm">
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
            <div class="form-row">
                <div class="form-group">
                    <label>Price ($)</label>
                    <input type="number" id="productPrice" value="${product ? product.unitPrice : ''}" step="0.01" required>
                </div>
                <div class="form-group">
                    <label>Initial Stock</label>
                    <input type="number" id="productStock" value="${product ? product.stock : ''}" required>
                </div>
            </div>
            <div class="form-group">
                <label>Minimum Stock Level</label>
                <input type="number" id="productMinStock" value="${product ? product.minStock : 10}">
            </div>
            <div class="modal-actions">
                <button type="button" class="btn btn-outline" onclick="closeModal()">Cancel</button>
                <button type="submit" class="btn btn-primary">
                    <i class="fas fa-save"></i> ${product ? 'Update Product' : 'Add Product'}
                </button>
            </div>
        </form>
    `;

    openModal();

    document.getElementById('productForm').addEventListener('submit', async (e) => {
        e.preventDefault();
        await saveProduct(product ? product.id : null);
    });
}

async function saveProduct(productId) {
    const productData = {
        name: document.getElementById('productName').value,
        sku: document.getElementById('productSku').value,
        category: document.getElementById('productCategory').value,
        price: parseFloat(document.getElementById('productPrice').value),
        stock: parseInt(document.getElementById('productStock').value),
        minStock: parseInt(document.getElementById('productMinStock').value) || 10
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
    } catch (error) {
        showToast('error', 'Error', error.message || 'Failed to save product');
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
            showToast('success', 'Product Deleted', `${product.name} removed.`);
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
        <form id="categoryForm">
            <div class="form-group">
                <label>Category Name</label>
                <input type="text" id="categoryName" value="${category ? category.name : ''}" required placeholder="e.g., Electronics">
            </div>
            <div class="form-group">
                <label>Description (Optional)</label>
                <textarea id="categoryDescription" rows="3" placeholder="Enter category description">${category ? (category.description || '') : ''}</textarea>
            </div>
            <div class="modal-actions">
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
    const inStock = products.filter(p => (p.stock || 0) > (p.minStock || 0)).length;
    const lowStock = products.filter(p => (p.stock || 0) > 0 && (p.stock || 0) <= (p.minStock || 0)).length;
    const outOfStock = products.filter(p => (p.stock || 0) === 0).length;

    document.getElementById('inStockCount').textContent = inStock;
    document.getElementById('lowStockCount').textContent = lowStock;
    document.getElementById('outOfStockCount').textContent = outOfStock;

    const tbody = document.querySelector('#inventoryTable tbody');
    
    tbody.innerHTML = products.map(p => `
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
            <td>${p.stock || 0}</td>
            <td>${p.minStock || 10}</td>
            <td>${(p.minStock || 10) * 3}</td>
            <td><span class="status-badge ${p.status || 'in-stock'}">${formatStatus(p.status)}</span></td>
            <td>${p.updatedAt ? new Date(p.updatedAt).toLocaleDateString() : 'N/A'}</td>
            <td>
                <div class="action-btns">
                    <button class="action-btn edit" title="Edit" onclick="editProduct('${p.id}')">
                        <i class="fas fa-edit"></i>
                    </button>
                </div>
            </td>
        </tr>
    `).join('');
}

// ==================== SUPPLIERS ====================

function loadSuppliers() {
    const tbody = document.querySelector('#suppliersTable tbody');
    
    // Suppliers not implemented in backend - show placeholder
    tbody.innerHTML = `
        <tr>
            <td colspan="7" style="text-align: center; padding: 40px; color: #718096;">
                <i class="fas fa-truck" style="font-size: 32px; margin-bottom: 10px;"></i>
                <p>Supplier management coming soon</p>
            </td>
        </tr>
    `;
}

// ==================== USERS ====================

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
window.editUserById = editUserById;
window.toggleUserStatusById = toggleUserStatusById;
window.deleteUserById = deleteUserById;

// ==================== SEARCH & FILTERS ====================

document.getElementById('productSearch')?.addEventListener('input', function() {
    const query = this.value.toLowerCase();
    const filtered = products.filter(p => 
        p.name?.toLowerCase().includes(query) || 
        p.sku?.toLowerCase().includes(query) ||
        p.category?.toLowerCase().includes(query)
    );
    renderFilteredProducts(filtered);
});

function renderFilteredProducts(filteredProducts) {
    const tbody = document.querySelector('#productsTable tbody');
    tbody.innerHTML = filteredProducts.map(p => `
        <tr>
            <td><input type="checkbox"></td>
            <td>
                <div class="product-info">
                    <div class="product-img"><i class="fas fa-box"></i></div>
                    <div><div class="product-name">${p.name}</div><div class="product-sku">${p.sku}</div></div>
                </div>
            </td>
            <td>${p.sku}</td>
            <td>${p.category}</td>
            <td>$${(p.unitPrice || 0).toFixed(2)}</td>
            <td>${p.stock || 0}</td>
            <td><span class="status-badge ${p.status || 'in-stock'}">${formatStatus(p.status)}</span></td>
            <td>
                <div class="action-btns">
                    <button class="action-btn edit" onclick="editProduct('${p.id}')"><i class="fas fa-edit"></i></button>
                    <button class="action-btn delete" onclick="deleteProductById('${p.id}')"><i class="fas fa-trash"></i></button>
                </div>
            </td>
        </tr>
    `).join('');
}

document.getElementById('categoryFilter')?.addEventListener('change', function() {
    const category = this.value;
    const filtered = category ? products.filter(p => p.category === category) : products;
    renderFilteredProducts(filtered);
});

document.getElementById('stockFilter')?.addEventListener('change', function() {
    const status = this.value;
    const filtered = status ? products.filter(p => p.status === status) : products;
    renderFilteredProducts(filtered);
});

// Settings navigation
document.querySelectorAll('.settings-nav-item').forEach(item => {
    item.addEventListener('click', (e) => {
        e.preventDefault();
        document.querySelectorAll('.settings-nav-item').forEach(i => i.classList.remove('active'));
        document.querySelectorAll('.settings-panel').forEach(p => p.classList.remove('active'));
        item.classList.add('active');
    });
});


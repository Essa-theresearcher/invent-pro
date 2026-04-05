/**
 * Authentication utilities for Inventory Management System
 * Handles token storage, API calls with auth, and user session management
 */

const API_BASE = window.location.hostname === 'localhost'
  ? 'http://localhost:3000'
  : window.location.origin;
const API_BASE_URL = `${API_BASE}/api/v1`;

// ============================================
// Token Storage
// ============================================

const Auth = {
  /**
   * Get stored token (sessionStorage preferred, localStorage fallback)
   */
  getToken() {
    return sessionStorage.getItem('token') || localStorage.getItem('token');
  },

  /**
   * Store token
   * @param {string} token - JWT token
   * @param {boolean} rememberMe - If true, use localStorage (persists across browser restarts)
   */
  setToken(token, rememberMe = false) {
    if (rememberMe) {
      localStorage.setItem('token', token);
      sessionStorage.removeItem('token');
    } else {
      sessionStorage.setItem('token', token);
      localStorage.removeItem('token');
    }
  },

  /**
   * Clear all auth data
   */
  clearToken() {
    sessionStorage.removeItem('token');
    localStorage.removeItem('token');
    sessionStorage.removeItem('user');
    localStorage.removeItem('user');
  },

  /**
   * Check if user is logged in
   */
  isLoggedIn() {
    return !!this.getToken();
  }
};

// ============================================
// User Session
// ============================================

const UserSession = {
  /**
   * Get stored user data
   */
  getUser() {
    const userStr = sessionStorage.getItem('user') || localStorage.getItem('user');
    return userStr ? JSON.parse(userStr) : null;
  },

  /**
   * Store user data
   * @param {object} user - User object from /me endpoint
   * @param {boolean} rememberMe
   */
  setUser(user, rememberMe = false) {
    const storage = rememberMe ? localStorage : sessionStorage;
    storage.setItem('user', JSON.stringify(user));
  },

  /**
   * Clear user data
   */
  clearUser() {
    sessionStorage.removeItem('user');
    localStorage.removeItem('user');
  },

  /**
   * Check if current user is CASHIER
   */
  isCashier() {
    const user = this.getUser();
    return user?.role === 'CASHIER';
  },

  /**
   * Check if current user is OWNER or MANAGER
   */
  isAdmin() {
    const user = this.getUser();
    return user?.role === 'OWNER' || user?.role === 'MANAGER';
  },

  /**
   * Get user's assigned location ID
   */
  getLocationId() {
    const user = this.getUser();
    return user?.assigned_location_id || user?.locationId || null;
  },

  /**
   * Get user role
   */
  getRole() {
    const user = this.getUser();
    return user?.role || null;
  }
};

// ============================================
// API Helper with Auth
// ============================================

/**
 * Make authenticated API request
 * @param {string} endpoint - API endpoint (e.g., '/users')
 * @param {object} options - Fetch options
 * @returns {Promise<Response>}
 */
async function api(endpoint, options = {}) {
  const token = Auth.getToken();
  const headers = {
    'Content-Type': 'application/json',
    ...options.headers
  };

  if (token) {
    headers['Authorization'] = `Bearer ${token}`;
  }

  const response = await fetch(`${API_BASE_URL}${endpoint}`, {
    ...options,
    headers
  });

  // Handle 401 Unauthorized
  if (response.status === 401) {
    Auth.clearToken();
    UserSession.clearUser();
    window.location.href = '/login.html';
    throw new Error('Session expired. Please log in again.');
  }

  return response;
}

/**
 * Parse JSON response or throw error
 */
async function apiJson(endpoint, options = {}) {
  const response = await api(endpoint, options);
  if (!response.ok) {
    const error = await response.json().catch(() => ({ message: 'Request failed' }));
    throw new Error(error.message || `HTTP ${response.status}`);
  }
  return response.json();
}

// ============================================
// Auth API Functions
// ============================================

/**
 * Login user
 * @param {string} email
 * @param {string} password
 * @param {boolean} rememberMe
 * @returns {Promise<object>} - { user, token }
 */
async function login(email, password, rememberMe = false) {
  // Clear any existing session first
  Auth.clearToken();
  UserSession.clearUser();

  const response = await apiJson('/auth/login', {
    method: 'POST',
    body: JSON.stringify({ email, password })
  });

  // Backend returns: { access_token: string, user: object }
  const token = response.access_token;
  const user = response.user;

  if (!token) {
    throw new Error('Invalid response: missing token');
  }

  Auth.setToken(token, rememberMe);
  UserSession.setUser(user, rememberMe);

  // Fetch fresh user data from /users/me to ensure we have the latest
  try {
    const freshUser = await apiJson('/auth/me');
    UserSession.setUser(freshUser, rememberMe);
    return { user: freshUser, token };
  } catch (e) {
    // If /users/me fails, use the login response user
    return { user, token };
  }
}

/**
 * Logout user
 */
function logout() {
  Auth.clearToken();
  UserSession.clearUser();
  window.location.href = '/login.html';
}

/**
 * Fetch current user info (/me endpoint)
 * @returns {Promise<object>} - User object with role and location_id
 */
async function fetchCurrentUser() {
  const user = await apiJson('/auth/me');
  UserSession.setUser(user);
  return user;
}

/**
 * Ensure user is logged in, fetch /me if needed
 * @returns {Promise<object>} - User object
 */
async function ensureAuth() {
  if (!Auth.isLoggedIn()) {
    throw new Error('Not authenticated');
  }

  // Always fetch fresh user data from server to get latest info
  try {
    const freshUser = await fetchCurrentUser();
    return freshUser;
  } catch (error) {
    // If fetch fails, try to use cached user
    let user = UserSession.getUser();
    if (!user) {
      throw new Error('Not authenticated');
    }
    return user;
  }
}

// ============================================
// Role-based Redirect Logic
// ============================================

const AUTH_OWNER_MAIN_LOCATION_ID = '0a71f98e-96a5-4214-9fe9-a09397bf7e87';
const AUTH_OWNER_MAIN_LOCATION_NAME = 'Inshar Main';

/**
 * Handle post-login redirect based on user role
 */
function handleRoleRedirect() {
  const user = UserSession.getUser();
  
  if (!user) {
    window.location.href = '/login.html';
    return;
  }

  if (user.role === 'CASHIER') {
    // Cashier goes to POS
    window.location.href = '/pos.html';
  } else {
    // Owner/Admin go to dashboard
    if (user.role === 'OWNER') {
      localStorage.setItem('selectedLocationId', AUTH_OWNER_MAIN_LOCATION_ID);
      localStorage.setItem('selectedLocationName', AUTH_OWNER_MAIN_LOCATION_NAME);
    }
    window.location.href = '/index.html';
  }
}

/**
 * Check if current page access is allowed
 * Call this on page load
 */
function checkPageAccess() {
  const user = UserSession.getUser();
  const currentPath = window.location.pathname;
  const isPosPage = currentPath.includes('/pos.html');
  const isLoginPage = currentPath.includes('/login.html');

  // If not logged in and not on login page, redirect to login
  if (!Auth.isLoggedIn() && !isLoginPage) {
    window.location.href = '/login.html';
    return false;
  }

  // If logged in and on login page, redirect based on role
  if (Auth.isLoggedIn() && isLoginPage) {
    handleRoleRedirect();
    return false;
  }

  // If user is CASHIER and not on POS page, redirect to POS
  if (UserSession.isCashier() && !isPosPage && !isLoginPage) {
    window.location.href = '/pos.html';
    return false;
  }

  // If user is ADMIN and trying to access POS page, redirect to dashboard
  if (UserSession.isAdmin() && isPosPage) {
    window.location.href = '/index.html';
    return false;
  }

  return true;
}

// ============================================
// Export for use in other files
// ============================================

window.Auth = Auth;
window.UserSession = UserSession;
window.api = api;
window.apiJson = apiJson;
window.login = login;
window.logout = logout;
window.fetchCurrentUser = fetchCurrentUser;
window.ensureAuth = ensureAuth;
window.handleRoleRedirect = handleRoleRedirect;
window.checkPageAccess = checkPageAccess;

/**
 * auth.js - Simple localStorage-based Authentication
 * Manages user sessions and authentication state
 */

export const auth = {
    // Check if user is logged in
    isAuthenticated() {
        const session = localStorage.getItem('fuzio_user_session');
        if (!session) return false;
        
        const user = JSON.parse(session);
        // Check if session is still valid (optional: add expiry)
        return user && user.email;
    },

    // Get current user
    getCurrentUser() {
        const session = localStorage.getItem('fuzio_user_session');
        return session ? JSON.parse(session) : null;
    },

    // Login user
    login(email, password) {
        // Get registered users
        const users = this.getUsers();
        
        // Find matching user
        const user = users.find(u => u.email === email && u.password === password);
        
        if (!user) {
            return { success: false, error: 'Invalid email or password' };
        }

        // Create session
        const session = {
            id: user.id,
            email: user.email,
            name: user.name,
            role: user.role,
            loginTime: new Date().toISOString()
        };

        localStorage.setItem('fuzio_user_session', JSON.stringify(session));
        
        return { success: true, user: session };
    },

    // Register new user (admin only)
    register(userData) {
        const users = this.getUsers();
        
        // Check if email already exists
        if (users.find(u => u.email === userData.email)) {
            return { success: false, error: 'Email already registered' };
        }

        // Create new user
        const newUser = {
            id: this.generateId(),
            email: userData.email,
            password: userData.password,
            name: userData.name,
            role: userData.role || 'viewer',
            createdAt: new Date().toISOString()
        };

        users.push(newUser);
        localStorage.setItem('fuzio_users', JSON.stringify(users));

        return { success: true, user: newUser };
    },

    // Logout
    logout() {
        localStorage.removeItem('fuzio_user_session');
        window.location.href = 'login.html';
    },

    // Get all users
    getUsers() {
        const users = localStorage.getItem('fuzio_users');
        return users ? JSON.parse(users) : [];
    },

    // Update user
    updateUser(userId, updates) {
        const users = this.getUsers();
        const index = users.findIndex(u => u.id === userId);
        
        if (index === -1) {
            return { success: false, error: 'User not found' };
        }

        users[index] = { ...users[index], ...updates };
        localStorage.setItem('fuzio_users', JSON.stringify(users));

        return { success: true, user: users[index] };
    },

    // Delete user
    deleteUser(userId) {
        const users = this.getUsers();
        const filtered = users.filter(u => u.id !== userId);
        localStorage.setItem('fuzio_users', JSON.stringify(filtered));

        return { success: true };
    },

    // Initialize default admin account
    initializeDefaultAdmin() {
        const users = this.getUsers();
        
        // Check if any admin exists
        if (users.some(u => u.role === 'admin')) {
            return;
        }

        // Create default admin
        this.register({
            email: 'admin@fuzio.com',
            password: 'admin123',
            name: 'Administrator',
            role: 'admin'
        });
    },

    // Check if user has permission
    hasPermission(requiredRole) {
        const user = this.getCurrentUser();
        if (!user) return false;

        const roles = {
            'viewer': 1,
            'field_worker': 2,
            'admin': 3
        };

        return roles[user.role] >= roles[requiredRole];
    },

    // Generate unique ID
    generateId() {
        return Date.now().toString(36) + Math.random().toString(36).substr(2);
    },

    // Get user by ID
    getUserById(userId) {
        const users = this.getUsers();
        return users.find(u => u.id === userId);
    },

    // Record user activity
    recordActivity(action, details = {}) {
        const user = this.getCurrentUser();
        if (!user) return;

        const activity = {
            id: this.generateId(),
            userId: user.id,
            userName: user.name,
            action: action,
            details: details,
            timestamp: new Date().toISOString()
        };

        const activities = this.getActivities();
        activities.push(activity);

        // Keep only last 100 activities
        if (activities.length > 100) {
            activities.shift();
        }

        localStorage.setItem('fuzio_activities', JSON.stringify(activities));
    },

    // Get activity log
    getActivities() {
        const activities = localStorage.getItem('fuzio_activities');
        return activities ? JSON.parse(activities) : [];
    }
};

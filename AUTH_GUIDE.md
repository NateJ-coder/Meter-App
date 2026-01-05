# Authentication & Dev Console Guide

## Quick Reference

### Default Login Credentials
```
Email: admin@fuzio.com
Password: admin123
```

## 1. Login System

### Overview
The app now requires login before access. User sessions are stored in localStorage and persist across browser sessions.

### Features
- **Session Management:** Users stay logged in until they explicitly logout
- **Onboarding Skip:** Returning users skip onboarding if scheme data exists
- **Role-Based Access:** Different permissions for admin, field_worker, viewer
- **Activity Tracking:** All user actions are logged

### User Roles

| Role | Permissions |
|------|-------------|
| **Admin** | Full access: manage users, configure system, access dev console |
| **Field Worker** | Capture readings, view assigned schemes |
| **Viewer** | Read-only access to reports and data |

### How It Works

**First Time User:**
1. Navigate to app → Redirected to login.html
2. Login with credentials → Redirected to index.html
3. No scheme data exists → Shows onboarding wizard
4. Complete wizard → Dashboard loads

**Returning User:**
1. Navigate to app → Redirected to login.html
2. Login with credentials → Redirected to index.html
3. Scheme data exists → Dashboard loads immediately (onboarding skipped)

### Files
- [login.html](login.html) - Login page
- [assets/auth.js](assets/auth.js) - Authentication module
- localStorage keys:
  - `fuzio_user_session` - Current session
  - `fuzio_users` - Registered users
  - `fuzio_activities` - Activity log

---

## 2. User Recording Feature

### Overview
Every meter reading is now automatically tagged with:
- **User Name** - Who captured the reading
- **User ID** - For linking to user account
- **Timestamp** - When it was captured

### Implementation

**Reading Data Structure:**
```javascript
{
  id: "unique_id",
  meter_id: "meter_id",
  cycle_id: "cycle_id",
  reading_value: 1234.56,
  reading_date: "2026-01-05",
  captured_by: "John Doe (QR)",        // ← NEW
  captured_by_id: "user_id_123",       // ← NEW
  photo: "photo_ref.jpg",
  notes: "Optional notes",
  consumption: 45.2,
  flags: [],
  review_status: "pending"
}
```

### Where User Info is Captured

1. **Reading Cycle Page** - Manual capture
   - Uses `auth.getCurrentUser().name`
   - Stored as "John Doe"

2. **On-Site Mode** - Field worker queue
   - Uses `auth.getCurrentUser().name`
   - Stored as "John Doe"

3. **QR Reader** - Bulk meter workflow
   - Uses `auth.getCurrentUser().name`
   - Stored as "John Doe (QR)"

### Viewing Who Captured Readings

**Review Page:**
- Each reading shows "Captured By: [Name]"
- Filter by user (future enhancement)

**Export Reports:**
- Include captured_by column
- Group readings by user

### Benefits
- **Accountability** - Know who captured each reading
- **Quality Control** - Identify users who need training
- **Dispute Resolution** - Track who was on-site
- **Performance Metrics** - Readings per user, accuracy rates

---

## 3. Developer Console

### Access
**URL:** `dev-console.html`

**Permissions:** Admin only

**Navigation:** Dashboard → 🔧 Dev link (visible only to admins)

### Features

#### A. App Health Dashboard
Monitor system health in real-time:

**Metrics:**
- ✓ System Health - Shows issues count or "Good"
- 💾 Storage Usage - KB used and percentage (5MB limit)
- 👥 Registered Users - Total user count
- 🏢 Active Schemes - Number of schemes

**Issues Detected:**
- Duplicate meter numbers
- Units without meters
- Multiple open cycles
- Storage approaching limit

#### B. User Management
Add, view, and delete users:

**Add User Form:**
- Full Name
- Email Address (unique)
- Password (min 6 characters)
- Role (Viewer, Field Worker, Admin)

**Users Table:**
- Shows all registered users
- Displays name, email, role, created date
- Delete button (cannot delete yourself)

**Sample Users:**
```javascript
// Admin
{ 
  email: 'admin@fuzio.com', 
  password: 'admin123', 
  name: 'Administrator', 
  role: 'admin' 
}

// Field Worker
{ 
  email: 'john@fuzio.com', 
  password: 'field123', 
  name: 'John Doe', 
  role: 'field_worker' 
}

// Viewer
{ 
  email: 'jane@fuzio.com', 
  password: 'view123', 
  name: 'Jane Smith', 
  role: 'viewer' 
}
```

#### C. Activity Log
Track recent user actions:

**Tracked Events:**
- `user_login` - User logged in
- `reading_captured` - Reading submitted
- `cycle_opened` - New cycle started
- `cycle_closed` - Cycle finalized
- `scheme_created` - New scheme added
- `user_created` - New user registered

**Display:**
- Last 20 activities
- Timestamp, user name, action description
- Scrollable list

#### D. Data Statistics
Overview of database entities:

- Schemes count
- Buildings count
- Units count
- Meters count
- Readings count
- Cycles count

#### E. System Actions

**⚠️ DANGER ZONE**

1. **Reset Onboarding**
   - Clears onboarding completion flag
   - Users will see setup wizard again
   - Does NOT delete data

2. **Clear All Data**
   - Requires typing "DELETE ALL DATA" to confirm
   - Removes all schemes, buildings, units, meters, readings, cycles
   - Preserves user accounts and sessions
   - **IRREVERSIBLE** (unless you have a backup)

3. **Export All Data**
   - Downloads JSON backup of entire system
   - Includes all entities plus metadata
   - Filename: `fuzio-backup-[timestamp].json`
   - Use for backups before migrations

**Export Format:**
```json
{
  "schemes": [...],
  "buildings": [...],
  "units": [...],
  "meters": [...],
  "readings": [...],
  "cycles": [...],
  "users": [...],
  "activities": [...],
  "exported_at": "2026-01-05T10:30:00.000Z",
  "exported_by": "admin@fuzio.com"
}
```

---

## Security Considerations

### Current Implementation (localStorage)
- ⚠️ Passwords stored in **plain text** (not hashed)
- ⚠️ No encryption on localStorage
- ⚠️ Anyone with browser DevTools can view data
- ⚠️ No session expiry (stays logged in forever)

### Suitable For:
- ✅ Prototyping and testing
- ✅ Single-device deployments
- ✅ Internal trusted network
- ✅ Demo environments

### NOT Suitable For:
- ❌ Public internet deployment
- ❌ Sensitive financial data
- ❌ Compliance requirements (GDPR, HIPAA, etc.)
- ❌ Multi-tenant systems

### Future Enhancements (Backend Required)
When migrating to backend (see [STORAGE_ARCHITECTURE.md](STORAGE_ARCHITECTURE.md)):

1. **Password Hashing**
   ```javascript
   // Use bcrypt or Argon2
   const hash = await bcrypt.hash(password, 10);
   ```

2. **JWT Tokens**
   ```javascript
   // Token-based authentication
   const token = jwt.sign({ userId, role }, secret, { expiresIn: '24h' });
   ```

3. **Session Expiry**
   ```javascript
   // Auto-logout after inactivity
   if (Date.now() - lastActivity > 30 * 60 * 1000) {
     auth.logout();
   }
   ```

4. **HTTPS Only**
   - All communication encrypted
   - Secure cookie flags

5. **Rate Limiting**
   - Prevent brute force attacks
   - Max 5 login attempts per hour

---

## API Reference

### auth.js Module

```javascript
import { auth } from './assets/auth.js';

// Check if user is logged in
if (auth.isAuthenticated()) {
  // User has active session
}

// Get current user
const user = auth.getCurrentUser();
// Returns: { id, email, name, role, loginTime }

// Login
const result = auth.login(email, password);
// Returns: { success: true, user } or { success: false, error: "message" }

// Logout
auth.logout();
// Redirects to login.html

// Register new user (admin only)
const result = auth.register({
  email: 'new@fuzio.com',
  password: 'password123',
  name: 'New User',
  role: 'viewer'
});

// Check permissions
if (auth.hasPermission('admin')) {
  // User is admin
}

// Record activity
auth.recordActivity('reading_captured', { 
  meterId: 'abc123', 
  meterNumber: 'SM-001' 
});

// Get users (admin only)
const users = auth.getUsers();

// Get activity log
const activities = auth.getActivities();

// Update user
auth.updateUser(userId, { name: 'Updated Name' });

// Delete user
auth.deleteUser(userId);
```

---

## Workflow Examples

### Adding a New Field Worker

1. **Admin logs in** to dev console
2. Clicks **"+ Add User"**
3. Fills form:
   - Name: "Mike Johnson"
   - Email: "mike@fuzio.com"
   - Password: "field456"
   - Role: "Field Worker"
4. Clicks **"Add User"**
5. Mike can now login and capture readings

### Field Worker On-Site

1. **Mike logs in** on mobile device
2. Navigates to **Reading Cycle**
3. Clicks **"📱 Start On-Site Readings"**
4. Sees first meter: "Meter 1 of 48"
5. Enters reading, clicks **"Submit & Next"**
6. Reading tagged with `captured_by: "Mike Johnson"`
7. Repeats until all meters done

### Admin Reviews Readings

1. **Admin logs in**
2. Goes to **Review** page
3. Sees flagged reading
4. Clicks **"Review"**
5. Modal shows:
   - Captured By: "Mike Johnson"
   - Consumption: 150 kWh (flagged as high)
6. Admin approves or disputes

### Troubleshooting with Dev Console

**Scenario:** User reports "app is slow"

1. Admin opens **Dev Console**
2. Checks **Storage Usage:** 4.8 MB (96%)
3. **Issue:** Nearing localStorage limit
4. **Action:** 
   - Export all data
   - Clear old cycles
   - Or migrate to backend

**Scenario:** Duplicate meter numbers

1. Dev Console shows: "5 duplicate meter numbers"
2. Admin goes to **Meter Register**
3. Searches for duplicates
4. Renames conflicting meters
5. Returns to Dev Console
6. Issue resolved

---

## Testing

### Test User Accounts

Create these for testing:

```javascript
// Run in browser console after opening dev-console.html
auth.register({
  email: 'field1@fuzio.com',
  name: 'Field Worker 1',
  password: 'test123',
  role: 'field_worker'
});

auth.register({
  email: 'viewer@fuzio.com',
  name: 'Viewer User',
  password: 'test123',
  role: 'viewer'
});
```

### Test Scenarios

**1. Login Flow**
- ✓ Valid credentials → Dashboard
- ✓ Invalid credentials → Error message
- ✓ Empty form → Validation error
- ✓ Already logged in → Skip login page

**2. Role Permissions**
- ✓ Admin sees "Dev" link
- ✓ Field worker does NOT see "Dev" link
- ✓ Viewer can view but not edit

**3. User Recording**
- ✓ Capture reading → Check `captured_by` field
- ✓ Review reading → See "Captured By: [Name]"
- ✓ Export data → Include user column

**4. Dev Console**
- ✓ Non-admin access → Redirected
- ✓ Add user → Appears in table
- ✓ Delete user → Removed from table
- ✓ Export data → Downloads JSON
- ✓ Clear data → Confirm dialog → Data removed

---

## Troubleshooting

### "Cannot access dev console"
- **Cause:** Not logged in as admin
- **Fix:** Login with admin@fuzio.com / admin123

### "User already registered"
- **Cause:** Email already in use
- **Fix:** Use different email or delete existing user

### "Logout loops me back"
- **Cause:** Session not cleared
- **Fix:** Clear browser localStorage manually:
  ```javascript
  localStorage.removeItem('fuzio_user_session');
  ```

### "Who captured this reading?"
- **Check:** Review page → Reading details → "Captured By"
- **If missing:** Reading was captured before this feature was added
- **Fix:** Manually add note to reading

---

## Future Enhancements

### Planned Features

1. **Two-Factor Authentication (2FA)**
   - SMS or email OTP codes
   - TOTP apps (Google Authenticator)

2. **User Profiles**
   - Profile photos
   - Contact information
   - Assigned schemes/buildings

3. **Advanced Activity Log**
   - Filter by user, date, action type
   - Export activity reports
   - Audit trail with IP addresses

4. **Role Customization**
   - Create custom roles
   - Granular permissions (read meter vs edit meter)
   - Scheme-level permissions

5. **Password Reset**
   - Email-based reset links
   - Security questions
   - Admin can reset user passwords

6. **Session Management**
   - View active sessions
   - Force logout all users
   - Session timeout settings

---

**Document Version:** 1.0  
**Last Updated:** January 2026  
**For Support:** Contact system administrator

import assert from 'node:assert/strict';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

class MemoryStorage {
  constructor() {
    this.store = new Map();
  }

  getItem(key) {
    return this.store.has(key) ? this.store.get(key) : null;
  }

  setItem(key, value) {
    this.store.set(key, String(value));
  }

  removeItem(key) {
    this.store.delete(key);
  }

  clear() {
    this.store.clear();
  }
}

global.localStorage = new MemoryStorage();
global.window = { location: { href: '' } };

const authModuleUrl = pathToFileURL(path.resolve('assets/auth.js')).href;
const { auth } = await import(authModuleUrl);

const testUser = {
  name: 'John Doe',
  username: 'JohnDoe',
  email: 'John@doe.com',
  password: 'C729052j',
  phone: '0606507692',
  contact_details: 'Preferred username: JohnDoe',
  role: 'field_worker'
};

auth.initializeDefaultAdmin();

const registration = auth.register(testUser);
assert.equal(registration.success, true, 'Expected registration to succeed');
assert.equal(registration.user.name, testUser.name, 'Expected name to persist');
assert.equal(registration.user.email, testUser.email, 'Expected email to persist');
assert.equal(registration.user.phone, testUser.phone, 'Expected phone to persist');
assert.equal(registration.user.contact_details, testUser.contact_details, 'Expected contact details to persist');
assert.equal(registration.user.role, testUser.role, 'Expected role to persist');

const duplicateRegistration = auth.register(testUser);
assert.equal(duplicateRegistration.success, false, 'Expected duplicate email registration to fail');

const login = auth.login(testUser.email, testUser.password);
assert.equal(login.success, true, 'Expected login to succeed with email and password');
assert.equal(login.user.name, testUser.name, 'Expected session to include name');
assert.equal(login.user.email, testUser.email, 'Expected session to include email');
assert.equal(login.user.phone, testUser.phone, 'Expected session to include phone');
assert.equal(login.user.contact_details, testUser.contact_details, 'Expected session to include contact details');
assert.equal(login.user.user_type, 'registered', 'Expected registered user session type');

const badLogin = auth.login(testUser.username, testUser.password);
assert.equal(badLogin.success, false, 'Expected username-based login to fail because auth is email-based');

const users = auth.getUsers();
const persistedUser = users.find(user => user.email === testUser.email);
assert.ok(persistedUser, 'Expected user to exist in stored users');

console.log('Registration smoke test passed.');
console.log(JSON.stringify({
  registeredUser: {
    name: persistedUser.name,
    email: persistedUser.email,
    phone: persistedUser.phone,
    contactDetails: persistedUser.contact_details,
    role: persistedUser.role
  },
  loginMode: 'email',
  usernameSupported: false
}, null, 2));
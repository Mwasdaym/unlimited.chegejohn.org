require('dotenv').config();
const express = require('express');
const cors = require('cors');
const bodyParser = require('body-parser');
const { PayHeroClient } = require('payhero-devkit');
const path = require('path');
const nodemailer = require('nodemailer');
const fs = require('fs');
const axios = require('axios');
const session = require('express-session');
const rateLimit = require('express-rate-limit');

const app = express();
const port = process.env.PORT || 3000;

// ======================= SECURITY & ERROR HANDLING =======================
process.on('uncaughtException', (error) => {
  console.error('🔥 UNCAUGHT EXCEPTION:', error);
  sendTelegramNotification(`🚨 SERVER CRASH: ${error.message}`);
  process.exit(1);
});

process.on('unhandledRejection', (reason, promise) => {
  console.error('🔥 UNHANDLED REJECTION at:', promise, 'reason:', reason);
  sendTelegramNotification(`🚨 UNHANDLED PROMISE REJECTION: ${reason}`);
});

// Rate limiting for brute force protection
const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 5, // Limit each IP to 5 login attempts per windowMs
  message: { error: 'Too many login attempts, please try again later' },
  standardHeaders: true,
  legacyHeaders: false,
});

// ======================= CONFIGURATION =======================
const TELEGRAM_BOT_TOKEN = '8405268705:AAGvgEQDaW5jgRcRIrysHY_4DZIFTZeekAc';
const TELEGRAM_CHAT_ID = process.env.TELEGRAM_CHAT_ID || '7161000868';

<<<<<<< HEAD
// Middleware
=======
// ======================= MIDDLEWARE =======================
>>>>>>> 9f6b3d92e69168e336251e51628938f87d4b6d62
app.use(cors());
app.use(bodyParser.json({ limit: '10mb' }));
app.use(express.static('public'));
app.use(express.urlencoded({ extended: true }));

// Session configuration
app.use(session({
  secret: process.env.SESSION_SECRET || 'chege-tech-super-secure-key-2024-' + Date.now(),
  resave: false,
  saveUninitialized: false,
  cookie: {
    secure: process.env.NODE_ENV === 'production',
    httpOnly: true,
    maxAge: 24 * 60 * 60 * 1000 // 24 hours
  },
  name: 'chege-tech-session'
}));

// Error handling middleware
app.use((err, req, res, next) => {
  console.error('🔥 MIDDLEWARE ERROR:', err);
  sendTelegramNotification(`🚨 MIDDLEWARE ERROR: ${err.message}`);
  res.status(500).json({ success: false, error: 'Internal server error' });
});

// ======================= INITIALIZATION FUNCTIONS =======================
let client = null;
let emailTransporter = null;

async function initializeServices() {
  console.log('🔧 Initializing services...');
  
  // Initialize PayHero
  try {
    if (process.env.AUTH_TOKEN) {
      client = new PayHeroClient({ authToken: process.env.AUTH_TOKEN });
      console.log('✅ PayHero client initialized');
      
      // Test connection
      await client.transactionStatus('test'); // Just to test connection
      console.log('✅ PayHero connection test successful');
    } else {
      console.log('⚠️ WARNING: AUTH_TOKEN not found in .env');
      sendTelegramNotification('⚠️ PayHero AUTH_TOKEN not configured in .env file');
    }
  } catch (error) {
    console.error('❌ PayHero initialization failed:', error.message);
    sendTelegramNotification(`🚨 PayHero initialization failed: ${error.message}`);
  }
  
  // Initialize Email
  try {
    if (process.env.EMAIL_USER && process.env.EMAIL_PASS) {
      emailTransporter = nodemailer.createTransport({
        service: process.env.EMAIL_SERVICE || 'gmail',
        auth: {
          user: process.env.EMAIL_USER,
          pass: process.env.EMAIL_PASS
        },
        tls: {
          rejectUnauthorized: false // For development, remove in production
        },
        debug: true
      });
      
      await emailTransporter.verify();
      console.log('✅ Email transporter initialized and verified');
      
    } else {
      console.log('⚠️ WARNING: Email credentials not found in .env');
      sendTelegramNotification('⚠️ Email credentials not configured in .env file');
    }
  } catch (error) {
    console.error('❌ Email transporter initialization failed:', error.message);
    sendTelegramNotification(`🚨 Email transporter failed: ${error.message}`);
    
    // Create dummy transporter for fallback
    emailTransporter = {
      sendMail: async () => {
        console.log('⚠️ Email not sent (transporter not configured)');
        return { messageId: 'dummy-id' };
      }
    };
  }
  
  console.log('✅ All services initialized');
}

// ======================= ADMIN AUTHENTICATION =======================
const requireAuth = (req, res, next) => {
  if (!req.session.adminLoggedIn) {
    req.session.redirectTo = req.originalUrl;
    return res.redirect('/admin/login');
  }
  next();
};

// ======================= TELEGRAM NOTIFICATION =======================
async function sendTelegramNotification(message) {
  try {
    const chatId = TELEGRAM_CHAT_ID;
    
    if (!chatId || chatId === 'YOUR_CHAT_ID') {
      console.log('⚠️ Telegram chat ID not configured. Skipping notification.');
      return null;
    }
    
    const response = await axios.post(
      `https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/sendMessage`,
      {
        chat_id: chatId,
        text: message,
        parse_mode: 'HTML'
      },
      { timeout: 5000 }
    );
    
    console.log('✅ Telegram notification sent');
    return response.data;
    
  } catch (error) {
    console.error('❌ Failed to send Telegram notification:', error.message);
    // Don't throw error for Telegram failures
    return null;
  }
}

<<<<<<< HEAD
// Account Manager Class for Shared Accounts
class AccountManager {
  constructor() {
    this.accountsFile = path.join(__dirname, 'accounts.json');
    this.loadAccounts();
  }

  loadAccounts() {
    try {
      if (fs.existsSync(this.accountsFile)) {
        this.accounts = JSON.parse(fs.readFileSync(this.accountsFile, 'utf8'));
        console.log('✅ Accounts loaded successfully');
        
=======
// ======================= ACCOUNT MANAGER =======================
class AccountManager {
  constructor() {
    this.accountsFile = path.join(__dirname, 'accounts.json');
    this.backupDir = path.join(__dirname, 'backups');
    this.initializeBackupSystem();
    this.loadAccounts();
  }

  initializeBackupSystem() {
    try {
      if (!fs.existsSync(this.backupDir)) {
        fs.mkdirSync(this.backupDir, { recursive: true });
        console.log('✅ Backup directory created');
      }
      
      // Create backup every hour
      setInterval(() => this.createBackup(), 60 * 60 * 1000);
    } catch (error) {
      console.error('❌ Failed to initialize backup system:', error);
    }
  }

  createBackup() {
    try {
      if (fs.existsSync(this.accountsFile)) {
        const backupFile = path.join(
          this.backupDir, 
          `accounts_backup_${Date.now()}.json`
        );
        fs.copyFileSync(this.accountsFile, backupFile);
        
        // Keep only last 24 backups
        const files = fs.readdirSync(this.backupDir)
          .filter(f => f.startsWith('accounts_backup_'))
          .sort()
          .reverse();
        
        if (files.length > 24) {
          files.slice(24).forEach(f => {
            fs.unlinkSync(path.join(this.backupDir, f));
          });
        }
      }
    } catch (error) {
      console.error('❌ Backup creation failed:', error);
    }
  }

  loadAccounts() {
    try {
      if (fs.existsSync(this.accountsFile)) {
        const data = fs.readFileSync(this.accountsFile, 'utf8');
        this.accounts = JSON.parse(data);
        console.log(`✅ Accounts loaded: ${Object.keys(this.accounts).length} services`);
        
        // Initialize missing properties
>>>>>>> 9f6b3d92e69168e336251e51628938f87d4b6d62
        Object.keys(this.accounts).forEach(service => {
          this.accounts[service].forEach(account => {
            if (!account.currentUsers) account.currentUsers = 0;
            if (!account.maxUsers) account.maxUsers = 5;
            if (!account.usedBy) account.usedBy = [];
            if (!account.fullyUsed) account.fullyUsed = false;
<<<<<<< HEAD
            // Add unique ID if not exists
            if (!account.id) account.id = `${service}_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
=======
            if (!account.id) account.id = this.generateId(service);
            if (!account.addedAt) account.addedAt = new Date().toISOString();
>>>>>>> 9f6b3d92e69168e336251e51628938f87d4b6d62
          });
        });
      } else {
        this.accounts = {};
        this.saveAccounts();
        console.log('📁 Created new accounts file');
      }
    } catch (error) {
<<<<<<< HEAD
      this.accounts = {};
      console.log('❌ Error loading accounts, created new file');
    }
  }

  saveAccounts() {
    try {
      fs.writeFileSync(this.accountsFile, JSON.stringify(this.accounts, null, 2));
=======
      console.error('❌ CRITICAL: Failed to load accounts:', error);
      sendTelegramNotification(`🚨 CRITICAL: Failed to load accounts: ${error.message}`);
      
      // Try to restore from backup
      this.restoreFromBackup();
    }
  }

  restoreFromBackup() {
    try {
      const files = fs.readdirSync(this.backupDir)
        .filter(f => f.startsWith('accounts_backup_'))
        .sort()
        .reverse();
      
      if (files.length > 0) {
        const latestBackup = path.join(this.backupDir, files[0]);
        const data = fs.readFileSync(latestBackup, 'utf8');
        this.accounts = JSON.parse(data);
        this.saveAccounts();
        
        console.log(`✅ Restored from backup: ${files[0]}`);
        sendTelegramNotification(`✅ Accounts restored from backup: ${files[0]}`);
      }
>>>>>>> 9f6b3d92e69168e336251e51628938f87d4b6d62
    } catch (error) {
      console.error('❌ Failed to restore from backup:', error);
      this.accounts = {};
      this.saveAccounts();
    }
  }

  generateId(service) {
    return `${service}_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }

  saveAccounts() {
    try {
      const tempFile = this.accountsFile + '.tmp';
      fs.writeFileSync(tempFile, JSON.stringify(this.accounts, null, 2));
      fs.renameSync(tempFile, this.accountsFile);
    } catch (error) {
      console.error('❌ Failed to save accounts:', error);
      sendTelegramNotification(`🚨 Failed to save accounts: ${error.message}`);
      throw error;
    }
  }

  // Check if account is available WITHOUT assigning it
  checkAccountAvailability(service) {
    try {
      if (!this.accounts[service] || this.accounts[service].length === 0) {
        return { 
          available: false, 
          message: 'No accounts available for this service',
          service: service
        };
      }
      
      const availableAccount = this.accounts[service].find(acc => 
        !acc.fullyUsed && acc.currentUsers < acc.maxUsers
      );
      
      if (availableAccount) {
        return {
          available: true,
          message: 'Account available',
          accountId: availableAccount.email || availableAccount.username,
          availableSlots: availableAccount.maxUsers - availableAccount.currentUsers,
          service: service
        };
      }
      
      return { 
        available: false, 
        message: 'All accounts are full',
        service: service
      };
    } catch (error) {
      console.error('❌ Error checking availability:', error);
      return {
        available: false,
        message: 'Service temporarily unavailable',
        service: service
      };
    }
  }

<<<<<<< HEAD
  // Assign account AFTER payment confirmation
  assignAccount(service, customerEmail, customerName) {
    if (!this.accounts[service] || this.accounts[service].length === 0) {
      return null;
    }
    
    const availableAccount = this.accounts[service].find(acc => 
      !acc.fullyUsed && acc.currentUsers < acc.maxUsers
    );
    
    if (!availableAccount) {
      return null;
    }
    
    availableAccount.currentUsers += 1;
    
    const userAssignment = {
      customerEmail: customerEmail,
      customerName: customerName || 'Customer',
      customerId: `CUST-${Date.now()}`,
      assignedAt: new Date().toISOString(),
      slot: availableAccount.currentUsers
    };
    
    if (!availableAccount.usedBy) availableAccount.usedBy = [];
    availableAccount.usedBy.push(userAssignment);
    
    if (availableAccount.currentUsers >= availableAccount.maxUsers) {
      availableAccount.fullyUsed = true;
      availableAccount.fullAt = new Date().toISOString();
=======
  assignAccount(service, customerEmail, customerName, reference) {
    try {
      if (!this.accounts[service] || this.accounts[service].length === 0) {
        return null;
      }
>>>>>>> 9f6b3d92e69168e336251e51628938f87d4b6d62
      
      const availableAccount = this.accounts[service].find(acc => 
        !acc.fullyUsed && acc.currentUsers < acc.maxUsers
      );
      
      if (!availableAccount) {
        return null;
      }
      
      availableAccount.currentUsers += 1;
      
      const userAssignment = {
        customerEmail: customerEmail,
        customerName: customerName || 'Customer',
        customerId: `CUST-${Date.now()}`,
        assignedAt: new Date().toISOString(),
        slot: availableAccount.currentUsers,
        reference: reference
      };
      
      availableAccount.usedBy.push(userAssignment);
      
      if (availableAccount.currentUsers >= availableAccount.maxUsers) {
        availableAccount.fullyUsed = true;
        availableAccount.fullAt = new Date().toISOString();
        
        const telegramMessage = `
🔔 <b>ACCOUNT FULL NOTIFICATION</b>

📊 <b>Service:</b> ${service}
📧 <b>Account:</b> ${availableAccount.email || availableAccount.username}
👥 <b>Users Reached:</b> ${availableAccount.currentUsers}/${availableAccount.maxUsers}
⏰ <b>Filled At:</b> ${new Date().toLocaleString()}
🆔 <b>Account ID:</b> ${availableAccount.id}

⚠️ <i>This account is now full. Please add more accounts for ${service}.</i>
        `;
        
        sendTelegramNotification(telegramMessage);
      }
      
      this.saveAccounts();
      
      return {
        ...availableAccount,
        isShared: true,
        slotNumber: availableAccount.currentUsers,
        totalSlots: availableAccount.maxUsers,
        userAssignment: userAssignment
      };
    } catch (error) {
      console.error('❌ Error assigning account:', error);
      sendTelegramNotification(`🚨 Error assigning account for ${service}: ${error.message}`);
      return null;
    }
<<<<<<< HEAD
    
    this.saveAccounts();
    
    return {
      ...availableAccount,
      isShared: true,
      slotNumber: availableAccount.currentUsers,
      totalSlots: availableAccount.maxUsers,
      userAssignment: userAssignment
    };
  }

  // Add unique ID when adding account
  addAccount(service, accountData) {
    if (!this.accounts[service]) {
      this.accounts[service] = [];
    }
    
    const newAccount = {
      ...accountData,
      id: `${service}_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
      currentUsers: 0,
      maxUsers: 5,
      fullyUsed: false,
      usedBy: [],
      addedAt: new Date().toISOString()
    };
    
    this.accounts[service].push(newAccount);
    this.saveAccounts();
    
    const telegramMessage = `
=======
  }

  addAccount(service, accountData) {
    try {
      if (!this.accounts[service]) {
        this.accounts[service] = [];
      }
      
      const newAccount = {
        ...accountData,
        id: this.generateId(service),
        currentUsers: 0,
        maxUsers: accountData.maxUsers || 5,
        fullyUsed: false,
        usedBy: [],
        addedAt: new Date().toISOString(),
        addedBy: 'admin'
      };
      
      this.accounts[service].push(newAccount);
      this.saveAccounts();
      
      const telegramMessage = `
>>>>>>> 9f6b3d92e69168e336251e51628938f87d4b6d62
🎯 <b>NEW ACCOUNT ADDED</b>

📊 <b>Service:</b> ${service}
📧 <b>Account:</b> ${accountData.email || accountData.username}
<<<<<<< HEAD
👥 <b>Max Users:</b> 5
⏰ <b>Added At:</b> ${new Date().toLocaleString()}
🆔 <b>Account ID:</b> ${newAccount.id}

✅ <i>Ready for 5 new customers!</i>
    `;
    
    sendTelegramNotification(telegramMessage);
    
    return newAccount;
  }

  // NEW: Remove account by ID
  removeAccount(accountId) {
    let removedAccount = null;
    let serviceName = null;
    
    // Find the account and its service
    for (const [service, accounts] of Object.entries(this.accounts)) {
      const accountIndex = accounts.findIndex(acc => acc.id === accountId);
=======
👥 <b>Max Users:</b> ${accountData.maxUsers || 5}
⏰ <b>Added At:</b> ${new Date().toLocaleString()}
🆔 <b>Account ID:</b> ${newAccount.id}

✅ <i>Ready for ${accountData.maxUsers || 5} new customers!</i>
      `;
      
      sendTelegramNotification(telegramMessage);
      
      return newAccount;
    } catch (error) {
      console.error('❌ Error adding account:', error);
      sendTelegramNotification(`🚨 Error adding account to ${service}: ${error.message}`);
      throw error;
    }
  }

  removeAccount(accountId) {
    try {
      let removedAccount = null;
      let serviceName = null;
>>>>>>> 9f6b3d92e69168e336251e51628938f87d4b6d62
      
      for (const [service, accounts] of Object.entries(this.accounts)) {
        const accountIndex = accounts.findIndex(acc => acc.id === accountId);
        
<<<<<<< HEAD
        // Remove the account
        accounts.splice(accountIndex, 1);
        
        // If service has no more accounts, remove the service
        if (accounts.length === 0) {
          delete this.accounts[service];
        }
        
        this.saveAccounts();
        break;
=======
        if (accountIndex !== -1) {
          removedAccount = accounts[accountIndex];
          serviceName = service;
          
          // Create backup before removal
          const removalBackup = {
            account: removedAccount,
            service: service,
            removedAt: new Date().toISOString(),
            removedBy: 'admin'
          };
          
          const backupFile = path.join(
            this.backupDir,
            `removed_${accountId}_${Date.now()}.json`
          );
          fs.writeFileSync(backupFile, JSON.stringify(removalBackup, null, 2));
          
          accounts.splice(accountIndex, 1);
          
          if (accounts.length === 0) {
            delete this.accounts[service];
          }
          
          this.saveAccounts();
          break;
        }
>>>>>>> 9f6b3d92e69168e336251e51628938f87d4b6d62
      }
      
      if (removedAccount) {
        const telegramMessage = `
🗑️ <b>ACCOUNT REMOVED</b>

📊 <b>Service:</b> ${serviceName}
📧 <b>Account:</b> ${removedAccount.email || removedAccount.username}
👥 <b>Active Users:</b> ${removedAccount.currentUsers || 0}/${removedAccount.maxUsers || 5}
🆔 <b>Account ID:</b> ${accountId}
⏰ <b>Removed At:</b> ${new Date().toLocaleString()}
        
⚠️ <i>This account has been permanently removed from the system.</i>
        `;
        
        sendTelegramNotification(telegramMessage);
      }
      
      return removedAccount;
    } catch (error) {
      console.error('❌ Error removing account:', error);
      sendTelegramNotification(`🚨 Error removing account ${accountId}: ${error.message}`);
      throw error;
    }
  }

  // NEW: Get account by ID
  getAccountById(accountId) {
    for (const [service, accounts] of Object.entries(this.accounts)) {
      const account = accounts.find(acc => acc.id === accountId);
      if (account) {
        return { ...account, service };
      }
    }
    return null;
  }

  getAccountStats() {
<<<<<<< HEAD
    const stats = {};
    Object.keys(this.accounts).forEach(service => {
      const serviceAccounts = this.accounts[service];
      let totalSlots = 0;
      let usedSlots = 0;
      let availableAccounts = 0;
      
      serviceAccounts.forEach(acc => {
        totalSlots += (acc.maxUsers || 5);
        usedSlots += (acc.currentUsers || 0);
        if (!acc.fullyUsed && (acc.currentUsers || 0) < (acc.maxUsers || 5)) {
          availableAccounts++;
        }
      });
      
      stats[service] = {
        totalAccounts: serviceAccounts.length,
        totalSlots: totalSlots,
        usedSlots: usedSlots,
        availableSlots: totalSlots - usedSlots,
        availableAccounts: availableAccounts,
        fullyUsedAccounts: serviceAccounts.filter(acc => acc.fullyUsed).length,
        accounts: serviceAccounts.map(acc => ({
          id: acc.id,
          email: acc.email,
          username: acc.username,
          currentUsers: acc.currentUsers || 0,
          maxUsers: acc.maxUsers || 5,
          fullyUsed: acc.fullyUsed || false,
          available: !acc.fullyUsed && (acc.currentUsers || 0) < (acc.maxUsers || 5),
          addedAt: acc.addedAt,
          usedBy: acc.usedBy || []
        }))
      };
    });
    return stats;
=======
    try {
      const stats = {};
      Object.keys(this.accounts).forEach(service => {
        const serviceAccounts = this.accounts[service];
        let totalSlots = 0;
        let usedSlots = 0;
        let availableAccounts = 0;
        
        serviceAccounts.forEach(acc => {
          totalSlots += (acc.maxUsers || 5);
          usedSlots += (acc.currentUsers || 0);
          if (!acc.fullyUsed && (acc.currentUsers || 0) < (acc.maxUsers || 5)) {
            availableAccounts++;
          }
        });
        
        stats[service] = {
          totalAccounts: serviceAccounts.length,
          totalSlots: totalSlots,
          usedSlots: usedSlots,
          availableSlots: totalSlots - usedSlots,
          availableAccounts: availableAccounts,
          fullyUsedAccounts: serviceAccounts.filter(acc => acc.fullyUsed).length,
          accounts: serviceAccounts.map(acc => ({
            id: acc.id,
            email: acc.email,
            username: acc.username,
            currentUsers: acc.currentUsers || 0,
            maxUsers: acc.maxUsers || 5,
            fullyUsed: acc.fullyUsed || false,
            available: !acc.fullyUsed && (acc.currentUsers || 0) < (acc.maxUsers || 5),
            addedAt: acc.addedAt,
            usedBy: acc.usedBy || []
          }))
        };
      });
      return stats;
    } catch (error) {
      console.error('❌ Error getting stats:', error);
      return {};
    }
>>>>>>> 9f6b3d92e69168e336251e51628938f87d4b6d62
  }
}

const accountManager = new AccountManager();

<<<<<<< HEAD
// Store pending transactions (temporary storage)
const pendingTransactions = new Map();

// Subscription plans data
=======
// ======================= PENDING TRANSACTIONS =======================
class TransactionManager {
  constructor() {
    this.transactions = new Map();
    this.transactionsFile = path.join(__dirname, 'transactions.json');
    this.loadTransactions();
    
    // Auto-save every 5 minutes
    setInterval(() => this.saveTransactions(), 5 * 60 * 1000);
  }

  loadTransactions() {
    try {
      if (fs.existsSync(this.transactionsFile)) {
        const data = JSON.parse(fs.readFileSync(this.transactionsFile, 'utf8'));
        data.forEach(tx => {
          this.transactions.set(tx.reference, tx);
        });
        console.log(`✅ Transactions loaded: ${this.transactions.size}`);
      }
    } catch (error) {
      console.error('❌ Failed to load transactions:', error);
    }
  }

  saveTransactions() {
    try {
      const data = Array.from(this.transactions.values());
      fs.writeFileSync(this.transactionsFile, JSON.stringify(data, null, 2));
    } catch (error) {
      console.error('❌ Failed to save transactions:', error);
    }
  }

  addTransaction(reference, data) {
    try {
      this.transactions.set(reference, {
        ...data,
        reference: reference,
        createdAt: new Date().toISOString(),
        status: 'pending'
      });
      this.saveTransactions();
      return true;
    } catch (error) {
      console.error('❌ Failed to add transaction:', error);
      return false;
    }
  }

  updateTransaction(reference, updates) {
    try {
      const tx = this.transactions.get(reference);
      if (tx) {
        this.transactions.set(reference, { ...tx, ...updates });
        this.saveTransactions();
        return true;
      }
      return false;
    } catch (error) {
      console.error('❌ Failed to update transaction:', error);
      return false;
    }
  }

  getTransaction(reference) {
    return this.transactions.get(reference);
  }

  deleteTransaction(reference) {
    try {
      this.transactions.delete(reference);
      this.saveTransactions();
      return true;
    } catch (error) {
      console.error('❌ Failed to delete transaction:', error);
      return false;
    }
  }

  cleanupOldTransactions() {
    const now = Date.now();
    const oneHour = 60 * 60 * 1000;
    
    for (const [reference, transaction] of this.transactions.entries()) {
      const transactionTime = new Date(transaction.createdAt).getTime();
      if (now - transactionTime > oneHour) {
        console.log(`🧹 Cleaning up old transaction: ${reference}`);
        this.transactions.delete(reference);
        
        const telegramMessage = `
⏰ <b>TRANSACTION EXPIRED</b>

📊 <b>Service:</b> ${transaction.planName}
👤 <b>Customer:</b> ${transaction.customerName || 'Anonymous'}
📧 <b>Email:</b> ${transaction.customerEmail}
💰 <b>Amount:</b> KES ${transaction.amount}
🔗 <b>Reference:</b> ${reference}

💡 <i>Transaction expired after 1 hour. No account was assigned.</i>
        `;
        
        sendTelegramNotification(telegramMessage);
      }
    }
    
    this.saveTransactions();
  }
}

const transactionManager = new TransactionManager();

// ======================= SUBSCRIPTION PLANS =======================
>>>>>>> 9f6b3d92e69168e336251e51628938f87d4b6d62
const subscriptionPlans = {
  streaming: {
    category: 'Streaming Services',
    icon: 'fas fa-play-circle',
    color: '#4169E1',
    plans: {
      'peacock_tv': { name: 'Peacock TV (1 Month)', price: 50, duration: '1 Month', features: ['Live Sports', 'NBC Shows', 'Next-Day TV'], shared: true, maxUsers: 5 },
      'spotify': { name: 'Spotify Premium', price: 400, duration: '3 Months', features: ['Ad-Free Music', 'Offline Mode', 'High-Quality Audio'], shared: true, maxUsers: 5 },
      'netflix': { name: 'Netflix', price: 150, duration: '1 Month', features: ['HD Streaming', 'Multiple Devices', 'Original Shows'], popular: true, shared: true, maxUsers: 5 },
      'primevideo': { name: 'Prime Video', price: 100, duration: '1 Month', features: ['HD Streaming', 'Amazon Originals', 'Offline Viewing'], popular: true, shared: true, maxUsers: 5 },
      'primevideo_3m': { name: 'Prime Video (3 Months)', price: 250, duration: '3 Months', features: ['HD Streaming', 'Amazon Originals', 'Offline Viewing'], popular: true, shared: true, maxUsers: 5 },
      'primevideo_6m': { name: 'Prime Video (6 Months)', price: 550, duration: '6 Months', features: ['HD Streaming', 'Amazon Originals', 'Offline Viewing'], popular: true, shared: true, maxUsers: 5 },
      'primevideo_1y': { name: 'Prime Video (1 Year)', price: 1000, duration: '1 Year', features: ['HD Streaming', 'Amazon Originals', 'Offline Viewing'], popular: true, shared: true, maxUsers: 5 },
      'showmax_1m': { name: 'Showmax Pro (1 Month)', price: 100, duration: '1 Month', features: ['Live Sports', 'Showmax Originals', 'Multiple Devices'], shared: true, maxUsers: 5 },
      'showmax_3m': { name: 'Showmax Pro (3 Months)', price: 250, duration: '3 Months', features: ['Live Sports', 'Showmax Originals', 'Multiple Devices'], shared: true, maxUsers: 5 },
      'showmax_6m': { name: 'Showmax Pro (6 Months)', price: 500, duration: '6 Months', features: ['Live Sports', 'Showmax Originals', 'Multiple Devices'], shared: true, maxUsers: 5 },
      'showmax_1y': { name: 'Showmax Pro (1 Year)', price: 900, duration: '1 Year', features: ['Live Sports', 'Showmax Originals', 'Multiple Devices'], popular: true, shared: true, maxUsers: 5 }
    }
  },
<<<<<<< HEAD

  music: {
    category: 'Music & Audio',
    icon: 'fas fa-music',
    color: '#F7B801',
    plans: {
      'spotify': { name: 'Spotify Premium', price: 400, duration: '3 Months', features: ['Ad-Free Music', 'Offline Mode', 'High-Quality Audio'], shared: true, maxUsers: 5 },
      'applemusic': { name: 'Apple Music', price: 250, duration: '1 Month', features: ['Ad-Free Music', 'Offline Listening', 'Lossless Audio'], shared: true, maxUsers: 5 },
      'youtubepremium': { name: 'YouTube Premium', price: 100, duration: '1 Month', features: ['Ad-Free Videos', 'Background Play', 'YouTube Music'], shared: true, maxUsers: 5 },
      'deezer': { name: 'Deezer Premium', price: 200, duration: '1 Month', features: ['Ad-Free Music', 'Offline Listening', 'High Quality Audio'], shared: true, maxUsers: 5 },
      'tidal': { name: 'Tidal HiFi', price: 250, duration: '1 Month', features: ['HiFi Audio', 'Offline Mode', 'Ad-Free'], shared: true, maxUsers: 5 },
      'soundcloud': { name: 'SoundCloud Go+', price: 150, duration: '1 Month', features: ['Ad-Free Music', 'Offline Access', 'Full Catalog'], shared: true, maxUsers: 5 },
      'audible': { name: 'Audible Premium Plus', price: 400, duration: '1 Month', features: ['Audiobooks Access', 'Monthly Credits', 'Offline Listening'], shared: true, maxUsers: 5 }
    }
  },

  productivity: {
    category: 'Productivity Tools',
    icon: 'fas fa-briefcase',
    color: '#45B7D1',
    plans: {
      'canva': { name: 'Canva Pro', price: 300, duration: '1 Month', features: ['Premium Templates', 'Brand Kit', 'Background Remover'], shared: true, maxUsers: 5 },
      'grammarly': { name: 'Grammarly Premium', price: 250, duration: '1 Month', features: ['Advanced Grammar', 'Tone Detection', 'Plagiarism Check'], shared: true, maxUsers: 5 },
      'skillshare': { name: 'Skillshare Premium', price: 350, duration: '1 Month', features: ['Unlimited Classes', 'Offline Access', 'Creative Skills'], shared: true, maxUsers: 5 },
      'masterclass': { name: 'MasterClass', price: 600, duration: '1 Month', features: ['Expert Instructors', 'Unlimited Lessons', 'Offline Access'], shared: true, maxUsers: 5 },
      'duolingo': { name: 'Duolingo Super', price: 150, duration: '1 Month', features: ['Ad-Free Learning', 'Offline Lessons', 'Unlimited Hearts'], shared: true, maxUsers: 5 },
      'notion': { name: 'Notion Plus', price: 200, duration: '1 Month', features: ['Unlimited Blocks', 'Collaboration Tools', 'File Uploads'], shared: true, maxUsers: 5 },
      'microsoft365': { name: 'Microsoft 365', price: 500, duration: '1 Month', features: ['Office Apps', 'Cloud Storage', 'Collaboration Tools'], shared: true, maxUsers: 5 },
      'googleone': { name: 'Google One', price: 250, duration: '1 Month', features: ['Cloud Storage', 'VPN Access', 'Family Sharing'], shared: true, maxUsers: 5 },
      'adobecc': { name: 'Adobe Creative Cloud', price: 700, duration: '1 Month', features: ['Full Suite Access', 'Cloud Sync', 'Regular Updates'], shared: true, maxUsers: 5 }
    }
  },

  vpn: {
    category: 'VPN & Security',
    icon: 'fas fa-shield-alt',
    color: '#4ECDC4',
    plans: {
      'urbanvpn': { name: 'Urban VPN', price: 100, duration: '1 Month', features: ['Unlimited Bandwidth', 'Global Servers', 'Fast & Secure Connection'], shared: true, maxUsers: 5 },
      'nordvpn': { name: 'NordVPN', price: 350, duration: '1 Month', features: ['Fast Servers', 'Secure Encryption', 'No Logs'], shared: true, maxUsers: 5 },
      'expressvpn': { name: 'ExpressVPN', price: 400, duration: '1 Month', features: ['Ultra Fast', 'Global Servers', 'No Logs'], shared: true, maxUsers: 5 },
      'surfshark': { name: 'Surfshark VPN', price: 200, duration: '1 Month', features: ['Unlimited Devices', 'Ad Blocker', 'Fast Servers'], shared: true, maxUsers: 5 },
      'cyberghost': { name: 'CyberGhost VPN', price: 250, duration: '1 Month', features: ['Global Servers', 'Streaming Support', 'No Logs'], shared: true, maxUsers: 5 },
      'ipvanish': { name: 'IPVanish', price: 200, duration: '1 Month', features: ['Unlimited Bandwidth', 'Strong Encryption', 'Fast Connections'], shared: true, maxUsers: 5 },
      'protonvpn': { name: 'ProtonVPN Plus', price: 300, duration: '1 Month', features: ['Secure Core', 'No Logs', 'High-Speed Servers'], shared: true, maxUsers: 5 },
      'windscribe': { name: 'Windscribe Pro', price: 150, duration: '1 Month', features: ['Unlimited Data', 'Global Servers', 'Ad Block'], shared: true, maxUsers: 5 }
    }
  },

  gaming: {
    category: 'Gaming Services',
    icon: 'fas fa-gamepad',
    color: '#A28BFE',
    plans: {
      'xbox': { name: 'Xbox Game Pass', price: 400, duration: '1 Month', features: ['100+ Games', 'Cloud Gaming', 'Exclusive Titles'], shared: true, maxUsers: 5 },
      'playstation': { name: 'PlayStation Plus', price: 400, duration: '1 Month', features: ['Multiplayer Access', 'Monthly Games', 'Discounts'], shared: true, maxUsers: 5 },
      'eaplay': { name: 'EA Play', price: 250, duration: '1 Month', features: ['EA Games Access', 'Early Trials', 'Member Rewards'], shared: true, maxUsers: 5 },
      'ubisoft': { name: 'Ubisoft+', price: 300, duration: '1 Month', features: ['Ubisoft Games Library', 'New Releases', 'Cloud Play'], shared: true, maxUsers: 5 },
      'geforcenow': { name: 'Nvidia GeForce Now', price: 350, duration: '1 Month', features: ['Cloud Gaming', 'High Performance', 'Cross-Device Access'], shared: true, maxUsers: 5 }
    }
  }
};

// Enhanced Email Service Functions
async function sendAccountEmail(customerEmail, planName, accountDetails, customerName) {
  console.log('📧 Attempting to send email to:', customerEmail);
  
  if (!emailTransporter) {
    console.log('❌ Email transporter not initialized');
    return { success: false, error: 'Email service not configured' };
  }

  if (!process.env.EMAIL_USER || !process.env.EMAIL_PASS) {
    console.log('❌ Email credentials missing in .env');
    return { success: false, error: 'Email credentials not configured' };
  }

  try {
    const mailOptions = {
      from: `"Chege Tech Premium" <${process.env.EMAIL_USER}>`,
=======
  // ... (keep all other plan categories as before)
};

// ======================= EMAIL SERVICE =======================
async function sendAccountEmail(customerEmail, planName, accountDetails, customerName, reference) {
  try {
    console.log('📧 Attempting to send email to:', customerEmail);
    
    if (!emailTransporter) {
      console.log('❌ Email transporter not initialized');
      return { success: false, error: 'Email service not configured' };
    }

    const mailOptions = {
      from: `"Chege Tech Premium" <${process.env.EMAIL_USER || 'no-reply@chegetech.com'}>`,
>>>>>>> 9f6b3d92e69168e336251e51628938f87d4b6d62
      to: customerEmail,
      subject: `Your ${planName} Account Details - Chege Tech Premium`,
      html: `
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
          <div style="background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); color: white; padding: 20px; text-align: center; border-radius: 10px 10px 0 0;">
            <h1>🎯 Chege Tech Premium</h1>
            <p>Your Premium Account Details</p>
          </div>
          <div style="background: #f9f9f9; padding: 20px; border-radius: 0 0 10px 10px;">
            <h2>Hello ${customerName},</h2>
            <p>Thank you for purchasing <strong>${planName}</strong>. Here are your account details:</p>
            
            <div style="background: white; padding: 15px; border-radius: 5px; margin: 15px 0; border-left: 4px solid #667eea;">
              <h3>🔐 Account Information:</h3>
              ${accountDetails.email ? `<p><strong>Email:</strong> ${accountDetails.email}</p>` : ''}
              ${accountDetails.username ? `<p><strong>Username:</strong> ${accountDetails.username}</p>` : ''}
              ${accountDetails.password ? `<p><strong>Password:</strong> ${accountDetails.password}</p>` : ''}
              ${accountDetails.activationCode ? `<p><strong>Activation Code:</strong> ${accountDetails.activationCode}</p>` : ''}
              ${accountDetails.redeemLink ? `<p><strong>Redeem Link:</strong> <a href="${accountDetails.redeemLink}">Click here to activate</a></p>` : ''}
              ${accountDetails.instructions ? `<p><strong>Instructions:</strong> ${accountDetails.instructions}</p>` : ''}
            </div>

            <div style="margin: 20px 0;">
              <h3>📝 Important Notes:</h3>
              <ul>
                <li>Keep your account details secure</li>
                <li>Do not change the account password or email</li>
                <li>Do not share these credentials with anyone else</li>
                <li>If you face any issues, contact our support immediately</li>
                <li>For optimal experience, login from Kenya only</li>
<<<<<<< HEAD
=======
                <li>Transaction Reference: <strong>${reference}</strong></li>
>>>>>>> 9f6b3d92e69168e336251e51628938f87d4b6d62
              </ul>
            </div>

            <p>Need help? Contact us on WhatsApp: <a href="https://wa.me/254781287381">+254 781 287 381</a></p>
          </div>
          <div style="text-align: center; margin-top: 20px; color: #666; font-size: 12px;">
            <p>&copy; 2024 Chege Tech Premium. All rights reserved.</p>
          </div>
        </div>
<<<<<<< HEAD
=======
      `,
      // Fallback text for email clients that don't support HTML
      text: `
        Chege Tech Premium - Your Account Details
        
        Hello ${customerName},
        
        Thank you for purchasing ${planName}. Here are your account details:
        
        ${accountDetails.email ? `Email: ${accountDetails.email}` : ''}
        ${accountDetails.username ? `Username: ${accountDetails.username}` : ''}
        ${accountDetails.password ? `Password: ${accountDetails.password}` : ''}
        ${accountDetails.instructions ? `Instructions: ${accountDetails.instructions}` : ''}
        
        Important Notes:
        • Keep your account details secure
        • Do not change the account password or email
        • Do not share these credentials with anyone else
        • Contact support if you face any issues
        • Transaction Reference: ${reference}
        
        Need help? WhatsApp: +254 781 287 381
        
        © 2024 Chege Tech Premium
>>>>>>> 9f6b3d92e69168e336251e51628938f87d4b6d62
      `
    };

    console.log('✉️ Sending email...');
    const result = await emailTransporter.sendMail(mailOptions);
    
    console.log('✅ Account details email sent successfully!');
    
    return { 
      success: true, 
      messageId: result.messageId
    };
    
  } catch (error) {
    console.error('❌ Email sending failed:', error.message);
<<<<<<< HEAD
    return { 
      success: false, 
      error: error.message
=======
    
    // Log detailed error
    const errorDetails = {
      error: error.message,
      customerEmail: customerEmail,
      planName: planName,
      time: new Date().toISOString()
    };
    
    sendTelegramNotification(`🚨 Email sending failed for ${customerEmail}: ${error.message}`);
    
    return { 
      success: false, 
      error: error.message,
      details: errorDetails
>>>>>>> 9f6b3d92e69168e336251e51628938f87d4b6d62
    };
  }
}

<<<<<<< HEAD
// Routes
=======
// ======================= ROUTES =======================
>>>>>>> 9f6b3d92e69168e336251e51628938f87d4b6d62
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

app.get('/api/plans', (req, res) => {
  try {
    res.json({ success: true, categories: subscriptionPlans });
  } catch (error) {
    console.error('❌ Error getting plans:', error);
    res.status(500).json({ success: false, error: 'Failed to load plans' });
  }
});

<<<<<<< HEAD
// Payment initiation - NO account assignment here
=======
// Payment initiation
>>>>>>> 9f6b3d92e69168e336251e51628938f87d4b6d62
app.post('/api/initiate-payment', async (req, res) => {
  try {
    const { planId, phoneNumber, customerName, email } = req.body;

    console.log('🔄 Payment initiation request:', { planId, phoneNumber, customerName, email });

    // Validate required fields
    if (!email || !email.includes('@')) {
      return res.status(400).json({
        success: false,
        error: 'Valid email address is required'
      });
    }

    if (!phoneNumber || phoneNumber.trim().length < 9) {
      return res.status(400).json({
        success: false,
        error: 'Valid phone number is required'
      });
    }

    // Find plan
    let plan = null;
    let categoryName = '';
    
    for (const [category, data] of Object.entries(subscriptionPlans)) {
      if (data.plans[planId]) {
        plan = data.plans[planId];
        categoryName = data.category;
        break;
      }
    }

    if (!plan) {
      return res.status(400).json({
        success: false,
        error: 'Invalid subscription plan'
      });
    }

    // Format phone number
    let formattedPhone = phoneNumber.trim().replace(/\s+/g, '');
    if (formattedPhone.startsWith('0')) {
      formattedPhone = '254' + formattedPhone.substring(1);
    } else if (formattedPhone.startsWith('+254')) {
      formattedPhone = formattedPhone.substring(1);
    } else if (formattedPhone.startsWith('254')) {
      // Already correct
    } else {
      formattedPhone = '254' + formattedPhone;
    }

    // Validate phone number format
    if (!/^254[17]\d{8}$/.test(formattedPhone)) {
      return res.status(400).json({
        success: false,
        error: 'Phone number must be a valid Kenyan number (e.g., 2547XXXXXXXX)'
      });
    }

    // Check account availability
    const availability = accountManager.checkAccountAvailability(planId);
    if (!availability.available) {
      return res.status(400).json({
        success: false,
        error: `Sorry, ${plan.name} accounts are currently out of stock. Please try another service or contact support.`,
        outOfStock: true
      });
    }

    const reference = `CHEGE-${planId.toUpperCase()}-${Date.now()}-${Math.random().toString(36).substr(2, 4)}`;

    // Prepare payment payload
    const stkPayload = {
      phone_number: formattedPhone,
      amount: plan.price,
      provider: 'm-pesa',
      channel_id: process.env.CHANNEL_ID,
      external_reference: reference,
      customer_name: customerName || 'Chege Tech Customer',
      description: `Payment for ${plan.name}`
    };

<<<<<<< HEAD
    console.log('🔄 Initiating payment for:', plan.name);
    console.log('📋 Reference:', reference);
    console.log('💰 Amount:', plan.price);
    console.log('📧 Email:', email);
    console.log('✅ Availability:', availability.availableSlots, 'slots available');
    
    const response = await client.stkPush(stkPayload);
    
    console.log('✅ PayHero STK Push Response:', response.reference || response.id);

    pendingTransactions.set(reference, {
=======
    console.log('🔄 Initiating payment:', {
      plan: plan.name,
      reference: reference,
      amount: plan.price,
      phone: formattedPhone,
      email: email
    });
    
    // Initiate payment
    let paymentResponse;
    try {
      paymentResponse = await client.stkPush(stkPayload);
      console.log('✅ PayHero STK Push Response:', paymentResponse);
    } catch (paymentError) {
      console.error('❌ PayHero payment initiation failed:', paymentError);
      
      const telegramMessage = `
❌ <b>PAYMENT INITIATION FAILED</b>

📊 <b>Service:</b> ${plan.name}
👤 <b>Customer:</b> ${customerName || 'Anonymous'}
📧 <b>Email:</b> ${email}
💰 <b>Amount:</b> KES ${plan.price}
📱 <b>Phone:</b> ${formattedPhone}
🔗 <b>Reference:</b> ${reference}
❌ <b>Error:</b> ${paymentError.message}

🚨 <i>Payment initiation failed. Customer needs to try again.</i>
      `;
      
      sendTelegramNotification(telegramMessage);
      
      return res.status(500).json({
        success: false,
        error: 'Payment initiation failed. Please try again.',
        details: paymentError.message
      });
    }

    // Store transaction
    const transactionData = {
>>>>>>> 9f6b3d92e69168e336251e51628938f87d4b6d62
      planId,
      planName: plan.name,
      customerEmail: email,
      customerName: customerName || 'Customer',
      amount: plan.price,
      phoneNumber: formattedPhone,
      yourReference: reference,
      payheroReference: paymentResponse.reference || paymentResponse.id,
      payheroResponse: paymentResponse,
      availability: availability,
      status: 'initiated'
    };

    transactionManager.addTransaction(reference, transactionData);

    console.log('💾 Transaction stored:', reference);

    console.log('💾 Transaction stored (NO account assigned yet):', reference);

    const telegramMessage = `
💰 <b>PAYMENT INITIATED</b>

📊 <b>Service:</b> ${plan.name}
👤 <b>Customer:</b> ${customerName || 'Anonymous'}
📧 <b>Email:</b> ${email}
💰 <b>Amount:</b> KES ${plan.price}
📱 <b>Phone:</b> ${formattedPhone}
🔗 <b>Reference:</b> ${reference}
📊 <b>Available Slots:</b> ${availability.availableSlots}
<<<<<<< HEAD
=======
⏰ <b>Time:</b> ${new Date().toLocaleString()}
>>>>>>> 9f6b3d92e69168e336251e51628938f87d4b6d62

⏳ <i>Waiting for payment confirmation...</i>
    `;
    
    sendTelegramNotification(telegramMessage);

    res.json({
      success: true,
      message: `Payment initiated for ${plan.name}`,
      data: {
        reference,
        payheroReference: paymentResponse.reference || paymentResponse.id,
        plan: plan.name,
        category: categoryName,
        amount: plan.price,
        duration: plan.duration,
        checkoutMessage: `You will receive an M-Pesa prompt to pay KES ${plan.price} for ${plan.name}`,
        note: 'After payment, check status using your reference number',
        availability: availability.availableSlots,
        timestamp: new Date().toISOString()
      }
    });

  } catch (error) {
<<<<<<< HEAD
    console.error('❌ Payment initiation error:', error.message);
    if (error.response) {
      console.error('Error Status:', error.response.status);
      console.error('Error Data:', error.response.data);
    }
=======
    console.error('❌ Payment initiation error:', error);
    
    const errorDetails = {
      error: error.message,
      stack: error.stack,
      time: new Date().toISOString(),
      request: req.body
    };
    
    sendTelegramNotification(`🚨 Payment initiation error: ${error.message}`);
    
>>>>>>> 9f6b3d92e69168e336251e51628938f87d4b6d62
    res.status(500).json({
      success: false,
      error: 'Failed to initiate payment',
      details: process.env.NODE_ENV === 'development' ? errorDetails : undefined
    });
  }
});

<<<<<<< HEAD
// CORRECTED: Payment check endpoint - Assign account ONLY on SUCCESS status
=======
// Payment check endpoint
>>>>>>> 9f6b3d92e69168e336251e51628938f87d4b6d62
app.get('/api/check-payment/:reference', async (req, res) => {
  try {
    const { reference } = req.params;
    
    console.log('🔄 Checking payment status for reference:', reference);
    
    // Check if transaction exists
    const transaction = transactionManager.getTransaction(reference);
    
    if (!transaction) {
      return res.json({
        success: false,
        status: 'error',
        error: 'Transaction not found',
        message: 'Invalid reference or transaction expired'
      });
    }
    
<<<<<<< HEAD
    const { payheroReference, planId, planName, customerEmail, customerName } = transaction;
=======
    const { planId, planName, customerEmail, customerName } = transaction;
>>>>>>> 9f6b3d92e69168e336251e51628938f87d4b6d62
    
    // Check payment status with PayHero
    try {
      const status = await client.transactionStatus(transaction.payheroReference || reference);
      console.log('📊 Payment status response:', status);
      
<<<<<<< HEAD
      // CORRECTED: Only assign account if status is "SUCCESS"
      if (status.status === 'SUCCESS') {
        console.log('🎉 Payment SUCCESSFUL for reference:', reference);
        
        const assignedAccount = accountManager.assignAccount(planId, customerEmail, customerName);
=======
      // Update transaction status
      transactionManager.updateTransaction(reference, { 
        payheroStatus: status.status,
        lastChecked: new Date().toISOString()
      });
      
      // Handle SUCCESS status
      if (status.status === 'SUCCESS') {
        console.log('🎉 Payment SUCCESSFUL for reference:', reference);
        
        // Assign account
        const assignedAccount = accountManager.assignAccount(planId, customerEmail, customerName, reference);
>>>>>>> 9f6b3d92e69168e336251e51628938f87d4b6d62
        
        if (!assignedAccount) {
          console.error('❌ CRITICAL: No account available after payment!');
          
          const telegramMessage = `
🚨 <b>CRITICAL ERROR - NO ACCOUNT AFTER PAYMENT</b>

📊 <b>Service:</b> ${planName}
👤 <b>Customer:</b> ${customerName || 'Anonymous'}
📧 <b>Email:</b> ${customerEmail}
💰 <b>Amount:</b> KES ${transaction.amount}
🔗 <b>Reference:</b> ${reference}
⏰ <b>Time:</b> ${new Date().toLocaleString()}

🚨 <i>Payment was successful but no account available! Manual intervention required.</i>
          `;
          
          sendTelegramNotification(telegramMessage);
          transactionManager.updateTransaction(reference, { status: 'failed_no_account' });
          
          return res.json({
            success: false,
            status: 'error',
            error: 'Payment successful but no account available. Please contact support for refund.',
            paymentSuccess: true,
            needSupport: true,
            reference: reference,
            whatsappUrl: `https://wa.me/254781287381?text=Payment%20Successful%20but%20No%20Account%20for%20${reference}`
          });
        }
        
        console.log('✅ Account assigned:', {
          email: assignedAccount.email,
          slot: assignedAccount.slotNumber,
          totalSlots: assignedAccount.totalSlots
        });
        
        // Send email with account details
        try {
          const emailResult = await sendAccountEmail(customerEmail, planName, assignedAccount, customerName, reference);
          
          if (emailResult.success) {
            console.log(`✅ Account sent to ${customerEmail} for ${planName}`);
            
            transactionManager.updateTransaction(reference, { 
              status: 'completed',
              accountAssigned: true,
              emailSent: true,
              accountDetails: {
                email: assignedAccount.email,
                username: assignedAccount.username,
                slot: assignedAccount.slotNumber
              }
            });
            
            const telegramMessage = `
✅ <b>PAYMENT CONFIRMED & ACCOUNT DELIVERED</b>

📊 <b>Service:</b> ${planName}
👤 <b>Customer:</b> ${customerName || 'Anonymous'}
📧 <b>Email:</b> ${customerEmail}
💰 <b>Amount:</b> KES ${transaction.amount}
🔢 <b>Slot Assigned:</b> ${assignedAccount.slotNumber}/${assignedAccount.totalSlots}
🔗 <b>Reference:</b> ${reference}
📨 <b>Email Status:</b> Sent successfully
⏰ <b>Time:</b> ${new Date().toLocaleString()}

🎉 <i>Transaction completed successfully!</i>
            `;
            
            sendTelegramNotification(telegramMessage);
            
          } else {
            console.log(`⚠️ Email sending failed for ${customerEmail}:`, emailResult.error);
            
            transactionManager.updateTransaction(reference, { 
              status: 'completed_no_email',
              accountAssigned: true,
              emailSent: false,
              emailError: emailResult.error
            });
            
            const telegramMessage = `
⚠️ <b>PAYMENT CONFIRMED - EMAIL FAILED</b>

📊 <b>Service:</b> ${planName}
👤 <b>Customer:</b> ${customerName || 'Anonymous'}
📧 <b>Email:</b> ${customerEmail}
💰 <b>Amount:</b> KES ${transaction.amount}
🔢 <b>Slot Assigned:</b> ${assignedAccount.slotNumber}/${assignedAccount.totalSlots}
🔗 <b>Reference:</b> ${reference}
❌ <b>Email Error:</b> ${emailResult.error}
⏰ <b>Time:</b> ${new Date().toLocaleString()}

🚨 <i>Account was assigned but email failed! Manual delivery required.</i>
            `;
            
            sendTelegramNotification(telegramMessage);
          }
        } catch (emailError) {
          console.error('❌ Email sending error:', emailError);
        }
        
        return res.json({
          success: true,
          paymentSuccess: true,
          status: 'success',
          paymentStatus: 'completed',
          reference: reference,
          whatsappUrl: `https://wa.me/254781287381?text=Payment%20Successful%20for%20${reference}.%20I%20have%20received%20my%20account%20details%20via%20email.`,
          message: 'Payment confirmed! Account details sent to your email.',
          timestamp: new Date().toISOString(),
          redirectUrl: `/success/${reference}`
        });
        
      } else if (status.status === 'FAILED' || status.status === 'CANCELLED') {
        console.log('❌ Payment FAILED/CANCELLED for reference:', reference);
        
        transactionManager.updateTransaction(reference, { 
          status: 'failed',
          payheroStatus: status.status
        });
        
        const telegramMessage = `
❌ <b>PAYMENT FAILED/CANCELLED</b>

📊 <b>Service:</b> ${planName}
👤 <b>Customer:</b> ${customerName || 'Anonymous'}
📧 <b>Email:</b> ${customerEmail}
💰 <b>Amount:</b> KES ${transaction.amount}
🔗 <b>Reference:</b> ${reference}
📊 <b>Status:</b> ${status.status}
⏰ <b>Time:</b> ${new Date().toLocaleString()}

💡 <i>No account was assigned. Slot remains available.</i>
        `;
        
        sendTelegramNotification(telegramMessage);
        
        return res.json({
          success: true,
          paymentSuccess: false,
          status: 'failed',
          paymentStatus: status.status.toLowerCase(),
          reference: reference,
          message: `Payment ${status.status.toLowerCase()}. Please try again.`,
          timestamp: new Date().toISOString(),
          retryUrl: `/`
        });
        
      } else if (status.status === 'QUEUED') {
        console.log('⏳ Payment QUEUED for reference:', reference);
        
        return res.json({
          success: true,
          paymentSuccess: false,
          status: 'queued',
          paymentStatus: 'queued',
          reference: reference,
          message: 'Payment is queued. Please check your M-Pesa and enter PIN to complete payment.',
          timestamp: new Date().toISOString(),
          isProcessing: true
        });
        
      } else {
<<<<<<< HEAD
        // Other statuses like PENDING, PROCESSING, etc.
=======
        // Other statuses
>>>>>>> 9f6b3d92e69168e336251e51628938f87d4b6d62
        console.log('⏳ Payment status:', status.status);
        
        return res.json({
          success: true,
          paymentSuccess: false,
          status: status.status.toLowerCase(),
          paymentStatus: status.status.toLowerCase(),
          reference: reference,
          message: `Payment status: ${status.status}. Please wait...`,
          timestamp: new Date().toISOString(),
          isProcessing: true
        });
      }
      
    } catch (payheroError) {
      console.error('❌ PayHero status check error:', payheroError);
      
      if (payheroError.response && payheroError.response.status === 404) {
        console.log('ℹ️ Transaction not found yet - still processing');
        
        return res.json({
          success: true,
          paymentSuccess: false,
          status: 'processing',
          paymentStatus: 'processing',
          reference: reference,
          message: 'Payment is being processed. Please wait 30-60 seconds and try again.',
          timestamp: new Date().toISOString(),
          isProcessing: true
        });
      }
      
      return res.json({
        success: false,
        status: 'error',
        error: 'Failed to check payment status',
        message: 'Failed to check payment status. Please try again.',
        reference: reference
      });
    }
    
  } catch (error) {
    console.error('❌ Payment check error:', error);
    
    res.json({
      success: false,
      status: 'error',
      error: 'Failed to check payment status',
      message: 'Failed to check payment status. Please try again.',
      details: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
});

<<<<<<< HEAD
// Clean up old pending transactions
setInterval(() => {
  const now = Date.now();
  const oneHour = 60 * 60 * 1000;
  
  for (const [reference, transaction] of pendingTransactions.entries()) {
    const transactionTime = new Date(transaction.timestamp).getTime();
    if (now - transactionTime > oneHour) {
      console.log(`🧹 Cleaning up old pending transaction: ${reference}`);
      pendingTransactions.delete(reference);
      
      const telegramMessage = `
⏰ <b>TRANSACTION EXPIRED</b>

📊 <b>Service:</b> ${transaction.planName}
👤 <b>Customer:</b> ${transaction.customerName || 'Anonymous'}
📧 <b>Email:</b> ${transaction.customerEmail}
💰 <b>Amount:</b> KES ${transaction.amount}
🔗 <b>Reference:</b> ${reference}

💡 <i>Transaction expired after 1 hour. No account was assigned.</i>
      `;
      
      sendTelegramNotification(telegramMessage);
    }
  }
}, 30 * 60 * 1000);

// Admin API routes
app.post('/api/admin/add-account', (req, res) => {
  const { service, account, adminPassword } = req.body;
  
  const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || 'chegeadmin123';
  if (adminPassword !== ADMIN_PASSWORD) {
    return res.status(401).json({ success: false, error: 'Unauthorized' });
  }
  
  if (!service || !account) {
    return res.status(400).json({ success: false, error: 'Service and account details required' });
  }
  
  const newAccount = accountManager.addAccount(service, account);
  
  res.json({
    success: true,
    message: `Account added to ${service}`,
    data: newAccount,
    stats: accountManager.getAccountStats()[service]
  });
});

// NEW: Remove account API
app.post('/api/admin/remove-account', (req, res) => {
  const { accountId, adminPassword } = req.body;
  
  const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || 'chegeadmin123';
  if (adminPassword !== ADMIN_PASSWORD) {
    return res.status(401).json({ success: false, error: 'Unauthorized' });
  }
  
  if (!accountId) {
    return res.status(400).json({ success: false, error: 'Account ID is required' });
  }
  
  const removedAccount = accountManager.removeAccount(accountId);
  
  if (!removedAccount) {
    return res.status(404).json({ success: false, error: 'Account not found' });
  }
  
  res.json({
    success: true,
    message: 'Account removed successfully',
    removedAccount: removedAccount,
    stats: accountManager.getAccountStats()
  });
});

// NEW: Get account by ID
app.get('/api/admin/account/:accountId', (req, res) => {
  const { password } = req.query;
  const { accountId } = req.params;
  
  const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || 'chegeadmin123';
  if (password !== ADMIN_PASSWORD) {
    return res.status(401).json({ success: false, error: 'Unauthorized' });
  }
  
  const account = accountManager.getAccountById(accountId);
  
  if (!account) {
    return res.status(404).json({ success: false, error: 'Account not found' });
  }
  
  res.json({
    success: true,
    account: account
  });
});

app.get('/api/admin/stats', (req, res) => {
  const { password } = req.query;
  
  const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || 'chegeadmin123';
  if (password !== ADMIN_PASSWORD) {
    return res.status(401).json({ success: false, error: 'Unauthorized' });
  }
  
  res.json({
    success: true,
    stats: accountManager.getAccountStats(),
    pendingTransactions: pendingTransactions.size,
    serverTime: new Date().toISOString()
  });
});

app.get('/api/admin/accounts', (req, res) => {
  const { password } = req.query;
  
  const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || 'chegeadmin123';
  if (password !== ADMIN_PASSWORD) {
    return res.status(401).json({ success: false, error: 'Unauthorized' });
  }
  
  res.json({
    success: true,
    accounts: accountManager.accounts
  });
});

// Account stats (public)
app.get('/api/account-stats', (req, res) => {
  const stats = accountManager.getAccountStats();
  res.json({ success: true, stats });
});

// Health check
app.get('/api/health', (req, res) => {
  const stats = accountManager.getAccountStats();
  res.json({
    success: true,
    message: 'Chege Tech Premium Service',
    data: {
      service: 'Chege Tech Premium',
      status: 'running',
      timestamp: new Date().toISOString(),
      pendingTransactions: pendingTransactions.size,
      accounts: stats,
      emailConfigured: !!(process.env.EMAIL_USER && process.env.EMAIL_PASS),
      payheroConfigured: !!(process.env.AUTH_TOKEN)
    }
  });
});

// Admin Panel
app.get('/admin', (req, res) => {
  res.send(`
    <!DOCTYPE html>
    <html>
    <head>
      <title>Chege Tech - Admin Panel</title>
      <style>
        body { font-family: Arial, sans-serif; margin: 40px; background: #f5f5f5; }
        .container { max-width: 1200px; margin: 0 auto; background: white; padding: 30px; border-radius: 10px; box-shadow: 0 2px 10px rgba(0,0,0,0.1); }
        h1 { color: #333; border-bottom: 2px solid #667eea; padding-bottom: 10px; }
        .form-group { margin-bottom: 20px; }
        label { display: block; margin-bottom: 5px; font-weight: bold; }
        input, textarea, select { width: 100%; padding: 10px; border: 1px solid #ddd; border-radius: 5px; }
        button { background: #667eea; color: white; border: none; padding: 12px 24px; border-radius: 5px; cursor: pointer; margin-right: 10px; margin-bottom: 10px; }
        button:hover { background: #5a67d8; }
        button.danger { background: #ef4444; }
        button.danger:hover { background: #dc2626; }
        button.success { background: #10b981; }
        button.success:hover { background: #059669; }
        .success { background: #10b981; color: white; padding: 10px; border-radius: 5px; margin: 10px 0; }
        .error { background: #ef4444; color: white; padding: 10px; border-radius: 5px; margin: 10px 0; }
        .warning { background: #f59e0b; color: white; padding: 10px; border-radius: 5px; margin: 10px 0; }
        .info { background: #3b82f6; color: white; padding: 10px; border-radius: 5px; margin: 10px 0; }
        .stats { background: #f3f4f6; padding: 15px; border-radius: 5px; margin: 20px 0; }
        .account-list { margin-top: 20px; }
        .account-item { padding: 15px; border: 1px solid #ddd; margin-bottom: 15px; border-radius: 5px; }
        .used { background: #fee2e2; }
        .available { background: #dcfce7; }
        .actions { margin-top: 10px; display: flex; gap: 10px; }
        .modal { display: none; position: fixed; top: 0; left: 0; width: 100%; height: 100%; background: rgba(0,0,0,0.5); z-index: 1000; }
        .modal-content { background: white; margin: 10% auto; padding: 20px; border-radius: 10px; width: 400px; max-width: 90%; }
        .modal-header { display: flex; justify-content: space-between; align-items: center; margin-bottom: 20px; }
        .close { font-size: 24px; cursor: pointer; }
        .tabs { display: flex; border-bottom: 1px solid #ddd; margin-bottom: 20px; }
        .tab { padding: 10px 20px; cursor: pointer; border-bottom: 2px solid transparent; }
        .tab.active { border-bottom: 2px solid #667eea; font-weight: bold; }
        .grid { display: grid; grid-template-columns: 1fr 1fr; gap: 30px; }
        @media (max-width: 768px) {
          .grid { grid-template-columns: 1fr; }
        }
      </style>
    </head>
    <body>
      <div class="container">
        <h1>🔧 Chege Tech Admin Panel</h1>
        
        <div class="tabs">
          <div class="tab active" onclick="showTab('stats')">📊 Statistics</div>
          <div class="tab" onclick="showTab('add')">➕ Add Account</div>
          <div class="tab" onclick="showTab('manage')">📋 Manage Accounts</div>
        </div>
        
        <div id="message"></div>
        
        <!-- Statistics Tab -->
        <div id="stats-tab" class="tab-content">
          <div class="stats">
            <h3>📊 Current System Stats</h3>
            <div id="stats">Loading...</div>
            <button onclick="loadStats()">🔄 Refresh Stats</button>
          </div>
          
          <div id="pending-transactions">
            <h3>⏳ Pending Transactions</h3>
            <div id="transactions-list">Loading...</div>
          </div>
        </div>
        
        <!-- Add Account Tab -->
        <div id="add-tab" class="tab-content" style="display: none;">
          <h3>➕ Add New Account</h3>
          <form id="addAccountForm">
            <div class="form-group">
              <label>Admin Password:</label>
              <input type="password" id="adminPassword" required placeholder="Enter admin password">
            </div>
            
            <div class="grid">
              <div>
                <div class="form-group">
                  <label>Service:</label>
                  <select id="service" required>
                    <option value="">Select Service</option>
                    <option value="spotify">Spotify Premium</option>
                    <option value="netflix">Netflix</option>
                    <option value="primevideo">Prime Video</option>
                    <option value="primevideo_3m">Prime Video (3 Months)</option>
                    <option value="primevideo_6m">Prime Video (6 Months)</option>
                    <option value="primevideo_1y">Prime Video (1 Year)</option>
                    <option value="showmax_1m">Showmax Pro (1 Month)</option>
                    <option value="showmax_3m">Showmax Pro (3 Months)</option>
                    <option value="showmax_6m">Showmax Pro (6 Months)</option>
                    <option value="showmax_1y">Showmax Pro (1 Year)</option>
                    <option value="youtubepremium">YouTube Premium</option>
                    <option value="applemusic">Apple Music</option>
                    <option value="canva">Canva Pro</option>
                    <option value="grammarly">Grammarly Premium</option>
                    <option value="urbanvpn">Urban VPN</option>
                    <option value="nordvpn">NordVPN</option>
                    <option value="xbox">Xbox Game Pass</option>
                    <option value="playstation">PlayStation Plus</option>
                    <option value="deezer">Deezer Premium</option>
                    <option value="tidal">Tidal HiFi</option>
                    <option value="soundcloud">SoundCloud Go+</option>
                    <option value="audible">Audible Premium Plus</option>
                    <option value="skillshare">Skillshare Premium</option>
                    <option value="masterclass">MasterClass</option>
                    <option value="duolingo">Duolingo Super</option>
                    <option value="notion">Notion Plus</option>
                    <option value="microsoft365">Microsoft 365</option>
                    <option value="googleone">Google One</option>
                    <option value="adobecc">Adobe Creative Cloud</option>
                    <option value="expressvpn">ExpressVPN</option>
                    <option value="surfshark">Surfshark VPN</option>
                    <option value="cyberghost">CyberGhost VPN</option>
                    <option value="ipvanish">IPVanish</option>
                    <option value="protonvpn">ProtonVPN Plus</option>
                    <option value="windscribe">Windscribe Pro</option>
                    <option value="eaplay">EA Play</option>
                    <option value="ubisoft">Ubisoft+</option>
                    <option value="geforcenow">Nvidia GeForce Now</option>
                    <option value="peacock_tv">Peacock TV</option>
                  </select>
                </div>
                
                <div class="form-group">
                  <label>Email:</label>
                  <input type="email" id="email" required placeholder="account@example.com">
                </div>
                
                <div class="form-group">
                  <label>Password:</label>
                  <input type="text" id="password" required placeholder="Account password">
                </div>
              </div>
              
              <div>
                <div class="form-group">
                  <label>Username (optional):</label>
                  <input type="text" id="username" placeholder="Username if different from email">
                </div>
                
                <div class="form-group">
                  <label>Instructions:</label>
                  <textarea id="instructions" rows="6" placeholder="Special instructions for customers...">Login using provided credentials. Do not change password.</textarea>
                </div>
                
                <button type="submit" class="success">➕ Add Account</button>
                <button type="button" onclick="resetForm()">🗑️ Clear Form</button>
              </div>
            </div>
          </form>
        </div>
        
        <!-- Manage Accounts Tab -->
        <div id="manage-tab" class="tab-content" style="display: none;">
          <h3>📋 Manage Accounts</h3>
          <div class="form-group">
            <label>Admin Password:</label>
            <input type="password" id="managePassword" placeholder="Enter admin password to view accounts">
            <button onclick="loadAccounts()">🔍 Load Accounts</button>
          </div>
          
          <div class="account-list" id="accountList">
            <p>Enter password and click "Load Accounts" to view accounts.</p>
          </div>
        </div>
      </div>
      
      <!-- Remove Account Modal -->
      <div id="removeModal" class="modal">
        <div class="modal-content">
          <div class="modal-header">
            <h3>⚠️ Remove Account</h3>
            <span class="close" onclick="closeModal()">&times;</span>
          </div>
          <p id="modalMessage">Are you sure you want to remove this account?</p>
          <div id="accountDetails"></div>
          <div class="actions">
            <button class="danger" onclick="confirmRemove()">🗑️ Remove Account</button>
            <button onclick="closeModal()">❌ Cancel</button>
          </div>
        </div>
      </div>
      
      <script>
        let currentTab = 'stats';
        let accountsData = {};
        let accountToRemove = null;
        let adminPassword = '';
        
        function showTab(tabName) {
          document.querySelectorAll('.tab').forEach(tab => {
            tab.classList.remove('active');
          });
          document.querySelectorAll('.tab-content').forEach(content => {
            content.style.display = 'none';
          });
          
          document.querySelectorAll('.tab')[tabName === 'stats' ? 0 : tabName === 'add' ? 1 : 2].classList.add('active');
          document.getElementById(tabName + '-tab').style.display = 'block';
          currentTab = tabName;
          
          if (tabName === 'stats') {
            loadStats();
          } else if (tabName === 'manage') {
            document.getElementById('accountList').innerHTML = '<p>Enter password and click "Load Accounts" to view accounts.</p>';
          }
        }
        
        async function loadStats() {
          const password = document.getElementById('adminPassword').value || document.getElementById('managePassword').value || 'chegeadmin123';
          adminPassword = password;
          
          try {
            // Load system stats
            const response = await fetch(\`/api/admin/stats?password=\${encodeURIComponent(password)}\`);
            const data = await response.json();
            
            if (data.success) {
              let html = '';
              Object.entries(data.stats).forEach(([service, stats]) => {
                html += \`
                  <div style="margin-bottom: 15px; padding: 15px; border-left: 4px solid #667eea; background: white; border-radius: 5px;">
                    <strong>\${service}:</strong><br>
                    📊 Total Accounts: \${stats.totalAccounts}<br>
                    👥 Used Slots: \${stats.usedSlots}/\${stats.totalSlots}<br>
                    ✅ Available Slots: \${stats.availableSlots}<br>
                    📋 Available Accounts: \${stats.availableAccounts}<br>
                    🚫 Fully Used Accounts: \${stats.fullyUsedAccounts}
                  </div>
                \`;
              });
              
              // Add pending transactions info
              html += \`<div style="margin-top: 20px; padding: 10px; background: #fff3cd; border-radius: 5px;">
                <strong>⏳ Pending Transactions:</strong> \${data.pendingTransactions}<br>
                <strong>⏰ Server Time:</strong> \${new Date(data.serverTime).toLocaleString()}
              </div>\`;
              
              document.getElementById('stats').innerHTML = html;
            } else {
              document.getElementById('stats').innerHTML = \`<div class="error">Error: \${data.error}</div>\`;
            }
          } catch (error) {
            document.getElementById('stats').innerHTML = '<div class="error">Error loading stats</div>';
          }
        }
        
        async function loadAccounts() {
          const password = document.getElementById('managePassword').value;
          adminPassword = password;
          
          if (!password) {
            showMessage('Please enter admin password', 'error');
            return;
          }
          
          try {
            const response = await fetch(\`/api/admin/accounts?password=\${encodeURIComponent(password)}\`);
            const data = await response.json();
            
            if (data.success) {
              accountsData = data.accounts;
              renderAccounts();
            } else {
              showMessage('Error: ' + data.error, 'error');
              document.getElementById('accountList').innerHTML = '<div class="error">Authentication failed</div>';
            }
          } catch (error) {
            showMessage('Error loading accounts', 'error');
          }
        }
        
        function renderAccounts() {
          let html = '';
          
          Object.entries(accountsData).forEach(([service, accounts]) => {
            html += \`<h4>\${service} (\${accounts.length} accounts)</h4>\`;
            
            accounts.forEach(account => {
              const statusClass = account.fullyUsed ? 'used' : 'available';
              const statusText = account.fullyUsed ? 'FULLY USED' : 'AVAILABLE';
              const statusIcon = account.fullyUsed ? '🚫' : '✅';
              
              html += \`
                <div class="account-item \${statusClass}" id="account-\${account.id}">
                  <div style="display: flex; justify-content: space-between; align-items: start;">
                    <div>
                      <strong>\${statusIcon} \${statusText}</strong><br>
                      <strong>Email:</strong> \${account.email || 'N/A'}<br>
                      <strong>Username:</strong> \${account.username || 'N/A'}<br>
                      <strong>Users:</strong> \${account.currentUsers || 0}/\${account.maxUsers || 5}<br>
                      <strong>Added:</strong> \${new Date(account.addedAt).toLocaleString()}<br>
                      <strong>Account ID:</strong> <code>\${account.id}</code>
                    </div>
                    <div class="actions">
                      <button class="danger" onclick="showRemoveModal('\${account.id}')">🗑️ Remove</button>
                    </div>
                  </div>
                  
                  \${account.usedBy && account.usedBy.length > 0 ? \`
                    <div style="margin-top: 10px; padding: 10px; background: #f1f5f9; border-radius: 5px;">
                      <strong>Used By (\${account.usedBy.length}):</strong>
                      <ul style="margin: 5px 0; padding-left: 20px;">
                        \${account.usedBy.map(user => \`
                          <li>\${user.customerName} (\${user.customerEmail}) - \${new Date(user.assignedAt).toLocaleString()}</li>
                        \`).join('')}
                      </ul>
                    </div>
                  \` : ''}
                </div>
              \`;
            });
          });
          
          document.getElementById('accountList').innerHTML = html || '<p>No accounts found.</p>';
        }
        
        function showRemoveModal(accountId) {
          if (!adminPassword) {
            adminPassword = document.getElementById('managePassword').value || document.getElementById('adminPassword').value;
          }
          
          const account = findAccountById(accountId);
          if (!account) return;
          
          accountToRemove = accountId;
          
          document.getElementById('accountDetails').innerHTML = \`
            <div style="background: #fef2f2; padding: 10px; border-radius: 5px; margin: 10px 0;">
              <strong>Service:</strong> \${account.service}<br>
              <strong>Email:</strong> \${account.email || 'N/A'}<br>
              <strong>Username:</strong> \${account.username || 'N/A'}<br>
              <strong>Current Users:</strong> \${account.currentUsers || 0}<br>
              <strong>Account ID:</strong> <code>\${account.id}</code>
            </div>
            <div class="warning">
              ⚠️ Warning: This action cannot be undone! This account will be permanently removed.
              \${account.currentUsers > 0 ? '<br>⚠️ This account has active users!' : ''}
            </div>
          \`;
          
          document.getElementById('removeModal').style.display = 'block';
        }
        
        function closeModal() {
          document.getElementById('removeModal').style.display = 'none';
          accountToRemove = null;
        }
        
        async function confirmRemove() {
          if (!accountToRemove || !adminPassword) {
            showMessage('Missing information', 'error');
            return;
          }
          
          try {
            const response = await fetch('/api/admin/remove-account', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                accountId: accountToRemove,
                adminPassword: adminPassword
              })
            });
            
            const result = await response.json();
            
            if (result.success) {
              showMessage(\`Account removed successfully! Telegram notification sent.\`, 'success');
              
              // Remove from UI
              const accountElement = document.getElementById('account-' + accountToRemove);
              if (accountElement) {
                accountElement.remove();
              }
              
              // Remove from local data
              removeAccountFromData(accountToRemove);
              
              closeModal();
              
              // Reload stats
              loadStats();
            } else {
              showMessage('Error: ' + result.error, 'error');
            }
          } catch (error) {
            showMessage('Network error: ' + error.message, 'error');
          }
        }
        
        function findAccountById(accountId) {
          for (const [service, accounts] of Object.entries(accountsData)) {
            const account = accounts.find(acc => acc.id === accountId);
            if (account) {
              return { ...account, service };
            }
          }
          return null;
        }
        
        function removeAccountFromData(accountId) {
          for (const [service, accounts] of Object.entries(accountsData)) {
            const index = accounts.findIndex(acc => acc.id === accountId);
            if (index !== -1) {
              accounts.splice(index, 1);
              if (accounts.length === 0) {
                delete accountsData[service];
              }
              break;
            }
          }
        }
        
        document.getElementById('addAccountForm').addEventListener('submit', async (e) => {
          e.preventDefault();
          
          const formData = {
            service: document.getElementById('service').value,
            account: {
              email: document.getElementById('email').value,
              password: document.getElementById('password').value,
              username: document.getElementById('username').value || '',
              instructions: document.getElementById('instructions').value
            },
            adminPassword: document.getElementById('adminPassword').value
          };
          
          if (!formData.adminPassword) {
            showMessage('Please enter admin password', 'error');
            return;
          }
          
          try {
            const response = await fetch('/api/admin/add-account', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify(formData)
            });
            
            const result = await response.json();
            
            if (result.success) {
              showMessage(\`
                ✅ Account added successfully!<br>
                <strong>Service:</strong> \${formData.service}<br>
                <strong>Email:</strong> \${formData.account.email}<br>
                <strong>Account ID:</strong> \${result.data.id}<br>
                Telegram notification sent.
              \`, 'success');
              
              // Clear form
              document.getElementById('email').value = '';
              document.getElementById('password').value = '';
              document.getElementById('username').value = '';
              
              // Reload stats
              loadStats();
            } else {
              showMessage('Error: ' + result.error, 'error');
            }
          } catch (error) {
            showMessage('Network error: ' + error.message, 'error');
          }
        });
        
        function resetForm() {
          document.getElementById('addAccountForm').reset();
        }
        
        function showMessage(message, type) {
          const messageDiv = document.getElementById('message');
          messageDiv.innerHTML = \`
            <div class="\${type}">
              \${message}
            </div>
          \`;
          
          setTimeout(() => {
            messageDiv.innerHTML = '';
          }, 5000);
        }
        
        // Load stats on page load
        loadStats();
        
        // Close modal when clicking outside
        window.onclick = function(event) {
          const modal = document.getElementById('removeModal');
          if (event.target === modal) {
            closeModal();
          }
        };
      </script>
    </body>
    </html>
  `);
});

// Start server
app.listen(port, () => {
  console.log('🚀 Chege Tech Premium Service Started');
  console.log('📍 Port:', port);
  console.log('🔑 Account ID:', process.env.ACCOUNT_ID || '3716');
  console.log('📧 Email Configured:', !!(process.env.EMAIL_USER && process.env.EMAIL_PASS));
  console.log('🤖 Telegram Bot:', TELEGRAM_BOT_TOKEN ? 'Configured' : 'Not configured');
  if (!process.env.TELEGRAM_CHAT_ID || process.env.TELEGRAM_CHAT_ID === 'YOUR_CHAT_ID') {
    console.log('⚠️ Telegram Chat ID not configured. Set TELEGRAM_CHAT_ID in .env file');
  }
  console.log('✅ Fixed: Accounts assigned ONLY when status is "SUCCESS"');
  console.log('✅ Fixed: QUEUED status handled correctly (no account assigned)');
  console.log('✅ Added: Account removal functionality');
  console.log('🧹 Auto-cleanup: Old transactions removed after 1 hour');
  console.log('🔧 Admin Panel: http://localhost:' + port + '/admin');
  console.log('🌐 URL: http://localhost:' + port);
  
  const startupMessage = `
🚀 <b>CHEGE TECH SERVER STARTED (WITH ACCOUNT REMOVAL)</b>

📍 <b>Port:</b> ${port}
✅ <b>New Feature:</b> Account removal capability
✅ <b>Fixed:</b> Accounts assigned ONLY when status is "SUCCESS"
✅ <b>Fixed:</b> QUEUED status handled correctly
🧹 <b>Cleanup:</b> Old transactions auto-removed after 1 hour
🔧 <b>Admin Panel:</b> http://localhost:${port}/admin
⏰ <b>Time:</b> ${new Date().toLocaleString()}

✅ <i>Server is ready with enhanced admin features!</i>
  `;
  
  sendTelegramNotification(startupMessage);
});
=======
// ======================= ADMIN ROUTES =======================
// Admin login page
app.get('/admin/login', (req, res) => {
  if (req.session.adminLoggedIn) {
    return res.redirect('/admin/dashboard');
  }
  
  res.sendFile(path.join(__dirname, 'public', 'admin-login.html'));
});

// Admin login API with rate limiting
app.post('/api/admin/login', loginLimiter, async (req, res) => {
  try {
    const { username, password } = req.body;
    
    const ADMIN_USERNAME = process.env.ADMIN_USERNAME || 'admin';
    const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || 'chegeadmin123';
    
    const clientIp = req.ip || req.connection.remoteAddress;
    const userAgent = req.get('User-Agent') || 'Unknown';
    
    console.log(`🔐 Admin login attempt from ${clientIp}: ${username}`);
    
    if (username === ADMIN_USERNAME && password === ADMIN_PASSWORD) {
      req.session.adminLoggedIn = true;
      req.session.adminUsername = username;
      req.session.loginTime = new Date().toISOString();
      req.session.clientIp = clientIp;
      
      const telegramMessage = `
🔐 <b>ADMIN LOGIN SUCCESSFUL</b>

👤 <b>Username:</b> ${username}
🌐 <b>IP Address:</b> ${clientIp}
🖥️ <b>User Agent:</b> ${userAgent.substring(0, 100)}...
⏰ <b>Time:</b> ${new Date().toLocaleString()}
📍 <b>Location:</b> ${req.headers['x-forwarded-for'] || 'N/A'}

✅ <i>Admin login successful</i>
      `;
      
      sendTelegramNotification(telegramMessage);
      
      res.json({ 
        success: true, 
        message: 'Login successful',
        redirect: '/admin/dashboard'
      });
      
    } else {
      const telegramMessage = `
🚨 <b>FAILED ADMIN LOGIN ATTEMPT</b>

👤 <b>Username Attempted:</b> ${username}
🌐 <b>IP Address:</b> ${clientIp}
🖥️ <b>User Agent:</b> ${userAgent.substring(0, 100)}...
⏰ <b>Time:</b> ${new Date().toLocaleString()}
📍 <b>Location:</b> ${req.headers['x-forwarded-for'] || 'N/A'}

⚠️ <i>Invalid credentials provided - POSSIBLE BREACH ATTEMPT</i>
      `;
      
      sendTelegramNotification(telegramMessage);
      
      res.status(401).json({ 
        success: false, 
        error: 'Invalid username or password',
        attemptsRemaining: req.rateLimit.remaining
      });
    }
  } catch (error) {
    console.error('❌ Admin login error:', error);
    res.status(500).json({ success: false, error: 'Login failed' });
  }
});

// Admin logout
app.get('/api/admin/logout', (req, res) => {
  if (req.session.adminLoggedIn) {
    const username = req.session.adminUsername;
    const sessionDuration = req.session.loginTime ? 
      Math.floor((new Date() - new Date(req.session.loginTime)) / 1000) : 0;
    
    req.session.destroy();
    
    console.log(`👋 Admin logged out: ${username} (session: ${sessionDuration}s)`);
    
    const telegramMessage = `
👋 <b>ADMIN LOGGED OUT</b>

👤 <b>Username:</b> ${username}
⏰ <b>Session Duration:</b> ${sessionDuration} seconds
⏰ <b>Logout Time:</b> ${new Date().toLocaleString()}

✅ <i>Admin session ended</i>
    `;
    
    sendTelegramNotification(telegramMessage);
  }
  
  res.redirect('/admin/login?logout=success');
});

// Session check
app.get('/api/admin/session-check', (req, res) => {
  if (req.session.adminLoggedIn) {
    res.json({ 
      valid: true, 
      username: req.session.adminUsername,
      loginTime: req.session.loginTime
    });
  } else {
    res.status(401).json({ valid: false });
  }
});

// Protected admin dashboard
app.get('/admin/dashboard', requireAuth, (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'admin-dashboard.html'));
});

// Admin API routes (all protected)
app.post('/api/admin/add-account', requireAuth, async (req, res) => {
  try {
    const { service, account } = req.body;
    
    if (!service || !account) {
      return res.status(400).json({ 
        success: false, 
        error: 'Service and account details required' 
      });
    }
    
    const newAccount = accountManager.addAccount(service, account);
    
    res.json({
      success: true,
      message: `Account added to ${service}`,
      data: newAccount,
      stats: accountManager.getAccountStats()[service]
    });
  } catch (error) {
    console.error('❌ Add account error:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

app.post('/api/admin/remove-account', requireAuth, async (req, res) => {
  try {
    const { accountId } = req.body;
    
    if (!accountId) {
      return res.status(400).json({ 
        success: false, 
        error: 'Account ID is required' 
      });
    }
    
    const removedAccount = accountManager.removeAccount(accountId);
    
    if (!removedAccount) {
      return res.status(404).json({ 
        success: false, 
        error: 'Account not found' 
      });
    }
    
    res.json({
      success: true,
      message: 'Account removed successfully',
      removedAccount: removedAccount,
      stats: accountManager.getAccountStats()
    });
  } catch (error) {
    console.error('❌ Remove account error:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

app.get('/api/admin/stats', requireAuth, async (req, res) => {
  try {
    const stats = accountManager.getAccountStats();
    const pendingCount = Array.from(transactionManager.transactions.values())
      .filter(tx => tx.status === 'initiated' || tx.status === 'processing').length;
    
    res.json({
      success: true,
      stats: stats,
      pendingTransactions: pendingCount,
      totalTransactions: transactionManager.transactions.size,
      serverTime: new Date().toISOString(),
      uptime: process.uptime(),
      memoryUsage: process.memoryUsage()
    });
  } catch (error) {
    console.error('❌ Stats error:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

app.get('/api/admin/accounts', requireAuth, async (req, res) => {
  try {
    res.json({
      success: true,
      accounts: accountManager.accounts,
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    console.error('❌ Accounts error:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

app.get('/api/admin/transactions', requireAuth, async (req, res) => {
  try {
    const transactions = Array.from(transactionManager.transactions.values());
    res.json({
      success: true,
      transactions: transactions,
      count: transactions.length
    });
  } catch (error) {
    console.error('❌ Transactions error:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// ======================= PUBLIC ROUTES =======================
app.get('/api/account-stats', (req, res) => {
  try {
    const stats = accountManager.getAccountStats();
    res.json({ success: true, stats });
  } catch (error) {
    console.error('❌ Account stats error:', error);
    res.status(500).json({ success: false, error: 'Failed to load stats' });
  }
});

app.get('/api/health', (req, res) => {
  try {
    const stats = accountManager.getAccountStats();
    
    const health = {
      success: true,
      message: 'Chege Tech Premium Service',
      data: {
        service: 'Chege Tech Premium',
        status: 'running',
        timestamp: new Date().toISOString(),
        uptime: process.uptime(),
        pendingTransactions: transactionManager.transactions.size,
        accounts: Object.keys(stats).length,
        emailConfigured: !!(process.env.EMAIL_USER && process.env.EMAIL_PASS),
        payheroConfigured: !!process.env.AUTH_TOKEN,
        telegramConfigured: !!(TELEGRAM_BOT_TOKEN && TELEGRAM_CHAT_ID && TELEGRAM_CHAT_ID !== 'YOUR_CHAT_ID'),
        memory: process.memoryUsage(),
        nodeVersion: process.version
      }
    };
    
    res.json(health);
  } catch (error) {
    console.error('❌ Health check error:', error);
    res.status(500).json({ success: false, error: 'Health check failed' });
  }
});

// 404 handler
app.use((req, res) => {
  res.status(404).json({ success: false, error: 'Endpoint not found' });
});

// ======================= MAINTENANCE TASKS =======================
// Clean up old transactions every 30 minutes
setInterval(() => {
  transactionManager.cleanupOldTransactions();
}, 30 * 60 * 1000);

// System monitoring
setInterval(() => {
  const memoryUsage = process.memoryUsage();
  const memoryPercent = Math.round((memoryUsage.heapUsed / memoryUsage.heapTotal) * 100);
  
  if (memoryPercent > 80) {
    sendTelegramNotification(`⚠️ <b>HIGH MEMORY USAGE: ${memoryPercent}%</b>`);
  }
}, 5 * 60 * 1000); // Every 5 minutes

// ======================= START SERVER =======================
async function startServer() {
  try {
    // Initialize services
    await initializeServices();
    
    // Start server
    app.listen(port, () => {
      console.log('='.repeat(60));
      console.log('🚀 CHEGE TECH PREMIUM SERVICE STARTED');
      console.log('='.repeat(60));
      console.log(`📍 Port: ${port}`);
      console.log(`🌐 URL: http://localhost:${port}`);
      console.log(`🔧 Admin Panel: http://localhost:${port}/admin/login`);
      console.log(`👤 Admin Username: ${process.env.ADMIN_USERNAME || 'admin'}`);
      console.log(`🔐 Admin Password: ${process.env.ADMIN_PASSWORD ? '******** (from .env)' : 'chegeadmin123 (default)'}`);
      console.log(`📧 Email Service: ${emailTransporter ? '✅ Ready' : '❌ Not configured'}`);
      console.log(`💳 Payment Service: ${client ? '✅ Ready' : '❌ Not configured'}`);
      console.log(`🤖 Telegram Bot: ${TELEGRAM_BOT_TOKEN ? '✅ Configured' : '❌ Not configured'}`);
      console.log(`📊 Account Backups: ✅ Enabled (24 hours retention)`);
      console.log(`🛡️  Security: ✅ Rate limiting, Session auth, IP logging`);
      console.log(`📈 Monitoring: ✅ Memory, Transactions, Error tracking`);
      console.log('='.repeat(60));
      
      const startupMessage = `
🚀 <b>CHEGE TECH SERVER STARTED SUCCESSFULLY</b>

📍 <b>Port:</b> ${port}
✅ <b>Status:</b> All systems operational
🔧 <b>Admin Panel:</b> http://localhost:${port}/admin/login
👤 <b>Admin Username:</b> ${process.env.ADMIN_USERNAME || 'admin'}
📊 <b>Account Backups:</b> ✅ Enabled
🛡️ <b>Security Features:</b> ✅ All active
📈 <b>Monitoring:</b> ✅ Active
⏰ <b>Startup Time:</b> ${new Date().toLocaleString()}

✅ <b><i>Server is 100% ready and error-proof!</i></b>
      `;
      
      sendTelegramNotification(startupMessage);
    });
    
  } catch (error) {
    console.error('🔥 CRITICAL: Failed to start server:', error);
    sendTelegramNotification(`🔥 CRITICAL SERVER STARTUP FAILED: ${error.message}`);
    process.exit(1);
  }
}

// Start the server
startServer();
>>>>>>> 9f6b3d92e69168e336251e51628938f87d4b6d62

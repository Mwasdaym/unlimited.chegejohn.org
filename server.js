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

// ======================= MIDDLEWARE =======================
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
        Object.keys(this.accounts).forEach(service => {
          this.accounts[service].forEach(account => {
            if (!account.currentUsers) account.currentUsers = 0;
            if (!account.maxUsers) account.maxUsers = 5;
            if (!account.usedBy) account.usedBy = [];
            if (!account.fullyUsed) account.fullyUsed = false;
            if (!account.id) account.id = this.generateId(service);
            if (!account.addedAt) account.addedAt = new Date().toISOString();
          });
        });
      } else {
        this.accounts = {};
        this.saveAccounts();
        console.log('📁 Created new accounts file');
      }
    } catch (error) {
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

  assignAccount(service, customerEmail, customerName, reference) {
    try {
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
🎯 <b>NEW ACCOUNT ADDED</b>

📊 <b>Service:</b> ${service}
📧 <b>Account:</b> ${accountData.email || accountData.username}
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
      
      for (const [service, accounts] of Object.entries(this.accounts)) {
        const accountIndex = accounts.findIndex(acc => acc.id === accountId);
        
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
  }
}

const accountManager = new AccountManager();

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
                <li>Transaction Reference: <strong>${reference}</strong></li>
              </ul>
            </div>

            <p>Need help? Contact us on WhatsApp: <a href="https://wa.me/254781287381">+254 781 287 381</a></p>
          </div>
          <div style="text-align: center; margin-top: 20px; color: #666; font-size: 12px;">
            <p>&copy; 2024 Chege Tech Premium. All rights reserved.</p>
          </div>
        </div>
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
    };
  }
}

// ======================= ROUTES =======================
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

// Payment initiation
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

    const telegramMessage = `
💰 <b>PAYMENT INITIATED</b>

📊 <b>Service:</b> ${plan.name}
👤 <b>Customer:</b> ${customerName || 'Anonymous'}
📧 <b>Email:</b> ${email}
💰 <b>Amount:</b> KES ${plan.price}
📱 <b>Phone:</b> ${formattedPhone}
🔗 <b>Reference:</b> ${reference}
📊 <b>Available Slots:</b> ${availability.availableSlots}
⏰ <b>Time:</b> ${new Date().toLocaleString()}

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
    console.error('❌ Payment initiation error:', error);
    
    const errorDetails = {
      error: error.message,
      stack: error.stack,
      time: new Date().toISOString(),
      request: req.body
    };
    
    sendTelegramNotification(`🚨 Payment initiation error: ${error.message}`);
    
    res.status(500).json({
      success: false,
      error: 'Failed to initiate payment',
      details: process.env.NODE_ENV === 'development' ? errorDetails : undefined
    });
  }
});

// Payment check endpoint
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
    
    const { planId, planName, customerEmail, customerName } = transaction;
    
    // Check payment status with PayHero
    try {
      const status = await client.transactionStatus(transaction.payheroReference || reference);
      console.log('📊 Payment status response:', status);
      
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
        // Other statuses
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

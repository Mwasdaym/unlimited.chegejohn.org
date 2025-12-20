require('dotenv').config();
const express = require('express');
const cors = require('cors');
const bodyParser = require('body-parser');
const { PayHeroClient } = require('payhero-devkit');
const path = require('path');
const nodemailer = require('nodemailer');
const fs = require('fs').promises;
const fsSync = require('fs');
const axios = require('axios');

const app = express();
const port = process.env.PORT || 3000;

// Telegram Bot Configuration
const TELEGRAM_BOT_TOKEN = '8405268705:AAGvgEQDaW5jgRcRIrysHY_4DZIFTZeekAc';
const TELEGRAM_CHAT_ID = process.env.TELEGRAM_CHAT_ID || '7161000868';

// SIMPLIFIED: Admin Credentials (no bcrypt needed)
const ADMIN_USERNAME = process.env.ADMIN_USERNAME || 'admin';
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || 'chegeadmin123';
const SESSION_EXPIRY = 24 * 60 * 60 * 1000; // 24 hours

// Middleware
app.use(cors());
app.use(bodyParser.json({ limit: '10mb' }));
app.use(express.static('public'));
app.use(express.urlencoded({ extended: true }));

// Initialize PayHero Client
let client;
try {
  if (process.env.AUTH_TOKEN) {
    client = new PayHeroClient({
      authToken: process.env.AUTH_TOKEN
    });
    console.log('✅ PayHero client initialized');
  } else {
    console.log('⚠️ AUTH_TOKEN not found in .env');
  }
} catch (error) {
  console.error('❌ Failed to initialize PayHero:', error.message);
}

// Initialize Email Transporter
let emailTransporter;
try {
  if (process.env.EMAIL_USER && process.env.EMAIL_PASS) {
    emailTransporter = nodemailer.createTransport({
      service: process.env.EMAIL_SERVICE || 'gmail',
      auth: {
        user: process.env.EMAIL_USER,
        pass: process.env.EMAIL_PASS
      }
    });
    
    emailTransporter.verify(function(error, success) {
      if (error) {
        console.error('❌ Email transporter verification failed:', error);
      } else {
        console.log('✅ Email transporter initialized and verified');
      }
    });
  } else {
    console.log('⚠️ Email credentials not found in .env');
  }
} catch (error) {
  console.error('❌ Failed to initialize email transporter:', error.message);
}

// Telegram Notification Function
async function sendTelegramNotification(message) {
  try {
    const chatId = process.env.TELEGRAM_CHAT_ID || TELEGRAM_CHAT_ID;
    
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
      }
    );
    console.log('✅ Telegram notification sent');
    return response.data;
  } catch (error) {
    console.error('❌ Failed to send Telegram notification:', error.message);
    if (error.response) {
      console.error('Telegram API Error:', error.response.data);
    }
    return null;
  }
}

// ==================== TRANSACTION MANAGER ====================
class TransactionManager {
  constructor() {
    this.transactionsFile = path.join(__dirname, 'data', 'transactions.json');
    this.transactions = [];
    this.initialize();
  }

  async initialize() {
    try {
      // Create data directory if it doesn't exist
      const dataDir = path.join(__dirname, 'data');
      if (!fsSync.existsSync(dataDir)) {
        fsSync.mkdirSync(dataDir, { recursive: true });
      }
      
      if (fsSync.existsSync(this.transactionsFile)) {
        const data = await fs.readFile(this.transactionsFile, 'utf8');
        this.transactions = JSON.parse(data);
        console.log(`✅ Loaded ${this.transactions.length} transactions`);
      } else {
        this.transactions = [];
        await this.saveTransactions();
        console.log('📁 Created new transactions file');
      }
    } catch (error) {
      console.error('❌ Error loading transactions:', error.message);
      this.transactions = [];
    }
  }

  async saveTransactions() {
    try {
      await fs.writeFile(this.transactionsFile, JSON.stringify(this.transactions, null, 2));
    } catch (error) {
      console.error('❌ Error saving transactions:', error.message);
    }
  }

  async addTransaction(transactionData) {
    try {
      const transaction = {
        id: `TXN-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
        ...transactionData,
        timestamp: new Date().toISOString(),
        date: new Date().toLocaleDateString('en-US', { 
          year: 'numeric', 
          month: 'short', 
          day: 'numeric' 
        }),
        month: new Date().toLocaleDateString('en-US', { 
          year: 'numeric', 
          month: 'long' 
        })
      };
      
      this.transactions.push(transaction);
      await this.saveTransactions();
      
      console.log(`✅ Transaction recorded: ${transaction.id} - ${transaction.status}`);
      return transaction;
    } catch (error) {
      console.error('❌ Error adding transaction:', error.message);
      return null;
    }
  }

  getRevenueStats() {
    const successful = this.transactions.filter(t => t.status === 'SUCCESS');
    const failed = this.transactions.filter(t => t.status === 'FAILED' || t.status === 'CANCELLED');
    const pending = this.transactions.filter(t => t.status === 'PENDING' || t.status === 'QUEUED');
    
    const totalRevenue = successful.reduce((sum, txn) => sum + (txn.amount || 0), 0);
    
    // Calculate monthly revenue
    const monthlyRevenue = {};
    successful.forEach(txn => {
      const month = txn.month || 'Unknown';
      monthlyRevenue[month] = (monthlyRevenue[month] || 0) + (txn.amount || 0);
    });
    
    // Calculate daily revenue (last 30 days)
    const dailyRevenue = {};
    const thirtyDaysAgo = new Date();
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
    
    successful
      .filter(txn => new Date(txn.timestamp) > thirtyDaysAgo)
      .forEach(txn => {
        const date = txn.date || 'Unknown';
        dailyRevenue[date] = (dailyRevenue[date] || 0) + (txn.amount || 0);
      });
    
    // Calculate service-wise revenue
    const serviceRevenue = {};
    successful.forEach(txn => {
      if (txn.planId) {
        serviceRevenue[txn.planId] = (serviceRevenue[txn.planId] || 0) + (txn.amount || 0);
      }
    });
    
    return {
      totalTransactions: this.transactions.length,
      successfulTransactions: successful.length,
      failedTransactions: failed.length,
      pendingTransactions: pending.length,
      totalRevenue,
      monthlyRevenue,
      dailyRevenue,
      serviceRevenue,
      transactions: this.transactions.slice(-100).reverse() // Last 100 transactions
    };
  }

  getTransactionsByDateRange(startDate, endDate) {
    const start = new Date(startDate);
    const end = new Date(endDate);
    
    return this.transactions.filter(txn => {
      const txnDate = new Date(txn.timestamp);
      return txnDate >= start && txnDate <= end;
    });
  }
}

const transactionManager = new TransactionManager();

// ==================== ACCOUNT MANAGER ====================
class AccountManager {
  constructor() {
    this.accountsFile = path.join(__dirname, 'data', 'accounts.json');
    this.accounts = {};
    this.loadAccounts();
  }

  async loadAccounts() {
    try {
      const dataDir = path.join(__dirname, 'data');
      if (!fsSync.existsSync(dataDir)) {
        fsSync.mkdirSync(dataDir, { recursive: true });
      }
      
      if (fsSync.existsSync(this.accountsFile)) {
        const data = await fs.readFile(this.accountsFile, 'utf8');
        this.accounts = JSON.parse(data);
        console.log('✅ Accounts loaded successfully');
        
        // Initialize missing fields
        Object.keys(this.accounts).forEach(service => {
          this.accounts[service].forEach(account => {
            if (!account.currentUsers) account.currentUsers = 0;
            if (!account.maxUsers) account.maxUsers = 5;
            if (!account.usedBy) account.usedBy = [];
            if (!account.fullyUsed) account.fullyUsed = false;
            if (!account.id) account.id = `${service}_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
          });
        });
      } else {
        this.accounts = {};
        await this.saveAccounts();
        console.log('📁 Created new accounts file');
      }
    } catch (error) {
      console.error('❌ Error loading accounts:', error.message);
      this.accounts = {};
    }
  }

  async saveAccounts() {
    try {
      await fs.writeFile(this.accountsFile, JSON.stringify(this.accounts, null, 2));
    } catch (error) {
      console.error('❌ Error saving accounts:', error.message);
    }
  }

  checkAccountAvailability(service) {
    if (!this.accounts[service] || this.accounts[service].length === 0) {
      return { available: false, message: 'No accounts available' };
    }
    
    const availableAccount = this.accounts[service].find(acc => 
      !acc.fullyUsed && acc.currentUsers < acc.maxUsers
    );
    
    if (availableAccount) {
      return {
        available: true,
        message: 'Account available',
        accountId: availableAccount.email || availableAccount.username,
        availableSlots: availableAccount.maxUsers - availableAccount.currentUsers
      };
    }
    
    return { available: false, message: 'All accounts are full' };
  }

  async assignAccount(service, customerEmail, customerName, transactionId) {
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
      customerEmail,
      customerName: customerName || 'Customer',
      customerId: `CUST-${Date.now()}`,
      transactionId,
      assignedAt: new Date().toISOString(),
      slot: availableAccount.currentUsers
    };
    
    if (!availableAccount.usedBy) availableAccount.usedBy = [];
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
      
      sendTelegramNotification(telegramMessage)
        .then(() => console.log(`📢 Telegram notification sent for full ${service} account`))
        .catch(err => console.error('Failed to send Telegram:', err));
    }
    
    await this.saveAccounts();
    
    return {
      ...availableAccount,
      isShared: true,
      slotNumber: availableAccount.currentUsers,
      totalSlots: availableAccount.maxUsers,
      userAssignment
    };
  }

  async addAccount(service, accountData) {
    if (!this.accounts[service]) {
      this.accounts[service] = [];
    }
    
    const newAccount = {
      ...accountData,
      id: `${service}_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
      currentUsers: 0,
      maxUsers: accountData.maxUsers || 5,
      fullyUsed: false,
      usedBy: [],
      addedAt: new Date().toISOString(),
      addedBy: accountData.addedBy || 'admin'
    };
    
    this.accounts[service].push(newAccount);
    await this.saveAccounts();
    
    const telegramMessage = `
🎯 <b>NEW ACCOUNT ADDED</b>

📊 <b>Service:</b> ${service}
📧 <b>Account:</b> ${accountData.email || accountData.username}
👥 <b>Max Users:</b> ${newAccount.maxUsers}
⏰ <b>Added At:</b> ${new Date().toLocaleString()}
🆔 <b>Account ID:</b> ${newAccount.id}

✅ <i>Ready for ${newAccount.maxUsers} new customers!</i>
    `;
    
    sendTelegramNotification(telegramMessage);
    
    return newAccount;
  }

  async removeAccount(accountId) {
    let removedAccount = null;
    let serviceName = null;
    
    for (const [service, accounts] of Object.entries(this.accounts)) {
      const accountIndex = accounts.findIndex(acc => acc.id === accountId);
      
      if (accountIndex !== -1) {
        removedAccount = accounts[accountIndex];
        serviceName = service;
        
        accounts.splice(accountIndex, 1);
        
        if (accounts.length === 0) {
          delete this.accounts[service];
        }
        
        await this.saveAccounts();
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
    const stats = {};
    Object.keys(this.accounts).forEach(service => {
      const serviceAccounts = this.accounts[service];
      let totalSlots = 0;
      let usedSlots = 0;
      let availableAccounts = 0;
      let totalRevenue = 0;
      
      serviceAccounts.forEach(acc => {
        totalSlots += (acc.maxUsers || 5);
        usedSlots += (acc.currentUsers || 0);
        if (!acc.fullyUsed && (acc.currentUsers || 0) < (acc.maxUsers || 5)) {
          availableAccounts++;
        }
        
        // Calculate revenue for this account
        const price = getServicePrice(service);
        totalRevenue += price * (acc.currentUsers || 0);
      });
      
      stats[service] = {
        totalAccounts: serviceAccounts.length,
        totalSlots,
        usedSlots,
        availableSlots: totalSlots - usedSlots,
        availableAccounts,
        fullyUsedAccounts: serviceAccounts.filter(acc => acc.fullyUsed).length,
        totalRevenue,
        accounts: serviceAccounts.map(acc => ({
          id: acc.id,
          email: acc.email,
          username: acc.username,
          currentUsers: acc.currentUsers || 0,
          maxUsers: acc.maxUsers || 5,
          fullyUsed: acc.fullyUsed || false,
          available: !acc.fullyUsed && (acc.currentUsers || 0) < (acc.maxUsers || 5),
          addedAt: acc.addedAt,
          addedBy: acc.addedBy,
          usedBy: acc.usedBy || [],
          revenue: getServicePrice(service) * (acc.currentUsers || 0)
        }))
      };
    });
    
    // Add overall stats
    stats._overall = {
      totalAccounts: Object.values(stats).reduce((sum, s) => sum + s.totalAccounts, 0),
      totalSlots: Object.values(stats).reduce((sum, s) => sum + s.totalSlots, 0),
      usedSlots: Object.values(stats).reduce((sum, s) => sum + s.usedSlots, 0),
      totalRevenue: Object.values(stats).reduce((sum, s) => sum + s.totalRevenue, 0),
      servicesCount: Object.keys(stats).filter(k => k !== '_overall').length
    };
    
    return stats;
  }
}

const accountManager = new AccountManager();

// ==================== SESSION MANAGEMENT (Simplified) ====================
const activeSessions = new Map();

function createSession(username) {
  const sessionId = `sess_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  const session = {
    id: sessionId,
    username,
    createdAt: new Date().toISOString(),
    expiresAt: new Date(Date.now() + SESSION_EXPIRY).toISOString()
  };
  
  activeSessions.set(sessionId, session);
  return sessionId;
}

function validateSession(sessionId) {
  if (!sessionId) return false;
  
  const session = activeSessions.get(sessionId);
  if (!session) return false;
  
  if (new Date(session.expiresAt) < new Date()) {
    activeSessions.delete(sessionId);
    return false;
  }
  
  // Extend session
  session.expiresAt = new Date(Date.now() + SESSION_EXPIRY).toISOString();
  return session.username;
}

function logoutSession(sessionId) {
  activeSessions.delete(sessionId);
}

// ==================== HELPER FUNCTIONS ====================
function getServicePrice(service) {
  const planPrices = {
    // Streaming Services
    'spotify': 400,
    'netflix': 150,
    'primevideo': 100,
    'primevideo_3m': 250,
    'primevideo_6m': 550,
    'primevideo_1y': 1000,
    'showmax_1m': 100,
    'showmax_3m': 250,
    'showmax_6m': 500,
    'showmax_1y': 900,
    'youtubepremium': 100,
    'peacock_tv': 50,
    
    // Music Services
    'applemusic': 250,
    'deezer': 200,
    'tidal': 250,
    'soundcloud': 150,
    'audible': 400,
    
    // Productivity Tools
    'canva': 300,
    'grammarly': 250,
    'skillshare': 350,
    'masterclass': 600,
    'duolingo': 150,
    'notion': 200,
    'microsoft365': 500,
    'googleone': 250,
    'adobecc': 700,
    
    // VPN Services
    'urbanvpn': 100,
    'nordvpn': 350,
    'expressvpn': 400,
    'surfshark': 200,
    'cyberghost': 250,
    'ipvanish': 200,
    'protonvpn': 300,
    'windscribe': 150,
    
    // Gaming Services
    'xbox': 400,
    'playstation': 400,
    'eaplay': 250,
    'ubisoft': 300,
    'geforcenow': 350
  };
  
  return planPrices[service] || 100;
}

// ==================== AUTHENTICATION MIDDLEWARE ====================
function requireAuth(req, res, next) {
  const sessionId = req.cookies?.sessionId || req.headers['x-session-id'] || req.query.sessionId;
  const username = validateSession(sessionId);
  
  if (username) {
    req.username = username;
    req.sessionId = sessionId;
    next();
  } else {
    res.status(401).json({
      success: false,
      error: 'Unauthorized. Please login first.',
      redirect: '/admin/login'
    });
  }
}

// ==================== EMAIL FUNCTIONS ====================
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
              </ul>
            </div>

            <p>Need help? Contact us on WhatsApp: <a href="https://wa.me/254781287381">+254 781 287 381</a></p>
          </div>
          <div style="text-align: center; margin-top: 20px; color: #666; font-size: 12px;">
            <p>&copy; 2024 Chege Tech Premium. All rights reserved.</p>
          </div>
        </div>
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
    return { 
      success: false, 
      error: error.message
    };
  }
}

// ==================== STORE PENDING TRANSACTIONS ====================
const pendingTransactions = new Map();

// ==================== SUBSCRIPTION PLANS ====================
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

// ==================== ADMIN AUTHENTICATION ROUTES ====================
app.post('/api/admin/login', async (req, res) => {
  const { username, password } = req.body;
  
  if (!username || !password) {
    return res.status(400).json({
      success: false,
      error: 'Username and password required'
    });
  }
  
  try {
    // SIMPLIFIED: Plain password comparison (no bcrypt)
    const isValid = username === ADMIN_USERNAME && password === ADMIN_PASSWORD;
    
    if (isValid) {
      const sessionId = createSession(username);
      
      // Set cookie for browser access
      res.cookie('sessionId', sessionId, {
        httpOnly: true,
        secure: process.env.NODE_ENV === 'production',
        maxAge: SESSION_EXPIRY,
        sameSite: 'lax'
      });
      
      res.json({
        success: true,
        message: 'Login successful',
        sessionId,
        user: { username },
        expiresIn: '24 hours'
      });
    } else {
      res.status(401).json({
        success: false,
        error: 'Invalid username or password'
      });
    }
  } catch (error) {
    console.error('Login error:', error);
    res.status(500).json({
      success: false,
      error: 'Internal server error'
    });
  }
});

app.post('/api/admin/logout', (req, res) => {
  const sessionId = req.cookies?.sessionId || req.headers['x-session-id'] || req.body.sessionId;
  if (sessionId) {
    logoutSession(sessionId);
  }
  
  res.clearCookie('sessionId');
  res.json({
    success: true,
    message: 'Logged out successfully'
  });
});

app.get('/api/admin/check-auth', (req, res) => {
  const sessionId = req.cookies?.sessionId || req.headers['x-session-id'] || req.query.sessionId;
  const username = validateSession(sessionId);
  
  if (username) {
    res.json({
      success: true,
      authenticated: true,
      user: { username },
      sessionId
    });
  } else {
    res.json({
      success: false,
      authenticated: false,
      error: 'Not authenticated'
    });
  }
});

// ==================== ENHANCED ADMIN DASHBOARD ROUTES ====================
app.get('/api/admin/dashboard/stats', requireAuth, async (req, res) => {
  try {
    const accountStats = accountManager.getAccountStats();
    const revenueStats = transactionManager.getRevenueStats();
    
    // Get recent transactions
    const recentTransactions = revenueStats.transactions.slice(0, 20);
    
    // Calculate growth metrics
    const today = new Date();
    const lastMonth = new Date();
    lastMonth.setMonth(lastMonth.getMonth() - 1);
    
    const thisMonthTransactions = transactionManager.getTransactionsByDateRange(
      new Date(today.getFullYear(), today.getMonth(), 1).toISOString(),
      today.toISOString()
    );
    
    const lastMonthTransactions = transactionManager.getTransactionsByDateRange(
      new Date(lastMonth.getFullYear(), lastMonth.getMonth(), 1).toISOString(),
      new Date(lastMonth.getFullYear(), lastMonth.getMonth() + 1, 0).toISOString()
    );
    
    const thisMonthRevenue = thisMonthTransactions
      .filter(t => t.status === 'SUCCESS')
      .reduce((sum, t) => sum + (t.amount || 0), 0);
    
    const lastMonthRevenue = lastMonthTransactions
      .filter(t => t.status === 'SUCCESS')
      .reduce((sum, t) => sum + (t.amount || 0), 0);
    
    const monthlyGrowth = lastMonthRevenue > 0 
      ? Math.round(((thisMonthRevenue - lastMonthRevenue) / lastMonthRevenue) * 100)
      : 100;
    
    res.json({
      success: true,
      data: {
        revenue: {
          total: revenueStats.totalRevenue,
          thisMonth: thisMonthRevenue,
          lastMonth: lastMonthRevenue,
          monthlyGrowth,
          dailyRevenue: revenueStats.dailyRevenue,
          monthlyRevenue: revenueStats.monthlyRevenue,
          serviceRevenue: revenueStats.serviceRevenue
        },
        transactions: {
          total: revenueStats.totalTransactions,
          successful: revenueStats.successfulTransactions,
          failed: revenueStats.failedTransactions,
          pending: revenueStats.pendingTransactions,
          recent: recentTransactions
        },
        accounts: {
          total: accountStats._overall.totalAccounts,
          totalSlots: accountStats._overall.totalSlots,
          usedSlots: accountStats._overall.usedSlots,
          availableSlots: accountStats._overall.availableSlots,
          totalRevenue: accountStats._overall.totalRevenue,
          services: Object.keys(accountStats).filter(k => k !== '_overall').length,
          breakdown: accountStats
        },
        pendingPayments: pendingTransactions.size,
        activeSessions: activeSessions.size,
        lastUpdated: new Date().toISOString()
      }
    });
  } catch (error) {
    console.error('Dashboard stats error:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

// ==================== EXISTING CUSTOMER ROUTES ====================
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

app.get('/api/plans', (req, res) => {
  res.json({ success: true, categories: subscriptionPlans });
});

app.post('/api/initiate-payment', async (req, res) => {
  try {
    const { planId, phoneNumber, customerName, email } = req.body;

    console.log('🔄 Payment initiation request:', { planId, phoneNumber, customerName, email });

    if (!email) {
      return res.status(400).json({
        success: false,
        error: 'Email address is required to receive account details'
      });
    }

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

    let formattedPhone = phoneNumber.trim();
    if (formattedPhone.startsWith('0')) {
      formattedPhone = '254' + formattedPhone.substring(1);
    } else if (formattedPhone.startsWith('+')) {
      formattedPhone = formattedPhone.substring(1);
    }

    if (!formattedPhone.startsWith('254') || formattedPhone.length !== 12) {
      return res.status(400).json({
        success: false,
        error: 'Phone number must be in format 2547XXXXXXXX (12 digits)'
      });
    }

    const availability = accountManager.checkAccountAvailability(planId);
    if (!availability.available) {
      return res.status(400).json({
        success: false,
        error: `Sorry, ${plan.name} accounts are currently out of stock. Please try another service or contact support.`,
        outOfStock: true
      });
    }

    const reference = `CHEGE-${planId.toUpperCase()}-${Date.now()}`;

    const stkPayload = {
      phone_number: formattedPhone,
      amount: plan.price,
      provider: 'm-pesa',
      channel_id: process.env.CHANNEL_ID,
      external_reference: reference,
      customer_name: customerName || 'Chege Tech Customer'
    };

    console.log('🔄 Initiating payment for:', plan.name);
    console.log('📋 Reference:', reference);
    console.log('💰 Amount:', plan.price);
    console.log('📧 Email:', email);
    
    const response = await client.stkPush(stkPayload);
    
    console.log('✅ PayHero STK Push Response:', response.reference || response.id);

    // Record pending transaction
    await transactionManager.addTransaction({
      reference,
      planId,
      planName: plan.name,
      customerEmail: email,
      customerName: customerName || 'Customer',
      amount: plan.price,
      phone: formattedPhone,
      status: 'PENDING',
      payheroReference: response.reference || response.id
    });

    pendingTransactions.set(reference, {
      planId,
      planName: plan.name,
      customerEmail: email,
      customerName: customerName || 'Customer',
      amount: plan.price,
      timestamp: new Date().toISOString(),
      yourReference: reference,
      payheroReference: response.reference || response.id,
      payheroResponse: response,
      availability: availability
    });

    const telegramMessage = `
💰 <b>PAYMENT INITIATED</b>

📊 <b>Service:</b> ${plan.name}
👤 <b>Customer:</b> ${customerName || 'Anonymous'}
📧 <b>Email:</b> ${email}
💰 <b>Amount:</b> KES ${plan.price}
📱 <b>Phone:</b> ${formattedPhone}
🔗 <b>Reference:</b> ${reference}

⏳ <i>Waiting for payment confirmation...</i>
    `;
    
    sendTelegramNotification(telegramMessage);

    res.json({
      success: true,
      message: `Payment initiated for ${plan.name}`,
      data: {
        reference,
        payheroReference: response.reference || response.id,
        plan: plan.name,
        category: categoryName,
        amount: plan.price,
        duration: plan.duration,
        checkoutMessage: `You will receive an M-Pesa prompt to pay KES ${plan.price} for ${plan.name}`,
        note: 'After payment, check status using your reference number',
        availability: availability.availableSlots
      }
    });

  } catch (error) {
    console.error('❌ Payment initiation error:', error.message);
    
    // Record failed transaction
    await transactionManager.addTransaction({
      planId: req.body.planId,
      planName: 'Unknown',
      customerEmail: req.body.email,
      customerName: req.body.customerName,
      amount: req.body.planId ? getServicePrice(req.body.planId) : 0,
      status: 'FAILED',
      error: error.message
    });
    
    res.status(500).json({
      success: false,
      error: error.message || 'Failed to initiate payment'
    });
  }
});

app.get('/api/check-payment/:reference', async (req, res) => {
  try {
    const { reference } = req.params;
    
    console.log('🔄 Checking payment status for reference:', reference);
    
    if (!client) {
      return res.json({
        success: false,
        status: 'error',
        error: 'Payment service not initialized'
      });
    }
    
    const transaction = pendingTransactions.get(reference);
    
    if (!transaction) {
      return res.json({
        success: false,
        status: 'error',
        error: 'Transaction not found',
        message: 'Invalid reference or transaction expired'
      });
    }
    
    const { payheroReference, planId, planName, customerEmail, customerName, amount } = transaction;
    
    try {
      const status = await client.transactionStatus(payheroReference || reference);
      console.log('📊 Payment status:', status.status);
      console.log('📊 Success flag:', status.success);
      
      // Update transaction record
      await transactionManager.addTransaction({
        reference,
        planId,
        planName,
        customerEmail,
        customerName,
        amount,
        phone: status.phone || 'Unknown',
        status: status.status,
        payheroReference,
        payheroStatus: status
      });
      
      if (status.status === 'SUCCESS') {
        console.log('🎉 Payment SUCCESSFUL for reference:', reference);
        
        const assignedAccount = await accountManager.assignAccount(planId, customerEmail, customerName, reference);
        
        if (!assignedAccount) {
          console.error('❌ No account available after payment! Refunding may be needed.');
          
          const telegramMessage = `
🚨 <b>CRITICAL ERROR - NO ACCOUNT AFTER PAYMENT</b>

📊 <b>Service:</b> ${planName}
👤 <b>Customer:</b> ${customerName || 'Anonymous'}
📧 <b>Email:</b> ${customerEmail}
💰 <b>Amount:</b> KES ${transaction.amount}
🔗 <b>Reference:</b> ${reference}

🚨 <i>Payment was successful but no account available! Manual intervention required.</i>
          `;
          
          sendTelegramNotification(telegramMessage);
          
          return res.json({
            success: false,
            status: 'error',
            error: 'Payment successful but no account available. Please contact support for refund.',
            paymentSuccess: true,
            needSupport: true
          });
        }
        
        console.log('✅ Account assigned:', {
          email: assignedAccount.email,
          slot: assignedAccount.slotNumber,
          totalSlots: assignedAccount.totalSlots
        });
        
        try {
          const emailResult = await sendAccountEmail(customerEmail, planName, assignedAccount, customerName);
          
          if (emailResult.success) {
            console.log(`✅ Account sent to ${customerEmail} for ${planName}`);
            
            const telegramMessage = `
✅ <b>PAYMENT CONFIRMED & ACCOUNT DELIVERED</b>

📊 <b>Service:</b> ${planName}
👤 <b>Customer:</b> ${customerName || 'Anonymous'}
📧 <b>Email:</b> ${customerEmail}
💰 <b>Amount:</b> KES ${transaction.amount}
🔢 <b>Slot Assigned:</b> ${assignedAccount.slotNumber}/${assignedAccount.totalSlots}
🔗 <b>Reference:</b> ${reference}
📨 <b>Email Status:</b> Sent successfully

🎉 <i>Transaction completed successfully!</i>
            `;
            
            sendTelegramNotification(telegramMessage);
          } else {
            console.log(`⚠️ Email sending failed for ${customerEmail}:`, emailResult.error);
            
            const telegramMessage = `
⚠️ <b>PAYMENT CONFIRMED - EMAIL FAILED</b>

📊 <b>Service:</b> ${planName}
👤 <b>Customer:</b> ${customerName || 'Anonymous'}
📧 <b>Email:</b> ${customerEmail}
💰 <b>Amount:</b> KES ${transaction.amount}
🔢 <b>Slot Assigned:</b> ${assignedAccount.slotNumber}/${assignedAccount.totalSlots}
🔗 <b>Reference:</b> ${reference}
❌ <b>Email Status:</b> Failed - ${emailResult.error}

🚨 <i>Account was assigned but email failed! Manual delivery required.</i>
            `;
            
            sendTelegramNotification(telegramMessage);
          }
        } catch (emailError) {
          console.error('❌ Email sending error:', emailError);
        }
        
        pendingTransactions.delete(reference);
        
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
        
        pendingTransactions.delete(reference);
        
        const telegramMessage = `
❌ <b>PAYMENT FAILED/CANCELLED</b>

📊 <b>Service:</b> ${planName}
👤 <b>Customer:</b> ${customerName || 'Anonymous'}
📧 <b>Email:</b> ${customerEmail}
💰 <b>Amount:</b> KES ${transaction.amount}
🔗 <b>Reference:</b> ${reference}
📊 <b>Status:</b> ${status.status}

💡 <i>No account was assigned. Slot remains available.</i>
        `;
        
        sendTelegramNotification(telegramMessage);
        
        return res.json({
          success: true,
          paymentSuccess: false,
          status: 'failed',
          paymentStatus: 'failed',
          reference: reference,
          message: `Payment ${status.status.toLowerCase()}. Please try again.`,
          timestamp: new Date().toISOString()
        });
      } else if (status.status === 'QUEUED') {
        console.log('⏳ Payment still QUEUED (user hasn\'t entered PIN):', reference);
        
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
        console.log('⏳ Payment status:', status.status);
        return res.json({
          success: true,
          paymentSuccess: false,
          status: status.status.toLowerCase(),
          paymentStatus: status.status.toLowerCase(),
          reference: reference,
          message: `Payment status: ${status.status}`,
          timestamp: new Date().toISOString(),
          isProcessing: true
        });
      }
      
    } catch (payheroError) {
      if (payheroError.response && payheroError.response.status === 404) {
        console.log('ℹ️ Transaction not found yet (404) - payment still processing');
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
      
      console.error('❌ Payment check error:', payheroError.message);
      return res.json({
        success: false,
        status: 'error',
        error: 'Failed to check payment status',
        message: 'Failed to check payment status. Please try again.'
      });
    }
    
  } catch (error) {
    console.error('❌ Payment check error:', error.message);
    return res.json({
      success: false,
      status: 'error',
      error: 'Failed to check payment status',
      message: 'Failed to check payment status. Please try again.'
    });
  }
});

// ==================== ENHANCED ADMIN ROUTES ====================
app.post('/api/admin/add-account', requireAuth, async (req, res) => {
  const { service, account } = req.body;
  
  if (!service || !account) {
    return res.status(400).json({ 
      success: false, 
      error: 'Service and account details required' 
    });
  }
  
  try {
    const newAccount = await accountManager.addAccount(service, {
      ...account,
      addedBy: req.username
    });
    
    res.json({
      success: true,
      message: `Account added to ${service}`,
      data: newAccount,
      stats: accountManager.getAccountStats()[service]
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

app.post('/api/admin/remove-account', requireAuth, async (req, res) => {
  const { accountId } = req.body;
  
  if (!accountId) {
    return res.status(400).json({ 
      success: false, 
      error: 'Account ID is required' 
    });
  }
  
  try {
    const removedAccount = await accountManager.removeAccount(accountId);
    
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
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

app.get('/api/admin/account/:accountId', requireAuth, (req, res) => {
  const { accountId } = req.params;
  
  const account = accountManager.getAccountById(accountId);
  
  if (!account) {
    return res.status(404).json({ 
      success: false, 
      error: 'Account not found' 
    });
  }
  
  res.json({
    success: true,
    account: account
  });
});

app.get('/api/admin/stats', requireAuth, (req, res) => {
  res.json({
    success: true,
    stats: accountManager.getAccountStats(),
    revenueStats: transactionManager.getRevenueStats(),
    pendingTransactions: pendingTransactions.size,
    activeSessions: activeSessions.size,
    serverTime: new Date().toISOString()
  });
});

app.get('/api/admin/accounts', requireAuth, (req, res) => {
  res.json({
    success: true,
    accounts: accountManager.accounts
  });
});

app.get('/api/admin/transactions', requireAuth, (req, res) => {
  const { limit = 100, offset = 0, status } = req.query;
  const revenueStats = transactionManager.getRevenueStats();
  
  let transactions = revenueStats.transactions;
  
  if (status) {
    transactions = transactions.filter(t => t.status === status);
  }
  
  const paginated = transactions.slice(parseInt(offset), parseInt(offset) + parseInt(limit));
  
  res.json({
    success: true,
    transactions: paginated,
    total: transactions.length,
    limit: parseInt(limit),
    offset: parseInt(offset)
  });
});

// ==================== ADMIN PANEL ROUTE ====================
app.get('/admin', (req, res) => {
  res.send(`
    <!DOCTYPE html>
    <html>
    <head>
      <title>Chege Tech - Admin Dashboard</title>
      <meta charset="UTF-8">
      <meta name="viewport" content="width=device-width, initial-scale=1.0">
      <script src="https://cdn.jsdelivr.net/npm/chart.js"></script>
      <script src="https://cdn.jsdelivr.net/npm/axios/dist/axios.min.js"></script>
      <style>
        * {
          margin: 0;
          padding: 0;
          box-sizing: border-box;
          font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif;
        }
        
        body {
          background: #f5f5f5;
          color: #333;
          min-height: 100vh;
        }
        
        .login-container {
          max-width: 400px;
          margin: 100px auto;
          background: white;
          padding: 40px;
          border-radius: 15px;
          box-shadow: 0 10px 30px rgba(0,0,0,0.1);
          text-align: center;
        }
        
        .login-container h2 {
          color: #667eea;
          margin-bottom: 30px;
          font-size: 1.8rem;
        }
        
        .login-input {
          width: 100%;
          padding: 15px;
          margin-bottom: 20px;
          border: 2px solid #e5e7eb;
          border-radius: 10px;
          font-size: 1rem;
          transition: border-color 0.3s ease;
        }
        
        .login-input:focus {
          outline: none;
          border-color: #667eea;
        }
        
        .login-btn {
          width: 100%;
          padding: 15px;
          background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
          color: white;
          border: none;
          border-radius: 10px;
          font-size: 1rem;
          font-weight: 600;
          cursor: pointer;
          transition: transform 0.3s ease;
        }
        
        .login-btn:hover {
          transform: translateY(-2px);
        }
        
        .error-message {
          background: #fee2e2;
          color: #dc2626;
          padding: 12px;
          border-radius: 8px;
          margin-bottom: 20px;
          display: none;
        }
        
        .dashboard-container {
          max-width: 1400px;
          margin: 0 auto;
          padding: 20px;
        }
        
        .dashboard-header {
          background: white;
          padding: 25px;
          border-radius: 15px;
          margin-bottom: 25px;
          box-shadow: 0 5px 15px rgba(0,0,0,0.08);
          display: flex;
          justify-content: space-between;
          align-items: center;
        }
        
        .dashboard-header h1 {
          color: #667eea;
          font-size: 2rem;
          display: flex;
          align-items: center;
          gap: 15px;
        }
        
        .logout-btn {
          background: #ef4444;
          color: white;
          border: none;
          padding: 12px 24px;
          border-radius: 8px;
          cursor: pointer;
          font-weight: 600;
          transition: background 0.3s ease;
        }
        
        .logout-btn:hover {
          background: #dc2626;
        }
        
        .tabs {
          display: flex;
          gap: 10px;
          margin-bottom: 25px;
          background: white;
          padding: 15px;
          border-radius: 15px;
          box-shadow: 0 5px 15px rgba(0,0,0,0.08);
        }
        
        .tab-btn {
          padding: 12px 24px;
          background: #f3f4f6;
          border: none;
          border-radius: 8px;
          cursor: pointer;
          font-weight: 500;
          color: #666;
          transition: all 0.3s ease;
        }
        
        .tab-btn:hover {
          background: #e5e7eb;
        }
        
        .tab-btn.active {
          background: #667eea;
          color: white;
        }
        
        .tab-content {
          display: none;
        }
        
        .tab-content.active {
          display: block;
        }
        
        .stats-grid {
          display: grid;
          grid-template-columns: repeat(auto-fit, minmax(280px, 1fr));
          gap: 25px;
          margin-bottom: 30px;
        }
        
        .stat-card {
          background: white;
          padding: 25px;
          border-radius: 15px;
          box-shadow: 0 5px 15px rgba(0,0,0,0.08);
          border-left: 5px solid #667eea;
          transition: transform 0.3s ease;
        }
        
        .stat-card:hover {
          transform: translateY(-5px);
        }
        
        .stat-card.revenue {
          border-left-color: #10b981;
        }
        
        .stat-card.accounts {
          border-left-color: #3b82f6;
        }
        
        .stat-card.transactions {
          border-left-color: #8b5cf6;
        }
        
        .stat-card.users {
          border-left-color: #f59e0b;
        }
        
        .stat-card h3 {
          color: #666;
          font-size: 0.9rem;
          text-transform: uppercase;
          letter-spacing: 1px;
          margin-bottom: 10px;
        }
        
        .stat-card .value {
          font-size: 2.5rem;
          font-weight: bold;
          margin: 10px 0;
        }
        
        .stat-card.revenue .value {
          color: #10b981;
        }
        
        .stat-card.accounts .value {
          color: #3b82f6;
        }
        
        .stat-card.transactions .value {
          color: #8b5cf6;
        }
        
        .stat-card.users .value {
          color: #f59e0b;
        }
        
        .stat-card .change {
          font-size: 0.9rem;
          color: #666;
          display: flex;
          align-items: center;
          gap: 5px;
        }
        
        .stat-card .change.positive {
          color: #10b981;
        }
        
        .stat-card .change.negative {
          color: #ef4444;
        }
        
        .content-card {
          background: white;
          padding: 25px;
          border-radius: 15px;
          box-shadow: 0 5px 15px rgba(0,0,0,0.08);
          margin-bottom: 25px;
        }
        
        .content-card h3 {
          color: #667eea;
          margin-bottom: 20px;
          padding-bottom: 15px;
          border-bottom: 2px solid #f3f4f6;
          display: flex;
          align-items: center;
          gap: 10px;
        }
        
        .form-group {
          margin-bottom: 20px;
        }
        
        .form-group label {
          display: block;
          margin-bottom: 8px;
          font-weight: 500;
          color: #555;
        }
        
        .form-control {
          width: 100%;
          padding: 12px 15px;
          border: 2px solid #e5e7eb;
          border-radius: 8px;
          font-size: 1rem;
          transition: border-color 0.3s ease;
        }
        
        .form-control:focus {
          outline: none;
          border-color: #667eea;
        }
        
        .btn {
          padding: 12px 24px;
          border: none;
          border-radius: 8px;
          cursor: pointer;
          font-weight: 500;
          transition: all 0.3s ease;
          display: inline-flex;
          align-items: center;
          gap: 8px;
        }
        
        .btn-primary {
          background: #667eea;
          color: white;
        }
        
        .btn-primary:hover {
          background: #5a67d8;
        }
        
        .btn-danger {
          background: #ef4444;
          color: white;
        }
        
        .btn-danger:hover {
          background: #dc2626;
        }
        
        .btn-success {
          background: #10b981;
          color: white;
        }
        
        .btn-success:hover {
          background: #059669;
        }
        
        .table-container {
          overflow-x: auto;
          margin-top: 20px;
        }
        
        .account-table {
          width: 100%;
          border-collapse: collapse;
          min-width: 800px;
        }
        
        .account-table th {
          background: #f8fafc;
          padding: 15px;
          text-align: left;
          font-weight: 600;
          color: #475569;
          border-bottom: 2px solid #e2e8f0;
        }
        
        .account-table td {
          padding: 15px;
          border-bottom: 1px solid #e2e8f0;
        }
        
        .account-table tr:hover {
          background: #f8fafc;
        }
        
        .status-badge {
          padding: 6px 12px;
          border-radius: 20px;
          font-size: 0.85rem;
          font-weight: 500;
        }
        
        .status-badge.available {
          background: #d1fae5;
          color: #065f46;
        }
        
        .status-badge.full {
          background: #fee2e2;
          color: #991b1b;
        }
        
        .action-buttons {
          display: flex;
          gap: 8px;
        }
        
        .message {
          padding: 15px;
          border-radius: 8px;
          margin-bottom: 20px;
          display: none;
        }
        
        .message.success {
          background: #d1fae5;
          color: #065f46;
          border: 1px solid #a7f3d0;
        }
        
        .message.error {
          background: #fee2e2;
          color: #991b1b;
          border: 1px solid #fecaca;
        }
        
        .last-updated {
          text-align: center;
          color: #666;
          margin-top: 20px;
          font-size: 0.9rem;
        }
        
        .refresh-btn {
          position: fixed;
          bottom: 30px;
          right: 30px;
          background: #667eea;
          color: white;
          border: none;
          border-radius: 50%;
          width: 60px;
          height: 60px;
          cursor: pointer;
          box-shadow: 0 5px 15px rgba(0,0,0,0.2);
          display: flex;
          align-items: center;
          justify-content: center;
          font-size: 1.5rem;
          transition: all 0.3s ease;
          z-index: 1000;
        }
        
        .refresh-btn:hover {
          background: #5a67d8;
          transform: rotate(180deg);
        }
        
        @media (max-width: 768px) {
          .dashboard-container {
            padding: 10px;
          }
          
          .stats-grid {
            grid-template-columns: 1fr;
          }
          
          .dashboard-header {
            flex-direction: column;
            gap: 20px;
            text-align: center;
          }
          
          .tabs {
            flex-wrap: wrap;
          }
        }
      </style>
    </head>
    <body>
      <!-- Login Screen -->
      <div id="loginScreen" class="login-container">
        <h2>🔒 Admin Dashboard Login</h2>
        <div id="loginError" class="error-message"></div>
        <input type="text" id="username" class="login-input" placeholder="Username" value="admin">
        <input type="password" id="password" class="login-input" placeholder="Password" value="chegeadmin123">
        <button onclick="login()" class="login-btn">Login</button>
        <p style="margin-top: 20px; color: #666; font-size: 0.9rem;">
          Enter the admin password to access the dashboard
        </p>
      </div>
      
      <!-- Dashboard Screen -->
      <div id="dashboard" style="display: none;">
        <div class="dashboard-container">
          <div class="dashboard-header">
            <h1>
              <span>💰</span>
              Chege Tech Admin Dashboard
            </h1>
            <button onclick="logout()" class="logout-btn">Logout</button>
          </div>
          
          <div id="message" class="message"></div>
          
          <div class="tabs">
            <button class="tab-btn active" onclick="showTab('overview')">📊 Overview</button>
            <button class="tab-btn" onclick="showTab('accounts')">📋 Accounts</button>
            <button class="tab-btn" onclick="showTab('addAccount')">➕ Add Account</button>
            <button class="tab-btn" onclick="showTab('transactions')">💰 Transactions</button>
          </div>
          
          <!-- Overview Tab -->
          <div id="overviewTab" class="tab-content active">
            <div class="stats-grid">
              <div class="stat-card revenue">
                <h3>Total Revenue</h3>
                <div class="value" id="totalRevenue">KES 0</div>
                <div class="change positive" id="revenueChange">
                  <span>+0% this month</span>
                </div>
              </div>
              
              <div class="stat-card accounts">
                <h3>Active Accounts</h3>
                <div class="value" id="totalAccounts">0</div>
                <div class="change" id="accountsStatus">
                  <span>0 available</span>
                </div>
              </div>
              
              <div class="stat-card transactions">
                <h3>Total Transactions</h3>
                <div class="value" id="totalTransactions">0</div>
                <div class="change positive" id="transactionRate">
                  <span>100% success rate</span>
                </div>
              </div>
              
              <div class="stat-card users">
                <h3>Active Users</h3>
                <div class="value" id="activeUsers">0</div>
                <div class="change" id="usersTrend">
                  <span>Across 0 services</span>
                </div>
              </div>
            </div>
            
            <div class="content-card">
              <h3>📈 Revenue Chart</h3>
              <canvas id="revenueChart" height="100"></canvas>
            </div>
            
            <div class="last-updated">
              Last updated: <span id="lastUpdated">Never</span>
            </div>
          </div>
          
          <!-- Accounts Tab -->
          <div id="accountsTab" class="tab-content">
            <div class="content-card">
              <h3>📋 Manage Accounts</h3>
              <div class="table-container">
                <table class="account-table" id="accountsTable">
                  <thead>
                    <tr>
                      <th>Service</th>
                      <th>Account</th>
                      <th>Used Slots</th>
                      <th>Status</th>
                      <th>Revenue</th>
                      <th>Actions</th>
                    </tr>
                  </thead>
                  <tbody id="accountsTableBody">
                    <tr><td colspan="6" style="text-align: center;">Loading accounts...</td></tr>
                  </tbody>
                </table>
              </div>
            </div>
          </div>
          
          <!-- Add Account Tab -->
          <div id="addAccountTab" class="tab-content">
            <div class="content-card">
              <h3>➕ Add New Account</h3>
              <form id="addAccountForm">
                <div class="form-group">
                  <label for="service">Service:</label>
                  <select id="service" class="form-control" required>
                    <option value="">Select Service</option>
                    <option value="spotify">Spotify Premium</option>
                    <option value="netflix">Netflix</option>
                    <option value="primevideo">Prime Video</option>
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
                  </select>
                </div>
                
                <div class="form-group">
                  <label for="email">Email:</label>
                  <input type="email" id="email" class="form-control" placeholder="account@example.com" required>
                </div>
                
                <div class="form-group">
                  <label for="password">Password:</label>
                  <input type="text" id="password" class="form-control" placeholder="Account password" required>
                </div>
                
                <div class="form-group">
                  <label for="username">Username (optional):</label>
                  <input type="text" id="accountUsername" class="form-control" placeholder="Username if different">
                </div>
                
                <div class="form-group">
                  <label for="maxUsers">Max Users:</label>
                  <input type="number" id="maxUsers" class="form-control" value="5" min="1" max="10">
                </div>
                
                <div class="form-group">
                  <label for="instructions">Instructions:</label>
                  <textarea id="instructions" class="form-control" rows="3" placeholder="Special instructions for customers...">Login using provided credentials. Do not change password.</textarea>
                </div>
                
                <button type="submit" class="btn btn-success">
                  <span>➕</span> Add Account
                </button>
                <button type="button" class="btn" onclick="resetAddForm()">
                  <span>🗑️</span> Clear Form
                </button>
              </form>
            </div>
          </div>
          
          <!-- Transactions Tab -->
          <div id="transactionsTab" class="tab-content">
            <div class="content-card">
              <h3>💰 Transaction History</h3>
              <div class="table-container">
                <table class="account-table">
                  <thead>
                    <tr>
                      <th>Date</th>
                      <th>Reference</th>
                      <th>Service</th>
                      <th>Customer</th>
                      <th>Amount</th>
                      <th>Status</th>
                    </tr>
                  </thead>
                  <tbody id="transactionsTableBody">
                    <tr><td colspan="6" style="text-align: center;">Loading transactions...</td></tr>
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        </div>
        
        <button class="refresh-btn" onclick="loadDashboardData()">
          <span>🔄</span>
        </button>
      </div>
      
      <script>
        let currentSessionId = null;
        let username = null;
        let revenueChart = null;
        
        // Check if already logged in
        async function checkAuth() {
          try {
            const response = await fetch('/api/admin/check-auth');
            const data = await response.json();
            
            if (data.authenticated) {
              currentSessionId = data.sessionId;
              username = data.user.username;
              showDashboard();
              loadDashboardData();
            } else {
              showLogin();
            }
          } catch (error) {
            showLogin();
          }
        }
        
        // Login function
        async function login() {
          const usernameInput = document.getElementById('username').value;
          const passwordInput = document.getElementById('password').value;
          
          if (!usernameInput || !passwordInput) {
            showLoginError('Please enter username and password');
            return;
          }
          
          try {
            const response = await fetch('/api/admin/login', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ 
                username: usernameInput, 
                password: passwordInput 
              })
            });
            
            const data = await response.json();
            
            if (data.success) {
              currentSessionId = data.sessionId;
              username = data.user.username;
              showDashboard();
              loadDashboardData();
            } else {
              showLoginError('Login failed: ' + data.error);
            }
          } catch (error) {
            showLoginError('Network error: ' + error.message);
          }
        }
        
        // Logout function
        async function logout() {
          try {
            await fetch('/api/admin/logout', {
              method: 'POST',
              headers: { 
                'Content-Type': 'application/json',
                'x-session-id': currentSessionId 
              }
            });
          } catch (error) {
            console.error('Logout error:', error);
          }
          
          currentSessionId = null;
          username = null;
          showLogin();
        }
        
        // Show login screen
        function showLogin() {
          document.getElementById('loginScreen').style.display = 'block';
          document.getElementById('dashboard').style.display = 'none';
        }
        
        // Show dashboard
        function showDashboard() {
          document.getElementById('loginScreen').style.display = 'none';
          document.getElementById('dashboard').style.display = 'block';
        }
        
        // Show login error
        function showLoginError(message) {
          const errorDiv = document.getElementById('loginError');
          errorDiv.textContent = message;
          errorDiv.style.display = 'block';
          setTimeout(() => {
            errorDiv.style.display = 'none';
          }, 5000);
        }
        
        // Show message
        function showMessage(message, type = 'success') {
          const messageDiv = document.getElementById('message');
          messageDiv.textContent = message;
          messageDiv.className = 'message ' + type;
          messageDiv.style.display = 'block';
          
          setTimeout(() => {
            messageDiv.style.display = 'none';
          }, 5000);
        }
        
        // Switch tabs
        function showTab(tabName) {
          // Update tab buttons
          document.querySelectorAll('.tab-btn').forEach(btn => {
            btn.classList.remove('active');
          });
          event.target.classList.add('active');
          
          // Update tab content
          document.querySelectorAll('.tab-content').forEach(content => {
            content.classList.remove('active');
          });
          document.getElementById(tabName + 'Tab').classList.add('active');
          
          // Load data for specific tabs
          if (tabName === 'accounts') {
            loadAccounts();
          } else if (tabName === 'transactions') {
            loadTransactions();
          }
        }
        
        // Load dashboard data
        async function loadDashboardData() {
          if (!currentSessionId) return;
          
          try {
            const response = await fetch('/api/admin/dashboard/stats', {
              headers: { 'x-session-id': currentSessionId }
            });
            
            if (response.status === 401) {
              logout();
              return;
            }
            
            const data = await response.json();
            
            if (data.success) {
              updateDashboard(data.data);
            }
          } catch (error) {
            console.error('Error loading dashboard:', error);
          }
        }
        
        // Update dashboard with data
        function updateDashboard(data) {
          // Update stats cards
          document.getElementById('totalRevenue').textContent = 
            'KES ' + data.revenue.total.toLocaleString();
          
          document.getElementById('revenueChange').innerHTML = 
            \`<span>\${data.revenue.monthlyGrowth >= 0 ? '+' : ''}\${data.revenue.monthlyGrowth}% this month</span>\`;
          
          document.getElementById('totalAccounts').textContent = 
            data.accounts.totalAccounts;
          
          document.getElementById('accountsStatus').innerHTML = 
            \`<span>\${data.accounts.availableSlots} slots available</span>\`;
          
          document.getElementById('totalTransactions').textContent = 
            data.transactions.total;
          
          const successRate = data.transactions.total > 0 ? 
            Math.round((data.transactions.successful / data.transactions.total) * 100) : 100;
          
          document.getElementById('transactionRate').innerHTML = 
            \`<span>\${successRate}% success rate</span>\`;
          
          document.getElementById('activeUsers').textContent = 
            data.accounts.usedSlots;
          
          document.getElementById('usersTrend').innerHTML = 
            \`<span>Across \${data.accounts.services} services</span>\`;
          
          // Update last updated time
          document.getElementById('lastUpdated').textContent = 
            new Date(data.lastUpdated).toLocaleString();
          
          // Update revenue chart
          updateRevenueChart(data.revenue.monthlyRevenue);
          
          // Update accounts table
          updateAccountsTable(data.accounts.breakdown);
          
          // Update transactions table
          updateTransactionsTable(data.transactions.recent);
        }
        
        // Update revenue chart
        function updateRevenueChart(monthlyRevenue) {
          const ctx = document.getElementById('revenueChart').getContext('2d');
          
          if (revenueChart) {
            revenueChart.destroy();
          }
          
          const months = Object.keys(monthlyRevenue);
          const revenue = Object.values(monthlyRevenue);
          
          revenueChart = new Chart(ctx, {
            type: 'line',
            data: {
              labels: months,
              datasets: [{
                label: 'Monthly Revenue',
                data: revenue,
                borderColor: '#667eea',
                backgroundColor: 'rgba(102, 126, 234, 0.1)',
                borderWidth: 3,
                fill: true,
                tension: 0.4
              }]
            },
            options: {
              responsive: true,
              maintainAspectRatio: false,
              scales: {
                y: {
                  beginAtZero: true,
                  ticks: {
                    callback: function(value) {
                      return 'KES ' + value.toLocaleString();
                    }
                  }
                }
              },
              plugins: {
                legend: {
                  display: false
                },
                tooltip: {
                  callbacks: {
                    label: function(context) {
                      return 'Revenue: KES ' + context.parsed.y.toLocaleString();
                    }
                  }
                }
              }
            }
          });
        }
        
        // Load accounts
        async function loadAccounts() {
          if (!currentSessionId) return;
          
          try {
            const response = await fetch('/api/admin/accounts', {
              headers: { 'x-session-id': currentSessionId }
            });
            
            if (response.status === 401) {
              logout();
              return;
            }
            
            const data = await response.json();
            
            if (data.success) {
              updateAccountsTable(data.accounts);
            }
          } catch (error) {
            console.error('Error loading accounts:', error);
          }
        }
        
        // Update accounts table
        function updateAccountsTable(accountsData) {
          const tableBody = document.getElementById('accountsTableBody');
          
          if (!accountsData || Object.keys(accountsData).length === 0) {
            tableBody.innerHTML = '<tr><td colspan="6" style="text-align: center;">No accounts found</td></tr>';
            return;
          }
          
          let html = '';
          
          for (const [service, accounts] of Object.entries(accountsData)) {
            if (service === '_overall') continue;
            
            accounts.forEach(account => {
              if (typeof account === 'object') {
                const revenue = getServicePrice(service) * (account.currentUsers || 0);
                
                html += \`
                  <tr>
                    <td><strong>\${service.replace('_', ' ').toUpperCase()}</strong></td>
                    <td>
                      <div>\${account.email || account.username || 'N/A'}</div>
                      <small style="color: #666; font-size: 0.8rem;">ID: \${account.id}</small>
                    </td>
                    <td>\${account.currentUsers || 0}/\${account.maxUsers || 5}</td>
                    <td>
                      <span class="status-badge \${account.fullyUsed ? 'full' : 'available'}">
                        \${account.fullyUsed ? 'FULL' : 'AVAILABLE'}
                      </span>
                    </td>
                    <td>KES \${revenue.toLocaleString()}</td>
                    <td>
                      <div class="action-buttons">
                        <button class="btn btn-danger" onclick="removeAccount('\${account.id}')">
                          🗑️ Remove
                        </button>
                      </div>
                    </td>
                  </tr>
                \`;
              }
            });
          }
          
          tableBody.innerHTML = html || '<tr><td colspan="6" style="text-align: center;">No accounts found</td></tr>';
        }
        
        // Load transactions
        async function loadTransactions() {
          if (!currentSessionId) return;
          
          try {
            const response = await fetch('/api/admin/transactions?limit=20', {
              headers: { 'x-session-id': currentSessionId }
            });
            
            if (response.status === 401) {
              logout();
              return;
            }
            
            const data = await response.json();
            
            if (data.success) {
              updateTransactionsTable(data.transactions);
            }
          } catch (error) {
            console.error('Error loading transactions:', error);
          }
        }
        
        // Update transactions table
        function updateTransactionsTable(transactions) {
          const tableBody = document.getElementById('transactionsTableBody');
          
          if (!transactions || transactions.length === 0) {
            tableBody.innerHTML = '<tr><td colspan="6" style="text-align: center;">No transactions found</td></tr>';
            return;
          }
          
          let html = '';
          
          transactions.forEach(txn => {
            const date = new Date(txn.timestamp).toLocaleDateString();
            const statusColor = txn.status === 'SUCCESS' ? '#10b981' : 
                               txn.status === 'FAILED' ? '#ef4444' : 
                               txn.status === 'PENDING' ? '#f59e0b' : '#666';
            
            html += \`
              <tr>
                <td>\${date}</td>
                <td><small>\${txn.reference || 'N/A'}</small></td>
                <td>\${txn.planName || 'Unknown'}</td>
                <td>\${txn.customerEmail || 'N/A'}</td>
                <td>KES \${(txn.amount || 0).toLocaleString()}</td>
                <td>
                  <span style="color: \${statusColor}; font-weight: 500;">
                    \${txn.status || 'UNKNOWN'}
                  </span>
                </td>
              </tr>
            \`;
          });
          
          tableBody.innerHTML = html;
        }
        
        // Remove account
        async function removeAccount(accountId) {
          if (!confirm('Are you sure you want to remove this account? This action cannot be undone!')) {
            return;
          }
          
          if (!currentSessionId) return;
          
          try {
            const response = await fetch('/api/admin/remove-account', {
              method: 'POST',
              headers: {
                'Content-Type': 'application/json',
                'x-session-id': currentSessionId
              },
              body: JSON.stringify({ accountId })
            });
            
            const data = await response.json();
            
            if (data.success) {
              showMessage('Account removed successfully! Telegram notification sent.', 'success');
              loadAccounts();
              loadDashboardData();
            } else {
              showMessage('Error: ' + data.error, 'error');
            }
          } catch (error) {
            showMessage('Network error: ' + error.message, 'error');
          }
        }
        
        // Add account form submission
        document.getElementById('addAccountForm').addEventListener('submit', async function(e) {
          e.preventDefault();
          
          if (!currentSessionId) return;
          
          const formData = {
            service: document.getElementById('service').value,
            account: {
              email: document.getElementById('email').value,
              password: document.getElementById('password').value,
              username: document.getElementById('accountUsername').value || '',
              maxUsers: parseInt(document.getElementById('maxUsers').value) || 5,
              instructions: document.getElementById('instructions').value
            }
          };
          
          if (!formData.service) {
            showMessage('Please select a service', 'error');
            return;
          }
          
          try {
            const response = await fetch('/api/admin/add-account', {
              method: 'POST',
              headers: {
                'Content-Type': 'application/json',
                'x-session-id': currentSessionId
              },
              body: JSON.stringify(formData)
            });
            
            const data = await response.json();
            
            if (data.success) {
              showMessage(\`Account added successfully! Telegram notification sent.\`, 'success');
              resetAddForm();
              loadAccounts();
              loadDashboardData();
            } else {
              showMessage('Error: ' + data.error, 'error');
            }
          } catch (error) {
            showMessage('Network error: ' + error.message, 'error');
          }
        });
        
        // Reset add form
        function resetAddForm() {
          document.getElementById('addAccountForm').reset();
          document.getElementById('maxUsers').value = 5;
        }
        
        // Get service price
        function getServicePrice(service) {
          const prices = {
            'spotify': 400,
            'netflix': 150,
            'primevideo': 100,
            'primevideo_3m': 250,
            'primevideo_6m': 550,
            'primevideo_1y': 1000,
            'showmax_1m': 100,
            'showmax_3m': 250,
            'showmax_6m': 500,
            'showmax_1y': 900,
            'youtubepremium': 100,
            'applemusic': 250,
            'deezer': 200,
            'tidal': 250,
            'soundcloud': 150,
            'audible': 400,
            'canva': 300,
            'grammarly': 250,
            'skillshare': 350,
            'masterclass': 600,
            'duolingo': 150,
            'notion': 200,
            'microsoft365': 500,
            'googleone': 250,
            'adobecc': 700,
            'urbanvpn': 100,
            'nordvpn': 350,
            'expressvpn': 400,
            'surfshark': 200,
            'cyberghost': 250,
            'ipvanish': 200,
            'protonvpn': 300,
            'windscribe': 150,
            'xbox': 400,
            'playstation': 400,
            'eaplay': 250,
            'ubisoft': 300,
            'geforcenow': 350,
            'peacock_tv': 50
          };
          
          return prices[service] || 100;
        }
        
        // Auto-refresh every 30 seconds
        setInterval(() => {
          if (currentSessionId) {
            loadDashboardData();
          }
        }, 30000);
        
        // Check auth on page load
        window.onload = checkAuth;
      </script>
    </body>
    </html>
  `);
});

// ==================== EXISTING ROUTES ====================
app.get('/api/account-stats', (req, res) => {
  const stats = accountManager.getAccountStats();
  res.json({ success: true, stats });
});

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
      payheroConfigured: !!(process.env.AUTH_TOKEN),
      adminConfigured: true
    }
  });
});

// Clean up old pending transactions
setInterval(() => {
  const now = Date.now();
  const oneHour = 60 * 60 * 1000;
  
  for (const [reference, transaction] of pendingTransactions.entries()) {
    const transactionTime = new Date(transaction.timestamp).getTime();
    if (now - transactionTime > oneHour) {
      console.log(`🧹 Cleaning up old pending transaction: ${reference}`);
      pendingTransactions.delete(reference);
      
      // Record as expired transaction
      transactionManager.addTransaction({
        reference,
        planId: transaction.planId,
        planName: transaction.planName,
        customerEmail: transaction.customerEmail,
        customerName: transaction.customerName,
        amount: transaction.amount,
        status: 'EXPIRED'
      });
      
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

// Clean up expired sessions
setInterval(() => {
  const now = new Date();
  for (const [sessionId, session] of activeSessions.entries()) {
    if (new Date(session.expiresAt) < now) {
      activeSessions.delete(sessionId);
    }
  }
}, 60 * 60 * 1000);

// Start server
app.listen(port, async () => {
  console.log('🚀 Chege Tech Premium Service Started');
  console.log('📍 Port:', port);
  console.log('🔑 Account ID:', process.env.ACCOUNT_ID || '3716');
  console.log('📧 Email Configured:', !!(process.env.EMAIL_USER && process.env.EMAIL_PASS));
  console.log('🤖 Telegram Bot:', TELEGRAM_BOT_TOKEN ? 'Configured' : 'Not configured');
  console.log('👤 Admin Username:', ADMIN_USERNAME);
  console.log('🔐 Admin Password:', ADMIN_PASSWORD);
  console.log('💰 Transaction Tracking: Enabled');
  console.log('📊 Revenue Dashboard: Enabled');
  
  if (!process.env.TELEGRAM_CHAT_ID || process.env.TELEGRAM_CHAT_ID === 'YOUR_CHAT_ID') {
    console.log('⚠️ Telegram Chat ID not configured. Set TELEGRAM_CHAT_ID in .env file');
  }
  
  console.log('✅ Accounts system: Enabled');
  console.log('✅ Add/Remove accounts: Enabled');
  console.log('✅ Username/Password authentication: Enabled');
  console.log('✅ Complete revenue tracking: Enabled');
  console.log('🧹 Auto-cleanup: Old transactions removed after 1 hour');
  console.log('🔧 Admin Panel: http://localhost:' + port + '/admin');
  console.log('🌐 Main URL: http://localhost:' + port);
  
  // Initialize transaction manager
  await transactionManager.initialize();
  
  const startupMessage = `
🚀 <b>CHEGE TECH SERVER STARTED (COMPLETE ADMIN PANEL)</b>

📍 <b>Port:</b> ${port}
✅ <b>Complete Features:</b>
   • Username/Password authentication (${ADMIN_USERNAME})
   • Revenue tracking dashboard
   • Add/Remove accounts
   • Transaction history
   • Monthly revenue reports
   • Account management
   • Telegram notifications
🔧 <b>Admin Panel:</b> http://localhost:${port}/admin
💰 <b>Revenue Tracking:</b> Enabled
⏰ <b>Time:</b> ${new Date().toLocaleString()}

✅ <i>Complete admin panel with all features is ready!</i>
  `;
  
  sendTelegramNotification(startupMessage);
});

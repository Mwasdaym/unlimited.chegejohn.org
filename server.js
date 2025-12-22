require('dotenv').config();
const express = require('express');
const cors = require('cors');
const bodyParser = require('body-parser');
const { PayHeroClient } = require('payhero-devkit');
const path = require('path');
const nodemailer = require('nodemailer');
const fs = require('fs');
const axios = require('axios');
const session = require('express-session'); // Added for session management

const app = express();
const port = process.env.PORT || 3000;

// Telegram Bot Configuration
const TELEGRAM_BOT_TOKEN = '8405268705:AAGvgEQDaW5jgRcRIrysHY_4DZIFTZeekAc';
const TELEGRAM_CHAT_ID = process.env.TELEGRAM_CHAT_ID || '7161000868';

// Middleware
app.use(cors());
app.use(bodyParser.json({ limit: '10mb' }));
app.use(express.static('public'));
app.use(express.urlencoded({ extended: true }));

// Session middleware for admin authentication
app.use(session({
  secret: process.env.SESSION_SECRET || 'chege-tech-super-secret-key-2024',
  resave: false,
  saveUninitialized: false,
  cookie: {
    secure: process.env.NODE_ENV === 'production',
    maxAge: 24 * 60 * 60 * 1000 // 24 hours
  }
}));

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

// Admin authentication middleware
const requireAuth = (req, res, next) => {
  if (!req.session.adminLoggedIn) {
    return res.redirect('/admin/login');
  }
  next();
};

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
        
        Object.keys(this.accounts).forEach(service => {
          this.accounts[service].forEach(account => {
            if (!account.currentUsers) account.currentUsers = 0;
            if (!account.maxUsers) account.maxUsers = 5;
            if (!account.usedBy) account.usedBy = [];
            if (!account.fullyUsed) account.fullyUsed = false;
            // Add unique ID if not exists
            if (!account.id) account.id = `${service}_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
          });
        });
      } else {
        this.accounts = {};
        this.saveAccounts();
        console.log('📁 Created new accounts file');
      }
    } catch (error) {
      this.accounts = {};
      console.log('❌ Error loading accounts, created new file');
    }
  }

  saveAccounts() {
    try {
      fs.writeFileSync(this.accountsFile, JSON.stringify(this.accounts, null, 2));
    } catch (error) {
      console.error('❌ Error saving accounts:', error.message);
    }
  }

  // Check if account is available WITHOUT assigning it
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
🎯 <b>NEW ACCOUNT ADDED</b>

📊 <b>Service:</b> ${service}
📧 <b>Account:</b> ${accountData.email || accountData.username}
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
      
      if (accountIndex !== -1) {
        removedAccount = accounts[accountIndex];
        serviceName = service;
        
        // Remove the account
        accounts.splice(accountIndex, 1);
        
        // If service has no more accounts, remove the service
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
  }
}

const accountManager = new AccountManager();

// Store pending transactions (temporary storage)
const pendingTransactions = new Map();

// Subscription plans data
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

// Routes
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

app.get('/api/plans', (req, res) => {
  res.json({ success: true, categories: subscriptionPlans });
});

// Payment initiation - NO account assignment here
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
    console.log('✅ Availability:', availability.availableSlots, 'slots available');
    
    const response = await client.stkPush(stkPayload);
    
    console.log('✅ PayHero STK Push Response:', response.reference || response.id);

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
    if (error.response) {
      console.error('Error Status:', error.response.status);
      console.error('Error Data:', error.response.data);
    }
    res.status(500).json({
      success: false,
      error: error.message || 'Failed to initiate payment'
    });
  }
});

// CORRECTED: Payment check endpoint - Assign account ONLY on SUCCESS status
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
    
    const { payheroReference, planId, planName, customerEmail, customerName } = transaction;
    
    try {
      const status = await client.transactionStatus(payheroReference || reference);
      console.log('📊 Payment status:', status.status);
      console.log('📊 Success flag:', status.success);
      
      // CORRECTED: Only assign account if status is "SUCCESS"
      if (status.status === 'SUCCESS') {
        console.log('🎉 Payment SUCCESSFUL for reference:', reference);
        
        const assignedAccount = accountManager.assignAccount(planId, customerEmail, customerName);
        
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
        // Other statuses like PENDING, PROCESSING, etc.
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

// ======================= ADMIN ROUTES WITH AUTHENTICATION =======================

// Admin Login Page
app.get('/admin/login', (req, res) => {
  if (req.session.adminLoggedIn) {
    return res.redirect('/admin/dashboard');
  }
  
  res.send(`
    <!DOCTYPE html>
    <html>
    <head>
      <title>Chege Tech - Admin Login</title>
      <style>
        * { margin: 0; padding: 0; box-sizing: border-box; }
        body { 
          font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; 
          background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
          min-height: 100vh;
          display: flex;
          justify-content: center;
          align-items: center;
        }
        .login-container {
          background: white;
          padding: 40px;
          border-radius: 15px;
          box-shadow: 0 20px 60px rgba(0,0,0,0.3);
          width: 100%;
          max-width: 450px;
          text-align: center;
        }
        .logo {
          font-size: 32px;
          font-weight: bold;
          margin-bottom: 30px;
          color: #333;
        }
        .logo span {
          color: #667eea;
        }
        h2 {
          color: #333;
          margin-bottom: 30px;
          font-size: 24px;
        }
        .form-group {
          margin-bottom: 20px;
          text-align: left;
        }
        label {
          display: block;
          margin-bottom: 8px;
          color: #555;
          font-weight: 500;
        }
        input {
          width: 100%;
          padding: 14px;
          border: 2px solid #ddd;
          border-radius: 8px;
          font-size: 16px;
          transition: all 0.3s;
        }
        input:focus {
          outline: none;
          border-color: #667eea;
          box-shadow: 0 0 0 3px rgba(102, 126, 234, 0.1);
        }
        .login-btn {
          background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
          color: white;
          border: none;
          padding: 16px;
          width: 100%;
          border-radius: 8px;
          font-size: 16px;
          font-weight: 600;
          cursor: pointer;
          transition: all 0.3s;
          margin-top: 10px;
        }
        .login-btn:hover {
          transform: translateY(-2px);
          box-shadow: 0 10px 20px rgba(102, 126, 234, 0.3);
        }
        .login-btn:active {
          transform: translateY(0);
        }
        .error-message {
          background: #fee;
          color: #e74c3c;
          padding: 12px;
          border-radius: 8px;
          margin-bottom: 20px;
          display: none;
        }
        .error-message.show {
          display: block;
        }
        .success-message {
          background: #d4edda;
          color: #155724;
          padding: 12px;
          border-radius: 8px;
          margin-bottom: 20px;
          display: none;
        }
        .success-message.show {
          display: block;
        }
        .forgot-password {
          margin-top: 20px;
          font-size: 14px;
          color: #666;
        }
        .forgot-password a {
          color: #667eea;
          text-decoration: none;
        }
        .forgot-password a:hover {
          text-decoration: underline;
        }
        .security-note {
          margin-top: 30px;
          padding: 15px;
          background: #f8f9fa;
          border-radius: 8px;
          font-size: 13px;
          color: #666;
          text-align: left;
        }
        .security-note h4 {
          color: #333;
          margin-bottom: 8px;
        }
        .logout-link {
          margin-top: 20px;
          text-align: center;
        }
        .logout-link a {
          color: #667eea;
          text-decoration: none;
        }
        .logout-link a:hover {
          text-decoration: underline;
        }
      </style>
    </head>
    <body>
      <div class="login-container">
        <div class="logo">🔧 Chege <span>Tech</span> Admin</div>
        <h2>🔐 Admin Login</h2>
        
        <div id="errorMessage" class="error-message"></div>
        <div id="successMessage" class="success-message"></div>
        
        <form id="loginForm">
          <div class="form-group">
            <label for="username">👤 Username:</label>
            <input type="text" id="username" name="username" required 
                   placeholder="Enter admin username" autocomplete="off">
          </div>
          
          <div class="form-group">
            <label for="password">🔑 Password:</label>
            <input type="password" id="password" name="password" required 
                   placeholder="Enter admin password" autocomplete="off">
          </div>
          
          <button type="submit" class="login-btn">🚀 Login to Dashboard</button>
        </form>
        
        <div class="forgot-password">
          <p>Forgot password? Contact system administrator</p>
        </div>
        
        <div class="security-note">
          <h4>⚠️ Security Notice:</h4>
          <p>• This is a restricted access area</p>
          <p>• All login attempts are logged</p>
          <p>• Do not share your credentials</p>
          <p>• Log out after each session</p>
        </div>
        
        <div class="logout-link">
          <a href="/">← Back to Main Site</a>
        </div>
      </div>
      
      <script>
        document.getElementById('loginForm').addEventListener('submit', async (e) => {
          e.preventDefault();
          
          const username = document.getElementById('username').value;
          const password = document.getElementById('password').value;
          
          // Clear messages
          document.getElementById('errorMessage').className = 'error-message';
          document.getElementById('successMessage').className = 'success-message';
          
          try {
            const response = await fetch('/api/admin/login', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ username, password })
            });
            
            const result = await response.json();
            
            if (result.success) {
              // Show success message
              document.getElementById('successMessage').textContent = '✅ Login successful! Redirecting...';
              document.getElementById('successMessage').className = 'success-message show';
              
              // Clear form
              document.getElementById('username').value = '';
              document.getElementById('password').value = '';
              
              // Redirect after 1 second
              setTimeout(() => {
                window.location.href = '/admin/dashboard';
              }, 1000);
            } else {
              // Show error message
              document.getElementById('errorMessage').textContent = '❌ ' + result.error;
              document.getElementById('errorMessage').className = 'error-message show';
              
              // Shake animation for error
              document.getElementById('loginForm').style.animation = 'none';
              setTimeout(() => {
                document.getElementById('loginForm').style.animation = 'shake 0.5s';
              }, 10);
            }
          } catch (error) {
            document.getElementById('errorMessage').textContent = '❌ Network error. Please try again.';
            document.getElementById('errorMessage').className = 'error-message show';
          }
        });
        
        // Add shake animation
        const style = document.createElement('style');
        style.textContent = \`
          @keyframes shake {
            0%, 100% { transform: translateX(0); }
            10%, 30%, 50%, 70%, 90% { transform: translateX(-5px); }
            20%, 40%, 60%, 80% { transform: translateX(5px); }
          }
        \`;
        document.head.appendChild(style);
        
        // Check for session timeout or logout
        const urlParams = new URLSearchParams(window.location.search);
        if (urlParams.get('logout') === 'success') {
          document.getElementById('successMessage').textContent = '✅ Successfully logged out!';
          document.getElementById('successMessage').className = 'success-message show';
        }
      </script>
    </body>
    </html>
  `);
});

// Admin Login API
app.post('/api/admin/login', (req, res) => {
  const { username, password } = req.body;
  
  // Default admin credentials (should be in .env in production)
  const ADMIN_USERNAME = process.env.ADMIN_USERNAME || 'admin';
  const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || 'chegeadmin123';
  
  // Log login attempt (in production, you'd want to log this properly)
  console.log(`🔐 Admin login attempt from ${req.ip}: ${username}`);
  
  if (username === ADMIN_USERNAME && password === ADMIN_PASSWORD) {
    req.session.adminLoggedIn = true;
    req.session.adminUsername = username;
    req.session.loginTime = new Date().toISOString();
    
    // Send Telegram notification about login
    const telegramMessage = `
🔐 <b>ADMIN LOGIN DETECTED</b>

👤 <b>Username:</b> ${username}
🌐 <b>IP Address:</b> ${req.ip}
⏰ <b>Time:</b> ${new Date().toLocaleString()}
📍 <b>Location:</b> ${req.headers['x-forwarded-for'] || req.connection.remoteAddress}

✅ <i>Admin login successful</i>
    `;
    
    sendTelegramNotification(telegramMessage);
    
    res.json({ success: true, message: 'Login successful' });
  } else {
    // Send Telegram notification about failed login attempt
    const telegramMessage = `
🚨 <b>FAILED ADMIN LOGIN ATTEMPT</b>

👤 <b>Username:</b> ${username}
🌐 <b>IP Address:</b> ${req.ip}
⏰ <b>Time:</b> ${new Date().toLocaleString()}
📍 <b>Location:</b> ${req.headers['x-forwarded-for'] || req.connection.remoteAddress}

⚠️ <i>Invalid credentials provided</i>
    `;
    
    sendTelegramNotification(telegramMessage);
    
    res.status(401).json({ success: false, error: 'Invalid username or password' });
  }
});

// Admin Logout
app.get('/api/admin/logout', (req, res) => {
  if (req.session.adminLoggedIn) {
    const username = req.session.adminUsername;
    req.session.destroy();
    
    console.log(`👋 Admin logged out: ${username}`);
    
    // Send Telegram notification about logout
    const telegramMessage = `
👋 <b>ADMIN LOGGED OUT</b>

👤 <b>Username:</b> ${username}
⏰ <b>Time:</b> ${new Date().toLocaleString()}
📍 <b>Session Duration:</b> ${Math.floor((new Date() - new Date(req.session.loginTime)) / 1000)} seconds

✅ <i>Admin session ended</i>
    `;
    
    sendTelegramNotification(telegramMessage);
  }
  
  res.redirect('/admin/login?logout=success');
});

// Admin Dashboard (protected)
app.get('/admin/dashboard', requireAuth, (req, res) => {
  res.send(`
    <!DOCTYPE html>
    <html>
    <head>
      <title>Chege Tech - Admin Dashboard</title>
      <style>
        * { margin: 0; padding: 0; box-sizing: border-box; }
        body { 
          font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; 
          background: #f5f7fa;
          min-height: 100vh;
        }
        .header {
          background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
          color: white;
          padding: 20px 40px;
          display: flex;
          justify-content: space-between;
          align-items: center;
          box-shadow: 0 4px 20px rgba(0,0,0,0.1);
          position: sticky;
          top: 0;
          z-index: 1000;
        }
        .logo {
          font-size: 28px;
          font-weight: bold;
          display: flex;
          align-items: center;
          gap: 10px;
        }
        .user-info {
          display: flex;
          align-items: center;
          gap: 15px;
        }
        .user-info span {
          font-size: 14px;
          opacity: 0.9;
        }
        .logout-btn {
          background: rgba(255,255,255,0.2);
          color: white;
          border: 1px solid rgba(255,255,255,0.3);
          padding: 8px 20px;
          border-radius: 6px;
          cursor: pointer;
          text-decoration: none;
          font-size: 14px;
          transition: all 0.3s;
        }
        .logout-btn:hover {
          background: rgba(255,255,255,0.3);
          transform: translateY(-2px);
        }
        .container {
          max-width: 1400px;
          margin: 30px auto;
          padding: 0 20px;
        }
        .welcome-card {
          background: white;
          padding: 30px;
          border-radius: 15px;
          box-shadow: 0 10px 30px rgba(0,0,0,0.08);
          margin-bottom: 30px;
        }
        .welcome-card h1 {
          color: #333;
          margin-bottom: 10px;
        }
        .welcome-card p {
          color: #666;
          line-height: 1.6;
        }
        .stats-grid {
          display: grid;
          grid-template-columns: repeat(auto-fit, minmax(300px, 1fr));
          gap: 25px;
          margin-bottom: 30px;
        }
        .stat-card {
          background: white;
          padding: 25px;
          border-radius: 15px;
          box-shadow: 0 10px 30px rgba(0,0,0,0.08);
          transition: all 0.3s;
        }
        .stat-card:hover {
          transform: translateY(-5px);
          box-shadow: 0 15px 40px rgba(0,0,0,0.12);
        }
        .stat-card h3 {
          color: #555;
          margin-bottom: 15px;
          font-size: 18px;
          display: flex;
          align-items: center;
          gap: 10px;
        }
        .stat-number {
          font-size: 36px;
          font-weight: bold;
          color: #667eea;
          margin-bottom: 10px;
        }
        .stat-desc {
          color: #888;
          font-size: 14px;
        }
        .tabs {
          display: flex;
          border-bottom: 2px solid #e0e0e0;
          margin-bottom: 30px;
          background: white;
          border-radius: 10px 10px 0 0;
          overflow: hidden;
        }
        .tab {
          padding: 18px 30px;
          cursor: pointer;
          font-weight: 500;
          color: #666;
          transition: all 0.3s;
          border-bottom: 3px solid transparent;
        }
        .tab:hover {
          background: #f8f9fa;
          color: #667eea;
        }
        .tab.active {
          color: #667eea;
          border-bottom: 3px solid #667eea;
          background: #f8f9fa;
        }
        .tab-content {
          display: none;
          animation: fadeIn 0.3s;
        }
        .tab-content.active {
          display: block;
        }
        @keyframes fadeIn {
          from { opacity: 0; transform: translateY(10px); }
          to { opacity: 1; transform: translateY(0); }
        }
        .dashboard-content {
          background: white;
          padding: 30px;
          border-radius: 0 15px 15px 15px;
          box-shadow: 0 10px 30px rgba(0,0,0,0.08);
          min-height: 500px;
        }
        .form-group {
          margin-bottom: 25px;
        }
        .form-group label {
          display: block;
          margin-bottom: 10px;
          color: #333;
          font-weight: 500;
        }
        .form-group input,
        .form-group textarea,
        .form-group select {
          width: 100%;
          padding: 14px;
          border: 2px solid #e0e0e0;
          border-radius: 8px;
          font-size: 16px;
          transition: all 0.3s;
        }
        .form-group input:focus,
        .form-group textarea:focus,
        .form-group select:focus {
          outline: none;
          border-color: #667eea;
          box-shadow: 0 0 0 3px rgba(102, 126, 234, 0.1);
        }
        .btn {
          background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
          color: white;
          border: none;
          padding: 14px 28px;
          border-radius: 8px;
          font-size: 16px;
          font-weight: 600;
          cursor: pointer;
          transition: all 0.3s;
          display: inline-flex;
          align-items: center;
          gap: 8px;
        }
        .btn:hover {
          transform: translateY(-2px);
          box-shadow: 0 10px 20px rgba(102, 126, 234, 0.3);
        }
        .btn-secondary {
          background: #6c757d;
        }
        .btn-secondary:hover {
          box-shadow: 0 10px 20px rgba(108, 117, 125, 0.3);
        }
        .btn-danger {
          background: #ef4444;
        }
        .btn-danger:hover {
          box-shadow: 0 10px 20px rgba(239, 68, 68, 0.3);
        }
        .message {
          padding: 15px;
          border-radius: 8px;
          margin-bottom: 20px;
          display: none;
        }
        .message.success {
          background: #d4edda;
          color: #155724;
          display: block;
        }
        .message.error {
          background: #fee;
          color: #e74c3c;
          display: block;
        }
        .message.warning {
          background: #fff3cd;
          color: #856404;
          display: block;
        }
        .account-list {
          margin-top: 20px;
        }
        .account-item {
          background: #f8f9fa;
          padding: 20px;
          border-radius: 10px;
          margin-bottom: 15px;
          border-left: 4px solid #667eea;
        }
        .account-item.full {
          border-left-color: #ef4444;
          background: #fee;
        }
        .account-item.available {
          border-left-color: #10b981;
          background: #d4edda;
        }
        .account-header {
          display: flex;
          justify-content: space-between;
          align-items: flex-start;
          margin-bottom: 15px;
        }
        .account-actions {
          display: flex;
          gap: 10px;
        }
        .account-details {
          color: #555;
          line-height: 1.6;
        }
        .account-details strong {
          color: #333;
        }
        .modal {
          display: none;
          position: fixed;
          top: 0;
          left: 0;
          width: 100%;
          height: 100%;
          background: rgba(0,0,0,0.5);
          z-index: 2000;
          align-items: center;
          justify-content: center;
        }
        .modal.show {
          display: flex;
        }
        .modal-content {
          background: white;
          padding: 30px;
          border-radius: 15px;
          width: 90%;
          max-width: 500px;
          max-height: 90vh;
          overflow-y: auto;
          animation: modalFadeIn 0.3s;
        }
        @keyframes modalFadeIn {
          from { opacity: 0; transform: scale(0.9); }
          to { opacity: 1; transform: scale(1); }
        }
        .modal-header {
          display: flex;
          justify-content: space-between;
          align-items: center;
          margin-bottom: 20px;
        }
        .modal-header h3 {
          color: #333;
        }
        .close-modal {
          background: none;
          border: none;
          font-size: 24px;
          cursor: pointer;
          color: #666;
        }
        .close-modal:hover {
          color: #333;
        }
        .grid-2 {
          display: grid;
          grid-template-columns: 1fr 1fr;
          gap: 25px;
        }
        @media (max-width: 768px) {
          .grid-2 { grid-template-columns: 1fr; }
          .stats-grid { grid-template-columns: 1fr; }
          .tabs { flex-wrap: wrap; }
          .tab { flex: 1; text-align: center; padding: 15px; }
        }
        .security-info {
          background: #f8f9fa;
          padding: 20px;
          border-radius: 10px;
          margin-top: 30px;
          border-left: 4px solid #f59e0b;
        }
        .security-info h4 {
          color: #333;
          margin-bottom: 10px;
        }
        .security-info p {
          color: #666;
          font-size: 14px;
          line-height: 1.6;
        }
      </style>
      <link rel="stylesheet" href="https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.0.0/css/all.min.css">
    </head>
    <body>
      <div class="header">
        <div class="logo">
          <i class="fas fa-cogs"></i>
          <span>Chege Tech Admin</span>
        </div>
        <div class="user-info">
          <span>👤 Logged in as: <strong>${req.session.adminUsername}</strong></span>
          <span>⏰ Login: ${new Date(req.session.loginTime).toLocaleTimeString()}</span>
          <a href="/api/admin/logout" class="logout-btn">
            <i class="fas fa-sign-out-alt"></i> Logout
          </a>
        </div>
      </div>
      
      <div class="container">
        <div class="welcome-card">
          <h1>👋 Welcome, ${req.session.adminUsername}!</h1>
          <p>You are now in the Chege Tech Premium Admin Dashboard. Manage accounts, view statistics, and monitor transactions.</p>
        </div>
        
        <div class="stats-grid">
          <div class="stat-card">
            <h3><i class="fas fa-wallet"></i> Today's Revenue</h3>
            <div class="stat-number" id="todayRevenue">KES 0</div>
            <div class="stat-desc">Total revenue from successful transactions today</div>
          </div>
          <div class="stat-card">
            <h3><i class="fas fa-users"></i> Active Accounts</h3>
            <div class="stat-number" id="activeAccounts">0</div>
            <div class="stat-desc">Total accounts in the system</div>
          </div>
          <div class="stat-card">
            <h3><i class="fas fa-shopping-cart"></i> Pending Transactions</h3>
            <div class="stat-number" id="pendingTransactions">0</div>
            <div class="stat-desc">Transactions awaiting payment</div>
          </div>
          <div class="stat-card">
            <h3><i class="fas fa-chart-line"></i> Success Rate</h3>
            <div class="stat-number" id="successRate">0%</div>
            <div class="stat-desc">Percentage of successful transactions</div>
          </div>
        </div>
        
        <div class="tabs">
          <div class="tab active" onclick="showTab('overview')">
            <i class="fas fa-home"></i> Overview
          </div>
          <div class="tab" onclick="showTab('add')">
            <i class="fas fa-plus-circle"></i> Add Account
          </div>
          <div class="tab" onclick="showTab('manage')">
            <i class="fas fa-list"></i> Manage Accounts
          </div>
          <div class="tab" onclick="showTab('transactions')">
            <i class="fas fa-exchange-alt"></i> Transactions
          </div>
          <div class="tab" onclick="showTab('settings')">
            <i class="fas fa-cog"></i> Settings
          </div>
        </div>
        
        <div class="dashboard-content">
          <!-- Overview Tab -->
          <div id="overview-tab" class="tab-content active">
            <h2><i class="fas fa-chart-bar"></i> System Overview</h2>
            <div id="overviewContent">Loading system overview...</div>
          </div>
          
          <!-- Add Account Tab -->
          <div id="add-tab" class="tab-content">
            <h2><i class="fas fa-plus-circle"></i> Add New Account</h2>
            <div id="addMessage" class="message"></div>
            <form id="addAccountForm">
              <div class="grid-2">
                <div>
                  <div class="form-group">
                    <label><i class="fas fa-stream"></i> Service:</label>
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
                    <label><i class="fas fa-envelope"></i> Email:</label>
                    <input type="email" id="email" required placeholder="account@example.com">
                  </div>
                  
                  <div class="form-group">
                    <label><i class="fas fa-key"></i> Password:</label>
                    <input type="text" id="password" required placeholder="Account password">
                  </div>
                </div>
                
                <div>
                  <div class="form-group">
                    <label><i class="fas fa-user"></i> Username (optional):</label>
                    <input type="text" id="username" placeholder="Username if different from email">
                  </div>
                  
                  <div class="form-group">
                    <label><i class="fas fa-info-circle"></i> Instructions:</label>
                    <textarea id="instructions" rows="8" placeholder="Special instructions for customers...">Login using provided credentials. Do not change password or email.</textarea>
                  </div>
                  
                  <button type="submit" class="btn">
                    <i class="fas fa-plus"></i> Add Account
                  </button>
                  <button type="button" class="btn btn-secondary" onclick="resetAddForm()">
                    <i class="fas fa-trash"></i> Clear Form
                  </button>
                </div>
              </div>
            </form>
          </div>
          
          <!-- Manage Accounts Tab -->
          <div id="manage-tab" class="tab-content">
            <h2><i class="fas fa-list"></i> Manage Accounts</h2>
            <div id="manageMessage" class="message"></div>
            <div class="account-list" id="accountList">
              <p><i class="fas fa-spinner fa-spin"></i> Loading accounts...</p>
            </div>
          </div>
          
          <!-- Transactions Tab -->
          <div id="transactions-tab" class="tab-content">
            <h2><i class="fas fa-exchange-alt"></i> Recent Transactions</h2>
            <div id="transactionsList">
              <p><i class="fas fa-spinner fa-spin"></i> Loading transactions...</p>
            </div>
          </div>
          
          <!-- Settings Tab -->
          <div id="settings-tab" class="tab-content">
            <h2><i class="fas fa-cog"></i> Admin Settings</h2>
            <div id="settingsMessage" class="message"></div>
            
            <div class="grid-2">
              <div>
                <h3><i class="fas fa-user-shield"></i> Security Settings</h3>
                <div class="form-group">
                  <label>Session Timeout (minutes):</label>
                  <input type="number" id="sessionTimeout" value="60" min="5" max="480">
                </div>
                <button class="btn" onclick="updateSessionSettings()">
                  <i class="fas fa-save"></i> Save Settings
                </button>
              </div>
              
              <div>
                <h3><i class="fas fa-bell"></i> Notifications</h3>
                <div class="form-group">
                  <label>
                    <input type="checkbox" id="telegramNotifications" checked>
                    Enable Telegram notifications
                  </label>
                </div>
                <div class="form-group">
                  <label>
                    <input type="checkbox" id="emailNotifications" checked>
                    Enable email notifications
                  </label>
                </div>
              </div>
            </div>
            
            <div class="security-info">
              <h4><i class="fas fa-exclamation-triangle"></i> Security Information</h4>
              <p>• Last login: ${new Date(req.session.loginTime).toLocaleString()}</p>
              <p>• Session will expire automatically after 60 minutes of inactivity</p>
              <p>• All admin actions are logged and monitored</p>
              <p>• Change your password regularly for security</p>
            </div>
          </div>
        </div>
      </div>
      
      <!-- Remove Account Modal -->
      <div id="removeModal" class="modal">
        <div class="modal-content">
          <div class="modal-header">
            <h3><i class="fas fa-exclamation-triangle"></i> Remove Account</h3>
            <button class="close-modal" onclick="closeModal()">&times;</button>
          </div>
          <div id="modalMessage" class="message"></div>
          <div id="accountDetails"></div>
          <div style="margin-top: 20px; display: flex; gap: 10px; justify-content: flex-end;">
            <button class="btn btn-danger" onclick="confirmRemove()">
              <i class="fas fa-trash"></i> Remove Account
            </button>
            <button class="btn btn-secondary" onclick="closeModal()">
              <i class="fas fa-times"></i> Cancel
            </button>
          </div>
        </div>
      </div>
      
      <script>
        let currentTab = 'overview';
        let accountsData = {};
        let accountToRemove = null;
        
        // Show tab function
        function showTab(tabName) {
          currentTab = tabName;
          
          // Update active tab
          document.querySelectorAll('.tab').forEach(tab => {
            tab.classList.remove('active');
          });
          document.querySelectorAll('.tab-content').forEach(content => {
            content.classList.remove('active');
          });
          
          document.querySelectorAll('.tab')[tabName === 'overview' ? 0 : 
            tabName === 'add' ? 1 : 
            tabName === 'manage' ? 2 : 
            tabName === 'transactions' ? 3 : 4].classList.add('active');
          document.getElementById(tabName + '-tab').classList.add('active');
          
          // Load data for the tab
          if (tabName === 'overview') {
            loadOverview();
          } else if (tabName === 'manage') {
            loadAccounts();
          } else if (tabName === 'transactions') {
            loadTransactions();
          }
        }
        
        // Load overview data
        async function loadOverview() {
          try {
            const response = await fetch('/api/admin/stats');
            const data = await response.json();
            
            if (data.success) {
              let html = '<div class="grid-2">';
              
              // Calculate stats
              let totalAccounts = 0;
              let totalUsedSlots = 0;
              let totalSlots = 0;
              let totalRevenue = 0;
              
              Object.entries(data.stats).forEach(([service, stats]) => {
                totalAccounts += stats.totalAccounts;
                totalUsedSlots += stats.usedSlots;
                totalSlots += stats.totalSlots;
                
                html += \`
                  <div class="account-item \${stats.availableAccounts === 0 ? 'full' : 'available'}">
                    <div class="account-header">
                      <h4>\${service}</h4>
                      <span>\${stats.availableAccounts} / \${stats.totalAccounts} available</span>
                    </div>
                    <div class="account-details">
                      <p><strong>Total Accounts:</strong> \${stats.totalAccounts}</p>
                      <p><strong>Used Slots:</strong> \${stats.usedSlots} / \${stats.totalSlots}</p>
                      <p><strong>Available Slots:</strong> \${stats.availableSlots}</p>
                      <p><strong>Fully Used:</strong> \${stats.fullyUsedAccounts} accounts</p>
                    </div>
                  </div>
                \`;
              });
              
              html += '</div>';
              
              // Update overview content
              document.getElementById('overviewContent').innerHTML = html;
              
              // Update dashboard stats
              document.getElementById('activeAccounts').textContent = totalAccounts;
              document.getElementById('pendingTransactions').textContent = data.pendingTransactions;
              
              // Calculate success rate (simplified)
              const successRate = totalSlots > 0 ? Math.round((totalUsedSlots / totalSlots) * 100) : 0;
              document.getElementById('successRate').textContent = successRate + '%';
              
            } else {
              document.getElementById('overviewContent').innerHTML = 
                '<div class="message error">Error loading overview data</div>';
            }
          } catch (error) {
            document.getElementById('overviewContent').innerHTML = 
              '<div class="message error">Network error loading data</div>';
          }
        }
        
        // Load accounts
        async function loadAccounts() {
          try {
            const response = await fetch('/api/admin/accounts');
            const data = await response.json();
            
            if (data.success) {
              accountsData = data.accounts;
              renderAccounts();
            } else {
              showMessage('manageMessage', 'Error: ' + data.error, 'error');
            }
          } catch (error) {
            showMessage('manageMessage', 'Error loading accounts', 'error');
          }
        }
        
        // Render accounts list
        function renderAccounts() {
          let html = '';
          
          if (Object.keys(accountsData).length === 0) {
            html = '<div class="message warning">No accounts found. Add some accounts to get started.</div>';
          } else {
            Object.entries(accountsData).forEach(([service, accounts]) => {
              html += \`<h3 style="margin-top: 20px; color: #333;">\${service} (\${accounts.length} accounts)</h3>\`;
              
              accounts.forEach(account => {
                const statusClass = account.fullyUsed ? 'full' : 'available';
                const statusText = account.fullyUsed ? 'FULL' : 'AVAILABLE';
                const statusIcon = account.fullyUsed ? '🚫' : '✅';
                
                html += \`
                  <div class="account-item \${statusClass}">
                    <div class="account-header">
                      <div>
                        <strong>\${statusIcon} \${statusText}</strong>
                        <div style="font-size: 12px; color: #666; margin-top: 5px;">
                          ID: <code>\${account.id}</code>
                        </div>
                      </div>
                      <div class="account-actions">
                        <button class="btn btn-danger" onclick="showRemoveModal('\${account.id}')">
                          <i class="fas fa-trash"></i> Remove
                        </button>
                      </div>
                    </div>
                    <div class="account-details">
                      <p><strong>Email:</strong> \${account.email || 'N/A'}</p>
                      \${account.username ? \`<p><strong>Username:</strong> \${account.username}</p>\` : ''}
                      <p><strong>Users:</strong> \${account.currentUsers || 0} / \${account.maxUsers || 5}</p>
                      <p><strong>Added:</strong> \${new Date(account.addedAt).toLocaleString()}</p>
                      
                      \${account.usedBy && account.usedBy.length > 0 ? \`
                        <div style="margin-top: 10px; padding: 10px; background: rgba(0,0,0,0.05); border-radius: 5px;">
                          <strong>Used By (\${account.usedBy.length}):</strong>
                          <ul style="margin: 5px 0; padding-left: 20px; font-size: 14px;">
                            \${account.usedBy.map(user => \`
                              <li>\${user.customerName} (\${user.customerEmail}) - \${new Date(user.assignedAt).toLocaleString()}</li>
                            \`).join('')}
                          </ul>
                        </div>
                      \` : ''}
                    </div>
                  </div>
                \`;
              });
            });
          }
          
          document.getElementById('accountList').innerHTML = html;
        }
        
        // Show remove modal
        function showRemoveModal(accountId) {
          const account = findAccountById(accountId);
          if (!account) {
            showMessage('manageMessage', 'Account not found', 'error');
            return;
          }
          
          accountToRemove = accountId;
          
          document.getElementById('accountDetails').innerHTML = \`
            <div style="background: #f8f9fa; padding: 15px; border-radius: 8px; margin: 15px 0;">
              <p><strong>Service:</strong> \${account.service}</p>
              <p><strong>Email:</strong> \${account.email || 'N/A'}</p>
              <p><strong>Username:</strong> \${account.username || 'N/A'}</p>
              <p><strong>Current Users:</strong> \${account.currentUsers || 0}</p>
              <p><strong>Max Users:</strong> \${account.maxUsers || 5}</p>
              <p><strong>Account ID:</strong> <code>\${account.id}</code></p>
            </div>
            \${account.currentUsers > 0 ? \`
              <div class="message warning">
                <i class="fas fa-exclamation-triangle"></i> This account has \${account.currentUsers} active users!
                Removing it will affect these users.
              </div>
            \` : ''}
          \`;
          
          document.getElementById('removeModal').classList.add('show');
        }
        
        // Close modal
        function closeModal() {
          document.getElementById('removeModal').classList.remove('show');
          accountToRemove = null;
          document.getElementById('modalMessage').className = 'message';
        }
        
        // Confirm remove account
        async function confirmRemove() {
          if (!accountToRemove) return;
          
          try {
            const response = await fetch('/api/admin/remove-account', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                accountId: accountToRemove,
                adminPassword: '${process.env.ADMIN_PASSWORD || 'chegeadmin123'}'
              })
            });
            
            const result = await response.json();
            
            if (result.success) {
              showMessage('modalMessage', \`
                <i class="fas fa-check-circle"></i> Account removed successfully!
                Telegram notification has been sent.
              \`, 'success');
              
              // Update UI
              setTimeout(() => {
                closeModal();
                loadAccounts();
                loadOverview();
              }, 2000);
            } else {
              showMessage('modalMessage', 'Error: ' + result.error, 'error');
            }
          } catch (error) {
            showMessage('modalMessage', 'Network error: ' + error.message, 'error');
          }
        }
        
        // Find account by ID
        function findAccountById(accountId) {
          for (const [service, accounts] of Object.entries(accountsData)) {
            const account = accounts.find(acc => acc.id === accountId);
            if (account) {
              return { ...account, service };
            }
          }
          return null;
        }
        
        // Add account form submission
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
            adminPassword: '${process.env.ADMIN_PASSWORD || 'chegeadmin123'}'
          };
          
          try {
            const response = await fetch('/api/admin/add-account', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify(formData)
            });
            
            const result = await response.json();
            
            if (result.success) {
              showMessage('addMessage', \`
                <i class="fas fa-check-circle"></i> Account added successfully!
                <br><strong>Service:</strong> \${formData.service}
                <br><strong>Email:</strong> \${formData.account.email}
                <br><strong>Account ID:</strong> \${result.data.id}
                <br>Telegram notification has been sent.
              \`, 'success');
              
              // Reset form
              document.getElementById('email').value = '';
              document.getElementById('password').value = '';
              document.getElementById('username').value = '';
              
              // Refresh data
              loadOverview();
              loadAccounts();
            } else {
              showMessage('addMessage', 'Error: ' + result.error, 'error');
            }
          } catch (error) {
            showMessage('addMessage', 'Network error: ' + error.message, 'error');
          }
        });
        
        // Reset add form
        function resetAddForm() {
          document.getElementById('addAccountForm').reset();
          document.getElementById('addMessage').className = 'message';
        }
        
        // Load transactions
        async function loadTransactions() {
          try {
            // This would be your transactions API endpoint
            // For now, show pending transactions
            const response = await fetch('/api/admin/stats');
            const data = await response.json();
            
            if (data.success) {
              let html = \`
                <div class="account-item">
                  <h4>Pending Transactions</h4>
                  <p><strong>Count:</strong> \${data.pendingTransactions}</p>
                  <p><strong>Last Updated:</strong> \${new Date(data.serverTime).toLocaleString()}</p>
                </div>
              \`;
              
              document.getElementById('transactionsList').innerHTML = html;
            }
          } catch (error) {
            document.getElementById('transactionsList').innerHTML = 
              '<div class="message error">Error loading transactions</div>';
          }
        }
        
        // Update session settings
        async function updateSessionSettings() {
          const timeout = document.getElementById('sessionTimeout').value;
          
          try {
            // Here you would send the settings to your API
            // For now, just show success message
            showMessage('settingsMessage', \`
              <i class="fas fa-check-circle"></i> Settings updated successfully!
              <br>Session timeout set to \${timeout} minutes.
            \`, 'success');
          } catch (error) {
            showMessage('settingsMessage', 'Error saving settings', 'error');
          }
        }
        
        // Show message function
        function showMessage(elementId, message, type) {
          const element = document.getElementById(elementId);
          element.innerHTML = message;
          element.className = \`message \${type}\`;
          
          // Auto-hide success messages after 5 seconds
          if (type === 'success') {
            setTimeout(() => {
              element.className = 'message';
            }, 5000);
          }
        }
        
        // Auto-refresh data every 30 seconds
        setInterval(() => {
          if (currentTab === 'overview') loadOverview();
          if (currentTab === 'manage') loadAccounts();
          if (currentTab === 'transactions') loadTransactions();
        }, 30000);
        
        // Check session every minute
        setInterval(async () => {
          try {
            const response = await fetch('/api/admin/session-check');
            if (!response.ok) {
              window.location.href = '/admin/login?session=expired';
            }
          } catch (error) {
            console.log('Session check failed');
          }
        }, 60000);
        
        // Initial load
        loadOverview();
        loadAccounts();
        loadTransactions();
      </script>
    </body>
    </html>
  `);
});

// Session check endpoint
app.get('/api/admin/session-check', (req, res) => {
  if (req.session.adminLoggedIn) {
    res.json({ valid: true });
  } else {
    res.status(401).json({ valid: false });
  }
});

// Update admin API routes to require authentication
app.post('/api/admin/add-account', (req, res) => {
  // Check session first
  if (!req.session.adminLoggedIn) {
    return res.status(401).json({ success: false, error: 'Unauthorized - Please login' });
  }
  
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

// Remove account API
app.post('/api/admin/remove-account', (req, res) => {
  // Check session first
  if (!req.session.adminLoggedIn) {
    return res.status(401).json({ success: false, error: 'Unauthorized - Please login' });
  }
  
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

// Get account by ID
app.get('/api/admin/account/:accountId', (req, res) => {
  // Check session first
  if (!req.session.adminLoggedIn) {
    return res.status(401).json({ success: false, error: 'Unauthorized - Please login' });
  }
  
  const { accountId } = req.params;
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
  // Check session first
  if (!req.session.adminLoggedIn) {
    return res.status(401).json({ success: false, error: 'Unauthorized - Please login' });
  }
  
  res.json({
    success: true,
    stats: accountManager.getAccountStats(),
    pendingTransactions: pendingTransactions.size,
    serverTime: new Date().toISOString()
  });
});

app.get('/api/admin/accounts', (req, res) => {
  // Check session first
  if (!req.session.adminLoggedIn) {
    return res.status(401).json({ success: false, error: 'Unauthorized - Please login' });
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

// Old admin route redirects to login
app.get('/admin', (req, res) => {
  res.redirect('/admin/login');
});

// Start server
app.listen(port, () => {
  console.log('🚀 Chege Tech Premium Service Started');
  console.log('📍 Port:', port);
  console.log('🔑 Admin Panel: http://localhost:' + port + '/admin/login');
  console.log('👤 Admin Username:', process.env.ADMIN_USERNAME || 'admin');
  console.log('🔐 Admin Password:', '********' + (process.env.ADMIN_PASSWORD ? ' (from .env)' : ' (default: chegeadmin123)'));
  console.log('📧 Email Configured:', !!(process.env.EMAIL_USER && process.env.EMAIL_PASS));
  console.log('🤖 Telegram Bot:', TELEGRAM_BOT_TOKEN ? 'Configured' : 'Not configured');
  if (!process.env.TELEGRAM_CHAT_ID || process.env.TELEGRAM_CHAT_ID === 'YOUR_CHAT_ID') {
    console.log('⚠️ Telegram Chat ID not configured. Set TELEGRAM_CHAT_ID in .env file');
  }
  console.log('✅ Fixed: Accounts assigned ONLY when status is "SUCCESS"');
  console.log('✅ Fixed: QUEUED status handled correctly (no account assigned)');
  console.log('✅ Added: Secure Admin Panel with Login');
  console.log('✅ Added: Account removal functionality');
  console.log('🧹 Auto-cleanup: Old transactions removed after 1 hour');
  console.log('🔧 Admin Panel: http://localhost:' + port + '/admin/login');
  console.log('🌐 URL: http://localhost:' + port);
  
  const startupMessage = `
🚀 <b>CHEGE TECH SERVER STARTED (WITH SECURE ADMIN PANEL)</b>

📍 <b>Port:</b> ${port}
✅ <b>New Feature:</b> Secure Admin Login Panel
✅ <b>Security:</b> Session-based authentication
✅ <b>Monitoring:</b> All login attempts logged to Telegram
✅ <b>Fixed:</b> Accounts assigned ONLY when status is "SUCCESS"
✅ <b>Fixed:</b> QUEUED status handled correctly
🧹 <b>Cleanup:</b> Old transactions auto-removed after 1 hour
🔧 <b>Admin Panel:</b> http://localhost:${port}/admin/login
👤 <b>Admin Username:</b> ${process.env.ADMIN_USERNAME || 'admin'}
⏰ <b>Time:</b> ${new Date().toLocaleString()}

✅ <i>Server is ready with enhanced security features!</i>
  `;
  
  sendTelegramNotification(startupMessage);
});

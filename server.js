require('dotenv').config();
const express = require('express');
const cors = require('cors');
const bodyParser = require('body-parser');
const { PayHeroClient } = require('payhero-devkit');
const path = require('path');
const nodemailer = require('nodemailer');
const fs = require('fs');
const axios = require('axios');

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
          email: acc.email,
          username: acc.username,
          currentUsers: acc.currentUsers || 0,
          maxUsers: acc.maxUsers || 5,
          fullyUsed: acc.fullyUsed || false,
          available: !acc.fullyUsed && (acc.currentUsers || 0) < (acc.maxUsers || 5)
        }))
      };
    });
    return stats;
  }
  
  addAccount(service, accountData) {
    if (!this.accounts[service]) {
      this.accounts[service] = [];
    }
    
    const newAccount = {
      ...accountData,
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

✅ <i>Ready for 5 new customers!</i>
    `;
    
    sendTelegramNotification(telegramMessage);
    
    return newAccount;
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

// ==================== ADMIN WEB INTERFACE ====================
app.get('/admin', (req, res) => {
  res.send(`
    <!DOCTYPE html>
    <html>
    <head>
      <title>Chege Tech - Admin Panel</title>
      <style>
        body { font-family: Arial, sans-serif; margin: 40px; background: #f5f5f5; }
        .container { max-width: 800px; margin: 0 auto; background: white; padding: 30px; border-radius: 10px; box-shadow: 0 2px 10px rgba(0,0,0,0.1); }
        h1 { color: #333; border-bottom: 2px solid #667eea; padding-bottom: 10px; }
        .form-group { margin-bottom: 20px; }
        label { display: block; margin-bottom: 5px; font-weight: bold; }
        input, textarea, select { width: 100%; padding: 10px; border: 1px solid #ddd; border-radius: 5px; }
        button { background: #667eea; color: white; border: none; padding: 12px 24px; border-radius: 5px; cursor: pointer; }
        button:hover { background: #5a67d8; }
        .success { background: #10b981; color: white; padding: 10px; border-radius: 5px; margin: 10px 0; }
        .error { background: #ef4444; color: white; padding: 10px; border-radius: 5px; margin: 10px 0; }
        .stats { background: #f3f4f6; padding: 15px; border-radius: 5px; margin: 20px 0; }
        .account-list { margin-top: 20px; }
        .account-item { padding: 10px; border: 1px solid #ddd; margin-bottom: 10px; border-radius: 5px; }
        .used { background: #fee2e2; }
        .available { background: #dcfce7; }
      </style>
    </head>
    <body>
      <div class="container">
        <h1>🔧 Chege Tech Admin Panel</h1>
        
        <div id="message"></div>
        
        <div class="stats">
          <h3>📊 Current Stats</h3>
          <div id="stats">Loading...</div>
          <button onclick="loadStats()">🔄 Refresh Stats</button>
        </div>
        
        <h3>➕ Add New Account</h3>
        <form id="addAccountForm">
          <div class="form-group">
            <label>Admin Password:</label>
            <input type="password" id="adminPassword" required>
          </div>
          
          <div class="form-group">
            <label>Service:</label>
            <select id="service" required>
              <option value="">Select Service</option>
              <option value="spotify">Spotify Premium</option>
             <option value="netflix">Netflix</option>
            <option value="primevideo">Prime Video<  /option>
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
<option value="appletv">Apple TV+</option>
<option value="surfsharkvpn">Surfshark VPN</option>
            </select>
          </div>
          
          <div class="form-group">
            <label>Email:</label>
            <input type="email" id="email" required>
          </div>
          
          <div class="form-group">
            <label>Password:</label>
            <input type="text" id="password" required>
          </div>
          
          <div class="form-group">
            <label>Username (optional):</label>
            <input type="text" id="username">
          </div>
          
          <div class="form-group">
            <label>Instructions:</label>
            <textarea id="instructions" rows="3">Login using provided credentials. Do not change password.</textarea>
          </div>
          
          <button type="submit">➕ Add Account</button>
        </form>
        
        <div class="account-list" id="accountList"></div>
      </div>
      
      <script>
        async function loadStats() {
          const password = document.getElementById('adminPassword').value || 'chegetech123';
          try {
            const response = await fetch(\`/api/admin/stats?password=\${encodeURIComponent(password)}\`);
            const data = await response.json();
            
            if (data.success) {
              let html = '';
              Object.entries(data.stats).forEach(([service, stats]) => {
                html += \`
                  <div style="margin-bottom: 15px; padding: 10px; border-left: 4px solid #667eea; background: white;">
                    <strong>\${service}:</strong><br>
                    Total Accounts: \${stats.totalAccounts}<br>
                    Used Slots: \${stats.usedSlots}/\${stats.totalSlots}<br>
                    Available Slots: \${stats.availableSlots}<br>
                    Available Accounts: \${stats.availableAccounts}<br>
                    Fully Used Accounts: \${stats.fullyUsedAccounts}
                  </div>
                \`;
              });
              document.getElementById('stats').innerHTML = html;
              
              // Load account details
              loadAccountDetails(password);
            } else {
              document.getElementById('stats').innerHTML = \`Error: \${data.error}\`;
            }
          } catch (error) {
            document.getElementById('stats').innerHTML = 'Error loading stats';
          }
        }
        
        async function loadAccountDetails(password) {
          try {
            const response = await fetch(\`/api/admin/accounts?password=\${encodeURIComponent(password)}\`);
            const data = await response.json();
            
            if (data.success) {
              let html = '<h3>📋 Account Details</h3>';
              Object.entries(data.accounts).forEach(([service, accounts]) => {
                html += \`<h4>\${service}</h4>\`;
                accounts.forEach(account => {
                  const statusClass = account.fullyUsed ? 'used' : 'available';
                  html += \`
                    <div class="account-item \${statusClass}">
                      <strong>Email:</strong> \${account.email || 'N/A'}<br>
                      <strong>Username:</strong> \${account.username || 'N/A'}<br>
                      <strong>Status:</strong> \${account.fullyUsed ? 'FULLY USED' : 'AVAILABLE'}<br>
                      <strong>Users:</strong> \${account.currentUsers}/\${account.maxUsers}<br>
                      <strong>Added:</strong> \${new Date(account.addedAt).toLocaleString()}
                    </div>
                  \`;
                });
              });
              document.getElementById('accountList').innerHTML = html;
            }
          } catch (error) {
            console.log('Error loading account details:', error);
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
          
          try {
            const response = await fetch('/api/admin/add-account', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify(formData)
            });
            
            const result = await response.json();
            
            const messageDiv = document.getElementById('message');
            if (result.success) {
              messageDiv.innerHTML = \`
                <div class="success">
                  ✅ Account added successfully!<br>
                  Service: \${formData.service}<br>
                  Email: \${formData.account.email}<br>
                  Telegram notification sent.
                </div>
              \`;
              // Clear form
              document.getElementById('email').value = '';
              document.getElementById('password').value = '';
              document.getElementById('username').value = '';
              // Reload stats
              loadStats();
            } else {
              messageDiv.innerHTML = \`
                <div class="error">
                  ❌ Error: \${result.error}
                </div>
              \`;
            }
          } catch (error) {
            document.getElementById('message').innerHTML = \`
              <div class="error">
                ❌ Network error: \${error.message}
              </div>
            \`;
          }
        });
        
        // Load stats on page load
        loadStats();
      </script>
    </body>
    </html>
  `);
});

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
  console.log('🧹 Auto-cleanup: Old transactions removed after 1 hour');
  console.log('🔧 Admin Panel: http://localhost:' + port + '/admin');
  console.log('🌐 URL: http://localhost:' + port);
  
  const startupMessage = `
🚀 <b>CHEGE TECH SERVER STARTED (CORRECTED VERSION)</b>

📍 <b>Port:</b> ${port}
✅ <b>Fixed:</b> Accounts assigned ONLY when status is "SUCCESS"
✅ <b>Fixed:</b> QUEUED status handled correctly
🧹 <b>Cleanup:</b> Old transactions auto-removed after 1 hour
🔧 <b>Admin Panel:</b> http://localhost:${port}/admin
⏰ <b>Time:</b> ${new Date().toLocaleString()}

✅ <i>Server is ready with CORRECT payment flow!</i>
  `;
  
  sendTelegramNotification(startupMessage);
});

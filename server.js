require('dotenv').config();
const express = require('express');
const cors = require('cors');
const bodyParser = require('body-parser');
const { PayHeroClient } = require('payhero-devkit');
const path = require('path');

const app = express();
const port = process.env.PORT || 3000;

// Middleware
app.use(cors());
app.use(bodyParser.json({ limit: '10mb' }));
app.use(express.static('public'));
app.use(express.urlencoded({ extended: true }));

// Initialize PayHero Client
const client = new PayHeroClient({
  authToken: process.env.AUTH_TOKEN
});

// ======================
// Subscription Plans Data
// ======================
const subscriptionPlans = {
  'streaming': {
    category: 'Streaming Services',
    icon: 'fas fa-play-circle',
    color: '#FF6B6B',
    plans: {
      'netflix': { name: 'Netflix Premium', price: 500, duration: '1 Month', features: ['4K Ultra HD', '4 Screens', 'Unlimited Content'], popular: true },
      'spotify': { name: 'Spotify Premium', price: 180, duration: '1 Month', features: ['Ad-free Music', 'Offline Downloads', 'High Quality Audio'] },
      'showmax': { name: 'Showmax Pro', price: 150, duration: '1 Month', features: ['Live Sports', 'Showmax Originals', 'Multiple Devices'] },
      'primevideo': { name: 'Prime Video', price: 200, duration: '1 Month', features: ['4K Streaming', 'Amazon Originals', 'Offline Viewing'] },
      'hdopremium': { name: 'HDO Box Premium', price: 150, duration: '1 Month', features: ['No Ads', 'All Content Unlocked', 'HD Streaming'] },
      'disney': { name: 'Disney+', price: 500, duration: '1 Year', features: ['Family Entertainment', 'Marvel, Pixar, Star Wars', 'Offline Downloads'] },
      'ytpremium': { name: 'YouTube Premium', price: 80, duration: '1 Month', features: ['Ad-Free Videos', 'Background Play', 'Offline Viewing'] },
      'crunchyroll': { name: 'Crunchyroll Premium', price: 400, duration: '1 Year', features: ['All Anime Unlocked', 'Simulcasts', 'No Ads'] },
      'dstv': { name: 'DStv Premium', price: 800, duration: '1 Month', features: ['Live TV', 'Sports & Movies', 'HD Channels', 'Catch-Up Shows'], popular: true }
    }
  },
  'security': {
    category: 'VPN & Security',
    icon: 'fas fa-shield-alt',
    color: '#4ECDC4',
    plans: {
      'expressvpn': { name: 'ExpressVPN', price: 150, duration: '1 Month', features: ['Lightning Fast', 'Secure Browsing', 'Global Servers'] },
      'pornhub': { name: 'Pornhub Premium', price: 500, duration: '1 Year', features: ['No Ads', 'Unlocked Premium Videos', 'Live Shows Access'] },
      'brazzers': { name: 'Brazzers Premium', price: 500, duration: '1 Year', features: ['Full HD Videos', 'Exclusive Content', 'Unlimited Access'] },
      'nordvpn': { name: 'NordVPN', price: 250, duration: '1 Month', features: ['Military Encryption', '6 Devices', 'No Logs Policy'], popular: true },
      'surfshark': { name: 'Surfshark VPN', price: 300, duration: '1 Month', features: ['Unlimited Devices', 'CleanWeb', 'Whitelister'] }
    }
  },
  'productivity': {
    category: 'Productivity Tools',
    icon: 'fas fa-briefcase',
    color: '#45B7D1',
    plans: {
      'whatsappbot': { name: 'WhatsApp Bot', price: 60, duration: 'Lifetime', features: ['Auto Replies', 'Bulk Messaging', '24/7 Support'] },
      'unlimitedpanels': { name: 'Unlimited Panels', price: 100, duration: 'Lifetime', features: ['All Services', 'Auto Updates', 'Premium Support'] },
      'canvapro': { name: 'Canva Pro', price: 80, duration: '1 Month', features: ['Premium Templates', 'Background Remover', 'Magic Resize'] },
      'capcutpro': { name: 'CapCut Pro', price: 300, duration: '1 Month', features: ['Premium Effects', 'No Watermark', 'Cloud Storage'], popular: true },
      'chatgptpremium': { name: 'ChatGPT Premium', price: 350, duration: '1 Month', features: ['Priority Access', 'Faster Responses', 'GPT-4 Access'] },
      'tradingview': { name: 'TradingView Premium', price: 300, duration: '1 Month', features: ['Real-Time Data', 'Advanced Charts', 'Multiple Layouts'], popular: true }
    }
  }
};

// ======================
// Routes
// ======================
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

app.get('/api/plans', (req, res) => {
  res.json({ success: true, categories: subscriptionPlans });
});

// ======================
// Payment Processing
// ======================
app.post('/api/initiate-payment', async (req, res) => {
  try {
    const { planId, phoneNumber, customerName, email } = req.body;

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
      return res.status(400).json({ success: false, error: 'Invalid subscription plan' });
    }

    // Format phone
    let formattedPhone = phoneNumber.trim();
    if (formattedPhone.startsWith('0')) formattedPhone = '254' + formattedPhone.substring(1);
    else if (formattedPhone.startsWith('+')) formattedPhone = formattedPhone.substring(1);

    if (!formattedPhone.startsWith('254') || formattedPhone.length !== 12) {
      return res.status(400).json({ success: false, error: 'Phone number must be in format 2547XXXXXXXX' });
    }

    const reference = `CHEGE-${planId.toUpperCase()}-${Date.now()}`;
    const stkPayload = {
      phone_number: formattedPhone,
      amount: plan.price,
      provider: 'm-pesa',
      channel_id: process.env.CHANNEL_ID,
      external_reference: reference,
      customer_name: customerName || 'CHEGE Tech Customer'
    };

    console.log('🔄 Initiating payment for:', plan.name);
    const response = await client.stkPush(stkPayload);

    res.json({
      success: true,
      message: `Payment initiated for ${plan.name}`,
      data: {
        reference,
        plan: plan.name,
        category: categoryName,
        amount: plan.price,
        duration: plan.duration,
        checkoutMessage: `You will receive an M-Pesa prompt to pay KES ${plan.price} for ${plan.name}`
      }
    });

  } catch (error) {
    console.error('❌ Payment initiation error:', error);
    res.status(500).json({ success: false, error: error.message || 'Failed to initiate payment' });
  }
});

// ======================
// Donation Endpoint
// ======================
app.post('/api/donate', async (req, res) => {
  try {
    const { phoneNumber, amount, customerName } = req.body;

    if (!phoneNumber || !amount) {
      return res.status(400).json({ success: false, error: 'Phone number and amount are required' });
    }

    let formattedPhone = phoneNumber.trim();
    if (formattedPhone.startsWith('0')) formattedPhone = '254' + formattedPhone.substring(1);
    else if (formattedPhone.startsWith('+')) formattedPhone = formattedPhone.substring(1);

    if (!formattedPhone.startsWith('254') || formattedPhone.length !== 12) {
      return res.status(400).json({ success: false, error: 'Phone number must be in format 2547XXXXXXXX' });
    }

    const donationAmount = parseFloat(amount);
    if (donationAmount < 1) return res.status(400).json({ success: false, error: 'Minimum donation is KES 1' });
    if (donationAmount > 150000) return res.status(400).json({ success: false, error: 'Maximum donation is KES 150,000' });

    const reference = `DONATION-${Date.now()}`;
    const stkPayload = {
      phone_number: formattedPhone,
      amount: donationAmount,
      provider: 'm-pesa',
      channel_id: process.env.CHANNEL_ID,
      external_reference: reference,
      customer_name: customerName || 'CHEGE Tech Supporter'
    };

    console.log('💝 Processing donation:', { amount: donationAmount, phone: formattedPhone });
    const response = await client.stkPush(stkPayload);

    res.json({
      success: true,
      message: `Donation of KES ${donationAmount} initiated successfully`,
      data: {
        reference,
        amount: donationAmount,
        checkoutMessage: `You will receive an M-Pesa prompt to donate KES ${donationAmount}`,
        thankYouMessage: 'Thank you for supporting Chege Tech!',
        isDonation: true
      }
    });

  } catch (error) {
    console.error('❌ Donation error:', error);
    res.status(500).json({ success: false, error: 'Failed to process donation' });
  }
});

// ======================
// Check Payment Status
// ======================
app.get('/api/check-payment/:reference', async (req, res) => {
  try {
    const { reference } = req.params;
    const status = await client.transactionStatus(reference);

    if (status.status === 'success') {
      const isDonation = reference.startsWith('DONATION');
      const whatsappUrl = isDonation
        ? `https://wa.me/254781287381?text=Thank%20you%20for%20your%20donation%20${reference}!`
        : `https://wa.me/254781287381?text=Payment%20Successful%20for%20${reference}.%20Please%20provide%20my%20account%20details.`;

      return res.json({
        success: true,
        status: 'success',
        whatsappUrl,
        isDonation,
        message: isDonation
          ? 'Donation confirmed! Thank you for your support.'
          : 'Payment confirmed! Redirecting to WhatsApp...'
      });
    }

    res.json({ success: true, status: status.status, message: `Payment status: ${status.status}` });

  } catch (error) {
    console.error('❌ Payment check error:', error);
    res.status(500).json({ success: false, error: 'Failed to check payment status' });
  }
});

// ======================
// Health Check
// ======================
app.get('/api/health', async (req, res) => {
  try {
    const balance = await client.serviceWalletBalance();
    res.json({
      success: true,
      message: 'Chege Tech Premium Service is running optimally',
      data: {
        account_id: process.env.CHANNEL_ID,
        timestamp: new Date().toISOString(),
        status: 'operational',
        uptime: process.uptime()
      }
    });
  } catch (error) {
    res.status(503).json({
      success: false,
      message: 'Service experiencing issues',
      error: error.message
    });
  }
});

// ======================
// Start Server
// ======================
app.listen(port, () => {
  console.log('🚀 CHEGE Tech Premium Service Started');
  console.log('📍 Port:', port);
  console.log('🔑 Account ID:', process.env.CHANNEL_ID);
  console.log('🌐 URL: http://localhost:' + port);
  console.log('💝 Donation system: ACTIVE');
  console.log('🎯 Categories: Streaming, Security, Productivity');
});

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

// Enhanced Subscription plans data with categories
const subscriptionPlans = {
  // 🧠 AI & Productivity
  'chatgptpremium': { name: 'ChatGPT Premium', price: 500, duration: '1 Month', category: 'AI & Productivity', features: ['Priority Access', 'Faster Responses', 'GPT-4 Access', '24/7 Availability'], popular: true },
  'notion': { name: 'Notion Plus', price: 200, duration: '1 Month', category: 'AI & Productivity', features: ['Unlimited Blocks', 'Collaboration Tools', 'File Uploads'], popular: false },
  'microsoft365': { name: 'Microsoft 365', price: 500, duration: '1 Month', category: 'AI & Productivity', features: ['Office Apps', 'Cloud Storage', 'Collaboration Tools'], popular: false },
  'googleone': { name: 'Google One', price: 250, duration: '1 Month', category: 'AI & Productivity', features: ['Cloud Storage', 'VPN Access', 'Family Sharing'], popular: false },
  'adobecc': { name: 'Adobe Creative Cloud', price: 700, duration: '1 Month', category: 'AI & Productivity', features: ['Full Suite Access', 'Cloud Sync', 'Regular Updates'], popular: false },

  // 🎥 Streaming Services
  'disney': { name: 'Disney+', price: 200, duration: '1 Month', category: 'Streaming', features: ['Movies & Series', 'HD Streaming', 'Ad-Free'], popular: true },
  'disneyyear': { name: 'Disney+ (1 Year)', price: 1000, duration: '1 Year', category: 'Streaming', features: ['Movies & Series', 'HD Streaming', 'Ad-Free'], popular: true },
  'paramount': { name: 'Paramount+', price: 300, duration: '1 Month', category: 'Streaming', features: ['Exclusive Shows', 'Movies', 'HD Streaming'], popular: false },
  'peacock': { name: 'Peacock Premium', price: 150, duration: '1 Month', category: 'Streaming', features: ['Exclusive Movies', 'NBC Shows', 'Ad-Free Streaming'], popular: false },
  'crunchyroll': { name: 'Crunchyroll Premium', price: 250, duration: '1 Month', category: 'Streaming', features: ['Anime Streaming', 'Simulcast Episodes', 'Ad-Free HD Viewing'], popular: false },
  'discoveryplus': { name: 'Discovery+', price: 200, duration: '1 Month', category: 'Streaming', features: ['Documentaries', 'Reality Shows', 'Ad-Free Experience'], popular: false },
  'showtime': { name: 'Showtime Anytime', price: 250, duration: '1 Month', category: 'Streaming', features: ['Exclusive Shows', 'HD Streaming', 'No Ads'], popular: false },
  'starzplay': { name: 'StarzPlay', price: 300, duration: '1 Month', category: 'Streaming', features: ['Movies & Series', 'HD Quality', 'Ad-Free Streaming'], popular: false },
  'appletv': { name: 'Apple TV+', price: 350, duration: '1 Month', category: 'Streaming', features: ['Apple Originals', '4K Streaming', 'Family Sharing'], popular: false },
  'lionsgate': { name: 'Lionsgate+', price: 250, duration: '1 Month', category: 'Streaming', features: ['Exclusive Series', 'HD Streaming', 'Ad-Free'], popular: false },
  'betplus': { name: 'BET+', price: 200, duration: '1 Month', category: 'Streaming', features: ['Black Culture Entertainment', 'HD Streaming', 'Exclusive Content'], popular: false },
  'curiositystream': { name: 'CuriosityStream', price: 150, duration: '1 Month', category: 'Streaming', features: ['Educational Documentaries', 'HD Streaming', 'No Ads'], popular: false },

  // 🔥 Adult Sites
  'pornhub': { name: 'Pornhub Premium', price: 200, duration: '1 Month', category: 'Adult', features: ['HD Videos', 'No Ads', 'Exclusive Content'], popular: false },
  'brazzers': { name: 'Brazzers Lifetime', price: 900, duration: 'Lifetime', category: 'Adult', features: ['Unlimited Access', 'Full HD', 'No Ads'], popular: false },

  // 🎵 Music & Audio
  'youtubepremium': { name: 'YouTube Premium', price: 300, duration: '1 Month', category: 'Music & Audio', features: ['Ad-Free Videos', 'Background Play', 'YouTube Music'], popular: false },
  'deezer': { name: 'Deezer Premium', price: 200, duration: '1 Month', category: 'Music & Audio', features: ['Ad-Free Music', 'Offline Listening', 'High Quality Audio'], popular: false },
  'tidal': { name: 'Tidal HiFi', price: 250, duration: '1 Month', category: 'Music & Audio', features: ['HiFi Audio', 'Offline Mode', 'Ad-Free'], popular: false },
  'soundcloud': { name: 'SoundCloud Go+', price: 150, duration: '1 Month', category: 'Music & Audio', features: ['Ad-Free Music', 'Offline Access', 'Full Catalog'], popular: false },
  'audible': { name: 'Audible Premium Plus', price: 400, duration: '1 Month', category: 'Music & Audio', features: ['Audiobooks Access', 'Monthly Credits', 'Offline Listening'], popular: false },

  // 📚 Learning & Courses
  'skillshare': { name: 'Skillshare Premium', price: 350, duration: '1 Month', category: 'Learning', features: ['Unlimited Classes', 'Offline Access', 'Creative Skills'], popular: false },
  'masterclass': { name: 'MasterClass', price: 600, duration: '1 Month', category: 'Learning', features: ['Expert Instructors', 'Unlimited Lessons', 'Offline Access'], popular: false },
  'duolingo': { name: 'Duolingo Super', price: 150, duration: '1 Month', category: 'Learning', features: ['Ad-Free Learning', 'Offline Lessons', 'Unlimited Hearts'], popular: false },

  // 🕹️ Gaming
  'xbox': { name: 'Xbox Game Pass', price: 400, duration: '1 Month', category: 'Gaming', features: ['100+ Games', 'Cloud Gaming', 'Exclusive Titles'], popular: false },
  'playstation': { name: 'PlayStation Plus', price: 400, duration: '1 Month', category: 'Gaming', features: ['Multiplayer Access', 'Monthly Games', 'Discounts'], popular: false },
  'eaplay': { name: 'EA Play', price: 250, duration: '1 Month', category: 'Gaming', features: ['EA Games Access', 'Early Trials', 'Member Rewards'], popular: false },
  'ubisoft': { name: 'Ubisoft+', price: 300, duration: '1 Month', category: 'Gaming', features: ['Ubisoft Games Library', 'New Releases', 'Cloud Play'], popular: false },
  'geforcenow': { name: 'Nvidia GeForce Now', price: 350, duration: '1 Month', category: 'Gaming', features: ['Cloud Gaming', 'High Performance', 'Cross-Device Access'], popular: false },

  // 🔒 VPNs
  'urbanvpn': { name: 'Urban VPN', price: 100, duration: '1 Month', category: 'VPNs', features: ['Unlimited Bandwidth', 'Multiple Servers', 'Privacy Protection'], popular: false },
  'surfshark': { name: 'Surfshark VPN', price: 200, duration: '1 Month', category: 'VPNs', features: ['Unlimited Devices', 'Ad Blocker', 'Fast Servers'], popular: false },
  'cyberghost': { name: 'CyberGhost VPN', price: 250, duration: '1 Month', category: 'VPNs', features: ['Global Servers', 'Streaming Support', 'No Logs'], popular: false },
  'ipvanish': { name: 'IPVanish', price: 200, duration: '1 Month', category: 'VPNs', features: ['Unlimited Bandwidth', 'Strong Encryption', 'Fast Connections'], popular: false },
  'protonvpn': { name: 'ProtonVPN Plus', price: 300, duration: '1 Month', category: 'VPNs', features: ['Secure Core', 'No Logs', 'High-Speed Servers'], popular: false },
  'windscribe': { name: 'Windscribe Pro', price: 150, duration: '1 Month', category: 'VPNs', features: ['Unlimited Data', 'Global Servers', 'Ad Block'], popular: false }
};


// Routes
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

app.get('/api/plans', (req, res) => {
  res.json({ success: true, categories: subscriptionPlans });
});

app.post('/api/initiate-payment', async (req, res) => {
  try {
    const { planId, phoneNumber, customerName, email } = req.body;

    // Find plan in categories
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

    // Generate unique reference
    const reference = `CHEGE-${planId.toUpperCase()}-${Date.now()}`;

    // Initiate STK Push
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
    res.status(500).json({
      success: false,
      error: error.message || 'Failed to initiate payment'
    });
  }
});

// Enhanced Donation Endpoint
app.post('/api/donate', async (req, res) => {
  try {
    const { phoneNumber, amount, customerName, message } = req.body;

    if (!phoneNumber || !amount) {
      return res.status(400).json({
        success: false,
        error: 'Phone number and amount are required'
      });
    }

    // Format phone number
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

    // Validate amount
    const donationAmount = parseFloat(amount);
    if (donationAmount < 1) {
      return res.status(400).json({
        success: false,
        error: 'Minimum donation amount is KES 5'
      });
    }

    if (donationAmount > 150000) {
      return res.status(400).json({
        success: false,
        error: 'Maximum donation amount is KES 150,000'
      });
    }

    // Generate unique reference
    const reference = `DONATION-${Date.now()}`;

    // Initiate STK Push for donation
    const stkPayload = {
      phone_number: formattedPhone,
      amount: donationAmount,
      provider: 'm-pesa',
      channel_id: process.env.CHANNEL_ID,
      external_reference: reference,
      customer_name: customerName || 'Chege Tech Supporter'
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
        thankYouMessage: 'Thank you for supporting Chege Tech! Your contribution helps us improve our services.',
        isDonation: true
      }
    });

  } catch (error) {
    console.error('❌ Donation initiation error:', error);
    res.status(500).json({
      success: false,
      error: error.message || 'Failed to process donation'
    });
  }
});

app.get('/api/check-payment/:reference', async (req, res) => {
  try {
    const { reference } = req.params;
    
    const status = await client.transactionStatus(reference);
    
    if (status.status === 'success') {
      const isDonation = reference.startsWith('DONATION');
      let whatsappUrl = '';
      
      if (isDonation) {
        whatsappUrl = `https://wa.me/254781287381?text=Thank%20you%20for%20your%20donation%20${reference}!%20Your%20support%20means%20a%20lot.`;
      } else {
        whatsappUrl = `https://wa.me/254781287381?text=Payment%20Successful%20for%20${reference}.%20Please%20provide%20my%20account%20details.`;
      }
      
      return res.json({
        success: true,
        status: 'success',
        whatsappUrl: whatsappUrl,
        isDonation: isDonation,
        message: isDonation ? 
          'Donation confirmed! Thank you for your support.' : 
          'Payment confirmed! Redirecting to WhatsApp for account details...'
      });
    }
    
    res.json({
      success: true,
      status: status.status,
      message: `Payment status: ${status.status}`
    });
    
  } catch (error) {
    console.error('❌ Payment check error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to check payment status'
    });
  }
});

app.get('/success', (req, res) => {
  res.sendFile(path.join(__dirname, 'views', 'success.html'));
});

// Health check endpoint
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
      message: 'Service experiencing connectivity issues',
      error: error.message
    });
  }
});

// Start server
app.listen(port, () => {
  console.log('🚀 CHEGE Tech Premium Service Started');
  console.log('📍 Port:', port);
  console.log('🔑 Account ID:', process.env.CHANNEL_ID);
  console.log('🌐 URL: http://localhost:' + port);
  console.log('💝 Donation system: ACTIVE');
  console.log('🎯 Categories: Streaming, Security, Productivity');
});

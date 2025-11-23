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
  streaming: {
    category: 'Streaming Services',
    icon: 'fas fa-play-circle',
    color: '#4169E1',
    plans: {
      'netflix': { name: 'Netflix', price: 400, duration: '1 Month', features: ['HD Streaming', 'Multiple Devices', 'Original Shows'], popular: true },
      'primevideo': { name: 'Prime Video', price: 100, duration: '1 Month', features: ['HD Streaming', 'Amazon Originals', 'Offline Viewing'], popular: true },
      'primevideo_3m': { name: 'Prime Video (3 Months)', price: 250, duration: '3 Months', features: ['HD Streaming', 'Amazon Originals', 'Offline Viewing'], popular: true },
      'primevideo_6m': { name: 'Prime Video (6 Months)', price: 550, duration: '6 Months', features: ['HD Streaming', 'Amazon Originals', 'Offline Viewing'], popular: true },
      'primevideo_1y': { name: 'Prime Video (1 Year)', price: 1000, duration: '1 Year', features: ['HD Streaming', 'Amazon Originals', 'Offline Viewing'], popular: true },
       'showmax_1m': { name: 'Showmax Pro (1 Month)', price: 100, duration: '1 Month', features: ['Live Sports', 'Showmax Originals', 'Multiple Devices'], logo: '/logos/showmax.png' },
      'showmax_3m': { name: 'Showmax Pro (3 Months)', price: 250, duration: '3 Months', features: ['Live Sports', 'Showmax Originals', 'Multiple Devices'], logo: '/logos/showmax.png' },
       'showmax_6m': { name: 'Showmax Pro (6 Months)', price: 500, duration: '6 Months', features: ['Live Sports', 'Showmax Originals', 'Multiple Devices'], logo: '/logos/showmax.png' },
      'showmax_1y': { name: 'Showmax Pro (1 Year)', price: 900, duration: '1 Year', features: ['Live Sports', 'Showmax Originals', 'Multiple Devices'], logo: '/logos/showmax.png', popular: true },
      'peacock': { name: 'Peacock', price: 150, duration: '1 Month', features: ['Full HD Streaming', 'Exclusive NBC Content', 'No Ads Plan'] },
       'peacock_1y': { name: 'Peacock Premium (1 Year)', price: 900, duration: '1 Year', features: ['Live Sports', 'NBC Originals', 'Movies & TV Shows'], logo: '/logos/peacock.png', popular: true },
      'crunchyroll_1y': { name: 'Crunchyroll Premium (1 Year)', price: 900, duration: '1 Year', features: ['Anime Simulcasts', 'No Ads', 'Offline Viewing'], logo: '/logos/crunchyroll.png', popular: true },
      'paramount': { name: 'Paramount+', price: 300, duration: '1 Month', features: ['HD Streaming', 'Exclusive Paramount Content', 'Ad-Free Experience'] },
      'disney': { name: 'Disney+', price: 1000, duration: '1 Year', features: ['HD Streaming', 'Disney Originals', 'Marvel, Pixar & Star Wars'] },
      'hbomax': { name: 'HBO Max', price: 300, duration: '1 Month', features: ['HBO Originals', 'HD & 4K Streaming', 'Ad-Free'] },
      'hulu': { name: 'Hulu', price: 250, duration: '1 Month', features: ['TV Shows & Movies', 'Ad-Free Option', 'Live TV'] },
      'crunchyroll': { name: 'Crunchyroll Premium', price: 250, duration: '1 Month', features: ['Anime Streaming', 'Simulcast Episodes', 'Ad-Free HD Viewing'] },
      'discoveryplus': { name: 'Discovery+', price: 200, duration: '1 Month', features: ['Documentaries', 'Reality Shows', 'Ad-Free Experience'] },
      'showtime': { name: 'Showtime Anytime', price: 250, duration: '1 Month', features: ['Exclusive Shows', 'HD Streaming', 'No Ads'] },
      'starzplay': { name: 'StarzPlay', price: 300, duration: '1 Month', features: ['Movies & Series', 'HD Quality', 'Ad-Free Streaming'] },
      'appletv': { name: 'Apple TV+', price: 350, duration: '1 Month', features: ['Apple Originals', '4K Streaming', 'Family Sharing'] },
      'lionsgate': { name: 'Lionsgate+', price: 250, duration: '1 Month', features: ['Exclusive Series', 'HD Streaming', 'Ad-Free'] },
      'betplus': { name: 'BET+', price: 200, duration: '1 Month', features: ['Black Culture Entertainment', 'HD Streaming', 'Exclusive Content'] },
      'curiositystream': { name: 'CuriosityStream', price: 150, duration: '1 Month', features: ['Educational Documentaries', 'HD Streaming', 'No Ads'] }
    }
  },

  music: {
    category: 'Music & Audio',
    icon: 'fas fa-music',
    color: '#F7B801',
    plans: {
      'spotify': { name: 'Spotify Premium', price: 500, duration: '3 Months', features: ['Ad-Free Music', 'Offline Mode', 'High-Quality Audio'] },
      'applemusic': { name: 'Apple Music', price: 250, duration: '1 Month', features: ['Ad-Free Music', 'Offline Listening', 'Lossless Audio'] },
      'youtubepremium': { name: 'YouTube Premium', price: 100, duration: '1 Month', features: ['Ad-Free Videos', 'Background Play', 'YouTube Music'] },
      'deezer': { name: 'Deezer Premium', price: 200, duration: '1 Month', features: ['Ad-Free Music', 'Offline Listening', 'High Quality Audio'] },
      'tidal': { name: 'Tidal HiFi', price: 250, duration: '1 Month', features: ['HiFi Audio', 'Offline Mode', 'Ad-Free'] },
      'soundcloud': { name: 'SoundCloud Go+', price: 150, duration: '1 Month', features: ['Ad-Free Music', 'Offline Access', 'Full Catalog'] },
      'audible': { name: 'Audible Premium Plus', price: 400, duration: '1 Month', features: ['Audiobooks Access', 'Monthly Credits', 'Offline Listening'] }
    }
  },

  productivity: {
    category: 'Productivity Tools',
    icon: 'fas fa-briefcase',
    color: '#45B7D1',
    plans: {
      'canva': { name: 'Canva Pro', price: 300, duration: '1 Month', features: ['Premium Templates', 'Brand Kit', 'Background Remover'] },
      'grammarly': { name: 'Grammarly Premium', price: 250, duration: '1 Month', features: ['Advanced Grammar', 'Tone Detection', 'Plagiarism Check'] },
      'skillshare': { name: 'Skillshare Premium', price: 350, duration: '1 Month', features: ['Unlimited Classes', 'Offline Access', 'Creative Skills'] },
      'masterclass': { name: 'MasterClass', price: 600, duration: '1 Month', features: ['Expert Instructors', 'Unlimited Lessons', 'Offline Access'] },
      'duolingo': { name: 'Duolingo Super', price: 150, duration: '1 Month', features: ['Ad-Free Learning', 'Offline Lessons', 'Unlimited Hearts'] },
      'notion': { name: 'Notion Plus', price: 200, duration: '1 Month', features: ['Unlimited Blocks', 'Collaboration Tools', 'File Uploads'] },
      'microsoft365': { name: 'Microsoft 365', price: 500, duration: '1 Month', features: ['Office Apps', 'Cloud Storage', 'Collaboration Tools'] },
      'googleone': { name: 'Google One', price: 250, duration: '1 Month', features: ['Cloud Storage', 'VPN Access', 'Family Sharing'] },
      'adobecc': { name: 'Adobe Creative Cloud', price: 700, duration: '1 Month', features: ['Full Suite Access', 'Cloud Sync', 'Regular Updates'] }
    }
  },

  vpn: {
    category: 'VPN & Security',
    icon: 'fas fa-shield-alt',
    color: '#4ECDC4',
    plans: {
      'urbanvpn': { name: 'Urban VPN', price: 100, duration: '1 Month', features: ['Unlimited Bandwidth', 'Global Servers', 'Fast & Secure Connection'] },
      'nordvpn': { name: 'NordVPN', price: 350, duration: '1 Month', features: ['Fast Servers', 'Secure Encryption', 'No Logs'] },
      'expressvpn': { name: 'ExpressVPN', price: 400, duration: '1 Month', features: ['Ultra Fast', 'Global Servers', 'No Logs'] },
      'surfshark': { name: 'Surfshark VPN', price: 200, duration: '1 Month', features: ['Unlimited Devices', 'Ad Blocker', 'Fast Servers'] },
      'cyberghost': { name: 'CyberGhost VPN', price: 250, duration: '1 Month', features: ['Global Servers', 'Streaming Support', 'No Logs'] },
      'ipvanish': { name: 'IPVanish', price: 200, duration: '1 Month', features: ['Unlimited Bandwidth', 'Strong Encryption', 'Fast Connections'] },
      'protonvpn': { name: 'ProtonVPN Plus', price: 300, duration: '1 Month', features: ['Secure Core', 'No Logs', 'High-Speed Servers'] },
      'windscribe': { name: 'Windscribe Pro', price: 150, duration: '1 Month', features: ['Unlimited Data', 'Global Servers', 'Ad Block'] }
    }
  },

  gaming: {
    category: 'Gaming Services',
    icon: 'fas fa-gamepad',
    color: '#A28BFE',
    plans: {
      'xbox': { name: 'Xbox Game Pass', price: 400, duration: '1 Month', features: ['100+ Games', 'Cloud Gaming', 'Exclusive Titles'] },
      'playstation': { name: 'PlayStation Plus', price: 400, duration: '1 Month', features: ['Multiplayer Access', 'Monthly Games', 'Discounts'] },
      'eaplay': { name: 'EA Play', price: 250, duration: '1 Month', features: ['EA Games Access', 'Early Trials', 'Member Rewards'] },
      'ubisoft': { name: 'Ubisoft+', price: 300, duration: '1 Month', features: ['Ubisoft Games Library', 'New Releases', 'Cloud Play'] },
      'geforcenow': { name: 'Nvidia GeForce Now', price: 350, duration: '1 Month', features: ['Cloud Gaming', 'High Performance', 'Cross-Device Access'] }
    }
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
      customer_name: customerName || 'Bera Tech Customer'
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
        error: 'Minimum donation amount is KES 1'
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
      customer_name: customerName || 'Bera Tech Supporter'
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
        thankYouMessage: 'Thank you for supporting Bera Tech! Your contribution helps us improve our services.',
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
      message: 'Bera Tech Premium Service is running optimally',
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
  console.log('🚀 Chege Tech Premium Service Started');
  console.log('📍 Port:', port);
  console.log('🔑 Account ID:', process.env.CHANNEL_ID);
  console.log('🌐 URL: http://localhost:' + port);
  console.log('💝 Donation system: ACTIVE');
  console.log('🎯 Categories: Streaming, Security, Productivity');
});

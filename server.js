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

const bcrypt = require('bcrypt');
const session = require('express-session');

// Session middleware
app.use(session({
  secret: 'your-secret-key',
  resave: false,
  saveUninitialized: true
}));

// Temporary user store (replace with a database later)
const users = [];


// ======================
// Subscription Plans Data
// ======================
const subscriptionPlans = {
  'streaming': {
    category: 'Streaming Services',
    icon: 'fas fa-play-circle',
    color: '#FF6B6B',
    plans: {
      'netflix': {
        name: 'Netflix Premium',
        price: 500,
        duration: '1 Month',
        features: ['4K Ultra HD', '4 Screens', 'Unlimited Content'],
        logo: '/logos/netflix.png',  // <-- updated,
        popular: true
      },
      'spotify': {
        name: 'Spotify Premium',
        price: 180,
        duration: '1 Month',
        features: ['Ad-free Music', 'Offline Downloads', 'High Quality Audio'],
        logo: '/logos/spotify.png'  // <-- updated path
      },
      'showmax': {
        name: 'Showmax Pro',
        price: 150,
        duration: '1 Month',
        features: ['Live Sports', 'Showmax Originals', 'Multiple Devices'],
        logo: '/logos/showmax.png'  // <-- updated path
      },
      'primevideo': {
        name: 'Prime Video',
        price: 200,
        duration: '1 Month',
        features: ['4K Streaming', 'Amazon Originals', 'Offline Viewing'],
        logo: '/logos/primevideo.png'  // <-- updated path
      },
      'hdopremium': {
        name: 'HDO Box Premium',
        price: 150,
        duration: '1 Month',
        features: ['No Ads', 'All Content Unlocked', 'HD Streaming'],
        logo: '/logos/hdopremium.png'  // <-- updated path
      },
      'disney': {
        name: 'Disney+',
        price: 500,
        duration: '1 Year',
        features: ['Family Entertainment', 'Marvel, Pixar, Star Wars', 'Offline Downloads'],
        logo: 'https://cdn.jsdelivr.net/gh/simple-icons/simple-icons/icons/disneyplus.svg'
      },
      'ytpremium': {
        name: 'YouTube Premium',
        price: 80,
        duration: '1 Month',
        features: ['Ad-Free Videos', 'Background Play', 'Offline Viewing'],
        logo: 'https://cdn.jsdelivr.net/gh/simple-icons/simple-icons/icons/youtube.svg'
      },
      'crunchyroll': {
        name: 'Crunchyroll Premium',
        price: 400,
        duration: '1 Year',
        features: ['All Anime Unlocked', 'Simulcasts', 'No Ads'],
        logo: 'https://cdn.jsdelivr.net/gh/simple-icons/simple-icons/icons/crunchyroll.svg'
      },
      'dstv': {
        name: 'DStv Premium',
        price: 800,
        duration: '1 Month',
        features: ['Live TV', 'Sports & Movies', 'HD Channels', 'Catch-Up Shows'],
        logo: 'https://upload.wikimedia.org/wikipedia/commons/6/69/DStv_logo.svg',
        popular: true
      }
    }
  },

  'security': {
    category: 'VPN & Security',
    icon: 'fas fa-shield-alt',
    color: '#4ECDC4',
    plans: {
      'expressvpn': {
        name: 'ExpressVPN',
        price: 150,
        duration: '1 Month',
        features: ['Lightning Fast', 'Secure Browsing', 'Global Servers'],
        logo: 'https://cdn.jsdelivr.net/gh/simple-icons/simple-icons/icons/expressvpn.svg'
      },
      'pornhub': {
        name: 'Pornhub Premium',
        price: 500,
        duration: '1 Year',
        features: ['No Ads', 'Unlocked Premium Videos', 'Live Shows Access'],
        logo: 'https://cdn.jsdelivr.net/gh/simple-icons/simple-icons/icons/pornhub.svg'
      },
      'brazzers': {
        name: 'Brazzers Premium',
        price: 500,
        duration: '1 Year',
        features: ['Full HD Videos', 'Exclusive Content', 'Unlimited Access'],
        logo: 'https://cdn.jsdelivr.net/gh/simple-icons/simple-icons/icons/brazzers.svg'
      },
      'nordvpn': {
        name: 'NordVPN',
        price: 250,
        duration: '1 Month',
        features: ['Military Encryption', '6 Devices', 'No Logs Policy'],
        logo: 'https://cdn.jsdelivr.net/gh/simple-icons/simple-icons/icons/nordvpn.svg',
        popular: true
      },
      'surfshark': {
        name: 'Surfshark VPN',
        price: 300,
        duration: '1 Month',
        features: ['Unlimited Devices', 'CleanWeb', 'Whitelister'],
        logo: 'https://cdn.jsdelivr.net/gh/simple-icons/simple-icons/icons/surfshark.svg'
      }
    }
  },

  'productivity': {
    category: 'Productivity Tools',
    icon: 'fas fa-briefcase',
    color: '#45B7D1',
    plans: {
      'whatsappbot': {
        name: 'WhatsApp Bot',
        price: 60,
        duration: 'Lifetime',
        features: ['Auto Replies', 'Bulk Messaging', '24/7 Support'],
        logo: 'https://cdn.jsdelivr.net/gh/simple-icons/simple-icons/icons/whatsapp.svg'
      },
      'unlimitedpanels': {
        name: 'Unlimited Panels',
        price: 100,
        duration: 'Lifetime',
        features: ['All Services', 'Auto Updates', 'Premium Support'],
        logo: 'https://cdn-icons-png.flaticon.com/512/906/906343.png'
      },
      'canvapro': {
        name: 'Canva Pro',
        price: 80,
        duration: '1 Month',
        features: ['Premium Templates', 'Background Remover', 'Magic Resize'],
        logo: 'https://cdn.jsdelivr.net/gh/simple-icons/simple-icons/icons/canva.svg'
      },
      'capcutpro': {
        name: 'CapCut Pro',
        price: 300,
        duration: '1 Month',
        features: ['Premium Effects', 'No Watermark', 'Cloud Storage'],
        logo: 'https://cdn.jsdelivr.net/gh/simple-icons/simple-icons/icons/capcut.svg',
        popular: true
      },
      'chatgptpremium': {
        name: 'ChatGPT Premium',
        price: 350,
        duration: '1 Month',
        features: ['Priority Access', 'Faster Responses', 'GPT-4 Access'],
        logo: 'https://cdn.jsdelivr.net/gh/simple-icons/simple-icons/icons/openai.svg'
      },
      'tradingview': {
        name: 'TradingView Premium',
        price: 300,
        duration: '1 Month',
        features: ['Real-Time Data', 'Advanced Charts', 'Multiple Layouts'],
        logo: 'https://cdn.jsdelivr.net/gh/simple-icons/simple-icons/icons/tradingview.svg',
        popular: true
      }
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

    if (!plan) return res.status(400).json({ success: false, error: 'Invalid subscription plan' });

    // Format phone
    let formattedPhone = phoneNumber.trim();
    if (formattedPhone.startsWith('0')) formattedPhone = '254' + formattedPhone.substring(1);
    else if (formattedPhone.startsWith('+')) formattedPhone = formattedPhone.substring(1);

    if (!formattedPhone.startsWith('254') || formattedPhone.length !== 12)
      return res.status(400).json({ success: false, error: 'Phone number must be in format 2547XXXXXXXX' });

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
    await client.stkPush(stkPayload);

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

app.post('/signup', async (req, res) => {
  const { username, email, password } = req.body;

  const existingUser = users.find(u => u.username === username);
  if (existingUser) {
    return res.send('Username already exists. <a href="/signup.html">Try again</a>');
  }

  const hashedPassword = await bcrypt.hash(password, 10);
  users.push({ username, email, password: hashedPassword });
  res.send('Account created successfully! <a href="/login.html">Login now</a>');
});

app.post('/login', async (req, res) => {
  const { username, password } = req.body;
  const user = users.find(u => u.username === username);

  if (user && await bcrypt.compare(password, user.password)) {
    req.session.user = username;
    res.send(`Welcome, ${username}! <a href="/">Go to homepage</a>`);
  } else {
    res.send('Invalid credentials. <a href="/login.html">Try again</a>');
  }
});

app.get('/logout', (req, res) => {
  req.session.destroy(() => {
    res.redirect('/login.html');
  });
});




// ======================
// Server Start
// ======================
app.listen(port, () => {
  console.log('🚀 CHEGE Tech Premium Service Started');
  console.log('📍 Port:', port);
  console.log('🔑 Account ID:', process.env.CHANNEL_ID);
  console.log('🌐 URL: http://localhost:' + port);
  console.log('💝 Donation system: ACTIVE');
  console.log('🎯 Categories: Streaming, Security, Productivity');
});

#!/bin/bash

# Find where to insert (before the /admin route)
LINE=$(grep -n "app.get.*'/admin'" server.js | head -1 | cut -d: -f1)

if [ -z "$LINE" ]; then
  echo "ERROR: Could not find /admin route"
  exit 1
fi

# Create the routes to insert
cat > /tmp/admin_routes.tmp << 'ROUTES'

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
    // SIMPLIFIED: Plain password comparison
    const ADMIN_USERNAME = process.env.ADMIN_USERNAME || 'admin';
    const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || 'chegeadmin123';
    const isValid = username === ADMIN_USERNAME && password === ADMIN_PASSWORD;
    
    if (isValid) {
      const sessionId = \`sess_\${Date.now()}_\${Math.random().toString(36).substr(2, 9)}\`;
      
      // Set cookie for browser access
      res.cookie('sessionId', sessionId, {
        httpOnly: true,
        secure: process.env.NODE_ENV === 'production',
        maxAge: 24 * 60 * 60 * 1000, // 24 hours
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
  const sessionId = (req.cookies && req.cookies.sessionId) || req.headers['x-session-id'] || req.body.sessionId;
  
  res.clearCookie('sessionId');
  res.json({
    success: true,
    message: 'Logged out successfully'
  });
});

app.get('/api/admin/check-auth', (req, res) => {
  const sessionId = (req.cookies && req.cookies.sessionId) || req.headers['x-session-id'] || req.query.sessionId;
  
  // Simple session check
  if (sessionId && sessionId.startsWith('sess_')) {
    res.json({
      success: true,
      authenticated: true,
      user: { username: 'admin' },
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
app.get('/api/admin/dashboard/stats', async (req, res) => {
  try {
    // These would normally come from your transactionManager and accountManager
    res.json({
      success: true,
      data: {
        revenue: {
          total: 0,
          thisMonth: 0,
          lastMonth: 0,
          monthlyGrowth: 0,
          dailyRevenue: {},
          monthlyRevenue: {},
          serviceRevenue: {}
        },
        transactions: {
          total: 0,
          successful: 0,
          failed: 0,
          pending: 0,
          recent: []
        },
        accounts: {
          total: 0,
          totalSlots: 0,
          usedSlots: 0,
          availableSlots: 0,
          totalRevenue: 0,
          services: 0,
          breakdown: {}
        },
        pendingPayments: 0,
        activeSessions: 0,
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

app.post('/api/admin/add-account', (req, res) => {
  const { service, account } = req.body;
  
  if (!service || !account) {
    return res.status(400).json({ 
      success: false, 
      error: 'Service and account details required' 
    });
  }
  
  res.json({
    success: true,
    message: \`Account added to \${service}\`,
    data: {
      id: \`\${service}_\${Date.now()}\`,
      ...account,
      addedAt: new Date().toISOString()
    }
  });
});

app.post('/api/admin/remove-account', (req, res) => {
  const { accountId } = req.body;
  
  if (!accountId) {
    return res.status(400).json({ 
      success: false, 
      error: 'Account ID is required' 
    });
  }
  
  res.json({
    success: true,
    message: 'Account removed successfully'
  });
});

app.get('/api/admin/accounts', (req, res) => {
  res.json({
    success: true,
    accounts: {}
  });
});

app.get('/api/admin/transactions', (req, res) => {
  res.json({
    success: true,
    transactions: [],
    total: 0,
    limit: 100,
    offset: 0
  });
});
ROUTES

# Insert the routes before the /admin HTML route
sed -i "\${LINE}i\\
// ADMIN API ROUTES ADDED BELOW" server.js
sed -i "${LINE}r /tmp/admin_routes.tmp" server.js

echo "✅ Admin API routes added successfully!"

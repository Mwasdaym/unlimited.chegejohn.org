require('dotenv').config();
const express = require('express');
const cors = require('cors');
const bodyParser = require('body-parser');
const path = require('path');
const fs = require('fs').promises;
const fsSync = require('fs');

const app = express();
const port = process.env.PORT || 3000;

// Middleware
app.use(cors());
app.use(bodyParser.json({ limit: '10mb' }));
app.use(express.static('public'));
app.use(express.urlencoded({ extended: true }));

// Simple routes for testing
app.get('/', (req, res) => {
  res.send('Chege Tech Premium - Server is running!');
});

// Admin API routes
app.post('/api/admin/login', (req, res) => {
  const { username, password } = req.body;
  const ADMIN_USERNAME = process.env.ADMIN_USERNAME || 'admin';
  const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || 'chegeadmin123';
  
  if (username === ADMIN_USERNAME && password === ADMIN_PASSWORD) {
    res.json({ 
      success: true, 
      message: 'Login successful',
      sessionId: `sess_${Date.now()}`,
      user: { username }
    });
  } else {
    res.status(401).json({ success: false, error: 'Invalid credentials' });
  }
});

app.get('/api/admin/check-auth', (req, res) => {
  res.json({ success: false, authenticated: false });
});

app.get('/api/admin/dashboard/stats', (req, res) => {
  res.json({
    success: true,
    data: {
      revenue: { total: 0 },
      transactions: { total: 0 },
      accounts: { total: 0 },
      lastUpdated: new Date().toISOString()
    }
  });
});

// Admin panel HTML route
app.get('/admin', (req, res) => {
  res.send(`
    <!DOCTYPE html>
    <html>
    <head>
      <title>Chege Tech Admin</title>
      <meta charset="UTF-8">
      <meta name="viewport" content="width=device-width, initial-scale=1.0">
      <style>
        body { font-family: Arial, sans-serif; padding: 20px; }
        .login-container { max-width: 400px; margin: 100px auto; padding: 20px; border: 1px solid #ddd; border-radius: 10px; }
        input { width: 100%; padding: 10px; margin: 10px 0; }
        button { background: #667eea; color: white; border: none; padding: 10px 20px; border-radius: 5px; cursor: pointer; }
      </style>
    </head>
    <body>
      <div class="login-container">
        <h2>Admin Login</h2>
        <input type="text" id="username" value="admin">
        <input type="password" id="password" value="chegeadmin123">
        <button onclick="login()">Login</button>
        <div id="message"></div>
      </div>
      <script>
        async function login() {
          const response = await fetch('/api/admin/login', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              username: document.getElementById('username').value,
              password: document.getElementById('password').value
            })
          });
          const data = await response.json();
          document.getElementById('message').innerHTML = data.success ? 
            '✅ Login successful!' : '❌ Login failed: ' + data.error;
        }
      </script>
    </body>
    </html>
  `);
});

// Start server
app.listen(port, () => {
  console.log(`🚀 Server running on port ${port}`);
  console.log(`🌐 Main URL: http://localhost:${port}`);
  console.log(`🔧 Admin Panel: http://localhost:${port}/admin`);
});

// ==================== FULL ADMIN PANEL ====================
// Replace the existing simple /admin route with the full one
// First, let's remove the last few lines to add our full version

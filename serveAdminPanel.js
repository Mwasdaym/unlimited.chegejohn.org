function serveAdminPanel(res) {
  res.send(`
    <!DOCTYPE html>
    <html>
    <head>
      <title>Chege Tech - Admin Panel</title>
      <style>
        body { 
          font-family: Arial, sans-serif; 
          margin: 40px; 
          background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
          min-height: 100vh;
        }
        .container { 
          max-width: 1200px; 
          margin: 0 auto; 
          background: white; 
          padding: 30px; 
          border-radius: 10px; 
          box-shadow: 0 10px 30px rgba(0,0,0,0.2);
        }
        h1 { 
          color: #333; 
          border-bottom: 2px solid #667eea; 
          padding-bottom: 10px; 
          display: flex;
          justify-content: space-between;
          align-items: center;
        }
        .dashboard {
          margin: 30px 0;
        }
        .dashboard-buttons {
          display: grid;
          grid-template-columns: repeat(auto-fit, minmax(300px, 1fr));
          gap: 20px;
          margin-bottom: 30px;
        }
        .dashboard-button {
          background: white;
          border: 1px solid #ddd;
          border-radius: 10px;
          padding: 30px;
          text-align: center;
          cursor: pointer;
          transition: all 0.3s ease;
          box-shadow: 0 4px 6px rgba(0,0,0,0.1);
        }
        .dashboard-button:hover {
          transform: translateY(-5px);
          box-shadow: 0 8px 15px rgba(0,0,0,0.2);
          border-color: #667eea;
        }
        .dashboard-button i {
          font-size: 40px;
          margin-bottom: 15px;
          color: #667eea;
        }
        .dashboard-button h3 {
          margin: 0 0 10px 0;
          color: #333;
        }
        .dashboard-button p {
          color: #666;
          margin: 0;
        }
        .stats-grid {
          display: grid;
          grid-template-columns: repeat(auto-fit, minmax(250px, 1fr));
          gap: 20px;
          margin-bottom: 30px;
        }
        .stat-card {
          background: white;
          border: 1px solid #ddd;
          border-radius: 10px;
          padding: 20px;
          box-shadow: 0 4px 6px rgba(0,0,0,0.1);
        }
        .stat-card h4 {
          margin: 0 0 15px 0;
          color: #333;
          font-size: 16px;
        }
        .stat-value {
          font-size: 28px;
          font-weight: bold;
          color: #667eea;
        }
        .stat-label {
          font-size: 14px;
          color: #666;
          margin-top: 5px;
        }
        .content-area {
          background: #f9f9f9;
          border-radius: 10px;
          padding: 20px;
          margin-top: 20px;
          display: none;
        }
        .active-content {
          display: block;
        }
        .form-group { margin-bottom: 20px; }
        label { display: block; margin-bottom: 5px; font-weight: bold; color: #333; }
        input, textarea, select { 
          width: 100%; 
          padding: 12px; 
          border: 1px solid #ddd; 
          border-radius: 5px; 
          font-size: 16px;
          box-sizing: border-box;
        }
        input:focus, textarea:focus, select:focus {
          border-color: #667eea;
          outline: none;
          box-shadow: 0 0 0 3px rgba(102, 126, 234, 0.1);
        }
        button { 
          background: #667eea; 
          color: white; 
          border: none; 
          padding: 12px 24px; 
          border-radius: 5px; 
          cursor: pointer; 
          margin-right: 10px; 
          margin-bottom: 10px;
          font-size: 16px;
          font-weight: bold;
          transition: background 0.3s;
        }
        button:hover { background: #5a67d8; }
        button.danger { background: #ef4444; }
        button.danger:hover { background: #dc2626; }
        button.success { background: #10b981; }
        button.success:hover { background: #059669; }
        button.secondary { background: #6c757d; }
        button.secondary:hover { background: #5a6268; }
        .success { background: #10b981; color: white; padding: 10px; border-radius: 5px; margin: 10px 0; }
        .error { background: #ef4444; color: white; padding: 10px; border-radius: 5px; margin: 10px 0; }
        .warning { background: #f59e0b; color: white; padding: 10px; border-radius: 5px; margin: 10px 0; }
        .info { background: #3b82f6; color: white; padding: 10px; border-radius: 5px; margin: 10px 0; }
        .stats { background: #f3f4f6; padding: 15px; border-radius: 5px; margin: 20px 0; }
        .account-list { margin-top: 20px; }
        .account-item { 
          padding: 15px; 
          border: 1px solid #ddd; 
          margin-bottom: 15px; 
          border-radius: 5px; 
          background: white;
        }
        .used { background: #fee2e2; }
        .available { background: #dcfce7; }
        .actions { margin-top: 10px; display: flex; gap: 10px; }
        .modal { 
          display: none; 
          position: fixed; 
          top: 0; 
          left: 0; 
          width: 100%; 
          height: 100%; 
          background: rgba(0,0,0,0.5); 
          z-index: 1000; 
          align-items: center;
          justify-content: center;
        }
        .modal-content { 
          background: white; 
          padding: 30px; 
          border-radius: 10px; 
          width: 90%; 
          max-width: 500px;
          box-shadow: 0 20px 40px rgba(0,0,0,0.2);
        }
        .modal-header { 
          display: flex; 
          justify-content: space-between; 
          align-items: center; 
          margin-bottom: 20px; 
          border-bottom: 1px solid #ddd;
          padding-bottom: 15px;
        }
        .close { 
          font-size: 24px; 
          cursor: pointer; 
          color: #666;
        }
        .close:hover { color: #333; }
        .grid { 
          display: grid; 
          grid-template-columns: 1fr 1fr; 
          gap: 30px; 
        }
        @media (max-width: 768px) {
          .grid { grid-template-columns: 1fr; }
          .dashboard-buttons { grid-template-columns: 1fr; }
          .stats-grid { grid-template-columns: 1fr; }
          body { margin: 20px; }
          .container { padding: 20px; }
        }

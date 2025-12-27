const fs = require('fs');
try {
  const content = fs.readFileSync('server.js', 'utf8');
  console.log('File size:', content.length, 'characters');
  console.log('Has admin route:', content.includes('app.get(\'/admin\')'));
  console.log('Has merge conflicts:', content.includes('<<<<<<<'));
  
  // Count lines
  const lines = content.split('\n');
  console.log('Total lines:', lines.length);
  
  // Find admin route
  for(let i = 0; i < lines.length; i++) {
    if (lines[i].includes('/admin')) {
      console.log(`Line ${i+1}: ${lines[i].trim()}`);
    }
  }
} catch(err) {
  console.error('Error:', err.message);
}

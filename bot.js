require('dotenv').config();
const puppeteer = require('puppeteer-extra');
const StealthPlugin = require('puppeteer-extra-plugin-stealth');
const { default: axios } = require('axios');
const moment = require('moment-timezone');
const fs = require('fs');
const path = require('path');

// Configure stealth plugin
puppeteer.use(StealthPlugin());

// Environment variables
const EMAIL = process.env.EMAIL || 'Unseendevx2@gmail.com';
const PASSWORD = process.env.PASSWORD || 'RheaxDev@2025';
const BOT_TOKEN = process.env.BOT_TOKEN || '7752038917:AAG3KfU-d4n5ysuOvq1qomNx0JXA4dGcjmA';
const CHAT_ID = process.env.CHAT_ID || '-1002541578739';

// File paths
const SENT_OTP_PATH = path.join(__dirname, 'sentOTPs.json');
const STATE_PATH = path.join(__dirname, 'browserState');

// Initialize sent OTPs
let sentOTPs = {};

// Load sent OTPs from file
if (fs.existsSync(SENT_OTP_PATH)) {
  sentOTPs = JSON.parse(fs.readFileSync(SENT_OTP_PATH));
}

// Save OTP to prevent duplicates
function saveOTP(mobile, otp) {
  sentOTPs[`${mobile}_${otp}`] = Date.now();
  fs.writeFileSync(SENT_OTP_PATH, JSON.stringify(sentOTPs));
}

// Check for duplicates
function isDuplicate(mobile, otp) {
  return sentOTPs.hasOwnProperty(`${mobile}_${otp}`);
}

// Format Telegram message
function formatMessage(data) {
  const time = moment().tz('Asia/Kolkata').format('DD/MM/YYYY, HH:mm:ss');
  
  return `
🚀⚡ OTP Received ✨🔥
»⟩⟩ ⏰ Time: ${time}
»⟩⟩ ☎️ Number: ${data.mobile} [Copy](tg://msg?text=${data.mobile})
»⟩⟩ ⚙️ Service: ${data.service}
»⟩⟩ 🐦‍🔥 OTP Code: ${data.otp} [Copy](tg://msg?text=${data.otp})
»⟩⟩ 📱 Message: 
${data.message}

⚙ —⟩⟩ 𝙋𝙤𝙬𝙚𝙧𝙚𝙙 𝘽𝙮 ⚡️ 𝘿𝙚𝙫 ⚡️🌏
  `.trim();
}

// Send message to Telegram
async function sendTelegramMessage(message) {
  const url = `https://api.telegram.org/bot${BOT_TOKEN}/sendMessage`;
  
  try {
    await axios.post(url, {
      chat_id: CHAT_ID,
      text: message,
      parse_mode: 'Markdown',
      disable_web_page_preview: true
    });
  } catch (error) {
    console.error('Telegram API error:', error.response?.data);
  }
}

// Extract OTP from message
function extractOTP(message) {
  const match = message.match(/\b\d{4,6}\b/);
  return match ? match[0] : null;
}

// Login function
async function login(page) {
  await page.goto('https://www.ivasms.com/login', { waitUntil: 'networkidle2' });
  
  await page.type('input[name="email"]', EMAIL);
  await page.type('input[name="password"]', PASSWORD);
  await page.click('input[name="remember"]');
  await page.click('button[type="submit"]');
  
  await page.waitForNavigation({ waitUntil: 'networkidle2' });
  console.log('Logged in successfully');
}

// Main monitoring function
async function monitorSMS() {
  const browser = await puppeteer.launch({
    headless: true,
    userDataDir: STATE_PATH,
    args: ['--no-sandbox', '--disable-setuid-sandbox']
  });

  const page = await browser.newPage();
  await page.setViewport({ width: 1280, height: 800 });
  
  try {
    // Check if we need to login
    await page.goto('https://www.ivasms.com/portal/live/my_sms', { waitUntil: 'networkidle2' });
    
    if (page.url().includes('/login')) {
      await login(page);
      await page.goto('https://www.ivasms.com/portal/live/my_sms', { waitUntil: 'networkidle2' });
    }

    console.log('Monitoring started...');
    
    // Track last processed message
    let lastMessage = '';
    
    // Monitoring loop
    while (true) {
      try {
        // Check for session expiry
        if (page.url().includes('/login')) {
          await login(page);
          await page.goto('https://www.ivasms.com/portal/live/my_sms', { waitUntil: 'networkidle2' });
        }
        
        // Extract top row data
        const rowData = await page.evaluate(() => {
          const row = document.querySelector('.table-responsive tbody tr');
          if (!row) return null;
          
          const columns = row.querySelectorAll('td');
          if (columns.length < 6) return null;
          
          return {
            country: columns[0].querySelector('div:nth-child(1)')?.textContent.trim() || '',
            mobile: columns[0].querySelector('div:nth-child(2)')?.textContent.trim() || '',
            message: columns[5].textContent.trim() || ''
          };
        });
        
        // Process new message
        if (rowData && rowData.message && rowData.message !== lastMessage) {
          lastMessage = rowData.message;
          const otp = extractOTP(rowData.message);
          
          if (otp && !isDuplicate(rowData.mobile, otp)) {
            // Format and send message
            const formattedMessage = formatMessage({
              mobile: rowData.mobile,
              service: rowData.country,
              otp: otp,
              message: rowData.message
            });
            
            await sendTelegramMessage(formattedMessage);
            saveOTP(rowData.mobile, otp);
            
            console.log(`Extracted OTP: ${otp}`);
          }
        }
        
        // Wait before next check
        await new Promise(resolve => setTimeout(resolve, 3000));
        
      } catch (error) {
        console.error('Monitoring error:', error);
        await new Promise(resolve => setTimeout(resolve, 10000));
      }
    }
    
  } catch (error) {
    console.error('Initialization error:', error);
    await browser.close();
    process.exit(1);
  }
}

// Start monitoring
monitorSMS();

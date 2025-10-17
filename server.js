//// server.js
//require('dotenv').config();
//const express = require('express');
//const axios = require('axios');
//const bodyParser = require('body-parser');
//
//
//const app = express();
//app.use(bodyParser.json());
//
//const SAFE_BASE = process.env.SAFEPAY_BASE || 'https://sandbox.api.getsafepay.com';
//const SAFE_KEY = process.env.SAFEPAY_KEY || 'sec_d257def8-8a5e-4c77-b7b2-68555cb0a8d5';
//const PORT = process.env.PORT || 3000;
//console.log('Loaded Safepay Key:', process.env.SAFEPAY_KEY);
//
//
//// helper: create safepay headers
//function safepayHeaders() {
//  return {
//    'Content-Type': 'application/json',
//    Authorization: `Bearer ${SAFE_KEY}`,
//    Accept: 'application/json',
//  };
//}
//
///**
// * Create a Safepay checkout / order session.
// * Client calls this to get a checkout_url to open.
// */
//app.post('/create-order', async (req, res) => {
//  try {
//    const { amount, currency = 'PKR', order_id, redirect_url } = req.body;
//    if (!amount || !order_id || !redirect_url) {
//      return res.status(400).json({ error: 'amount, order_id and redirect_url required' });
//    }
//
//    // NOTE: endpoint/payload below is example — adapt according to your Safepay docs
//    const payload = {
//      amount,
//      currency,
//      order_id,
//      // optional: buyer info, items etc.
//      redirect_url, // safepay will redirect to this with a token
//      // source: 'sandbox' // if safepay needs it
//    };
//
//    const response = await axios.post(
//      `${SAFE_BASE}/order/v1/initiate`,
//      payload,
//      { headers: safepayHeaders() }
//    );
//
//    // response data structure depends on Safepay docs
//    const data = response.data;
//    // expect something like data.checkout_url or data.result.checkout_url
//    const checkoutUrl = data.checkout_url || data.result?.checkout_url || data.data?.checkout_url;
//
//    if (!checkoutUrl) {
//      console.error('Unexpected create-order response', data);
//      return res.status(500).json({ error: 'No checkout URL returned by Safepay', raw: data });
//    }
//
//    return res.json({ checkout_url: checkoutUrl, raw: data });
//  } catch (err) {
//    console.error('create-order error', err.response?.data || err.message);
//    return res.status(500).json({ error: 'create-order failed', details: err.response?.data || err.message });
//  }
//});
//
///**
// * Verify a payment token returned to your redirect endpoint.
// * Safepay typically returns a token or reference which you verify server-side.
// */
//app.get('/verify', async (req, res) => {
//  try {
//    const { token } = req.query;
//    if (!token) return res.status(400).send('token required');
//
//    // NOTE: endpoint below is example — change according to Safepay docs
//    const response = await axios.get(
//      `${SAFE_BASE}/order/v1/verify?token=${encodeURIComponent(token)}`,
//      { headers: safepayHeaders() }
//    );
//
//    const data = response.data;
//    // data will have status, amount, order_id etc
//    console.log('verify response', data);
//
//    // Persist verification result: mark order paid in DB, trigger post-payment flow
//    // TODO: write DB update code here
//
//    // Return a small HTML page that redirects back to your mobile app via deep link
//    // e.g. myapp://payment-result?status=success&order_id=...
//    const status = data.status || data.result?.status || 'unknown';
//    const orderId = data.order_id || data.result?.order_id || req.query.order_id || '';
//
//    const mobileRedirect = `myapp://payment-verified?status=${encodeURIComponent(status)}&order_id=${encodeURIComponent(orderId)}&token=${encodeURIComponent(token)}`;
//
//    return res.send(`
//      <html>
//        <body>
//          <script>
//            // Redirect to app deep link (mobile) or to a web success page
//            window.location = "${mobileRedirect}";
//          </script>
//          <p>Verification complete. If not redirected, <a href="${mobileRedirect}">click here</a>.</p>
//        </body>
//      </html>
//    `);
//  } catch (err) {
//    console.error('verify error', err.response?.data || err.message);
//    return res.status(500).json({ error: 'verify failed', details: err.response?.data || err.message });
//  }
//});
//
//app.listen(PORT, () => {
//  console.log(`Safepay demo backend running on port ${PORT}`);
//});require('dotenv').config();
     const express = require('express');
     const axios = require('axios');
     const bodyParser = require('body-parser');
     const cors = require('cors');

     const app = express();
     app.use(bodyParser.json());
     app.use(cors()); // Allow all origins

     // Load Safepay config from environment
     const SAFE_BASE = process.env.SAFEPAY_BASE || 'https://sandbox.api.getsafepay.com';
     const SAFE_KEY = process.env.SAFEPAY_KEY;
     const PORT = process.env.PORT || 3000;

     // Helper for Safepay headers
     function safepayHeaders() {
       return {
         'Content-Type': 'application/json',
         'Authorization': `Bearer ${SAFE_KEY}`,
         'Accept': 'application/json',
       };
     }

     // Root route for testing
     app.get('/', (req, res) => {
       res.send('Safepay backend is live!');
     });

     // Create order endpoint
     app.post('/create-order', async (req, res) => {
       try {
         const { amount, currency = 'PKR', order_id, redirect_url } = req.body;
         if (!amount || !order_id || !redirect_url) {
           return res.status(400).json({ error: 'amount, order_id and redirect_url required' });
         }

         const payload = { amount, currency, order_id, redirect_url };
         const response = await axios.post(`${SAFE_BASE}/order/v1/initiate`, payload, {
           headers: safepayHeaders(),
         });

         const data = response.data;
         const checkoutUrl = data.checkout_url || data.result?.checkout_url || data.data?.checkout_url;

         if (!checkoutUrl) {
           return res.status(500).json({ error: 'No checkout URL returned', raw: data });
         }

         return res.json({ checkout_url: checkoutUrl, raw: data });
       } catch (err) {
         console.error('create-order error:', err.response?.data || err.message);
         return res.status(500).json({
           error: 'create-order failed',
           details: err.response?.data || err.message,
         });
       }
     });

     // Verify payment endpoint
     app.get('/verify', async (req, res) => {
       try {
         const { token } = req.query;
         if (!token) return res.status(400).send('token required');

         const response = await axios.get(
           `${SAFE_BASE}/order/v1/verify?token=${encodeURIComponent(token)}`,
           { headers: safepayHeaders() }
         );

         const data = response.data;
         const status = data.status || data.result?.status || 'unknown';
         const orderId = data.order_id || data.result?.order_id || req.query.order_id || '';

         // Redirect to Flutter app via deep link
         const mobileRedirect = `myapp://payment-verified?status=${encodeURIComponent(status)}&order_id=${encodeURIComponent(orderId)}&token=${encodeURIComponent(token)}`;

         return res.send(`
           <html>
             <body>
               <script>window.location = "${mobileRedirect}";</script>
               <p>Verification complete. If not redirected, <a href="${mobileRedirect}">click here</a>.</p>
             </body>
           </html>
         `);
       } catch (err) {
         console.error('verify error:', err.response?.data || err.message);
         return res.status(500).json({ error: 'verify failed', details: err.response?.data || err.message });
       }
     });

     // Start server
     app.listen(PORT, () => {
       console.log(`Safepay backend running at http://localhost:${PORT}`);
     });

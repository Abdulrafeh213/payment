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
     // server.js
     require('dotenv').config();
     const express = require('express');
     const bodyParser = require('body-parser');
     const cors = require('cors');
     const axios = require('axios');
     const { createClient } = require('@supabase/supabase-js');
     const cron = require('node-cron');
     const { v4: uuidv4 } = require('uuid');
     const path = require('path');

     // config from env
     const SAFE_BASE = process.env.SAFEPAY_BASE || 'https://sandbox.api.getsafepay.com';
     const SAFE_KEY = process.env.SAFEPAY_KEY;
     const PORT = process.env.PORT || 3000;
     const APP_BASE = process.env.APP_BASE_URL || `http://localhost:${PORT}`;

     const SUPABASE_URL = process.env.SUPABASE_URL;
     const SUPABASE_KEY = process.env.SUPABASE_KEY; // service_role or server key

     if (!SAFE_KEY || !SUPABASE_URL || !SUPABASE_KEY) {
       console.error('Missing required env vars: SAFEPAY_KEY, SUPABASE_URL, SUPABASE_KEY');
       process.exit(1);
     }

     // init supabase
     const supabase = createClient(SUPABASE_URL, SUPABASE_KEY, {
       auth: { persistSession: false }
     });

     const app = express();
     app.use(cors());
     app.use(bodyParser.json());
     app.use(express.urlencoded({ extended: true }));
     app.use('/public', express.static(path.join(__dirname, 'public')));

     // setup view engine (EJS)
     app.set('views', path.join(__dirname, 'views'));
     app.set('view engine', 'ejs');

     // Helper: Safepay headers
     function safepayHeaders() {
       return {
         'Content-Type': 'application/json',
         Authorization: `Bearer ${SAFE_KEY}`,
         Accept: 'application/json',
       };
     }

     /**
      * Root: simple status
      */
     app.get('/', (req, res) => {
       res.send('Safepay escrow backend is live');
     });

     /**
      * Create order: called by mobile/frontend to create a Safepay checkout and store escrow record
      * Expected body: { amount: integer (paisa), currency?, order_id, seller_id, buyer_id?, metadata? }
      */
     app.post('/create-order', async (req, res) => {
       try {
         const { amount, currency = 'PKR', order_id, seller_id, buyer_id = null, metadata = {} } = req.body;
         if (!amount || !order_id || !seller_id) {
           return res.status(400).json({ error: 'amount, order_id and seller_id required' });
         }

         // redirect URL (Safepay will redirect back here with token)
         const redirectUrl = `${APP_BASE}/verify`;

         // build Safepay payload (adapt to actual Safepay API)
         const payload = {
           amount,
           currency,
           order_id,
           redirect_url: redirectUrl,
           metadata
         };

         // call Safepay to initiate checkout
         const spResp = await axios.post(`${SAFE_BASE}/order/v1/initiate`, payload, {
           headers: safepayHeaders(),
         });

         const data = spResp.data;
         const checkoutUrl = data.checkout_url || data.result?.checkout_url || data.data?.checkout_url;
         // token may not be present until verify; store raw
         const safepay_raw = data;

         // create escrow record in supabase, status 'pending' (not yet paid)
         const { data: escData, error: esError } = await supabase
           .from('escrows')
           .insert([{
             order_id,
             amount,
             currency,
             buyer_id,
             seller_id,
             safepay_checkout_url: checkoutUrl,
             status: 'pending',
             metadata: metadata
           }])
           .select()
           .single();

         if (esError) {
           console.error('Supabase insert error', esError);
           return res.status(500).json({ error: 'db insert failed', details: esError });
         }

         return res.json({ checkout_url: checkoutUrl, escrow: escData, raw: safepay_raw });
       } catch (err) {
         console.error('create-order error', err.response?.data || err.message);
         return res.status(500).json({ error: 'create-order failed', details: err.response?.data || err.message });
       }
     });

     /**
      * Verify endpoint: Safepay will redirect user to this URL with token (server-side)
      * Example: GET /verify?token=xxx
      * We will verify with Safepay, update escrow status to 'paid' and schedule release_at
      */
     app.get('/verify', async (req, res) => {
       try {
         const token = req.query.token;
         if (!token) return res.status(400).send('token required');

         // call Safepay verify API
         const resp = await axios.get(`${SAFE_BASE}/order/v1/verify?token=${encodeURIComponent(token)}`, {
           headers: safepayHeaders()
         });

         const data = resp.data;
         // Parse returned order info -- adapt these keys to actual Safepay response
         const status = data.status || data.result?.status || 'unknown';
         const orderId = data.order_id || data.result?.order_id || data.data?.order_id;

         // find corresponding escrow by order_id
         const { data: escrowList, error: qErr } = await supabase
           .from('escrows')
           .select('*')
           .eq('order_id', orderId)
           .order('created_at', { ascending: false })
           .limit(1);

         if (qErr) {
           console.error('db lookup error', qErr);
         }

         const escrow = Array.isArray(escrowList) && escrowList.length ? escrowList[0] : null;

         if (escrow && status === 'success' || status === 'paid') {
           // update escrow: mark paid, set paid_at and release_at = now + 7 days
           const paidAt = new Date().toISOString();
           const releaseAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString(); // 7 days
           const { error: updErr } = await supabase
             .from('escrows')
             .update({ status: 'paid', paid_at: paidAt, release_at: releaseAt, safepay_token: token })
             .eq('id', escrow.id);

           if (updErr) console.error('update paid error', updErr);

           // create a transaction record as 'hold' to indicate money held (optional)
           await supabase.from('transactions').insert([{
             escrow_id: escrow.id,
             type: 'hold',
             amount: escrow.amount,
             currency: escrow.currency,
             safepay_response: data
           }]);

           // Redirect user back to mobile app via deep link if possible
           const mobileRedirect = `myapp://payment-verified?status=success&order_id=${encodeURIComponent(orderId)}&token=${encodeURIComponent(token)}`;

           return res.send(`
             <html><body>
               <script>window.location="${mobileRedirect}";</script>
               <p>Payment successful. If not redirected, <a href="${mobileRedirect}">click here</a>.</p>
             </body></html>
           `);
         } else {
           // not success: show error page
           return res.send(`
             <html><body>
               <h3>Payment verification failed</h3>
               <pre>${JSON.stringify(data)}</pre>
             </body></html>
           `);
         }
       } catch (err) {
         console.error('verify error', err.response?.data || err.message);
         return res.status(500).send('verify failed');
       }
     });

     /**
      * Webhook endpoint (optional): Safepay can POST payment updates here (recommended)
      * Receive JSON body and update escrow state accordingly.
      */
     app.post('/webhook/safepay', async (req, res) => {
       // Validate webhook signature if Safepay provides one
       const body = req.body;
       // adapt to Safepay webhook payload
       const orderId = body.order_id || body.data?.order_id;
       const event = body.event || body.type || 'unknown';
       const status = body.status || body.data?.status;

       try {
         if (!orderId) return res.status(400).send('no order id');

         // lookup escrow
         const { data: escrows } = await supabase.from('escrows').select('*').eq('order_id', orderId).limit(1);
         const escrow = Array.isArray(escrows) && escrows[0];

         if (!escrow) {
           console.warn('webhook: escrow not found for', orderId);
           return res.status(200).send('ok');
         }

         if (status === 'success' || status === 'paid') {
           const paidAt = new Date().toISOString();
           const releaseAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString();
           await supabase.from('escrows').update({ status: 'paid', paid_at: paidAt, release_at: releaseAt }).eq('id', escrow.id);

           await supabase.from('transactions').insert([{
             escrow_id: escrow.id,
             type: 'hold',
             amount: escrow.amount,
             currency: escrow.currency,
             safepay_response: body
           }]);
         } else {
           // other statuses: log
           await supabase.from('transactions').insert([{
             escrow_id: escrow.id,
             type: 'notice',
             amount: 0,
             currency: escrow.currency,
             safepay_response: body
           }]);
         }

         return res.status(200).send('ok');
       } catch (err) {
         console.error('webhook error', err);
         return res.status(500).send('error');
       }
     });

     /**
      * Admin UI: list escrows (simple)
      * Basic auth using ADMIN_USER / ADMIN_PASS (very simple)
      */
     function adminAuth(req, res, next) {
       const user = process.env.ADMIN_USER;
       const pass = process.env.ADMIN_PASS;
       const auth = req.headers.authorization;
       if (!auth) {
         res.setHeader('WWW-Authenticate', 'Basic realm="Admin"');
         return res.status(401).send('Auth required');
       }
       const parts = auth.split(' ');
       if (parts[0] !== 'Basic') return res.status(401).send('Auth required');
       const creds = Buffer.from(parts[1], 'base64').toString().split(':');
       if (creds[0] === user && creds[1] === pass) return next();
       res.setHeader('WWW-Authenticate', 'Basic realm="Admin"');
       return res.status(401).send('Auth required');
     }

     app.get('/admin', adminAuth, async (req, res) => {
       const { data: escrows, error } = await supabase.from('escrows').select('*').order('created_at', { ascending: false }).limit(200);
       if (error) return res.status(500).send('db error');
       res.render('index', { escrows });
     });

     app.get('/admin/escrow/:id', adminAuth, async (req, res) => {
       const id = req.params.id;
       const { data } = await supabase.from('escrows').select('*').eq('id', id).single();
       const { data: txs } = await supabase.from('transactions').select('*').eq('escrow_id', id).order('created_at', { ascending: false });
       res.render('escrow', { escrow: data, transactions: txs });
     });

     // Admin action: manually release escrow immediately (calls payout)
     app.post('/admin/escrow/:id/release', adminAuth, async (req, res) => {
       const id = req.params.id;
       try {
         const { data: escrow } = await supabase.from('escrows').select('*').eq('id', id).single();
         if (!escrow) return res.status(404).send('not found');

         // perform payout to seller (placeholder)
         const payoutResp = await performPayoutToSeller(escrow);

         // record transaction and update status
         await supabase.from('transactions').insert([{
           escrow_id: id,
           type: 'release',
           amount: escrow.amount,
           currency: escrow.currency,
           safepay_response: payoutResp
         }]);

         await supabase.from('escrows').update({ status: 'released', released_at: new Date().toISOString() }).eq('id', id);

         return res.render('message', { message: 'Released' });
       } catch (err) {
         console.error('manual release error', err);
         return res.status(500).send('error');
       }
     });

     // Admin action: refund (placeholder)
     app.post('/admin/escrow/:id/refund', adminAuth, async (req, res) => {
       const id = req.params.id;
       // Implement Safepay refund API if available (placeholder)
       return res.send('refund not implemented, implement with Safepay refund API');
     });

     /**
      * Cron job: runs every hour and looks for escrow records where:
      * status = 'paid' AND release_at <= now AND status != 'released'
      * then attempts to release to seller via payout API.
      */
     cron.schedule('0 * * * *', async () => {
       console.log('Cron: checking for escrows to release...');
       try {
         const { data: dueList } = await supabase
           .from('escrows')
           .select('*')
           .lte('release_at', new Date().toISOString())
           .eq('status', 'paid');

         if (!Array.isArray(dueList) || dueList.length === 0) {
           console.log('Cron: no due escrows');
           return;
         }

         for (const e of dueList) {
           try {
             console.log('Releasing escrow', e.id);
             const payoutResp = await performPayoutToSeller(e); // call to Safepay payout API
             await supabase.from('transactions').insert([{
               escrow_id: e.id,
               type: 'release',
               amount: e.amount,
               currency: e.currency,
               safepay_response: payoutResp
             }]);
             await supabase.from('escrows').update({ status: 'released', released_at: new Date().toISOString() }).eq('id', e.id);
           } catch (inner) {
             console.error('Failed to release escrow', e.id, inner);
             await supabase.from('transactions').insert([{
               escrow_id: e.id,
               type: 'release_failed',
               amount: e.amount,
               currency: e.currency,
               safepay_response: { error: String(inner) }
             }]);
           }
         }
       } catch (err) {
         console.error('Cron error', err);
       }
     });

     /**
      * Placeholder function that sends payout to seller using Safepay's payout API.
      * Replace endpoint and payload with Safepay's actual payout endpoint and required fields.
      */
     async function performPayoutToSeller(escrow) {
       // Example payload (replace with real API and seller payout details)
       const payoutPayload = {
         amount: escrow.amount,
         currency: escrow.currency,
         recipient: {
           id: escrow.seller_id,
           // add any bank account or wallet details required
         },
         reference: `payout-${escrow.id}`
       };

       try {
         // Replace this URL with Safepay's payout endpoint if available
         const payoutResp = await axios.post(`${SAFE_BASE}/payout/v1/create`, payoutPayload, { headers: safepayHeaders() });
         return payoutResp.data;
       } catch (err) {
         console.error('Payout error', err.response?.data || err.message);
         throw err.response?.data || err.message;
       }
     }

     // start server
     app.listen(PORT, () => {
       console.log(`Escrow backend listening on port ${PORT}`);
     });

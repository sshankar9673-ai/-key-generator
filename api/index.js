const express = require('express');
const cors = require('cors');

const app = express();
app.use(cors());
app.use(express.json());

// एडमिन पासवर्ड
const ADMIN_PASSWORD = "TSR1234";

// इन-मेमोरी डेटा स्टोर (Vercel Serverless Ready)
let memoryStore = {
    requests: [],
    customCode: "// BALAMOD TSR CUSTOM SCRIPT / INJECTOR SOURCE CODE\n\nvoid main() {\n    // Write your MOD code here\n}",
    externalApi: {
        apiUrl: "https://api.balamod-tsr.com/v1/generate-key",
        apiKey: "BALAMOD_SECRET_API_KEY_2026",
        enabled: true
    }
};

const PLANS = {
    "1h": { price: 10, hours: 1 },
    "5h": { price: 35, hours: 5 },
    "24h": { price: 90, hours: 24 },
    "2d": { price: 120, hours: 48 },
    "30d": { price: 320, hours: 720 }
};

// 1. Admin Login API
app.post('/api/admin/login', (req, res) => {
    try {
        const { password } = req.body;
        if (password === ADMIN_PASSWORD) {
            return res.json({ status: true, message: "Login successful" });
        }
        return res.status(401).json({ status: false, message: "गलत पासवर्ड!" });
    } catch (err) {
        return res.status(500).json({ status: false, error: err.message });
    }
});

// 2. User Submit Payment Request
app.post('/api/request-key', (req, res) => {
    try {
        const { plan, utr, contact } = req.body;

        if (!PLANS[plan] || !utr || utr.trim().length < 6) {
            return res.status(400).json({ status: false, message: "कृपया सही Plan और 12-अंकों का UTR नंबर दर्ज करें।" });
        }

        const existing = memoryStore.requests.find(r => r.utr === utr);
        if (existing) {
            return res.status(400).json({ status: false, message: "यह UTR नंबर पहले से इस्तेमाल हो चुका है।" });
        }

        const newRequest = {
            id: "REQ-" + Math.floor(100000 + Math.random() * 900000),
            plan: plan,
            amount: PLANS[plan].price,
            hours: PLANS[plan].hours,
            utr: utr.trim(),
            contact: contact || "N/A",
            status: "PENDING",
            key: null,
            expiresAt: null,
            createdAt: new Date().toLocaleString()
        };

        memoryStore.requests.push(newRequest);
        return res.json({ status: true, message: "पेमेंट सबमिट हो गया! एडमिन अप्रूवल का इंतज़ार करें।", req_id: newRequest.id });
    } catch (err) {
        return res.status(500).json({ status: false, error: err.message });
    }
});

// 3. User Key Check API
app.get('/api/verify-key', (req, res) => {
    try {
        const { query } = req.query;
        if (!query) return res.status(400).json({ status: false, message: "UTR या Key दर्ज करें" });

        const record = memoryStore.requests.find(r => r.utr === query || r.key === query);
        if (!record) return res.status(404).json({ status: false, message: "कोई रिकॉर्ड नहीं मिला।" });

        return res.json({
            status: true,
            request_status: record.status,
            key: record.key,
            plan: record.plan,
            expiresAt: record.expiresAt,
            customCode: record.status === 'APPROVED' ? memoryStore.customCode : null
        });
    } catch (err) {
        return res.status(500).json({ status: false, error: err.message });
    }
});

// 4. Admin - Get Pending Requests & Stats
app.post('/api/admin/pending-requests', (req, res) => {
    try {
        if (req.body.password !== ADMIN_PASSWORD) return res.status(401).json({ status: false });

        const totalEarned = memoryStore.requests
            .filter(r => r.status === 'APPROVED')
            .reduce((sum, r) => sum + r.amount, 0);

        return res.json({
            status: true,
            requests: memoryStore.requests,
            stats: {
                totalRequests: memoryStore.requests.length,
                pending: memoryStore.requests.filter(r => r.status === 'PENDING').length,
                approved: memoryStore.requests.filter(r => r.status === 'APPROVED').length,
                revenue: totalEarned
            }
        });
    } catch (err) {
        return res.status(500).json({ status: false, error: err.message });
    }
});

// 5. Admin - Approve Key API (Auto / Active External Sync)
app.post('/api/admin/approve-key', async (req, res) => {
    try {
        const { req_id, password } = req.body;
        if (password !== ADMIN_PASSWORD) return res.status(401).json({ status: false });

        const item = memoryStore.requests.find(r => r.id === req_id);
        if (!item) return res.status(404).json({ status: false, message: "रिक्वेस्ट नहीं मिली।" });

        let generatedKey = "";

        // एक्सटर्नल API कनेक्ट होने पर स्वचालित की (Key) फेच करना
        if (memoryStore.externalApi.enabled && memoryStore.externalApi.apiUrl) {
            try {
                const apiRes = await fetch(memoryStore.externalApi.apiUrl, {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json',
                        'Authorization': `Bearer ${memoryStore.externalApi.apiKey}`
                    },
                    body: JSON.stringify({ plan: item.plan, utr: item.utr })
                });
                const apiData = await apiRes.json();
                generatedKey = apiData.key || apiData.code || `TSR-BALA-${item.plan.toUpperCase()}-${Math.random().toString(36).substring(2, 8).toUpperCase()}`;
            } catch (apiErr) {
                generatedKey = `TSR-BALA-${item.plan.toUpperCase()}-${Math.random().toString(36).substring(2, 8).toUpperCase()}`;
            }
        } else {
            generatedKey = `TSR-BALA-${item.plan.toUpperCase()}-${Math.random().toString(36).substring(2, 8).toUpperCase()}`;
        }

        const expiryDate = new Date();
        expiryDate.setHours(expiryDate.getHours() + item.hours);

        item.status = "APPROVED";
        item.key = generatedKey;
        item.expiresAt = expiryDate.toLocaleString();

        return res.json({ status: true, message: "Key सफलतापूर्वक जनरेट हो गई!", key: generatedKey });
    } catch (err) {
        return res.status(500).json({ status: false, error: err.message });
    }
});

// 6. Admin - Save & Get Code Script
app.post('/api/admin/save-code', (req, res) => {
    try {
        const { password, code } = req.body;
        if (password !== ADMIN_PASSWORD) return res.status(401).json({ status: false });

        memoryStore.customCode = code;
        return res.json({ status: true, message: "कोड सर्वर पर अपडेट हो गया!" });
    } catch (err) {
        return res.status(500).json({ status: false, error: err.message });
    }
});

app.post('/api/admin/get-code', (req, res) => {
    try {
        if (req.body.password !== ADMIN_PASSWORD) return res.status(401).json({ status: false });
        return res.json({ status: true, code: memoryStore.customCode });
    } catch (err) {
        return res.status(500).json({ status: false, error: err.message });
    }
});

// 7. Admin - External API Settings
app.post('/api/admin/save-api-config', (req, res) => {
    try {
        const { password, apiUrl, apiKey, enabled } = req.body;
        if (password !== ADMIN_PASSWORD) return res.status(401).json({ status: false });

        memoryStore.externalApi = { apiUrl, apiKey, enabled };
        return res.json({ status: true, message: "API सेटिंग्स सफलतापूर्वक सेव हो गई!" });
    } catch (err) {
        return res.status(500).json({ status: false, error: err.message });
    }
});

app.post('/api/admin/get-api-config', (req, res) => {
    try {
        if (req.body.password !== ADMIN_PASSWORD) return res.status(401).json({ status: false });
        return res.json({ status: true, config: memoryStore.externalApi });
    } catch (err) {
        return res.status(500).json({ status: false, error: err.message });
    }
});

// Vercel Export
module.exports = app;
          

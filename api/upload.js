const axios = require('axios');
const Busboy = require('busboy');
const { v4: uuidv4 } = require('uuid'); 
const path = require('path');

// Load .env (hanya untuk local testing)
if (process.env.NODE_ENV !== 'production') {
    require('dotenv').config();
}

// Konfigurasi dari Environment Variables
const GITHUB_TOKEN = process.env.GITHUB_TOKEN;
const GITHUB_OWNER = process.env.GITHUB_OWNER;
const GITHUB_REPO = process.env.GITHUB_REPO;
const GITHUB_BRANCH = process.env.GITHUB_BRANCH || 'main';
const BASE_URL = process.env.BASE_URL;

const GITHUB_API_URL = `https://api.github.com/repos/${GITHUB_OWNER}/${GITHUB_REPO}/contents`;

// Fungsi untuk menghasilkan nama file pendek dan unik
function generateShortName(originalFilename) {
    const extension = path.extname(originalFilename);
    // Membuat nama file 8 karakter unik
    const shortId = uuidv4().substring(0, 5); 
    return `${shortId}${extension}`;
}

// Handler utama untuk Vercel Serverless Function
module.exports = (req, res) => {
    // Pastikan Method adalah POST
    if (req.method !== 'POST') {
        res.status(405).send('Method Not Allowed. Only POST is supported.');
        return;
    }

    if (!GITHUB_TOKEN || !GITHUB_OWNER || !GITHUB_REPO || !BASE_URL) {
        return res.status(500).json({ error: 'Server configuration error. Missing GitHub credentials.' });
    }

    const busboy = Busboy({ headers: req.headers });
    let uploadedFile = null;
    let fileName = null;

    // Menangani data file
    busboy.on('file', (fieldname, file, filename) => {
        // Hanya memproses field name "files[]"
        if (fieldname === 'files[]') {
            fileName = generateShortName(filename.filename);
            const chunks = [];
            file.on('data', (chunk) => {
                chunks.push(chunk);
            });
            file.on('end', () => {
                uploadedFile = Buffer.concat(chunks);
            });
        } else {
             file.resume();
        }
    });

    // Setelah semua form data diterima
    busboy.on('finish', async () => {
        if (!uploadedFile) {
            return res.status(400).json({ error: 'No file uploaded. Expected field name: files[]' });
        }

        try {
            // Encode file ke Base64 (wajib untuk GitHub API)
            const contentBase64 = uploadedFile.toString('base64');
            const commitMessage = `Upload: ${fileName}`;
            const filePath = `${fileName}`; 

            const payload = {
                message: commitMessage,
                content: contentBase64,
                branch: GITHUB_BRANCH,
            };

            // Panggil GitHub API untuk Commit File
            await axios.put(
                `${GITHUB_API_URL}/${filePath}`,
                payload,
                {
                    headers: {
                        Authorization: `token ${GITHUB_TOKEN}`,
                        'Content-Type': 'application/json',
                        'User-Agent': GITHUB_OWNER,
                    },
                }
            );

            // Buat URL CDN custom (menggunakan BASE_URL yang Anda sediakan)
            const cdnUrl = `${BASE_URL}/${fileName}`;

            // Beri respon ke client sesuai format qu.ax
            const responseData = {
                files: [{
                    url: cdnUrl,
                }]
            };

            res.status(200).json(responseData);
        } catch (error) {
            console.error('GitHub Upload Error:', error.response ? error.response.data : error.message);
            res.status(500).json({ 
                error: 'Failed to upload file to GitHub.', 
                details: error.response ? error.response.data.message : error.message 
            });
        }
    });

    // Mulai memproses request
    req.pipe(busboy);
};

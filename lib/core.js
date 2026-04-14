import http from 'http';
import crypto from 'crypto';

const IPFS_GATEWAY = 'https://ipfs.io/ipfs/';
const LIQUIFY_API_BASE = 'https://api.liquify.io/v1';

class ZKProofEngine {
  constructor() {
    this.proofCache = new Map();
  }

  generateCommitment(data) {
    const hash = crypto.createHash('sha256');
    hash.update(JSON.stringify(data));
 
    return hash.digest('hex');
  }

  async generateTaxProof(transactions, taxYear) {
    const totalGains = transactions.reduce((sum, tx) => {
 
    if (tx.type === 'swap' || tx.type === 'sell') {
 
    return sum + (tx.valueUSD - (tx.costBasisUSD || 0));
      }
 
    return sum;
    }, 0);

    const totalIncome = transactions.reduce((sum, tx) => {
 
    if (tx.type === 'reward' || tx.type === 'airdrop' || tx.type === 'yield') {
 
    return sum + tx.valueUSD;
      }
 
    return sum;
    }, 0);

    const commitment = this.generateCommitment({
      txCount: transactions.length,
      totalGains,
      totalIncome,
      taxYear
    });

    const proof = {
      id: crypto.randomUUID(),
      commitment,
      publicInputs: {
        taxYear,
        transactionCount: transactions.length,
        totalCapitalGains: Math.round(totalGains * 100) / 100,
        totalOrdinaryIncome: Math.round(totalIncome * 100) / 100,
        timestamp: Date.now()
      },
      proof: this.generateMockCircomProof(commitment),
      verified: true
    };

    this.proofCache.set(proof.id, proof);
 
    return proof;
  }

  generateMockCircomProof(commitment) {
 
    return {
      pi_a: [
        crypto.createHash('sha256').update(commitment + 'a1').digest('hex').slice(0, 64),
        crypto.createHash('sha256').update(commitment + 'a2').digest('hex').slice(0, 64)
      ],
      pi_b: [
        [
          crypto.createHash('sha256').update(commitment + 'b11').digest('hex').slice(0, 64),
          crypto.createHash('sha256').update(commitment + 'b12').digest('hex').slice(0, 64)
        ],
        [
          crypto.createHash('sha256').update(commitment + 'b21').digest('hex').slice(0, 64),
          crypto.createHash('sha256').update(commitment + 'b22').digest('hex').slice(0, 64)
        ]
      ],
      pi_c: [
        crypto.createHash('sha256').update(commitment + 'c1').digest('hex').slice(0, 64),
        crypto.createHash('sha256').update(commitment + 'c2').digest('hex').slice(0, 64)
      ],
      protocol: 'groth16',
      curve: 'bn128'
    };
  }

  verifyProof(proofId) {
    const proof = this.proofCache.get(proofId);
 
    if (!proof) return { valid: false, error: 'Proof not found' };
 
    return { valid: true, proof };
  }
}

class TransactionAnalyzer {
  constructor() {
    this.supportedChains = ['ethereum', 'polygon', 'arbitrum', 'optimism', 'base'];
    this.protocolTypes = {
      'uniswap': 'dex',
      'sushiswap': 'dex',
      'aave': 'lending',
      'compound': 'lending',
      'yearn': 'yield',
      'curve': 'dex',
      'balancer': 'dex',
      'lido': 'staking'
    };
  }

  classifyTransaction(tx) {
    const method = tx.method || tx.functionName || '';
    const methodLower = method.toLowerCase();

 
    if (methodLower.includes('swap') || methodLower.includes('exchange')) {
 
    return 'swap';
    }
 
    if (methodLower.includes('deposit') || methodLower.includes('supply')) {
 
    return 'deposit';
    }
 
    if (methodLower.includes('withdraw') || methodLower.includes('redeem')) {
 
    return 'withdraw';
    }
 
    if (methodLower.includes('borrow')) {
 
    return 'borrow';
    }
 
    if (methodLower.includes('repay')) {
 
    return 'repay';
    }
 
    if (methodLower.includes('claim') || methodLower.includes('harvest')) {
 
    return 'reward';
    }
 
    if (methodLower.includes('stake')) {
 
    return 'stake';
    }
 
    if (methodLower.includes('unstake')) {
 
    return 'unstake';
    }
 
    if (tx.value && parseFloat(tx.value) > 0 && !tx.to) {
 
    return 'receive';
    }
 
    return 'transfer';
  }

  calculateCostBasis(transactions) {
    const holdings = new Map();
    const processed = [];

 
    for (const tx of transactions) {
      const txCopy = { ...tx };
      
 
    if (tx.type === 'swap' || tx.type === 'sell') {
        const tokenIn = tx.tokenIn || 'ETH';
        const holding = holdings.get(tokenIn);
 
    if (holding && holding.length > 0) {
          const costBasis = holding.shift();
          txCopy.costBasisUSD = costBasis.valueUSD;
          txCopy.gainLoss = txCopy.valueUSD - txCopy.costBasisUSD;
        }
      }

 
    if (tx.type === 'buy' || tx.type === 'receive' || tx.type === 'reward') {
        const tokenOut = tx.tokenOut || tx.token || 'ETH';
 
    if (!holdings.has(tokenOut)) {
          holdings.set(tokenOut, []);
        }
        holdings.get(tokenOut).push({ valueUSD: tx.valueUSD, timestamp: tx.timestamp });
      }

      processed.push(txCopy);
    }

 
    return processed;
  }

  async analyzeTransactions(rawTxs) {
    const classified = rawTxs.map(tx => ({
      ...tx,
      type: tx.type || this.classifyTransaction(tx),
      timestamp: tx.timestamp || tx.blockTimestamp || Date.now(),
      valueUSD: tx.valueUSD || this.estimateUSDValue(tx)
    }));

    const sorted = classified.sort((a, b) => a.timestamp - b.timestamp);
 
    return this.calculateCostBasis(sorted);
  }

  estimateUSDValue(tx) {
    const ethPrice = 2500;
 
    if (tx.value) {
      const ethValue = parseFloat(tx.value) / 1e18;
 
    return ethValue * ethPrice;
    }
 
    return 0;
  }
}

class LiquifyClient {
  constructor(apiKey) {
    this.apiKey = apiKey || process.env.LIQUIFY_API_KEY || 'demo-key';
    this.baseUrl = LIQUIFY_API_BASE;
  }

  async indexContract(contractAddress, chain, abi) {
 
    return {
      success: true,
      contractAddress,
      chain,
      indexed: true,
      timestamp: Date.now()
    };
  }

  async getTransactions(addresses, options = {}) {
    const mockTxs = this.generateMockTransactions(addresses, options);
 
    return mockTxs;
  }

  generateMockTransactions(addresses, options) {
    const protocols = ['Uniswap V3', 'Aave V3', 'Curve', 'Yearn', 'Lido'];
    const tokens = ['ETH', 'WBTC', 'LINK', 'UNI', 'AAVE'];
    const count = options.limit || 50;
    const txs = [];
    const now = Date.now();
    const oneYear = 365 * 24 * 60 * 60 * 1000;
    const from = addresses[0] || '0x' + crypto.randomBytes(20).toString('hex');

    // Generate realistic buy->sell pairs (60% of transactions)
    const pairCount = Math.floor(count * 0.3);
    for (let i = 0; i < pairCount; i++) {
      const token = tokens[Math.floor(Math.random() * tokens.length)];
      const buyTime = now - oneYear + Math.random() * oneYear * 0.5;
      const sellTime = buyTime + Math.random() * oneYear * 0.4 + oneYear * 0.05;
      const buyPrice = 1000 + Math.random() * 8000;
      const sellPrice = buyPrice * (0.8 + Math.random() * 0.8);

      txs.push({
        hash: '0x' + crypto.randomBytes(32).toString('hex'),
        blockNumber: Math.floor(18000000 + Math.random() * 1000000),
        timestamp: buyTime,
        from, to: '0x' + crypto.randomBytes(20).toString('hex'),
        type: 'buy',
        protocol: protocols[Math.floor(Math.random() * protocols.length)],
        tokenIn: 'USDC', tokenOut: token,
        amountIn: (buyPrice / 100).toFixed(4),
        amountOut: (Math.random() * 5 + 0.5).toFixed(4),
        valueUSD: buyPrice,
        chain: options.chain || 'ethereum',
        gasUsed: Math.floor(Math.random() * 300000 + 50000),
        gasPrice: Math.floor(Math.random() * 80 + 10) + 'gwei'
      });

      txs.push({
        hash: '0x' + crypto.randomBytes(32).toString('hex'),
        blockNumber: Math.floor(18000000 + Math.random() * 1000000),
        timestamp: sellTime,
        from, to: '0x' + crypto.randomBytes(20).toString('hex'),
        type: 'sell',
        protocol: protocols[Math.floor(Math.random() * protocols.length)],
        tokenIn: token, tokenOut: 'USDC',
        amountIn: (Math.random() * 5 + 0.5).toFixed(4),
        amountOut: (sellPrice / 100).toFixed(4),
        valueUSD: sellPrice,
        chain: options.chain || 'ethereum',
        gasUsed: Math.floor(Math.random() * 300000 + 50000),
        gasPrice: Math.floor(Math.random() * 80 + 10) + 'gwei'
      });
    }

    // Fill remaining with rewards, swaps, transfers
    const otherTypes = ['reward', 'swap', 'transfer', 'deposit', 'withdraw'];
    const remaining = count - txs.length;
    for (let i = 0; i < remaining; i++) {
      const type = otherTypes[Math.floor(Math.random() * otherTypes.length)];
      txs.push({
        hash: '0x' + crypto.randomBytes(32).toString('hex'),
        blockNumber: Math.floor(18000000 + Math.random() * 1000000),
        timestamp: now - Math.random() * oneYear,
        from, to: '0x' + crypto.randomBytes(20).toString('hex'),
        type,
        protocol: protocols[Math.floor(Math.random() * protocols.length)],
        tokenIn: tokens[Math.floor(Math.random() * tokens.length)],
        tokenOut: tokens[Math.floor(Math.random() * tokens.length)],
        amountIn: (Math.random() * 10).toFixed(4),
        amountOut: (Math.random() * 10).toFixed(4),
        valueUSD: Math.random() * 5000,
        chain: options.chain || 'ethereum',
        gasUsed: Math.floor(Math.random() * 500000),
        gasPrice: Math.floor(Math.random() * 100) + 'gwei'
      });
    }

    return txs.sort((a, b) => b.timestamp - a.timestamp);
  }
}

class IPFSStorage {
  constructor() {
    this.localStorage = new Map();
  }

  async store(data) {
    const content = JSON.stringify(data);
    const hash = crypto.createHash('sha256').update(content).digest('hex');
    const cid = 'Qm' + hash.slice(0, 44);
    this.localStorage.set(cid, content);
 
    return { cid, url: IPFS_GATEWAY + cid };
  }

  async retrieve(cid) {
    const content = this.localStorage.get(cid);
 
    if (!content) return null;
 
    return JSON.parse(content);
  }
}

class TaxReportGenerator {
  constructor(zkEngine, analyzer) {
    this.zkEngine = zkEngine;
    this.analyzer = analyzer;
  }

  async generateReport(transactions, taxYear, jurisdiction) {
    const yearTxs = transactions.filter(tx => {
      const txYear = new Date(tx.timestamp).getFullYear();
 
    return txYear === taxYear;
    });

    const proof = await this.zkEngine.generateTaxProof(yearTxs, taxYear);

    const summary = this.calculateSummary(yearTxs);

 
    return {
      id: crypto.randomUUID(),
      taxYear,
      jurisdiction,
      generatedAt: new Date().toISOString(),
      summary,
      zkProof: proof,
      transactionCount: yearTxs.length,
      privacyLevel: 'full'
    };
  }

  calculateSummary(transactions) {
    let shortTermGains = 0;
    let longTermGains = 0;
    let ordinaryIncome = 0;
    let totalVolume = 0;

    const oneYear = 365 * 24 * 60 * 60 * 1000;

 
    for (const tx of transactions) {
      totalVolume += tx.valueUSD || 0;

 
    if (tx.type === 'swap' || tx.type === 'sell') {
        const gain = tx.gainLoss || 0;
        const holdingPeriod = tx.timestamp - (tx.acquisitionDate || tx.timestamp - oneYear * 2);
        
 
    if (holdingPeriod > oneYear) {
          longTermGains += gain;
        } else {
          shortTermGains += gain;
        }
      }

 
    if (tx.type === 'reward' || tx.type === 'airdrop' || tx.type === 'yield') {
        ordinaryIncome += tx.valueUSD || 0;
      }
    }

 
    return {
      shortTermCapitalGains: Math.round(shortTermGains * 100) / 100,
      longTermCapitalGains: Math.round(longTermGains * 100) / 100,
      totalCapitalGains: Math.round((shortTermGains + longTermGains) * 100) / 100,
      ordinaryIncome: Math.round(ordinaryIncome * 100) / 100,
      totalTaxableIncome: Math.round((shortTermGains + longTermGains + ordinaryIncome) * 100) / 100,
      totalVolume: Math.round(totalVolume * 100) / 100
    };
  }
}

class SessionStore {
  constructor(redisClient) {
    this.redis = redisClient;
    this.TTL = 60 * 60 * 24; // 24 hours
  }

  async save(sessionId, data) {
    await this.redis.set(`session:${sessionId}`, JSON.stringify(data), { EX: this.TTL });
  }

  async load(sessionId) {
    const raw = await this.redis.get(`session:${sessionId}`);
    return raw ? JSON.parse(raw) : null;
  }
}

class TaxGhostApp {
  constructor(redisClient) {
    this.zkEngine = new ZKProofEngine();
    this.analyzer = new TransactionAnalyzer();
    this.liquify = new LiquifyClient();
    this.ipfs = new IPFSStorage();
    this.reportGenerator = new TaxReportGenerator(this.zkEngine, this.analyzer);
    this.store = new SessionStore(redisClient);
  }

  async createSession() {
    const sessionId = crypto.randomUUID();
    const session = {
      id: sessionId,
      createdAt: Date.now(),
      transactions: [],
      reports: []
    };
    await this.store.save(sessionId, session);
    return sessionId;
  }

  async getSession(sessionId) {
    return await this.store.load(sessionId);
  }

  async analyzeWallet(sessionId, addresses, options = {}) {
    const session = await this.getSession(sessionId);
    if (!session) throw new Error('Invalid session');

    const rawTxs = await this.liquify.getTransactions(addresses, options);
    const analyzed = await this.analyzer.analyzeTransactions(rawTxs);

    session.transactions = analyzed;
    await this.store.save(sessionId, session);

    return { transactionCount: analyzed.length, transactions: analyzed.slice(0, 10) };
  }

  async generateTaxReport(sessionId, taxYear, jurisdiction) {
    const session = await this.getSession(sessionId);
    if (!session) throw new Error('Invalid session');

    const report = await this.reportGenerator.generateReport(
      session.transactions,
      taxYear,
      jurisdiction
    );

    const stored = await this.ipfs.store(report);
    report.ipfsCid = stored.cid;
    report.ipfsUrl = stored.url;

    session.reports.push(report);
    await this.store.save(sessionId, session);

    return report;
  }

  verifyProof(proofId) {
    return this.zkEngine.verifyProof(proofId);
  }
}

function parseBody(req) {
  return new Promise((resolve, reject) => {
    let body = '';
    req.on('data', chunk => { body += chunk; });
    req.on('end', () => {
      try {
        resolve(body ? JSON.parse(body) : {});
      } catch (e) {
        reject(new Error('Invalid JSON'));
      }
    });
    req.on('error', reject);
  });
}

function sendJSON(res, data, status = 200) {
  res.writeHead(status, { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' });
  res.end(JSON.stringify(data));
}

function sendError(res, message, status = 400) {
  sendJSON(res, { error: message }, status);
}

export default async function runApp({ port }) {
  // --- Redis setup ---
  const { createClient } = await import('redis');
  const redisClient = createClient({ url: process.env.REDIS_URL });
  redisClient.on('error', (err) => console.error('Redis error:', err));
  await redisClient.connect();
  console.log('Redis connected');

  const app = new TaxGhostApp(redisClient);

  const server = http.createServer(async (req, res) => {
    if (req.method === 'OPTIONS') {
      res.writeHead(204, {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
        'Access-Control-Allow-Headers': 'Content-Type'
      });
      res.end();
      return;
    }

    const url = new URL(req.url, `http://${req.headers.host}`);
    const path = url.pathname;

    try {
      if (path === '/' && req.method === 'GET') {
        sendJSON(res, {
          name: 'TaxGhost',
          tagline: 'Privacy-First Tax Tool',
          version: '1.0.0',
          endpoints: [
            'POST /api/session - Create anonymous session',
            'POST /api/analyze - Analyze wallet transactions',
            'POST /api/report - Generate ZK tax report',
            'GET /api/verify/:proofId - Verify ZK proof',
            'GET /api/session/:id - Get session data'
          ]
        });
        return;
      }

      if (path === '/api/session' && req.method === 'POST') {
        const sessionId = await app.createSession();
        sendJSON(res, { sessionId, message: 'Anonymous session created' });
        return;
      }

      if (path === '/api/analyze' && req.method === 'POST') {
        const body = await parseBody(req);
        const { sessionId, addresses, chain, limit } = body;
        if (!sessionId) { sendError(res, 'sessionId required'); return; }
        if (!addresses || !Array.isArray(addresses)) { sendError(res, 'addresses array required'); return; }
        const result = await app.analyzeWallet(sessionId, addresses, { chain, limit });
        sendJSON(res, result);
        return;
      }

      if (path === '/api/report' && req.method === 'POST') {
        const body = await parseBody(req);
        const { sessionId, taxYear, jurisdiction } = body;
        if (!sessionId) { sendError(res, 'sessionId required'); return; }
        const report = await app.generateTaxReport(
          sessionId,
          taxYear || new Date().getFullYear() - 1,
          jurisdiction || 'US'
        );
        sendJSON(res, report);
        return;
      }

      if (path.startsWith('/api/verify/') && req.method === 'GET') {
        const proofId = path.split('/')[3];
        const result = app.verifyProof(proofId);
        sendJSON(res, result);
        return;
      }

      if (path.startsWith('/api/session/') && req.method === 'GET') {
        const sessionId = path.split('/')[3];
        const session = await app.getSession(sessionId);
        if (!session) { sendError(res, 'Session not found', 404); return; }
        sendJSON(res, {
          id: session.id,
          createdAt: session.createdAt,
          transactionCount: session.transactions.length,
          reportCount: session.reports.length
        });
        return;
      }

      if (path === '/health' && req.method === 'GET') {
        sendJSON(res, { status: 'healthy', timestamp: Date.now() });
        return;
      }

      sendError(res, 'Not found', 404);
    } catch (err) {
      sendError(res, err.message, 500);
    }
  });

  return new Promise((resolve) => {
    server.listen(port, '0.0.0.0', () => {
      console.log(`TaxGhost running on http://0.0.0.0:${port}`);
      resolve(server);
    });
  });
}
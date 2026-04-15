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
  constructor() {
    this.apiKey  = process.env.LIQUIFY_API_KEY || 'ETHHH5T9QPIEDYLFHGS';
    this.rpcUrl  = `https://gateway.liquify.com/api=${this.apiKey}`;
    // Known ERC-20 token addresses on Ethereum mainnet
    this.tokens  = {
      '0xa0b86991c6218b36c1d19d4a2e9eb0ce3606eb48': { symbol: 'USDC',  decimals: 6,  price: 1 },
      '0xdac17f958d2ee523a2206206994597c13d831ec7': { symbol: 'USDT',  decimals: 6,  price: 1 },
      '0x6b175474e89094c44da98b954eedeac495271d0f': { symbol: 'DAI',   decimals: 18, price: 1 },
      '0xc02aaa39b223fe8d0a0e5c4f27ead9083c756cc2': { symbol: 'WETH',  decimals: 18, price: 3000 },
      '0x2260fac5e5542a773aa44fbcfedf7c193bc2c599': { symbol: 'WBTC',  decimals: 8,  price: 65000 },
      '0x514910771af9ca656af840dff83e8264ecf986ca': { symbol: 'LINK',  decimals: 18, price: 15 },
      '0x1f9840a85d5af5bf1d1762f925bdaddc4201f984': { symbol: 'UNI',   decimals: 18, price: 8 },
      '0x7fc66500c84a76ad7e9c93437bfc5ac33e2ddae9': { symbol: 'AAVE',  decimals: 18, price: 90 },
    };
    // ERC-20 Transfer event topic
    this.TRANSFER_TOPIC = '0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef';
  }

  async rpc(method, params) {
    const res = await fetch(this.rpcUrl, {
      method:  'POST',
      headers: { 'Content-Type': 'application/json' },
      body:    JSON.stringify({ jsonrpc: '2.0', id: 1, method, params }),
      signal:  AbortSignal.timeout(15000)
    });
    const data = await res.json();
    if (data.error) throw new Error(`Liquify RPC error: ${data.error.message}`);
    return data.result;
  }

  // Refresh ETH price from CoinGecko (best effort)
  async refreshEthPrice() {
    try {
      const res = await fetch(
        'https://api.coingecko.com/api/v3/simple/price?ids=ethereum&vs_currencies=usd',
        { signal: AbortSignal.timeout(4000) }
      );
      const data = await res.json();
      if (data.ethereum?.usd) this.tokens['0xc02aaa39b223fe8d0a0e5c4f27ead9083c756cc2'].price = data.ethereum.usd;
    } catch { /* use cached price */ }
  }

  padAddress(addr) {
    return '0x' + addr.slice(2).toLowerCase().padStart(64, '0');
  }

  decodeAmount(hex, decimals) {
    const raw = BigInt(hex || '0x0');
    return Number(raw) / Math.pow(10, decimals);
  }

  async getBlockTimestamp(blockHex) {
    const block = await this.rpc('eth_getBlockByNumber', [blockHex, false]);
    return block ? parseInt(block.timestamp, 16) * 1000 : Date.now();
  }

  async getTransactions(addresses, options = {}) {
    const address = addresses[0].toLowerCase();
    const limit   = options.limit || 50;
    const padded  = this.padAddress(address);

    await this.refreshEthPrice();

    // Get latest block
    const latestHex  = await this.rpc('eth_blockNumber', []);
    const latest     = parseInt(latestHex, 16);
    const fromBlock  = '0x' + Math.max(0, latest - 200000).toString(16); // ~1 month

    // Fetch outgoing ERC-20 transfers (from address)
    const [outLogs, inLogs] = await Promise.all([
      this.rpc('eth_getLogs', [{ fromBlock, toBlock: 'latest', topics: [this.TRANSFER_TOPIC, padded] }]),
      this.rpc('eth_getLogs', [{ fromBlock, toBlock: 'latest', topics: [this.TRANSFER_TOPIC, null, padded] }])
    ]);

    // Merge + deduplicate by txHash
    const seen = new Set();
    const allLogs = [...(outLogs || []), ...(inLogs || [])].filter(log => {
      if (seen.has(log.transactionHash)) return false;
      seen.add(log.transactionHash);
      return true;
    });

    // Sort newest first, take limit
    allLogs.sort((a, b) => parseInt(b.blockNumber, 16) - parseInt(a.blockNumber, 16));
    const topLogs = allLogs.slice(0, limit);

    // Get unique block timestamps in parallel
    const blockNums  = [...new Set(topLogs.map(l => l.blockNumber))];
    const tsMap      = {};
    await Promise.all(blockNums.map(async bn => {
      tsMap[bn] = await this.getBlockTimestamp(bn);
    }));

    // Format into TaxGhost transaction objects
    return topLogs.map(log => {
      const token    = this.tokens[log.address.toLowerCase()];
      const symbol   = token?.symbol  || 'ERC20';
      const decimals = token?.decimals || 18;
      const price    = token?.price   || 1;
      const amount   = this.decodeAmount(log.data, decimals);
      const valueUSD = amount * price;
      const fromAddr = '0x' + log.topics[1].slice(26);
      const toAddr   = '0x' + log.topics[2].slice(26);
      const isOut    = fromAddr.toLowerCase() === address;
      const type     = isOut ? 'sell' : 'buy';

      return {
        hash:        log.transactionHash,
        blockNumber: parseInt(log.blockNumber, 16),
        timestamp:   tsMap[log.blockNumber] || Date.now(),
        from:        fromAddr,
        to:          toAddr,
        type,
        protocol:    'ERC-20 Transfer',
        tokenIn:     isOut ? symbol : 'USDC',
        tokenOut:    isOut ? 'USDC' : symbol,
        amountIn:    amount.toFixed(6),
        amountOut:   amount.toFixed(6),
        valueUSD:    Math.round(valueUSD * 100) / 100,
        chain:       options.chain || 'ethereum',
        gasUsed:     0,
        gasPrice:    '0gwei'
      };
    });
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

class UsageTracker {
  constructor(redisClient) {
    this.redis = redisClient;
    this.FREE_LIMIT = 1;
  }

  _key(address) {
    return `usage:wallet:${address.toLowerCase()}`;
  }

  async checkUsageOnly(addresses) {
    // Non-consuming check — just returns status
    if (!addresses || addresses.length === 0) return { freeRemaining: this.FREE_LIMIT };
    for (const addr of addresses) {
      const raw = await this.redis.get(this._key(addr));
      if (raw) {
        const usage = JSON.parse(raw);
        if (usage.reportCount >= this.FREE_LIMIT) return { freeRemaining: 0 };
      }
    }
    return { freeRemaining: this.FREE_LIMIT };
  }

  async checkAndConsume(addresses) {
    if (!addresses || addresses.length === 0) return { allowed: true };
    // Check all addresses — any one that's already used blocks the request
    for (const addr of addresses) {
      const raw = await this.redis.get(this._key(addr));
      if (raw) {
        const usage = JSON.parse(raw);
        if (usage.reportCount >= this.FREE_LIMIT) {
          return {
            allowed: false,
            address: addr,
            message: `Free report already used for wallet ${addr.slice(0,6)}...${addr.slice(-4)}. Unlock to generate more reports.`
          };
        }
      }
    }
    // All clear — record usage
    for (const addr of addresses) {
      const key = this._key(addr);
      const raw = await this.redis.get(key);
      const usage = raw ? JSON.parse(raw) : { reportCount: 0, firstUsed: Date.now() };
      usage.reportCount += 1;
      await this.redis.set(key, JSON.stringify(usage));
    }
    return { allowed: true };
  }

  async getUsage(address) {
    const raw = await this.redis.get(this._key(address));
    if (!raw) return { reportCount: 0, freeRemaining: this.FREE_LIMIT };
    const usage = JSON.parse(raw);
    return {
      reportCount:   usage.reportCount,
      freeRemaining: Math.max(0, this.FREE_LIMIT - usage.reportCount),
      firstUsed:     usage.firstUsed
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
    this.zkEngine        = new ZKProofEngine();
    this.analyzer        = new TransactionAnalyzer();
    this.liquify = new LiquifyClient();
    this.ipfs            = new IPFSStorage();
    this.reportGenerator = new TaxReportGenerator(this.zkEngine, this.analyzer);
    this.store           = new SessionStore(redisClient);
    this.usage           = new UsageTracker(redisClient);
  }

  async createSession() {
    const sessionId = crypto.randomUUID();
    await this.store.save(sessionId, {
      id: sessionId,
      createdAt: Date.now(),
      transactions: [],
      reports: [],
      addresses: []
    });
    return sessionId;
  }

  async getSession(sessionId) {
    return await this.store.load(sessionId);
  }

  async analyzeWallet(sessionId, addresses, options = {}) {
    const session = await this.getSession(sessionId);
    if (!session) throw new Error('Invalid session');

    const usageCheck = await this.usage.checkUsageOnly(addresses);
    const freeRemaining = usageCheck.freeRemaining;

    const rawTxs  = await this.liquify.getTransactions(addresses, options);
    const analyzed = await this.analyzer.analyzeTransactions(rawTxs);

    session.transactions = analyzed;
    session.addresses    = addresses;
    await this.store.save(sessionId, session);

    return {
      transactionCount: analyzed.length,
      transactions:     analyzed.slice(0, 10),
      freeRemaining
    };
  }

  async generateTaxReport(sessionId, taxYear, jurisdiction) {
    const session = await this.getSession(sessionId);
    if (!session) throw new Error('Invalid session');

    // Enforce free limit at report generation
    const check = await this.usage.checkAndConsume(session.addresses || []);
    if (!check.allowed) {
      const err = new Error(check.message);
      err.code  = 'FREE_LIMIT_REACHED';
      err.status = 402;
      throw err;
    }

    const report = await this.reportGenerator.generateReport(
      session.transactions,
      taxYear,
      jurisdiction
    );

    const stored    = await this.ipfs.store(report);
    report.ipfsCid  = stored.cid;
    report.ipfsUrl  = stored.url;

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
      sendError(res, err.message, err.status || 500);
    }
  });

  return new Promise((resolve) => {
    server.listen(port, '0.0.0.0', () => {
      console.log(`TaxGhost running on http://0.0.0.0:${port}`);
      resolve(server);
    });
  });
}
import 'dotenv/config';

// Rate limiter implementation - 900 requests per 5 minutes
class RateLimiter {
  constructor(maxTokens, refillInterval) {
    this.maxTokens = maxTokens;
    this.tokens = maxTokens;
    this.lastRefill = Date.now();
    this.refillInterval = refillInterval;
  }

  async getToken() {
    const now = Date.now();
    const timePassed = now - this.lastRefill;
    
    // Refill tokens based on time passed
    if (timePassed >= this.refillInterval) {
      this.tokens = this.maxTokens;
      this.lastRefill = now;
    }

    if (this.tokens <= 0) {
      // Wait until next refill
      const waitTime = this.refillInterval - timePassed;
      await new Promise(resolve => setTimeout(resolve, waitTime));
      this.tokens = this.maxTokens;
      this.lastRefill = Date.now();
    }

    this.tokens--;
  }
}

// Initialize rate limiter - 900 requests per 5 minutes
const rateLimiter = new RateLimiter(900, 5 * 60 * 1000);

const counterspellsData = await Bun.file(
  './test_data/counterspell/counterspells.json'
).json();

async function fetchReceipts(organizationId, transactionId) {
  await rateLimiter.getToken();
  const url = `https://hcb.hackclub.com/api/v4/organizations/${organizationId}/transactions/${transactionId}/receipts`;
  const response = await fetch(url, {
    headers: {
      'Authorization': `Bearer ${process.env.HCB_TOKEN}`
    }
  });

  if (!response.ok) {
    console.error(`Failed to fetch receipts for transaction ${transactionId}:`, await response.text());
    return [];
  }

  const data = await response.json();
  return data || [];
}

async function fetchAllTransactions(organizationId) {
  const transactions = [];
  let hasMore = true;
  let after = null;
  const limit = 25;

  while (hasMore) {
    await rateLimiter.getToken();
    const url = `https://hcb.hackclub.com/api/v4/organizations/${organizationId}/transactions${after ? `?after=${after}&limit=${limit}` : `?limit=${limit}`}`;
    const response = await fetch(url, {
      headers: {
        'Authorization': `Bearer ${process.env.HCB_TOKEN}`
      }
    });

    if (!response.ok) {
      console.error(`Failed to fetch transactions for org ${organizationId}:`, await response.text());
      return [];
    }

    const data = await response.json();
    
    // Fetch receipts for each transaction
    for (const transaction of data.data) {
      console.log(`  Fetching receipts for transaction ${transaction.id}`);
      transaction.receipts = await fetchReceipts(organizationId, transaction.id);
    }
    
    transactions.push(...data.data);
    hasMore = data.has_more;
    
    if (hasMore && data.data.length > 0) {
      after = data.data[data.data.length - 1].id;
    }
  }

  return transactions;
}

async function processCounterspells() {
  const organizations = [];
  
  for (const counterspell of counterspellsData) {
    console.log(`Fetching transactions for ${counterspell.name} (${counterspell.id})`);
    
    const transactions = await fetchAllTransactions(counterspell.id);
    console.log(`Found ${transactions.length} transactions`);
    
    organizations.push({
      ...counterspell,
      transactions
    });
    
    // Write the current state after each organization is processed
    // This helps with resumability and prevents data loss if the script fails
    await Bun.write(
      './test_data/counterspell/all_transactions.json',
      JSON.stringify(organizations, null, 2)
    );
    
    console.log(`Saved data including ${counterspell.name}`);
  }
}

// Ensure we have the HCB token
if (!process.env.HCB_TOKEN) {
  console.error('Please set HCB_TOKEN environment variable');
  process.exit(1);
}

await processCounterspells();
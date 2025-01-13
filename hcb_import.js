import 'dotenv/config';

const counterspellsData = await Bun.file(
  './test_data/counterspell/counterspells.json'
).json();

async function fetchReceipts(organizationId, transactionId) {
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
    
    // Add a small delay to avoid rate limiting
    await new Promise(resolve => setTimeout(resolve, 100));
  }

  return transactions;
}

async function processCounterspells() {
  for (const counterspell of counterspellsData) {
    console.log(`Fetching transactions for ${counterspell.name} (${counterspell.id})`);
    
    const transactions = await fetchAllTransactions(counterspell.id);
    console.log(`Found ${transactions.length} transactions`);
    
    await Bun.write(
      `./test_data/counterspell/transactions_${counterspell.slug}.json`,
      JSON.stringify(transactions, null, 2)
    );
    
    console.log(`Saved transactions for ${counterspell.name}`);
  }
}

// Ensure we have the HCB token
if (!process.env.HCB_TOKEN) {
  console.error('Please set HCB_TOKEN environment variable');
  process.exit(1);
}

await processCounterspells();
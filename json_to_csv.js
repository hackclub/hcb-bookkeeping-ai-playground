const fs = require('fs');

// Function to get all possible paths in an object recursively
function getAllPaths(obj, parentPath = '') {
  let paths = new Set();
  
  for (const key in obj) {
    const newPath = parentPath ? `${parentPath}.${key}` : key;
    
    if (obj[key] && typeof obj[key] === 'object' && !Array.isArray(obj[key])) {
      // Recursively get paths for nested objects
      const nestedPaths = getAllPaths(obj[key], newPath);
      nestedPaths.forEach(path => paths.add(path));
    } else if (!Array.isArray(obj[key])) {
      // Add leaf node paths
      paths.add(newPath);
    }
  }
  
  return paths;
}

// Function to get value from object using dot notation path
function getValueByPath(obj, path) {
  return path.split('.').reduce((current, key) => {
    return current && current[key] !== undefined ? current[key] : '';
  }, obj);
}

// Main function to convert JSON to CSV
async function convertJsonToCsv(inputFile, outputFile) {
  // Read and parse JSON file
  const fileContent = await Bun.file(inputFile).text();
  const jsonData = JSON.parse(fileContent);
  
  // Collect all transactions from all organizations
  const allTransactions = [];
  jsonData.forEach(org => {
    org.transactions.forEach(transaction => {
      // Add organization info to each transaction and convert amount to dollars
      const { amount_cents, ...rest } = transaction;
      allTransactions.push({
        org_id: org.id,
        org_parent_id: org.parent || '',
        org_name: org.name,
        org_slug: org.slug,
        amount_dollars: amount_cents / 100,
        ...rest
      });
    });
  });

  if (allTransactions.length === 0) {
    console.error('No transactions found');
    return;
  }

  // Get all possible paths from the first transaction
  const paths = Array.from(getAllPaths(allTransactions[0])).sort();
  
  // Reorder paths to put org fields first
  const orderedPaths = [
    'org_id',
    'org_parent_id',
    'org_name',
    'org_slug',
    'amount_dollars',
    ...paths.filter(p => !['org_id', 'org_parent_id', 'org_name', 'org_slug', 'amount_dollars'].includes(p))
  ];
  
  // Create CSV header
  const csvHeader = orderedPaths.join(',');
  
  // Create CSV rows
  const csvRows = allTransactions.map(transaction => {
    return orderedPaths.map(path => {
      const value = getValueByPath(transaction, path);
      // Handle values that might contain commas or quotes
      if (typeof value === 'string') {
        return `"${value.replace(/"/g, '""')}"`;
      }
      return value;
    }).join(',');
  });

  // Combine header and rows
  const csvContent = [csvHeader, ...csvRows].join('\n');
  
  // Write to file using Bun
  await Bun.write(outputFile, csvContent);
  console.log(`CSV file created successfully: ${outputFile}`);
}

// Process the file
const inputFile = 'test_data/counterspell/all_transactions.json';
const outputFile = 'hcb_transactions.csv';
convertJsonToCsv(inputFile, outputFile);
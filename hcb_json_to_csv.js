const fs = require('fs');

// Function to get all possible paths in an object recursively
function getAllPaths(obj, parentPath = '', maxArrayItems = 5) {
  let paths = new Set();
  
  for (const key in obj) {
    const newPath = parentPath ? `${parentPath}.${key}` : key;
    
    if (Array.isArray(obj[key])) {
      // Handle any array specially
      // First add the array field itself
      paths.add(newPath);
      
      // Then add numbered items if the array has objects
      if (obj[key].length > 0 && typeof obj[key][0] === 'object') {
        for (let i = 0; i < Math.min(maxArrayItems, obj[key].length); i++) {
          const arrayItemPrefix = `${newPath}${i + 1}`;
          // Add all fields from this item
          getAllPaths(obj[key][i], arrayItemPrefix).forEach(path => paths.add(path));
        }
      }
    } else if (obj[key] && typeof obj[key] === 'object') {
      // Recursively get paths for nested objects
      const nestedPaths = getAllPaths(obj[key], newPath);
      nestedPaths.forEach(path => paths.add(path));
    } else {
      // Add leaf node paths
      paths.add(newPath);
    }
  }
  
  return paths;
}

// Function to safely escape and quote a value for CSV
function escapeCsvValue(value) {
  if (value === null || value === undefined) {
    return '';
  }
  
  if (typeof value === 'object') {
    if (Array.isArray(value)) {
      // For arrays, join the values with semicolons, but skip objects that would be [object Object]
      const items = value.map(v => {
        if (typeof v === 'object' && v !== null && Object.keys(v).length > 0) return '';
        return String(v).replace(/"/g, '""');
      }).filter(Boolean);
      return items.length ? `"${items.join(';')}"` : '';
    } else if (Object.keys(value).length > 0) {
      // Skip non-empty objects that would serialize as [object Object]
      return '';
    } else {
      return '';
    }
  }
  
  // Convert to string and handle special characters
  const str = String(value);
  if (str.includes(',') || str.includes('"') || str.includes('\n') || str.includes('\r')) {
    return `"${str.replace(/"/g, '""')}"`;
  }
  
  return str;
}

// Function to get value from object using dot notation path
function getValueByPath(obj, path) {
  // Handle array item paths specially (like receipts1, tags1, etc)
  const match = path.match(/^(.+?)(\d+)(.*)/);
  if (match) {
    const [_, arrayPath, indexStr, rest] = match;
    const index = parseInt(indexStr) - 1;
    
    // Get the array first
    const array = arrayPath.split('.').reduce((current, key) => {
      return current && current[key] !== undefined ? current[key] : undefined;
    }, obj);
    
    if (!array || !Array.isArray(array)) return '';
    
    const item = array[index];
    if (!item) return '';
    
    // If there's no rest path and item is an object, skip it
    if (!rest && typeof item === 'object' && Object.keys(item).length > 0) {
      return '';
    }
    
    return rest ? getValueByPath(item, rest.slice(1)) : item;
  }

  const value = path.split('.').reduce((current, key) => {
    if (current === null || current === undefined) return '';
    if (Array.isArray(current)) {
      const items = current.map(item => {
        if (typeof item === 'object' && item !== null && Object.keys(item).length > 0) return '';
        return String(item);
      }).filter(Boolean);
      return items.length ? items.join(';') : '';
    }
    if (typeof current === 'object' && !(key in current)) return '';
    return current[key];
  }, obj);

  return value;
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
      const { ...rest } = transaction;
      allTransactions.push({
        org_id: org.id,
        org_parent_id: org.parent || '',
        org_name: org.name,
        org_slug: org.slug,
        ...rest
      });
    });
  });

  if (allTransactions.length === 0) {
    console.error('No transactions found');
    return;
  }

  // Get all possible paths from all transactions to ensure we catch all array fields
  const paths = new Set();
  allTransactions.forEach(transaction => {
    getAllPaths(transaction).forEach(path => paths.add(path));
  });
  
  // Convert to array and sort
  const orderedPaths = [
    'org_id',
    'org_parent_id',
    'org_name',
    'org_slug',
    ...Array.from(paths).filter(p => !['org_id', 'org_parent_id', 'org_name', 'org_slug'].includes(p)).sort()
  ];
  
  // Create CSV header
  const csvHeader = orderedPaths.map(path => escapeCsvValue(path)).join(',');
  
  // Create CSV rows
  const csvRows = allTransactions.map(transaction => {
    return orderedPaths.map(path => {
      const value = getValueByPath(transaction, path);
      return escapeCsvValue(value);
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
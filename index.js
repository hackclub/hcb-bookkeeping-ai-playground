import 'dotenv/config';
import { openai } from '@ai-sdk/openai';
import { generateObject, generateText, tool } from 'ai';
import { z } from 'zod';
import { parse } from 'csv-parse/sync';
import { readFileSync, writeFileSync, existsSync } from 'fs';
import * as XLSX from 'xlsx';
import fs from 'fs';

const aiModel = openai('gpt-4o');

// Chart of Accounts
const CHART_OF_ACCOUNTS = {
    income: {
        id: '4000',
        name: 'Income',
        subAccounts: {
            majorGifts: { id: '4100', name: 'Major Gifts $5k+' },
            webDonations: { id: '4200', name: 'Grassroots Donations' },
            earnedRevenue: { id: '4300', name: 'Earned Revenue' }
        }
    },
    expenses: {
        id: '5000',
        name: 'Expenses',
        subAccounts: {
            personnelExpenses: {
                id: '5100',
                name: 'Personnel Expenses',
                subAccounts: {
                    salariesAndWages: { id: '5110', name: 'Salaries and Wages' },
                    benefitsAndTaxes: { id: '5120', name: 'Employee Benefits and Payroll Taxes' },
                    contractors: { id: '5130', name: 'Contractors' }
                }
            },
            professionalServices: {
                id: '5200',
                name: 'Outside Professional Services and Fees',
                subAccounts: {
                    legalAndAccounting: { id: '5210', name: 'Legal and Accounting Services' }
                }
            },
            facilitiesExpenses: {
                id: '5300',
                name: 'Facilities Expenses',
                subAccounts: {
                    rentAndLease: { id: '5310', name: 'Rent and Lease Expense' },
                    utilities: { id: '5320', name: 'Utilities' },
                    maintenance: { id: '5330', name: 'Maintenance and Repairs' },
                    depreciation: { id: '5340', name: 'Depreciation Expense' },
                    officeSupplies: { id: '5350', name: 'Office Supplies' },
                    internet: { id: '5360', name: 'Internet' },
                    officeExpenses: { id: '5370', name: 'Office Expenses' }
                }
            },
            technology: {
                id: '5400',
                name: 'Technology',
                subAccounts: {
                    staffComputers: { id: '5410', name: 'Staff Computers' },
                    softwareSubscriptions: { id: '5420', name: 'Software Subscriptions & Licenses' },
                    serversAndHosting: { id: '5430', name: 'Servers & Hosting' }
                }
            },
            shippingAndPostage: { id: '5500', name: 'Shipping & Postage' },
            insurance: {
                id: '5600',
                name: 'Insurance',
                subAccounts: {
                    generalLiability: { id: '5610', name: 'General Liability Insurance' },
                    otherInsurance: { id: '5620', name: 'Other Insurance' }
                }
            },
            programExpenses: {
                id: '5700',
                name: 'Program Expenses',
                subAccounts: {
                    travelAndTransportation: {
                        id: '5710',
                        name: 'Travel & Transportation',
                        subAccounts: {
                            travelExpenseDetails: { id: '5711', name: 'Travel Expense Details' }
                        }
                    },
                    resourceDistribution: {
                        id: '5720',
                        name: 'Resource Distribution',
                        subAccounts: {
                            directResources: { id: '5721', name: 'Direct Resources / Prizes / Grants' },
                            subGrants: { id: '5722', name: 'Sub-Grants To Other Orgs' }
                        }
                    }
                }
            },
            supportExpenses: {
                id: '5800',
                name: 'Support Expenses',
                subAccounts: {
                    marketingAndComm: { id: '5810', name: 'Marketing and Communications' },
                    training: { id: '5820', name: 'Training & Professional Development' },
                    conferencesCosts: { id: '5830', name: 'Meeting & Conference Costs' },
                    mealsAndEntertainment: { id: '5840', name: 'Meals & Entertainment' }
                }
            },
            fundraisingExpenses: {
                id: '5900',
                name: 'Fundraising Expenses',
                subAccounts: {
                    travelAndTransportation: { id: '5910', name: 'Travel & Transportation' },
                    events: { id: '5920', name: 'Events' },
                    other: { id: '5930', name: 'Other' }
                }
            },
            miscExpenses: { id: '5950', name: 'Miscellaneous or Other Operating Expenses' }
        }
    }
};
// Function to print chart of accounts in a formatted way
function printChartOfAccounts(accounts = CHART_OF_ACCOUNTS, level = 0) {
    let output = '';
    for (const [key, account] of Object.entries(accounts)) {
        // Skip if not a proper account object
        if (!account.name) continue;
        
        // Add current account with indentation to output string
        output += `${'    '.repeat(level)}${account.name}${account.id ? ` (id: ${account.id})` : ''}\n`;
        
        // Recursively add sub-accounts if they exist
        if (account.subAccounts) {
            output += printChartOfAccounts(account.subAccounts, level + 1);
        }
    }
    return output;
}


// Transaction processing functions
async function identifyFields(headers) {
    const { object } = await generateObject({
        schema: z.object({
            dateField: z.string().describe('The CSV header that represents the transaction date'),
            amountField: z.string().describe('The CSV header that represents the transaction amount'),
        }),
        model: aiModel,
        prompt: `Given these CSV headers: ${headers.join(', ')}\nIdentify which header represents the transaction date and which represents the transaction amount/value.`
    });
    return object;
}

// Helper function for CSV operations
function escapeCsvField(field) {
    if (field === null || field === undefined) return '';
    const stringField = String(field);
    if (stringField.includes(',') || stringField.includes('"') || stringField.includes('\n')) {
        return `"${stringField.replace(/"/g, '""')}"`;
    }
    return stringField;
}

// Common CSV parse options
const CSV_PARSE_OPTIONS = {
    columns: true,
    skip_empty_lines: true,
    trim: true,
    relax_column_count: true,
    quote: '"',
    escape: '"',
    relaxQuotes: true
};

async function loadTransactions(csvPath) {
    const fileContent = readFileSync(csvPath, 'utf-8');
    const records = parse(fileContent, CSV_PARSE_OPTIONS);

    if (records.length === 0) {
        throw new Error('No transactions found in CSV file');
    }

    // Get headers from first record
    const headers = Object.keys(records[0]);
    console.log('Found CSV headers:', headers);

    // Use AI to identify date and amount fields
    const { dateField, amountField } = await identifyFields(headers);
    console.log(`AI identified date field as "${dateField}" and amount field as "${amountField}"`);

    return records.map((record, index) => {
        // First, process date and amount
        const date = dateField && record[dateField] ? new Date(record[dateField]) : null;
        // Parse amount and format as currency string
        let amountStr = null;
        if (amountField && record[amountField]) {
            const amountNum = parseFloat(record[amountField].replace(/[$,]/g, '')) / 100;
            if (!isNaN(amountNum)) {
                amountStr = amountNum < 0 ? 
                    `-$${Math.abs(amountNum).toFixed(2)}` :
                    `$${amountNum.toFixed(2)}`;
            }
        }

        // Create remaining fields object excluding date and amount
        const remainingFields = {};
        for (const [key, value] of Object.entries(record)) {
            if (key !== dateField && key !== amountField) {
                remainingFields[key] = value;
            }
        }

        // Return object in specified order
        return {
            date,
            amount: amountStr,
            category: null,
            accountId: null,
            ...remainingFields
        };
    });
}

// Function to create a unique transaction key
function createTransactionKey(transaction) {
    // Just return the id field as the key
    return transaction.id || '';
}
// Function to serialize transaction data, excluding URL fields and empty values
// to limit token usage
function serializeTransaction(transaction) {
    const serialized = {};
    
    for (const [key, value] of Object.entries(transaction)) {
        // Skip if value is null/undefined/empty string
        if (value == null || value === '') {
            continue;
        }

        // Skip if value is a URL string
        if (typeof value === 'string' && (
            value.startsWith('http://') || 
            value.startsWith('https://') ||
            value.startsWith('data:') ||
            value instanceof URL
        )) {
            continue;
        }

        // Handle Date objects
        if (value instanceof Date) {
            serialized[key] = value.toISOString();
            continue;
        }

        // Handle nested objects
        if (typeof value === 'object' && !Array.isArray(value)) {
            const nested = serializeTransaction(value);
            if (Object.keys(nested).length > 0) {
                serialized[key] = nested;
            }
            continue;
        }

        serialized[key] = value;
    }

    return JSON.stringify(serialized);
}

// Function to process all transactions
async function processTransactions(csvPath) {
    const transactions = await loadTransactions(csvPath);
    console.log(`Loaded ${transactions.length} transactions`);

    // Load already processed transactions to avoid duplicates
    const processedTransactions = new Set();
    if (existsSync('processed.csv')) {
        const processed = parse(readFileSync('processed.csv', 'utf-8'), CSV_PARSE_OPTIONS);
        processed.forEach(record => {
            const key = createTransactionKey({
                id: record.id,
            });
            processedTransactions.add(key);
        });
    }

    // Process each transaction
    for (const transaction of transactions) {
        // Create unique key for matching
        const transactionKey = createTransactionKey(transaction);
        
        if (processedTransactions.has(transactionKey)) {
            console.log('Skipping already processed transaction:', transactionKey);
            continue;
        }

        // Find all fields containing both 'receipt' and 'url'
        const receiptUrlFields = Object.keys(transaction).filter(field => 
            field.toLowerCase().includes('receipt') && 
            field.toLowerCase().includes('url') &&
            !field.toLowerCase().includes('preview')
        );

        // Extract receipt data for each receipt URL field
        for (const urlField of receiptUrlFields) {
            const receiptUrl = transaction[urlField];
            if (receiptUrl) {
                try {
                    // Get receipt data (this will use cache if available)
                    const receiptData = await getReceiptData(`${transaction.id}-${urlField}`, receiptUrl, serializeTransaction(transaction));

                    // Store receipt data in a new field named after the URL field
                    transaction[`${urlField}.extracted_contents`] = receiptData;
                } catch (error) {
                    console.error(`Failed to extract receipt data from ${urlField}:`, error);
                    transaction[`${urlField}.extracted_contents`] = null;
                }
            }
        }

        const { object } = await generateObject({
            schema: z.object({
                accountName: z.string().describe('The name of the account in the chart of accounts'),
                accountId: z.string().describe('The ID of the account in the chart of accounts'),
                questions: z.array(z.object({
                    thoughtfulQuestion: z.string().describe("Keep it concise. Don't repeat transaction info or answers."),
                    multipleChoiceOptions: z.array(z.string()).describe("Contains the possible answers. Don't have other as an option. Keep it short")
                })).describe('Questions to ask the user if you need additional information')
            }),
            model: aiModel,
            prompt: `
You are a bookeeper for a nonprofit organization. You prize accuracy and
reliability of the books so the money can be spend as effectively as possible.

Given the following transaction and chart of accounts, determine the account
name and account ID for the transaction.  Read all the fields in transaction and
look for merchant name and receipt data that can help. If a receipt is available
and the amount reasonably matches the transaction (assuming currency conversion
variance), prioritize the info we get from the receipt. Look at whether the
amount is positive or negative. Positive = income, negative = expense.

The nonprofit's staff are very busy, so if you can accurately categorize without
asking any questions - do so. But accuracy is important, so if you need more
info, you can ask the user 1 or 2 well-thought-out follow up question if you
to determine where in the chart of accounts the transaction belongs.

You only get 1 chance to ask the user for information, so make it count.

Transaction (amount is in cents): ${serializeTransaction(transaction)}

Chart of Accounts:
${printChartOfAccounts()}
`
        });

        let accountName = object.accountName;
        let accountId = object.accountId;

        let questions = object.questions;

        if (questions && questions.length > 0) {
            const question = questions[0];

            // Display transaction details in a pretty format
            console.log('\nTransaction Details:');
            console.log('-------------------');
            console.log(`Date: ${transaction.date?.toLocaleDateString()}`);
            console.log(`Amount: ${transaction.amount}`);
            console.log(`Description: ${transaction.description || 'N/A'}`);
            console.log(`Memo: ${transaction.memo || 'N/A'}`);
            if (transaction.comments) {
                console.log(`Comments: ${transaction.comments}`);
            }
            // Display receipt URLs if they exist
            for (const [key, value] of Object.entries(transaction)) {
                if (key.endsWith('.url') && value) {
                    console.log(`Receipt: ${value}`);
                }
            }
            console.log('-------------------\n');

            // Get user input via readline
            const readline = require('readline').createInterface({
                input: process.stdin,
                output: process.stdout
            });

            const selectedAnswer = await new Promise(resolve => {
                // First display the question
                console.log(question.thoughtfulQuestion);
                
                // Then show the multiple choice options
                console.log('');
                question.multipleChoiceOptions.forEach((option, i) => {
                    console.log(`${i + 1}. ${option}`);
                });

                readline.question('\nPick an option (or type any custom response): ', answer => {
                    const num = parseInt(answer);
                    if (num >= 1 && num <= question.multipleChoiceOptions.length) {
                        // If they entered a valid number, use that choice
                        resolve(question.multipleChoiceOptions[num - 1]);
                    } else {
                        // Otherwise treat their input as a custom answer
                        resolve(answer.trim());
                    }
                    readline.close();
                });
            });

            console.log(`\nRecorded answer: ${selectedAnswer}\n`);

            const { object: categorization } = await generateObject({
                schema: z.object({
                    accountName: z.string().describe('The category for this transaction'),
                    accountId: z.string().describe('The account ID for this transaction')
                }),
                model: aiModel,
                prompt: `Given the following transaction and user input, determine the category and account ID for the transaction. Read all the fields in transaction, there may be metadata or receipt data that can help. Look at whether the amount is positive or negative. Positive = income, negative = expense.
                
                Transaction: ${serializeTransaction(transaction)}
                Chart of Accounts:
${printChartOfAccounts()}
                
                Question: ${question.thoughtfulQuestion}
                User's answer: ${selectedAnswer}
                
                Based on this information, determine the appropriate category and account ID.`
            });

            accountName = categorization.accountName;
            accountId = categorization.accountId;
        }

        // Get account name from chart of accounts and format with parent hierarchy
        const getFullAccountName = (accountId) => {
            const parts = [];
            
            // Helper function to search through nested accounts
            const findAccount = (obj) => {
                if (obj.id === accountId) return obj;
                if (obj.subAccounts) {
                    for (const subAccount of Object.values(obj.subAccounts)) {
                        const found = findAccount(subAccount);
                        if (found) return found;
                    }
                }
                return null;
            };
            
            // Search through top level accounts
            let current = null;
            for (const topAccount of Object.values(CHART_OF_ACCOUNTS)) {
                current = findAccount(topAccount);
                if (current) break;
            }
            
            // Build the hierarchy path
            while (current) {
                parts.unshift(current.name);
                // Search for parent by looking through all accounts again
                const parentId = current.parentId;
                current = parentId ? findAccount(CHART_OF_ACCOUNTS) : null;
            }
            
            return parts.join(' > ');
        };
        transaction.accountName = getFullAccountName(accountId);
        transaction.accountId = accountId;

        // Prepare CSV fields with proper escaping
        const fields = [
            transaction.date ? transaction.date.toISOString() : '',
            transaction.amount,
            transaction.category || '',
            transaction.accountId || '',
            ...Object.values(transaction).slice(4).map(val => 
                typeof val === 'object' && val !== null && !(val instanceof Date) 
                    ? JSON.stringify(val) 
                    : val
            )
        ].map(escapeCsvField);

        // Save to processed.csv
        const csvLine = fields.join(',') + '\n';
        
        if (!existsSync('processed.csv')) {
            const headerFields = [
                'date',
                'amount',
                'category',
                'accountId',
                ...Object.keys(transaction).slice(4)
            ].map(escapeCsvField);
            
            writeFileSync('processed.csv', headerFields.join(',') + '\n');
        }
        
        writeFileSync('processed.csv', csvLine, { flag: 'a' });
        processedTransactions.add(transactionKey);
    }

    return transactions;
}

async function generateStatementOfActivity(csvPath) {
    // Load and parse processed.csv
    const fileContent = readFileSync(csvPath, 'utf-8');
    const records = parse(fileContent, CSV_PARSE_OPTIONS);

    if (records.length === 0) {
        throw new Error(`No transactions found in ${csvPath}`);
    }

    // Get headers and identify key fields
    const { dateField, amountField } = await identifyFields(Object.keys(records[0]));
    const accountIdField = 'accountId';

    // Group transactions by account and month
    const transactionsByAccount = {};
    const monthlyTotals = {};
    const sortedMonths = new Set();
    
    records.forEach(record => {
        const date = new Date(record[dateField]);
        const monthKey = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
        sortedMonths.add(monthKey);
        const amount = record[amountField].includes('$') ? 
            parseFloat(record[amountField].replace(/[\$,]/g, '')) :
            parseFloat(record[amountField]) / 100;
        const accountId = record[accountIdField];

        // Store transaction by account
        if (!transactionsByAccount[accountId]) {
            transactionsByAccount[accountId] = [];
        }
        transactionsByAccount[accountId].push({
            date: date.toISOString().split('T')[0],
            amount,
            description: record.description || record.memo || '',
            monthKey
        });

        // Update monthly totals
        if (!monthlyTotals[monthKey]) {
            monthlyTotals[monthKey] = {};
        }
        if (!monthlyTotals[monthKey][accountId]) {
            monthlyTotals[monthKey][accountId] = 0;
        }
        monthlyTotals[monthKey][accountId] += amount;
    });

    const sortedMonthsArray = Array.from(sortedMonths).sort();

    // Prepare worksheet data with transactions
    const wsData = [];
    let currentRow = 0;

    // Track outline levels for each row
    const outlineLevels = {};

    // Create month headers
    const monthHeaders = sortedMonthsArray.map(month => {
        const [year, monthNum] = month.split('-');
        return new Date(parseInt(year), parseInt(monthNum) - 1).toLocaleString('default', { month: 'short', year: 'numeric' });
    });

    // Helper function to add account rows with transactions and proper grouping
    function addAccountRows(account, level = 0, parentName = '') {
        const fullName = parentName ? `${parentName} > ${account.name}` : account.name;
        const indentedName = '  '.repeat(level) + account.name;
        const startRow = currentRow;
        
        // Calculate totals for this account and all sub-accounts
        const totals = sortedMonthsArray.map(month => {
            let total = 0;
            const monthData = monthlyTotals[month] || {};
            
            function sumAccount(acc) {
                if (monthData[acc.id]) {
                    total += monthData[acc.id];
                }
                if (acc.subAccounts) {
                    Object.values(acc.subAccounts).forEach(subAcc => {
                        sumAccount(subAcc);
                    });
                }
            }
            
            sumAccount(account);
            return total;
        });

        // 1. Add the parent account row first
        const summaryRow = [indentedName, account.id, '', '', ...totals];
        wsData.push(summaryRow);
        outlineLevels[currentRow] = {
            level,
            isTransaction: false,
            isHeader: false
        };
        currentRow++;

        // 2. Add transactions for this account (if it's a leaf account)
        if (!account.subAccounts && transactionsByAccount[account.id]) {
            transactionsByAccount[account.id].forEach(trans => {
                const transRow = new Array(headerRow.length).fill('');
                transRow[0] = '  '.repeat(level + 1) + account.name;  // Indent one more level
                transRow[1] = account.id;
                transRow[2] = trans.date;
                transRow[3] = trans.description;
                
                const monthIndex = sortedMonthsArray.findIndex(m => m === trans.monthKey);
                if (monthIndex !== -1) {
                    transRow[4 + monthIndex] = trans.amount;
                }
                
                wsData.push(transRow);
                outlineLevels[currentRow] = {
                    level: level + 1,
                    isTransaction: true,
                    isHeader: false
                };
                currentRow++;
            });
        }

        // 3. Add sub-accounts last
        if (account.subAccounts) {
            Object.values(account.subAccounts).forEach(subAccount => {
                addAccountRows(subAccount, level + 1, fullName);
            });
        }

        return {
            totals,
            startRow,
            endRow: currentRow - 1,
            level
        };
    }

    // Add header row
    const headerRow = ['Account', 'Account ID', 'Date', 'Description', ...monthHeaders];
    wsData.push(headerRow);
    outlineLevels[currentRow] = { level: 0, isTransaction: false, isHeader: true };
    currentRow++;

    // Add income section
    wsData.push(['INCOME', '', '', '', ...sortedMonthsArray.map(() => '')]);
    outlineLevels[currentRow] = { level: 0, isTransaction: false, isHeader: true };
    currentRow++;
    const incomeSection = addAccountRows(CHART_OF_ACCOUNTS.income, 1);

    // Add total income row
    wsData.push(['Total Income', '', '', '', ...incomeSection.totals]);
    outlineLevels[currentRow] = { level: 0, isTransaction: false, isHeader: true };
    currentRow++;
    
    wsData.push(['', '', '', '', ...sortedMonthsArray.map(() => '')]);
    outlineLevels[currentRow] = { level: 0, isTransaction: false, isHeader: false };
    currentRow++;

    // Add expenses section
    wsData.push(['EXPENSES', '', '', '', ...sortedMonthsArray.map(() => '')]);
    outlineLevels[currentRow] = { level: 0, isTransaction: false, isHeader: true };
    currentRow++;
    const expenseSection = addAccountRows(CHART_OF_ACCOUNTS.expenses, 1);

    // Add total expenses row
    wsData.push(['Total Expenses', '', '', '', ...expenseSection.totals]);
    outlineLevels[currentRow] = { level: 0, isTransaction: false, isHeader: true };
    currentRow++;
    
    wsData.push(['', '', '', '', ...sortedMonthsArray.map(() => '')]);
    outlineLevels[currentRow] = { level: 0, isTransaction: false, isHeader: false };
    currentRow++;

    // Add net income row
    const netIncome = incomeSection.totals.map((inc, idx) => inc - expenseSection.totals[idx]);
    wsData.push(['Net Income', '', '', '', ...netIncome]);
    outlineLevels[currentRow] = { level: 0, isTransaction: false, isHeader: true };

    // Create workbook and worksheet
    const wb = XLSX.utils.book_new();
    const ws = XLSX.utils.aoa_to_sheet(wsData);

    // Set column widths
    ws['!cols'] = [
        { wch: 40 },  // Account name
        { wch: 10 },  // Account ID
        { wch: 12 },  // Date
        { wch: 40 },  // Description
        ...sortedMonthsArray.map(() => ({ wch: 15 }))  // Month columns
    ];

    // Apply styles
    const headerStyle = { font: { bold: true }, fill: { fgColor: { rgb: "CCCCCC" } } };
    const totalStyle = { font: { bold: true } };
    const currencyFormat = '_($* #,##0.00_);_($* (#,##0.00);_($* "-"??_);_(@_)';  // Excel's built-in accounting format
    const dateFormat = 'yyyy-mm-dd';

    // Initialize outline levels
    ws['!rows'] = [];

    // Apply styles and create outline structure
    for (let i = 0; i < wsData.length; i++) {
        // Set row in worksheet
        ws['!rows'][i] = ws['!rows'][i] || {};
        const row = ws['!rows'][i];
        const levelInfo = outlineLevels[i];

        if (levelInfo) {
            row.level = levelInfo.level;
            if (levelInfo.isTransaction) {
                row.hidden = true;
            }
        }

        // Apply cell styles
        for (let j = 0; j < wsData[i].length; j++) {
            const cellRef = XLSX.utils.encode_cell({ r: i, c: j });
            if (!ws[cellRef]) ws[cellRef] = { v: wsData[i][j] };
            
            // Style headers
            if (i === 0 || levelInfo?.isHeader) {
                ws[cellRef].s = headerStyle;
            }
            
            // Format dates
            if (j === 2 && wsData[i][j]) {
                ws[cellRef].z = dateFormat;
            }
            
            // Format numbers as currency (all amount columns and totals)
            if (j >= 4 && wsData[i][j] !== '') {  // All amount columns
                const value = wsData[i][j];
                // Only apply currency format if it's a number or can be parsed as one
                if (typeof value === 'number' || (typeof value === 'string' && !isNaN(parseFloat(value)))) {
                    ws[cellRef].z = currencyFormat;
                    if (typeof value === 'string') {
                        ws[cellRef].v = parseFloat(value) || 0;
                    }
                }
            }
        }
    }

    // Add outline properties
    ws['!outline'] = { 
        above: true  // show summary rows above detail
    };

    // Add the worksheet to the workbook
    XLSX.utils.book_append_sheet(wb, ws, 'Statement of Activity');

    // Write to file
    XLSX.writeFile(wb, 'statement-of-activity.xlsx');
    console.log('Statement of activity has been written to statement-of-activity.xlsx');
}

async function aiExtractReceiptDetails(imageUrl, metadata = {}) {
    return new Promise(async (resolve, reject) => {
        let imageData;

        // Create unique ID for this request to avoid filename collisions
        const requestId = crypto.randomUUID();
        const tmpDir = './tmp';

        if (imageUrl.toLowerCase().endsWith('.pdf')) {
            // Create tmp directory if it doesn't exist
            if (!existsSync(tmpDir)) {
                fs.mkdirSync(tmpDir);
            }

            // Download PDF
            const pdfPath = `${tmpDir}/receipt-${requestId}.pdf`;
            const pdfResponse = await fetch(imageUrl);
            const pdfBuffer = await pdfResponse.arrayBuffer();
            fs.writeFileSync(pdfPath, Buffer.from(pdfBuffer));

            // Convert PDF to JPEG using ImageMagick with background preservation and multi-page support
            const jpegBasePath = `${tmpDir}/receipt-${requestId}`;
            // First convert PDF pages to individual JPEGs
            await new Promise((resolve, reject) => {
                require('imagemagick').convert([
                    '-density', '300',
                    '-quality', '100', 
                    '-background', 'white',
                    '-alpha', 'flatten',
                    '-alpha', 'remove',
                    pdfPath,
                    `${jpegBasePath}-%d.jpg`
                ], (err) => {
                    if (err) reject(err);
                    else resolve();
                });
            });

            // Read all generated JPEGs (limit to first 3)
            const jpegFiles = fs.readdirSync(tmpDir)
                .filter(f => f.startsWith(`receipt-${requestId}-`) && f.endsWith('.jpg'))
                .sort()
                .slice(0, 3); // Only take first 3 pages

            if (jpegFiles.length === 1) {
                // If single page, just read the file
                imageData = fs.readFileSync(`${tmpDir}/${jpegFiles[0]}`);
            } else {
                // For multiple pages, vertically append them
                const combinedPath = `${tmpDir}/combined-${requestId}.jpg`;
                await new Promise((resolve, reject) => {
                    require('imagemagick').convert([
                        ...jpegFiles.map(f => `${tmpDir}/${f}`),
                        '-append',
                        combinedPath
                    ], (err) => {
                        if (err) reject(err);
                        else resolve();
                    });
                });
                imageData = fs.readFileSync(combinedPath);
                fs.unlinkSync(combinedPath);
            }

            // Clean up temporary files
            fs.unlinkSync(pdfPath);
            jpegFiles.forEach(file => fs.unlinkSync(`${tmpDir}/${file}`));

        } else if (imageUrl.toLowerCase().endsWith('.heic')) {
            // Create tmp directory if it doesn't exist
            if (!existsSync(tmpDir)) {
                fs.mkdirSync(tmpDir);
            }

            // Download HEIC
            const heicPath = `${tmpDir}/receipt-${requestId}.heic`;
            const heicResponse = await fetch(imageUrl);
            const heicBuffer = await heicResponse.arrayBuffer();
            fs.writeFileSync(heicPath, Buffer.from(heicBuffer));

            // Convert HEIC to JPEG using ImageMagick
            const jpegPath = `${tmpDir}/receipt-${requestId}.jpg`;
            await new Promise((resolve, reject) => {
                require('imagemagick').convert([
                    heicPath,
                    jpegPath
                ], (err) => {
                    if (err) reject(err);
                    else resolve();
                });
            });

            // Read converted JPEG
            imageData = fs.readFileSync(jpegPath);

            // Clean up temporary files
            fs.unlinkSync(heicPath);
            fs.unlinkSync(jpegPath);
        } else {
            imageData = new URL(imageUrl);
        }

        let toolCalled = false;
        let attempts = 0;
        const maxAttempts = 3;

        while (!toolCalled && attempts < maxAttempts) {
            attempts++;
            await generateText({
                model: aiModel,
                messages: [
                    {
                        role: 'user',
                        content: [
                            { type: 'text', text: 'Extract the receipt details from this image. Translate non-English text to English. You must call one of the tools and not reply in a message, or else the program will crash. Additional context: "' + JSON.stringify(metadata) + '"' },
                            {
                                type: 'image',
                                image: imageData,
                            },
                        ],
                    },
                ],
                tools: {
                    extractReceipt: tool({
                        description: 'Extract details from a receipt. Subunit = smallest currency unit (e.g., 100 cents to charge $1.00 or 100 to charge ¥100, a zero-decimal currency)',
                        parameters: z.object({
                            language: z.string().describe('ISO 639-1 language code for the receipt').optional(),
                            currency: z.string().describe('ISO 4217 currency code').optional(),
                            date: z.string().describe('ISO8601 date string').optional(),
                            vendor_name: z.string().optional(), 
                            vendor_address: z.string().optional(), 
                            items_purchased: z.array(z.object({
                                qty: z.number(),
                                memo: z.string().describe('Exact text from the receipt'),
                                amount_subunits: z.number(),
                            })).optional(),
                            subtotal_amount_subunits: z.number().optional(),
                            taxes: z.array(z.object({
                                memo: z.string(),
                                amount_subunits: z.number(),
                            })).optional(),
                            total_amount_subunits: z.number().optional(),
                        }),
                        execute(receipt) {
                            toolCalled = true;
                            return resolve(receipt);
                        }
                    }),
                    error: tool({
                        description: 'Return an error message if the receipt is invalid',
                        parameters: z.object({
                            imageDescription: z.string(),
                            error: z.string(),
                        }),
                        execute(error) {
                            toolCalled = true;
                            return resolve(error);
                        }
                    })
                }
            });
        }

        if (!toolCalled) {
            throw new Error(`Failed to extract receipt details after ${maxAttempts} attempts - no tool was called`);
        }
    });
}

async function getReceiptData(receiptId, receiptUrl, additionalContext = '') {
    // Check if cache file exists, if not create it
    const cacheFile = 'test_data/extracted_receipts.json';
    if (!existsSync(cacheFile)) {
        writeFileSync(cacheFile, JSON.stringify({}));
    }

    // Read cached data
    const cachedData = JSON.parse(readFileSync(cacheFile, 'utf8'));

    // Check if transaction is cached
    if (cachedData[receiptId]) {
        return cachedData[receiptId];
    }

    // Extract receipt data if not cached
    const extractedData = await aiExtractReceiptDetails(receiptUrl, additionalContext);

    // Cache the result
    cachedData[receiptId] = extractedData;
    writeFileSync(cacheFile, JSON.stringify(cachedData, null, 2));

    return extractedData;
}

// Test code for loading transactions
console.log('\nProcessing transactions from test.csv:');
await processTransactions('first_transactions.csv');

// Generate statement of activity
console.log('\nGenerating Statement of Activity:');
await generateStatementOfActivity('south_bay_processed.csv');
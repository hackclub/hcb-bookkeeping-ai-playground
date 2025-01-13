import 'dotenv/config';
import { openai } from '@ai-sdk/openai';
import { generateObject } from 'ai';
import { z } from 'zod';
import { parse } from 'csv-parse/sync';
import { readFileSync, writeFileSync, existsSync } from 'fs';

// Chart of Accounts
const CHART_OF_ACCOUNTS = {
    income: {
        id: '4000',
        name: 'Income',
        subAccounts: {
            majorGifts: { id: '4100', name: 'Major Gifts' },
            webDonations: { id: '4200', name: 'Web Donations' },
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

// Transaction processing functions
async function identifyFields(headers) {
    const { object } = await generateObject({
        schema: z.object({
            dateField: z.string().describe('The CSV header that represents the transaction date'),
            amountField: z.string().describe('The CSV header that represents the transaction amount'),
        }),
        model: openai('gpt-4'),
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
        const amount = amountField && record[amountField] ? 
            parseFloat(record[amountField].replace(/[$,]/g, '')) : null;

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
            amount,
            category: null,
            accountId: null,
            ...remainingFields
        };
    });
}

// Function to create a unique transaction key
function createTransactionKey(transaction) {
    // Format date to YYYY-MM-DD for consistent matching
    const dateStr = transaction.date instanceof Date ? 
        transaction.date.toISOString().split('T')[0] : 
        (transaction.date || '');

    // Format amount to fixed decimal places for consistent matching
    const amountStr = typeof transaction.amount === 'number' ? 
        transaction.amount.toFixed(2) : 
        (transaction.amount || '');

    // Get description or memo or reference - whatever is available
    const descStr = transaction.description || transaction.memo || '';

    // Combine fields into a unique key
    return `${dateStr}|${amountStr}|${descStr}`.toLowerCase().trim();
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
                date: record.date ? new Date(record.date) : null,
                amount: record.amount ? parseFloat(record.amount) : null,
                description: record.description,
                memo: record.memo
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

        const { object } = await generateObject({
            schema: z.object({
                accountName: z.string().describe('The name of the account in the chart of accounts'),
                accountId: z.string().describe('The ID of the account in the chart of accounts'),
                questions: z.array(z.object({
                    thoughtfulQuestion: z.string().describe("Keep it concise. Don't repeat transaction info or answers."),
                    multipleChoiceOptions: z.array(z.string()).describe("Contains the possible answers. Don't have other as an option. Keep it short")
                })).describe('Questions to ask the user if you need additional information')
            }),
            model: openai('gpt-4o'),
            prompt: `
You are a bookeeper for a nonprofit organization. You prize accuracy and
reliability of the books so the money can be spend as effectively as possible.

Given the following transaction and chart of accounts, determine the account
name and account ID for the transaction.

The nonprofit's staff are very busy, so if you can accurately categorize without
asking any questions - do so. But accuracy is important, so if you need more
info, you can ask the user 1 or 2 well-thought-out follow up question if you
to determine where in the chart of accounts the transaction belongs.

You only get 1 chance to ask the user for information, so make it count.

Transaction: ${JSON.stringify(transaction)}

Chart of Accounts: ${JSON.stringify(CHART_OF_ACCOUNTS)}
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
            console.log(`Amount: $${(transaction.amount/100).toFixed(2)}`);
            console.log(`Description: ${transaction.description || 'N/A'}`);
            console.log(`Memo: ${transaction.memo || 'N/A'}`);
            if (transaction.comments) {
                console.log(`Comments: ${transaction.comments}`);
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
                model: openai('gpt-4o'),
                prompt: `Given the following transaction and user input, determine the category and account ID for the transaction.
                
                Transaction: ${JSON.stringify(transaction)}
                Chart of Accounts: ${JSON.stringify(CHART_OF_ACCOUNTS)}
                
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
            ...Object.values(transaction).slice(4)
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


// Test code for loading transactions
console.log('\nProcessing transactions from test.csv:');

await processTransactions('test.csv');
